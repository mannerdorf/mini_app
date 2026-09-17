import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { toVercelRequest } from "./vercelAdapter.js";

const request = (url: string) => toVercelRequest({ url, headers: {} } as IncomingMessage, undefined);

describe("Vercel query compatibility", () => {
  it("keeps scalar values and repeated values in their original order", () => {
    expect(request("/api/example?login=one&login=two&page=1").query).toEqual({ login: ["one", "two"], page: "1" });
  });
  it("decodes values and preserves empty repeated parameters", () => {
    expect(request("/api/example?q=%D0%BC%D0%B8%D1%80&q=&q=a+b").query).toEqual({ q: ["мир", "", "a b"] });
  });
  it("handles reserved object keys without altering the prototype", () => {
    const { query } = request("/api/example?__proto__=a&__proto__=b&constructor=c");
    expect(Object.getPrototypeOf(query)).toBeNull();
    expect(query.__proto__).toEqual(["a", "b"]);
    expect(query.constructor).toBe("c");
  });
});
