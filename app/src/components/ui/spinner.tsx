import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/** Rendered only once `useCfQuery` says the load is slow, so it fades in. */
function Spinner({ label, className }: { label: string; className?: string }) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex text-muted animate-in duration-300 fade-in",
        className,
      )}
    >
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { Spinner };
