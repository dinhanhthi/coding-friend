import DocsSidebar from "@/components/docs/DocsSidebar";
import DocsMobileNav from "@/components/docs/DocsMobileNav";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <DocsMobileNav />
      <div className="flex">
        <DocsSidebar />
        <div className="flex min-w-0 flex-1 justify-center md:pl-64 lg:pl-[300px]">
          <div className="flex w-full max-w-5xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
