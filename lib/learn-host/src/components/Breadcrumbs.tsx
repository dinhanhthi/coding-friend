import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
      <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400">
        Home
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-2">
          <span>/</span>
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-blue-600 dark:hover:text-blue-400 capitalize">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-gray-700 dark:text-gray-300">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
