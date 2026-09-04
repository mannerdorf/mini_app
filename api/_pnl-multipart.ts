import type { VercelRequest } from "@vercel/node";
import { IncomingForm } from "formidable";
import { readFileSync } from "fs";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";

interface ParsedFile {
  fieldName: string;
  originalFilename: string;
  mimetype: string;
  buffer: Buffer;
}

interface ParsedForm {
  fields: Record<string, string>;
  files: ParsedFile[];
}

/** Formidable ждёт IncomingMessage со stream + headers (boundary в content-type). */
function multipartSource(req: VercelRequest): IncomingMessage {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    const stream = Readable.from(req.body);
    Object.assign(stream, {
      headers: req.headers,
      method: req.method || "POST",
      url: req.url || "/",
    });
    return stream as unknown as IncomingMessage;
  }
  return req as IncomingMessage;
}

export function parseMultipart(req: VercelRequest): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    // Высокий потолок для self-hosted; у Vercel тело запроса всё равно обрезается ~4.5 МБ до вызова функции.
    const form = new IncomingForm({ maxFileSize: 500 * 1024 * 1024 });
    form.parse(multipartSource(req), (err, fields, files) => {
      if (err) return reject(err);
      const parsedFields: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        parsedFields[k] = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
      }
      const parsedFiles: ParsedFile[] = [];
      for (const [fieldName, fileArr] of Object.entries(files)) {
        const list = Array.isArray(fileArr) ? fileArr : fileArr ? [fileArr] : [];
        for (const f of list) {
          if (f && f.filepath) {
            parsedFiles.push({
              fieldName,
              originalFilename: f.originalFilename || "upload",
              mimetype: f.mimetype || "application/octet-stream",
              buffer: readFileSync(f.filepath),
            });
          }
        }
      }
      resolve({ fields: parsedFields, files: parsedFiles });
    });
  });
}
