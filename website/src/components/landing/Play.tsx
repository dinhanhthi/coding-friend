"use client";

import { useRef, type ReactNode } from "react";
import { useInView } from "./useInView";

/**
 * Plays its illustration once, the first time it scrolls into view (CSS keys off `.is-playing`).
 * Reduced motion is handled in CSS: the final frame shows at once.
 */
export default function Play({
  className,
  children,
  decorative = true,
}: {
  className: string;
  children: ReactNode;
  decorative?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div
      ref={ref}
      className={`${className} ${inView ? "is-playing" : ""}`}
      aria-hidden={decorative ? "true" : undefined}
    >
      {children}
    </div>
  );
}
