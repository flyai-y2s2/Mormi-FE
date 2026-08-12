import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") || incomingHeaders.get("host") || "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "모르미 수학 | 내가 가르쳐 줄게!",
    description: "수 감각부터 생활 수학까지, 아이가 모르미를 가르치며 익히는 36개 과정",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "내가 가르쳐 줄게! — 모르미 수학",
      description: "학년보다 이해 단계에 맞춰 이어가는 느린학습자 생활 수학",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1733, height: 908, alt: "모르미 생활 수학 학습 앱" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "내가 가르쳐 줄게! — 모르미 수학",
      description: "학년보다 이해 단계에 맞춰 이어가는 느린학습자 생활 수학",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
