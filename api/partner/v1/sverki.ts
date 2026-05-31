import { createPartnerV1PostRoute } from "../../../lib/partnerV1PostRoute.js";
import { readPartnerSverkiFromCache, pickTableCustomerInn } from "../../../lib/partnerDocumentTableCache.js";

export default createPartnerV1PostRoute({
  logTag: "partner-v1-sverki",
  scope: "sverki:read",
  requireDateRange: false,
  pickInn: pickTableCustomerInn,
  formatResponse: (rows) => ({ sverki: rows }),
  readRows: ({ body }) => readPartnerSverkiFromCache(body.inn),
});
