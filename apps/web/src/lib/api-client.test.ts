/**
 * Web boundary tests (TESTING.md §4): the api-client must validate env at the
 * boundary and surface upstream failures as errors, never silent success.
 */
import { describe, it, expect } from "vitest";
import { apiBaseUrl } from "./api-client";

describe("web -> api integration boundary", () => {
  it("uses API_BASE_URL when valid", () => {
    process.env.API_BASE_URL = "http://127.0.0.1:3999";
    expect(apiBaseUrl()).toBe("http://127.0.0.1:3999");
    delete process.env.API_BASE_URL;
  });

  it("rejects a malformed API_BASE_URL instead of booting blind", () => {
    process.env.API_BASE_URL = "not-a-url";
    expect(() => apiBaseUrl()).toThrow();
    delete process.env.API_BASE_URL;
  });

  it("falls back to the documented dev default", () => {
    delete process.env.API_BASE_URL;
    expect(apiBaseUrl()).toBe("http://localhost:3001");
  });
});
