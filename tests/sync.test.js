const fs = require("fs");
const path = require("path");
const os = require("os");
// Mock budget open/close to avoid external API calls
jest.mock("../src/utils", () => ({
  openBudget: jest.fn().mockResolvedValue(),
  closeBudget: jest.fn().mockResolvedValue(),
}));
const { runSync } = require("../src/sync");
const logger = require("../src/logger");
const landgClient = require("../src/landg-client");
const api = require("@actual-app/api");

jest.mock("../src/landg-client");
jest.mock("@actual-app/api");

describe("runSync", () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mapping-"));
    process.env.MAPPING_FILE = path.join(tmpDir, "mapping.json");
    // reset mocks
    landgClient.getPensionValue.mockReset();
    api.getAccountBalance.mockReset();
    api.addTransactions.mockReset();
    api.getAccounts.mockReset();
    // prepare a mapping file with one account entry
    const mappingPath = path.resolve(process.cwd(), process.env.MAPPING_FILE);
    fs.mkdirSync(path.dirname(mappingPath), { recursive: true });
    fs.writeFileSync(
      mappingPath,
      JSON.stringify([{ accountId: "acct-1", lastBalance: 0 }], null, 2),
    );
    // mock Actual Budget accounts list to include our mapping account
    api.getAccounts.mockResolvedValue([{ id: "acct-1" }]);
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds a transaction when pension value changes", async () => {
    landgClient.getPensionValue.mockResolvedValue(1000);
    // api.getAccountBalance returns minor units (pence), so 90000 pence = £900
    api.getAccountBalance.mockResolvedValue(90000);
    api.addTransactions.mockResolvedValue();
    const count = await runSync({ verbose: false });
    expect(count).toBe(1);
    expect(api.addTransactions).toHaveBeenCalled();
    // amount should be converted from pounds to minor units (pence)
    const [acctId, txs] = api.addTransactions.mock.calls[0];
    expect(acctId).toBe("acct-1");
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(10000);
  });

  it("skips entries when account not found", async () => {
    landgClient.getPensionValue.mockResolvedValue(1000);
    api.getAccountBalance.mockResolvedValue(0);
    api.addTransactions.mockResolvedValue();
    api.getAccounts.mockResolvedValue([{ id: "other" }]);
    const count = await runSync();
    expect(count).toBe(0);
    expect(api.addTransactions).not.toHaveBeenCalled();
  });

  it("falls back to entry.lastBalance when getAccountBalance errors", async () => {
    landgClient.getPensionValue.mockResolvedValue(500);
    api.getAccounts.mockResolvedValue([{ id: "acct-1" }]);
    api.getAccountBalance.mockRejectedValue(new Error("balfail"));
    api.addTransactions.mockResolvedValue();
    const count = await runSync();
    expect(count).toBe(1);
    expect(api.addTransactions).toHaveBeenCalled();
  });

  it("creates payee when none exists and uses raw name on create failure", async () => {
    landgClient.getPensionValue.mockResolvedValue(250);
    api.getAccounts.mockResolvedValue([{ id: "acct-1" }]);
    api.getAccountBalance.mockResolvedValue(0);
    api.getPayees.mockResolvedValue([]);
    api.createPayee.mockRejectedValue(new Error("fail"));
    api.addTransactions.mockResolvedValue();
    const count = await runSync();
    expect(count).toBe(1);
    expect(api.createPayee).toHaveBeenCalledWith({
      name: "actual-landg-pension",
    });
    const [[, txs]] = api.addTransactions.mock.calls;
    expect(txs[0].payee).toBe("actual-landg-pension");
  });

  it("saves mapping atomically and logs on rename error", async () => {
    landgClient.getPensionValue.mockResolvedValue(300);
    api.getAccounts.mockResolvedValue([{ id: "acct-1" }]);
    api.getAccountBalance.mockResolvedValue(0);
    api.addTransactions.mockResolvedValue();
    // Prepare mapping file
    const mappingPath = process.env.MAPPING_FILE;
    fs.writeFileSync(
      mappingPath,
      JSON.stringify([{ accountId: "acct-1", lastBalance: 0 }]),
    );
    // Mock rename failure
    jest.spyOn(fs, "renameSync").mockImplementation(() => {
      throw new Error("rename err");
    });
    const errSpy = jest.spyOn(logger, "error").mockImplementation();
    const count = await runSync({ useLogger: true });
    expect(count).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), mappingPath }),
      "Failed to save mapping file atomically",
    );
    fs.renameSync.mockRestore();
    errSpy.mockRestore();
  });
});
