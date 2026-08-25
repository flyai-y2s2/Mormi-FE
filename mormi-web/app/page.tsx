import type { Metadata } from "next";
import { MoramiApp } from "./MoramiApp";

export const metadata: Metadata = {
  title: "I AM 쌤 | 내가 가르쳐 줄게!",
  description: "느린학습자가 가르치며 생활 수학을 익히는 과정",
};

export default function Home() {
  return <MoramiApp />;
}
