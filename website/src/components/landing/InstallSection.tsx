"use client";

import { useState } from "react";
import Container from "@/components/ui/Container";
import CopyButton from "@/components/ui/CopyButton";

const MANAGERS = [
  { id: "npm", label: "npm", install: "npm i -g" },
  { id: "yarn", label: "yarn", install: "yarn global add" },
  { id: "pnpm", label: "pnpm", install: "pnpm add -g" },
] as const;

type ManagerId = (typeof MANAGERS)[number]["id"];

const PKG = "coding-friend-cli";

const fixedSteps = [
  { step: "2", title: "Install Plugin", code: "cf install" },
  { step: "3", title: "Initialize Workspace", code: "cf init" },
];

export default function InstallSection() {
  const [active, setActive] = useState<ManagerId>("npm");
  const manager = MANAGERS.find((m) => m.id === active)!;
  const installCmd = `${manager.install} ${PKG}`;

  return (
    <section id="install" className="py-20">
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">
            Get Started in 3 Steps
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Install once, use in every project. Supports user, project, and
            local scopes.
          </p>
        </div>

        <div className="mx-auto max-w-2xl space-y-6">
          {/* Step 1 — Install CLI with package manager tabs */}
          <div className="overflow-hidden rounded-xl border border-[#a0a0a01c]">
            <div className="bg-navy-950/50 flex items-center justify-between border-b border-[#a0a0a01c] px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500 text-xs font-bold text-white">
                  1
                </span>
                <span className="text-sm font-medium text-white">
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
                  className={`cursor-pointer px-4 py-2 text-sm font-medium transition-colors ${
                    active === m.id
                      ? "border-b-2 border-violet-400 text-violet-400"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <pre className="bg-navy-950 overflow-x-auto font-mono text-sm leading-relaxed text-slate-300">
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
