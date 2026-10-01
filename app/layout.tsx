import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Today · Threads Duo OS",
  description:
    "두 사람의 Threads 콘텐츠를 함께 준비하는 Today Dashboard. Mock 데이터 미리보기.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
