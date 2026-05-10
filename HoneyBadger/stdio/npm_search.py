"""
npm search API helper for the stdio worker (no full registry fetch).

Fetches monthly downloads and dependent count for a package name. Stats are only trusted
when the search API's top result package.name exactly matches the requested name—otherwise
returns (0, 0) so we do not attach another package's popularity to the wrong name.
"""

import requests


def _exact_package_match(requested: str, returned: str | None) -> bool:
    if not returned:
        return False
    return requested.strip() == returned.strip()


def fetch_downloads_dependents(package_name: str) -> tuple[int, int]:
    """GET /-/v1/search?text=&size=1 -> (monthly_downloads, dependents) or (0, 0) if no exact name match."""
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
    if not _exact_package_match(package_name, returned_name):
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
