/**
 * Error Boundary Tests
 */

describe("Error Boundary System", () => {
  let errorBoundary;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      users: {
        fetch: jest.fn(),
      },
    };

    const ErrorBoundary = require("../utils/errorBoundary");
    errorBoundary = new ErrorBoundary(mockClient);
  });

  describe("Command Wrapping", () => {
    test("should execute successful command", async () => {
      const mockCommand = jest.fn().mockResolvedValue({ success: true });

      const result = await errorBoundary.wrapCommand("test_cmd", mockCommand);

      expect(result.success).toBe(true);
      expect(mockCommand).toHaveBeenCalled();
    });

    test("should catch and handle command errors", async () => {
      const mockCommand = jest.fn().mockRejectedValue(new Error("Test error"));

      const result = await errorBoundary.wrapCommand("test_cmd", mockCommand);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Test error");
    });

    test("should retry on recoverable error", async () => {
      let callCount = 0;
      const mockCommand = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("SQLITE_BUSY"));
        }
        return Promise.resolve({ success: true });
      });

      const result = await errorBoundary.wrapCommand("test_cmd", mockCommand);

      expect(result.success).toBe(true);
      expect(mockCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe("Circuit Breaker", () => {
    test("should open circuit after threshold failures", async () => {
      const mockCommand = jest.fn().mockRejectedValue(new Error("Test error"));

      // Trigger multiple failures
      for (let i = 0; i < 5; i++) {
        await errorBoundary.wrapCommand("failing_cmd", mockCommand);
      }

      expect(errorBoundary.isCircuitBroken("failing_cmd")).toBe(true);
    });

    test("should reset circuit breaker on success", async () => {
      const mockCommand = jest.fn().mockResolvedValue({ success: true });

      await errorBoundary.wrapCommand("test_cmd", mockCommand);

      expect(errorBoundary.isCircuitBroken("test_cmd")).toBe(false);
    });
  });

  describe("User-Friendly Errors", () => {
    test("should convert permission error", () => {
      const error = new Error("Missing permission: MANAGE_CHANNELS");
      const message = errorBoundary.getUserFriendlyError(error);

      expect(message).toContain("permission");
    });

    test("should convert timeout error", () => {
      const error = new Error("Request timed out");
      const message = errorBoundary.getUserFriendlyError(error);

      expect(message).toContain("too long");
    });
  });

  describe("Error Statistics", () => {
    test("should track error stats", async () => {
      const mockCommand = jest.fn().mockRejectedValue(new Error("Test"));

      await errorBoundary.wrapCommand("test_cmd", mockCommand);
      await errorBoundary.wrapCommand("test_cmd", mockCommand);

      const stats = errorBoundary.getStats();

      expect(stats.totalErrors).toBeGreaterThan(0);
      expect(stats.commandErrors["test_cmd"]).toBe(2);
    });
  });
});
