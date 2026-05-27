import React from "react";
import { Typography } from "@maxhub/max-ui";
import { getBankBusinessConfig, isMobileBankOpenDevice, openBankBusiness, type BankBusinessId } from "../../lib/bankBusinessOpen";

/** Временно скрыты кнопки «Т-Бизнес» и «СберБизнес». */
export const SHOW_BANK_BUSINESS_PAY_BUTTONS = false;

const LOGOS: Record<BankBusinessId, string> = {
  tbank: "/assets/banks/tbank-business.svg",
  sber: "/assets/banks/sber-business.svg",
};

type Props = {
  className?: string;
};

function BankPayCard({ bank }: { bank: BankBusinessId }) {
  const cfg = getBankBusinessConfig(bank);
  const title =
    bank === "tbank"
      ? "Открыть Т-Бизнес (business.tbank.ru)"
      : `Открыть ${cfg.label}`;

  return (
    <button
      type="button"
      className={`bank-business-pay-card bank-business-pay-card--${bank}`}
      onClick={() => openBankBusiness(bank)}
      title={title}
      aria-label={`Оплатить в ${cfg.label}`}
    >
      <img src={LOGOS[bank]} alt="" className="bank-business-pay-card__logo" aria-hidden />
    </button>
  );
}

export function BankBusinessPayButtons({ className }: Props) {
  if (!SHOW_BANK_BUSINESS_PAY_BUTTONS) return null;

  const mobile = isMobileBankOpenDevice();
  return (
    <div className={className ? `bank-business-pay-row ${className}` : "bank-business-pay-row"}>
      <p className="bank-business-pay-row__label">Оплатить в приложении банка</p>
      <div className="bank-business-pay-row__buttons">
        <BankPayCard bank="tbank" />
        <BankPayCard bank="sber" />
      </div>
      <Typography.Body className="bank-business-pay-row__hint">
        {mobile
          ? "Откроется приложение банка. Отсканируйте QR на экране или создайте платёж по реквизитам."
          : "Откроется личный кабинет банка в браузере. Войдите в Т-Бизнес или СберБизнес и отсканируйте QR-код."}
      </Typography.Body>
    </div>
  );
}
