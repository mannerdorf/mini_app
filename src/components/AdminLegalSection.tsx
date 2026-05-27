import React, { useCallback, useEffect, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2, FileText, Shield } from "lucide-react";
import { formatDateTime } from "../lib/dateUtils";

type VersionRow = {
  id: number;
  document_type: string;
  version_label: string;
  published_at: string | null;
  is_current: boolean;
  created_at: string;
  body_length: number;
};

type JournalRow = {
  id: number;
  login: string;
  document_type: string;
  version_label: string;
  accepted_at: string;
  company_name: string;
};

type SummaryRow = {
  login: string;
  company_name: string;
  offer_version_label: string | null;
  offer_accepted_at: string | null;
  consent_version_label: string | null;
  consent_accepted_at: string | null;
};

export function AdminLegalSection({ adminToken }: { adminToken: string }) {
  const [subTab, setSubTab] = useState<"versions" | "journal">("versions");
  const [docType, setDocType] = useState<"offer" | "consent">("offer");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [journal, setJournal] = useState<JournalRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [current, setCurrent] = useState<{ offer: { version_label: string } | null; consent: { version_label: string } | null }>({
    offer: null,
    consent: null,
  });
  const [versionLabel, setVersionLabel] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [journalSearch, setJournalSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (journalSearch.trim()) params.set("q", journalSearch.trim());
      const res = await fetch(`/api/admin-legal-documents?${params.toString()}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Ошибка загрузки");
      setVersions((data as { versions?: VersionRow[] }).versions || []);
      setJournal((data as { journal?: JournalRow[] }).journal || []);
      setSummary((data as { summary?: SummaryRow[] }).summary || []);
      setCurrent((data as { current?: typeof current }).current || { offer: null, consent: null });
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [adminToken, journalSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCurrentBodyIntoEditor = useCallback(async (type: "offer" | "consent") => {
    setVersionLabel("");
    setError(null);
    try {
      const res = await fetch("/api/legal-public");
      const data = await res.json().catch(() => ({}));
      const doc =
        type === "consent"
          ? (data as { consent?: { body_text?: string } }).consent
          : (data as { offer?: { body_text?: string } }).offer;
      if (doc?.body_text) setBodyText(doc.body_text);
    } catch {
      /* текст можно вставить вручную */
    }
  }, []);

  useEffect(() => {
    if (subTab === "versions") void loadCurrentBodyIntoEditor(docType);
  }, [docType, subTab, loadCurrentBodyIntoEditor]);

  const publish = async () => {
    if (!versionLabel.trim() || !bodyText.trim()) {
      setError("Укажите метку редакции и полный текст");
      return;
    }
    if (!window.confirm(`Утвердить новую редакцию ${docType === "offer" ? "оферты" : "согласия"} «${versionLabel.trim()}»? Все пользователи должны будут принять её при следующем входе.`)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-legal-documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          document_type: docType,
          version_label: versionLabel.trim(),
          body_text: bodyText,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Ошибка публикации");
      setVersionLabel("");
      setBodyText("");
      await load();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const filteredVersions = versions.filter((v) => v.document_type === docType);

  return (
    <Panel className="cargo-card admin-legal-section" style={{ padding: "1rem" }}>
      <Typography.Headline style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>
        Оферта и согласие на обработку ПД
      </Typography.Headline>
      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Текущие редакции: оферта — {current.offer?.version_label || "—"}, согласие — {current.consent?.version_label || "—"}.
        После утверждения новой редакции пользователям показывается окно с галочками.
      </Typography.Body>

      <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
        <Button
          className="filter-button"
          style={{ background: subTab === "versions" ? "var(--color-primary-blue)" : undefined, color: subTab === "versions" ? "white" : undefined }}
          onClick={() => setSubTab("versions")}
        >
          Редакции
        </Button>
        <Button
          className="filter-button"
          style={{ background: subTab === "journal" ? "var(--color-primary-blue)" : undefined, color: subTab === "journal" ? "white" : undefined }}
          onClick={() => setSubTab("journal")}
        >
          Журнал принятий
        </Button>
      </Flex>

      {error && (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "0.75rem", fontSize: "0.9rem" }}>{error}</Typography.Body>
      )}

      {loading ? (
        <Flex justify="center" style={{ padding: "2rem" }}>
          <Loader2 className="w-6 h-6 animate-spin" />
        </Flex>
      ) : subTab === "versions" ? (
        <>
          <Flex gap="0.5rem" style={{ marginBottom: "1rem" }}>
            <Button
              className="filter-button"
              style={{ background: docType === "offer" ? "var(--color-primary-blue)" : undefined, color: docType === "offer" ? "white" : undefined }}
              onClick={() => setDocType("offer")}
            >
              <FileText className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Оферта
            </Button>
            <Button
              className="filter-button"
              style={{ background: docType === "consent" ? "var(--color-primary-blue)" : undefined, color: docType === "consent" ? "white" : undefined }}
              onClick={() => setDocType("consent")}
            >
              <Shield className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Согласие
            </Button>
          </Flex>

          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>История редакций</Typography.Body>
          <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Редакция</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Опубликована</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Символов</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }} />
                </tr>
              </thead>
              <tbody>
                {filteredVersions.map((v) => (
                  <tr key={v.id} style={{ borderBottom: "1px dashed var(--color-border)" }}>
                    <td style={{ padding: "0.35rem" }}>
                      {v.version_label}
                      {v.is_current && (
                        <span style={{ marginLeft: "0.35rem", fontSize: "0.75rem", color: "#16a34a" }}>текущая</span>
                      )}
                    </td>
                    <td style={{ padding: "0.35rem" }}>{formatDateTime(v.published_at)}</td>
                    <td style={{ padding: "0.35rem" }}>{v.body_length}</td>
                    <td style={{ padding: "0.35rem" }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Новая редакция</Typography.Body>
          <div className="admin-legal-field">
            <label htmlFor="legal-version-label" className="admin-legal-field__label">
              Метка редакции (например, «от 25.05.2026»)
            </label>
            <input
              id="legal-version-label"
              type="text"
              className="admin-legal-field-control"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="от 25.05.2026"
            />
          </div>
          <div className="admin-legal-field admin-legal-field--body">
            <label htmlFor="legal-body-text" className="admin-legal-field__label">
              Полный текст
            </label>
            <textarea
              id="legal-body-text"
              className="admin-legal-field-control admin-legal-field-control--textarea"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={14}
            />
          </div>
          <Button className="button-primary" type="button" disabled={saving} onClick={() => void publish()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Утвердить редакцию"}
          </Button>
        </>
      ) : (
        <>
          <Flex className="admin-legal-search-row" gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "1rem" }}>
            <div className="admin-legal-search-wrap">
              <input
                type="text"
                className="admin-legal-field-control"
                value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
                placeholder="Поиск: логин, компания, редакция"
                autoComplete="off"
                aria-label="Поиск в журнале принятий"
              />
            </div>
            <Button className="filter-button" type="button" onClick={() => void load()}>
              Найти
            </Button>
          </Flex>

          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Сводка по пользователям (последнее принятие)</Typography.Body>
          <div style={{ overflowX: "auto", marginBottom: "1.25rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Логин</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Компания</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Оферта</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Принята</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Согласие</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Принято</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.login} style={{ borderBottom: "1px dashed var(--color-border)" }}>
                    <td style={{ padding: "0.35rem" }}>{row.login}</td>
                    <td style={{ padding: "0.35rem" }}>{row.company_name || "—"}</td>
                    <td style={{ padding: "0.35rem" }}>{row.offer_version_label || "—"}</td>
                    <td style={{ padding: "0.35rem" }}>{formatDateTime(row.offer_accepted_at)}</td>
                    <td style={{ padding: "0.35rem" }}>{row.consent_version_label || "—"}</td>
                    <td style={{ padding: "0.35rem" }}>{formatDateTime(row.consent_accepted_at)}</td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: "0.75rem", color: "var(--color-text-secondary)" }}>
                      Пока нет записей о принятии
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Все события</Typography.Body>
          <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Дата</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Логин</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Документ</th>
                  <th style={{ textAlign: "left", padding: "0.35rem" }}>Редакция</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px dashed var(--color-border)" }}>
                    <td style={{ padding: "0.35rem", whiteSpace: "nowrap" }}>{formatDateTime(row.accepted_at)}</td>
                    <td style={{ padding: "0.35rem" }}>{row.login}</td>
                    <td style={{ padding: "0.35rem" }}>{row.document_type === "offer" ? "Оферта" : "Согласие"}</td>
                    <td style={{ padding: "0.35rem" }}>{row.version_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
