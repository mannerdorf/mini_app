import React from "react";
import { Typography } from "@maxhub/max-ui";

type Props = {
  sheetId: string;
  tdNumber: string | null | undefined;
  onTdChange: (tdNumber: string) => void | Promise<void>;
  disabled?: boolean;
};

export function HaulzUlTdField({ sheetId, tdNumber, onTdChange, disabled }: Props) {
  const ulLabel = sheetId.startsWith("ul-") ? sheetId.slice(3) : sheetId;

  return (
    <div className="hr-td-field">
      <label className="hr-td-field__label">
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
          Номер ТД
        </Typography.Body>
        <input
          type="text"
          className="hr-td-field__input"
          placeholder="10229010/260526/0113288"
          value={tdNumber ?? ""}
          disabled={disabled}
          onChange={(e) => void onTdChange(e.target.value)}
        />
      </label>
      <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.8rem" }}>
        УЛ {ulLabel}: номер ТД для спецификации и листа списания.
      </Typography.Body>
    </div>
  );
}
