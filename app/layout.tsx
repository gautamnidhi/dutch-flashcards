import "./globals.css";

export const metadata = {
  title: "Dutch Flashcards",
  description: "Dutch learning flashcards",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
