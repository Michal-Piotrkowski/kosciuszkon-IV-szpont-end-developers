"""
Merge npm-generated rows with optional synthetic rows into one training file.

Reads:
  - data_npm.csv (from enrich_data_csv.py), or falls back to data.csv if data_npm.csv is missing
    (legacy: older enrich wrote straight to data.csv).
  - data_synthetic_suspicious.csv (hand-made or rule-based negative-style examples).

Writes dataset/data.csv (npm rows first, then synthetic). train_model.py reads data.csv.

Run from repo root:  python dataset/merge_data_csv.py
"""

import csv
from pathlib import Path

_DATASET_DIR = Path(__file__).resolve().parent
NPM_CSV = _DATASET_DIR / "data_npm.csv"
# Older workflow wrote enrich output directly to data.csv
LEGACY_NPM_CSV = _DATASET_DIR / "data.csv"
SYNTHETIC_CSV = _DATASET_DIR / "data_synthetic_suspicious.csv"
OUTPUT_CSV = _DATASET_DIR / "data.csv"


def _load_rows(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            return []
        keys = {x.strip() for x in reader.fieldnames}
        if "text" not in keys or "label" not in keys:
            raise SystemExit(f"{path}: expected columns text, label (got {reader.fieldnames})")
        out = []
        for row in reader:
            text = (row.get("text") or "").strip()
            label = (row.get("label") or "").strip()
            if not text:
                continue
            out.append({"text": text, "label": label})
        return out


def main():
    npm_rows = _load_rows(NPM_CSV)
    npm_source = NPM_CSV.name
    if not npm_rows and LEGACY_NPM_CSV.is_file():
        npm_rows = _load_rows(LEGACY_NPM_CSV)
        npm_source = LEGACY_NPM_CSV.name
        leg = LEGACY_NPM_CSV.name
        print(
            f"Note: {NPM_CSV.name} missing — using {leg} as npm source (legacy enrich). "
            f"Re-run enrich to produce {NPM_CSV.name}. "
            f"If {leg} was already merged with synthetic rows, running merge again duplicates rows."
        )

    if not npm_rows:
        raise SystemExit(
            f"No npm rows: create {NPM_CSV.name} (python dataset/enrich_data_csv.py) "
            f"or place rows in {LEGACY_NPM_CSV.name}."
        )

    synth_rows = _load_rows(SYNTHETIC_CSV)
    if not synth_rows:
        print(f"Note: {SYNTHETIC_CSV.name} missing or empty — output is npm rows only.")

    merged = npm_rows + synth_rows

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["text", "label"], quoting=csv.QUOTE_NONNUMERIC)
        w.writeheader()
        w.writerows(merged)

    print(
        f"Wrote {OUTPUT_CSV}: npm={len(npm_rows)} (source: {npm_source}), "
        f"synthetic={len(synth_rows)}, total={len(merged)}"
    )


if __name__ == "__main__":
    main()
