import { corsHeaders, handleMcpPost, mcpUnauthorized } from "@/lib/mcp/handler";
import { userByMcpToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Header-authenticated variant, for clients that can send `Authorization: Bearer <token>`. */
function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

export async function POST(request: Request) {
  const caller = await userByMcpToken(bearer(request), request.headers.get("user-agent") ?? "");
  if (!caller) return mcpUnauthorized();
  return handleMcpPost(request, caller);
}

export async function GET(request: Request) {
  const caller = await userByMcpToken(bearer(request));
  if (!caller) return mcpUnauthorized();
  return new Response(null, { status: 405, headers: { Allow: "POST", ...corsHeaders() } });
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
