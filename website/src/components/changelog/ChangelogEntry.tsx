import Badge from "@/components/ui/Badge";
import type { ChangelogEntry as ChangelogEntryType } from "@/lib/types";

const tagLabels = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
  removed: "Removed",
  security: "Security",
};

interface Props {
  entry: ChangelogEntryType;
}

function renderInline(text: string) {
  // Split on backtick pairs: odd indices are code, even are plain text
  const parts = text.split(/`([^`]+)`/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <code
        key={i}
        className="rounded bg-slate-800 px-1 py-0.5 font-mono text-sm text-violet-300"
      >
        {part}
      </code>
    ) : (
      part
    ),
  );
}

export default function ChangelogEntryCard({ entry }: Props) {
  // Group changes by tag
  const grouped = entry.changes.reduce(
    (acc, change) => {
      if (!acc[change.tag]) acc[change.tag] = [];
      acc[change.tag].push(change);
      return acc;
    },
    {} as Record<string, typeof entry.changes>,
  );

  const tagOrder: Array<keyof typeof tagLabels> = [
    "new",
    "improved",
    "fixed",
    "security",
    "removed",
  ];

  return (
    <div className="relative pb-12 pl-8 last:pb-0">
      {/* Timeline dot */}
      <div className="ring-navy-900 absolute top-1.5 left-0 h-3 w-3 rounded-full bg-violet-400 ring-4" />

      {/* Timeline line */}
      <div className="absolute top-4 bottom-0 left-[5px] w-0.5 bg-[#a0a0a01c] last:hidden" />

      {/* Version header */}
      <div className="mb-4 flex items-center gap-3">
        <h3 className="text-xl font-bold text-white">{entry.version}</h3>
      </div>

      {/* Changes grouped by tag */}
      <div className="space-y-4">
        {tagOrder.map((tag) => {
          const changes = grouped[tag];
          if (!changes?.length) return null;

          return (
            <div key={tag}>
              <div className="mb-2">
                <Badge variant={tag}>{tagLabels[tag]}</Badge>
              </div>
              <ul className="space-y-1.5">
                {changes.map((change, i) => (
                  <li
                    key={i}
                    className="relative pl-4 leading-relaxed text-slate-200 before:absolute before:top-2 before:left-0 before:h-1.5 before:w-1.5 before:rounded-full before:bg-slate-600 before:content-['']"
                  >
                    {renderInline(change.text)}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
