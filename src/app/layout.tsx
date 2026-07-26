import type { Metadata, Viewport } from "next";
import { TegelProvider } from "@/components/nexus/TegelProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Nexus Support",
  title: {
    default: "Nexus Support",
    template: "%s | Nexus Support"
  },
  description: "Enterprise governance and support workflow portal.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true
  },
  openGraph: {
    title: "Nexus Support",
    description: "Enterprise governance and support workflow portal.",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Nexus Support",
    description: "Enterprise governance and support workflow portal."
  }
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
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <QueryProvider>
          <TegelProvider>
            <LocaleProvider>{children}</LocaleProvider>
          </TegelProvider>
          <Toaster closeButton position="top-right" richColors />
        </QueryProvider>
      </body>
    </html>
  );
}
