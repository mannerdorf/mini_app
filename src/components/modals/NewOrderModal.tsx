import React, { useState, useEffect, useCallback } from "react";
import { Button, Flex, Typography, Input } from "@maxhub/max-ui";
import { X, Loader2, Upload, FileText } from "lucide-react";
import * as XLSX from "xlsx";

export type PvzItem = {
  Ссылка: string;
  Наименование: string;
  КодДляПечати: string;
  ГородНаименование: string;
  РегионНаименование: string;
  ВладелецИНН: string;
  ВладелецНаименование: string;
  ОтправительПолучательНаименование: string;
  КонтактноеЛицо: string;
};

export type TableRow = {
  n: number;
  posylka: string;
  otskanirvano: boolean;
  dataSkanirovaniya: string;
  perevozka: string;
};

export type NewOrderSubmitData = {
  punktOtpravki: string;
  punktNaznacheniya: string;
  nomerZayavki: string;
  dataZabora: string;
  tableRows: TableRow[];
};

type NewOrderModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: NewOrderSubmitData) => void | Promise<void>;
  auth: { login: string; password: string };
  activeInn: string | null;
};

const ATTACH_MODE = ["file", "upd"] as const;
type AttachMode = (typeof ATTACH_MODE)[number];

export function NewOrderModal({ isOpen, onClose, onSubmit, auth, activeInn }: NewOrderModalProps) {
  const [pvzList, setPvzList] = useState<PvzItem[]>([]);
  const [pvzLoading, setPvzLoading] = useState(false);
  const [punktOtpravki, setPunktOtpravki] = useState("");
  const [punktNaznacheniya, setPunktNaznacheniya] = useState("");
  const [nomerZayavki, setNomerZayavki] = useState("");
  const [dataZabora, setDataZabora] = useState("");
  const [attachMode, setAttachMode] = useState<AttachMode | "">("");
  const [fileZayavki, setFileZayavki] = useState<File | null>(null);
  const [kolvoMest, setKolvoMest] = useState("");
  const [fileUpd, setFileUpd] = useState<File | null>(null);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [createMestaLoading, setCreateMestaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPvz = useCallback(() => {
    if (!auth?.login || !auth?.password) return;
    setPvzLoading(true);
    fetch("/api/pvz-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        login: auth.login,
        password: auth.password,
        inn: activeInn || undefined,
      }),
    })
      .then((r) => r.json())
      .then((data: { pvz?: PvzItem[] }) => setPvzList(data?.pvz || []))
      .catch(() => setPvzList([]))
      .finally(() => setPvzLoading(false));
  }, [auth?.login, auth?.password, activeInn]);

  useEffect(() => {
    if (isOpen) {
      loadPvz();
      setPunktOtpravki("");
      setPunktNaznacheniya("");
      setNomerZayavki("");
      setDataZabora("");
      setAttachMode("");
      setFileZayavki(null);
      setKolvoMest("");
      setFileUpd(null);
      setTableRows([]);
      setError(null);
    }
  }, [isOpen, loadPvz]);

  const handleCreateMesta = async () => {
    setCreateMestaLoading(true);
    setError(null);
    try {
      await doCreateMesta();
    } finally {
      setCreateMestaLoading(false);
    }
  };

  const doCreateMesta = async () => {
    const count = parseInt(kolvoMest, 10);
    if (!Number.isFinite(count) || count < 1) {
      setError("Укажите корректное количество мест");
      return;
    }
    if (!fileUpd) {
      setError("Загрузите файл УПД");
      return;
    }
    const ext = (fileUpd.name || "").toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
      setError("УПД: поддерживается только Excel (.xlsx, .xls). PDF будет добавлен позже.");
      return;
    }
    setError(null);
    try {
      const buf = await fileUpd.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
      if (!data?.length) {
        setError("Файл пустой или не удалось прочитать");
        return;
      }
      // Ищем строку заголовка по типичным колонкам УПД
      const findCol = (row: unknown[], kws: string[]) => {
        for (let i = 0; i < (row?.length ?? 0); i++) {
          const cell = String(row[i] ?? "").toLowerCase();
          if (kws.some((k) => cell.includes(k))) return i;
        }
        return -1;
      };
      let headerIdx = 0;
      for (let i = 0; i < Math.min(20, data.length); i++) {
        const row = data[i] as unknown[];
        if (findCol(row ?? [], ["номенклатура", "наименование"]) >= 0 || findCol(row ?? [], ["количество", "кол-во"]) >= 0) {
          headerIdx = i;
          break;
        }
      }
      const dataRows: string[][] = [];
      for (let i = headerIdx + 1; i < data.length; i++) {
        const row = data[i] as unknown[];
        if (!row?.length) continue;
        const parts = row.slice(0, 8).map((c) => String(c ?? "").trim()).filter(Boolean);
        if (parts.length) dataRows.push(parts);
      }
      if (!dataRows.length) {
        setError("В УПД не найдено строк данных");
        return;
      }
      // Перемешиваем и распределяем по местам
      const shuffled = [...dataRows].sort(() => Math.random() - 0.5);
      const perPlace = Math.ceil(shuffled.length / count);
      const rows: TableRow[] = [];
      let idx = 0;
      for (let i = 0; i < count; i++) {
        const chunk = shuffled.slice(idx, idx + perPlace);
        idx += perPlace;
        const posylkaLabel = chunk.length ? (chunk.length === 1 ? chunk[0][0] || `ПМ-${i + 1}` : `Место ${i + 1} (${chunk.length} поз.)`) : `Место ${i + 1}`;
        rows.push({
          n: i + 1,
          posylka: posylkaLabel,
          otskanirvano: false,
          dataSkanirovaniya: "",
          perevozka: "",
        });
      }
      setTableRows(rows);
    } catch (e) {
      setError((e as Error)?.message || "Ошибка чтения файла УПД");
    }
  };

  const handleSubmit = async () => {
    setSubmitLoading(true);
    setError(null);
    try {
      await onSubmit?.({ punktOtpravki, punktNaznacheniya, nomerZayavki, dataZabora, tableRows });
      onClose();
    } catch (e) {
      setError((e as Error)?.message || "Ошибка");
    } finally {
      setSubmitLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 640, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <Typography.Headline>Новая заявка</Typography.Headline>
          <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </Button>
        </div>
        <div style={{ padding: "1rem", overflowY: "auto", flex: 1 }}>
          {/* Пункт отправки */}
          <Typography.Label style={{ display: "block", marginBottom: "0.25rem" }}>Пункт отправки</Typography.Label>
          <select
            className="admin-form-input"
            value={punktOtpravki}
            onChange={(e) => setPunktOtpravki(e.target.value)}
            style={{ width: "100%", marginBottom: "0.75rem", padding: "0.5rem", whiteSpace: "nowrap" }}
            disabled={pvzLoading}
          >
            <option value="">— Выберите ПВЗ —</option>
            {pvzList.map((p) => {
              const label = p.ГородНаименование ? `${p.Наименование} (${p.ГородНаименование})` : p.Наименование;
              return (
                <option key={p.Ссылка} value={p.Ссылка}>
                  {label}
                </option>
              );
            })}
          </select>

          {/* Пункт назначения */}
          <Typography.Label style={{ display: "block", marginBottom: "0.25rem" }}>Пункт назначения</Typography.Label>
          <select
            className="admin-form-input"
            value={punktNaznacheniya}
            onChange={(e) => setPunktNaznacheniya(e.target.value)}
            style={{ width: "100%", marginBottom: "0.75rem", padding: "0.5rem", whiteSpace: "nowrap" }}
            disabled={pvzLoading}
          >
            <option value="">— Выберите ПВЗ —</option>
            {pvzList.map((p) => {
              const label = p.ГородНаименование ? `${p.Наименование} (${p.ГородНаименование})` : p.Наименование;
              return (
                <option key={p.Ссылка} value={p.Ссылка}>
                  {label}
                </option>
              );
            })}
          </select>

          {/* Номер заявки */}
          <Typography.Label style={{ display: "block", marginBottom: "0.25rem" }}>Номер заявки</Typography.Label>
          <Input
            className="admin-form-input"
            value={nomerZayavki}
            onChange={(e) => setNomerZayavki(e.target.value)}
            placeholder="Номер заявки"
            style={{ width: "100%", marginBottom: "0.75rem" }}
          />

          {/* Дата забора */}
          <Typography.Label style={{ display: "block", marginBottom: "0.25rem" }}>Дата забора</Typography.Label>
          <Input
            type="date"
            className="admin-form-input"
            value={dataZabora}
            onChange={(e) => setDataZabora(e.target.value)}
            style={{ width: "100%", marginBottom: "0.75rem" }}
          />

          {/* Прикрепить файл заявки или УПД */}
          <Typography.Label style={{ display: "block", marginBottom: "0.25rem" }}>Прикрепить</Typography.Label>
          <select
            className="admin-form-input"
            value={attachMode}
            onChange={(e) => setAttachMode((e.target.value || "") as AttachMode | "")}
            style={{ width: "100%", marginBottom: "0.5rem", padding: "0.5rem" }}
          >
            <option value="">— Выберите —</option>
            <option value="file">Файл заявки</option>
            <option value="upd">УПД</option>
          </select>

          {attachMode === "file" && (
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.5rem 0.75rem",
                  background: "var(--color-bg-hover)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                <Upload className="w-4 h-4" />
                {fileZayavki ? fileZayavki.name : "Загрузить файл"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={(e) => setFileZayavki(e.target.files?.[0] ?? null)}
                  style={{ display: "none" }}
                />
              </label>
              <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                Образец формата будет добавлен позже. Файл будет распарсен по полям.
              </Typography.Body>
            </div>
          )}

          {attachMode === "upd" && (
            <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "var(--color-bg-hover)", borderRadius: 8 }}>
              <Typography.Label style={{ display: "block", marginBottom: "0.35rem" }}>Кол-во мест</Typography.Label>
              <Input
                type="number"
                min={1}
                className="admin-form-input"
                value={kolvoMest}
                onChange={(e) => setKolvoMest(e.target.value)}
                placeholder="Укажите кол-во мест"
                style={{ width: "100%", marginBottom: "0.5rem" }}
              />
              <Typography.Label style={{ display: "block", marginBottom: "0.35rem" }}>УПД</Typography.Label>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.5rem 0.75rem",
                  background: "var(--color-primary-blue)",
                  color: "white",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                <FileText className="w-4 h-4" />
                {fileUpd ? fileUpd.name : "Загрузить УПД"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.pdf"
                  onChange={(e) => setFileUpd(e.target.files?.[0] ?? null)}
                  style={{ display: "none" }}
                />
              </label>
              <Button
                style={{ marginTop: "0.5rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                onClick={handleCreateMesta}
                disabled={!kolvoMest || !fileUpd || createMestaLoading}
              >
                {createMestaLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Создать места
              </Button>
            </div>
          )}

          {/* Табличная часть */}
          {tableRows.length > 0 && (
            <div style={{ marginTop: "1rem", overflowX: "auto" }}>
              <Typography.Label style={{ display: "block", marginBottom: "0.5rem" }}>Табличная часть</Typography.Label>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
                    <th style={{ padding: "0.4rem 0.35rem", textAlign: "left", fontWeight: 600 }}>N</th>
                    <th style={{ padding: "0.4rem 0.35rem", textAlign: "left", fontWeight: 600 }}>Посылка</th>
                    <th style={{ padding: "0.4rem 0.35rem", textAlign: "center", fontWeight: 600 }}>Отсканировано</th>
                    <th style={{ padding: "0.4rem 0.35rem", textAlign: "left", fontWeight: 600 }}>Дата сканирования</th>
                    <th style={{ padding: "0.4rem 0.35rem", textAlign: "left", fontWeight: 600 }}>Перевозка</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.n} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "0.4rem 0.35rem" }}>{row.n}</td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>{row.posylka || "—"}</td>
                      <td style={{ padding: "0.4rem 0.35rem", textAlign: "center", color: row.otskanirvano ? "#22c55e" : undefined }}>
                        {row.otskanirvano ? "✓" : "—"}
                      </td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>{row.dataSkanirovaniya || "—"}</td>
                      <td style={{ padding: "0.4rem 0.35rem" }}>{row.perevozka || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <Typography.Body style={{ color: "var(--color-error)", marginTop: "0.5rem", fontSize: "0.85rem" }}>
              {error}
            </Typography.Body>
          )}
        </div>
        <div style={{ padding: "1rem", flexShrink: 0, borderTop: "1px solid var(--color-border)" }}>
          <Flex gap="0.5rem" justify="flex-end">
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitLoading || !punktOtpravki || !punktNaznacheniya || !nomerZayavki || !dataZabora}
            >
              {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Создать заявку
            </Button>
          </Flex>
        </div>
      </div>
    </div>
  );
}
