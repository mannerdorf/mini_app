import { describe, expect, it } from "vitest";
import { formatDateDocForDownloadApi } from "./downloadDocumentDirect";

describe("formatDateDocForDownloadApi", () => {
  it("formats ISO date", () => {
    expect(formatDateDocForDownloadApi("2026-03-15")).toBe("2026-03-15T00:00:00");
  });

  it("formats RU date", () => {
    expect(formatDateDocForDownloadApi("15.03.2026")).toBe("2026-03-15T00:00:00");
  });
});
