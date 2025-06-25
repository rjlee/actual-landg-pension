const fs = require("fs");
const path = require("path");
const os = require("os");

describe("loadConfig", () => {
  let cwd;
  beforeEach(() => {
    cwd = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
    process.chdir(tmp);
    jest.resetModules();
  });
  afterEach(() => {
    process.chdir(cwd);
    jest.resetModules();
  });

  it("returns empty object when no config file exists", () => {
    const { loadConfig } = require("../src/config");
    expect(loadConfig()).toEqual({});
  });

  it("loads YAML config from config.yaml", () => {
    fs.writeFileSync("config.yaml", "FOO: bar\nNUM: 123");
    const { loadConfig } = require("../src/config");
    const cfg = loadConfig();
    expect(cfg.FOO).toBe("bar");
    expect(cfg.NUM).toBe(123);
  });

  it("loads YAML config from config.yml", () => {
    fs.writeFileSync("config.yml", "BAZ: qux\n");
    const { loadConfig } = require("../src/config");
    expect(loadConfig().BAZ).toBe("qux");
  });

  it("loads JSON config from config.json", () => {
    fs.writeFileSync("config.json", JSON.stringify({ A: 1, B: "two" }));
    const { loadConfig } = require("../src/config");
    const cfg = loadConfig();
    expect(cfg.A).toBe(1);
    expect(cfg.B).toBe("two");
  });
});
