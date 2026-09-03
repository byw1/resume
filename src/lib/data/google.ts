import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  GOOGLE_DATA_SCOPES,
  GoogleApiError,
  calendarListEvents,
  domainOf,
  gmailGetThread,
  gmailSearchThreads,
  refreshAccessToken,
  revokeToken,
  type CalendarEvent,
  type GoogleFeature,
  type MailThread,
  type MailThreadSummary,
} from "@/lib/google-api";

/**
 * A person's own Gmail and Google Calendar, read live on their behalf.
 *
 * Like every file here: userId is the first argument of every function and
 * every query filters on it. The token that lets this instance read an inbox
 * is the most sensitive thing it holds about anyone, and it never leaves this
 * file — callers get what Google said, never the credential that asked.
 *
 * Nothing Google returns is written to the database. A thread list or a
 * meeting is fetched when a screen or a tool asks and shown as it came back,
 * so there is no copy of anyone's mail to leak, to go stale, or to be
 * subpoenaed from a server that only ever needed to *look*. The cost is a
 * round trip to Google on every open, which is why the screens load these
 * panels after the page rather than blocking on them.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Domains that say nothing about who somebody works for. Never matched as a company. */
const FREEMAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "hey.com",
  "fastmail.com",
]);

export class GoogleNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

// ---------------------------------------------------------------------------
// The connection
// ---------------------------------------------------------------------------

export type GoogleConnection = {
  /** The Google address that was connected. */
  email: string;
  /** Whether each half was actually granted on the consent screen. */
  mail: boolean;
  calendar: boolean;
  connectedAt: Date;
  lastUsedAt: Date | null;
  /** Non-empty when the last refresh failed and a reconnect is needed. */
  lastError: string;
  lastErrorAt: Date | null;
};

function toConnection(row: {
  email: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  lastError: string;
  lastErrorAt: Date | null;
}): GoogleConnection {
  return {
    email: row.email,
    mail: row.scopes.includes(GOOGLE_DATA_SCOPES.mail),
    calendar: row.scopes.includes(GOOGLE_DATA_SCOPES.calendar),
    connectedAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt,
  };
}

/** Status without secrets — safe for a tool result and for the browser. */
export async function getGoogleConnection(userId: string): Promise<GoogleConnection | null> {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  return row ? toConnection(row) : null;
}

export type GoogleConnectInput = {
  email: string;
  googleId: string;
  scopes: string[];
  refreshToken: string;
  accessToken: string;
  expiresAt: Date;
};

/**
 * Store what the consent screen handed back. Replaces any earlier connection
 * outright — there is one inbox per workspace, and reconnecting is how a
 * person switches which one, or recovers from a revoked token.
 */
export async function connectGoogleAccount(userId: string, input: GoogleConnectInput) {
  const scopes = input.scopes.filter((scope) =>
    (Object.values(GOOGLE_DATA_SCOPES) as string[]).includes(scope),
  );
  if (scopes.length === 0) throw new Error("Neither Gmail nor Calendar was granted.");
  if (!input.refreshToken) throw new Error("Google did not return a refresh token.");

  const previous = await db.googleAccount.findUnique({ where: { userId } });
  if (previous && previous.refreshToken !== input.refreshToken) {
    await revokeToken(previous.refreshToken);
  }

  const data = {
    email: input.email,
    googleId: input.googleId,
    scopes,
    refreshToken: input.refreshToken,
    accessToken: input.accessToken,
    accessTokenExpiresAt: input.expiresAt,
    lastError: "",
    lastErrorAt: null,
  };
  const row = await db.googleAccount.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toConnection(row);
}

/** Revoke at Google and forget everything. Safe to call when nothing is connected. */
export async function disconnectGoogleAccount(userId: string): Promise<{ ok: true }> {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  if (!row) return { ok: true };
  await revokeToken(row.refreshToken);
  await db.googleAccount.delete({ where: { userId } });
  return { ok: true };
}

/**
 * A live access token for one feature, refreshing when the stored one is
 * within a minute of expiring. Every failure to get one is reported as a
 * sentence the person can act on, because "401" on a contact page is not.
 */
