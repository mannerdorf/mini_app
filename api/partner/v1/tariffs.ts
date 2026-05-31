import { createPartnerV1PostRoute } from "../../../lib/partnerV1PostRoute.js";
import { readPartnerTariffsFromCache, pickTableCustomerInn } from "../../../lib/partnerDocumentTableCache.js";

export default createPartnerV1PostRoute({
  logTag: "partner-v1-tariffs",
  scope: "tariffs:read",
  requireDateRange: false,
  pickInn: pickTableCustomerInn,
  formatResponse: (rows) => ({ tariffs: rows }),
  readRows: ({ body }) => readPartnerTariffsFromCache(body.inn),
});
