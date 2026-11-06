# DX Tokens on another machine

Clone and start:

```bash
git clone https://github.com/sonct1/Toonflow-app.git
cd Toonflow-app
python3 start.py
```

Requirements: Python 3, Docker Engine and Docker Compose. The launcher reads only the `dx-tokens` provider from `$HOME/.pi/pi-agent1/models.json`. A different path can be supplied with `PI_MODELS_PATH`. It imports the API key, endpoint and model list through the Docker Compose process environment without creating a credentials file or mounting the entire Pi directory.

If that machine has no Pi configuration, supply your API key once through `DX_TOKENS_API_KEY`, or a local `.env` file excluded from Git:

```dotenv
DX_TOKENS_API_KEY=your-key-here
```

Then run `python3 start.py` (or `docker compose up -d --build`). The endpoint and five model definitions are built in; no provider form needs to be filled in. Explicit environment credentials take precedence over the Pi config. The launcher never executes `!command` credentials; provide their resolved value via the environment instead. With neither credentials nor an existing provider, the application starts normally without DX Tokens.

Bootstrap runs only when `dx-tokens` is absent. It does not change an existing provider, its API key, other settings, or projects. Later key rotation is done in the application's settings. Settings are stored with mode `600` in the data volume. Docker administrators can inspect container environment variables; use only trusted hosts. Never commit `.env`, `models.json`, or data backups.

A clone cannot securely reproduce a secret on a machine that has never received it. Copy the Pi configuration securely or supply the key; committing the shared API key is not supported.

The imported context limits are saved, but Toonflow's existing built-in model limit table currently takes precedence for known model IDs. This bootstrap does not alter that behavior.
