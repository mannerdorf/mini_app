import { createPartnerV1PostRoute } from "../../../lib/partnerV1PostRoute.js";
import { readRegisteredInvoicesFromCache, invoicesItemInn } from "../../invoices.js";

export default createPartnerV1PostRoute({
  logTag: "partner-v1-invoices",
  scope: "invoices:read",
  pickInn: invoicesItemInn,
  readRows: ({ pool, auth, body, dateFrom, dateTo }) =>
    readRegisteredInvoicesFromCache(pool, auth.verified, auth.login, dateFrom!, dateTo!, body.inn),
});
