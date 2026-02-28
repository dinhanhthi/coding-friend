"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChangelogEntryCard from "@/components/changelog/ChangelogEntry";
import type { ChangelogEntry } from "@/lib/types";

const tabs = [
  { key: "plugin", label: "Plugin" },
  { key: "cli", label: "CLI" },
  { key: "learn-host", label: "Learn Host" },
  { key: "learn-mcp", label: "Learn MCP" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

interface Props {
  pluginEntries: ChangelogEntry[];
  cliEntries: ChangelogEntry[];
  learnHostEntries: ChangelogEntry[];
  learnMcpEntries: ChangelogEntry[];
}

export default function ChangelogTabs({
  pluginEntries,
  cliEntries,
  learnHostEntries,
  learnMcpEntries,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("plugin");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    plugin: null,
    cli: null,
    "learn-host": null,
    "learn-mcp": null,
  });
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const entriesMap: Record<TabKey, ChangelogEntry[]> = {
    plugin: pluginEntries,
    cli: cliEntries,
    "learn-host": learnHostEntries,
    "learn-mcp": learnMcpEntries,
  };

  const entries = entriesMap[activeTab];

  const updateIndicator = useCallback(() => {
    const btn = tabRefs.current[activeTab];
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
          {tabs.map((tab) => (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
              onClick={() => setActiveTab(tab.key)}
              className={`relative z-10 cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-200 ${
                activeTab === tab.key
                  ? "text-violet-400"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {entries.map((entry, i, arr) => {
          const latestPublishedIdx = arr.findIndex((e) => !e.unpublished);
          return (
            <ChangelogEntryCard key={entry.version} entry={entry} isLatest={i === latestPublishedIdx} />
          );
        })}
      </div>
    </>
  );
}
