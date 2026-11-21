import Image from "next/image";
import Link from "next/link";

const REPO = "https://github.com/Coprimal/coding-friend";
const PLUGIN_VERSION = process.env.NEXT_PUBLIC_PLUGIN_VERSION;
const CLI_VERSION = process.env.NEXT_PUBLIC_CLI_VERSION;

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <Image src="/icon.svg" width={22} height={22} alt="" unoptimized />
          <p>
            Coding Friend is free and open source, made by{" "}
            <Out href="https://coprimal.dev">Coprimal</Out>.
          </p>
        </div>
        <nav className="site-footer__links" aria-label="Footer">
          <Link href="/docs/">Docs</Link>
          <Link href="/privacy/">Privacy</Link>
          <Out href={`${REPO}/releases`}>Changelog</Out>
          <Out href={`${REPO}/discussions`}>Discussions</Out>
          <Out href={`${REPO}/blob/main/LICENSE`}>MIT</Out>
          <a href="/llms.txt">llms.txt</a>
        </nav>
        {PLUGIN_VERSION || CLI_VERSION ? (
          <p className="site-footer__versions">
            {PLUGIN_VERSION ? (
              <Out href={`${REPO}/releases`}>plugin v{PLUGIN_VERSION}</Out>
            ) : null}
            {CLI_VERSION ? (
              <Out href="https://www.npmjs.com/package/coding-friend-cli">
                cli v{CLI_VERSION}
              </Out>
            ) : null}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
