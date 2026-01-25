import OpenAI from "openai";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { formidable } from "formidable";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OpenAI API key missing" });
  }

  const form = formidable();

  try {
    const [fields, files] = await form.parse(req);
    const audioFile = files.file?.[0];

    if (!audioFile) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    const openai = new OpenAI({ apiKey });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioFile.filepath),
      model: "whisper-1",
    });

    res.status(200).json({ text: transcription.text });
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.status(500).json({ error: error.message });
  }
}
