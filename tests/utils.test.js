const fs = require("fs");
const path = require("path");
const api = require("@actual-app/api");
const { openBudget, closeBudget } = require("../src/utils");
jest.mock("@actual-app/api");

describe("openBudget", () => {
  const testDir = path.join(process.cwd(), "test-budget");
  beforeEach(() => {
    delete process.env.ACTUAL_SERVER_URL;
    delete process.env.ACTUAL_PASSWORD;
    delete process.env.ACTUAL_BUDGET_ID;
    delete process.env.BUDGET_CACHE_DIR;
    jest.resetAllMocks();
    if (fs.existsSync(testDir))
      fs.rmSync(testDir, { recursive: true, force: true });
  });
  afterEach(() => {
    delete process.env.ACTUAL_SERVER_URL;
    delete process.env.ACTUAL_PASSWORD;
    delete process.env.ACTUAL_BUDGET_ID;
    delete process.env.BUDGET_CACHE_DIR;
    jest.resetAllMocks();
    if (fs.existsSync(testDir))
      fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("throws error when required env vars are missing", async () => {
    await expect(openBudget()).rejects.toThrow(
      "Please set ACTUAL_SERVER_URL, ACTUAL_PASSWORD, and ACTUAL_BUDGET_ID environment variables",
    );
  });

  it("initializes budget and downloads via API", async () => {
    process.env.ACTUAL_SERVER_URL = "http://x";
    process.env.ACTUAL_PASSWORD = "pw";
    process.env.ACTUAL_BUDGET_ID = "bid";
    process.env.BUDGET_CACHE_DIR = testDir;

    api.init.mockResolvedValue();
    api.downloadBudget.mockResolvedValue();

    await openBudget();
    expect(fs.existsSync(testDir)).toBe(true);
    expect(api.init).toHaveBeenCalledWith({
      dataDir: testDir,
      serverURL: "http://x",
      password: "pw",
    });
    expect(api.downloadBudget).toHaveBeenCalledWith("bid", {});
  });
});

describe("closeBudget", () => {
  afterEach(() => jest.resetAllMocks());

  it("calls shutdown and resetBudgetCache if available", async () => {
    api.shutdown.mockResolvedValue();
    api.resetBudgetCache = jest.fn().mockResolvedValue();

    await closeBudget();
    expect(api.shutdown).toHaveBeenCalled();
    expect(api.resetBudgetCache).toHaveBeenCalled();
  });

  it("exits process on error", async () => {
    api.shutdown.mockRejectedValue(new Error("fail"));
    const exitSpy = jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(closeBudget()).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
