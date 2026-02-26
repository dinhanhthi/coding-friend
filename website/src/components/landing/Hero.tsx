import Image from "next/image";
import Container from "@/components/ui/Container";
import Button from "@/components/ui/Button";

export default function Hero() {
  return (
    <section className="from-navy-950 via-navy-900 to-navy-900 relative overflow-hidden bg-gradient-to-b py-24 sm:py-24">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/15 via-transparent to-transparent" />

      <Container className="relative">
        <div className="mx-auto max-w-3xl text-center">
          <Image
            src="/logo.svg"
            alt="Coding Friend"
            width={64}
            height={64}
            className="mx-auto mb-4"
            priority
          />
          <p className="mb-4 text-sm font-medium tracking-wide text-slate-400 uppercase">
            Claude Code Plugin
          </p>
          <h1 className="text-4xl leading-tight font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Disciplined Engineering{" "}
            <span className="text-violet-400">Workflows</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            A lean toolkit that enforces TDD, systematic debugging, smart
            commits, code review, and knowledge capture across your engineering
            workflow.
          </p>

          {/* Alpha notice */}
          <div className="mt-8 inline-flex items-center gap-3 rounded-full border border-yellow-400/20 bg-yellow-400/5 px-4 py-3 text-sm text-yellow-400">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              This project is in <strong className="font-semibold">alpha</strong>. Want to build together?{" "}
              <a
                href="https://github.com/dinhanhthi/coding-friend"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                Join us on GitHub
              </a>
              .
            </span>
          </div>

          {/* CTAs */}
          <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button
              href="/docs/getting-started/installation/"
              size="lg"
              className="w-full sm:w-auto"
            >
              Get Started
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Button>
            <Button
              href="https://github.com/dinhanhthi/coding-friend"
              variant="secondary"
              size="lg"
              external
              className="hover:bg-navy-800/50 w-full border-[#a0a0a05d] text-slate-300 sm:w-auto"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
