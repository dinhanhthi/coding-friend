import Container from "@/components/ui/Container";

const stats = [
  { value: "15", label: "Skills" },
  { value: "5", label: "Agents" },
  { value: "7", label: "Hooks" },
  { value: "15+", label: "Commands" },
];

export default function StatsSection() {
  return (
    <section className="bg-navy-950/50 border-b border-[#a0a0a01c]">
      <Container className="py-8">
        <div className="flex flex-row items-center justify-between gap-8 px-4 text-center sm:gap-16 md:justify-center md:gap-24 lg:gap-32">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-4xl font-bold text-violet-400">
                {stat.value}
              </div>
              <div className="mt-1 text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
