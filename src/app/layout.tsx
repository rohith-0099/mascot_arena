import type { Metadata } from "next";
import { Bricolage_Grotesque, Silkscreen } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["800"],
});

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Realm Hack '26 — Live Mascot Arena",
  description: "A live pixel-art mascot hosting Realm Hack '26.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bricolage.variable} ${silkscreen.variable}`}>{children}</body>
    </html>
  );
}
