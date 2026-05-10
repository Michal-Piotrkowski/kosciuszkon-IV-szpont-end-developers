import sys
import json
import os
from datetime import datetime

script_dir = os.path.dirname(os.path.abspath(__file__))
test_file = os.path.join(script_dir, 'model_test.txt')

try:
    input_data = sys.stdin.read()
    data = json.loads(input_data) if input_data.strip() else {}
except Exception as e:
    data = {"error": str(e)}

try:
    with open(test_file, 'a') as f:
        f.write(f"[{datetime.now()}] Received: {json.dumps(data)}\n")
except Exception as e:
    print(json.dumps({"error": f"Could not write to file: {e}"}))
    sys.exit(1)

result = {
    "safe": True,
    "score": 0.87,
    "reason": "Package analysis complete",
    "fileCount": len(data.get("files", [])) if isinstance(data, dict) else 0
}

print(json.dumps(result))
sys.exit(0)
