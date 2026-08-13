import { forwardToMormi } from "../../_upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/mormi/conversations/[conversationId]">) {
  const { conversationId } = await context.params;
  return forwardToMormi(`/v1/conversations/${encodeURIComponent(conversationId)}`);
}
