import type { Tier } from "@/lib/token-data";

interface TokenBadgeProps {
  tier: Tier;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
  variant?: "default" | "ghost";
}

const tierLabel: Record<Tier, string> = {
  low: "Low context footprint — ~<1K tokens injected into prompt",
  medium: "Medium context footprint — ~1K–2.5K tokens injected into prompt",
  high: "High context footprint — ~>2.5K tokens injected into prompt",
};

const tierCount: Record<Tier, number> = { low: 1, medium: 2, high: 3 };

const sizeMap = {
  sm: { class: "px-1 py-0", icon: "h-3 w-3" },
  md: { class: "px-1.5 py-0.5", icon: "h-3.5 w-3.5" },
  lg: { class: "", icon: "h-4 w-4" },
} as const;

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
    </svg>
  );
}

export default function TokenBadge({
  tier,
  size = "md",
  showTooltip = true,
  className = "",
  variant = "default",
}: TokenBadgeProps) {
  const sizeConfig = sizeMap[size];

  const variantClasses =
    variant === "ghost"
      ? "text-slate-500 opacity-40 group-hover:text-slate-300 group-hover:opacity-100 transition-all duration-200"
      : "text-orange-400";

  return (
    <span
      className={`inline-flex items-center leading-tight ${variantClasses} ${sizeConfig.class} ${className}`}
      {...(showTooltip ? { title: tierLabel[tier] } : {})}
    >
      {Array.from({ length: tierCount[tier] }, (_, i) => (
        <ZapIcon key={i} className={sizeConfig.icon} />
      ))}
    </span>
  );
}
