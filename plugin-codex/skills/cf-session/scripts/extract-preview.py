#!/usr/bin/env python3
"""Extract the first user message from a Claude Code session JSONL file.

Usage: python3 extract-preview.py <path-to-session.jsonl>
Output: First 200 chars of the first user message, or "(preview unavailable)".
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print("(preview unavailable)")
        sys.exit(0)

    filepath = sys.argv[1]
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("type") == "user":
                        msg = entry.get("message", {})
                        content = msg.get("content", "")
                        if isinstance(content, str) and content.strip():
                            print(content.strip()[:200])
                            return
                except Exception:
                    continue
        print("(preview unavailable)")
    except Exception:
        print("(preview unavailable)")


if __name__ == "__main__":
    main()
