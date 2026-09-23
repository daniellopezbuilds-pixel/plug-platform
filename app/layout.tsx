import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { PageViewTracker } from "@/components/analytics/PageViewTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sparx Plug Ecosystem",
  description:
    "Connect workers, employers, and local businesses through the Sparx Plug Ecosystem.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* ToastProvider wraps everything so any page, component or hook can
          raise one. It is a client component in a server layout, which is fine
          — `children` stays server-rendered and is passed through as a slot. */}
      <body className="min-h-full flex flex-col">
        {/* Renders nothing. Here rather than per page so the logged-out pages
            — /, /login, /signup — are counted too, and so a page added later
            is counted without anyone remembering to add it. */}
        <PageViewTracker />
        <ToastProvider>
          {/* Inside ToastProvider so a confirmed action can raise its toast.
              See components/ui/ConfirmDialog.tsx. */}
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}