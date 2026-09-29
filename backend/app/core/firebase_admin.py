import json
import os
from pathlib import Path


def service_account_info():
    # An explicitly supplied empty value is an intentional disable switch.
    # Do not silently fall back to a workspace key file in that case.
    json_env_present = "FIREBASE_SERVICE_ACCOUNT_JSON" in os.environ
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    if json_env_present and not raw:
        return None
    if raw:
        try:
            info = json.loads(raw.strip())
            # Render may preserve escaped line breaks one level deeper when a
            # JSON object is pasted into an environment variable. Normalize
            # them before google-auth parses the PEM key.
            if isinstance(info, dict) and isinstance(info.get("private_key"), str):
                info["private_key"] = info["private_key"].replace("\\n", "\n")
            return info
        except json.JSONDecodeError:
            pass
    env_path = Path(__file__).resolve().parents[2] / ".env"
    try:
        text = env_path.read_text(encoding="utf-8")
        file_marker = "FIREBASE_SERVICE_ACCOUNT_FILE="
        file_start = text.find(file_marker)
        file_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE")
        if not file_path and file_start >= 0:
            file_path = text[file_start + len(file_marker):].splitlines()[0].strip().strip('"')
        if file_path:
            key_path = Path(file_path)
            if key_path.is_file():
                return json.loads(key_path.read_text(encoding="utf-8"))
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
    info = service_account_info()
    if not info:
        return None
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(info))
    return firebase_admin
