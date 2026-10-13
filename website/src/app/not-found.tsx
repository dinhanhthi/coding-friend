import Link from "next/link";

// GitHub Pages serves this as 404.html for every unknown path, so it also
// handles the legacy URLs that next.config redirects() used to cover.
const legacyRedirects = `
var p = location.pathname;
if (/^\\/docs(\\/|$)/.test(p)) location.replace("/");
else if (/^\\/changelog\\/?$/.test(p)) location.replace("https://github.com/dinhanhthi/coding-friend/releases");
`;

export default function NotFound() {
  return (
    <div className="page">
      <script dangerouslySetInnerHTML={{ __html: legacyRedirects }} />
      <main id="top">
        <h1>Page not found</h1>
        <p>
          <Link href="/">Back to Coding Friend</Link>
        </p>
      </main>
    </div>
  );
}
