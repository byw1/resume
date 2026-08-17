/**
 * Narrow a patch object to a known set of columns before it reaches Prisma.
 *
 * The userId-first rule keeps a *query* scoped. It says nothing about what a
 * patch object *contains*, and that is the other half of the problem: server
 * actions accept whatever JSON a client sends — the TypeScript parameter type
 * is erased at runtime — so spreading a patch straight into Prisma's `data`
 * hands the caller every column on the model, `userId` and `id` included.
 *
 * That is a cross-tenant write, not a style nit. `updateResumeAction(myId,
 * { userId: "<somebody else>" })` moves the row out of my workspace and into
 * theirs, and the equivalent against `saveProfileAction` overwrites their
 * profile with mine. Both were reachable before this helper existed.
 *
 * So: every update in this directory passes its patch through `pick` with an
 * explicit column list. If a new column should be editable, add it to that
 * list on purpose. Never spread a patch into `data`.
 */
export function pick<T extends object, K extends keyof T>(
  patch: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined) {
      out[key] = patch[key];
    }
  }
  return out;
}
