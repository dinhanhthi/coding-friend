import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** A command the user runs themselves: copyable plain text, never executed. */
export function CommandLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    navigator.clipboard?.writeText(command).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-rule bg-paper-2 py-1 pr-1 pl-3">
      <span aria-hidden className="font-mono text-sm text-muted select-none">
        $
      </span>
      <code className="min-w-0 flex-1 font-mono text-sm break-all select-all">
        {command}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy command"}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}
