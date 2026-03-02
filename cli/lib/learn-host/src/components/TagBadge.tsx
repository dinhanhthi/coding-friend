import Link from "next/link";

export default function TagBadge({ tag }: { tag: string }) {
  return (
    <Link
      href={`/search/?q=${encodeURIComponent(tag)}`}
      className="inline-block cursor-pointer rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-600 transition-colors duration-200 hover:bg-slate-300 hover:text-slate-900 dark:bg-navy-950 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
    >
      {tag}
    </Link>
  );
}
