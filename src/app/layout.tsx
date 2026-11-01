import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/client";
import { PRODUCT } from "@/lib/constants";

export const metadata: Metadata = {
  title: { default: `${PRODUCT.name} — ${PRODUCT.descriptor}`, template: `%s · ${PRODUCT.name}` },
  description: `${PRODUCT.tagline} ${PRODUCT.summary}`,
  applicationName: PRODUCT.name,
};

export const viewport: Viewport = {
  themeColor: "#F5F7F6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
