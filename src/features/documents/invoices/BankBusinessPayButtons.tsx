import React, { useCallback, useState } from "react";
import { Typography } from "@maxhub/max-ui";
import {
  BANK_BUSINESS_PAY_ORDER,
  getBankBusinessConfig,
  openBankBusiness,
  type BankBusinessId,
} from "../../../lib/bankBusinessOpen";
import { isClientAndroid } from "../../../lib/clientPlatform";

type Props = {
  className?: string;
};

const OPEN_BUSY_MS = 5000;

function BankPayCard({
  bank,
  disabled,
  onOpen,
}: {
  bank: BankBusinessId;
  disabled: boolean;
  onOpen: () => void;
}) {
  const cfg = getBankBusinessConfig(bank);

  return (
    <button
      type="button"
      className={`bank-business-pay-card bank-business-pay-card--${bank}`}
      disabled={disabled}
      aria-busy={disabled}
      onClick={onOpen}
      title={`Открыть ${cfg.label}`}
      aria-label={`Оплатить в ${cfg.label}`}
    >
      <span className="bank-business-pay-card__label">{cfg.shortLabel}</span>
    </button>
  );
}

/** Кнопки открытия приложений банков — только Android (haulz.ru / PWA / WebView). */
export function BankBusinessPayButtons({ className }: Props) {
  const [busy, setBusy] = useState(false);

  const handleOpen = useCallback((bank: BankBusinessId) => {
    if (busy) return;
    setBusy(true);
    openBankBusiness(bank);
    window.setTimeout(() => setBusy(false), OPEN_BUSY_MS);
  }, [busy]);

  if (!isClientAndroid()) return null;

  return (
    <div className={className ? `bank-business-pay-row ${className}` : "bank-business-pay-row"}>
      <p className="bank-business-pay-row__label">Оплатить в приложении банка</p>
      <div className="bank-business-pay-row__buttons">
        {BANK_BUSINESS_PAY_ORDER.map((bank) => (
          <BankPayCard
            key={bank}
            bank={bank}
            disabled={busy}
            onOpen={() => handleOpen(bank)}
          />
        ))}
      </div>
      <Typography.Body className="bank-business-pay-row__hint">
        Сначала приложение банка; если не установлено — установка через RuStore (не Google Play).
        QR сканируйте в приложении вручную.
      </Typography.Body>
    </div>
  );
}
