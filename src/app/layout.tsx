import type { Metadata, Viewport } from "next";
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
        {children}
      </body>
    </html>
  );
}
