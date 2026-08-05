import { corsHeaders, handleMcpPost, mcpUnauthorized } from "@/lib/mcp/handler";
import { mcpTokenIsValid } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };

/**
 * The connection URL handed to Claude looks like
 *   https://<your-app>.up.railway.app/api/mcp/rsm_xxxxxxxx
 * The token lives in the path so the whole thing is a single copy-paste with no
 * headers to configure.
 */
export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  if (!(await mcpTokenIsValid(token))) return mcpUnauthorized();
  return handleMcpPost(request);
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!(await mcpTokenIsValid(token))) return mcpUnauthorized();
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
