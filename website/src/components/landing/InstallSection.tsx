import Container from "@/components/ui/Container";
import CopyButton from "@/components/ui/CopyButton";

const installSteps = [
  {
    step: "1",
    title: "Install CLI",
    code: "npm i -g coding-friend-cli",
  },
  {
    step: "2",
    title: "Install Plugin (in Claude Code)",
    code: `/plugin marketplace add dinhanhthi/coding-friend
/plugin install coding-friend@coding-friend-marketplace`,
  },
  {
    step: "3",
    title: "Initialize Workspace",
    code: "cf init",
  },
];

export default function InstallSection() {
  return (
    <section className="py-20">
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">
            Get Started in 3 Steps
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Install once, use in every project.
          </p>
        </div>

        <div className="mx-auto max-w-2xl space-y-6">
          {installSteps.map((s) => (
            <div
              key={s.step}
              className="overflow-hidden rounded-xl border border-[#a0a0a01c]"
            >
              <div className="bg-navy-950/50 flex items-center justify-between border-b border-[#a0a0a01c] px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">
                    {s.step}
                  </span>
                  <span className="text-sm font-medium text-white">
                    {s.title}
                  </span>
                </div>
                <CopyButton text={s.code} />
              </div>
              <pre className="bg-navy-950 overflow-x-auto font-mono text-sm leading-relaxed text-slate-300">
                <code className="hljs rounded-none!">{s.code}</code>
              </pre>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
