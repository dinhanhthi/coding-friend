import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteTitle = "Coding Friend";
const siteDescription =
  "A lean toolkit for systematic debugging, smart commits, code review, and knowledge capture — with optional TDD support. As a Claude Code plugin.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cf.dinhanhthi.com"),
  title: {
    default: siteTitle,
    template: "%s | Coding Friend",
  },
  description: siteDescription,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: "Coding Friend",
    title: siteTitle,
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  alternates: {
    canonical: "https://cf.dinhanhthi.com",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
      <body className="bg-bg text-text font-sans antialiased">{children}</body>
    </html>
  );
}
