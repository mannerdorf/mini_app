import { describe, expect, it, vi } from "vitest";
import { assertPartnerDownloadCargoAccess } from "./partnerDownloadAccess.js";

describe("assertPartnerDownloadCargoAccess", () => {
  it("allows cargo when INN matches any account_companies row", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("cache_perevozki")) {
        return {
          rows: [{ data: [{ Number: "000141572", INN: "7707083893" }] }],
        };
      }
      if (sql.includes("account_companies")) {
        return { rows: [{ inn: "7707083893" }, { inn: "1234567890" }] };
      }
      return { rows: [] };
    });
    const pool = { query } as unknown as import("pg").Pool;

    const result = await assertPartnerDownloadCargoAccess(
      pool,
      { inn: "9999999999", accessAllInns: false },
      null,
      "user@test.com",
      "ЭР",
      "000141572",
    );

    expect(result).toEqual({ ok: true });
  });

  it("denies cargo when INN is not in account_companies", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("cache_perevozki")) {
        return {
          rows: [{ data: [{ Number: "000141572", INN: "7707083893" }] }],
        };
      }
      if (sql.includes("account_companies")) {
        return { rows: [{ inn: "1234567890" }] };
      }
      return { rows: [] };
    });
    const pool = { query } as unknown as import("pg").Pool;

    const result = await assertPartnerDownloadCargoAccess(
      pool,
      { inn: "9999999999", accessAllInns: false },
      null,
      "user@test.com",
      "ЭР",
      "000141572",
    );

    expect(result).toEqual({ ok: false, status: 404, error: "Перевозка не найдена или нет доступа" });
  });
});
