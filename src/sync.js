const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const config = require("./config");
const { getPensionValue } = require("./landg-client");
const { openBudget, closeBudget } = require("./utils");
const api = require("@actual-app/api");
// Use addTransactions for raw imports (with imported_payee)

/**
 * Sync Legal & General pension value to Actual Budget accounts.
 * @param {{verbose?: boolean, useLogger?: boolean, debug?: boolean}} options
 * @returns {Promise<number>} Number of transactions applied
 */
async function runSync({
  verbose = false,
  useLogger = false,
  debug = false,
} = {}) {
  const log =
    verbose || useLogger
      ? logger
      : { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} };
  const cwd = process.cwd();
  const mappingFile =
    process.env.MAPPING_FILE || config.MAPPING_FILE || "./data/mapping.json";
  const mappingPath = path.isAbsolute(mappingFile)
    ? mappingFile
    : path.join(cwd, mappingFile);

  // Load or initialize mapping entries
  let mapping = [];
  try {
    const data = fs.readFileSync(mappingPath, "utf8");
    mapping = JSON.parse(data);
  } catch (err) {
    log.warn(
      { err, mappingPath },
      "Failed to load or parse mapping file; starting with empty mapping",
    );
    mapping = [];
  }
  if (verbose)
    log.debug({ mappingPath, count: mapping.length }, "Loaded mapping entries");

  // Open Actual Budget
  try {
    log.info("Opening Actual Budget");
    await openBudget();
  } catch (err) {
    log.error({ err }, "Failed to open budget; aborting sync");
    return 0;
  }
  try {
    log.info("Syncing budget before operations");
    await api.sync();
  } catch {
    /* ignore sync errors */
  }

  let applied = 0;
  try {
    // Fetch available Actual accounts
    const accounts = await api.getAccounts();
    const accountIds = accounts.map((a) => a.id);

    // Fetch current pension value from Legal & General
    const current = await getPensionValue({
      email: process.env.LANDG_EMAIL,
      password: process.env.LANDG_PASSWORD,
      cookiesPath: process.env.LANDG_COOKIES_FILE,
      timeout: parseInt(process.env.LANDG_2FA_TIMEOUT, 10) || 60,
      debug,
    });
    // Process each mapped entry
    for (const entry of mapping) {
      const acctId = entry.accountId;
      if (!accountIds.includes(acctId)) {
        log.warn({ accountId: acctId }, "Actual account not found; skipping");
        continue;
      }
      // Fetch current Actual budget balance (minor units) and convert to major units, or fallback to lastBalance
      let last = 0;
      try {
        const lastMinor = await api.getAccountBalance(acctId, new Date());
        last = lastMinor / 100;
      } catch (err) {
        log.warn(
          { accountId: acctId, err },
          "Unable to fetch budget balance; falling back to stored lastBalance",
        );
        last = typeof entry.lastBalance === "number" ? entry.lastBalance : 0;
      }
      const delta = current - last;
      if (delta === 0) continue;
      log.info({ delta }, "Syncing pension change");
      // Create or find a payee for imported transactions
      const PAYEE_NAME = "actual-landg-pension";
      // Fetch existing payees (fallback to empty array on error or invalid response)
      let payees = [];
      try {
        const result = await api.getPayees();
        payees = Array.isArray(result) ? result : [];
      } catch {
        /* ignore errors fetching payees */
      }
      let payeeId = payees.find((p) => p.name === PAYEE_NAME)?.id;
      if (!payeeId) {
        try {
          payeeId = await api.createPayee({ name: PAYEE_NAME });
        } catch (err) {
          log.warn(
            { err, PAYEE_NAME },
            "Failed to create payee; using raw name",
          );
        }
      }
      const tx = {
        id: `landg-${acctId}-${Date.now()}`,
        date: new Date(),
        // Convert pounds delta to minor currency units (pence)
        amount: Math.round(delta * 100),
        payee: payeeId || PAYEE_NAME,
        imported_payee: PAYEE_NAME,
      };
      await api.addTransactions(acctId, [tx], {
        runTransfers: false,
        learnCategories: false,
      });
      entry.lastBalance = current;
      applied++;
    }

    // Save updated mapping atomically
    try {
      const tmpFile = `${mappingPath}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(mapping, null, 2));
      fs.renameSync(tmpFile, mappingPath);
    } catch (err) {
      log.error({ err, mappingPath }, "Failed to save mapping file atomically");
    }
    log.info({ applied }, "Completed pot sync");
    try {
      log.info("Syncing budget after pot sync");
      await api.sync();
      log.info("Budget sync complete");
    } catch (err) {
      log.warn({ err }, "Budget sync after pot sync failed");
    }
  } catch (err) {
    log.error({ err }, "Error during sync");
  } finally {
    await closeBudget();
  }
  return applied;
}

module.exports = { runSync };
