# actual-landg-pension

Sync a Legal & General pension balance into Actual Budget. Automates browser login, captures the latest valuation, and posts an adjustment to the configured Actual account on a schedule.

## Features

- Headless Puppeteer flow with optional debug/headful mode for troubleshooting.
- Web UI for login, mapping, and manual sync triggers; designed to sit behind the shared `actual-auto-auth` forward proxy.
- Cron-driven daemon with configurable schedule and persistent state.
- Docker image with baked-in health check and bind-mount friendly storage.

## Requirements

- Node.js ≥ 22.
- Legal & General login credentials (email, password, SMS 2FA).
- Actual Budget server credentials (`ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, `ACTUAL_SYNC_ID`).

## Installation

```bash
git clone https://github.com/rjlee/actual-landg-pension.git
cd actual-landg-pension
npm install
```

Optional git hooks:

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

Published images live at `ghcr.io/rjlee/actual-landg-pension:<tag>` (see [Image tags](#image-tags)).

## Configuration

- `.env` – primary configuration, copy from `.env.example`.
- `config.yaml` / `config.yml` / `config.json` – optional defaults, copy from `config.example.yaml`.

Precedence: CLI flags > environment variables > config file.

| Setting                            | Description                                    | Default                     |
| ---------------------------------- | ---------------------------------------------- | --------------------------- |
| `LANDG_EMAIL` / `LANDG_PASSWORD`   | Legal & General credentials                    | required                    |
| `LANDG_COOKIES_FILE`               | Persisted cookie jar                           | `./data/landg_cookies.json` |
| `LANDG_2FA_TIMEOUT`                | Seconds to enter SMS 2FA in UI                 | `60`                        |
| `DATA_DIR`                         | Local storage for mappings and cookies         | `./data`                    |
| `MAPPING_FILE`                     | Account mapping file (relative to `DATA_DIR`)  | `mapping.json`              |
| `BUDGET_DIR`                       | Budget cache directory                         | `./data/budget`             |
| `SYNC_CRON` / `SYNC_CRON_TIMEZONE` | Daemon cron schedule                           | `55 17 * * *` / `UTC`       |
| `DISABLE_CRON_SCHEDULING`          | Disable cron while in daemon mode              | `false`                     |
| `HTTP_PORT`                        | Enables Web UI when set or `--ui` passed       | `3000`                      |
| `AUTH_COOKIE_NAME`                 | Cookie name forwarded by Traefik for logout UI | `actual-auth`               |
| `LOG_LEVEL`                        | Pino log level                                 | `info`                      |
| `ENABLE_NODE_VERSION_SHIM`         | Legacy shim for older `@actual-app/api` checks | `false`                     |

## Usage

### CLI modes

- One-off sync (headful debug): `npm run sync -- --debug`
- Daemon with UI: `npm run daemon -- --ui --http-port 3000`
- Disable cron in daemon: `DISABLE_CRON_SCHEDULING=true npm run daemon`

Visit `http://localhost:3000` (or your configured port) to complete login, map the pension account, and trigger manual syncs. When deploying in the shared stack, route requests through Traefik + `actual-auto-auth` so the UI remains protected.

### Docker daemon

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

- `ghcr.io/rjlee/actual-landg-pension:<semver>` – pinned to a specific `@actual-app/api` release.
- `ghcr.io/rjlee/actual-landg-pension:latest` – highest supported API version.

See [rjlee/actual-auto-ci](https://github.com/rjlee/actual-auto-ci) for tagging policy and automation details.

## License

MIT © contributors.
