#!/usr/bin/env python3
"""Write session metadata to meta.json.

Usage: python3 write-meta.py <session_id> <label> <project_path> <saved_at> <machine> <preview> <dest_dir> <folder_name>

All values are passed as arguments to avoid shell injection.
"""

import json
import sys


def main():
    if len(sys.argv) < 9:
        print("ERROR: Expected 8 arguments", file=sys.stderr)
        sys.exit(1)

    session_id, label, project_path, saved_at, machine, preview, dest_dir, folder_name = sys.argv[1:9]

    meta = {
        "sessionId": session_id,
        "folderName": folder_name,
        "label": label,
        "projectPath": project_path,
        "savedAt": saved_at,
        "machine": machine,
        "previewText": preview,
    }

    meta_path = f"{dest_dir}/meta.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    print("meta.json written")


if __name__ == "__main__":
    main()
