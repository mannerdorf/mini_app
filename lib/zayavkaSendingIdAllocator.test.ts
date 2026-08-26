import { describe, expect, it } from "vitest";
import {
  buildSendingIdCandidate,
  customerSendingIdPrefix,
  normalizeCustomerInnForSendingId,
} from "./zayavkaSendingIdAllocator.js";

describe("zayavkaSendingIdAllocator", () => {
  it("builds 16-char id with customer prefix", () => {
    const id = buildSendingIdCandidate("7722461620");
    expect(id).toHaveLength(16);
    expect(id.startsWith(customerSendingIdPrefix("7722461620"))).toBe(true);
  });

  it("normalizes customer inn", () => {
    expect(normalizeCustomerInnForSendingId("77 22-461620")).toBe("7722461620");
  });
});
