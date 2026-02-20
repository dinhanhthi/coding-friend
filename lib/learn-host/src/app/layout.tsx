import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { getAllCategories } from "@/lib/docs";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

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
          <MobileNav categories={categories} />
          <div className="flex">
            <Sidebar categories={categories} />
            <main className="flex-1 min-h-screen p-6 md:p-8 max-w-4xl">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
