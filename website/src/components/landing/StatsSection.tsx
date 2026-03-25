import Container from "@/components/ui/Container";
import evalData from "@/data/eval-results.json";

function getBestBugFixDelta(): string {
  let best = 0;
  for (const model of Object.values(evalData.models)) {
    const fix = model.skills["cf-fix" as keyof typeof model.skills];
    if (!fix || fix.withoutCF <= 0) continue;
    const pct = Math.round(
      ((fix.withCF - fix.withoutCF) / fix.withoutCF) * 100,
    );
    if (pct > best) best = pct;
  }
  return best > 0 ? `+${best}%` : "N/A";
}

const stats = [
  { value: evalData.stats.skillCount, label: "Skills & Commands" },
  { value: evalData.stats.agentCount, label: "Specialized Agents" },
  { value: getBestBugFixDelta(), label: "Bug Fix Quality" },
];

export default function StatsSection() {
  return (
    <section className="border-b border-[#a0a0a01c]">
      <Container className="py-8">
        <div className="flex flex-row items-center justify-between gap-8 px-4 text-center sm:gap-16 md:justify-center md:gap-24 lg:gap-32">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-bold text-violet-400 sm:text-4xl">
                {stat.value}
              </div>
              <div className="mt-1 text-sm text-slate-400 sm:text-base">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
