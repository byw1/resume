/**
 * Runs once when the server starts, after `prisma migrate deploy` has created
 * the tables. Used to provision the owner account on a fresh install so
 * self-hosting needs no configuration at all.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Nothing to provision without a database; `next build` also has none.
  if (!process.env.DATABASE_URL) return;

  const { bootstrap } = await import("@/lib/bootstrap");
  await bootstrap();
}
