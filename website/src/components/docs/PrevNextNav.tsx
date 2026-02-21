import Link from "next/link";

interface NavItem {
  title: string;
  slug: string;
}

interface Props {
  prev: NavItem | null;
  next: NavItem | null;
}

export default function PrevNextNav({ prev, next }: Props) {
  if (!prev && !next) return null;

  return (
    <div className="mt-12 flex justify-between gap-4">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}/`}
          className="group flex-1 cursor-pointer rounded-lg border border-[#a0a0a01c] p-4 transition-colors hover:border-violet-400/50"
        >
          <div className="mb-1 text-xs text-slate-400">Previous</div>
          <div className="text-sm font-medium text-white transition-colors group-hover:text-violet-400">
            {prev.title}
          </div>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/docs/${next.slug}/`}
          className="group flex-1 cursor-pointer rounded-lg border border-[#a0a0a01c] p-4 text-right transition-colors hover:border-violet-400/50"
        >
          <div className="mb-1 text-xs text-slate-400">Next</div>
          <div className="text-sm font-medium text-white transition-colors group-hover:text-violet-400">
            {next.title}
          </div>
        </Link>
      ) : (
        <div />
      )}
    </div>
  );
}
