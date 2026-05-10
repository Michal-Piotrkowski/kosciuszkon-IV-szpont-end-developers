"""
Smoke test for stdio: feed a fixed stdin string (log prefix + @types/node-shaped JSON).

Useful without Node. Requires network for search and a trained ../npm_model.

Run from repo root:  python stdio/check_npm_stdio_mock.py
"""

import json
import sys

from check_npm_stdio import check, _parse_stdin_json

# Simulates Node sending registry metadata + package name; search fills downloads/dependents.
MOCK_STDIN = r"""[2026-05-10 01:48:07.167665] Received: {"name":"@types/node","contributors": [{"url": "https://github.com/yortus", "name": "Troy Gerwien", "githubUsername": "yortus"}, {"url": "https://github.com/marvinhagemeister", "name": "Marvin Hagemeister", "githubUsername": "marvinhagemeister"}, {"url": "https://github.com/mgroenhoff", "name": "Melvin Groenhoff", "githubUsername": "mgroenhoff"}, {"url": "https://github.com/ExE-Boss", "name": "ExE Boss", "githubUsername": "ExE-Boss"}], "maintainers": [{"name": "types", "email": "ts-npm-types@microsoft.com"}], "time": {"created": "2018-07-25T22:30:17.471Z", "modified": "2025-08-03T06:25:56.885Z", "7.0.0": "2018-07-25T22:30:18.240Z", "7.0.1": "2018-11-15T22:59:10.282Z", "7.0.2": "2019-02-13T21:08:20.448Z", "7.0.3": "2020-09-24T20:50:02.605Z", "7.4.0": "2020-11-12T20:51:35.867Z", "7.4.1": "2021-07-06T18:16:45.084Z", "7.4.2": "2023-09-15T19:11:07.690Z", "7.4.3": "2023-10-17T22:56:34.002Z", "7.4.4": "2023-11-06T23:40:08.640Z"}}"""


if __name__ == "__main__":
    try:
        payload = _parse_stdin_json(MOCK_STDIN)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"error: mock parse ({e})", file=sys.stderr)
        sys.exit(1)
    if not isinstance(payload, dict):
        print("error: JSON root must be an object", file=sys.stderr)
        sys.exit(1)

    score = check(payload)
    print(f"score (mock log): {score}", file=sys.stderr)
    sys.stderr.flush()
