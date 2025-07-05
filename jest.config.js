/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  collectCoverage: true,
  coverageDirectory: "coverage",
  coveragePathIgnorePatterns: ["<rootDir>/src/suppress.js"],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 60,
      lines: 75,
      statements: 75,
    },
  },
  testMatch: ["**/tests/**/*.test.js"],
};
