"use client";

import { useId, useState } from "react";
import CopyButton from "@/components/CopyButton";

const CLI = `npm i -g coding-friend-cli
cf install               # Claude Code (default)
cf install --agent codex # or omp, agy, devin
cf init                  # in each project`;

export default function InstallTabs({ prompt }: { prompt: string }) {
  const [tab, setTab] = useState<"agent" | "cli">("agent");
  const id = useId();
  // Both panels are always in the HTML (the inactive one `hidden`): an agent told to install from this site reads
  // the page without running scripts, so the CLI commands must be there too.
  const tabs = [
    {
      key: "agent" as const,
      label: "Ask your agent",
      text: prompt,
      body: <p className="install__prompt">{prompt}</p>,
      note: "Paste it into Claude Code, Codex or any supported agent. It checks Node 20+, installs the CLI and the plugin, then runs cf init.",
    },
    {
      key: "cli" as const,
      label: "Use the CLI",
      text: CLI,
      body: (
        <pre>
          <code>{CLI}</code>
        </pre>
      ),
      note: "Needs Node 20+. If cf is taken on your machine, the CLI also answers to cdf.",
    },
  ];

  return (
    <div className="install">
      <div className="install__tabs" role="tablist" aria-label="Install method">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-${key}`}
            aria-selected={tab === key}
            aria-controls={`${id}-${key}-panel`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tabs.map(({ key, text, body, note }) => (
        <div
          key={key}
          role="tabpanel"
          id={`${id}-${key}-panel`}
          aria-labelledby={`${id}-${key}`}
          hidden={tab !== key}
        >
          <div className="install__panel code-block-wrapper">
            <CopyButton getText={() => text} />
            {body}
          </div>
          <p className="install__note">{note}</p>
        </div>
      ))}
    </div>
  );
}
