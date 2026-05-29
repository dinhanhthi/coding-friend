import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="mb-4 flex min-w-0 items-center gap-2 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
      <Link
        href="/"
        className="shrink-0 hover:text-amber-600 dark:hover:text-amber-400"
      >
        Home
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span
            key={i}
            className={`flex items-center gap-2 ${isLast ? "min-w-0" : "shrink-0"}`}
          >
            <span className="shrink-0">/</span>
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="capitalize hover:text-amber-600 dark:hover:text-amber-400"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={`text-slate-800 dark:text-slate-200 ${isLast ? "truncate" : ""}`}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
