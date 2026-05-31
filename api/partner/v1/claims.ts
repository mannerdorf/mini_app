import { createPartnerV1PostRoute } from "../../../lib/partnerV1PostRoute.js";
import { readPartnerClaimsFromDb, pickClaimCustomerInn } from "../../../lib/partnerDocumentTableCache.js";

export default createPartnerV1PostRoute({
  logTag: "partner-v1-claims",
  scope: "claims:read",
  pickInn: pickClaimCustomerInn,
  formatResponse: (rows) => ({ claims: rows }),
  readRows: ({ pool, auth, body, dateFrom, dateTo }) =>
    readPartnerClaimsFromDb(
      pool,
      auth.login.trim().toLowerCase(),
      auth.verified,
      dateFrom!,
      dateTo!,
      body.inn,
    ),
});
