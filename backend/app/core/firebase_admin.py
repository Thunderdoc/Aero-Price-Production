import json
import os
from pathlib import Path


def service_account_info():
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass
    env_path = Path(__file__).resolve().parents[2] / ".env"
    try:
        text = env_path.read_text(encoding="utf-8")
        marker = "FIREBASE_SERVICE_ACCOUNT_JSON="
        start = text.find(marker)
        if start >= 0:
            block = text[start + len(marker):]
            end = block.rfind("}")
            if end >= 0:
                return json.loads(block[:end + 1].replace("\\\n", ""))
    except (OSError, json.JSONDecodeError):
        pass
    return None


def firebase_app():
    import firebase_admin
    from firebase_admin import credentials
    if not firebase_admin._apps:
        info = service_account_info()
        if not info:
            return None
        firebase_admin.initialize_app(credentials.Certificate(info))
    return firebase_admin
