import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { getAllCategories } from "@/lib/docs";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

export const revalidate = 10;

export const metadata: Metadata = {
  title: "Learning Notes",
  description: "Personal learning knowledge base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const categories = getAllCategories();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div data-pagefind-ignore>
            <MobileNav categories={categories} />
          </div>
          <div className="flex">
            <div data-pagefind-ignore>
              <Sidebar categories={categories} />
            </div>
            <main className="flex-1 min-h-screen p-6 md:p-8 max-w-4xl">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
