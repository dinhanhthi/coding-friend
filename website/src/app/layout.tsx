import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://cf.dinhanhthi.com"),
  title: {
    default:
      "Coding Friend - Disciplined Engineering Workflows for Claude Code",
    template: "%s | Coding Friend",
  },
  description:
    "A lean toolkit that enforces TDD, systematic debugging, smart commits, code review, and knowledge capture across your engineering workflow.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: "Coding Friend",
    title: "Coding Friend - Disciplined Engineering Workflows for Claude Code",
    description:
      "A lean toolkit that enforces TDD, systematic debugging, smart commits, code review, and knowledge capture across your engineering workflow.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Coding Friend - Disciplined Engineering Workflows for Claude Code",
    description:
      "A lean toolkit that enforces TDD, systematic debugging, smart commits, code review, and knowledge capture across your engineering workflow.",
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
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-navy-900 text-slate-50 antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
