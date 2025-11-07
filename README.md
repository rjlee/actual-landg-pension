# actual-landg-pension

Sync a Legal & General pension balance into Actual Budget. Automates login, captures the latest value, and pushes an adjustment transaction to the mapped Actual account on a schedule.

## Features

- Headless Puppeteer workflow to sign in and capture balances (debug/headful mode available).
- Web UI for login, mapping, and manual sync triggers.
- Cron-driven daemon with configurable schedule.
- Docker image with health check and persistent storage.

## Requirements

- Node.js ≥ 20.
- Legal & General credentials (see `.env.example` for required values).
- Actual Budget server connection and credentials.

## Installation

```bash
git clone https://github.com/rjlee/actual-landg-pension.git
cd actual-landg-pension
npm install
```

Optional husky hooks:

```bash
npm run prepare
```

### Docker quick start

```bash
cp .env.example .env
docker build -t actual-landg-pension .
mkdir -p data/budget
docker run -d --env-file .env \
  -p 5011:3000 \
  -v "$(pwd)/data:/app/data" \
  actual-landg-pension --mode daemon --ui
```

Prebuilt images: `ghcr.io/rjlee/actual-landg-pension:<tag>`.

## Configuration

- `.env` – Actual credentials, Legal & General login info, cron overrides, etc.
- `config.yaml` / `config.yml` / `config.json` – optional defaults (copy `config.example.yaml`).

Precedence: CLI > environment variables > config file.

Common options:

| Setting                            | Description                                           | Default               |
| ---------------------------------- | ----------------------------------------------------- | --------------------- |
| `DATA_DIR`                         | App data (cookies, mappings)                          | `./data`              |
| `BUDGET_DIR`                       | Budget cache                                          | `./data/budget`       |
| `SYNC_CRON` / `SYNC_CRON_TIMEZONE` | Cron schedule                                         | `55 17 * * *` / `UTC` |
| `DISABLE_CRON_SCHEDULING`          | Disable cron                                          | `false`               |
| `HTTP_PORT`                        | Web UI port                                           | `3000`                |
| `UI_AUTH_ENABLED`                  | Require UI login                                      | `true`                |
| `SESSION_SECRET`                   | Cookie-session secret (defaults to `ACTUAL_PASSWORD`) | unset                 |

## Usage

### Local

```bash
# One-off sync
npm run sync -- --debug   # optional headful mode for troubleshooting

# Daemon with web UI
npm run daemon -- --ui --http-port 3000
```

Visit `http://localhost:3000` (or your configured port) to complete the initial login and map the pension account.

### Docker

```bash
docker run --rm --env-file .env \
  -p 5011:3000 \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/rjlee/actual-landg-pension:latest --mode daemon --ui
```

## Testing & linting

```bash
npm test
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

## Image tags

- `ghcr.io/rjlee/actual-landg-pension:<semver>` – pinned to a specific Actual API line.
- `ghcr.io/rjlee/actual-landg-pension:latest` – highest supported release.

## Security considerations

- Store Legal & General credentials securely; the app caches session cookies under `DATA_DIR`.
- Serve the UI over HTTPS by providing `SSL_KEY`/`SSL_CERT`, or disable the UI once configuration is stable.
- When running in headless environments, ensure `CHROME_DISABLE_SANDBOX=true` is acceptable for your threat model.

## License

MIT © contributors.
