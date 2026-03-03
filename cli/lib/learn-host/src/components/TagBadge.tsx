import Link from "next/link";

export default function TagBadge({
  tag,
  size = "md",
}: {
  tag: string;
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "text-xs" : "text-sm";
  const paddingClass = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-0.5";
  return (
    <Link
      href={`/search/?q=${encodeURIComponent(tag)}`}
      className={`hover:border-navy-400 dark:bg-navy-900/80 dark:hover:bg-navy-800/80 inline-block cursor-pointer rounded-full border border-slate-200 bg-slate-50 ${paddingClass} ${sizeClass} text-slate-700 duration-200 hover:-translate-y-0.5 hover:text-slate-800 dark:border-[#a0a0a01c] dark:text-slate-400 dark:hover:text-slate-200`}
    >
      {tag}
    </Link>
  );
}
