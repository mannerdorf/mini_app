import { describe, expect, it, vi } from "vitest";
import { assertPartnerDownloadCargoAccess } from "./partnerDownloadAccess.js";

describe("assertPartnerDownloadCargoAccess", () => {
  it("allows cargo when user is receiver by ReceiverINN (not Customer INN)", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("cache_perevozki")) {
        return {
          rows: [
            {
              data: [
                {
                  Number: "000141572",
                  INN: "3900000000",
                  CustomerINN: "3900000000",
                  ReceiverINN: "390103058713",
                  Customer: "ПОЛЕСЬЕ",
                  Receiver: "Кудрявцева Елена Юрьевна",
                },
              ],
            },
          ],
        };
      }
      if (sql.includes("account_companies")) {
        return { rows: [{ inn: "390103058713" }] };
      }
      if (sql.includes("cache_customers") || sql.includes("account_companies where trim")) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const pool = { query } as unknown as import("pg").Pool;

    const result = await assertPartnerDownloadCargoAccess(
      pool,
      { inn: "3900000000", accessAllInns: false },
      null,
      "user@test.com",
      "ЭР",
      "000141572",
    );

    expect(result).toEqual({ ok: true });
  });

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
