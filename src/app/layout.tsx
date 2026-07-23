import type { Metadata, Viewport } from "next";
import { TegelProvider } from "@/components/nexus/TegelProvider";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus-support portal",
  description: "Enterprise governance and support workflow portal"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="scania" lang="en" suppressHydrationWarning>
      <body className="tds-mode-light" suppressHydrationWarning>
        <TegelProvider>
          <LocaleProvider>{children}</LocaleProvider>
        </TegelProvider>
      </body>
    </html>
  );
}
