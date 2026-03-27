import Container from "@/components/ui/Container";
const stats = [
  { value: "19+", label: "Skills & Commands" },
  { value: "6", label: "Specialized Agents" },
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
