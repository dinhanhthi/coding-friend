import Link from "next/link";

export default function TagBadge({ tag }: { tag: string }) {
  return (
    <Link
      href={`/search/?q=${encodeURIComponent(tag)}`}
      className="inline-block rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-violet-600 transition-colors hover:border-violet-400 hover:bg-violet-50 dark:border-slate-600 dark:text-violet-400 dark:hover:border-violet-500 dark:hover:bg-violet-900/20"
    >
      {tag}
    </Link>
  );
}
