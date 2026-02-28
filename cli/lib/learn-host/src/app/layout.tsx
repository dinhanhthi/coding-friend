import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { getAllCategories } from "@/lib/docs";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

export const metadata: Metadata = {
  title: "Learning Notes",
  description: "Personal learning knowledge base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = getAllCategories();

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
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
      <body className="dark:bg-navy-900 bg-white text-slate-900 antialiased dark:text-slate-50">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Header categories={categories} />
          <div data-pagefind-ignore className="md:hidden">
            <MobileNav categories={categories} />
          </div>
          <div className="flex">
            <div data-pagefind-ignore>
              <Sidebar categories={categories} />
            </div>
            <div className="flex min-w-0 flex-1 justify-center md:pl-64 lg:pl-[300px]">
              <main className="min-h-screen w-full max-w-5xl p-6 pb-24 md:p-8 md:pb-24">
                {children}
              </main>
            </div>
          </div>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
