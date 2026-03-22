"use client";

import Container from "@/components/ui/Container";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/* ────────────────────────────────────────────────────────────
   TAB TYPES & CONSTANTS
   ──────────────────────────────────────────────────────────── */

const TAB_DURATION = 10000;

interface ComparisonTab {
  id: string;
  label: string;
  color: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

/* ────────────────────────────────────────────────────────────
   ICONS (Heroicons outline, 20×20)
   ──────────────────────────────────────────────────────────── */

const ShieldCheckIcon = () => (
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

const MagnifyingGlassIcon = () => (
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
      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
    />
  </svg>
);

const ChartBarIcon = () => (
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
      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
    />
  </svg>
);

/* ────────────────────────────────────────────────────────────
   SHARED COMPONENTS
   ──────────────────────────────────────────────────────────── */

function ScoreBar({
  value,
  max = 3,
  color,
}: {
  value: number;
  max?: number;
  color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-800">
      <div
        className={`h-2.5 rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TAB 1: TEST DISCIPLINE (cf-fix)
   ──────────────────────────────────────────────────────────── */

function TestDisciplineContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Without Coding Friend, Claude fixes bugs correctly — but consistently
        skips writing tests. With CF, every bug fix includes regression tests
        and a full test suite verification.
      </p>

      {/* Hero metric: 100% vs 0% */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <div className="text-3xl font-bold text-emerald-400">100%</div>
          <div className="mt-2 text-base text-slate-300">
            of bug fixes include tests
          </div>
          <div className="mt-1 text-sm text-slate-500">With Coding Friend</div>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-4 text-center">
          <div className="text-3xl font-bold text-slate-500">0%</div>
          <div className="mt-2 text-base text-slate-300">
            of bug fixes include tests
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Without Coding Friend
          </div>
        </div>
      </div>

      {/* What CF does differently */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          {
            label: "Write failing test first",
            desc: "Reproduces the bug before fixing it",
          },
          {
            label: "Verify test passes after fix",
            desc: "Confirms the fix actually works",
          },
          {
            label: "Run full test suite",
            desc: "Checks for regressions automatically",
          },
          {
            label: "Auto-review the fix",
            desc: "Runs cf-verification as a final gate",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-start gap-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-3"
          >
            <div className="mt-0.5 shrink-0 text-emerald-400">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <div>
              <p className="text-base font-medium text-white">{item.label}</p>
              <p className="mt-0.5 text-sm text-slate-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Score bar */}
      <div className="mx-auto w-full max-w-2xl rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium text-slate-300">
            Bug fix quality score
          </span>
          <span className="text-sm font-medium text-emerald-400">+58%</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-20 text-right text-sm text-slate-500">
              Without
            </span>
            <div className="flex-1">
              <ScoreBar value={1.9} color="bg-slate-600" />
            </div>
            <span className="w-12 text-right text-sm text-slate-400">
              1.9/3
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-right text-sm text-emerald-400">
              With CF
            </span>
            <div className="flex-1">
              <ScoreBar value={3.0} color="bg-emerald-500" />
            </div>
            <span className="w-12 text-right text-sm text-emerald-300">
              3.0/3
            </span>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-slate-500">
        Scored across 4 eval sessions on standardized benchmark repos.{" "}
        <Link
          href="/docs/reference/evaluation"
          className="text-violet-400 hover:underline hover:underline-offset-4"
        >
          Full methodology & raw data
        </Link>
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TAB 2: REVIEW DEPTH (cf-review)
   ──────────────────────────────────────────────────────────── */

function ReviewDepthContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        CF&apos;s two-pass review methodology (quick scan + deep 4-layer
        analysis) catches more issues with structured severity categorization
        and file:line references for every finding.
      </p>

      {/* Side-by-side comparison */}
      <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="text-sm font-medium tracking-wide text-violet-400 uppercase">
            With Coding Friend
          </div>
          <div className="mt-3 space-y-3">
            {[
              { label: "Issues found", value: "10", color: "text-violet-300" },
              {
                label: "Actionable findings",
                value: "100%",
                color: "text-violet-300",
              },
              {
                label: "False positives",
                value: "0",
                color: "text-emerald-400",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span className="text-base text-slate-300">{row.label}</span>
                <span className={`text-lg font-bold ${row.color}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[
              "Severity labels",
              "file:line refs",
              "Fix suggestions",
              "Summary table",
            ].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-sm text-violet-300"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
          <div className="text-sm font-medium tracking-wide text-slate-500 uppercase">
            Without Coding Friend
          </div>
          <div className="mt-3 space-y-3">
            {[
              { label: "Issues found", value: "5", color: "text-slate-400" },
              {
                label: "Actionable findings",
                value: "~70%",
                color: "text-slate-400",
              },
              {
                label: "False positives",
                value: "1",
                color: "text-amber-400",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span className="text-base text-slate-300">{row.label}</span>
                <span className={`text-lg font-bold ${row.color}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-sm text-slate-500">
            Variable structure — sometimes strong, sometimes shallow. No
            consistent severity categorization.
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="mx-auto w-full max-w-2xl rounded-lg border border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-base font-medium text-slate-300">
            Review quality score
          </span>
          <span className="text-sm font-medium text-violet-400">+19%</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="w-20 text-right text-sm text-slate-500">
              Without
            </span>
            <div className="flex-1">
              <ScoreBar value={2.53} color="bg-slate-600" />
            </div>
            <span className="w-12 text-right text-sm text-slate-400">
              2.5/3
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-right text-sm text-violet-400">
              With CF
            </span>
            <div className="flex-1">
              <ScoreBar value={3.0} color="bg-violet-500" />
            </div>
            <span className="w-12 text-right text-sm text-violet-300">
              3.0/3
            </span>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-slate-500">
        Scored across 4 eval sessions on standardized benchmark repos.{" "}
        <Link
          href="/docs/reference/evaluation"
          className="text-violet-400 hover:underline hover:underline-offset-4"
        >
          Full methodology & raw data
        </Link>
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TAB 3: QUALITY SCORES (all skills + overall)
   ──────────────────────────────────────────────────────────── */

const skillScores = [
  {
    name: "cf-fix",
    label: "Bug fix quality",
    withCF: 3.0,
    withoutCF: 1.9,
    delta: "+58%",
  },
  {
    name: "cf-review",
    label: "Code review depth",
    withCF: 3.0,
    withoutCF: 2.53,
    delta: "+19%",
  },
  {
    name: "cf-tdd",
    label: "TDD compliance",
    withCF: 2.6,
    withoutCF: 1.73,
    delta: "+50%",
  },
];

function QualityScoresContent() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-base leading-relaxed text-slate-400">
        Scored on a 0–3 weighted rubric across 22 eval sessions with Claude Opus
        4.6. We honestly show where baseline Claude Code already excels.
      </p>

      {/* Per-skill score bars */}
      <div className="mx-auto w-full max-w-2xl space-y-3">
        {skillScores.map((skill) => (
          <div
            key={skill.name}
            className="rounded-lg border border-slate-800 bg-slate-900/50 p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-base font-medium text-slate-300">
                {skill.label}
              </span>
              <span
                className={`text-sm font-medium ${skill.delta === "0%" ? "text-slate-500" : "text-emerald-400"}`}
              >
                {skill.delta === "0%" ? "=" : skill.delta}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-20 text-right text-sm text-slate-500">
                  Without
                </span>
                <div className="flex-1">
                  <ScoreBar value={skill.withoutCF} color="bg-slate-600" />
                </div>
                <span className="w-12 text-right text-sm text-slate-400">
                  {skill.withoutCF.toFixed(1)}/3
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-20 text-right text-sm text-violet-400">
                  With CF
                </span>
                <div className="flex-1">
                  <ScoreBar value={skill.withCF} color="bg-violet-500" />
                </div>
                <span className="w-12 text-right text-sm text-violet-300">
                  {skill.withCF.toFixed(1)}/3
                </span>
              </div>
            </div>
            {"note" in skill && (
              <p className="mt-2 text-sm text-slate-500">
                {(skill as { note: string }).note}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Overall average */}
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-center gap-12 rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
        <div className="text-center">
          <div className="text-2xl font-bold text-violet-400">2.87</div>
          <div className="text-sm text-slate-400">With CF avg</div>
        </div>
        <div className="text-lg text-slate-600">vs</div>
        <div className="text-center">
          <div className="text-2xl font-bold text-slate-500">2.05</div>
          <div className="text-sm text-slate-400">Without CF avg</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-emerald-400">+40%</div>
          <div className="text-sm text-slate-400">improvement</div>
        </div>
      </div>

      {/* Methodology link */}
      <p className="text-center text-sm text-slate-500">
        cf-plan excluded: single-turn eval penalizes CF&apos;s
        clarification-first methodology.{" "}
        <a
          href="/docs/reference/evaluation"
          className="text-violet-400 hover:underline hover:underline-offset-4"
        >
          Full methodology &amp; raw data
        </a>
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COLOR MAP
   ──────────────────────────────────────────────────────────── */

const tabColorMap: Record<
  string,
  { active: string; inactive: string; bar: string }
> = {
  emerald: {
    active: "text-emerald-300",
    inactive: "text-slate-500 hover:text-slate-300",
    bar: "bg-emerald-400",
  },
  violet: {
    active: "text-violet-300",
    inactive: "text-slate-500 hover:text-slate-300",
    bar: "bg-violet-400",
  },
  sky: {
    active: "text-sky-300",
    inactive: "text-slate-500 hover:text-slate-300",
    bar: "bg-sky-400",
  },
};

/* ────────────────────────────────────────────────────────────
   TABS CONFIG
   ──────────────────────────────────────────────────────────── */

const tabs: ComparisonTab[] = [
  {
    id: "test-discipline",
    label: "Test Discipline",
    color: "emerald",
    icon: <ShieldCheckIcon />,
    content: <TestDisciplineContent />,
  },
  {
    id: "review-depth",
    label: "Review Depth",
    color: "violet",
    icon: <MagnifyingGlassIcon />,
    content: <ReviewDepthContent />,
  },
  {
    id: "quality-scores",
    label: "Quality Scores",
    color: "sky",
    icon: <ChartBarIcon />,
    content: <QualityScoresContent />,
  },
];

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
  const r = 12;
  const br = 12;
  const bodyY = tabsRowH;

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
      <path
        d={bodyBorderPath}
        fill="none"
        stroke="rgba(255, 255, 255, 0.7)"
        strokeWidth="0.5"
      />
      <path
        d={topPath}
        fill="none"
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth="0.5"
      />
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
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────── */

export default function ComparisonSection() {
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

  useEffect(() => {
    if (!startTimeRef.current) startTimeRef.current = performance.now();

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
    <section className="bg-navy-950/30 border-b border-[#a0a0a01c] py-16">
      <Container>
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-white">
            Measured Quality Improvement
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            Same prompts. Same repos. Same model. We ran Claude Code with and
            without Coding Friend on standardized benchmarks and scored the
            outputs against weighted rubrics.
          </p>
        </div>

        {/* Tab cards + body */}
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

          {/* Tab buttons row */}
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
                  className={`group relative flex shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-t-xl px-4 py-3 text-base font-medium transition-all duration-300 sm:min-w-[160px] sm:px-5 sm:py-3.5 ${
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
