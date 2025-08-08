const puppeteer = require("puppeteer");
const logger = require("../src/logger");
const { getPensionValue, submitTwoFACode } = require("../src/landg-client");

jest.mock("puppeteer");

describe("Legal & General Client", () => {
  let browser;
  let page;

  beforeEach(() => {
    page = {
      goto: jest.fn(),
      setUserAgent: jest.fn(),
      setViewport: jest.fn(),
      setCookie: jest.fn().mockResolvedValue(),
      reload: jest.fn(),
      waitForSelector: jest.fn().mockResolvedValue(),
      click: jest.fn(),
      type: jest.fn(),
      cookies: jest.fn().mockResolvedValue([]),
      close: jest.fn(),
      screenshot: jest.fn().mockResolvedValue(),
    };
    browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn(),
    };
    puppeteer.launch = jest.fn().mockResolvedValue(browser);
    // Stub out waitForFunction and page.evaluate for savings extraction
    // Stub out page.waitForFunction (button clicks + savings ready) and evaluation of savings text
    page.waitForFunction = jest.fn().mockResolvedValue(true);
    page.evaluate = jest
      .fn()
      .mockResolvedValue("Your total savings are £1,234.56");
  });

  it("should scrape pension value and return a number", async () => {
    // Simulate found savings text via XPath + evaluate
    // (page.$x and page.evaluate are stubbed in beforeEach)
    // simulate user-entered 2FA code asynchronously so scraper picks it up after reset
    setImmediate(() => submitTwoFACode("123456"));
    const value = await getPensionValue({
      email: "x",
      password: "y",
      cookiesPath: "/tmp/foo",
    });
    expect(typeof value).toBe("number");
    expect(value).toBeCloseTo(1234.56);
    // Verify browser launch and teardown
    expect(puppeteer.launch).toHaveBeenCalled();
    expect(browser.newPage).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();

    // Verify login steps: username & password
    expect(page.waitForSelector).toHaveBeenCalledWith(
      'input[data-testid="username"]',
      { timeout: 30000 },
    );
    expect(page.type).toHaveBeenCalledWith(
      'input[data-testid="username"]',
      "x",
    );
    expect(page.waitForSelector).toHaveBeenCalledWith(
      'input[data-testid="password"]',
      { timeout: 30000 },
    );
    expect(page.type).toHaveBeenCalledWith(
      'input[data-testid="password"]',
      "y",
    );

    // Five calls to click buttons (SMS Continue + Email Continue + Code Continue + Login + savings)
    expect(page.waitForFunction).toHaveBeenCalledTimes(5);
    expect(page.evaluate).toHaveBeenCalled();
  });
  describe("error handling and debug logging", () => {
    let loggerError;
    beforeEach(() => {
      loggerError = jest.spyOn(logger, "error").mockImplementation();
    });
    afterEach(() => loggerError.mockRestore());

    it("throws if puppeteer launch fails", async () => {
      const err = new Error("launch fail");
      puppeteer.launch.mockRejectedValue(err);
      await expect(
        getPensionValue({ email: "x", password: "y", cookiesPath: "/tmp" }),
      ).rejects.toThrow(err);
      expect(loggerError).not.toHaveBeenCalled();
    });

    it("logs error in debug mode", async () => {
      const err = new Error("launch fail");
      puppeteer.launch.mockRejectedValue(err);
      await expect(
        getPensionValue({
          email: "x",
          password: "y",
          cookiesPath: "/tmp",
          debug: true,
        }),
      ).rejects.toThrow(err);
      expect(loggerError).toHaveBeenCalledWith(
        `Puppeteer error: ${err.message}`,
      );
    });

    it("throws if savings not found", async () => {
      puppeteer.launch.mockResolvedValue(browser);
      page.waitForFunction.mockResolvedValue(true);
      page.evaluate.mockResolvedValue("Your total savings are");
      // simulate user-entered 2FA code asynchronously so scraper picks it up
      setImmediate(() => submitTwoFACode("000000"));
      await expect(
        getPensionValue({ email: "x", password: "y", cookiesPath: "/tmp" }),
      ).rejects.toThrow("Savings amount not found in text");
    });

    it("ignores OneTrust banner errors and proceeds", async () => {
      puppeteer.launch.mockResolvedValue(browser);
      // Simulate missing banner then login/savings succeed
      page.waitForSelector = jest
        .fn()
        .mockRejectedValueOnce(new Error("banner missing"))
        .mockResolvedValue(true);
      page.waitForFunction.mockResolvedValue(true);
      page.evaluate.mockResolvedValue("Your total savings are £1,234.56");
      // simulate user-entered 2FA code asynchronously so scraper picks it up
      setImmediate(() => submitTwoFACode("000000"));
      await expect(
        getPensionValue({ email: "x", password: "y", cookiesPath: "/tmp" }),
      ).resolves.toBeCloseTo(1234.56);
      expect(page.waitForSelector).toHaveBeenCalled();
      expect(page.waitForFunction).toHaveBeenCalled();
    });
  });
});

