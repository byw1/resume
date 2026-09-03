/**
 * The lit field behind the three pages you can reach without an account: sign
 * in, claim the instance, accept an invitation.
 *
 * All four layers are decoration and all four are CSS — see the front-door
 * block in globals.css. Nothing here is a client component, because nothing
 * here reacts to anything: the drift is a keyframe, the vignette is a gradient,
 * and the whole thing holds still for anyone who has asked their system to calm
 * down. The one piece that does react to a pointer is the mark, and it brings
 * its own "use client".
 *
 * Why a shell rather than three copies of a `<main>`: these pages had the same
 * one-line wrapper each, which is exactly the sort of thing that drifts the
 * first time one of them is touched.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-field flex min-h-svh items-center justify-center p-6">
      <div className="auth-aurora" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      <div className="auth-plinth" aria-hidden />
      <div className="auth-vignette" aria-hidden />
      {children}
    </main>
  );
}
