import { AiDialogueTest } from "./AiDialogueTest";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AiTestPage() {
  if (process.env.NODE_ENV === "production" && process.env.MORMI_ENABLE_AI_TEST_PAGE !== "true") {
    notFound();
  }
  return <AiDialogueTest />;
}
