const betaStyle =
  "bg-orange-900/30 text-orange-400 border border-orange-500/50";
const temporalStyles = {
  new: "bg-emerald-900/30 text-emerald-400 border border-emerald-500/50",
  updated: "bg-sky-900/30 text-sky-400 border border-sky-500/50",
};

interface StatusBadgeProps {
  beta?: boolean;
  temporal?: "new" | "updated" | null;
}

export default function StatusBadge({ beta, temporal }: StatusBadgeProps) {
  if (!beta && !temporal) return null;
  return (
    <span className="flex items-center gap-1">
      {beta && (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${betaStyle}`}
        >
          beta
        </span>
      )}
      {temporal && (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${temporalStyles[temporal]}`}
        >
          {temporal}
        </span>
      )}
    </span>
  );
}
