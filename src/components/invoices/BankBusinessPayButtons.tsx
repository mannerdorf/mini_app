import React from "react";
import { Typography } from "@maxhub/max-ui";
import { getBankBusinessConfig, isMobileBankOpenDevice, openBankBusiness, type BankBusinessId } from "../../lib/bankBusinessOpen";

const LOGOS: Record<BankBusinessId, string> = {
  tbank: "/assets/banks/tbank-business.png",
  sber: "/assets/banks/sber-business.png",
};

type Props = {
  className?: string;
};

function BankLogoButton({ bank }: { bank: BankBusinessId }) {
  const cfg = getBankBusinessConfig(bank);
  const hint = isMobileBankOpenDevice()
    ? `Открыть приложение ${cfg.label}`
    : `Открыть ${cfg.label} в браузере`;

  return (
    <button
      type="button"
      className="bank-business-pay-btn"
      onClick={() => openBankBusiness(bank)}
      title={hint}
      aria-label={`Оплатить в ${cfg.label}`}
    >
      <img src={LOGOS[bank]} alt={cfg.label} className="bank-business-pay-btn__logo" />
    </button>
  );
}

export function BankBusinessPayButtons({ className }: Props) {
  return (
    <div className={className ? `bank-business-pay-row ${className}` : "bank-business-pay-row"}>
      <Typography.Label className="bank-business-pay-row__label">Оплатить в приложении банка</Typography.Label>
      <div className="bank-business-pay-row__buttons">
        <BankLogoButton bank="tbank" />
        <BankLogoButton bank="sber" />
      </div>
      <Typography.Body className="bank-business-pay-row__hint">
        {isMobileBankOpenDevice()
          ? "Откроется приложение банка — отсканируйте QR на экране или создайте платёж по реквизитам."
          : "Откроется сайт банка — войдите в личный кабинет и отсканируйте QR или введите платёж."}
      </Typography.Body>
    </div>
  );
}
