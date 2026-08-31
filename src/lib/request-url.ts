/**
 * Where this instance is reachable, worked out from the request.
 *
 * The Public URL setting is the answer whenever it is set; this is the
 * fallback for an instance that has not been told its own address yet. The
 * forwarded headers matter because every supported deployment — Railway,
 * Docker behind a proxy — terminates TLS in front of the app, so `host` alone
 * reports the internal name and `http` for a site that is actually https.
 *
 * Takes a plain `Headers` so route handlers and server components can both use
 * it. The same two lines are still inlined in about ten older call sites;
 * they predate this file and are worth folding in next time one is touched.
 */
export function baseUrlFrom(headers: Headers, requestUrl?: string) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "";
  if (!host) return requestUrl ? new URL(requestUrl).origin : "http://localhost:3000";
  const proto =
    headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
