import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { getAdminTokenFromRequest, getAdminTokenPayload, verifyAdminToken } from "../lib/adminAuth.js";
import { initRequestContext, logError } from "./_lib/observability.js";
import { createReadOnlyProgram, getProgramDashboard, parseProgramPatch, patchProgramState, ProgramError, PROGRAM_SETUP_MESSAGE } from "../lib/mediaMarketing/programStore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin_media_program");
  res.setHeader("Cache-Control", "private, no-store");
  const token = getAdminTokenFromRequest(req);
  if (!verifyAdminToken(token)) return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  try {
    const patch = req.method === "PATCH" ? parseProgramPatch(req.body) : null;
    if (!process.env.DATABASE_URL) {
      const message = `Подключение DATABASE_URL не настроено. ${PROGRAM_SETUP_MESSAGE}`;
      if (patch) throw new ProgramError(503, message);
      return res.status(200).json(createReadOnlyProgram(message));
    }
    const pool = getPool();
    if (patch) await patchProgramState(pool, patch, getAdminTokenPayload(token)?.login || "admin");
    return res.status(200).json(await getProgramDashboard(pool));
  } catch (error) {
    if (error instanceof ProgramError) return res.status(error.status).json({ error: error.message, request_id: ctx.requestId });
    logError(ctx, "admin_media_program_failed", error);
    return res.status(500).json({ error: "Не удалось загрузить или сохранить программу. Повторите запрос; при сохранении проверьте журнал изменений.", request_id: ctx.requestId });
  }
}
