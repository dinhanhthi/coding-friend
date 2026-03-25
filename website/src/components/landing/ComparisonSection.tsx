"use client";

import Container from "@/components/ui/Container";
import evalData from "@/data/eval-results.json";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type ModelKey = keyof typeof evalData.models;

const ALL_KNOWN_MODELS = ["haiku", "sonnet", "opus"] as const;
const MODEL_LABEL: Record<string, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

const MODEL_TABS = ALL_KNOWN_MODELS.filter((key): key is ModelKey => {
  const model = (
    evalData.models as Record<string, (typeof evalData.models)[ModelKey]>
  )[key];
  return !!model && model.evalSessions > 0;
}).map((key) => ({ key, label: MODEL_LABEL[key] ?? key }));

function formatDelta(withCF: number, withoutCF: number): string {
  if (withoutCF <= 0) return "N/A";
  const pct = Math.round(((withCF - withoutCF) / withoutCF) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function getSkillsForModel(modelKey: ModelKey) {
  const model = evalData.models[modelKey];
  if (!model)
    return evalData.featuredSkills.map((fs) => ({
      name: fs.key,
      label: fs.label,
      withCF: 0,
      withoutCF: 0,
      delta: "N/A",
    }));
  return evalData.featuredSkills.map((fs) => {
    const scores = model.skills[fs.key as keyof typeof model.skills];
    const withCF = scores?.withCF ?? 0;
    const withoutCF = scores?.withoutCF ?? 0;
    return {
      name: fs.key,
      label: fs.label,
      withCF,
      withoutCF,
      delta: formatDelta(withCF, withoutCF),
    };
  });
}

function getAverageForModel(modelKey: ModelKey) {
  const model = evalData.models[modelKey];
  if (!model) return { withCF: 0, withoutCF: 0, improvement: "N/A" };
  const avg = model.average;
  return { ...avg, improvement: formatDelta(avg.withCF, avg.withoutCF) };
}

const MAX_SCORE = 3;
const BAR_HEIGHT = 180;

const SKILL_TOOLTIPS: Record<string, string> = {
  "cf-fix": "Diagnose and fix bugs using test-driven debugging workflow",
  "cf-review": "Multi-layer code review: quality, security, and testing",
  "cf-tdd": "Test-Driven Development: RED → GREEN → REFACTOR cycle",
};

function BarGroup({
  name,
  label,
  withCF,
  withoutCF,
  delta,
}: {
  name: string;
  label: string;
  withCF: number;
  withoutCF: number;
  delta: string;
}) {
  const withH = (withCF / MAX_SCORE) * BAR_HEIGHT;
  const withoutH = (withoutCF / MAX_SCORE) * BAR_HEIGHT;
  const hasData = withCF > 0 || withoutCF > 0;
  const isNegative = hasData && withCF < withoutCF;
  const isNeutral = hasData && withCF === withoutCF;
  const tooltip = SKILL_TOOLTIPS[name];

  return (
    <div className="group/tip relative flex flex-col items-center gap-3">
      {/* Tooltip */}
      {tooltip && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-48 -translate-x-1/2 rounded-lg border border-[#a0a0a01c] bg-slate-900 px-3 py-2 text-center text-xs leading-relaxed text-slate-300 opacity-0 shadow-xl transition-opacity duration-200 group-hover/tip:opacity-100">
          {tooltip}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </span>
      )}

      {/* Delta badge */}
      <span
        className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
          !hasData || isNeutral
            ? "bg-slate-700/50 text-slate-500"
            : isNegative
              ? "bg-red-500/10 text-red-400"
              : "bg-emerald-500/10 text-emerald-400"
        }`}
      >
        {hasData ? delta : "—"}
      </span>

      {/* Bars */}
      <div className="flex items-end gap-2">
        {/* Without CF */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-medium text-slate-400">
            {hasData ? withoutCF.toFixed(1) : "—"}
          </span>
          <div
            className="w-10 rounded-t-md bg-slate-700 transition-all duration-500 sm:w-14"
            style={{ height: hasData ? withoutH : 8 }}
          />
        </div>

        {/* With CF */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-medium text-violet-300">
            {hasData ? withCF.toFixed(1) : "—"}
          </span>
          <div
            className="w-10 rounded-t-md bg-violet-500 transition-all duration-500 sm:w-14"
            style={{ height: hasData ? withH : 8 }}
          />
        </div>
      </div>

      {/* Label */}
      <span className="text-sm font-medium text-slate-300">{label}</span>
    </div>
  );
}

export default function ComparisonSection() {
  const [activeModel, setActiveModel] = useState<ModelKey>(MODEL_TABS[0].key);
  const skills = getSkillsForModel(activeModel);
  const avg = getAverageForModel(activeModel);
  const model = evalData.models[activeModel];

  const tabRefs = useRef<Record<ModelKey, HTMLButtonElement | null>>(
    Object.fromEntries(MODEL_TABS.map((t) => [t.key, null])) as Record<
      ModelKey,
      HTMLButtonElement | null
    >,
  );
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const btn = tabRefs.current[activeModel];
    if (btn) {
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [activeModel]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  if (MODEL_TABS.length === 0) return null;

  return (
    <section className="border-b border-[#a0a0a01c] py-16">
      <Container>
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-white">
            Measured Quality Improvement
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            Same prompts. Same repos. Same model. Scored on a 0&ndash;3 weighted
            rubric across {model?.evalSessions} eval sessions with Claude{" "}
            {model?.label}.
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          {/* Model tabs — hidden when only one model has data */}
          {MODEL_TABS.length > 1 && (
            <div className="mb-8 flex justify-center">
              <div className="bg-navy-950/50 relative inline-flex rounded-full border border-[#a0a0a01c] p-1">
                <div
                  className="bg-navy-800 absolute top-1 bottom-1 rounded-full shadow-sm transition-all duration-300 ease-in-out"
                  style={{ left: indicator.left, width: indicator.width }}
                />
                {MODEL_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    ref={(el) => {
                      tabRefs.current[tab.key] = el;
                    }}
                    onClick={() => setActiveModel(tab.key)}
                    className={`relative z-10 cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-200 ${
                      activeModel === tab.key
                        ? "text-violet-400"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bar chart */}
          <div className="flex items-end justify-center gap-8 sm:gap-14">
            {skills.map((s) => (
              <BarGroup
                key={s.name}
                name={s.name}
                label={s.label}
                withCF={s.withCF}
                withoutCF={s.withoutCF}
                delta={s.delta}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-slate-700" />
              <span className="text-sm text-slate-400">Without CF</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-violet-500" />
              <span className="text-sm text-slate-400">With Coding Friend</span>
            </div>
          </div>

          {/* Overall average */}
          <div className="mx-auto mt-8 flex w-fit flex-wrap items-center justify-center gap-10 rounded-xl border border-violet-500/20 bg-violet-500/5 px-6 py-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-violet-400">
                {avg.withCF.toFixed(2)}
              </div>
              <div className="text-sm text-slate-400">With CF avg</div>
            </div>
            <div className="text-lg text-slate-600">vs</div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-500">
                {avg.withoutCF.toFixed(2)}
              </div>
              <div className="text-sm text-slate-400">Without CF avg</div>
            </div>
            <div className="text-center">
              <div
                className={`text-2xl font-bold ${avg.withCF < avg.withoutCF ? "text-red-400" : avg.withCF === avg.withoutCF ? "text-slate-500" : "text-emerald-400"}`}
              >
                {avg.improvement}
              </div>
              <div className="text-sm text-slate-400">improvement</div>
            </div>
          </div>

          {/* Methodology link */}
          <p className="mt-6 text-center text-sm text-slate-500">
            cf-plan excluded: single-turn eval penalizes CF&apos;s
            clarification-first methodology.{" "}
            <Link
              href="/docs/reference/evaluation"
              className="text-violet-400 hover:underline hover:underline-offset-4"
            >
              Full methodology & raw data
            </Link>
          </p>
        </div>
      </Container>
    </section>
  );
}
