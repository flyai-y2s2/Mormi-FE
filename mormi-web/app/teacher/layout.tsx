import type { Metadata } from "next";

export const metadata: Metadata = { title: "교사 학급 | 내가 가르쳐 줄게!" };

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return children;
}
