import type { VercelRequest,VercelResponse } from '@vercel/node';
import { getPool } from './_db.js';
import { verifyAdminToken,getAdminTokenFromRequest,getAdminTokenPayload } from '../lib/adminAuth.js';
import { withErrorLog } from '../lib/requestErrorLog.js';
import { initRequestContext,logError } from './_lib/observability.js';
import { collectCustomerCandidates,processCustomerOnboarding } from '../lib/customerOnboarding.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "admin-auto-register-candidates");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({ error: "Требуется авторизация админа", request_id: ctx.requestId });
  }

  const autoModeEnabled = String(process.env.AUTO_REGISTER_FROM_CUSTOMERS || "").toLowerCase() === "true";

  if (req.method === "GET") {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const { candidates, stats } = await collectCustomerCandidates(getPool(),q);
      return res.status(200).json({
        ok: true,
        auto_mode_enabled: autoModeEnabled,
        candidates,
        stats,
        request_id: ctx.requestId,
      });
    } catch (e: unknown) {
      const err = e as Error;
      logError(ctx, "admin_auto_register_candidates_get_failed", err);
      return res.status(500).json({ error: err?.message || "Ошибка dry-run кандидатов", request_id: ctx.requestId });
    }
  }

  if (!autoModeEnabled) {
    return res.status(400).json({ error: "AUTO_REGISTER_FROM_CUSTOMERS=false. Включите переменную окружения для авто-режима.", request_id: ctx.requestId });
  }
  const payload = getAdminTokenPayload(getAdminTokenFromRequest(req));
  if (!payload?.superAdmin) {
    return res.status(403).json({ error: "Запуск авто-регистрации доступен только суперадминистратору", request_id: ctx.requestId });
  }

  let body: { inns?: string[]; limit?: number } = req.body as any;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON", request_id: ctx.requestId });
    }
  }

  try {
    const result=await processCustomerOnboarding(getPool(),{limit:Number(body?.limit)||undefined,inns:Array.isArray(body?.inns)?body.inns.map(String):undefined});
    return res.status(200).json({ok:true,auto_mode_enabled:true,...result,request_id:ctx.requestId});
  } catch(e) {
    logError(ctx,'customer_onboarding_failed',e);
    return res.status(500).json({error:'Не удалось завершить регистрацию. Незавершённые шаги сохранены для повтора.',request_id:ctx.requestId});
  }
}
export default withErrorLog(handler);
