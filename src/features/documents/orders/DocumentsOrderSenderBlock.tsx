import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import type { AuthData } from "../../../types";
import { fetchExpenseRequestSuppliers } from "../../../api/client/expenseRequestsUser";
import { fetchHaulzPartyByInn } from "../../../api/client/haulzCalculator";
import { formatHaulzCalcFetchError } from "../../../lib/haulzCalcFetchError";
import {
  buildDocumentsOrderSendersDirectory,
  filterDocumentsOrderSenderOptions,
  findDocumentsOrderSenderOption,
  type DocumentsOrderSenderOption,
} from "../../../../lib/documentsOrderSendersDirectory";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type DocumentsOrderSenderState = {
  inn: string;
  companyName: string;
};

type Props = {
  auth: AuthData;
  value: DocumentsOrderSenderState;
  onChange: (next: DocumentsOrderSenderState) => void;
};

export function DocumentsOrderSenderBlock({ auth, value, onChange }: Props) {
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [options, setOptions] = useState<DocumentsOrderSenderOption[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [innLoading, setInnLoading] = useState(false);
  const [innError, setInnError] = useState<string | null>(null);
  const [innTouched, setInnTouched] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.login || !auth.password) return;
    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);
    fetchExpenseRequestSuppliers({ login: auth.login, password: auth.password })
      .then((list) => {
        if (cancelled) return;
        const rows = list
          .map((raw) => {
            const s = raw as { inn?: unknown; supplier_name?: unknown; email?: unknown };
            return {
              inn: String(s?.inn ?? "").trim(),
              supplier_name: String(s?.supplier_name ?? "").trim(),
              email: String(s?.email ?? "").trim(),
            };
          })
          .filter((s) => s.supplier_name || s.inn);
        setOptions(buildDocumentsOrderSendersDirectory(rows));
      })
      .catch((e) => {
        if (cancelled) return;
        setOptions([]);
        setCatalogError((e as Error)?.message || "Не удалось загрузить справочник поставщиков");
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.login, auth.password]);

  const selected = useMemo(
    () => findDocumentsOrderSenderOption(options, value.inn, value.companyName),
    [options, value.inn, value.companyName],
  );

  useEffect(() => {
    if (manualMode) return;
    if (!value.inn && !value.companyName) return;
    if (!selected) setManualMode(true);
  }, [manualMode, selected, value.inn, value.companyName]);

  const filtered = useMemo(
    () => filterDocumentsOrderSenderOptions(options, search),
    [options, search],
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const debouncedInn = useDebounced(value.inn.replace(/\D/g, ""), 500);

  useEffect(() => {
    if (!manualMode || !innTouched) return;
    const digits = debouncedInn;
    if (digits.length !== 10 && digits.length !== 12) {
      setInnLoading(false);
      setInnError(digits.length > 0 ? "ИНН: 10 цифр (ЮЛ) или 12 (ИП)" : null);
      return;
    }
    let cancelled = false;
    setInnLoading(true);
    setInnError(null);
    fetchHaulzPartyByInn(auth, digits)
      .then(({ party }) => {
        if (!cancelled) {
          onChange({ inn: party.inn, companyName: party.fullName });
          setInnError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setInnError(formatHaulzCalcFetchError(e, "Не удалось найти организацию"));
        }
      })
      .finally(() => {
        if (!cancelled) setInnLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, debouncedInn, innTouched, manualMode, onChange]);

  const pickSupplier = (opt: DocumentsOrderSenderOption) => {
    setManualMode(false);
    setInnError(null);
    setInnTouched(false);
    setSearch("");
    setDropdownOpen(false);
    onChange({ inn: opt.inn, companyName: opt.name });
  };

  const clearSender = () => {
    setManualMode(false);
    setInnTouched(false);
    setInnError(null);
    setSearch("");
    onChange({ inn: "", companyName: "" });
  };

  const enableManual = () => {
    setManualMode(true);
    setDropdownOpen(false);
    setInnTouched(false);
    setInnError(null);
    onChange({ inn: "", companyName: "" });
  };

  const selectedLabel = selected
    ? `${selected.name}${selected.inn ? ` (${selected.inn})` : ""}`
    : value.companyName
      ? `${value.companyName}${value.inn ? ` (${value.inn})` : ""}`
      : "";

  return (
    <div className="haulz-calc-card" ref={rootRef}>
      <h2 className="haulz-calc-card__title">Отправитель</h2>
      <p className="haulz-calc-hint" style={{ marginBottom: "0.75rem" }}>
        Выберите из справочника поставщиков или укажите ИНН вручную
      </p>

      {!manualMode ? (
        <>
          <label className="haulz-calc-field">
            <span className="haulz-calc-label">Из справочника поставщиков</span>
            <button
              type="button"
              className="haulz-calc-input"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                textAlign: "left",
                cursor: "pointer",
              }}
              onClick={() => setDropdownOpen((open) => !open)}
              aria-expanded={dropdownOpen}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: selectedLabel ? "inherit" : "var(--calc-text-secondary, #6b7280)",
                }}
              >
                {catalogLoading ? "Загрузка справочника…" : selectedLabel || "Выберите поставщика"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                {selectedLabel ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Очистить отправителя"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearSender();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        clearSender();
                      }
                    }}
                    style={{ display: "inline-flex" }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                ) : null}
                {catalogLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ChevronDown
                    className="w-3.5 h-3.5"
                    style={{ transform: dropdownOpen ? "rotate(180deg)" : undefined }}
                  />
                )}
              </span>
            </button>
          </label>

          {dropdownOpen && (
            <div
              style={{
                marginTop: "0.35rem",
                border: "1px solid var(--calc-border, #e5e7eb)",
                borderRadius: 8,
                background: "var(--calc-card, #fff)",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                maxHeight: 280,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "0.45rem 0.55rem",
                  borderBottom: "1px solid var(--calc-border, #e5e7eb)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Search className="w-3.5 h-3.5" style={{ flexShrink: 0, opacity: 0.6 }} />
                <input
                  type="text"
                  className="haulz-calc-input"
                  style={{ border: "none", boxShadow: "none", padding: 0, height: "auto" }}
                  placeholder="Поиск: наименование или ИНН…"
                  value={search}
                  autoFocus
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {catalogLoading ? (
                  <p className="haulz-calc-hint" style={{ padding: "0.75rem", margin: 0 }}>
                    <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "0.35rem" }} />
                    Загрузка…
                  </p>
                ) : filtered.length === 0 ? (
                  <p className="haulz-calc-hint" style={{ padding: "0.75rem", margin: 0 }}>
                    {options.length === 0
                      ? "Справочник поставщиков пуст или не загружен"
                      : "Ничего не найдено"}
                  </p>
                ) : (
                  filtered.slice(0, 200).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => pickSupplier(o)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "0.5rem 0.65rem",
                        border: "none",
                        background:
                          selected?.key === o.key ? "var(--calc-accent-soft, #e8f1ff)" : "transparent",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                      }}
                    >
                      {o.name}
                      {o.inn ? (
                        <span style={{ color: "var(--calc-text-secondary, #6b7280)" }}> · {o.inn}</span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {catalogError && (
            <p className="haulz-calc-hint haulz-calc-hint--error" style={{ marginTop: "0.5rem" }}>
              {catalogError}
            </p>
          )}

          {selected ? (
            <div className="haulz-calc-warehouse" style={{ marginTop: "0.75rem" }}>
              <p className="haulz-calc-warehouse__title">{selected.name}</p>
              {selected.inn ? <p className="haulz-calc-warehouse__meta">ИНН {selected.inn}</p> : null}
            </div>
          ) : null}

          <button
            type="button"
            className="haulz-calc-link-btn"
            style={{ marginTop: "0.75rem" }}
            onClick={enableManual}
          >
            Указать другой ИНН
          </button>
        </>
      ) : (
        <div className="haulz-calc-contacts">
          <label className="haulz-calc-field haulz-calc-contacts__inn">
            <span className="haulz-calc-label">ИНН отправителя</span>
            <input
              type="text"
              inputMode="numeric"
              className="haulz-calc-input"
              placeholder="10 или 12 цифр"
              value={value.inn}
              maxLength={12}
              onChange={(e) => {
                setInnTouched(true);
                onChange({
                  inn: e.target.value.replace(/\D/g, "").slice(0, 12),
                  companyName: value.companyName,
                });
                if (innError) setInnError(null);
              }}
            />
            {innLoading && (
              <span className="haulz-calc-field-hint">
                <Loader2 className="w-3 h-3 animate-spin" style={{ display: "inline", marginRight: "0.25rem" }} />
                Загружаем наименование…
              </span>
            )}
            {innError && !innLoading && (
              <span className="haulz-calc-field-hint haulz-calc-field-hint--error">{innError}</span>
            )}
          </label>
          {value.inn.replace(/\D/g, "").length > 0 && (
            <label className="haulz-calc-field haulz-calc-contacts__company">
              <span className="haulz-calc-label">Наименование</span>
              <input
                className="haulz-calc-input"
                placeholder="Заполнится по ИНН или введите вручную"
                value={value.companyName}
                onChange={(e) => onChange({ inn: value.inn, companyName: e.target.value })}
              />
            </label>
          )}
          <button
            type="button"
            className="haulz-calc-link-btn"
            style={{ marginTop: "0.5rem" }}
            onClick={() => {
              clearSender();
              setDropdownOpen(true);
            }}
          >
            Выбрать из справочника поставщиков
          </button>
        </div>
      )}
    </div>
  );
}