// Additional tests covering banner fallback and debug-mode teardown
describe("login flow fallbacks and debug close", () => {
  let browser, page;
  beforeEach(() => {
    page = {
      goto: jest.fn(),
      setUserAgent: jest.fn().mockResolvedValue(),
      setViewport: jest.fn().mockResolvedValue(),
      waitForSelector: jest
        .fn()
        .mockRejectedValueOnce(new Error("banner missing"))
        .mockResolvedValue(true),
      waitForFunction: jest.fn().mockResolvedValue(true),
      evaluate: jest.fn().mockResolvedValue("Your total savings are £1,234.56"),
      type: jest.fn(),
    };
    browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    puppeteer.launch = jest.fn().mockResolvedValue(browser);
  });

  it("ignores OneTrust banner errors and proceeds", async () => {
    const val = await getPensionValue({
      email: "x",
      password: "y",
      cookiesPath: "/tmp",
    });
    expect(val).toBeCloseTo(1234.56);
    expect(page.waitForSelector).toHaveBeenCalled();
    expect(page.waitForFunction).toHaveBeenCalled();
  });

  it("skips browser.close() in debug mode", async () => {
    const err = new Error("fail");
    puppeteer.launch.mockRejectedValue(err);
    await expect(
      getPensionValue({
        email: "x",
        password: "y",
        cookiesPath: "/tmp",
        debug: true,
      }),
    ).rejects.toThrow(err);
    expect(browser.close).not.toHaveBeenCalled();
  });
});

describe("configuration branches", () => {
  let fsPromises;
  let browser;
  let page;
  beforeEach(() => {
    page = {
      goto: jest.fn(),
      setUserAgent: jest.fn().mockResolvedValue(),
      setViewport: jest.fn().mockResolvedValue(),
      type: jest.fn(),
      waitForSelector: jest.fn().mockResolvedValue(true),
      waitForFunction: jest.fn().mockResolvedValue(true),
      evaluate: jest.fn().mockResolvedValue("Your total savings are £1,234.56"),
    };
    browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    puppeteer.launch = jest.fn().mockResolvedValue(browser);
  });
  beforeAll(() => {
    fsPromises = require("fs").promises;
  });
  afterAll(() => {
    delete process.env.CHROME_DISABLE_SANDBOX;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.LANDG_USER_AGENT;
  });

  it("adds sandbox args when CHROME_DISABLE_SANDBOX set", async () => {
    process.env.CHROME_DISABLE_SANDBOX = "1";
    puppeteer.launch.mockClear();
    await getPensionValue({ email: "x", password: "y", cookiesPath: "/tmp" });
    const opts = puppeteer.launch.mock.calls[0][0];
    expect(opts.args).toEqual(["--no-sandbox", "--disable-setuid-sandbox"]);
  });

  it("uses custom executablePath when PUPPETEER_EXECUTABLE_PATH set", async () => {
    process.env.PUPPETEER_EXECUTABLE_PATH = "/foo/bar";
    puppeteer.launch.mockClear();
    await getPensionValue({ email: "x", password: "y", cookiesPath: "/tmp" });
    const opts = puppeteer.launch.mock.calls[0][0];
    expect(opts.executablePath).toBe("/foo/bar");
  });

  it("sets custom user-agent when LANDG_USER_AGENT provided", async () => {
    process.env.LANDG_USER_AGENT = "CustomAgent";
    page.setUserAgent = jest.fn().mockResolvedValue();
    await getPensionValue({ email: "x", password: "y", cookiesPath: "/tmp" });
    expect(page.setUserAgent).toHaveBeenCalledWith("CustomAgent");
  });

  it("ignores errors loading initial cookies", async () => {
    jest.spyOn(fsPromises, "readFile").mockRejectedValue(new Error("no file"));
    page.setCookie = jest.fn().mockResolvedValue();
    page.waitForFunction.mockResolvedValue(true);
    page.evaluate.mockResolvedValue("Your total savings are £123.45");
    const val = await getPensionValue({
      email: "x",
      password: "y",
      cookiesPath: "/tmp",
    });
    expect(val).toBeCloseTo(123.45);
    expect(page.setCookie).not.toHaveBeenCalled();
    fsPromises.readFile.mockRestore();
  });
});
