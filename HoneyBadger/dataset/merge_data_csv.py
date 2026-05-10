"""
Merge npm-generated rows with optional synthetic rows into one training file.

Reads:
  - dataset/npm/data_npm.csv (from enrich_data_csv.py), or legacy flat paths if missing.
  - dataset/synthetic/data_synthetic_suspicious.csv (optional).

Writes dataset/train/data.csv (npm rows first, then synthetic). train_model.py reads that file.

Run from repo root:  python dataset/merge_data_csv.py
"""

import csv
from pathlib import Path

_DATASET_DIR = Path(__file__).resolve().parent
NPM_CSV = _DATASET_DIR / "npm" / "data_npm.csv"
# Pre-folder-layout copies (or older enrich wrote npm rows to dataset/data.csv)
LEGACY_NPM_FLAT = _DATASET_DIR / "data_npm.csv"
LEGACY_ENRICH_DATA_CSV = _DATASET_DIR / "data.csv"
SYNTHETIC_CSV = _DATASET_DIR / "synthetic" / "data_synthetic_suspicious.csv"
OUTPUT_CSV = _DATASET_DIR / "train" / "data.csv"


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
    npm_source = str(NPM_CSV.relative_to(_DATASET_DIR))
    if not npm_rows and LEGACY_NPM_FLAT.is_file():
        npm_rows = _load_rows(LEGACY_NPM_FLAT)
        npm_source = LEGACY_NPM_FLAT.name
        print(
            f"Note: {NPM_CSV} missing — using legacy {LEGACY_NPM_FLAT.name}. "
            f"Re-run enrich to populate npm/data_npm.csv."
        )
    if not npm_rows and LEGACY_ENRICH_DATA_CSV.is_file():
        npm_rows = _load_rows(LEGACY_ENRICH_DATA_CSV)
        npm_source = LEGACY_ENRICH_DATA_CSV.name
        leg = LEGACY_ENRICH_DATA_CSV.name
        print(
            f"Note: npm extract missing — using {leg} as npm source (legacy: enrich wrote here). "
            f"Re-run enrich to produce npm/data_npm.csv. "
            f"If {leg} was already merged with synthetic rows, merge again duplicates rows."
        )

    if not npm_rows:
        raise SystemExit(
            f"No npm rows: run python dataset/enrich_data_csv.py "
            f"or place rows in {NPM_CSV} (or legacy {LEGACY_NPM_FLAT.name} / {LEGACY_ENRICH_DATA_CSV.name})."
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
