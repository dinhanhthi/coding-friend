"use client";

import { usePathname } from "next/navigation";
import type { CategoryInfo } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/layout/Footer";

export default function LayoutShell({
  categories,
  children,
}: {
  categories: CategoryInfo[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <>
      <div className="flex">
        {!isHome && (
          <div data-pagefind-ignore>
            <Sidebar categories={categories} />
          </div>
        )}
        <div
          className={`flex min-w-0 flex-1 justify-center ${!isHome ? "md:pl-64 lg:pl-[300px]" : ""}`}
        >
          <main
            className={`min-h-screen w-full p-6 pb-24 md:p-8 md:pb-24 ${isHome ? "max-w-6xl" : "max-w-5xl"}`}
          >
            {children}
          </main>
        </div>
      </div>
      <Footer isHome={isHome} />
    </>
  );
}
