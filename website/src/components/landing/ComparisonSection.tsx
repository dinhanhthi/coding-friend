"use client";

import Container from "@/components/ui/Container";
import evalData from "@/data/eval-results.json";
import Link from "next/link";
import { useState } from "react";

type ModelKey = keyof typeof evalData.models;

const MODEL_TABS: { key: ModelKey; label: string }[] = [
  { key: "haiku", label: "Haiku" },
  { key: "sonnet", label: "Sonnet" },
  { key: "opus", label: "Opus" },
];

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

function BarGroup({
  label,
  withCF,
  withoutCF,
  delta,
}: {
  label: string;
  withCF: number;
  withoutCF: number;
  delta: string;
}) {
  const withH = (withCF / MAX_SCORE) * BAR_HEIGHT;
  const withoutH = (withoutCF / MAX_SCORE) * BAR_HEIGHT;
  const hasData = withCF > 0 || withoutCF > 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Delta badge */}
      <span
        className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${
          hasData
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-slate-700/50 text-slate-500"
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
  const [activeModel, setActiveModel] = useState<ModelKey>("sonnet");
  const skills = getSkillsForModel(activeModel);
  const avg = getAverageForModel(activeModel);
  const model = evalData.models[activeModel];
  const hasData = model?.evalSessions > 0;

  return (
    <section className="border-b border-[#a0a0a01c] py-16">
      <Container>
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-white">
            Measured Quality Improvement
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            Same prompts. Same repos. Same model. Scored on a 0&ndash;3 weighted
            rubric
            {hasData
              ? ` across ${model?.evalSessions} eval sessions with Claude ${model?.label}.`
              : ". Run evals to see results."}
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          {/* Model tabs */}
          <div className="mb-8 flex items-center justify-center gap-1 rounded-lg bg-slate-800/50 p-1 sm:mx-auto sm:w-fit">
            {MODEL_TABS.map((tab) => {
              const tabModel = evalData.models[tab.key];
              const tabHasData = tabModel?.evalSessions > 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveModel(tab.key)}
                  className={`relative rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
                    activeModel === tab.key
                      ? "bg-violet-500/20 text-violet-300"
                      : "text-slate-400 hover:text-slate-300"
                  }`}
                >
                  {tab.label}
                  {!tabHasData && (
                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-slate-600" />
                  )}
                </button>
              );
            })}
          </div>

          {/* No data state */}
          {!hasData && (
            <div className="mb-8 rounded-lg border border-slate-700/50 bg-slate-800/30 py-8 text-center">
              <p className="text-slate-500">
                No eval data for {model?.label ?? activeModel} yet. Run:{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">
                  ./run-full-eval.sh --model {activeModel}
                </code>
              </p>
            </div>
          )}

          {/* Bar chart */}
          <div className="flex items-end justify-center gap-8 sm:gap-14">
            {skills.map((s) => (
              <BarGroup
                key={s.name}
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
          {hasData && (
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
                <div className="text-2xl font-bold text-emerald-400">
                  {avg.improvement}
                </div>
                <div className="text-sm text-slate-400">improvement</div>
              </div>
            </div>
          )}

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
