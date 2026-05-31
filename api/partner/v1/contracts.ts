import { createPartnerV1PostRoute } from "../../../lib/partnerV1PostRoute.js";
import { readPartnerDogovorsFromCache, pickTableCustomerInn } from "../../../lib/partnerDocumentTableCache.js";

export default createPartnerV1PostRoute({
  logTag: "partner-v1-contracts",
  scope: "contracts:read",
  requireDateRange: false,
  pickInn: pickTableCustomerInn,
  formatResponse: (rows) => ({ contracts: rows }),
  readRows: ({ body }) => readPartnerDogovorsFromCache(body.inn),
});
