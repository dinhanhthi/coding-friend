"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const emptySubscribe = () => () => {};
/** true on the client after hydration, false during SSR — portal-safe. */
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

function ZoomIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0zM10.5 7.5v6m-3-3h6"
      />
    </svg>
  );
}

/**
 * MDX `img` renderer: the image plus a zoom button (top-right) that opens
 * a larger view in a modal. The dialog is portaled to <body> because a
 * markdown image usually lives inside a <p>, where <dialog> is invalid.
 */
export default function ZoomableImage(props: React.ComponentProps<"img">) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const mounted = useMounted();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <span className="group relative block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img {...props} alt={props.alt ?? ""} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View larger"
        className="border-rule bg-paper-2/90 text-muted hover:border-rule-2 hover:text-ink absolute top-2 right-2 rounded-[6px] border p-1.5 transition-colors duration-[220ms] [transition-timing-function:var(--ease-out)] active:translate-y-px"
      >
        <ZoomIcon className="h-4 w-4" />
      </button>

      {mounted &&
        createPortal(
          <dialog
            ref={dialogRef}
            aria-label={props.alt || "Image"}
            onCancel={() => setOpen(false)}
            onClose={() => setOpen(false)}
            onClick={() => setOpen(false)}
            className="zoom-modal m-auto bg-transparent p-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={typeof props.src === "string" ? props.src : undefined}
              alt={props.alt ?? ""}
              className="border-rule-2 bg-paper-2 max-h-[88vh] w-[min(1400px,94vw)] rounded-[10px] border object-contain"
            />
          </dialog>,
          document.body,
        )}
    </span>
  );
}
