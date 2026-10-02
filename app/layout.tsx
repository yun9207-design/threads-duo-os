import type { Metadata } from "next";
import "./globals.css";
import "./product.css";
import "./content-operations.css";
import "./threads-live.css";
import "./publish-operations.css";

export const metadata: Metadata = {
  title: "Threads Pro · Threads Duo OS",
  description:
    "Threads 글 작성, 예약 큐와 게시 결과를 한곳에서 운영하세요.",
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
