const request = require("supertest");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Stub out external modules
jest.mock("@actual-app/api");
jest.mock("../src/utils");
jest.mock("../src/sync");
jest.mock("../src/landg-client", () => ({
  getPensionValue: jest.fn().mockResolvedValue(),
  submitTwoFACode: jest.fn(),
  serverState: { status: "idle", error: null, value: null },
}));

const api = require("@actual-app/api");
const utils = require("../src/utils");
const sync = require("../src/sync");
const landgClient = require("../src/landg-client");
const { startWebUi } = require("../src/web-ui");

describe("Web UI server", () => {
  let server;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mapping-"));
  const mappingFile = path.join(tmpDir, "mapping.json");

  beforeAll(async () => {
    // Prepare mapping file directory via DATA_DIR
    process.env.DATA_DIR = tmpDir;
    // Ensure utils.openBudget resolves and sets budgetReady
    utils.openBudget.mockResolvedValue();
    utils.closeBudget.mockResolvedValue();
    // Stub Actual API accounts
    api.getAccounts.mockResolvedValue([
      { id: "acct-123", name: "Test Account" },
    ]);
    // Start server without auth
    process.env.UI_AUTH_ENABLED = "false";
    server = await startWebUi(0, false, false);
  });

  afterAll(() => {
    server.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_err) {
      /* ignore cleanup errors */
    }
  });

  test("GET /api/budget-status returns readiness", async () => {
    // wait for openBudget to settle
    await new Promise((r) => setTimeout(r, 0));
    const res = await request(server).get("/api/budget-status");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ready", true);
  });

  test("GET /api/data returns mapping, accounts, landg state", async () => {
    // Create initial mapping file
    fs.writeFileSync(
      mappingFile,
      JSON.stringify([{ accountId: "acct-123", lastBalance: 0 }]),
    );
    const res = await request(server).get("/api/data");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mapping: [{ accountId: "acct-123", lastBalance: 0 }],
      accounts: [{ id: "acct-123", name: "Test Account" }],
      landg: { status: landgClient.serverState.status },
    });
  });

  test("POST /api/mappings writes mapping file", async () => {
    const newMap = [{ accountId: "acct-123", lastBalance: 100 }];
    const res = await request(server)
      .post("/api/mappings")
      .send(newMap)
      .set("Content-Type", "application/json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const saved = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
    expect(saved).toEqual(newMap);
  });

  test("POST /api/sync triggers sync and returns count", async () => {
    sync.runSync.mockResolvedValue(5);
    const res = await request(server).post("/api/sync");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 5 });
  });

  test("GET / serves HTML", async () => {
    const res = await request(server).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/actual-landg-pension/);
    expect(res.text).toMatch(/<script src="\/js\/index.js"><\/script>/);
  });

  test("GET / shows Test Legal & General button in primary style", async () => {
    const res = await request(server).get("/");
    expect(res.status).toBe(200);
    // Button should use primary (blue) style and correct text
    expect(res.text).toMatch(/Test Legal & General/);
    expect(res.text).toMatch(/btn btn-primary/);
  });

  test("GET /api/data skips accounts when budget not loaded", async () => {
    // Simulate API throwing 'No budget file is open'
    api.getAccounts.mockRejectedValue(new Error("No budget file is open"));
    fs.writeFileSync(mappingFile, JSON.stringify([]));
    const res = await request(server).get("/api/data");
    expect(res.status).toBe(200);
    expect(res.body.accounts).toEqual([]);
  });

  test("POST /api/landg/login returns current landg status", async () => {
    // Simulate pending 2FA status
    landgClient.serverState.status = "awaiting-2fa";
    const res = await request(server).post("/api/landg/login");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "awaiting-2fa" });
  });

  test("POST /api/landg/2fa submits code and returns status", async () => {
    landgClient.serverState.status = "logged-in";
    const res = await request(server)
      .post("/api/landg/2fa")
      .send({ code: "123456" });
    expect(landgClient.submitTwoFACode).toHaveBeenCalledWith("123456");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "logged-in" });
  });

  test("GET /api/landg/status returns landg client state", async () => {
    // Mutate existing serverState so web-ui closure sees the change
    Object.assign(landgClient.serverState, {
      status: "idle",
      error: null,
      value: null,
    });
    const res = await request(server).get("/api/landg/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "idle", error: null, value: null });
  });
});
