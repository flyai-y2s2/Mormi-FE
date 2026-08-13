import { forwardToMormi } from "../../_upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, context: ConversationRouteContext) {
  const { conversationId } = await context.params;
  return forwardToMormi(`/v1/conversations/${encodeURIComponent(conversationId)}`);
}
