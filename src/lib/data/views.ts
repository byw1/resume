import { db } from "@/lib/db";

/**
 * Saved pipeline views.
 *
 * A view is a name for a query string. The pipeline toolbar already encodes
 * everything about what you are looking at into the URL — the view, the stage
 * filters, the sort, the search — so saving one is storing that string, and
 * anything the toolbar learns to encode later is saved for free.
 *
 * Like everything in this directory, `userId` is the first positional argument
 * and every query filters on it.
 */

/** Strip anything that isn't the pipeline's own state, and drop the leading "?". */
export function normaliseQuery(raw: string): string {
  const trimmed = raw.trim().replace(/^[?#]/, "");
  if (!trimmed) return "";
  // APPEND only, never reorder: a saved view is compared to the current URL as
  // a string, so moving a key rewrites every stored view's identity at once.
  const allowed = ["view", "f", "src", "co", "cv", "w", "qd", "x", "sort", "dir", "q", "month"];
  const source = new URLSearchParams(trimmed);
  const out = new URLSearchParams();
  // Fixed key order so the same view saved twice is the same string, and so a
  // saved query can be compared against the current URL to mark it active.
  for (const key of allowed) {
    const value = source.get(key);
    if (value) out.set(key, value);
  }
  return out.toString();
}

export async function listSavedViews(userId: string) {
  return db.savedView.findMany({ where: { userId }, orderBy: { name: "asc" } });
}

/**
 * Save, or overwrite the one with this name.
 *
 * Upsert rather than reject-on-duplicate because re-saving under a name you
 * already use means "update it" every time — the alternative is making people
 * delete a view to change it.
 */
export async function saveView(userId: string, name: string, query: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A view needs a name");
  return db.savedView.upsert({
    where: { userId_name: { userId, name: trimmed } },
    create: { userId, name: trimmed, query: normaliseQuery(query) },
    update: { query: normaliseQuery(query) },
  });
}

export async function deleteSavedView(userId: string, id: string) {
  const { count } = await db.savedView.deleteMany({ where: { id, userId } });
  if (count === 0) throw new Error(`No saved view with id ${id}`);
  return { id };
}
