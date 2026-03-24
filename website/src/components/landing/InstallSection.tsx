"use client";

import Container from "@/components/ui/Container";
import CopyButton from "@/components/ui/CopyButton";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const MANAGERS = [
  { id: "npm", label: "npm", install: "npm i -g" },
  { id: "yarn", label: "yarn", install: "yarn global add" },
  { id: "pnpm", label: "pnpm", install: "pnpm add -g" },
] as const;

type ManagerId = (typeof MANAGERS)[number]["id"];
type InstallMethod = "prompt" | "manual";

const PKG = "coding-friend-cli";

const fixedSteps = [
  { step: "2", title: "Install Plugin", code: "cf install" },
  { step: "3", title: "Initialize Workspace", code: "cf init" },
];

const METHOD_TABS = [
  { key: "prompt", label: "One-Prompt Install" },
  { key: "manual", label: "Manual (3 steps)" },
] as const;

const INSTALL_PROMPT = `Install the "coding-friend-cli" npm package globally and set up the Coding Friend plugin for Claude Code. Follow these steps in order, checking each one before moving to the next:

1. Check that Node.js >= 20 is installed (run: "node -v"). If not, stop and tell me to install Node.js 20+ first.
2. Install the CLI globally (run: "npm i -g coding-friend-cli").
3. Verify it works (run: "cf --version"). Show me the version.
4. Install the plugin (run: "cf install --user").
5. Initialize the workspace in the current project (run: "cf init"). When cf init asks questions, explain each option to me and let me choose.
6. Show a short summary of what was installed and remind me to restart Claude Code to load the plugin.`;

export default function InstallSection() {
  const [method, setMethod] = useState<InstallMethod>("prompt");
  const [active, setActive] = useState<ManagerId>("npm");
  const manager = MANAGERS.find((m) => m.id === active)!;
  const installCmd = `${manager.install} ${PKG}`;

  const tabRefs = useRef<Record<InstallMethod, HTMLButtonElement | null>>({
    prompt: null,
    manual: null,
  });
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const btn = tabRefs.current[method];
    if (btn) {
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [method]);

  useEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  return (
    <section id="install" className="py-10 md:py-16 lg:py-20">
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-[-0.02em] text-balance text-white">
            Get started
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Install once, use in every project. Supports user, project, and
            local scopes. More details in the{" "}
            <Link
              href="/docs/getting-started/installation/"
              className="text-violet-400 hover:underline hover:underline-offset-4"
            >
              documentation
            </Link>
            .
          </p>
        </div>

        {/* Method toggle */}
        <div className="mx-auto mb-8 flex max-w-2xl justify-center">
          <div className="bg-navy-950/50 relative inline-flex rounded-full border border-[#a0a0a01c] p-1">
            <div
              className="bg-navy-800 absolute top-1 bottom-1 rounded-full shadow-sm transition-all duration-300 ease-in-out"
              style={{ left: indicator.left, width: indicator.width }}
            />
            {METHOD_TABS.map((tab) => (
              <button
                key={tab.key}
                ref={(el) => {
                  tabRefs.current[tab.key] = el;
                }}
                onClick={() => setMethod(tab.key)}
                className={`relative z-10 cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition-colors duration-200 ${
                  method === tab.key
                    ? "text-violet-400"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-2xl space-y-6">
          {method === "prompt" ? (
            <>
              {/* Prompt install */}
              <p className="text-center text-sm text-slate-400">
                Paste this into Claude Code and it will guide you through the
                entire setup.
              </p>
              <div className="overflow-hidden rounded-xl border border-[#a0a0a01c]">
                <div className="bg-navy-950/50 flex items-center justify-between border-b border-[#a0a0a01c] px-5 py-3">
                  <span className="text-base font-medium text-white">
                    Copy & paste into Claude Code
                  </span>
                  <CopyButton text={INSTALL_PROMPT} />
                </div>
                <pre className="bg-navy-950 overflow-x-auto font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-300">
                  <code className="hljs rounded-none!">{INSTALL_PROMPT}</code>
                </pre>
              </div>
              <p className="text-center text-sm text-slate-500">
                After the install, restart Claude Code to load the plugin.
              </p>
            </>
          ) : (
            <>
              {/* Step 1 — Install CLI with package manager tabs */}
              <div className="overflow-hidden rounded-xl border border-[#a0a0a01c]">
                <div className="bg-navy-950/50 flex items-center justify-between border-b border-[#a0a0a01c] px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">
                      1
                    </span>
                    <span className="text-base font-medium text-white">
                      Install CLI
                    </span>
                  </div>
                  <CopyButton text={installCmd} />
                </div>
                <div className="bg-navy-950 flex border-b border-[#a0a0a01c]">
                  {MANAGERS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setActive(m.id)}
                      className={`cursor-pointer px-4 py-2 text-base font-medium transition-colors ${
                        active === m.id
                          ? "border-b-2 border-violet-400 text-violet-400"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <pre className="bg-navy-950 overflow-x-auto font-mono text-base leading-relaxed text-slate-300">
                  <code className="hljs rounded-none!">{installCmd}</code>
                </pre>
              </div>

              {/* Steps 2 & 3 — fixed commands */}
              {fixedSteps.map((s) => (
                <div
                  key={s.step}
                  className="overflow-hidden rounded-xl border border-[#a0a0a01c]"
                >
                  <div className="bg-navy-950/50 flex items-center justify-between border-b border-[#a0a0a01c] px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">
                        {s.step}
                      </span>
                      <span className="text-base font-medium text-white">
                        {s.title}
                      </span>
                    </div>
                    <CopyButton text={s.code} />
                  </div>
                  <pre className="bg-navy-950 overflow-x-auto font-mono text-base leading-relaxed text-slate-300">
                    <code className="hljs rounded-none!">{s.code}</code>
                  </pre>
                </div>
              ))}
            </>
          )}
        </div>
      </Container>
    </section>
  );
}
