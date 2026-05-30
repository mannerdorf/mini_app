import React from "react";
import { Typography } from "@maxhub/max-ui";
import {
  BANK_BUSINESS_PAY_ORDER,
  getBankBusinessConfig,
  openBankBusiness,
  type BankBusinessId,
} from "../../lib/bankBusinessOpen";
import { isClientAndroid } from "../../lib/clientPlatform";

type Props = {
  className?: string;
};

function BankPayCard({ bank }: { bank: BankBusinessId }) {
  const cfg = getBankBusinessConfig(bank);

  return (
    <button
      type="button"
      className={`bank-business-pay-card bank-business-pay-card--${bank}`}
      onClick={() => openBankBusiness(bank)}
      title={`Открыть ${cfg.label}`}
      aria-label={`Оплатить в ${cfg.label}`}
    >
      <span className="bank-business-pay-card__label">{cfg.shortLabel}</span>
    </button>
  );
}

/** Кнопки открытия приложений банков — только Android (haulz.ru / PWA / WebView). */
export function BankBusinessPayButtons({ className }: Props) {
  if (!isClientAndroid()) return null;

  return (
    <div className={className ? `bank-business-pay-row ${className}` : "bank-business-pay-row"}>
      <p className="bank-business-pay-row__label">Оплатить в приложении банка</p>
      <div className="bank-business-pay-row__buttons">
        {BANK_BUSINESS_PAY_ORDER.map((bank) => (
          <BankPayCard key={bank} bank={bank} />
        ))}
      </div>
      <Typography.Body className="bank-business-pay-row__hint">
        Откроется приложение банка. Отсканируйте QR на экране или создайте платёж по реквизитам.
      </Typography.Body>
    </div>
  );
}
