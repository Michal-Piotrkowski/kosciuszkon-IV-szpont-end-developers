"""
CLI helper: score one package by name using the trained model.

Flow: fetch registry JSON -> build summary -> append downloads/dependents from search
(same string shape as training data) -> run Hugging Face pipeline -> print P(LABEL_1) on stdout.

Requires ./npm_model from train_model.py. Run from repo root:  python dataset/check_npm.py
"""

import sys
from pathlib import Path

from transformers import pipeline

from npm_summary import (
    build_behavior_summary,
    enrich_behavior_summary_for_bert,
    fetch_npm_metadata,
)

MODEL_DIR = str(Path(__file__).resolve().parent.parent / "npm_model")

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


def check(package_name):
    data = fetch_npm_metadata(package_name)
    summary = build_behavior_summary(data)
    summary = enrich_behavior_summary_for_bert(summary, package_name)
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
    check("lodash")

    check("react-scripts")

    check("browserify-git-my-version")

    check("my-package")
