"""
How to run:
1. Prepare data.csv (example: "Age: 1 days, Updated: 0 days ago, Maint: 1, Version: 99.0.0", 1).
2. Run: python train_model.py
3. Run: python check_npm.py
"""

from datetime import datetime, timezone

import requests
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


def fetch_npm_metadata(package_name):
    path = package_name.replace("/", "%2F")
    url = f"https://registry.npmjs.org/{path}"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def build_behavior_summary(data):
    now = datetime.now(timezone.utc)
    time_info = data.get("time") or {}
    created = _parse_npm_time(time_info.get("created"))
    modified = _parse_npm_time(time_info.get("modified"))

    age_days = (now - created).days if created else -1
    days_since_update = (now - modified).days if modified else -1
    maint_count = len(data.get("maintainers") or [])
    version = (data.get("dist-tags") or {}).get("latest") or "unknown"

    return (
        f"Age: {age_days} days, Updated: {days_since_update} days ago, "
        f"Maint: {maint_count}, Version: {version}"
    )


def check(package_name):
    data = fetch_npm_metadata(package_name)
    summary = build_behavior_summary(data)
    print(summary)

    clf = _get_classifier()
    # return_all_scores=True without top_k can return only the winning class; top_k=None returns every label.
    scores = clf(summary, return_all_scores=True, top_k=None)
    if scores and isinstance(scores[0], list):
        scores = scores[0]
    by_label = {item.get("label", ""): float(item.get("score", 0.0)) for item in scores}
    predicted = max(scores, key=lambda x: x.get("score", 0.0))
    pred_label = predicted.get("label", "")
    risk_p = by_label.get("LABEL_1", 0.0)
    safe_p = by_label.get("LABEL_0", 0.0)
    print(
        f"Risk Score — P(LABEL_1 / higher risk): {risk_p:.4f} | "
        f"P(LABEL_0): {safe_p:.4f} | predicted: {pred_label}"
    )


if __name__ == "__main__":
    # Type the npm package name to check here (e.g. "lodash" or "@types/node"):

    check("lodash")

    check("react-scripts")

    check("browserify-git-my-version")
