import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PersonaFlow",
  description:
    "Voice-first English learning focused on preserving personal tone and self-expression.",
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
