import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="mb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Link
        href="/"
        className="hover:text-violet-600 dark:hover:text-violet-400"
      >
        Home
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-2">
          <span>/</span>
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="capitalize hover:text-violet-600 dark:hover:text-violet-400"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-slate-700 dark:text-slate-300">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
