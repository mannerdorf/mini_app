import type { Pool } from "pg";
import { buildPendingOrderJournalItem } from "../pendingOrderRequests.js";
import type { HaulzCalcDraftRow } from "./calculatorDraft.js";
import { enrichDraftCustomerFields, formatHaulzCalcDraftCustomer, journalCustomerDisplayName } from "./draftCustomerDisplay.js";
import { directionCityCodes } from "./clientMainlineTariff.js";
import type { Direction } from "./types.js";

export type DocumentsOrderJournalView = {
  customerName: string;
  customerRequestNumber: string;
  senderPoint: string;
  destinationPoint: string;
  senderName: string;
  receiverName: string;
  routeLabel: string;
  pickupDate: string;
  fivepostRows: Record<string, unknown>[];
  legacyTableRows: Record<string, unknown>[];
};

function isDocumentsOrderNomer(nomer: string | null | undefined): boolean {
  return String(nomer ?? "").trim().startsWith("HAULZ-DOC-");
}

function mapPendingItemToJournal(item: Record<string, unknown>): DocumentsOrderJournalView {
  const cityFrom = String(item.CitySender ?? "").trim();
  const cityTo = String(item.CityReceiver ?? "").trim();
  const routeLabel = cityFrom && cityTo ? `${cityFrom} – ${cityTo}` : "";

  return {
    customerName: String(item.ЗаказчикНаименование ?? "").trim(),
    customerRequestNumber: String(item.НомерЗаявкиКлиента ?? item.ClientRequestNumber ?? "").trim(),
    senderPoint: String(item.АдресОтправки ?? item.ПунктОтправкиНаименование ?? "").trim(),
    destinationPoint: String(item.АдресНазначения ?? item.ПунктНазначенияНаименование ?? "").trim(),
    senderName: String(item.ОтправительНаименование ?? "").trim(),
    receiverName: String(item.ПолучательНаименование ?? "").trim(),
    routeLabel,
    pickupDate: String(item.ДатаЗабораПлан ?? item.PickupDatePlan ?? "").trim(),
    fivepostRows: Array.isArray(item._fivepostRows) ? (item._fivepostRows as Record<string, unknown>[]) : [],
    legacyTableRows: Array.isArray(item._legacyTableRows)
      ? (item._legacyTableRows as Record<string, unknown>[])
      : [],
  };
}

function journalFromFormState(draft: HaulzCalcDraftRow): DocumentsOrderJournalView {
  const f = draft.formState;
  const direction = (f.directionOverride ?? draft.quoteResult?.direction ?? "mow_kgd") as Direction;
  const { from, to } = directionCityCodes(direction);
  const customerLabel = formatHaulzCalcDraftCustomer(f, draft.loginKey);
  const customerName = journalCustomerDisplayName(customerLabel);

  return {
    customerName: customerName === "—" ? String(f.customerCompanyName ?? "").trim() : customerName,
    customerRequestNumber: "",
    senderPoint: String(f.from?.fullAddress ?? f.fromQuery ?? "").trim(),
    destinationPoint: String(f.to?.fullAddress ?? f.toQuery ?? "").trim(),
    senderName: String(f.fromCompanyName ?? f.customerCompanyName ?? "").trim(),
    receiverName: String(f.toCompanyName ?? "").trim(),
    routeLabel: `${from} – ${to}`,
    pickupDate: String(f.dataZabora ?? "").trim(),
    fivepostRows: [],
    legacyTableRows: [],
  };
}

export async function enrichDraftWithDocumentsOrderJournal(
  pool: Pool,
  draft: HaulzCalcDraftRow,
): Promise<HaulzCalcDraftRow & { documentsOrderJournal?: DocumentsOrderJournalView }> {
  if (!isDocumentsOrderNomer(draft.nomerZayavki)) return draft;

  try {
    const pending = await buildPendingOrderJournalItem(pool, draft.nomerZayavki!);
    if (pending) {
      return { ...draft, documentsOrderJournal: mapPendingItemToJournal(pending) };
    }
  } catch {
    // fallback to form state below
  }

  return { ...draft, documentsOrderJournal: journalFromFormState(draft) };
}

/** Полный enrich для ответов API менеджера (статус, 1С) — сохраняет табличную часть. */
export async function enrichManagerDraftForApi(
  pool: Pool,
  draft: HaulzCalcDraftRow,
): Promise<HaulzCalcDraftRow & { documentsOrderJournal?: DocumentsOrderJournalView }> {
  return enrichDraftWithDocumentsOrderJournal(pool, await enrichDraftCustomerFields(pool, draft));
}
