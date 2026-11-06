#!/usr/bin/env python3
"""Start Toonflow with optional DX Tokens credentials from the local Pi config."""
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    environment = os.environ.copy()
    root = Path(__file__).resolve().parent
    source = Path(environment.get("PI_MODELS_PATH", str(Path.home() / ".pi/pi-agent1/models.json")))
    # Explicit environment credentials take precedence over local Pi configuration.
    if not environment.get("DX_TOKENS_API_KEY") and source.is_file():
        try:
            provider = json.loads(source.read_text())["providers"]["dx-tokens"]
            key = provider.get("apiKey", "")
            if not isinstance(key, str) or not key.strip():
                raise ValueError("Missing API key")
            # Never execute credential commands from an imported configuration.
            if key.startswith("!"):
                raise ValueError("Command-based credentials require DX_TOKENS_API_KEY")
            if key.isidentifier():
                key = environment.get(key, "")
                if not key:
                    raise ValueError("Credential environment variable is unset")
            if provider.get("api", "openai-completions") != "openai-completions":
                raise ValueError("DX Tokens bootstrap requires openai-completions")
            models = []
            for model in provider["models"]:
                item = {"id": model["id"], "label": model.get("name", model["id"])}
                for old, new in [("contextWindow", "contextWindow"), ("maxTokens", "maxOutputTokens")]:
                    if old in model:
                        item[new] = model[old]
                item["reasoningEfforts"] = {level: level for level in ["low", "medium", "high"]} if model.get("reasoning") else False
                models.append(item)
            environment["DX_TOKENS_API_KEY"] = key
            environment.setdefault("DX_TOKENS_BASE_URL", provider["baseUrl"])
            environment.setdefault("DX_TOKENS_MODELS_JSON", json.dumps(models))
            print("DX Tokens: loaded from local Pi configuration (credentials hidden).", flush=True)
        except (ValueError, KeyError, TypeError, OSError):
            print("Cannot import DX Tokens. Check the Pi configuration or set DX_TOKENS_API_KEY. No credential commands are executed.", file=sys.stderr)
            return 1
    elif not environment.get("DX_TOKENS_API_KEY"):
        print("No Pi credentials found. Compose may load DX_TOKENS_API_KEY from .env; otherwise configure a key later.", flush=True)
    # Secrets travel through the child environment, never command arguments or files.
    return subprocess.run(["docker", "compose", "up", "-d", "--build"], cwd=root, env=environment, check=False).returncode


if __name__ == "__main__":
    sys.exit(main())
