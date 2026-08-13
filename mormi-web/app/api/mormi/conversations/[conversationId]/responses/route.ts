import { forwardToMormi } from "../../../_upstream";

export const runtime = "nodejs";

type ConversationRouteContext = {
  params: Promise<{ conversationId: string }>;
};

export async function POST(request: Request, context: ConversationRouteContext) {
  const { conversationId } = await context.params;
  const body = await request.text();
  return forwardToMormi(`/v1/conversations/${encodeURIComponent(conversationId)}/responses`, { method: "POST", body });
}
