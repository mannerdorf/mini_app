export type PnlExpenseCategoryLink = {
  expenseCategoryId?: string | null;
  name?: string | null;
  department: string;
  logisticsStage: string | null;
};

export type PnlExpensePrefill = {
  requestId: string;
  expenseCategoryId?: string;
  categoryName?: string;
  subdivision: string;
  type: "OPEX";
};

export type AdminExpenseRequestsMode = "standalone" | "accounting_expenses" | "accounting_sverki";

export type AccountingSubsection = "expense_requests" | "sverki" | "claims";
