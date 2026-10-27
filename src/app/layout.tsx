import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PriceRadar ID · Know your market",
  description: "Competitor price intelligence for Indonesian sellers.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
