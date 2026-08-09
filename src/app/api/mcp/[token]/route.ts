import { corsHeaders, handleMcpPost, mcpUnauthorized } from "@/lib/mcp/handler";
import { userByMcpToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/**
 * Each person gets their own connection URL:
 *   https://<your-app>.up.railway.app/api/mcp/rsm_xxxxxxxx
 * The token lives in the path so the whole thing is a single copy-paste with no
 * headers to configure, and it resolves to exactly one user — a connector can
 * never reach anybody else's data.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const user = await userByMcpToken(token, request.headers.get("user-agent") ?? "");
  if (!user) return mcpUnauthorized();
  return handleMcpPost(request, user);
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const user = await userByMcpToken(token);
  if (!user) return mcpUnauthorized();
  // No server-initiated stream: clients fall back to POST-only, which is all we need.
  return new Response(null, { status: 405, headers: { Allow: "POST", ...corsHeaders() } });
}

export async function DELETE() {
  // Stateless server — nothing to tear down.
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
