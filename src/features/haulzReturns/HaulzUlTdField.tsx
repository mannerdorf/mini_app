import React, { useCallback, useEffect, useRef, useState } from "react";
import { Typography } from "@maxhub/max-ui";

type Props = {
  sheetId: string;
  tdNumber: string | null | undefined;
  onTdChange: (tdNumber: string) => void | Promise<void>;
  disabled?: boolean;
};

export function HaulzUlTdField({ sheetId, tdNumber, onTdChange, disabled }: Props) {
  const ulLabel = sheetId.startsWith("ul-") ? sheetId.slice(3) : sheetId;
  const [local, setLocal] = useState(tdNumber ?? "");
  const committedRef = useRef((tdNumber ?? "").trim());
  const localRef = useRef(local);
  const onTdChangeRef = useRef(onTdChange);
  onTdChangeRef.current = onTdChange;
  localRef.current = local;

  useEffect(() => {
    const v = tdNumber ?? "";
    setLocal(v);
    committedRef.current = v.trim();
  }, [sheetId, tdNumber]);

  const commit = useCallback(() => {
    const v = localRef.current.trim();
    if (v === committedRef.current) return;
    committedRef.current = v;
    void onTdChangeRef.current(v);
  }, []);

  useEffect(() => {
    return () => {
      const v = localRef.current.trim();
      if (v !== committedRef.current) {
        committedRef.current = v;
        void onTdChangeRef.current(v);
      }
    };
  }, [sheetId]);

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
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.8rem" }}>
        УЛ {ulLabel}: номер ТД для спецификации и листа списания.
      </Typography.Body>
    </div>
  );
}
