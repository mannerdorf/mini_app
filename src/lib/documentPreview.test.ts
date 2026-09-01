import { describe, expect, it, vi } from "vitest";
import { createPdfPreviewFromBlob, revokePdfPreview } from "./documentPreview";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    convertFileSrc: (uri: string) => uri,
  },
}));

describe("createPdfPreviewFromBlob", () => {
  it("creates blob URL on web", async () => {
    const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const preview = await createPdfPreviewFromBlob(blob, "test doc.pdf");

    expect(preview.name).toBe("test doc.pdf");
    expect(preview.downloadFileName).toBe("test doc.pdf");
    expect(preview.url).toMatch(/^blob:/);
    expect(preview.blob).toBe(blob);

    await revokePdfPreview(preview);
  });

  it("sanitizes unsafe file names", async () => {
    const blob = new Blob(["x"], { type: "application/pdf" });
    const preview = await createPdfPreviewFromBlob(blob, "bad/name?.pdf");
    expect(preview.downloadFileName).toBe("bad_name_.pdf");
    await revokePdfPreview(preview);
  });
});
