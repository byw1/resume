import { cn, dateRange } from "@/lib/utils";
import type { ResumeDoc, ResumeSection } from "@/lib/resume-schema";

export type PaperSettings = {
  template: string;
  accent: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  pageMargin: number;
};

const FONT_CLASS: Record<string, string> = {
  inter: "font-inter",
  serif: "font-serif-resume",
  mono: "font-mono-resume",
};

/**
 * The document itself. Deliberately styled with plain CSS values rather than
 * Tailwind spacing tokens so that what you see on screen is exactly what the
 * browser prints at 8.5in × 11in.
 */
export function ResumePaper({
  doc,
  settings,
  className,
  linkify = false,
}: {
  doc: ResumeDoc;
  settings: PaperSettings;
  className?: string;
  /**
   * Render URLs as real anchors. Off by default: thumbnails and the editor
   * preview live inside their own <Link>, and nesting anchors is invalid HTML.
   * The print route turns it on so the exported PDF keeps clickable links.
   */
  linkify?: boolean;
}) {
  const { template, accent, fontFamily, fontSize, lineHeight, pageMargin } = settings;
  const sections = doc.sections.filter((section) => section.visible && hasContent(section));

  return (
    <div
      className={cn("resume-paper", FONT_CLASS[fontFamily] ?? FONT_CLASS.inter, className)}
      style={
        {
          "--paper-accent": accent,
          "--paper-size": fontSize,
          "--paper-leading": lineHeight,
          padding: `${pageMargin}px`,
        } as React.CSSProperties
      }
    >
      <Header doc={doc} template={template} linkify={linkify} />

      <div style={{ marginTop: "1.15em" }}>
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            template={template}
            linkify={linkify}
          />
        ))}
      </div>
    </div>
  );
}

