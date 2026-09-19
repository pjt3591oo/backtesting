import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Jev / Lab — 실시간 비트코인 판단",
};
export default function LiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
