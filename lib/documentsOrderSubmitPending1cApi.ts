import type { VercelResponse } from "@vercel/node";
import type { SubmitPendingDocumentsOrderTo1cResult } from "./documentsOrderSubmitPending1c.js";
import { sanitizeZayavkaUpstreamRequestForSandbox } from "./post1cZayavkaUpload.js";

/** Единый JSON-ответ для submit-pending-1c и fallback draft-status?action=submit-1c */
export function sendSubmitPendingDocumentsOrderTo1cJson(
  res: VercelResponse,
  result: SubmitPendingDocumentsOrderTo1cResult,
  requestId: string,
): void {
  const upstreamRequest = sanitizeZayavkaUpstreamRequestForSandbox(result.upstreamRequest ?? null);

  if (!result.ok) {
    if (result.request) {
      res.status(result.status).json({
        ok: false,
        error: result.error,
        request: result.request,
        upstreamRequest,
        upstream: result.upstream ?? null,
        nomerZayavki: result.nomerZayavki ?? null,
        request_id: requestId,
      });
      return;
    }
    res.status(result.status).json({ ok: false, error: result.error, request_id: requestId });
    return;
  }

  res.status(200).json({
    ok: true,
    message: "Заявка передана в 1С",
    nomerZayavki: result.nomerZayavki,
    request: result.request,
    upstreamRequest,
    upstream: result.upstream,
    draft: result.draft,
    request_id: requestId,
  });
}
