"use client";

import Container from "@/components/ui/Container";
import CopyButton from "@/components/ui/CopyButton";
import Link from "next/link";
import { useState } from "react";

const MANAGERS = [
  { id: "npm", label: "npm", install: "npm i -g" },
  { id: "yarn", label: "yarn", install: "yarn global add" },
  { id: "pnpm", label: "pnpm", install: "pnpm add -g" },
] as const;

const HOSTS = [
  { id: "claude", label: "Claude", suffix: "" },
  { id: "codex", label: "Codex", suffix: " --agent codex" },
] as const;

type ManagerId = (typeof MANAGERS)[number]["id"];
type HostId = (typeof HOSTS)[number]["id"];

const PKG = "coding-friend-cli";

export default function InstallSection() {
  const [active, setActive] = useState<ManagerId>("npm");
  const [hostId, setHostId] = useState<HostId>("claude");
  const manager = MANAGERS.find((m) => m.id === active)!;
  const host = HOSTS.find((h) => h.id === hostId)!;
  const installCmd = `${manager.install} ${PKG}`;
  const hostSteps = [
    {
      step: "2",
      title: `Install Plugin for ${host.label}`,
      code: `cf install${host.suffix}`,
    },
    {
      step: "3",
      title: "Initialize Workspace",
      code: `cf init${host.suffix}`,
    },
    {
      step: "4",
      title: "Update to the latest version",
      code: `cf update${host.suffix}`,
    },
  ];

  return (
    <section id="install" className="py-10 md:py-16 lg:py-20">
      <Container>
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold tracking-[-0.02em] text-balance text-white">
            Get started in 4 steps
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-400">
            Install once, use in every project. More details in the{" "}
            <Link
              href="/docs/getting-started/installation/"
              className="text-violet-400 hover:underline hover:underline-offset-4"
            >
              documentation
            </Link>
            .
          </p>
        </div>

        <div className="mx-auto max-w-2xl space-y-6">
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

          <div className="flex justify-center">
            <div className="bg-navy-950 inline-flex rounded-lg border border-[#a0a0a01c] p-1">
              {HOSTS.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setHostId(h.id)}
                  className={`cursor-pointer rounded-md px-4 py-2 text-base font-medium transition-colors ${
                    hostId === h.id
                      ? "bg-violet-500 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {hostSteps.map((s) => (
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
        </div>
      </Container>
    </section>
  );
}
