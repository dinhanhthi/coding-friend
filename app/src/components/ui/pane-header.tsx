import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The bar on top of the pane: title (and subtitle) on the left, optional controls (tabs,
 * segmented control, select), actions on the right. It is also a window drag region: "deep"
 * lets a press on any non-interactive child drag the window, while Tauri's drag script
 * skips buttons, inputs, selects, links and tab/radio roles.
 */
export function PaneHeader({
  title,
  titleId,
  subtitle,
  subtitleMono = false,
  controls,
  actions,
}: {
  title: ReactNode;
  titleId?: string;
  subtitle?: string;
  subtitleMono?: boolean;
  controls?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      data-tauri-drag-region="deep"
      className="flex h-11 shrink-0 items-center gap-3 border-b border-rule px-4"
    >
      <div className="flex min-w-0 shrink items-baseline gap-2 overflow-hidden">
        <h2
          id={titleId}
          className="max-w-[min(100%,16rem)] shrink-0 truncate text-[13px] font-semibold"
        >
          {title}
        </h2>
        {subtitle && (
          <span
            className={cn(
              // The title is shrink-0 (capped by its max-w), so only the subtitle shrinks.
              "min-w-0 truncate text-xs text-muted",
              subtitleMono && "font-mono",
            )}
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
      </div>
      {controls && (
        <div className="flex shrink-0 items-center gap-2">{controls}</div>
      )}
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
        </div>
      )}
    </header>
  );
}
