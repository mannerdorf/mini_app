import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";
import formidable from "formidable";
import fs from "node:fs";

export const config = {
  api: { bodyParser: false },
};

type UploadedFile = {
  filepath: string;
  mimetype?: string | null;
  originalFilename?: string | null;
  size?: number;
};

function parseForm(req: VercelRequest) {
  const form = formidable({
    multiples: false,
    maxFileSize: 10 * 1024 * 1024,
  });

  return new Promise<{ files: { audio?: UploadedFile | UploadedFile[] } }>(
    (resolve, reject) => {
      form.parse(req, (err, _fields, files) => {
        if (err) return reject(err);
        resolve({ files: files as { audio?: UploadedFile | UploadedFile[] } });
      });
    },
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
  }

  let file: UploadedFile | undefined;
  try {
    const parsed = await parseForm(req);
    file = Array.isArray(parsed.files.audio) ? parsed.files.audio[0] : parsed.files.audio;
    if (!file?.filepath) {
      return res.status(400).json({ error: "audio file is required" });
    }

    const client = new OpenAI({ apiKey });
    const response = await client.audio.transcriptions.create({
      model: "whisper-1",
      file: fs.createReadStream(file.filepath),
    });

    return res.status(200).json({ text: response.text || "" });
  } catch (err: any) {
    console.error("transcribe error:", err?.message || err);
    return res.status(500).json({ error: "transcription failed" });
  } finally {
    if (file?.filepath) {
      fs.promises.unlink(file.filepath).catch(() => {});
    }
  }
}
