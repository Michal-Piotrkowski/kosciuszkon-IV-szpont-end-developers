"""
Build dataset/npm/data_npm.csv from dataset/source/data_packages.csv via the live npm API.

For each package: registry metadata -> base summary line; search API -> downloads/dependents
(when the search hit matches the package name). Writes rows (text, label) for later merge.

Run from repo root:  python dataset/enrich_data_csv.py
"""

import csv
import sys
import time
from pathlib import Path

_DATASET_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _DATASET_DIR.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from dataset.npm_summary import (  # noqa: E402
    build_behavior_summary,
    enrich_behavior_summary_for_bert,
    fetch_npm_metadata,
)

PACKAGES_CSV = _DATASET_DIR / "source" / "data_packages.csv"
OUTPUT_CSV = _DATASET_DIR / "npm" / "data_npm.csv"
DELAY_S = 0.35  # pause between packages to reduce npm rate-limit risk


def main():
    rows_out = []
    with PACKAGES_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fn = [x.strip() for x in (reader.fieldnames or [])]
        if "package" not in fn or "label" not in fn:
            raise SystemExit(
                f"{PACKAGES_CSV} must have columns package and label (got {reader.fieldnames})"
            )
        for row in reader:
            pkg = (row.get("package") or "").strip()
            label = row.get("label", "").strip()
            if not pkg:
                continue
            data = fetch_npm_metadata(pkg)
            base = build_behavior_summary(data)
            text = enrich_behavior_summary_for_bert(base, pkg)
            rows_out.append({"text": text, "label": label})
            time.sleep(DELAY_S)

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["text", "label"], quoting=csv.QUOTE_NONNUMERIC)
        w.writeheader()
        w.writerows(rows_out)

    print(f"Wrote {len(rows_out)} rows to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
