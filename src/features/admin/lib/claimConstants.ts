import { CLAIM_STATUS_LABELS } from "../../../features/documents/claims/claimStatusConstants";

export const CLAIMS_FILTER_CONTROL_HEIGHT = 36;

export const CLAIM_STATUS_LABELS_RU: Record<string, string> = CLAIM_STATUS_LABELS;

export const CLAIM_EVENT_TYPE_LABELS_RU: Record<string, string> = {
  claim_draft_saved: "Черновик сохранён",
  claim_created: "Претензия создана",
  status_changed: "Изменение статуса",
  claim_updated: "Обновление претензии",
  documents_uploaded: "Загружены документы",
};

export {
  MANIPULATION_SIGN_LABELS_RU as CLAIM_MANIPULATION_SIGN_LABELS_RU,
  PACKAGING_TYPE_LABELS_RU as CLAIM_PACKAGING_TYPE_LABELS_RU,
} from "../../../features/documents/claims/claimFormConstants";

export { mapClaimEnumToRu as mapClaimEnumValuesToRu } from "../../../features/documents/claims/claimFormUtils";
