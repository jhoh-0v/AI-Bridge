import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Bridge · 내 업무에 쓰는 AI, 나의 실력이 되도록",
  description: "메일부터 PPT, 엑셀, 이미지까지 8개 업무에서 직접 요청하고, 확인하고, 수정하며 스스로 활용하는 힘을 기릅니다.",
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
