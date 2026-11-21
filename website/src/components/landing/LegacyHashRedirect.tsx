"use client";

import { useEffect } from "react";
import { legacyDocsHref } from "@/lib/landing";

/** Old links such as cf.coprimal.dev/#memory (printed by shipped CLIs) land on the same anchor in /docs. */
export default function LegacyHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return; // malformed hash such as "#%": nothing to redirect to
    }
    const target = legacyDocsHref(
      hash,
      Boolean(id && document.getElementById(id)),
    );
    if (target) window.location.replace(target);
  }, []);
  return null;
}
