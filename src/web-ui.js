require("dotenv").config();
const express = require("express");
const path = require("path");
const ejs = require("ejs");
const logger = require("./logger");
const fs = require("fs");
const https = require("https");
const cookieSession = require("cookie-session");
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

// Generate the HTML for the UI page via EJS template
// uiAuthEnabled toggles display of the logout button in the UI
function uiPageHtml(hadRefreshToken, refreshError, uiAuthEnabled, hasCookie) {
  const templatePath = path.join(__dirname, "views", "index.ejs");
  const template = fs.readFileSync(templatePath, "utf8");
  return ejs.render(
    template,
    { hadRefreshToken, refreshError, uiAuthEnabled, hasCookie },
    { filename: templatePath },
  );
}

/**
 * Launch the Express-based UI server
 */
async function startWebUi(httpPort, verbose, debug) {
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
  let budgetReady = false;
  Promise.resolve(openBudget())
    .then(() => {
      budgetReady = true;
    })
    .catch((err) => {
      logger.error({ err }, "Budget download failed");
      // Mark as ready so UI doesn’t hang indefinitely
      budgetReady = true;
    });
  const app = express();
  app.use(express.json());
  // Serve static assets (JS/CSS) from the public/ directory at project root
  app.use(express.static(path.join(__dirname, "..", "public")));

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

  const UI_AUTH_ENABLED = process.env.UI_AUTH_ENABLED !== "false";
  if (UI_AUTH_ENABLED) {
    const SECRET = process.env.ACTUAL_PASSWORD;
    if (!SECRET) {
      logger.error("ACTUAL_PASSWORD must be set to enable UI authentication");
      process.exit(1);
    }
    app.use(express.urlencoded({ extended: false }));
    app.use(
      cookieSession({
        name: "session",
        keys: [process.env.SESSION_SECRET || SECRET],
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: Boolean(process.env.SSL_KEY && process.env.SSL_CERT),
        sameSite: "strict",
      }),
    );

    const LOGIN_PATH = "/login";
    /* eslint-disable no-inner-declarations */
    function loginForm(error) {
      const templatePath = path.join(__dirname, "views", "login.ejs");
      const template = fs.readFileSync(templatePath, "utf8");
      return ejs.render(
        template,
        { error, LOGIN_PATH },
        { filename: templatePath },
      );
    }

    /* eslint-enable no-inner-declarations */
    app.get(LOGIN_PATH, (_req, res) => res.send(loginForm()));
    app.post(LOGIN_PATH, (req, res) => {
      if (req.body.password === SECRET) {
        req.session.authenticated = true;
        return res.redirect(req.query.next || "/");
      }
      return res.status(401).send(loginForm("Invalid password"));
    });

    app.use((req, res, next) => {
      if (req.session.authenticated) {
        return next();
      }
      return res.send(loginForm());
    });

    app.post("/logout", (req, res) => {
      req.session = null;
      res.redirect(LOGIN_PATH);
    });
  }

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
  const mappingFile =
    process.env.MAPPING_FILE || config.MAPPING_FILE || "./data/mapping.json";

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

  app.get("/", (_req, res) =>
    res.send(
      uiPageHtml(hadRefreshToken, refreshError, UI_AUTH_ENABLED, hasCookie),
    ),
  );

  app.get(
    "/api/data",
    asyncHandler(async (_req, res) => {
      // Read existing mappings
      let mapping = [];
      try {
        mapping = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
      } catch (_) {
        // no mapping file or invalid JSON
      }
      // Fetch Actual Budget accounts; fallback to empty on error
      let accountsList = [];
      try {
        accountsList = await api.getAccounts();
      } catch (err) {
        // If the budget isn’t loaded yet, skip accounts fetch; otherwise log error
        if (err && err.message === "No budget file is open") {
          logger.info("Budget not yet loaded; skipping accounts fetch");
        } else {
          logger.error({ err }, "Failed to fetch Actual Budget accounts");
        }
        accountsList = [];
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

  const server = app.listen(httpPort, () => {
    const realPort = server.address().port;
    logger.info({ port: realPort }, "Web UI server listening");
  });
  return server;
}

module.exports = { startWebUi, uiPageHtml };
