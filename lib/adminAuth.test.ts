import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminToken, getAdminTokenPayload, verifyAdminToken } from "./adminAuth.js";

afterEach(() => vi.unstubAllEnvs());

describe("admin signing configuration", () => {
  it("rejects creation and existing tokens when the secret is missing or blank", () => {
    vi.stubEnv("ADMIN_TOKEN_SECRET", "test-only-configured-secret");
    const token = createAdminToken(true, "admin@example.invalid");
    for (const secret of [undefined, "", "   "]) {
      vi.stubEnv("ADMIN_TOKEN_SECRET", secret);
      expect(() => createAdminToken()).toThrow("ADMIN_TOKEN_SECRET is required");
      expect(verifyAdminToken(token)).toBe(false);
      expect(getAdminTokenPayload(token)).toBeNull();
    }
  });
  it("accepts a configured token and rejects it after rotation or tampering", () => {
    vi.stubEnv("ADMIN_TOKEN_SECRET", "test-only-configured-secret");
    const token = createAdminToken(true, "admin@example.invalid");
    expect(verifyAdminToken(token)).toBe(true);
    expect(getAdminTokenPayload(token)?.login).toBe("admin@example.invalid");
    expect(verifyAdminToken(`${token}x`)).toBe(false);
    vi.stubEnv("ADMIN_TOKEN_SECRET", "rotated-test-only-secret");
    expect(verifyAdminToken(token)).toBe(false);
    expect(getAdminTokenPayload(token)).toBeNull();
  });
});
