#!/usr/bin/env node
require("./suppress");
require("dotenv").config();
const logger = require("./logger");

// Prevent daemon from crashing on unhandled promise rejections (e.g. budget download errors)
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

const config = require("./config");
const { runSync } = require("./sync");
const { runDaemon } = require("./daemon");

function parseArgs(args) {
  const parsed = {
    mode: undefined,
    ui: undefined,
    verbose: undefined,
    httpPort: undefined,
    debug: undefined,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      if (i + 1 < args.length) {
        i += 1;
        return args[i];
      }
      return undefined;
    };
    switch (arg) {
      case "--mode":
      case "-m":
        parsed.mode = next();
        break;
      case "--ui":
        parsed.ui = true;
        break;
      case "--verbose":
      case "-v":
        parsed.verbose = true;
        break;
      case "--http-port":
        parsed.httpPort = parseInt(next(), 10);
        break;
      case "--debug":
      case "-d":
        parsed.debug = true;
        break;
      default:
        break;
    }
  }
  return parsed;
}

/**
 * Main CLI entrypoint: dispatch to sync or daemon.
 * @param {string[]} args Command-line arguments
 */
async function main(args = process.argv.slice(2)) {
  const defaults = {
    mode: config.mode || "sync",
    ui: false,
    verbose: false,
    httpPort: parseInt(
      config.httpPort ?? config.HTTP_PORT ?? process.env.HTTP_PORT ?? 3000,
      10,
    ),
    debug: false,
  };

  const overrides = parseArgs(args);
  const mode = overrides.mode || defaults.mode;
  if (!["sync", "daemon"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  const ui = overrides.ui ?? defaults.ui;
  const verbose = overrides.verbose ?? defaults.verbose;
  const debug = overrides.debug ?? defaults.debug;
  const httpPort =
    Number.isInteger(overrides.httpPort) && overrides.httpPort > 0
      ? overrides.httpPort
      : defaults.httpPort;

  logger.info({ mode }, "Service starting");
  if (verbose) {
    logger.level = "debug";
  }
  switch (mode) {
    case "sync":
      await runSync({ verbose, debug });
      break;

    case "daemon":
      await runDaemon({ verbose, ui, httpPort, debug });
      break;
  }
}

if (require.main === module) {
  main().catch((err) => {
    logger.error({ err }, err.message);
    process.exit(1);
  });
}

module.exports = { main };
