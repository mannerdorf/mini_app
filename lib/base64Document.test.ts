import { describe, expect, it } from "vitest";
import { decodeBase64Payload, normalizeBase64Payload } from "./base64Document.js";

describe("base64Document", () => {
  it("strips CRLF from base64 before decode", () => {
    const plain = Buffer.from("%PDF-test", "utf8").toString("base64");
    const wrapped = plain.match(/.{1,4}/g)!.join("\r\n");
    expect(normalizeBase64Payload(wrapped)).toBe(plain);
    const bytes = decodeBase64Payload(wrapped);
    expect(Buffer.from(bytes).toString("utf8")).toBe("%PDF-test");
  });

  it("decodes compact base64", () => {
    const plain = Buffer.from("hello", "utf8").toString("base64");
    expect(Buffer.from(decodeBase64Payload(plain)).toString("utf8")).toBe("hello");
  });
});
