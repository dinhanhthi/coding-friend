import Link from "next/link";

// GitHub Pages serves this as 404.html for every unknown path, so it also handles legacy URLs:
// old /docs/<page> paths go to the single /docs page, /changelog to the GitHub releases.
const legacyRedirects = `
var p = location.pathname;
if (/^\\/docs\\/.+/.test(p)) location.replace("/docs/" + location.hash);
else if (/^\\/changelog\\/?$/.test(p)) location.replace("https://github.com/Coprimal/coding-friend/releases");
`;

export default function NotFound() {
  return (
    <main className="not-found shell">
      <script dangerouslySetInnerHTML={{ __html: legacyRedirects }} />
      <h1>Page not found</h1>
      <p>
        That address does not exist. Try the <Link href="/docs/">docs</Link> or
        go <Link href="/">home</Link>.
      </p>
    </main>
  );
}
