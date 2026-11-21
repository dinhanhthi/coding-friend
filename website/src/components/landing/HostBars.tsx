import type { Host } from "@/lib/landing";
import Play from "./Play";

/** Supported hosts with their share of Coding Friend features, read from the docs' table. */
export default function HostBars({ hosts }: { hosts: Host[] }) {
  return (
    <Play className="hosts" decorative={false}>
      {hosts.map((host, index) => (
        <div
          className="host"
          key={host.name}
          style={
            { "--v": host.support / 100, "--i": index } as React.CSSProperties
          }
        >
          <a
            className="host__name"
            href={host.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {host.name}
          </a>
          <span className="host__bar" aria-hidden="true">
            <i />
          </span>
          <span className="host__value">{host.support}%</span>
          <code className="host__cmd">{host.command}</code>
        </div>
      ))}
    </Play>
  );
}
