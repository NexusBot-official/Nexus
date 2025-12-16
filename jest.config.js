module.exports = {
  testEnvironment: "node",
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "utils/**/*.js",
    "commands/**/*.js",
    "events/**/*.js",
    "!**/node_modules/**",
  ],
  testMatch: ["**/tests/**/*.test.js"],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  verbose: true,
  testTimeout: 10000,
};
