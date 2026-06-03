import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dutch English Flashcards",
  description: "Upload Dutch-English word lists and study them as flashcards.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Flashcards",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
