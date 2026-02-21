"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChangelogEntryCard from "@/components/changelog/ChangelogEntry";
import type { ChangelogEntry } from "@/lib/types";

interface Props {
  pluginEntries: ChangelogEntry[];
  cliEntries: ChangelogEntry[];
}

export default function ChangelogTabs({ pluginEntries, cliEntries }: Props) {
  const [activeTab, setActiveTab] = useState<"plugin" | "cli">("plugin");
  const entries = activeTab === "plugin" ? pluginEntries : cliEntries;
  const pluginRef = useRef<HTMLButtonElement>(null);
  const cliRef = useRef<HTMLButtonElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const btn = activeTab === "plugin" ? pluginRef.current : cliRef.current;
    if (btn) {
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  return (
    <>
      {/* Tab toggle */}
      <div className="mb-12 flex justify-center">
        <div className="bg-navy-950/50 relative inline-flex rounded-full border border-[#a0a0a01c] p-1">
          <div
            className="bg-navy-800 absolute top-1 bottom-1 rounded-full shadow-sm transition-all duration-300 ease-in-out"
            style={{ left: indicator.left, width: indicator.width }}
          />
          <button
            ref={pluginRef}
            onClick={() => setActiveTab("plugin")}
            className={`relative z-10 cursor-pointer rounded-full px-6 py-2 text-sm font-medium transition-colors duration-200 ${
              activeTab === "plugin"
                ? "text-violet-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Plugin
          </button>
          <button
            ref={cliRef}
            onClick={() => setActiveTab("cli")}
            className={`relative z-10 cursor-pointer rounded-full px-8 py-2 text-sm font-medium transition-colors duration-200 ${
              activeTab === "cli"
                ? "text-violet-400"
                : "text-slate-400 hover:text-white"
            }`}
          >
            CLI
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {entries.map((entry) => (
          <ChangelogEntryCard key={entry.version} entry={entry} />
        ))}
      </div>
    </>
  );
}
