"""
Fetch npm registry metadata and build the training/inference text snippet (no ML here).

Used by dataset enrichment and dataset/check_npm.py:
  - Registry GET: full package document for time.* and maintainers.
  - Search GET: monthly downloads + dependents only when the top hit's name matches
    the requested package (avoids attributing another package's stats).
"""

from datetime import datetime, timezone

import requests


def _parse_npm_time(value):
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    return datetime.fromisoformat(text)


def fetch_npm_metadata(package_name):
    """Return the JSON document for one package from the npm registry."""
    path = package_name.replace("/", "%2F")
    url = f"https://registry.npmjs.org/{path}"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json()


def build_behavior_summary(data):
    """One-line summary: package age, days since last publish, maintainer count (no downloads)."""
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


def fetch_search_downloads_dependents(package_name):
    """
    Search API (size=1). Return (monthly_downloads, dependents_count) only if the top
    result's package.name equals package_name; otherwise (0, 0).
    """
    url = "https://registry.npmjs.org/-/v1/search"
    response = requests.get(
        url,
        params={"text": package_name, "size": 1},
        headers={"Accept": "application/json"},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    objects = payload.get("objects") or []
    if not objects:
        return 0, 0
    hit = objects[0]
    returned_name = (hit.get("package") or {}).get("name")
    if (returned_name or "").strip() != (package_name or "").strip():
        return 0, 0
    downloads = hit.get("downloads") or {}
    monthly = downloads.get("monthly")
    if monthly is None:
        monthly = 0
    else:
        monthly = int(monthly)
    deps_raw = hit.get("dependents")
    if deps_raw is None or deps_raw == "":
        dependents = 0
    else:
        try:
            dependents = int(deps_raw)
        except (TypeError, ValueError):
            dependents = 0
    return monthly, dependents


def enrich_behavior_summary_for_bert(base_summary: str, package_name: str) -> str:
    """Append Downloads and Dependents to the base summary string (training format)."""
    downloads, dependents = fetch_search_downloads_dependents(package_name)
    return f"{base_summary}, Downloads: {downloads}, Dependents: {dependents}"
