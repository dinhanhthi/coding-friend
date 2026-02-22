interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "new" | "improved" | "fixed" | "removed" | "security";
  className?: string;
}

const variants = {
  default: "bg-slate-700/30 text-slate-300",
  new: "bg-emerald-900/30 text-emerald-400",
  improved: "bg-blue-900/30 text-blue-400",
  fixed: "bg-amber-900/30 text-amber-400",
  removed: "bg-red-900/30 text-red-400",
  security: "bg-purple-900/30 text-purple-400",
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
