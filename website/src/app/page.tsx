import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import LatestChanges from "@/components/LatestChanges";
import HostBars from "@/components/landing/HostBars";
import InstallTabs from "@/components/landing/InstallTabs";
import LegacyHashRedirect from "@/components/landing/LegacyHashRedirect";
import LoopTrack from "@/components/landing/LoopTrack";
import {
  CheckpointScene,
  FixScene,
  GuardScene,
  GuideScene,
  MemoryScene,
  PlanScene,
  ReviewScene,
  StatuslineScene,
} from "@/components/landing/Scenes";
import SessionDemo from "@/components/landing/SessionDemo";
import { getRecentChanges } from "@/lib/changelog";
import { extractInstallPrompt, parseHosts } from "@/lib/landing";
import { readIndexMd } from "@/lib/mdx";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The drawing explains; the caption is one line.
type Feature = {
  title: string;
  caption: ReactNode;
  docs: string;
  Scene: () => ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Plans you can track and resume",
    caption: (
      <>
        Phases tick off in <code>docs/plans/</code>. Stopped halfway?{" "}
        <code>/cf-plan-resume</code> picks up the rest.
      </>
    ),
    docs: "/docs/#plan--build",
    Scene: PlanScene,
  },
  {
    title: "Reviews that loop until clean",
    caption: (
      <>
        <code>--fix</code> applies Critical and Important findings, then reviews
        again.
      </>
    ),
    docs: "/docs/#review--ship",
    Scene: ReviewScene,
  },
  {
    title: "Checkpoints you carry to a new chat",
    caption: (
      <>
        Auto-compact squeezes the chat. A checkpoint saves goal, decisions and
        next steps to a file.
      </>
    ),
    docs: "/docs/#context--session",
    Scene: CheckpointScene,
  },
  {
    title: "Security in layers",
    caption: (
      <>
        Secrets blocked, build folders skipped, fetched text kept as data,
        commits scanned.
      </>
    ),
    docs: "/docs/#security",
    Scene: GuardScene,
  },
  {
    title: "Custom guides when you need them",
    caption: (
      <>
        Add your own Before, Rules and After to any skill, without touching the
        plugin.
      </>
    ),
    docs: "/docs/#custom-guides",
    Scene: GuideScene,
  },
  {
    title: "A status line that shows where you stand",
    caption: (
      <>Model, branch, context and limits under the prompt. Claude Code only.</>
    ),
    docs: "/docs/#statusline",
    Scene: StatuslineScene,
  },
  {
    title: "Bugs fixed at the root",
    caption: (
      <>
        <code>/cf-fix</code> reproduces, finds the cause and proves the fix.
      </>
    ),
    docs: "/docs/#fix--debug",
    Scene: FixScene,
  },
  {
    title: "Memory that outlasts the session",
    caption: (
      <>
        Markdown in <code>docs/memory/</code>, searched with fallbacks, shared
        over MCP.
      </>
    ),
    docs: "/docs/#memory",
    Scene: MemoryScene,
  },
];

const KIT = [
  ["/cf-ask", "ask the codebase", "knowledge"],
  ["/cf-advise", "get a verdict", "plan--build"],
  ["/cf-research", "research the web", "knowledge"],
  ["/cf-learn", "notes you can host", "knowledge"],
  ["/cf-warm", "catch up on git", "context--session"],
  ["/cf-later", "park a side task", "context--session"],
  ["/cf-design", "match your UI", "plan--build"],
  ["/cf-showcase", "video or poster", "plan--build"],
  ["/cf-optimize", "measure, then speed up", "plan--build"],
  ["/cf-session", "move a session", "context--session"],
  ["/cf-teach", "the story of a task", "knowledge"],
  ["/cf-help", "ask about Coding Friend", "help"],
] as const;

export default function Home() {
  const source = readIndexMd();
  const hosts = parseHosts(source);
  const prompt = extractInstallPrompt(source);
  const recentChanges = getRecentChanges();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "https://cf.coprimal.dev",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: {
      "@type": "Organization",
      name: "Coprimal",
      url: "https://coprimal.dev",
    },
  };

  return (
    <main className="landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LegacyHashRedirect />

      <section className="hero shell" aria-labelledby="hero-title">
        <div className="hero__copy">
          <h1 id="hero-title">Your AI agent, with an engineer&apos;s habits</h1>
          <p className="hero__lead">
            Skills, agents and hooks for Claude Code, Codex and more. Every task
            is planned, reviewed and remembered.
          </p>
          <div className="hero__actions">
            <Link className="button button--primary" href="#get-started">
              Get started
            </Link>
            <Link className="button button--secondary" href="/docs/">
              Read the docs
            </Link>
          </div>
          <p className="hero__note">Free and open source, MIT licensed.</p>
        </div>
        <SessionDemo />
      </section>

      <section className="band shell" aria-labelledby="loop-title">
        <h2 id="loop-title" className="band__title">
          One loop for every task
        </h2>
        <LoopTrack />
      </section>

      <section
        className="band shell"
        id="what-it-does"
        aria-labelledby="features-title"
      >
        <h2 id="features-title" className="band__title">
          What changes when it&apos;s installed
        </h2>
        <div className="features">
          {FEATURES.map(({ title, caption, docs, Scene }) => (
            <article className="feature" key={title}>
              <Scene />
              <h3>
                <Link href={docs}>{title}</Link>
              </h3>
              <p>{caption}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="band shell" aria-labelledby="hosts-title">
        <h2 id="hosts-title" className="band__title">
          Works where you already code
        </h2>
        <HostBars hosts={hosts} />
        <p className="band__foot">
          <Link href="/docs/#supported-tools">How support is counted</Link>
        </p>
      </section>

      <section className="band shell" aria-labelledby="kit-title">
        <h2 id="kit-title" className="band__title">
          And the rest of the kit
        </h2>
        <ul className="kit">
          {KIT.map(([name, text, anchor]) => (
            <li key={name}>
              <Link href={`/docs/#${anchor}`}>
                <code>{name}</code>
                <span>{text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="band shell get-started"
        id="get-started"
        aria-labelledby="start-title"
      >
        <div className="get-started__copy">
          <h2 id="start-title">Get started in a minute</h2>
          <p>
            Let your agent set it up, or run it yourself. Then ask{" "}
            <code>/cf-help</code> anything.
          </p>
          <p className="get-started__links">
            <Link href="/docs/#install">Install guide</Link>
            <Link href="/docs/#config">Config</Link>
          </p>
        </div>
        <InstallTabs prompt={prompt} />
      </section>

      <section className="band shell media" aria-labelledby="news-title">
        <h2 id="news-title" className="sr-only">
          Intro video and latest changes
        </h2>
        <div className="intro-video">
          <iframe
            src="https://www.youtube-nocookie.com/embed/VZEeMELigAs"
            title="Coding Friend intro video"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <LatestChanges entries={recentChanges} />
      </section>
    </main>
  );
}
