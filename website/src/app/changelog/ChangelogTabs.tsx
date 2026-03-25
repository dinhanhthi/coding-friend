"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChangelogEntryCard from "@/components/changelog/ChangelogEntry";
import type { ChangelogEntry } from "@/lib/types";

const tabs = [
  { key: "plugin", label: "Plugin" },
  { key: "cli", label: "CLI" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function parseVersion(version: string): [number, number, number] {
  const nums = version.replace(/^v/, "").split(".").map(Number);
  return [nums[0], nums[1], nums[2]];
}

/**
 * Returns true if the version belongs to the latest minor version group.
 * e.g. if the latest published version is v1.14.0, all v1.14.x are expanded.
 * Unpublished versions are always expanded.
 */
function isLatestMinor(version: string, entries: ChangelogEntry[]): boolean {
  const firstPublished = entries.find((e) => !e.unpublished);
  if (!firstPublished) return true;

  const entry = entries.find((e) => e.version === version);
  if (entry?.unpublished) return true;

  const [latestMajor, latestMinor] = parseVersion(firstPublished.version);
  const [major, minor] = parseVersion(version);
  return major === latestMajor && minor === latestMinor;
}

interface Props {
  pluginEntries: ChangelogEntry[];
  cliEntries: ChangelogEntry[];
}

export default function ChangelogTabs({ pluginEntries, cliEntries }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>("plugin");
  const tabRefs = useRef<Record<TabKey, HTMLButtonElement | null>>({
    plugin: null,
    cli: null,
  });
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const entriesMap: Record<TabKey, ChangelogEntry[]> = {
    plugin: pluginEntries,
    cli: cliEntries,
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
        <div className="scrollbar-none bg-navy-950/50 relative inline-flex max-w-full overflow-x-auto rounded-full border border-[#a0a0a01c] p-1">
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
              className={`relative z-10 shrink-0 cursor-pointer rounded-full px-3 py-2 text-sm font-medium transition-colors duration-200 sm:px-5 sm:text-base ${
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
            <ChangelogEntryCard
              key={`${activeTab}-${entry.version}`}
              entry={entry}
              isLatest={i === latestPublishedIdx}
              defaultExpanded={isLatestMinor(entry.version, arr)}
            />
          );
        })}
      </div>
    </>
  );
}
