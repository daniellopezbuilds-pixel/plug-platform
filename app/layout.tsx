import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LegacySessionMigration } from "@/components/auth/LegacySessionMigration";

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
      <body className="min-h-full flex flex-col">
        {/* Renders nothing. Here rather than deeper in the tree because the
            page it most needs to run on is /login, which no dashboard component
            ever mounts under. Temporary — see the file for when to delete it. */}
        <LegacySessionMigration />
        {children}
      </body>
    </html>
  );
}