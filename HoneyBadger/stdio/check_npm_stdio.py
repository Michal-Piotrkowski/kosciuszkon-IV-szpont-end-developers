"""
Child process for Node: read package metadata JSON on stdin, print model risk score on stdout.

- Parses JSON (optional log prefix before `{` is stripped).
- Builds the same feature string as training: age / update lag / maint count from the payload,
  plus downloads and dependents from one search request (name must match top hit).
- Loads ../npm_model and outputs P(LABEL_1) on stdout; full string and softmax on stderr.

Run from repo root:  python stdio/check_npm_stdio.py
"""

from datetime import datetime, timezone
import json
import sys
from pathlib import Path

import requests
from transformers import pipeline

from npm_search import fetch_downloads_dependents

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = str(_PROJECT_ROOT / "npm_model")

_classifier = None


def _get_classifier():
    global _classifier
    if _classifier is None:
        _classifier = pipeline(
            "text-classification",
            model=MODEL_DIR,
            tokenizer=MODEL_DIR,
        )
    return _classifier


def _parse_npm_time(value):
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    return datetime.fromisoformat(text)


def build_behavior_summary_from_payload(data: dict) -> str:
    """Derive age, days since update, maintainer count from registry-shaped JSON (no registry HTTP)."""
    now = datetime.now(timezone.utc)
    time_info = data.get("time") or {}
    created = _parse_npm_time(time_info.get("created"))
    modified = _parse_npm_time(time_info.get("modified"))

    age_days = (now - created).days if created else -1
    days_since_update = (now - modified).days if modified else -1
    maint_count = len(data.get("maintainers") or [])

    return (
        f"Age: {age_days} days, Updated: {days_since_update} days ago, "
        f"Maint: {maint_count}"
    )


def extract_package_name(data: dict) -> str | None:
    """First non-empty string among name, package, packageName (Node can send any of these)."""
    for key in ("name", "package", "packageName"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def build_model_input_text(data: dict, package_name: str) -> str:
    """Full one-line input for the classifier (matches enrich output format)."""
    base = build_behavior_summary_from_payload(data)
    downloads, dependents = fetch_downloads_dependents(package_name)
    return f"{base}, Downloads: {downloads}, Dependents: {dependents}"


def _parse_stdin_json(raw: str) -> dict:
    raw = raw.strip()
    if not raw:
        raise ValueError("empty stdin")
    start = raw.find("{")
    if start == -1:
        raise ValueError("no JSON object start")
    return json.loads(raw[start:])


def check(data: dict):
    pkg = extract_package_name(data)
    if not pkg:
        raise ValueError("missing package name (need name, package, or packageName string)")

    summary = build_model_input_text(data, pkg)
    print(summary, file=sys.stderr)

    clf = _get_classifier()
    scores = clf(summary, return_all_scores=True, top_k=None)
    if scores and isinstance(scores[0], list):
        scores = scores[0]
    by_label = {item.get("label", ""): float(item.get("score", 0.0)) for item in scores}
    predicted = max(scores, key=lambda x: x.get("score", 0.0))
    pred_label = predicted.get("label", "")
    risk_p = by_label.get("LABEL_1", 0.0)
    safe_p = by_label.get("LABEL_0", 0.0)
    print(
        f"P(LABEL_1): {risk_p:.6f} | P(LABEL_0): {safe_p:.6f} | label: {pred_label}",
        file=sys.stderr,
    )

    print(risk_p)
    sys.stdout.flush()
    return risk_p


if __name__ == "__main__":
    try:
        payload = _parse_stdin_json(sys.stdin.read())
    except (json.JSONDecodeError, ValueError) as e:
        print(f"error: invalid stdin ({e})", file=sys.stderr)
        sys.exit(1)
    if not isinstance(payload, dict):
        print("error: JSON root must be an object", file=sys.stderr)
        sys.exit(1)
    try:
        check(payload)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(2)
    except requests.RequestException as e:
        print(f"error: npm search request failed ({e})", file=sys.stderr)
        sys.exit(3)