/** An anchor when we're allowed one, a plain span otherwise. */
function Url({
  href,
  linkify,
  style,
  children,
}: {
  href: string;
  linkify: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (!linkify) return <span style={style}>{children}</span>;
  return (
    <a href={href} style={style}>
      {children}
    </a>
  );
}

function Header({
  doc,
  template,
  linkify,
}: {
  doc: ResumeDoc;
  template: string;
  linkify: boolean;
}) {
  const { header } = doc;
  const contacts = [header.email, header.phone, header.location].filter(Boolean);
  const centered = template === "classic";
  const editorial = template === "editorial";

  return (
    <header className={cn("rp-block", centered && "text-center")}>
      <h1
        style={{
          fontSize: editorial ? "2.55em" : "1.95em",
          fontWeight: editorial ? 400 : 700,
          letterSpacing: editorial ? "-0.02em" : "-0.015em",
          lineHeight: 1.05,
        }}
      >
        {header.name || "Your Name"}
      </h1>

      {header.title && (
        <div
          className="rp-heading"
          style={{
            fontSize: "0.86em",
            marginTop: editorial ? "0.5em" : "0.28em",
            letterSpacing: "0.11em",
          }}
        >
          {header.title}
        </div>
      )}

      <div
        style={{
          marginTop: "0.55em",
          fontSize: "0.9em",
          color: "#494d59",
          display: "flex",
          flexWrap: "wrap",
          gap: "0 0.75em",
          justifyContent: centered ? "center" : "flex-start",
        }}
      >
        {contacts.map((item, index) => (
          <span key={`${item}-${index}`}>
            {item}
            {index < contacts.length + header.links.length - 1 && (
              <span style={{ opacity: 0.4, marginLeft: "0.75em" }}>·</span>
            )}
          </span>
        ))}
        {header.links.map((link, index) => (
          <span key={`${link.url}-${index}`}>
            <Url href={link.url} linkify={linkify} style={{ color: "var(--paper-accent)" }}>
              {link.label || stripProtocol(link.url)}
            </Url>
            {index < header.links.length - 1 && (
              <span style={{ opacity: 0.4, marginLeft: "0.75em" }}>·</span>
            )}
          </span>
        ))}
      </div>

      {template !== "editorial" && (
        <div className="rp-rule" style={{ marginTop: "0.85em" }} />
      )}
    </header>
  );
}

function SectionBlock({
  section,
  template,
  linkify,
}: {
  section: ResumeSection;
  template: string;
  linkify: boolean;
}) {
  const tight = template === "compact";
  const gap = tight ? "0.65em" : "0.95em";

  return (
    <section style={{ marginBottom: gap }}>
      <SectionHeading heading={section.heading} template={template} />

      {section.kind === "summary" && (
        <p style={{ marginTop: "0.35em", color: "#33363f" }}>{section.text}</p>
      )}

      {section.kind === "experience" &&
        section.experience.map((item) => (
          <article key={item.id} className="rp-block" style={{ marginTop: tight ? "0.5em" : "0.7em" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "1em",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {item.title}
                {item.company && (
                  <span style={{ fontWeight: 500, color: "#494d59" }}>
                    {" · "}
                    {item.company}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.88em", color: "#5c6070", whiteSpace: "nowrap" }}>
                {dateRange(item.startDate, item.endDate, item.isCurrent)}
              </div>
            </div>

            {item.location && (
              <div style={{ fontSize: "0.88em", color: "#6b6f7d" }}>{item.location}</div>
            )}

            {item.summary && (
              <p style={{ marginTop: "0.22em", color: "#33363f" }}>{item.summary}</p>
            )}

            <Bullets items={item.bullets} tight={tight} />
          </article>
        ))}

      {section.kind === "education" &&
        section.education.map((item) => (
          <article key={item.id} className="rp-block" style={{ marginTop: tight ? "0.42em" : "0.6em" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "1em",
              }}
            >
              <div style={{ fontWeight: 700 }}>{item.school}</div>
              <div style={{ fontSize: "0.88em", color: "#5c6070", whiteSpace: "nowrap" }}>
                {dateRange(item.startDate, item.endDate)}
              </div>
            </div>
            {(item.degree || item.field) && (
              <div style={{ color: "#494d59" }}>
                {[item.degree, item.field].filter(Boolean).join(", ")}
                {item.location && <span style={{ color: "#6b6f7d" }}> · {item.location}</span>}
              </div>
            )}
            <Bullets items={item.details} tight={tight} />
          </article>
        ))}

      {section.kind === "projects" &&
        section.projects.map((item) => (
          <article key={item.id} className="rp-block" style={{ marginTop: tight ? "0.45em" : "0.62em" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "1em",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {item.name}
                {item.role && (
                  <span style={{ fontWeight: 500, color: "#494d59" }}>
                    {" · "}
                    {item.role}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.88em", color: "#5c6070", whiteSpace: "nowrap" }}>
                {dateRange(item.startDate, item.endDate)}
              </div>
            </div>
            {item.url && (
              <Url
                href={item.url}
                linkify={linkify}
                style={{
                  display: "block",
                  fontSize: "0.88em",
                  color: "var(--paper-accent)",
                }}
              >
                {stripProtocol(item.url)}
              </Url>
            )}
            {item.description && (
              <p style={{ marginTop: "0.2em", color: "#33363f" }}>{item.description}</p>
            )}
            <Bullets items={item.bullets} tight={tight} />
          </article>
        ))}

      {section.kind === "skills" && (
        <div
          style={{
            marginTop: "0.35em",
            display: "grid",
            gridTemplateColumns: template === "compact" ? "1fr 1fr" : "1fr",
            columnGap: "1.4em",
            rowGap: "0.22em",
          }}
        >
          {section.skills.map((group, index) => (
            <div key={`${group.name}-${index}`} className="rp-block">
              {group.name && <span style={{ fontWeight: 700 }}>{group.name}: </span>}
              <span style={{ color: "#33363f" }}>{group.skills.join(", ")}</span>
            </div>
          ))}
        </div>
      )}

      {section.kind === "certifications" && (
        <div style={{ marginTop: "0.35em" }}>
          {section.certifications.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="rp-block"
              style={{ display: "flex", justifyContent: "space-between", gap: "1em" }}
            >
              <span>
                <span style={{ fontWeight: 600 }}>{item.name}</span>
                {item.issuer && <span style={{ color: "#5c6070" }}> · {item.issuer}</span>}
              </span>
              <span style={{ fontSize: "0.88em", color: "#5c6070", whiteSpace: "nowrap" }}>
                {item.date}
              </span>
            </div>
          ))}
        </div>
      )}

      {section.kind === "custom" &&
        section.items.map((item, index) => (
          <article key={`${item.title}-${index}`} className="rp-block" style={{ marginTop: "0.55em" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "1em",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {item.title}
                {item.subtitle && (
                  <span style={{ fontWeight: 500, color: "#494d59" }}>
                    {" · "}
                    {item.subtitle}
                  </span>
                )}
              </div>
              {item.meta && (
                <div style={{ fontSize: "0.88em", color: "#5c6070", whiteSpace: "nowrap" }}>
                  {item.meta}
                </div>
              )}
            </div>
            <Bullets items={item.bullets} tight={tight} />
          </article>
        ))}
    </section>
  );
}

function SectionHeading({ heading, template }: { heading: string; template: string }) {
  if (!heading) return null;

  if (template === "editorial") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.7em" }}>
        <h2 className="rp-heading" style={{ fontSize: "0.78em", whiteSpace: "nowrap" }}>
          {heading}
        </h2>
        <span
          style={{
            flex: 1,
            height: 1,
            background: "color-mix(in srgb, var(--paper-accent) 35%, #d9dbe3)",
          }}
        />
      </div>
    );
  }

  if (template === "modern") {
    return (
      <h2
        className="rp-heading"
        style={{
          fontSize: "0.78em",
          borderLeft: "2.5px solid var(--paper-accent)",
          paddingLeft: "0.5em",
        }}
      >
        {heading}
      </h2>
    );
  }

  return (
    <>
      <h2 className="rp-heading" style={{ fontSize: "0.78em" }}>
        {heading}
      </h2>
      <div className="rp-rule" style={{ marginTop: "0.16em" }} />
    </>
  );
}

function Bullets({ items, tight }: { items: string[]; tight: boolean }) {
  const clean = items.filter((item) => item.trim());
  if (clean.length === 0) return null;
  return (
    <ul style={{ marginTop: tight ? "0.18em" : "0.28em" }}>
      {clean.map((item, index) => (
        <li key={index} className="rp-bullet" style={{ color: "#33363f", marginTop: "0.12em" }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function hasContent(section: ResumeSection) {
  switch (section.kind) {
    case "summary":
      return Boolean(section.text.trim());
    case "experience":
      return section.experience.length > 0;
    case "education":
      return section.education.length > 0;
    case "projects":
      return section.projects.length > 0;
    case "skills":
      return section.skills.some((group) => group.skills.length > 0);
    case "certifications":
      return section.certifications.length > 0;
    case "custom":
      return section.items.length > 0;
    default:
      return false;
  }
}

function stripProtocol(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
