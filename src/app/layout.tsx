import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HUB Contábil OS",
  description:
    "Practice management + Fiscal Autopilot para escritórios contábeis brasileiros",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
