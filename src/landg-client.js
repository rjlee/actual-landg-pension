const fs = require("fs").promises;
const puppeteer = require("puppeteer");
const logger = require("./logger");

// In-memory coordination for awaiting 2FA code from UI
const serverState = {
  status: "idle", // 'idle' | 'awaiting-2fa' | 'logged-in' | 'error'
  error: null,
  value: null,
};

/**
 * Stub 2FA submit handler (not used for LG client)
 * @param {string} code
 */
/**
 * Receive 2FA code from UI and wake up scraper
 * @param {string} code one-time passcode from SMS
 */
function submitTwoFACode(code) {
  serverState.value = code;
  serverState.status = "idle";
}

/**
 * Fetch the pension value from Legal & General via headless browser, handling login and 2FA.
 * @param {{email: string, password: string, cookiesPath: string, timeout: number}} opts
 * @returns {Promise<number>} pension value as a float
 */
async function getPensionValue({
  email,
  password,
  cookiesPath,
  /* timeout = 60, */
  debug = false,
}) {
  // Reset any previous 2FA state (not used for LG)
  serverState.status = "idle";
  serverState.error = null;
  serverState.value = null;
  let browser;
  let page;
  try {
    // Launch Chrome: headful if debug, else headless
    const launchOptions = { headless: !debug };
    // If running in Docker, disable sandbox (many containers disallow Chrome sandbox)
    if (process.env.CHROME_DISABLE_SANDBOX) {
      launchOptions.args = ["--no-sandbox", "--disable-setuid-sandbox"];
    }
    // Allow overriding Chromium executable (e.g. system Chromium in Docker)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);
    page = await browser.newPage();
    // Emulate mobile Safari user-agent for Legal & General scraper
    await page.setUserAgent(
      process.env.LANDG_USER_AGENT ||
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_7_2 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1",
    );
    await page.setViewport({ width: 375, height: 812 });
    // Load cookies if available
    try {
      const cookiesJson = await fs.readFile(cookiesPath, "utf8");
      const cookies = JSON.parse(cookiesJson);
      await page.setCookie(...cookies);
    } catch (_err) {
      /* ignore missing or invalid cookies */
    }
    // Navigate to login
    await page.goto("https://myaccount.landg.com", {
      waitUntil: "networkidle2",
    });
    // Accept the OneTrust cookies banner if present
    try {
      // Wait briefly for the banner button to appear, then click
      await page.waitForSelector("#onetrust-accept-btn-handler", {
        timeout: 10000,
      });
      await page.click("#onetrust-accept-btn-handler");
    } catch (_err) {
      /* ignore if banner is not present or click fails */
    }
    // Fill credentials step one: wait for the email input and submit
    // Fill credentials step one by targeting the username field via data-testid
    await page.waitForSelector('input[data-testid="username"]', {
      timeout: 30000,
    });
    await page.type('input[data-testid="username"]', email);
    // Click the "Continue" button by matching its text via page function
    /* eslint-disable no-undef */
    await page.waitForFunction(
      () => {
        const b = Array.from(document.querySelectorAll("button")).find(
          (el) => el.textContent.trim() === "Continue",
        );
        if (b) b.click();
        return !!b;
      },
      { timeout: 10000 },
    );
    /* eslint-enable no-undef */

    // Fill credentials step two by targeting the password field via data-testid
    await page.waitForSelector('input[data-testid="password"]', {
      timeout: 30000,
    });
    await page.type('input[data-testid="password"]', password);
    // Click the "Log in" button by matching its text via page function
    /* eslint-disable no-undef */
    await page.waitForFunction(
      () => {
        const b = Array.from(document.querySelectorAll("button")).find(
          (el) => el.textContent.trim() === "Log in",
        );
        if (b) b.click();
        return !!b;
      },
      { timeout: 10000 },
    );
    /* eslint-enable no-undef */
    // Handle optional 2FA verification step (choose SMS and continue)
    try {
      // If the SMS vs Email step appears, choose SMS and continue
      await page.waitForSelector('lg-segment-button[data-testid="sms"]', {
        timeout: 5000,
      });
      await page.click('lg-segment-button[data-testid="sms"]');
      /* eslint-disable no-undef */
      await page.waitForFunction(
        () => {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (el) => el.textContent.trim() === "Continue",
          );
          if (btn) btn.click();
          return !!btn;
        },
        { timeout: 10000 },
      );
      /* eslint-enable no-undef */

      // Wait for verification code page and prompt user via UI
      const codeTimeout = (process.env.LANDG_2FA_TIMEOUT || 60) * 1000;
      await page.waitForSelector('input[data-testid="verification-code"]', {
        timeout: codeTimeout,
      });
      serverState.status = "awaiting-2fa";
      const code = await new Promise((resolve, reject) => {
        const kill = setTimeout(
          () => reject(new Error("2FA code timeout")),
          codeTimeout,
        );
        const poll = setInterval(() => {
          if (serverState.status === "error") {
            clearTimeout(kill);
            clearInterval(poll);
            return reject(new Error(serverState.error));
          }
          if (serverState.value) {
            clearTimeout(kill);
            clearInterval(poll);
            return resolve(serverState.value);
          }
        }, 500);
      });
      await page.type('input[data-testid="verification-code"]', code);
      /* eslint-disable no-undef */
      await page.waitForFunction(
        () => {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (el) => el.textContent.trim() === "Continue",
          );
          if (btn) btn.click();
          return !!btn;
        },
        { timeout: 10000 },
      );
      /* eslint-enable no-undef */
    } catch (_err) {
      // no-op if optional steps are not present or timeout occurs
    }
    // Extract total savings text from the page
    /* eslint-disable no-undef */
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("div")).some((d) =>
          d.textContent.trim().startsWith("Your total savings are"),
        ),
      { timeout: 10000 },
    );
    /* eslint-enable no-undef */
    /* eslint-disable no-undef */
    const rawText = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("div")).find((d) =>
        d.textContent.trim().startsWith("Your total savings are"),
      );
      return el ? el.textContent : "";
    });
    /* eslint-enable no-undef */
    const m = rawText.match(/£([\d,]+\.\d{2})/);
    if (!m) {
      throw new Error("Savings amount not found in text");
    }
    const value = parseFloat(m[1].replace(/,/g, ""));
    serverState.status = "logged-in";
    serverState.value = value;
    return value;
  } catch (err) {
    serverState.status = "error";
    serverState.error = err.message;
    if (debug) {
      logger.error(`Puppeteer error: ${serverState.error}`);
    }
    throw err;
  } finally {
    if (browser && !debug) {
      await browser.close();
    }
  }
}

module.exports = { getPensionValue, submitTwoFACode, serverState };
