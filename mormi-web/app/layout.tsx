import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("x-forwarded-host") || incomingHeaders.get("host") || "localhost:3000";
  const protocol = incomingHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "I AM 쌤 | 내가 가르쳐 줄게!",
    description: "수 감각부터 생활 수학까지, 아이가 가르치며 익히는 생활 수학 과정",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "내가 가르쳐 줄게! — I AM 쌤",
      description: "학년보다 이해 단계에 맞춰 이어가는 느린학습자 생활 수학",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1733, height: 908, alt: "I AM 쌤 생활 수학 학습 앱" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "내가 가르쳐 줄게! — I AM 쌤",
      description: "학년보다 이해 단계에 맞춰 이어가는 느린학습자 생활 수학",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko">
    <head>
      <link rel="preload" href="/fonts/hakgyoansim-nadeuri-l.otf" as="font" type="font/otf" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/hakgyoansim-nadeuri-b.otf" as="font" type="font/otf" crossOrigin="anonymous" />
      <link rel="preload" href="/fonts/nanum-child-hope.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
    </head>
    <body>{children}</body>
  </html>;
}
