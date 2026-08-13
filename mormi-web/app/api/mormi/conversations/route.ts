import { forwardToMormi } from "../_upstream";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.text();
  return forwardToMormi("/v1/conversations", { method: "POST", body });
}
