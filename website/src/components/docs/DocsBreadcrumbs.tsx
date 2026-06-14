"use client";

import Link from "next/link";
import { useAgent, withAgentPrefix } from "@/components/docs/AgentContext";

interface Props {
  items: { label: string; href?: string }[];
}

export default function DocsBreadcrumbs({ items }: Props) {
  const { agent } = useAgent();
  return (
    <nav className="mb-6 flex items-center gap-1.5 text-base text-slate-400">
      <Link href="/docs/" className="transition-colors hover:text-violet-400">
        Docs
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          {item.href ? (
            <Link
              href={item.href}
              className="transition-colors hover:text-violet-400"
            >
              {withAgentPrefix(item.label, agent)}
            </Link>
          ) : (
            <span className="font-medium text-white">
              {withAgentPrefix(item.label, agent)}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
