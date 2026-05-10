"""
Stdin: JSON metadanych (jak z registry), opcjonalnie z prefiksem logu przed `{`.
Stdout: jedna linia — score modelu P(LABEL_1) (float 0–1). Bez decyzji ok/nie ok.
Stderr: tekst wejściowy do modelu + szczegóły prawdopodobieństw (można zlać z 2>&1).
Bez HTTP — dane z Node.
"""

from datetime import datetime, timezone
import json
import sys

from transformers import pipeline

MODEL_DIR = "./npm_model"

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


def build_behavior_summary(data):
    """Ten sam format tekstu co w data.csv / treningu (bez Version)."""
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


def _parse_stdin_json(raw: str) -> dict:
    raw = raw.strip()
    if not raw:
        raise ValueError("empty stdin")
    start = raw.find("{")
    if start == -1:
        raise ValueError("no JSON object start")
    return json.loads(raw[start:])


def check(data: dict):
    summary = build_behavior_summary(data)
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
    check(payload)
