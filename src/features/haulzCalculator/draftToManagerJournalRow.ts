import type { HaulzCalcDraft } from "../../api/client/haulzCalculator";
import { formatHaulzCalcDraftCustomer } from "../../../lib/haulzCalculator/draftCustomerDisplay";
import { directionCityCodes } from "../../../lib/haulzCalculator/clientMainlineTariff";
import type { Direction } from "../../../lib/haulzCalculator/types";
import type { PendingFivepostRow, PendingLegacyTableRow } from "../documents/orders/DocumentsOrdersPendingCargo";

export type ManagerJournalRow = Record<string, unknown> & {
  _draftId: number;
  _draft: HaulzCalcDraft;
};

function splitRoute(routeLabel: string): { from: string; to: string } {
  const parts = routeLabel.split(" – ").map((s) => s.trim());
  return { from: parts[0] ?? "", to: parts[1] ?? "" };
}

export function draftToManagerJournalRow(draft: HaulzCalcDraft): ManagerJournalRow {
  const journal = draft.documentsOrderJournal;
  const f = draft.formState;
  const customerFromLabel = formatHaulzCalcDraftCustomer(f, draft.loginKey);
  const customerName = journal?.customerName
    || (customerFromLabel.includes(" · ") ? customerFromLabel.split(" · ")[0] : customerFromLabel);

  if (journal) {
    const { from, to } = splitRoute(journal.routeLabel);
    return {
      _draftId: draft.id,
      _draft: draft,
      Дата: draft.updatedAt,
      DateZayavki: draft.updatedAt,
      ДатаЗабораПлан: journal.pickupDate,
      PickupDatePlan: journal.pickupDate,
      НомерЗаявки: draft.nomerZayavki,
      ЗаказчикНаименование: customerName,
      ОтправительНаименование: journal.senderName,
      ПолучательНаименование: journal.receiverName,
      CitySender: from,
      CityReceiver: to,
      АдресОтправки: journal.senderPoint,
      АдресНазначения: journal.destinationPoint,
      _fivepostRows: journal.fivepostRows as PendingFivepostRow[],
      _legacyTableRows: journal.legacyTableRows as PendingLegacyTableRow[],
    };
  }

  const direction = (f.directionOverride ?? draft.quoteResult?.direction ?? "mow_kgd") as Direction;
  const { from, to } = directionCityCodes(direction);

  return {
    _draftId: draft.id,
    _draft: draft,
    Дата: draft.updatedAt,
    DateZayavki: draft.updatedAt,
    ДатаЗабораПлан: f.dataZabora,
    PickupDatePlan: f.dataZabora,
    НомерЗаявки: draft.nomerZayavki,
    ЗаказчикНаименование: customerName,
    ОтправительНаименование: f.fromCompanyName || f.customerCompanyName || "",
    ПолучательНаименование: f.toCompanyName || "",
    CitySender: from,
    CityReceiver: to,
    АдресОтправки: f.from?.fullAddress || f.fromQuery || "",
    АдресНазначения: f.to?.fullAddress || f.toQuery || "",
    _fivepostRows: [],
    _legacyTableRows: [],
  };
}
