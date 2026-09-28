"use client";

import { useRef } from "react";
import CopyButton from "@/components/CopyButton";

export default function CodeBlock(props: React.ComponentProps<"pre">) {
  const preRef = useRef<HTMLPreElement>(null);

  return (
    <div className="code-block-wrapper">
      <CopyButton
        getText={() => preRef.current?.querySelector("code")?.textContent ?? ""}
      />
      <pre ref={preRef} {...props} />
    </div>
  );
}
