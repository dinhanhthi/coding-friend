import { MDXRemote } from "next-mdx-remote/rsc";
import MdxLink from "@/components/MdxLink";
import type { ChangelogEntry } from "@/lib/changelog";
import { mdxOptions } from "@/lib/mdx";

const RELEASES_URL = "https://github.com/dinhanhthi/coding-friend/releases";
const VISIBLE_BULLETS = 2;

function BulletList({ bullets }: { bullets: string[] }) {
  return (
    <MDXRemote
      source={bullets.map((bullet) => `- ${bullet}`).join("\n")}
      components={{ a: MdxLink }}
      options={mdxOptions}
    />
  );
}

function Entry({ entry }: { entry: ChangelogEntry }) {
  const visible = entry.bullets.slice(0, VISIBLE_BULLETS);
  const hidden = entry.bullets.slice(VISIBLE_BULLETS);

  return (
    <div className="latest-changes__entry">
      <p className="latest-changes__version">
        <a href={entry.href} target="_blank" rel="noopener noreferrer">
          {entry.source} v{entry.version}
        </a>
        <span className="latest-changes__date">{entry.date}</span>
      </p>
      <div className="latest-changes__body">
        <BulletList bullets={visible} />
      </div>
      {hidden.length > 0 ? (
        <details className="latest-changes__more">
          <summary>+{hidden.length} more</summary>
          <BulletList bullets={hidden} />
        </details>
      ) : null}
    </div>
  );
}

export default function LatestChanges({
  entries,
}: {
  entries: ChangelogEntry[];
}) {
  if (entries.length === 0) return null;

  return (
    <section className="latest-changes">
      <p className="latest-changes__title">✨ Latest changes</p>
      {entries.map((entry) => (
        <Entry key={`${entry.source}-${entry.version}`} entry={entry} />
      ))}
      <p className="latest-changes__all">
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
          All releases →
        </a>
      </p>
    </section>
  );
}
