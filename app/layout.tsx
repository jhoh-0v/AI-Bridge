import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Bridge · 내 업무에 쓰는 AI, 나의 실력이 되도록",
  description: "실제 ChatGPT 화면에서 엑셀 업무를 연습합니다. 단계별 안내와 근거 자료로 이해하고, 새 과제를 스스로 해내며 졸업하는 AI 실습 코치입니다.",
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
