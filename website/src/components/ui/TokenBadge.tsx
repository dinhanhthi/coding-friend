import type { Tier } from "@/lib/token-data";

interface TokenBadgeProps {
  tier: Tier;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
  variant?: "default" | "ghost";
}

const tierName: Record<Tier, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const tierDesc: Record<Tier, string> = {
  low: "<1K tokens injected into prompt",
  medium: "~1K–2.5K tokens injected into prompt",
  high: ">2.5K tokens injected into prompt",
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
      className={`group/tip relative inline-flex items-center leading-tight ${variantClasses} ${sizeConfig.class} ${className}`}
      aria-label={`${tierName[tier]} context: ${tierDesc[tier]}`}
    >
      {Array.from({ length: tierCount[tier] }, (_, i) => (
        <ZapIcon key={i} className={sizeConfig.icon} />
      ))}
      {showTooltip && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max -translate-x-1/2 rounded-lg border border-[#a0a0a01c] bg-slate-900 px-3 py-2 text-center text-sm leading-relaxed opacity-0 shadow-xl transition-opacity duration-200 group-hover/tip:opacity-100">
          <span className="font-semibold text-orange-400">
            {tierName[tier]}
          </span>
          <span className="mt-0.5 block text-xs text-slate-400">
            {tierDesc[tier]}
          </span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </span>
      )}
    </span>
  );
}
