"use client";

import Container from "@/components/ui/Container";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────
   TAB DATA
   ──────────────────────────────────────────────────────────── */

interface FeatureTab {
  id: string;
  label: string;
  color: string; // tailwind accent color name
  icon: React.ReactNode;
  content: React.ReactNode;
}

const TAB_DURATION = 8000; // ms per tab

/* ────────────────────────────────────────────────────────────
   ICONS (Heroicons outline, 20×20)
   ──────────────────────────────────────────────────────────── */

const StatuslineIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
    />
  </svg>
);

const LearnHostIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.966 8.966 0 00-6 2.292m0-14.25v14.25"
    />
  </svg>
);

const SessionIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3.75l3 3m0 0l3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75"
    />
  </svg>
);

const MemoryIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125v-3.75"
    />
  </svg>
);

const SkillsAgentsIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const SecurityIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

const CustomSkillsIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z"
    />
  </svg>
);

const ResearchIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
    />
  </svg>
);

const CrossAgentIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
    />
  </svg>
);

/* ────────────────────────────────────────────────────────────
   STATUSLINE CONTENT
   ──────────────────────────────────────────────────────────── */

const statuslineSegments = [
  { label: "CF version", example: "cf v0.3.0", color: "text-blue-400" },
  {
    label: "Project + Branch",
    example: (
      <>
        coding-friend <span className="text-green-400">(⎇ main)</span>
      </>
    ),
    color: "text-orange-400",
  },
  { label: "Model", example: "Opus (1M)", color: "text-cyan-400" },
  {
    label: "Account",
    example: (
      <>
        👤 Thi Dinh <span className="text-slate-500">(thi@…)</span>
      </>
    ),
    color: "text-cyan-400",
  },
  { label: "Context", example: "ctx 42%", color: "text-amber-400" },
  {
    label: "Rate limit",
    example: "[5h] 30% → 2:30pm | [7d] 10% → mar 15, 2:30pm",
    color: "text-violet-300",
  },
];

function StatuslineContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Always know what&apos;s happening. Your terminal statusline, upgraded
        with real-time project context — version, branch, model, account,
        context usage, and rate limits at a glance. Read more about it{" "}
        <Link
          className="text-violet-400 hover:underline hover:underline-offset-3"
          href="/docs/cli/cf-statusline"
        >
          here
        </Link>
        .
      </p>

      <div className="relative mx-auto w-full max-w-2xl">
        <div className="pointer-events-none absolute -inset-4 rounded-3xl bg-linear-to-br from-violet-600/20 via-sky-500/10 to-emerald-500/20 opacity-60 blur-2xl" />

        <div className="relative w-full overflow-hidden rounded-2xl border border-[#a0a0a05d] bg-[#1e1e2e] shadow-2xl shadow-violet-500/10">
          {/* Title bar */}
          <div className="mb-1 flex items-center gap-2 px-3 py-2">
            <span className="h-3 w-3 rounded-full bg-red-500/80" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <span className="h-3 w-3 rounded-full bg-green-500/80" />
            <span className="ml-3 font-mono text-sm text-slate-500">
              claude — coding-friend
            </span>
          </div>

          {/* Terminal content */}
          <div className="rounded-lg bg-[#1a1b26] px-5 py-4 font-mono text-base leading-relaxed select-none">
            <div className="flex justify-between">
              <span>
                <span className="font-bold text-cyan-400">➜</span>{" "}
                <span className="font-bold text-white">claude</span>
              </span>
              <span className="text-blue-400">[12:47:44]</span>
            </div>
            <div className="h-3" />
            <pre className="text-base leading-snug">
              <span className="text-violet-400">{"    ✻\n"}</span>
              <span className="text-violet-400">{"    |\n"}</span>
              <span className="text-violet-400">{"   ▟█▙"}</span>
              {"     "}
              <span className="font-bold text-white">Claude Code</span>
              {" v2.1.50\n"}
              <span className="text-orange-400">{" ▐▛███▜▌"}</span>
              {"   "}
              <span className="text-slate-400">Opus 4.6 · Claude Max</span>
              {"\n"}
              <span className="text-orange-400">{"▝▜█████▛▘"}</span>
              {"  "}
              <span className="text-slate-400">~/git/coding-friend</span>
              {"\n"}
              <span className="text-orange-400">{"  ▘▘ ▝▝"}</span>
            </pre>
            <div className="my-3 border-t border-slate-700/60" />
            <div className="text-white">
              <span className="font-bold text-white">❯</span>{" "}
              <span className="text-slate-400">
                Try &quot;how do I log an error?&quot;
              </span>
            </div>
            <div className="my-3 border-t border-slate-700/60" />
            <div className="flex flex-wrap items-center gap-0 gap-y-2 text-base">
              <span className="whitespace-nowrap text-blue-400">cf v0.3.0</span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-orange-400">
                coding-friend <span className="text-green-400">(⎇ main)</span>
              </span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-cyan-400">Opus (1M)</span>
            </div>
            <div className="flex flex-wrap items-center gap-0 gap-y-1 text-base">
              <span className="whitespace-nowrap text-cyan-400">
                👤 Thi Dinh{" "}
                <span className="text-slate-500">(anhthi.dinh@septeo.com)</span>
              </span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-blue-400">
                🏢 anhthi.dinh@septeo.com&apos;s Organization
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-0 gap-y-1 text-base">
              <span className="whitespace-nowrap text-amber-400">ctx 42%</span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-slate-400">
                [5h] <span className="text-violet-400">30%</span> → 2:30pm
              </span>
              <span className="mx-2 text-slate-600">│</span>
              <span className="whitespace-nowrap text-slate-400">
                [7d] <span className="text-violet-400">10%</span> → mar 15,
                2:30pm
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Segment labels */}
      <div className="flex flex-wrap justify-center gap-3">
        {statuslineSegments.map((seg) => (
          <div
            key={seg.label}
            className="bg-navy-950/80 flex items-center gap-2 rounded-lg border border-[#a0a0a05d] px-3 py-2"
          >
            <span className={`font-mono text-base font-medium ${seg.color}`}>
              {seg.example}
            </span>
            <span className="text-base text-slate-500">{seg.label}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-slate-500">
        Run{" "}
        <code className="rounded border border-[#a0a0a05d] px-2 py-0.5 text-sm text-violet-400">
          cf statusline
        </code>{" "}
        to set up in seconds.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   LEARN HOST CONTENT
   ──────────────────────────────────────────────────────────── */

function LearnHostContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        <Link className="text-emerald-400" href="/docs/skills/cf-learn">
          <code>/cf-learn</code>
        </Link>{" "}
        extracts human-readable knowledge from your coding sessions. Then serve
        them as a searchable website with{" "}
        <Link className="text-emerald-400" href="/docs/cli/cf-host">
          <code>cf host</code>
        </Link>
        , or expose them to other LLM clients via{" "}
        <Link className="text-emerald-400" href="/docs/cli/cf-mcp">
          <code>cf mcp</code>
        </Link>{" "}
        as an MCP server.
      </p>

      {/* Pipeline flow */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-base">
        {[
          {
            label: "/cf-learn",
            desc: "Extract knowledge",
            color: "text-violet-400",
            border: "border-violet-500/30",
          },
          {
            label: "docs/learn/",
            desc: "Markdown files",
            color: "text-slate-300",
            border: "border-slate-500/30",
          },
          {
            label: "cf host / cf mcp",
            desc: "Website or MCP server",
            color: "text-emerald-400",
            border: "border-emerald-500/30",
          },
        ].map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            {i > 0 && (
              <svg
                className="h-4 w-4 shrink-0 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            )}
            <div
              className={`rounded-lg border ${step.border} bg-navy-950/60 px-3 py-2 text-center`}
            >
              <code
                className={`border-none! text-base! font-medium ${step.color}`}
              >
                {step.label}
              </code>
              <p className="mt-0.5 text-sm text-slate-500">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Screenshot */}
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[#a0a0a05d] shadow-2xl shadow-emerald-500/5">
        <Image
          src="/cf-host.png"
          alt="Learn Host — browsable knowledge base generated from /cf-learn docs"
          width={1200}
          height={750}
          className="w-full"
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {[
          "Categorized by topic",
          "Full-text search",
          "Tag-based filtering",
          "MCP for LLM clients",
          "Deploy anywhere",
        ].map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-sm text-emerald-300"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SESSION SAVE/RESTORE CONTENT
   ──────────────────────────────────────────────────────────── */

const sessionSaveExample = `$ /cf-session

Saving current session...

📋 Session Summary
   ├── 47 messages, 3 files changed
   ├── Context: auth middleware refactor
   └── Branch: feat/jwt-auth

Saved → docs/sessions/2026-03-17_jwt-auth.md

$ cf session load docs/sessions/2026-03-17_jwt-auth.md
Restoring session context...
✓ Session loaded — continue where you left off`;

function SessionContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Save your Claude Code session to a portable markdown file and resume it
        on any machine. Perfect for switching between desktop and laptop, or
        handing off work to a teammate.
      </p>

      {/* Two-column: save + load */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 text-center">
          <Link className="text-sky-400" href="/docs/skills/cf-session">
            <code className="border-none! text-base! font-medium">
              /cf-session
            </code>
          </Link>
          <p className="mt-1.5 text-base text-slate-400">
            Save current session context, messages, and file changes to{" "}
            <code className="text-sm text-slate-300">docs/sessions/</code>.
          </p>
        </div>
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-center">
          <Link className="text-orange-400" href="/docs/cli/cf-session">
            <code className="border-none! text-base! font-medium">
              cf session load
            </code>
          </Link>
          <p className="mt-1.5 text-base text-slate-400">
            Restore a saved session on any machine — pick up exactly where you
            left off
          </p>
        </div>
      </div>

      {/* Terminal mockup */}
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-[#a0a0a05d] bg-[#1e1e2e] shadow-2xl shadow-sky-500/5">
          <div className="flex items-center gap-1.5 px-4 py-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            <span className="ml-2 font-mono text-sm text-slate-500">
              terminal
            </span>
          </div>
          <pre className="overflow-x-auto p-4! pt-0! pb-4 font-mono text-sm leading-relaxed text-slate-300">
            {sessionSaveExample.split("\n").map((line, i) => {
              if (line.startsWith("$")) {
                const parts = line.split(" ");
                const cmd = parts.slice(1).join(" ");
                return (
                  <div key={i}>
                    <span className="text-slate-500">$ </span>
                    <span className="text-sky-400">{cmd}</span>
                  </div>
                );
              }
              if (line.startsWith("✓")) {
                return (
                  <div key={i} className="text-emerald-400">
                    {line}
                  </div>
                );
              }
              if (line.includes("→")) {
                const [before, after] = line.split("→");
                return (
                  <div key={i} className="text-emerald-400">
                    {before}
                    <span className="text-slate-500">→</span>
                    {after}
                  </div>
                );
              }
              if (line.includes("├──") || line.includes("└──")) {
                return (
                  <div key={i} className="text-slate-400">
                    {line}
                  </div>
                );
              }
              if (line.includes("📋")) {
                return (
                  <div key={i} className="text-white">
                    {line}
                  </div>
                );
              }
              return (
                <div key={i} className="text-slate-500">
                  {line}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   MEMORY SYSTEM CONTENT
   ──────────────────────────────────────────────────────────── */

function MemoryContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Every AI session starts from scratch — repeating mistakes, forgetting
        decisions.{" "}
        <Link
          className="text-violet-400 hover:underline hover:underline-offset-3"
          href="/docs/reference/memory-system/"
        >
          CF Memory
        </Link>{" "}
        gives your AI persistent, searchable memory across sessions with 3-tier
        graceful degradation.
      </p>

      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            tier: "Tier 1",
            name: "SQLite",
            desc: "FTS5 + semantic vectors with RRF fusion",
            color: "text-cyan-400",
            border: "border-cyan-500/30",
          },
          {
            tier: "Tier 2",
            name: "MiniSearch",
            desc: "In-memory BM25 + fuzzy matching via daemon",
            color: "text-violet-400",
            border: "border-violet-500/30",
          },
          {
            tier: "Tier 3",
            name: "Grep",
            desc: "Zero-dependency file scan, always available",
            color: "text-rose-400",
            border: "border-rose-500/30",
          },
        ].map((t) => (
          <div
            key={t.tier}
            className={`rounded-xl border ${t.border} bg-navy-950/60 p-4 text-center`}
          >
            <span
              className={`font-mono text-sm font-medium uppercase ${t.color}`}
            >
              {t.tier}
            </span>
            <p className={`mt-1 text-base font-semibold ${t.color}`}>
              {t.name}
            </p>
            <p className="mt-1 text-sm text-slate-400">{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            title: "Auto-capture from skills",
            desc: "cf-fix, cf-review, cf-ask automatically store debug episodes and architectural insights.",
          },
          {
            title: "Hybrid search (BM25 + semantic)",
            desc: "Find memories even when you paraphrase — Reciprocal Rank Fusion ranks the best results.",
          },
          {
            title: "100% local, markdown source of truth",
            desc: "No cloud, no API keys. Human-readable markdown with YAML frontmatter, git-trackable.",
          },
          {
            title: "MCP integration",
            desc: "Skills auto-recall relevant memories before every task via the MCP server.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-lg border border-amber-500/10 bg-amber-500/5 p-3"
          >
            <div className="mt-0.5 shrink-0 rounded-md bg-amber-500/10 p-1.5 text-amber-400">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-white">{item.title}</p>
              <p className="mt-0.5 text-sm text-slate-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SKILLS + AGENTS CONTENT
   ──────────────────────────────────────────────────────────── */

function SkillsAgentsContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        <Link
          className="text-violet-400 hover:underline hover:underline-offset-3"
          href="/docs/skills/overview/"
        >
          Skills
        </Link>{" "}
        are your commands — type{" "}
        <Link className="text-violet-400" href="/docs/skills/cf-plan/">
          <code className="text-violet-400">/cf-plan</code>
        </Link>{" "}
        and Coding Friend handles the rest. Behind the scenes,{" "}
        <Link
          className="text-violet-400 hover:underline hover:underline-offset-3"
          href="/docs/reference/agents/"
        >
          agents
        </Link>{" "}
        do the heavy lifting: specialized subprocesses that explore, plan,
        review, and write autonomously.
      </p>

      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Skills column */}
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <h4 className="text-base font-semibold text-violet-400">
            13 Slash Commands
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Manual triggering with natural language
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              "/cf-plan",
              "/cf-fix",
              "/cf-ask",
              "/cf-review",
              "/cf-commit",
              "/cf-ship",
              "/cf-optimize",
              "/cf-scan",
              "/cf-remember",
              "/cf-learn",
              "/cf-research",
              "/cf-session",
              "/cf-help",
            ].map((cmd) => (
              <code
                key={cmd}
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-sm text-violet-300"
              >
                {cmd}
              </code>
            ))}
          </div>
          <div className="mt-4 border-t border-violet-500/10 pt-3">
            <h4 className="text-base font-semibold text-slate-300">
              4 Auto-Invoked Skills
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              Activate automatically when relevant — TDD, debugging,
              verification, code review
            </p>
          </div>
        </div>

        {/* Agents column */}
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-5">
          <h4 className="text-base font-semibold text-sky-400">
            6 Specialized Agents
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Autonomous subprocesses for parallel work
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {[
              {
                name: "cf-explorer",
                desc: "Codebase exploration (read-only, fast)",
              },
              {
                name: "cf-planner",
                desc: "Task decomposition & brainstorming",
              },
              {
                name: "cf-implementer",
                desc: "TDD implementation in isolation",
              },
              {
                name: "cf-code-reviewer",
                desc: "Multi-layer code review",
              },
              { name: "cf-writer", desc: "Lightweight doc generation" },
              {
                name: "cf-writer-deep",
                desc: "Deep reasoning for nuanced content",
              },
            ].map((agent) => (
              <div key={agent.name} className="group flex items-center gap-2">
                <code className="shrink-0 text-sm font-medium text-sky-400">
                  {agent.name}
                </code>
                <span className="text-xs text-slate-500">{agent.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-base text-slate-500">
        Skills orchestrate agents behind the scenes —{" "}
        <code className="text-violet-400">/cf-review</code> dispatches{" "}
        <code className="text-sky-400">cf-code-reviewer</code>,{" "}
        <code className="text-violet-400">/cf-plan</code> uses{" "}
        <code className="text-sky-400">cf-planner</code> +{" "}
        <code className="text-sky-400">cf-explorer</code>.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   SECURITY CONTENT
   ──────────────────────────────────────────────────────────── */

function SecurityContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        External content — web pages, MCP tools, fetched files — can contain
        hidden instructions targeting your AI assistant. Coding Friend&apos;s{" "}
        <Link
          className="text-rose-400 hover:underline hover:underline-offset-3"
          href="/docs/reference/security/"
        >
          content isolation
        </Link>{" "}
        layers enforce strict boundaries between trusted instructions and
        untrusted data.
      </p>

      {/* Defense layers */}
      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            layer: "Layer 1",
            name: "Isolation",
            desc: "External content flagged as untrusted data — never treated as instructions",
            color: "text-rose-400",
            border: "border-rose-500/30",
          },
          {
            layer: "Layer 2",
            name: "Extraction",
            desc: "Only facts and information extracted — embedded commands discarded",
            color: "text-amber-400",
            border: "border-amber-500/30",
          },
          {
            layer: "Layer 3",
            name: "Alert",
            desc: "Suspicious content flagged to user — prompt injection attempts exposed",
            color: "text-emerald-400",
            border: "border-emerald-500/30",
          },
        ].map((t) => (
          <div
            key={t.layer}
            className={`rounded-xl border ${t.border} bg-navy-950/60 p-4 text-center`}
          >
            <span
              className={`font-mono text-sm font-medium uppercase ${t.color}`}
            >
              {t.layer}
            </span>
            <p className={`mt-1 text-base font-semibold ${t.color}`}>
              {t.name}
            </p>
            <p className="mt-1 text-sm text-slate-400">{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            title: "Never follows fetched instructions",
            desc: '"Run this command" or "ignore previous instructions" in web content? Blocked and flagged.',
          },
          {
            title: "No data exfiltration",
            desc: "Project secrets, API keys, and code are never sent to external endpoints from fetched content.",
          },
          {
            title: "Enforced at every skill",
            desc: "Content isolation rules are loaded into every skill and agent — not optional, always active.",
          },
          {
            title: "Works with WebFetch & MCP",
            desc: "All external sources — web pages, MCP tools, external APIs — treated as untrusted by default.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-lg border border-rose-500/10 bg-rose-500/5 p-3"
          >
            <div className="mt-0.5 shrink-0 rounded-md bg-rose-500/10 p-1.5 text-rose-400">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-white">{item.title}</p>
              <p className="mt-0.5 text-sm text-slate-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   CUSTOM SKILLS CONTENT
   ──────────────────────────────────────────────────────────── */

function CustomSkillsContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Every built-in skill can be extended with your own rules — add
        pre-workflow steps, enforce extra constraints, or run post-workflow
        actions.{" "}
        <Link
          className="text-cyan-400 hover:underline hover:underline-offset-3"
          href="/docs/reference/custom-guides/"
        >
          No forking required
        </Link>
        .
      </p>

      {/* File structure mockup */}
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="overflow-hidden rounded-2xl border border-[#a0a0a05d] bg-[#1e1e2e] shadow-2xl shadow-cyan-500/5">
          <div className="flex items-center gap-1.5 px-4 py-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
            <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            <span className="ml-2 font-mono text-sm text-slate-500">
              .coding-friend/skills/cf-commit-custom/SKILL.md
            </span>
          </div>
          <pre className="overflow-x-auto p-4! pt-0! pb-4 font-mono text-sm leading-relaxed text-slate-300">
            <span className="text-cyan-400">{"## Before\n"}</span>
            {"Run `npm run lint` before analyzing the diff.\n\n"}
            <span className="text-cyan-400">{"## Rules\n"}</span>
            {
              "- Always include the ticket number from branch name\n- Use scope format: feat(api): description\n\n"
            }
            <span className="text-cyan-400">{"## After\n"}</span>
            {"Run `npm run format` after committing."}
          </pre>
        </div>
      </div>

      {/* Three sections explained */}
      <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            section: "## Before",
            desc: "Steps to run before the skill starts its main workflow",
            color: "text-violet-400",
            border: "border-violet-500/30",
          },
          {
            section: "## Rules",
            desc: "Additional constraints enforced throughout the entire skill execution",
            color: "text-cyan-400",
            border: "border-cyan-500/30",
          },
          {
            section: "## After",
            desc: "Actions to run after the skill completes its workflow",
            color: "text-emerald-400",
            border: "border-emerald-500/30",
          },
        ].map((t) => (
          <div
            key={t.section}
            className={`rounded-xl border ${t.border} bg-navy-950/60 p-4 text-center`}
          >
            <code className={`text-base font-medium ${t.color}`}>
              {t.section}
            </code>
            <p className="mt-2 text-sm text-slate-400">{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {[
          "Per-project or global",
          "Works with any skill",
          "Git-trackable",
          "No plugin forking",
        ].map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-sm text-cyan-300"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   RESEARCH CONTENT
   ──────────────────────────────────────────────────────────── */

function ResearchContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Deep research powered by web search and parallel subagents.{" "}
        <Link
          className="text-orange-400 hover:underline hover:underline-offset-3"
          href="/docs/skills/cf-research/"
        >
          <code>/cf-research</code>
        </Link>{" "}
        explores multiple sources simultaneously, synthesizes findings, and
        produces structured reports saved to{" "}
        <code className="text-sm text-slate-300">docs/research/</code>.
      </p>

      {/* Pipeline */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-base">
        {[
          {
            label: "/cf-research",
            desc: "Define topic",
            color: "text-orange-400",
            border: "border-orange-500/30",
          },
          {
            label: "Parallel agents",
            desc: "Web search + analysis",
            color: "text-sky-400",
            border: "border-sky-500/30",
          },
          {
            label: "docs/research/",
            desc: "Structured report",
            color: "text-emerald-400",
            border: "border-emerald-500/30",
          },
        ].map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            {i > 0 && (
              <svg
                className="h-4 w-4 shrink-0 text-slate-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            )}
            <div
              className={`rounded-lg border ${step.border} bg-navy-950/60 px-3 py-2 text-center`}
            >
              <code
                className={`border-none! text-base! font-medium ${step.color}`}
              >
                {step.label}
              </code>
              <p className="mt-0.5 text-sm text-slate-500">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Capabilities grid */}
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            title: "Parallel web search",
            desc: "Multiple subagents search different angles simultaneously — faster and more thorough than sequential research.",
          },
          {
            title: "Source synthesis",
            desc: "Findings from multiple sources are cross-referenced and synthesized into a coherent analysis.",
          },
          {
            title: "Structured output",
            desc: "Reports include summary, key findings, source links, and actionable recommendations.",
          },
          {
            title: "Saved to docs/research/",
            desc: "Every research session produces a markdown file — searchable, git-trackable, and always available.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-lg border border-orange-500/10 bg-orange-500/5 p-3"
          >
            <div className="mt-0.5 shrink-0 rounded-md bg-orange-500/10 p-1.5 text-orange-400">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-white">{item.title}</p>
              <p className="mt-0.5 text-sm text-slate-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   BORDER PROGRESS OVERLAY
   ──────────────────────────────────────────────────────────── */

function BorderProgressOverlay({
  containerRef,
  tabsRowRef,
  activeIdx,
  progress,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  tabsRowRef: React.RefObject<HTMLDivElement | null>;
  activeIdx: number;
  progress: number;
}) {
  const [dims, setDims] = useState<{
    containerW: number;
    containerH: number;
    tabsRowH: number;
    tabLeft: number;
    tabWidth: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const tabsRow = tabsRowRef.current;
    if (!container || !tabsRow) return;

    const update = () => {
      const activeButton = tabsRow.children[activeIdx] as
        | HTMLElement
        | undefined;
      if (!activeButton) return;
      setDims({
        containerW: container.offsetWidth,
        containerH: container.offsetHeight,
        tabsRowH: tabsRow.offsetHeight,
        tabLeft: activeButton.offsetLeft,
        tabWidth: activeButton.offsetWidth,
      });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, tabsRowRef, activeIdx]);

  if (!dims) return null;

  const { containerW, containerH, tabsRowH, tabLeft, tabWidth } = dims;
  const r = 12; // tab corner radius (rounded-t-xl)
  const br = 12; // body panel corner radius (rounded-xl)

  const bodyY = tabsRowH;

  // Top path (animated): body top-left → around active tab → body top-right corner
  const isFirstTab = activeIdx === 0;
  const topPath = [
    ...(isFirstTab
      ? [`M 0,${bodyY}`]
      : [`M 0,${bodyY + br}`, `Q 0,${bodyY} ${br},${bodyY}`]),
    `L ${tabLeft},${bodyY}`,
    `L ${tabLeft},${r}`,
    `Q ${tabLeft},0 ${tabLeft + r},0`,
    `L ${tabLeft + tabWidth - r},0`,
    `Q ${tabLeft + tabWidth},0 ${tabLeft + tabWidth},${r}`,
    `L ${tabLeft + tabWidth},${bodyY}`,
    `L ${containerW - br},${bodyY}`,
    `Q ${containerW},${bodyY} ${containerW},${bodyY + br}`,
  ].join(" ");

  // Body border path (static): right side → bottom → left side
  const bodyBorderPath = [
    `M ${containerW},${bodyY + br}`,
    `L ${containerW},${containerH - br}`,
    `Q ${containerW},${containerH} ${containerW - br},${containerH}`,
    `L ${br},${containerH}`,
    `Q 0,${containerH} 0,${containerH - br}`,
    ...(isFirstTab ? [`L 0,${bodyY}`] : [`L 0,${bodyY + br}`]),
  ].join(" ");

  return (
    <svg
      width={containerW}
      height={containerH}
      className="pointer-events-none absolute top-0 left-0 z-40"
      style={{ overflow: "visible" }}
    >
      {/* Static body border (always visible) */}
      <path
        d={bodyBorderPath}
        fill="none"
        stroke="rgba(255, 255, 255, 0.7)"
        strokeWidth="0.5"
      />
      {/* Dim top track */}
      <path
        d={topPath}
        fill="none"
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth="0.5"
      />
      {/* Glow (top only) */}
      <path
        d={topPath}
        fill="none"
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth="1"
        strokeLinecap="round"
        pathLength={1000}
        strokeDasharray={1000}
        strokeDashoffset={1000 - progress * 1000}
      />
      {/* Bright progress (top only) */}
      <path
        d={topPath}
        fill="none"
        stroke="rgba(255, 255, 255, 0.7)"
        strokeWidth="0.5"
        strokeLinecap="round"
        pathLength={1000}
        strokeDasharray={1000}
        strokeDashoffset={1000 - progress * 1000}
      />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────
   CROSS-AGENT REVIEW CONTENT
   ──────────────────────────────────────────────────────────── */

function CrossAgentContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Get a second opinion on your code from a completely different AI model.{" "}
        <Link
          className="text-teal-400 hover:underline hover:underline-offset-3"
          href="/docs/skills/cf-review-out/"
        >
          /cf-review-out
        </Link>{" "}
        generates a complete review prompt that any AI agent — Gemini, Codex,
        ChatGPT, or a human — can use to independently review your code. Collect
        results with{" "}
        <Link
          className="text-teal-400 hover:underline hover:underline-offset-3"
          href="/docs/skills/cf-review-in/"
        >
          /cf-review-in
        </Link>
        .
      </p>

      {/* Flow diagram */}
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center gap-3 sm:gap-4">
        {[
          {
            label: "/cf-review-out",
            icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
            color: "text-violet-400",
            border: "border-violet-500/30",
          },
          {
            label: "Any AI agent",
            icon: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
            color: "text-teal-400",
            border: "border-teal-500/30",
          },
          {
            label: "Writes result",
            icon: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
            color: "text-amber-400",
            border: "border-amber-500/30",
          },
          {
            label: "/cf-review-in",
            icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
            color: "text-emerald-400",
            border: "border-emerald-500/30",
          },
        ].map((step, i) => (
          <div key={step.label} className="flex items-center gap-3 sm:gap-4">
            <div
              className={`flex flex-col items-center gap-2 rounded-xl border ${step.border} bg-navy-950/60 p-3 sm:p-4`}
            >
              <svg
                className={`h-6 w-6 ${step.color}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={step.icon}
                />
              </svg>
              <span className="hidden text-center text-xs text-slate-400 sm:block">
                {step.label}
              </span>
            </div>
            {i < 3 && <span className="text-slate-600">&rarr;</span>}
          </div>
        ))}
      </div>

      {/* Supported agents */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          {
            name: "Gemini CLI",
            desc: "Google\u2019s Gemini models via CLI. Uses your configured default model.",
            install: "npm i -g @google/gemini-cli",
            color: "text-blue-400",
            border: "border-blue-500/20",
          },
          {
            name: "Codex CLI",
            desc: "OpenAI\u2019s Codex models via CLI. Uses your configured default model.",
            install: "npm i -g @openai/codex",
            color: "text-green-400",
            border: "border-green-500/20",
          },
        ].map((agent) => (
          <div
            key={agent.name}
            className={`rounded-xl border ${agent.border} bg-navy-950/60 p-4`}
          >
            <p className={`text-base font-semibold ${agent.color}`}>
              {agent.name}
            </p>
            <p className="mt-1 text-sm text-slate-400">{agent.desc}</p>
            <code className="mt-2 block rounded bg-slate-800/60 px-2 py-1 text-xs text-slate-300">
              {agent.install}
            </code>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {[
          "Any AI agent",
          "File-based, no coupling",
          "Second opinion",
          "Async by design",
        ].map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-sm text-teal-300"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TABS CONFIG
   ──────────────────────────────────────────────────────────── */

const tabs: FeatureTab[] = [
  {
    id: "statusline",
    label: "Statusline",
    color: "violet",
    icon: <StatuslineIcon />,
    content: <StatuslineContent />,
  },
  {
    id: "learn-mcp",
    label: "Learn & MCP",
    color: "emerald",
    icon: <LearnHostIcon />,
    content: <LearnHostContent />,
  },
  {
    id: "research",
    label: "Research",
    color: "orange",
    icon: <ResearchIcon />,
    content: <ResearchContent />,
  },
  {
    id: "sessions",
    label: "Sessions",
    color: "sky",
    icon: <SessionIcon />,
    content: <SessionContent />,
  },
  {
    id: "memory",
    label: "Memory System",
    color: "amber",
    icon: <MemoryIcon />,
    content: <MemoryContent />,
  },
  {
    id: "security",
    label: "Security",
    color: "rose",
    icon: <SecurityIcon />,
    content: <SecurityContent />,
  },
  {
    id: "cross-agent",
    label: "Cross-Agent Review",
    color: "teal",
    icon: <CrossAgentIcon />,
    content: <CrossAgentContent />,
  },
  {
    id: "custom-skills",
    label: "Custom Skills",
    color: "cyan",
    icon: <CustomSkillsIcon />,
    content: <CustomSkillsContent />,
  },
  {
    id: "skills-agents",
    label: "Skills & Agents",
    color: "violet",
    icon: <SkillsAgentsIcon />,
    content: <SkillsAgentsContent />,
  },
];

/* ────────────────────────────────────────────────────────────
   COLOR MAP
   ──────────────────────────────────────────────────────────── */

const tabColorMap: Record<
  string,
  { active: string; inactive: string; bar: string }
> = {
  violet: {
    active: "text-violet-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-violet-400",
  },
  emerald: {
    active: "text-emerald-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-emerald-400",
  },
  sky: {
    active: "text-sky-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-sky-400",
  },
  amber: {
    active: "text-amber-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-amber-400",
  },
  rose: {
    active: "text-rose-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-rose-400",
  },
  cyan: {
    active: "text-cyan-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-cyan-400",
  },
  orange: {
    active: "text-orange-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-orange-400",
  },
  teal: {
    active: "text-teal-300",
    inactive: "text-slate-500 hover:text-slate-300 hover:border-slate-600",
    bar: "bg-teal-400",
  },
};

/* ────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────── */

export default function Features() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number>(0);
  const animRef = useRef<number>(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tabsRowRef = useRef<HTMLDivElement>(null);

  const goToTab = useCallback((idx: number) => {
    setActiveIdx(idx);
    setProgress(0);
    startTimeRef.current = performance.now();
  }, []);

  // Auto-advance timer with progress bar
  useEffect(() => {
    if (!startTimeRef.current) {
      startTimeRef.current = performance.now();
    }

    if (paused) {
      cancelAnimationFrame(animRef.current);
      return;
    }

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const pct = Math.min(elapsed / TAB_DURATION, 1);
      setProgress(pct);

      if (pct >= 1) {
        setActiveIdx((prev) => (prev + 1) % tabs.length);
        setProgress(0);
        startTimeRef.current = performance.now();
      }
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [paused, activeIdx]);

  return (
    <section id="features" className="bg-navy-950/30 py-20">
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-[-0.02em] text-white">
            Features
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Beyond skills — the tools and systems that power your workflow.
          </p>
        </div>

        {/* Tab cards + body — seamlessly connected */}
        <div
          ref={wrapperRef}
          className="relative mx-auto max-w-4xl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Border progress overlay */}
          <BorderProgressOverlay
            containerRef={wrapperRef}
            tabsRowRef={tabsRowRef}
            activeIdx={activeIdx}
            progress={progress}
          />

          {/* Tab cards row */}
          <div
            ref={tabsRowRef}
            className="scrollbar-none relative z-10 flex gap-1.5 overflow-x-auto sm:gap-2"
          >
            {tabs.map((tab, idx) => {
              const isActive = idx === activeIdx;
              const c = tabColorMap[tab.color];
              return (
                <button
                  key={tab.id}
                  onClick={() => goToTab(idx)}
                  className={`group relative flex shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-t-xl px-4 py-3 text-base font-medium transition-all duration-300 sm:min-w-[140px] sm:px-5 sm:py-3.5 ${
                    isActive
                      ? `${c.active} bg-navy-950/50`
                      : `${c.inactive} opacity-50`
                  }`}
                >
                  <span
                    className={`transition-transform duration-300 ${isActive ? "scale-110" : "scale-100"}`}
                  >
                    {tab.icon}
                  </span>
                  <span className="hidden whitespace-nowrap sm:inline">
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Body panel */}
          <div
            className={`bg-navy-950/50 rounded-b-xl p-6 sm:p-8 ${activeIdx === 0 ? "rounded-tr-xl" : "rounded-t-xl"}`}
          >
            <div className="overflow-hidden">
              <div
                className="flex transition-transform duration-500 ease-out"
                style={{
                  width: `${tabs.length * 100}%`,
                  transform: `translateX(-${(activeIdx / tabs.length) * 100}%)`,
                }}
              >
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className="w-full shrink-0"
                    style={{ width: `${100 / tabs.length}%` }}
                  >
                    <div className="mb-4 sm:hidden">
                      <h3
                        className={`text-xl font-bold ${tabColorMap[tab.color].active}`}
                      >
                        {tab.label}
                      </h3>
                      <hr className="mt-2 border-slate-700/50" />
                    </div>
                    {tab.content}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
