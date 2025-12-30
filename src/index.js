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

/**
 * Main CLI entrypoint: dispatch to sync or daemon.
 * @param {string[]} args Command-line arguments
 */
async function main(args = process.argv.slice(2)) {
  // Pin to the CommonJS build (the ESM default trips Jest's CJS runtime).
  const argv = require("yargs/build/lib/yargs.js")(args)
    .option("mode", {
      alias: "m",
      choices: ["sync", "daemon"],
      default: config.mode || "sync",
      describe: "Mode to run",
    })
    .option("ui", {
      type: "boolean",
      default: false,
      describe:
        "Start web UI server (daemon mode only; also enabled by HTTP_PORT)",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Enable verbose logging",
    })
    .option("http-port", {
      type: "number",
      default: parseInt(
        config.httpPort ?? config.HTTP_PORT ?? process.env.HTTP_PORT ?? 3000,
        10,
      ),
      describe: "Port for web UI server",
    })
    .option("debug", {
      alias: "d",
      type: "boolean",
      default: false,
      describe: "Launch Puppeteer in headful (debug) mode",
    })
    .help().argv;

  const { mode, ui, httpPort, verbose, debug } = argv;
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
