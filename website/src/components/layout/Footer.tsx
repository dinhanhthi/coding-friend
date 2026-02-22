import Link from "next/link";
import Container from "@/components/ui/Container";

const footerLinks = [
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs/" },
      { label: "Changelog", href: "/changelog/" },
      { label: "Getting Started", href: "/docs/getting-started/installation/" },
    ],
  },
  {
    title: "Community",
    links: [
      {
        label: "GitHub",
        href: "https://github.com/dinhanhthi/coding-friend",
        external: true,
      },
      {
        label: "Issues",
        href: "https://github.com/dinhanhthi/coding-friend/issues",
        external: true,
      },
      {
        label: "npm",
        href: "https://www.npmjs.com/package/coding-friend-cli",
        external: true,
      },
    ],
  },
  {
    title: "More",
    links: [
      { label: "Author", href: "https://dinhanhthi.com", external: true },
      {
        label: "AI Sync",
        href: "https://github.com/dinhanhthi/ai-sync",
        external: true,
      },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-navy-950 border-t border-[#a0a0a01c]">
      <Container className="pb-6">
        <div className="flex flex-row flex-wrap justify-center gap-2 pt-6 text-center text-sm text-slate-500">
          <div className="whitespace-nowrap">
            Made by{" "}
            <a
              href="https://dinhanhthi.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300"
            >
              Anh-Thi Dinh
            </a>
            .
          </div>
          <div className="whitespace-nowrap">
            Other useful tools:{" "}
            <a
              href="https://github.com/dinhanhthi/ai-sync"
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 hover:text-violet-300"
            >
              AI Sync
            </a>
            .
          </div>
        </div>
      </Container>
    </footer>
  );
}
