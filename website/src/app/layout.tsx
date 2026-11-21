import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { SITE_DESCRIPTION, SITE_HEADLINE, SITE_TITLE } from "@/lib/site";
import { themeInitScript } from "@/lib/theme";

// next/font self-hosts both families at build time: the site makes no request to Google.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const POSTER_ALT =
  "Coding Friend — a lean, opinionated toolkit that makes your AI coding agent work like a disciplined engineer.";

export const metadata: Metadata = {
  metadataBase: new URL("https://cf.coprimal.dev"),
  title: {
    default: SITE_HEADLINE,
    template: `%s | ${SITE_TITLE}`,
  },
  description: SITE_DESCRIPTION,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_TITLE,
    title: SITE_HEADLINE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og.jpg",
        type: "image/jpeg",
        width: 1200,
        height: 630,
        alt: POSTER_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_HEADLINE,
    description: SITE_DESCRIPTION,
    images: [{ url: "/og.jpg", alt: POSTER_ALT }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0e10",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable}`}
      data-scroll-behavior="smooth"
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-paper text-ink font-sans antialiased">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <div id="main">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
