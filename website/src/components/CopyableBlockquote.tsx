"use client";

import { isValidElement, useRef, type ReactNode } from "react";
import CopyButton from "@/components/CopyButton";

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

export default function CopyableBlockquote(
  props: React.ComponentProps<"blockquote">,
) {
  const ref = useRef<HTMLQuoteElement>(null);
  const { className, children, ...rest } = props;
  // Only the install prompt is meant to be pasted into an agent.
  const copyable = nodeText(children).includes("Install Coding Friend");

  if (!copyable) {
    return (
      <blockquote className={className} {...rest}>
        {children}
      </blockquote>
    );
  }

  return (
    <div className="code-block-wrapper">
      <CopyButton
        getText={() =>
          (ref.current?.textContent ?? "").replace(/\s+/g, " ").trim()
        }
      />
      <blockquote
        ref={ref}
        className={className ? `${className} has-copy` : "has-copy"}
        {...rest}
      >
        {children}
      </blockquote>
    </div>
  );
}
