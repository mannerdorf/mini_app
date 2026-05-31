import { createPartnerV1PostRoute } from "../../../lib/partnerV1PostRoute.js";
import { readRegisteredActsFromCache, actsItemInn } from "../../acts.js";

export default createPartnerV1PostRoute({
  logTag: "partner-v1-acts",
  scope: "acts:read",
  pickInn: actsItemInn,
  readRows: ({ pool, auth, body, dateFrom, dateTo }) =>
    readRegisteredActsFromCache(pool, auth.verified, auth.login, dateFrom!, dateTo!, body.inn),
});
