import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VTuber Rigging Assistant",
  description: "Live2D / VTS / VBridger 리깅 도우미",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
