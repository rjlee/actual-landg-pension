// Tests for logger configuration in src/logger.js
describe("logger", () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
    jest.resetModules();
  });

  it("defaults to info level when LOG_LEVEL is unset", () => {
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
    const logger = require("../src/logger");
    expect(logger.level).toBe("info");
  });

  it("uses LOG_LEVEL when provided", () => {
    process.env.LOG_LEVEL = "debug";
    delete process.env.NODE_ENV;
    jest.resetModules();
    const logger = require("../src/logger");
    expect(logger.level).toBe("debug");
  });

  it("silences logger when NODE_ENV is test", () => {
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = "test";
    jest.resetModules();
    const logger = require("../src/logger");
    expect(logger.level).toBe("silent");
  });
});
