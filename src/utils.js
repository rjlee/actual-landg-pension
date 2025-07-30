require("dotenv").config();
const fs = require("fs");
const path = require("path");
const api = require("@actual-app/api");
const logger = require("./logger");
const config = require("./config");

let hasDownloadedBudget = false;

async function openBudget() {
  const url = process.env.ACTUAL_SERVER_URL;
  const password = process.env.ACTUAL_PASSWORD;
  const syncId = process.env.ACTUAL_SYNC_ID;
  if (!url || !password || !syncId) {
    throw new Error(
      "Please set ACTUAL_SERVER_URL, ACTUAL_PASSWORD, and ACTUAL_SYNC_ID environment variables",
    );
  }
  const baseDataDir = process.env.DATA_DIR || config.DATA_DIR || "./data";
  const budgetDir =
    process.env.BUDGET_DIR ||
    process.env.BUDGET_CACHE_DIR ||
    path.join(baseDataDir, "budget");

  fs.mkdirSync(budgetDir, { recursive: true });

  logger.info("Connecting to Actual API...");
  await api.init({ dataDir: budgetDir, serverURL: url, password });

  const opts = {};
  const budgetPassword = process.env.ACTUAL_BUDGET_ENCRYPTION_PASSWORD;
  if (budgetPassword) opts.password = budgetPassword;

  if (!hasDownloadedBudget) {
    logger.info("Downloading budget (no backup)...");
    try {
      await api.downloadBudget(syncId, opts);
      logger.info("Budget downloaded");
      hasDownloadedBudget = true;
    } catch (err) {
      // keep hasDownloadedBudget=false so we retry download on next open
      hasDownloadedBudget = false;
      logger.warn({ err }, "Failed to download budget");
    }
  }

  logger.info("Syncing budget changes...");
  try {
    await api.sync();
    logger.info("Budget synced");
  } catch (err) {
    // if cache is missing or invalid, allow re-download next time
    if (err && err.message === "No budget file is open") {
      hasDownloadedBudget = false;
    }
    logger.warn({ err }, "Failed to sync budget");
  }
}

async function closeBudget() {
  hasDownloadedBudget = false;
  try {
    await api.shutdown();
    if (typeof api.resetBudgetCache === "function") {
      await api.resetBudgetCache();
    }
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

module.exports = { openBudget, closeBudget };
