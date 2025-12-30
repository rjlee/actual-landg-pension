// Tests for CLI entrypoint main in src/index.js
jest.mock("yargs/yargs", () => {
  const config = require("../src/config");
  return jest.fn((args = []) => {
    const parsed = {
      mode: config.mode || "sync",
      ui: false,
      verbose: false,
      httpPort: parseInt(
        config.httpPort ?? config.HTTP_PORT ?? process.env.HTTP_PORT ?? 3000,
        10,
      ),
      debug: false,
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
          parsed.mode = next() || parsed.mode;
          break;
        case "--ui":
          parsed.ui = true;
          break;
        case "--verbose":
        case "-v":
          parsed.verbose = true;
          break;
        case "--http-port": {
          const val = parseInt(next(), 10);
          if (!Number.isNaN(val)) parsed.httpPort = val;
          break;
        }
        case "--debug":
        case "-d":
          parsed.debug = true;
          break;
        default:
          break;
      }
    }
    const builder = {
      option: () => builder,
      help: () => builder,
    };
    Object.defineProperty(builder, "argv", {
      get() {
        return parsed;
      },
    });
    return builder;
  });
});

jest.mock("../src/sync", () => ({
  runSync: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/daemon", () => ({
  runDaemon: jest.fn().mockResolvedValue(),
}));
jest.mock("../src/logger", () => ({ info: jest.fn(), level: "info" }));

const { main } = require("../src/index");
const { runSync } = require("../src/sync");
const { runDaemon } = require("../src/daemon");
const logger = require("../src/logger");

describe("CLI main", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logger.info.mockClear();
    logger.level = "info";
  });

  it("runs sync mode when --mode sync is specified", async () => {
    await main(["--mode", "sync"]);
    expect(runSync).toHaveBeenCalledWith({ verbose: false, debug: false });
    expect(logger.info).toHaveBeenCalledWith(
      { mode: "sync" },
      "Service starting",
    );
  });

  it("runs daemon mode when --mode daemon is specified with flags", async () => {
    await main([
      "--mode",
      "daemon",
      "--verbose",
      "--ui",
      "--http-port",
      "1234",
    ]);
    expect(runDaemon).toHaveBeenCalledWith({
      verbose: true,
      ui: true,
      httpPort: 1234,
      debug: false,
    });
  });

  it("sets logger level to debug when --verbose is specified", async () => {
    await main(["--mode", "sync", "--verbose"]);
    expect(logger.level).toBe("debug");
  });
});
