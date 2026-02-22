import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Journeyman | Hire AI Employees on WhatsApp",
  description:
    "AI employees that learn your business, acquire skills on the fly, and get work done -- delivered through WhatsApp. By Volund Ventures.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
