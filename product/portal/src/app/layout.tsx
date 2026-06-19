import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RMail Workspace",
  description: "Business email for your organization",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
