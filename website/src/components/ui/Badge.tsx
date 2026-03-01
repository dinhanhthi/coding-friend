interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "new" | "improved" | "fixed" | "removed" | "security";
  className?: string;
}

const variants = {
  default: "bg-slate-700/30 text-slate-300 border border-slate-500/50",
  new: "bg-yellow-900/30 text-yellow-400 border border-yellow-500/50",
  improved: "bg-blue-900/30 text-blue-300 border border-blue-500/50",
  fixed: "bg-amber-900/30 text-amber-400 border border-amber-500/50",
  removed: "bg-red-900/30 text-red-400 border border-red-500/50",
  security: "bg-purple-900/30 text-purple-200 border border-purple-500/50",
};

export default function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
