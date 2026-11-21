import type { Metadata } from "next";
import type { ReactNode } from "react";
import TableOfContents from "@/components/TableOfContents";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Coding Friend stores, when it goes online, and how it keeps secrets out of your agent's reads.",
  alternates: { canonical: "/privacy/" },
};

const LAST_UPDATED = "November 20, 2026";

type Section = { id: string; title: string; body: ReactNode };

const SECTIONS: Section[] = [
  {
    id: "short-version",
    title: "The short version",
    body: (
      <ul className="check-list">
        <li>No account, no sign-up, no server of ours in between.</li>
        <li>
          No analytics, telemetry or crash reports in the plugin, the CLI or the
          app.
        </li>
        <li>
          What Coding Friend writes stays on your computer, mostly in your
          project and in <code>~/.coding-friend/</code>.
        </li>
        <li>
          Anything that can send your text to an outside service is off until
          you turn it on.
        </li>
      </ul>
    ),
  },
  {
    id: "your-agent",
    title: "Your agent is separate",
    body: (
      <p>
        Coding Friend runs inside Claude Code, Codex, Antigravity, Devin and
        other hosts. Those tools send your prompts and code to their own model
        provider, under their own privacy policy. Coding Friend does not change
        that, and it has no server of its own.
      </p>
    ),
  },
  {
    id: "stored-locally",
    title: "What stays on your computer",
    body: (
      <>
        <ul>
          <li>
            <strong>In your project:</strong> <code>docs/</code> (or your{" "}
            <code>docsDir</code>) holds plans, memory, research, reviews,
            checkpoints and deferred tasks. Commit them or not, your choice.
          </li>
          <li>
            <strong>
              In <code>~/.coding-friend/</code>:
            </strong>{" "}
            your global config, learn notes, the project list, saved sessions,
            the Claude quota snapshot from the statusline, task state, and a
            cache of the last update check.
          </li>
          <li>
            <strong>Memory index:</strong> a SQLite database per project under{" "}
            <code>~/.coding-friend/memory/</code>. The markdown in{" "}
            <code>docs/memory/</code> stays the source of truth. The memory
            daemon talks over a Unix socket in that folder, not a network port.
          </li>
          <li>
            <strong>Temporary files:</strong> hooks keep small session and task
            trackers in <code>/tmp</code>, and <code>/cf-review</code> writes
            its diff snapshot there.
          </li>
          <li>
            <strong>Desktop app:</strong> keeps its settings, such as the path
            of your <code>cf</code> binary, in <code>settings.json</code> under{" "}
            <code>~/Library/Application Support/</code>.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "network",
    title: "When Coding Friend goes online",
    body: (
      <>
        <ul>
          <li>
            <strong>CLI update check:</strong> at most once a day, the CLI asks
            npm for the latest <code>coding-friend-cli</code> version and
            updates a global install. Turn it off with{" "}
            <code>CF_NO_UPDATE_CHECK=1</code>.
          </li>
          <li>
            <strong>Plugin updates:</strong> <code>cf install</code>,{" "}
            <code>cf update</code> and <code>cf status</code> read releases from
            GitHub, and install through your host&apos;s own plugin command or a
            git clone.
          </li>
          <li>
            <strong>Packages on demand:</strong> <code>cf memory init</code>,{" "}
            <code>cf learn host</code> and <code>cf mcp</code> install their
            dependencies from npm the first time.
          </li>
          <li>
            <strong>Embedding model:</strong> with the default memory
            embeddings, a small model is downloaded from Hugging Face on first
            use. Embedding itself runs on your computer. With Ollama, text goes
            to your Ollama server, <code>localhost</code> unless you point it
            elsewhere.
          </li>
          <li>
            <strong>Desktop app:</strong> checks a signed update feed on GitHub
            a minute after launch and every six hours, and installs only after
            you agree.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "opt-in",
    title: "Opt-in features that share data",
    body: (
      <ul>
        <li>
          <strong>Decision model</strong> (<code>cf decide</code>, the review
          shadow check, <code>cf session export --summary</code>): off by
          default. A remote provider (Typesafe or Cloudflare) also needs{" "}
          <code>decision.allowRemote: true</code> in your global config. Review
          text is redacted first, and security findings are never sent.
        </li>
        <li>
          <strong>Session folder:</strong> <code>cf session save</code> copies a
          transcript verbatim, secrets included. If you point{" "}
          <code>session.dir</code> at iCloud Drive, Dropbox or another cloud
          folder, that provider stores it. Share sessions with{" "}
          <code>cf session export</code>, which redacts.
        </li>
        <li>
          <strong>Learn site:</strong> <code>cf learn host</code> serves your
          notes (on port 3333 by default) without limiting it to{" "}
          <code>localhost</code>, so other devices on your network may reach it.
          Its pages load fonts from Google.
        </li>
      </ul>
    ),
  },
  {
    id: "guards",
    title: "Guards for secrets",
    body: (
      <>
        <ul>
          <li>
            <strong>privacy-block</strong> stops the agent&apos;s file tools
            from reading or writing <code>.env</code> files, keys, certificates
            and anything under <code>.ssh/</code>, <code>.aws/</code> or{" "}
            <code>.gnupg/</code>. Example files such as{" "}
            <code>.env.example</code> stay readable.
          </li>
          <li>
            <strong>scout-block</strong> keeps the agent out of build and
            dependency folders, and out of anything you list in{" "}
            <code>.coding-friend/ignore</code>.
          </li>
          <li>
            <strong>Commits:</strong> <code>/cf-commit</code> and{" "}
            <code>/cf-review --commit</code> scan the staged diff for words like
            token, password and secret, and stop on a real secret.
          </li>
          <li>
            <strong>Session export</strong> redacts API keys, tokens, private
            keys and passwords, and replaces your home folder with{" "}
            <code>~</code>.
          </li>
        </ul>
        <p className="notice">
          These are guards, not guarantees. In Claude Code, privacy-block checks
          the file tools, not shell commands such as <code>cat .env</code>. The
          commit scan looks for keywords, not every kind of secret.
        </p>
      </>
    ),
  },
  {
    id: "this-website",
    title: "This website",
    body: (
      <p>
        No cookies and no analytics. Fonts are served from this site. Your
        browser remembers only your light or dark theme. The intro video on the
        home page is a privacy-enhanced YouTube embed (youtube-nocookie.com)
        that loads lazily, as you scroll near it. GitHub Pages hosts the site
        and may keep standard server logs.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Questions",
    body: (
      <p>
        Ask on{" "}
        <a
          href="https://github.com/Coprimal/coding-friend/discussions"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub Discussions
        </a>
        , or read the code: everything above is in the{" "}
        <a
          href="https://github.com/Coprimal/coding-friend"
          target="_blank"
          rel="noopener noreferrer"
        >
          repository
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="doc-page shell">
      <TableOfContents
        items={SECTIONS.map(({ id, title }) => ({ id, text: title, level: 2 }))}
      />
      <div className="doc-page__body">
        <header className="doc-page__head">
          <h1>Privacy</h1>
          <p>
            Coding Friend keeps your work on your computer. Here is exactly what
            it stores, and when it goes online.
          </p>
          <p className="doc-page__meta">Last updated {LAST_UPDATED}</p>
        </header>
        <article className="prose max-w-none">
          {SECTIONS.map(({ id, title, body }) => (
            <section key={id}>
              <h2 id={id}>{title}</h2>
              {body}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
