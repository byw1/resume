/**
 * Ambient background. Three slowly drifting colour fields behind a faint grid.
 * Pure CSS animation so it costs nothing on the main thread.
 */
export function Aurora({ intense = false }: { intense?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-[0.55]" />
      <div
        className="animate-aurora absolute -top-[28rem] -left-40 size-[54rem] rounded-full blur-[130px]"
        style={{ background: "var(--glow-a)", animationDelay: "0s" }}
      />
      <div
        className="animate-aurora absolute -top-60 right-[-18rem] size-[46rem] rounded-full blur-[130px]"
        style={{ background: "var(--glow-b)", animationDelay: "-6s" }}
      />
      {intense && (
        <div
          className="animate-aurora absolute bottom-[-24rem] left-1/3 size-[40rem] rounded-full blur-[140px]"
          style={{ background: "var(--glow-c)", animationDelay: "-11s" }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
    </div>
  );
}
