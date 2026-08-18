import { describe, expect, it } from "vitest";
import {
  applyCompanyInnsToScope,
  invertScopesByInn,
  loginAllowsPushInn,
  normalizeNotificationInn,
  resolvePushInnsForLogin,
  type PushLoginScope,
} from "./notificationInnScope.js";

describe("normalizeNotificationInn", () => {
  it("keeps digits only", () => {
    expect(normalizeNotificationInn("7820 0462 91")).toBe("7820046291");
    expect(normalizeNotificationInn("ИНН 7820046291")).toBe("7820046291");
  });
});

describe("resolvePushInnsForLogin", () => {
  it("uses registered INN only for a normal customer", () => {
    const { inns, serviceWide } = resolvePushInnsForLogin({
      registeredInn: "7820046291",
      companyInns: ["7707083893", "7820046291"],
      accessAllInns: false,
    });
    expect(serviceWide).toBe(false);
    expect([...inns]).toEqual(["7820046291"]);
  });

  it("does not broadcast all companies for service_mode without own INN", () => {
    const { inns, serviceWide } = resolvePushInnsForLogin({
      registeredInn: "",
      companyInns: ["7707083893", "7820046291"],
      accessAllInns: true,
      permissions: { service_mode: true },
    });
    expect(serviceWide).toBe(true);
    expect(inns.size).toBe(0);
  });

  it("service user with own INN only gets that INN", () => {
    const { inns } = resolvePushInnsForLogin({
      registeredInn: "7820046291",
      companyInns: ["7707083893", "390103058713"],
      accessAllInns: true,
    });
    expect([...inns]).toEqual(["7820046291"]);
    expect(resolvePushInnsForLogin({
      registeredInn: "7820046291",
      companyInns: ["7707083893"],
      accessAllInns: true,
    }).boundFromProfile).toBe(true);
  });

  it("keeps all bound companies for a normal user without profile INN", () => {
    const { inns, boundFromProfile } = resolvePushInnsForLogin({
      registeredInn: "",
      companyInns: ["7707083893", "7820046291"],
    });
    expect(boundFromProfile).toBe(false);
    expect([...inns].sort()).toEqual(["7707083893", "7820046291"]);
  });
});

describe("applyCompanyInnsToScope", () => {
  it("does not expand a profile-bound INN with the full directory", () => {
    const scope: PushLoginScope = {
      login: "autopiter",
      inns: new Set(["7820046291"]),
      serviceWide: false,
      boundFromProfile: true,
    };
    applyCompanyInnsToScope(scope, ["7707083893", "390103058713"]);
    expect([...scope.inns]).toEqual(["7820046291"]);
  });

  it("adds every company INN when the profile has no own INN", () => {
    const scope: PushLoginScope = {
      login: "multi",
      inns: new Set(),
      serviceWide: false,
      boundFromProfile: false,
    };
    applyCompanyInnsToScope(scope, ["7707083893", "7820046291"]);
    expect([...scope.inns].sort()).toEqual(["7707083893", "7820046291"]);
  });
});

describe("loginAllowsPushInn", () => {
  it("matches digits-only INN", () => {
    const scope: PushLoginScope = {
      login: "autopiter",
      inns: new Set(["7820046291"]),
      serviceWide: false,
      boundFromProfile: true,
    };
    expect(loginAllowsPushInn(scope, "ИНН 7820 046291")).toBe(true);
    expect(loginAllowsPushInn(scope, "7707083893")).toBe(false);
    expect(loginAllowsPushInn(undefined, "7820046291")).toBe(false);
  });
});

describe("invertScopesByInn", () => {
  it("indexes logins by INN", () => {
    const scopes = new Map<string, PushLoginScope>([
      ["a", { login: "a", inns: new Set(["7820046291"]), serviceWide: false, boundFromProfile: true }],
      ["b", { login: "b", inns: new Set(["7820046291", "1"]), serviceWide: false, boundFromProfile: false }],
    ]);
    const byInn = invertScopesByInn(scopes);
    expect(byInn.get("7820046291")?.sort()).toEqual(["a", "b"]);
  });
});
