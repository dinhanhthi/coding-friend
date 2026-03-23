import Container from "@/components/ui/Container";
import Link from "next/link";

const skills = [
  {
    name: "cf-fix",
    label: "Bug Fix",
    withCF: 3.0,
    withoutCF: 1.9,
    delta: "+58%",
  },
  {
    name: "cf-review",
    label: "Code Review",
    withCF: 3.0,
    withoutCF: 2.53,
    delta: "+19%",
  },
  { name: "cf-tdd", label: "TDD", withCF: 2.6, withoutCF: 1.73, delta: "+50%" },
];

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

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Delta badge */}
      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-sm font-medium text-emerald-400">
        {delta}
      </span>

      {/* Bars */}
      <div className="flex items-end gap-2">
        {/* Without CF */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-medium text-slate-400">
            {withoutCF.toFixed(1)}
          </span>
          <div
            className="w-10 rounded-t-md bg-slate-700 transition-all duration-700 sm:w-14"
            style={{ height: withoutH }}
          />
        </div>

        {/* With CF */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-medium text-violet-300">
            {withCF.toFixed(1)}
          </span>
          <div
            className="w-10 rounded-t-md bg-violet-500 transition-all duration-700 sm:w-14"
            style={{ height: withH }}
          />
        </div>
      </div>

      {/* Label */}
      <span className="text-sm font-medium text-slate-300">{label}</span>
    </div>
  );
}

export default function ComparisonSection() {
  return (
    <section className="border-b border-[#a0a0a01c] py-16">
      <Container>
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold text-white">
            Measured Quality Improvement
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            Same prompts. Same repos. Same model. Scored on a 0&ndash;3 weighted
            rubric across 22 eval sessions with Claude Opus 4.6.
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
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
          <div className="mx-auto mt-8 flex w-fit flex-wrap items-center justify-center gap-10 rounded-xl border border-violet-500/20 bg-violet-500/5 py-4 px-6">
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
