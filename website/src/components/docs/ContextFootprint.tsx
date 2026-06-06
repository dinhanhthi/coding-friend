import type { Tier } from "@/lib/token-data";
import { getTierDef } from "@/lib/token-data";
import TokenBadge from "@/components/ui/TokenBadge";
import MdxLink from "@/components/docs/MdxLink";

/**
 * Renders the "Context footprint: ⚡⚡ (medium) — what does this mean?" line at
 * the top of a skill/agent doc page. The tier is supplied by the page from
 * token-counts.json (single source of truth), so it can never drift from the
 * header badge or the generated counts.
 */
export default function ContextFootprint({ tier }: { tier: Tier }) {
  const label = getTierDef(tier).label.toLowerCase();
  return (
    <p>
      Context footprint:{" "}
      <TokenBadge tier={tier} size="sm" showTooltip={false} /> ({label}) —{" "}
      <MdxLink href="/docs/reference/context-usage/">
        what does this mean?
      </MdxLink>
    </p>
  );
}
