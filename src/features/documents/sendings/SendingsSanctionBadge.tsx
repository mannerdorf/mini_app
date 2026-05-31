import React from "react";
import { AppBadge } from "../../../components/shared/AppBadge";
import type { SanctionCheckResult } from "../../../lib/sanctions";

type Props = {
  result?: SanctionCheckResult | null;
};

export function SendingsSanctionBadge({ result }: Props) {
  if (!result) return <AppBadge tone="neutral">Не проверено</AppBadge>;
  if (result.verdict === "sanctioned") {
    return (
      <AppBadge tone="danger" title={result.reason}>
        Санкции
      </AppBadge>
    );
  }
  if (result.verdict === "review") {
    return (
      <AppBadge tone="warning" title={result.reason}>
        Проверить
      </AppBadge>
    );
  }
  return (
    <AppBadge tone="success" title={result.reason}>
      Нет
    </AppBadge>
  );
}
