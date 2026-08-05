import { promptsByName, prompts, tools, toolsByName } from "@/lib/mcp/tools";

/**
 * A small, dependency-light implementation of the MCP Streamable HTTP transport.
 *
 * Written by hand rather than wired through the SDK's Node transport because
 * Next.js route handlers speak the Web Request/Response API. Stateless: every
 * POST is self-contained, so there are no sessions to lose across Railway
 * restarts or replicas.
 */

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_PROTOCOL_VERSION = "2025-06-18";

const SERVER_INFO = {
  name: "resume-os",
  title: "Resume OS",
  version: "1.0.0",
};

const INSTRUCTIONS = `Resume OS is this person's career knowledge base, resume builder and job-search CRM.

Three areas:
• BRAIN — everything about them. Roles each hold an unlimited free-form "brain dump" of raw
  material, plus polished reusable bullets called highlights. There are also notes, projects,
  education, skills and certifications. search_brain is the fastest way in.
• RESUMES — documents assembled from that material. Call get_resume_format before writing one.
• PIPELINE — applications, stages, activity timeline, contacts, tasks and follow-up dates.

Rules of thumb:
- Never invent experience, employers, dates or metrics. Everything on a resume must trace back to
  something in the brain. If evidence is missing, say so and ask.
- When the user tells you something new about a job they already have on file, use
  append_role_brain_dump rather than update_role, so nothing is overwritten.
- update_resume and update_role replace what you send. Read first, modify, then write back whole.
- Prefer creating a tailored copy (duplicate_resume) over editing a resume already attached to an
  application.`;

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

/** Dates need to survive the trip; everything else is plain JSON already. */
function serialize(value: unknown) {
  return JSON.stringify(value, (_key, val) => (val instanceof Date ? val.toISOString() : val), 2);
}

async function handleMessage(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null;
  const params = message.params ?? {};

  // Notifications carry no id and expect no response.
  const isNotification = message.id === undefined || message.id === null;

  switch (message.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : LATEST_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }

    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/progress":
    case "notifications/roots/list_changed":
      return null;

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, {
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const tool = toolsByName.get(name);
      if (!tool) return err(id, INVALID_PARAMS, `Unknown tool: ${name}`);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.handler(args);
        return ok(id, {
          content: [{ type: "text", text: serialize(result ?? { ok: true }) }],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Tool failures are reported in-band so the model can recover.
        return ok(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    case "prompts/list":
      return ok(id, {
        prompts: prompts.map((prompt) => ({
          name: prompt.name,
          title: prompt.title,
          description: prompt.description,
          arguments: prompt.arguments,
        })),
      });

    case "prompts/get": {
      const name = typeof params.name === "string" ? params.name : "";
      const prompt = promptsByName.get(name);
      if (!prompt) return err(id, INVALID_PARAMS, `Unknown prompt: ${name}`);
      const args = (params.arguments ?? {}) as Record<string, string>;
      return ok(id, {
        description: prompt.description,
        messages: [
          { role: "user", content: { type: "text", text: prompt.build(args) } },
        ],
      });
    }

    // Declared as unsupported in `capabilities`, but answer politely rather than
    // erroring so probing clients do not surface a scary message.
    case "resources/list":
      return ok(id, { resources: [] });
    case "resources/templates/list":
      return ok(id, { resourceTemplates: [] });

    default:
      if (isNotification) return null;
      return err(id, METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Max-Age": "86400",
  };
}

function sseResponse(payload: unknown) {
  const body = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...corsHeaders(),
    },
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

/** Entry point shared by both MCP routes. */
export async function handleMcpPost(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(err(null, PARSE_ERROR, "Invalid JSON"), 400);
  }

  const wantsSse = (request.headers.get("accept") ?? "").includes("text/event-stream");
  const messages = Array.isArray(body) ? (body as JsonRpcRequest[]) : [body as JsonRpcRequest];

  if (messages.length === 0) {
    return jsonResponse(err(null, INVALID_REQUEST, "Empty batch"), 400);
  }

  const responses: JsonRpcResponse[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object" || typeof message.method !== "string") {
      responses.push(err(null, INVALID_REQUEST, "Invalid JSON-RPC message"));
      continue;
    }
    try {
      const response = await handleMessage(message);
      if (response) responses.push(response);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      responses.push(err(message.id ?? null, INTERNAL_ERROR, detail));
    }
  }

  // Everything was a notification — the spec wants 202 with no body.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: corsHeaders() });
  }

  const payload = Array.isArray(body) ? responses : responses[0];
  return wantsSse ? sseResponse(payload) : jsonResponse(payload);
}

export function mcpUnauthorized() {
  // Deliberately no WWW-Authenticate header: this server uses a token embedded
  // in the URL, and advertising a challenge would send clients down an OAuth
  // discovery path that does not exist here.
  return jsonResponse(
    {
      error: "unauthorized",
      message:
        "Missing or invalid token. Copy the full connection URL from the Settings page of your Resume OS.",
    },
    401,
  );
}
