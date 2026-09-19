import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jev / Lab — 비트코인 백테스트",
  description: "비트코인 전략의 판단과 거래 과정을 살펴보는 백테스트 실험실.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
