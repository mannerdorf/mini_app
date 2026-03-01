import type { VercelRequest } from "@vercel/node";
import { IncomingForm } from "formidable";
import { readFileSync } from "fs";

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

export function parseMultipart(req: VercelRequest): Promise<ParsedForm> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
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
