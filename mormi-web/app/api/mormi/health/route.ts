import { forwardToMormi } from "../_upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return forwardToMormi("/health");
}
