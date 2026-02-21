import Link from "next/link";

interface Props {
  items: { label: string; href?: string }[];
}

export default function DocsBreadcrumbs({ items }: Props) {
  return (
    <nav className="mb-6 flex items-center gap-1.5 text-sm text-slate-400">
      <Link href="/docs/" className="transition-colors hover:text-violet-400">
        Docs
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-violet-400"
            >
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-white">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
