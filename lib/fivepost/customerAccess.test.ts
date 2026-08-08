import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isFivepostCustomer, isFivepostCustomerName } from "./customerAccess";

describe("isFivepostCustomerName", () => {
  it("matches common 5 POST customer names", () => {
    expect(isFivepostCustomerName("5 POST")).toBe(true);
    expect(isFivepostCustomerName("ООО 5 POST OMNI")).toBe(true);
    expect(isFivepostCustomerName("Five Post Logistics")).toBe(true);
    expect(isFivepostCustomerName("АВТОПИТЕР")).toBe(false);
  });
});

describe("isFivepostCustomer", () => {
  const prev = process.env.FIVEPOST_CUSTOMER_INNS;

  beforeEach(() => {
    process.env.FIVEPOST_CUSTOMER_INNS = "7707083893, 1234567890";
  });

  afterEach(() => {
    if (prev == null) delete process.env.FIVEPOST_CUSTOMER_INNS;
    else process.env.FIVEPOST_CUSTOMER_INNS = prev;
  });

  it("allows by INN allowlist", () => {
    expect(isFivepostCustomer("7707083893", "АВТОПИТЕР")).toBe(true);
  });

  it("allows by customer name when INN is not in allowlist", () => {
    expect(isFivepostCustomer("9999999999", "5 POST")).toBe(true);
  });

  it("denies unrelated customers", () => {
    expect(isFivepostCustomer("9999999999", "АВТОПИТЕР")).toBe(false);
  });

  it("allows default 5 POST INN when env is empty", () => {
    delete process.env.FIVEPOST_CUSTOMER_INNS;
    expect(isFivepostCustomer("7722461620", "АВТОПИТЕР")).toBe(true);
  });
});
