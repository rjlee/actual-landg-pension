# actual-landg-pension

Sync your Legal & General pension value to an Actual Budget account.

## Features

- Scrape Legal & General pension value from the Legal & General website via headless Chrome (Puppeteer).
- Web UI to log in, submit SMS 2FA code, map pension to an Actual Budget account, and trigger sync manually.
- Cron-based daemon mode for automated syncing.
- Docker build and GitHub Actions workflows for CI, release, and Docker image publishing.

## Quick Start

_Before you begin, please review the [Security Considerations](#security-considerations) section below._

1. Copy `.env.example` to `.env` and fill in your Legal & General credentials and Actual Budget settings:

```bash
# Landg settings
LANDG_EMAIL=you@example.com
LANDG_PASSWORD=yourLandgPassword
LANDG_COOKIES_FILE=./data/landg_cookies.json
LANDG_2FA_TIMEOUT=60

# Actual Budget API configuration
ACTUAL_SERVER_URL=https://your-actual-server
ACTUAL_PASSWORD=yourBudgetPassword
ACTUAL_SYNC_ID=yourBudgetUUID
ACTUAL_BUDGET_ENCRYPTION_PASSWORD=yourBudgetFileEncryptionPassword

# Web UI session auth (disable login with UI_AUTH_ENABLED=false)
UI_AUTH_ENABLED=true
SESSION_SECRET=someLongRandomString

# TLS/HTTPS (optional)
SSL_KEY=/path/to/privkey.pem
SSL_CERT=/path/to/fullchain.pem
```

2. Copy `config.example.yaml` to `config.yaml` if you need to override defaults (schedule, HTTP_PORT, DATA_DIR, BUDGET_DIR, MAPPING_FILE).

3. Build and run with Docker Compose:

   By default the Docker image installs Debian’s `chromium` package (so Puppeteer uses system Chromium
   instead of downloading its own) and sets `CHROME_DISABLE_SANDBOX=true` so Puppeteer can run headlessly
   inside the container.

```bash
docker-compose up --build -d
```

_or_ run locally:

```bash
npm install
npm run daemon -- --ui [--verbose]
```

4. Open your browser to <http://localhost:3000> (or configured `HTTP_PORT`) and:

- **Log in to Legal & General**: click **Login Legal & General**, then enter your Legal & General credentials.
  - **Enter SMS code**: when prompted, enter the SMS code for 2FA.
  - **Save mapping**: select your Actual Budget account to sync your pension value to, then click **Save Mapping**.
  - **Sync Now**: click **Sync Now** to immediately update your Actual Budget account.
  - The daemon will also periodically sync based on your cron schedule.

## Security Considerations

_Web UI security:_

- **Session-based UI authentication** uses a signed session cookie (`cookie-session`) secured by `SESSION_SECRET`.
  To disable login entirely (open access), set `UI_AUTH_ENABLED=false`.
- **Landg session cookies** are stored in `LANDG_COOKIES_FILE` to avoid repeated SMS codes.
  Protect this file with appropriate filesystem permissions to prevent unauthorized access.
- **TLS/HTTPS:** strongly recommended in production:

```bash
SSL_KEY=/path/to/privkey.pem
SSL_CERT=/path/to/fullchain.pem
```

- **Disable Web UI:** omit the `--ui` flag or remove the HTTP_PORT setting to run one-shot sync (`npm run sync`).

## Configuration

See `.env.example` and `config.example.yaml` for available options.

## GitHub Actions & Releases

We use GitHub Actions + semantic-release to automate version bumps, changelogs, GitHub releases, and Docker image publishing:

- **CI & Release** (`.github/workflows/release.yml`) runs on push to `main`: lint, format-check, test, and `semantic-release`.
- **Docker Build & Publish** (`.github/workflows/docker.yml`) runs on push to `release`: builds and publishes the Docker image to GitHub Container Registry (`ghcr.io/<owner>/actual-landg-pension:<version>` and `:latest`).

Ensure your repository has the `GITHUB_TOKEN` secret configured.

## Development

We use ESLint, Prettier, Husky (Git hooks), lint-staged, and Jest to enforce code quality.

```bash
npm install
npm run prepare
```

Lint, format, and test:

```bash
npm run lint
npm run lint:ejs
npm run format
npm run format:check
npm test
```

## License

<Add license or disclaimer as needed>
