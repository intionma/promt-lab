import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import SilhouetteFilter from "./components/SilhouetteFilter";
import UiHost from "./components/UiHost";

export const metadata: Metadata = {
  title: "VTuber Rigging Assistant",
  description: "Live2D / VTS / VBridger 리깅 도우미",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col">
        <Script
          src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"
          strategy="beforeInteractive"
        />
        <SilhouetteFilter />
        {children}
        <UiHost />
      </body>
    </html>
  );
}