async function accessTokenFor(userId: string, feature: GoogleFeature) {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  if (!row) {
    throw new GoogleNotConnectedError(
      "Google is not connected. Connect Gmail and Calendar under Settings → Connections in the app, then try again.",
    );
  }
  if (!row.scopes.includes(GOOGLE_DATA_SCOPES[feature])) {
    throw new GoogleNotConnectedError(
      `${feature === "mail" ? "Gmail" : "Google Calendar"} was not allowed when Google was connected. Reconnect under Settings → Connections and tick it on the consent screen.`,
    );
  }

  const fresh =
    row.accessToken && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  if (fresh) {
    return { token: row.accessToken, email: row.email };
  }

  const settings = await getSettings();
  try {
    const refreshed = await refreshAccessToken(settings, row.refreshToken);
    await db.googleAccount.update({
      where: { userId },
      data: {
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: refreshed.expiresAt,
        lastError: "",
        lastErrorAt: null,
      },
    });
    return { token: refreshed.accessToken, email: row.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.googleAccount.update({
      where: { userId },
      data: { lastError: message.slice(0, 500), lastErrorAt: new Date() },
    });
    if (error instanceof GoogleApiError && error.revoked) {
      throw new GoogleNotConnectedError(
        "Google has revoked this connection — usually because access was removed from the Google account, or the instance's OAuth client changed. Reconnect under Settings → Connections.",
      );
    }
    throw error;
  }
}

async function touch(userId: string) {
  await db.googleAccount
    .update({ where: { userId }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Gmail's own search syntax, or plain words. */
export async function searchEmail(
  userId: string,
  options: { query: string; limit?: number },
): Promise<MailThreadSummary[]> {
  const query = options.query.trim();
  if (!query) throw new Error("Say what to search for.");
  const { token, email } = await accessTokenFor(userId, "mail");
  const threads = await gmailSearchThreads(token, email, query, options.limit ?? 20);
  await touch(userId);
  return threads;
}

export async function getEmailThread(userId: string, threadId: string): Promise<MailThread> {
  const { token, email } = await accessTokenFor(userId, "mail");
  const thread = await gmailGetThread(token, email, threadId);
  await touch(userId);
  return thread;
}

export async function searchCalendar(
  userId: string,
  options: { query?: string; from?: Date; to?: Date; limit?: number },
): Promise<CalendarEvent[]> {
  const { token } = await accessTokenFor(userId, "calendar");
  const now = Date.now();
  const events = await calendarListEvents(token, {
    from: options.from ?? new Date(now - 30 * DAY),
    to: options.to ?? new Date(now + 60 * DAY),
    query: options.query?.trim() || undefined,
    limit: options.limit ?? 100,
  });
  await touch(userId);
  return events;
}

// ---------------------------------------------------------------------------
// Matching the pipeline
// ---------------------------------------------------------------------------

/** What a thread or an event is matched on: exact addresses, and company domains. */
export type MatchTerms = { addresses: string[]; domains: string[] };

/** "https://www.acme.com/careers" → "acme.com". Empty for nothing usable. */
export function domainOfWebsite(website: string): string {
  const raw = website.trim().toLowerCase();
  if (!raw) return "";
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
    if (!host.includes(".") || FREEMAIL.has(host)) return "";
    return host;
  } catch {
    return "";
  }
}

function cleanEmail(value: string): string {
  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * The Gmail query for a set of terms. Braces are Gmail's OR group;
 * `from:acme.com` matches every address at that domain. Nothing is excluded
 * on purpose — a rejection that Gmail filed under Promotions is still the
 * rejection.
 */
export function gmailQueryFor(terms: MatchTerms): string {
  const clauses = [
    ...terms.addresses.flatMap((address) => [`from:${address}`, `to:${address}`, `cc:${address}`]),
    ...terms.domains.flatMap((domain) => [`from:${domain}`, `to:${domain}`, `cc:${domain}`]),
  ];
  return clauses.length ? `{${clauses.join(" ")}}` : "";
}

/** Whether an event has anyone matching on it, the account holder aside. */
export function eventMatches(event: CalendarEvent, terms: MatchTerms): boolean {
  const addresses = new Set(terms.addresses);
  const domains = new Set(terms.domains);
  const people = [...event.attendees, ...(event.organizer ? [event.organizer] : [])];
  return people.some(
    (person) => addresses.has(person.email) || domains.has(domainOf(person.email)),
  );
}

export type CorrespondenceSubject =
  | { kind: "contact"; id: string }
  | { kind: "company"; id: string }
  | { kind: "application"; id: string }
  | { kind: "resume"; id: string };

export type Correspondence = {
  subject: CorrespondenceSubject & { name: string };
  terms: MatchTerms;
  /** Why the lists may be short, in sentences: no email on the contact, no website on the company. */
  notes: string[];
  mail: MailThreadSummary[] | null;
  calendar: CalendarEvent[] | null;
  /** Why a half is null: not granted, or Google refused. Empty when both answered. */
  warnings: string[];
};

/**
 * What the pipeline knows to look for, for one record.
 *
 * A contact is their address. A company is its domain and everyone on file
 * there. An application is its company's domain and the people attached to
 * it — not everyone at the company, because a second application at the same
 * employer has its own recruiter. A resume is every application it was sent
 * with.
 */
async function termsFor(
  userId: string,
  subject: CorrespondenceSubject,
): Promise<{ name: string; terms: MatchTerms; notes: string[] }> {
  const notes: string[] = [];

  if (subject.kind === "contact") {
    const contact = await db.contact.findFirst({
      where: { id: subject.id, userId },
      select: { name: true, email: true },
    });
    if (!contact) throw new Error(`No contact with id ${subject.id}`);
    const email = cleanEmail(contact.email);
    if (!email) notes.push(`${contact.name} has no email address on file, so there is nothing to match their mail or meetings on.`);
    return { name: contact.name, terms: { addresses: unique([email]), domains: [] }, notes };
  }

  if (subject.kind === "company") {
    const company = await db.company.findFirst({
      where: { id: subject.id, userId },
      select: {
        name: true,
        website: true,
        contacts: { select: { contact: { select: { email: true } } } },
      },
    });
    if (!company) throw new Error(`No company with id ${subject.id}`);
    const domain = domainOfWebsite(company.website);
    const addresses = unique(company.contacts.map((link) => cleanEmail(link.contact.email)));
    if (!domain) {
      notes.push(
        `${company.name} has no website on file. Set it and everything from that domain will match, not only the people you have added.`,
      );
    }
    return { name: company.name, terms: { addresses, domains: unique([domain]) }, notes };
  }

  if (subject.kind === "application") {
    const application = await db.application.findFirst({
      where: { id: subject.id, userId },
      select: {
        roleTitle: true,
        company: { select: { name: true, website: true } },
        contacts: { select: { email: true } },
      },
    });
    if (!application) throw new Error(`No application with id ${subject.id}`);
    const domain = domainOfWebsite(application.company.website);
    const addresses = unique(application.contacts.map((contact) => cleanEmail(contact.email)));
    if (!domain) {
      notes.push(
        `${application.company.name} has no website on file, so only the people attached to this application can be matched.`,
      );
    }
    if (addresses.length === 0 && !domain) {
      notes.push("Add the recruiter or hiring manager as a contact with their email, and their threads will appear here.");
    }
    return {
      name: `${application.company.name} — ${application.roleTitle}`,
      terms: { addresses, domains: unique([domain]) },
      notes,
    };
  }

  const resume = await db.resume.findFirst({
    where: { id: subject.id, userId },
    select: {
      name: true,
      applications: {
        select: {
          company: { select: { website: true } },
          contacts: { select: { email: true } },
        },
      },
    },
  });
  if (!resume) throw new Error(`No resume with id ${subject.id}`);
  if (resume.applications.length === 0) {
    notes.push("This resume is not attached to any application yet, so there is nothing to match on.");
  }
  return {
    name: resume.name,
    terms: {
      addresses: unique(resume.applications.flatMap((a) => a.contacts.map((c) => cleanEmail(c.email)))),
      domains: unique(resume.applications.map((a) => domainOfWebsite(a.company.website))),
    },
    notes,
  };
}

/**
 * Every thread and meeting Google has that touches one record on the
 * pipeline. Each half fails independently — a Calendar that was never
 * granted must not hide the mail — and says why in `warnings`.
 */
export async function listCorrespondence(
  userId: string,
  subject: CorrespondenceSubject,
  options: { limit?: number; days?: number } = {},
): Promise<Correspondence> {
  const { name, terms, notes } = await termsFor(userId, subject);
  const warnings: string[] = [];
  const empty = terms.addresses.length === 0 && terms.domains.length === 0;
  const days = options.days ?? 365;

  const [mail, calendar] = await Promise.all([
    (async () => {
      if (empty) return [];
      try {
        const { token, email } = await accessTokenFor(userId, "mail");
        const query = `${gmailQueryFor(terms)} newer_than:${days}d`;
        return await gmailSearchThreads(token, email, query, options.limit ?? 20);
      } catch (error) {
        warnings.push(`Mail: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    })(),
    (async () => {
      if (empty) return [];
      try {
        const { token } = await accessTokenFor(userId, "calendar");
        const now = Date.now();
        const events = await calendarListEvents(token, {
          from: new Date(now - days * DAY),
          to: new Date(now + 120 * DAY),
          limit: 500,
        });
        return events.filter((event) => eventMatches(event, terms)).reverse();
      } catch (error) {
        warnings.push(`Calendar: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    })(),
  ]);

  if (!empty) await touch(userId);
  return { subject: { ...subject, name }, terms, notes, mail, calendar, warnings };
}

// ---------------------------------------------------------------------------
// The calendar, matched against everything
// ---------------------------------------------------------------------------

export type MatchedEvent = CalendarEvent & {
  /** The first record the event was matched to, for a link. */
  applicationId: string | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
};

/**
 * Google Calendar events in a window that involve anyone on the pipeline:
 * an attendee at a tracked company's domain, or a contact's own address.
 * One request to Google, matched here. Returns nothing rather than throwing
 * when Google is not connected or not granted — this feeds the calendar view
 * and list_schedule, where an interview a person has not connected yet is
 * not an error.
 */
export async function listMatchedEvents(
  userId: string,
  from: Date,
  to: Date,
): Promise<{ events: MatchedEvent[]; warning: string | null }> {
  const row = await db.googleAccount.findUnique({ where: { userId }, select: { scopes: true } });
  if (!row || !row.scopes.includes(GOOGLE_DATA_SCOPES.calendar)) return { events: [], warning: null };

  const [companies, contacts] = await Promise.all([
    db.company.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        website: true,
        applications: {
          where: { closedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
    db.contact.findMany({
      where: { userId, email: { not: "" } },
      select: {
        id: true,
        name: true,
        email: true,
        applicationId: true,
        companies: { take: 1, select: { company: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const byDomain = new Map<string, (typeof companies)[number]>();
  for (const company of companies) {
    const domain = domainOfWebsite(company.website);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, company);
  }
  const byAddress = new Map<string, (typeof contacts)[number]>();
  for (const contact of contacts) {
    const email = cleanEmail(contact.email);
    if (email && !byAddress.has(email)) byAddress.set(email, contact);
  }
  if (byDomain.size === 0 && byAddress.size === 0) return { events: [], warning: null };

  let events: CalendarEvent[];
  try {
    const { token } = await accessTokenFor(userId, "calendar");
    events = await calendarListEvents(token, { from, to, limit: 500 });
  } catch (error) {
    return { events: [], warning: error instanceof Error ? error.message : String(error) };
  }

  const matched: MatchedEvent[] = [];
  for (const event of events) {
    const people = [...event.attendees, ...(event.organizer ? [event.organizer] : [])];
    const contact = people.map((person) => byAddress.get(person.email)).find(Boolean);
    const company = people.map((person) => byDomain.get(domainOf(person.email))).find(Boolean);
    if (!contact && !company) continue;
    const linkedCompany = company ?? contact?.companies[0]?.company ?? null;
    matched.push({
      ...event,
      applicationId: contact?.applicationId ?? company?.applications[0]?.id ?? null,
      companyId: linkedCompany?.id ?? null,
      companyName: linkedCompany?.name ?? null,
      contactId: contact?.id ?? null,
      contactName: contact?.name ?? null,
    });
  }
  await touch(userId);
  return { events: matched, warning: null };
}
