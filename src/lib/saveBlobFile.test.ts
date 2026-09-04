import { describe, expect, it } from "vitest";
import { sanitizeDownloadFileName } from "./saveBlobFile";

describe("sanitizeDownloadFileName", () => {
  it("keeps normal pdf names", () => {
    expect(sanitizeDownloadFileName("Raspiska 000142105.pdf")).toBe("Raspiska 000142105.pdf");
  });

  it("replaces path separators and illegal chars", () => {
    expect(sanitizeDownloadFileName("bad/name:test?.pdf")).toBe("bad_name_test_.pdf");
  });

  it("falls back for empty input", () => {
    expect(sanitizeDownloadFileName("   ")).toBe("document.pdf");
  });
});
