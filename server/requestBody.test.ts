import type { IncomingMessage } from "node:http";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { readRequestBody, requestBodyLimit } from "./vercelAdapter.js";
function bodyStream(length?: string) {
  return Object.assign(new PassThrough(), { method: "POST", url: "/api/pickup", headers: { "content-type": "application/json", "content-length": length } }) as unknown as IncomingMessage & PassThrough;
}
describe("request body limits", () => {
  it("rejects an oversized declared body before reading", async () => {
    const req = bodyStream("100");
    await expect(readRequestBody(req, { maxBytes: 10 })).rejects.toMatchObject({ status: 413 });
    expect(req.listenerCount("data")).toBe(0);
  });
  it("stops buffering chunked content immediately at the limit", async () => {
    const req = bodyStream();
    const result = readRequestBody(req, { maxBytes: 5 });
    req.write("1234"); req.write("56");
    await expect(result).rejects.toMatchObject({ status: 413 });
    expect(req.isPaused()).toBe(true);
    expect(req.listenerCount("data")).toBe(0);
    req.destroy();
  });
  it("accepts the three maximum-sized pickup photos", async () => {
    const req = bodyStream();
    const body = { photos: Array(3).fill(`data:image/jpeg;base64,${Buffer.alloc(900000).toString("base64")}`) };
    const result = readRequestBody(req);
    req.end(JSON.stringify(body));
    await expect(result).resolves.toEqual(body);
    expect(requestBodyLimit("/api/pickup/")).toBe(4 * 1024 * 1024);
  });
  it("bounds slow uploads and removes listeners", async () => {
    vi.useFakeTimers();
    try {
      const req = bodyStream();
      const result = expect(readRequestBody(req, { timeoutMs: 100 })).rejects.toMatchObject({ status: 408 });
      await vi.advanceTimersByTimeAsync(100);
      await result;
      expect(req.listenerCount("data")).toBe(0);
      req.destroy();
    } finally { vi.useRealTimers(); }
  });
});
