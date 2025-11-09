require("dotenv").config();
const express = require("express");
const path = require("path");
const ejs = require("ejs");
const logger = require("./logger");
const fs = require("fs");
const https = require("https");
const config = require("./config");
const { openBudget } = require("./utils");
const {
  getPensionValue,
  submitTwoFACode,
  serverState,
} = require("./landg-client");
const api = require("@actual-app/api");
const { runSync } = require("./sync");
// Helper to wrap async route handlers and forward errors to the global error handler
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const DEFAULT_COOKIE_NAME = "actual-auth";

function hasAuthCookie(req) {
  const cookieName =
    process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;
  const cookieHeader = req.headers?.cookie || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part.startsWith(`${cookieName}=`));
}

// Generate the HTML for the UI page via EJS template
function uiPageHtml({
  hadRefreshToken,
  refreshError,
  showLogoutButton,
  hasCookie,
}) {
  const templatePath = path.join(__dirname, "views", "index.ejs");
  const template = fs.readFileSync(templatePath, "utf8");
  return ejs.render(
    template,
    { hadRefreshToken, refreshError, showLogoutButton, hasCookie },
    { filename: templatePath },
  );
}

/**
 * Build and configure the Express app (no port binding).
 */
async function createWebApp(verbose, debug) {
  // Legal & General-client initial state: no pre-refresh; serverState will track login status
  let hadRefreshToken = false;
  let refreshError = null;
  // Detect existing Landg session cookies (for button state)
  const cookieFile = process.env.LANDG_COOKIES_FILE;
  const hasCookie = Boolean(cookieFile && fs.existsSync(cookieFile));
  // Validate that no deprecated Basic Auth settings are present (env or config)
  const deprecatedUser = process.env.UI_USER || config.UI_USER;
  const deprecatedPass = process.env.UI_PASSWORD || config.UI_PASSWORD;
  if (deprecatedUser || deprecatedPass) {
    logger.error(
      "Error: UI_USER/UI_PASSWORD authentication has been removed.\n" +
        "Please configure session-based auth via ACTUAL_PASSWORD (see README).",
    );
    process.exit(1);
  }
  // Determine data directory (mirror utils.openBudget logic)
  const dataDir = process.env.DATA_DIR || config.DATA_DIR || "./data";
  // Attempt to open/init the Actual‑API budget up front.  Will retry on demand in /api/data.
  let budgetReady = false;
  try {
    await openBudget();
    budgetReady = true;
    logger.info("Initial budget load complete; web UI is ready");
  } catch (err) {
    logger.error(
      { err },
      "Initial budget load failed; web UI will retry on /api/data",
    );
  }
  const app = express();
  app.use(express.json());
  // Serve static assets (JS/CSS) from the public/ directory at project root
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Note: port binding is handled by startWebUi; tests can use the app directly

  // Log HTTP requests (basic info always; more details if verbose)
  app.use((req, res, next) => {
    const meta = { method: req.method, url: req.url };
    if (verbose) {
      meta.headers = req.headers;
      meta.query = req.query;
      if (req.body) meta.body = req.body;
    }
    logger.info(meta, "HTTP request");
    next();
  });
  const mappingName = "mapping.json";
  const mappingFile = path.resolve(process.cwd(), dataDir, mappingName);

  // Landg login endpoints
  app.post(
    "/api/landg/login",
    asyncHandler(async (_req, res) => {
      // Start login and pension fetch in background (pass debug flag)
      getPensionValue({
        email: process.env.LANDG_EMAIL,
        password: process.env.LANDG_PASSWORD,
        cookiesPath: process.env.LANDG_COOKIES_FILE,
        timeout: parseInt(process.env.LANDG_2FA_TIMEOUT, 10) || 60,
        debug,
      }).catch(() => {});
      return res.json({ status: serverState.status });
    }),
  );
  app.post("/api/landg/2fa", (req, res) => {
    submitTwoFACode(req.body.code);
    res.json({ status: serverState.status });
  });
  app.get("/api/landg/status", (_req, res) => {
    res.json(serverState);
  });

  app.get("/", (req, res) =>
    res.send(
      uiPageHtml({
        hadRefreshToken,
        refreshError,
        hasCookie,
        showLogoutButton: hasAuthCookie(req),
      }),
    ),
  );

  app.get(
    "/api/data",
    asyncHandler(async (_req, res) => {
      // If budget isn't ready yet, retry opening it on‑demand
      if (!budgetReady) {
        try {
          await openBudget();
          budgetReady = true;
        } catch (err) {
          logger.error({ err }, "Budget retry failed; skipping accounts fetch");
        }
      }
      // Read existing mappings
      let mapping = [];
      try {
        mapping = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
      } catch {
        // no mapping file or invalid JSON
      }
      // Fetch Actual Budget accounts once budget is ready; otherwise skip
      let accountsList = [];
      if (budgetReady) {
        try {
          accountsList = await api.getAccounts();
        } catch (err) {
          if (err && err.message === "No budget file is open") {
            // Budget may have been closed by a background sync; attempt a one-time reopen
            logger.info("Budget not yet loaded; attempting reopen");
            try {
              await openBudget();
              budgetReady = true;
              accountsList = await api.getAccounts();
            } catch {
              // Still not available; mark as not ready and skip accounts fetch
              budgetReady = false;
              logger.info("Budget not yet loaded; skipping accounts fetch");
            }
          } else {
            logger.error({ err }, "Failed to fetch Actual Budget accounts");
          }
        }
      } else {
        logger.info("Budget not yet loaded; skipping accounts fetch");
      }
      // Provide Legal & General login state for UI
      return res.json({ mapping, accounts: accountsList, landg: serverState });
    }),
  );

  // Provide budget download status for client polling
  app.get("/api/budget-status", (_req, res) => {
    res.json({ ready: budgetReady });
  });

  app.post("/api/mappings", (req, res) => {
    // ensure mapping directory exists
    fs.mkdirSync(path.dirname(mappingFile), { recursive: true });
    fs.writeFileSync(mappingFile, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  app.post(
    "/api/sync",
    asyncHandler(async (_req, res) => {
      const count = await runSync({ verbose: false, useLogger: true });
      res.json({ count });
    }),
  );

  // NOTE: this must be after all route handlers to catch any errors
  // Global error handler for UI routes
  app.use((err, req, res, next) => {
    logger.error(
      { err, method: req.method, url: req.url },
      "Web UI route error",
    );
    if (res.headersSent) {
      return next(err);
    }
    res.status(500).json({ error: err.message });
  });
  return app;
}

/**
 * Launch the Express-based UI server on a specific port.
 */
async function startWebUi(httpPort, verbose, debug) {
  const app = await createWebApp(verbose, debug);
  // If configured, serve over HTTPS using provided SSL key & cert
  if (process.env.SSL_KEY && process.env.SSL_CERT) {
    const sslOpts = {
      key: fs.readFileSync(process.env.SSL_KEY),
      cert: fs.readFileSync(process.env.SSL_CERT),
    };
    const server = https.createServer(sslOpts, app).listen(httpPort, () => {
      logger.info({ port: httpPort }, "Web UI HTTPS server listening");
    });
    return server;
  }
  const server = app.listen(httpPort, () => {
    const realPort = server.address().port;
    logger.info({ port: realPort }, "Web UI server listening");
  });
  return server;
}

module.exports = { startWebUi, createWebApp, uiPageHtml };
