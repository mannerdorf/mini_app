import { describe, expect, it } from "vitest";
import {
  adminUserMayOmitCustomerAssignment,
  adminUserRequiresCustomerAssignment,
} from "./adminUserCustomerBinding";

describe("adminUserCustomerBinding", () => {
  it("driver-only may omit customer", () => {
    expect(
      adminUserMayOmitCustomerAssignment({ driver: true, home: false, cargo: false }),
    ).toBe(true);
    expect(adminUserRequiresCustomerAssignment({ driver: true })).toBe(false);
  });

  it("driver with cargo requires customer", () => {
    expect(
      adminUserMayOmitCustomerAssignment({ driver: true, cargo: true }),
    ).toBe(false);
    expect(adminUserRequiresCustomerAssignment({ driver: true, cargo: true })).toBe(
      true,
    );
  });

  it("dispatcher-only may omit customer", () => {
    expect(adminUserMayOmitCustomerAssignment({ dispatcher: true })).toBe(true);
  });
});
