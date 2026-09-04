import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { parseMultipart } from "./_pnl-multipart.js";
import type { VercelRequest } from "@vercel/node";

function buildMultipartBody(
  boundary: string,
  fields: Record<string, string>,
  file?: {
    fieldName: string;
    filename: string;
    contentType: string;
    content: Buffer;
  },
): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.content,
      Buffer.from("\r\n"),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe("parseMultipart", () => {
  it("parses buffered multipart body (VPS adapter path)", async () => {
    const boundary = "----HaulzTestBoundary7MA4YWxk";
    const body = buildMultipartBody(
      boundary,
      { jobId: "42", fileRole: "otpravka" },
      {
        fieldName: "file",
        filename: "02676723 отправка.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: Buffer.from("PK-fake-xlsx"),
      },
    );

    const req = {
      method: "POST",
      url: "/api/haulz-returns/job-file",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      body,
    } as unknown as VercelRequest;

    const parsed = await parseMultipart(req);
    expect(parsed.fields.jobId).toBe("42");
    expect(parsed.fields.fileRole).toBe("otpravka");
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]?.originalFilename).toBe("02676723 отправка.xlsx");
    expect(parsed.files[0]?.buffer.toString("utf8")).toBe("PK-fake-xlsx");
  });

  it("parses live stream without pre-buffered body (skip-buffer VPS path)", async () => {
    const boundary = "----HaulzLiveStreamBoundary";
    const body = buildMultipartBody(
      boundary,
      { jobId: "7", fileRole: "otpravka" },
      {
        fieldName: "file",
        filename: "отправка.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content: Buffer.from("live-xlsx-bytes"),
      },
    );

    const stream = Readable.from(body);
    Object.assign(stream, {
      method: "POST",
      url: "/api/haulz-returns/job-file",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(body.length),
      },
    });

    const parsed = await parseMultipart(stream as unknown as VercelRequest);
    expect(parsed.fields.jobId).toBe("7");
    expect(parsed.files[0]?.originalFilename).toBe("отправка.xlsx");
    expect(parsed.files[0]?.buffer.toString("utf8")).toBe("live-xlsx-bytes");
  });
});
