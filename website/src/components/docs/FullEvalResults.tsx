"use client";

import evalData from "@/data/eval-results.json";
import { useState } from "react";

type ModelKey = keyof typeof evalData.detailedResults;

const ALL_MODELS = Object.keys(evalData.detailedResults) as ModelKey[];
const MODEL_LABELS: Record<string, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

type DetailedSkill =
  (typeof evalData.detailedResults)[ModelKey][keyof (typeof evalData.detailedResults)[ModelKey]];

type RepoData = DetailedSkill["repos"][keyof DetailedSkill["repos"]];
type ConditionData = RepoData[keyof RepoData];

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatDelta(withCF: number, withoutCF: number): string {
  if (withoutCF <= 0) return "N/A";
  const pct = Math.round(((withCF - withoutCF) / withoutCF) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function deltaClass(withCF: number, withoutCF: number): string {
  if (withCF > withoutCF) return "text-emerald-400";
  if (withCF < withoutCF) return "text-red-400";
  return "text-slate-500";
}

function scoreBarWidth(score: number): string {
  return `${(score / 3) * 100}%`;
}

function scoreColor(score: number): string {
  if (score >= 2.5) return "bg-emerald-500";
  if (score >= 2.0) return "bg-yellow-500";
  if (score >= 1.0) return "bg-orange-500";
  return "bg-red-500";
}

function CriteriaRow({
  label,
  weight,
  withCF,
  withoutCF,
}: {
  label: string;
  weight: number;
  withCF: number;
  withoutCF: number;
}) {
  return (
    <tr className="border-b border-slate-700/50">
      <td className="py-2 pr-3 text-sm text-slate-300">
        {label}
        <span className="ml-1.5 text-xs text-slate-500">
          ({Math.round(weight * 100)}%)
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full ${scoreColor(withCF)}`}
              style={{ width: scoreBarWidth(withCF) }}
            />
          </div>
          <span className="w-10 text-right text-sm font-medium text-slate-300">
            {formatScore(withCF)}
          </span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full ${scoreColor(withoutCF)}`}
              style={{ width: scoreBarWidth(withoutCF) }}
            />
          </div>
          <span className="w-10 text-right text-sm font-medium text-slate-400">
            {formatScore(withoutCF)}
          </span>
        </div>
      </td>
      <td className="py-2 pl-3 text-right">
        <span
          className={`text-sm font-medium ${deltaClass(withCF, withoutCF)}`}
        >
          {formatDelta(withCF, withoutCF)}
        </span>
      </td>
    </tr>
  );
}

function RepoSection({
  repoName,
  data,
  criteria,
  repoCriteria,
}: {
  repoName: string;
  data: RepoData;
  criteria: DetailedSkill["criteria"];
  repoCriteria?: Record<
    string,
    Record<string, { weight: number; label: string }>
  > | null;
}) {
  const withCF = data.withCF as ConditionData | undefined;
  const withoutCF = data.withoutCF as ConditionData | undefined;

  if (!withCF && !withoutCF) return null;

  const avgWith = withCF?.avgScore ?? 0;
  const avgWithout = withoutCF?.avgScore ?? 0;
  const runs = withCF?.runCount ?? withoutCF?.runCount ?? 0;

  // Use per-repo criteria when available (e.g., bench-cli may have different
  // criteria than bench-webapp if certain criteria aren't tested in that repo)
  const effectiveCriteria = repoCriteria?.[repoName] ?? criteria;

  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h5 className="text-sm font-semibold text-slate-200">{repoName}</h5>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{runs} runs/condition</span>
          <span className={`font-medium ${deltaClass(avgWith, avgWithout)}`}>
            avg: {formatScore(avgWith)} vs {formatScore(avgWithout)} (
            {formatDelta(avgWith, avgWithout)})
          </span>
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-600/50">
            <th className="pb-2 text-left text-xs font-medium text-slate-400">
              Criterion
            </th>
            <th className="pb-2 text-left text-xs font-medium text-violet-400">
              With CF
            </th>
            <th className="pb-2 text-left text-xs font-medium text-slate-400">
              Without CF
            </th>
            <th className="pb-2 text-right text-xs font-medium text-slate-400">
              Delta
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(effectiveCriteria).map(([key, meta]) => (
            <CriteriaRow
              key={key}
              label={meta.label}
              weight={meta.weight}
              withCF={
                withCF?.criteria?.[key as keyof typeof withCF.criteria] ?? 0
              }
              withoutCF={
                withoutCF?.criteria?.[key as keyof typeof withoutCF.criteria] ??
                0
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkillCard({
  skillKey,
  skill,
}: {
  skillKey: string;
  skill: DetailedSkill;
}) {
  const [open, setOpen] = useState(false);

  const repos = Object.entries(skill.repos);
  const allWith = repos.map(([, r]) => (r as RepoData).withCF?.avgScore ?? 0);
  const allWithout = repos.map(
    ([, r]) => (r as RepoData).withoutCF?.avgScore ?? 0,
  );

  const avgWith =
    allWith.length > 0
      ? allWith.reduce((a, b) => a + b, 0) / allWith.length
      : 0;
  const avgWithout =
    allWithout.length > 0
      ? allWithout.reduce((a, b) => a + b, 0) / allWithout.length
      : 0;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full cursor-pointer items-center justify-between p-4 text-left transition-colors hover:bg-slate-800/30"
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex size-6 items-center justify-center rounded text-xs transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <div>
            <span className="font-mono text-sm font-semibold text-violet-400">
              {skillKey}
            </span>
            <span className="ml-2 text-sm text-slate-400">— {skill.label}</span>
            <span className="ml-2 rounded bg-slate-700/50 px-1.5 py-0.5 text-xs text-slate-500">
              Wave {skill.wave}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-sm font-medium text-violet-300">
              {formatScore(avgWith)}
            </span>
            <span className="mx-1 text-xs text-slate-600">vs</span>
            <span className="text-sm font-medium text-slate-400">
              {formatScore(avgWithout)}
            </span>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              avgWith > avgWithout
                ? "bg-emerald-500/10 text-emerald-400"
                : avgWith < avgWithout
                  ? "bg-red-500/10 text-red-400"
                  : "bg-slate-700/50 text-slate-500"
            }`}
          >
            {formatDelta(avgWith, avgWithout)}
          </span>
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-700/50 p-4">
          {repos.map(([repoName, repoData]) => (
            <RepoSection
              key={repoName}
              repoName={repoName}
              data={repoData as RepoData}
              criteria={skill.criteria}
              repoCriteria={
                (skill as Record<string, unknown>).repoCriteria as
                  | Record<
                      string,
                      Record<string, { weight: number; label: string }>
                    >
                  | undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FullEvalResults() {
  const [activeModel, setActiveModel] = useState<ModelKey>(ALL_MODELS[0]);
  const modelData = evalData.detailedResults[activeModel];
  const skills = Object.entries(modelData) as [string, DetailedSkill][];
  const modelMeta =
    evalData.models[activeModel as keyof typeof evalData.models];

  // Filter out wave 3 (security) — not included in public results
  const filteredSkills = skills.filter(([, skill]) => skill.wave !== 3);

  // Group by wave
  const byWave = filteredSkills.reduce(
    (acc, [key, skill]) => {
      const wave = skill.wave;
      if (!acc[wave]) acc[wave] = [];
      acc[wave].push([key, skill]);
      return acc;
    },
    {} as Record<number, [string, DetailedSkill][]>,
  );

  return (
    <div className="not-prose mt-8">
      {/* Model selector */}
      {ALL_MODELS.length > 1 && (
        <div className="mb-6 flex gap-2">
          {ALL_MODELS.map((m) => (
            <button
              key={m}
              onClick={() => setActiveModel(m)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeModel === m
                  ? "bg-violet-500/20 text-violet-400"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {MODEL_LABELS[m] ?? m}
            </button>
          ))}
        </div>
      )}

      {/* Summary bar */}
      {modelMeta && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3 text-sm text-slate-400">
          <span>
            Model:{" "}
            <span className="font-medium text-white">{modelMeta.label}</span>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Sessions:{" "}
            <span className="font-medium text-white">
              {modelMeta.evalSessions}
            </span>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Scale:{" "}
            <span className="font-medium text-white">
              {evalData.meta.rubricScale}
            </span>
          </span>
          <span className="text-slate-600">|</span>
          <span>
            Pass:{" "}
            <span className="font-medium text-white">
              {"\u2265"} {evalData.meta.passThreshold}
            </span>
          </span>
        </div>
      )}

      {/* Skills grouped by wave */}
      {Object.entries(byWave)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([wave, waveSkills]) => (
          <div key={wave} className="mb-8">
            {/* <h4 className="mb-3 text-lg font-semibold text-slate-200">
              Wave {wave}
            </h4> */}
            <div className="space-y-3">
              {waveSkills.map(([key, skill]) => (
                <SkillCard key={key} skillKey={key} skill={skill} />
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
