import type { Metadata } from "next";
import { MoramiApp } from "./MoramiApp";

export const metadata: Metadata = {
  title: "모르미 수학 | 내가 가르쳐 줄게!",
  description: "느린학습자가 모르미를 가르치며 생활 수학을 익히는 36개 과정",
};

export default function Home() {
  return <MoramiApp />;
}
