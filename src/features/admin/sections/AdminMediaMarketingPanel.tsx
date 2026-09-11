import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2, Sparkles, CheckCircle2, Circle, Megaphone, ListChecks, CalendarDays } from "lucide-react";
import {
  createMediaAdPlacement,
  createMediaPlan,
  deleteMediaAdPlacement,
  deleteMediaPlan,
  fetchMediaAdPlacements,
  fetchMediaPlan,
  fetchMediaPlans,
  fetchMediaSeoChecklist,
  generateMediaPlanArticle,
  patchMediaSeoChecklist,
  updateMediaAdPlacement,
  updateMediaPlan,
  type MediaAdPlacement,
  type MediaContentPlan,
  type MediaSeoChecklistItem,
} from "../../../api/client/admin/mediaMarketing";
import {
  MEDIA_AD_PLACEMENT_TYPES,
  MEDIA_AD_STATUSES,
  MEDIA_CONTENT_STATUSES,
  MEDIA_PUBLISH_CHANNELS,
  type MediaPublishChannel,
} from "../../../../lib/mediaMarketing/channels";

type SubTab = "checklist" | "mediaplan" | "ads";

const CATEGORY_LABELS: Record<string, string> = {
  tech: "Техника",
  content: "Контент",
  telegram: "Telegram",
  offpage: "Off-page",
  conversion: "Конверсия",
  llm: "LLM / AI",
};

type Props = { adminToken: string };

export function AdminMediaMarketingPanel({ adminToken }: Props) {
  const [sub, setSub] = useState<SubTab>("checklist");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [checklist, setChecklist] = useState<MediaSeoChecklistItem[]>([]);
  const [checklistSummary, setChecklistSummary] = useState<{
    total: number;
    done: number;
    pending: number;
    pending_owner_actions: Array<{ id: number; title: string; owner_action: string }>;
  } | null>(null);

  const [plans, setPlans] = useState<MediaContentPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<MediaContentPlan | null>(null);
  const [generating, setGenerating] = useState(false);

  const [placements, setPlacements] = useState<MediaAdPlacement[]>([]);

  const [newPlan, setNewPlan] = useState({
    planned_date: new Date().toISOString().slice(0, 10),
    title: "",
    brief: "",
    target_keywords: "перевозка москва калининград, логистика B2B",
    channels: ["site", "telegram", "email"] as MediaPublishChannel[],
  });

  const [newAd, setNewAd] = useState({
    placement_type: "blogger",
    partner_name: "",
    platform: "",
    contact: "",
    description: "",
    cost_amount: "",
    start_date: "",
    end_date: "",
    url: "",
    utm_campaign: "",
    status: "planned",
  });

  const loadChecklist = useCallback(async () => {
    const data = await fetchMediaSeoChecklist(adminToken);
    setChecklist(data.items);
    setChecklistSummary(data.summary);
  }, [adminToken]);

  const loadPlans = useCallback(async () => {
    const data = await fetchMediaPlans(adminToken);
    setPlans(data.plans);
  }, [adminToken]);

  const loadPlacements = useCallback(async () => {
    const data = await fetchMediaAdPlacements(adminToken);
    setPlacements(data.placements);
  }, [adminToken]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (sub === "checklist") await loadChecklist();
      if (sub === "mediaplan") await loadPlans();
      if (sub === "ads") await loadPlacements();
    } catch (e) {
      setError((e as Error)?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [sub, loadChecklist, loadPlans, loadPlacements]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!selectedPlanId) {
      setSelectedPlan(null);
      return;
    }
    fetchMediaPlan(adminToken, selectedPlanId)
      .then((d) => setSelectedPlan(d.plan))
      .catch((e) => setError((e as Error)?.message));
  }, [adminToken, selectedPlanId]);

  const groupedChecklist = useMemo(() => {
    const map = new Map<string, MediaSeoChecklistItem[]>();
    for (const item of checklist) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [checklist]);

  const toggleChecklist = async (item: MediaSeoChecklistItem) => {
    try {
      await patchMediaSeoChecklist(adminToken, {
        checklist_id: item.id,
        is_done: !item.is_done,
        notes: item.notes ?? undefined,
      });
      await loadChecklist();
    } catch (e) {
      setError((e as Error)?.message);
    }
  };

  const handleCreatePlan = async () => {
    if (!newPlan.title.trim()) {
      setError("Укажите тему материала");
      return;
    }
    try {
      const { plan } = await createMediaPlan(adminToken, newPlan);
      setNewPlan((p) => ({ ...p, title: "", brief: "" }));
      await loadPlans();
      setSelectedPlanId(plan.id);
      setSub("mediaplan");
    } catch (e) {
      setError((e as Error)?.message);
    }
  };

  const handleGenerate = async () => {
    if (!selectedPlanId) return;
    setGenerating(true);
    setError(null);
    try {
      await generateMediaPlanArticle(adminToken, selectedPlanId);
      const { plan } = await fetchMediaPlan(adminToken, selectedPlanId);
      setSelectedPlan(plan);
      await loadPlans();
    } catch (e) {
      setError((e as Error)?.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreateAd = async () => {
    if (!newAd.partner_name.trim()) {
      setError("Укажите партнёра / площадку");
      return;
    }
    try {
      await createMediaAdPlacement(adminToken, {
        ...newAd,
        cost_amount: newAd.cost_amount ? Number(newAd.cost_amount) : null,
      });
      setNewAd({
        placement_type: "blogger",
        partner_name: "",
        platform: "",
        contact: "",
        description: "",
        cost_amount: "",
        start_date: "",
        end_date: "",
        url: "",
        utm_campaign: "",
        status: "planned",
      });
      await loadPlacements();
    } catch (e) {
      setError((e as Error)?.message);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--color-border, #e5e7eb)",
    borderRadius: 8,
    padding: "0.5rem 0.65rem",
    fontSize: "0.9rem",
  };

  const cardStyle: React.CSSProperties = {
    border: "1px solid var(--color-border, #e5e7eb)",
    borderRadius: 12,
    padding: "1rem",
    background: "#fff",
  };

  return (
    <div style={{ padding: "0.25rem 0 2rem" }}>
      <Typography.Headline style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>
        Медиа и SEO
      </Typography.Headline>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Чек-лист SEO, медиаплан с генерацией статей (GPT, ключ OPENAI_API_KEY на сервере), учёт рекламных интеграций.
      </Typography.Body>

      <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <Button className="filter-button" style={{ background: sub === "checklist" ? "var(--color-primary-blue)" : undefined, color: sub === "checklist" ? "#fff" : undefined }} onClick={() => setSub("checklist")}>
          <ListChecks className="w-4 h-4" style={{ marginRight: 6 }} />
          SEO чек-лист
        </Button>
        <Button className="filter-button" style={{ background: sub === "mediaplan" ? "var(--color-primary-blue)" : undefined, color: sub === "mediaplan" ? "#fff" : undefined }} onClick={() => setSub("mediaplan")}>
          <CalendarDays className="w-4 h-4" style={{ marginRight: 6 }} />
          Медиаплан
        </Button>
        <Button className="filter-button" style={{ background: sub === "ads" ? "var(--color-primary-blue)" : undefined, color: sub === "ads" ? "#fff" : undefined }} onClick={() => setSub("ads")}>
          <Megaphone className="w-4 h-4" style={{ marginRight: 6 }} />
          Реклама и интеграции
        </Button>
      </Flex>

      {error && (
        <Typography.Body style={{ color: "var(--color-error)", marginBottom: "0.75rem", fontSize: "0.88rem" }}>
          {error}
        </Typography.Body>
      )}

      {loading && (
        <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.75rem" }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.85rem" }}>Загрузка…</Typography.Body>
        </Flex>
      )}

      {sub === "checklist" && checklistSummary && (
        <div style={{ ...cardStyle, marginBottom: "1rem", background: "#f0f9ff" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
            Прогресс: {checklistSummary.done}/{checklistSummary.total} · осталось {checklistSummary.pending}
          </Typography.Body>
          {checklistSummary.pending_owner_actions.length > 0 && (
            <>
              <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Что требуется от вас:
              </Typography.Body>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                {checklistSummary.pending_owner_actions.map((a) => (
                  <li key={a.id} style={{ marginBottom: "0.35rem" }}>
                    <strong>{a.title}:</strong> {a.owner_action}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {sub === "checklist" &&
        [...groupedChecklist.entries()].map(([category, items]) => (
          <div key={category} style={{ marginBottom: "1.25rem" }}>
            <Typography.Body style={{ fontWeight: 700, marginBottom: "0.5rem" }}>
              {CATEGORY_LABELS[category] ?? category}
            </Typography.Body>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {items.map((item) => (
                <div key={item.id} style={cardStyle}>
                  <Flex align="flex-start" gap="0.65rem">
                    <button type="button" onClick={() => toggleChecklist(item)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                      {item.is_done ? <CheckCircle2 className="w-5 h-5" color="#16a34a" /> : <Circle className="w-5 h-5" color="#9ca3af" />}
                    </button>
                    <div style={{ flex: 1 }}>
                      <Typography.Body style={{ fontWeight: 600 }}>{item.title}</Typography.Body>
                      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: 4 }}>
                        {item.description}
                      </Typography.Body>
                      <Typography.Body style={{ fontSize: "0.85rem", marginTop: 6, color: "#1d4ed8" }}>
                        Ваши действия: {item.owner_action}
                      </Typography.Body>
                      {item.doc_link && (
                        <a href={item.doc_link.startsWith("http") ? item.doc_link : item.doc_link} target="_blank" rel="noreferrer" style={{ fontSize: "0.8rem" }}>
                          Документация
                        </a>
                      )}
                    </div>
                  </Flex>
                </div>
              ))}
            </div>
          </div>
        ))}

      {sub === "mediaplan" && (
        <Flex gap="1rem" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 280 }}>
            <div style={{ ...cardStyle, marginBottom: "1rem" }}>
              <Typography.Body style={{ fontWeight: 600, marginBottom: "0.65rem" }}>Новая публикация</Typography.Body>
              <label style={{ display: "block", marginBottom: 8, fontSize: "0.85rem" }}>Дата</label>
              <input type="date" value={newPlan.planned_date} onChange={(e) => setNewPlan((p) => ({ ...p, planned_date: e.target.value }))} style={inputStyle} />
              <label style={{ display: "block", margin: "8px 0 4px", fontSize: "0.85rem" }}>Тема</label>
              <input value={newPlan.title} onChange={(e) => setNewPlan((p) => ({ ...p, title: e.target.value }))} placeholder="Перевозка 500 кг MOW–KGD: паром vs авто" style={inputStyle} />
              <label style={{ display: "block", margin: "8px 0 4px", fontSize: "0.85rem" }}>Описание / brief для GPT</label>
              <textarea value={newPlan.brief} onChange={(e) => setNewPlan((p) => ({ ...p, brief: e.target.value }))} rows={3} style={inputStyle} placeholder="Угол статьи, ЦА, что подчеркнуть…" />
              <label style={{ display: "block", margin: "8px 0 4px", fontSize: "0.85rem" }}>Ключевые слова</label>
              <input value={newPlan.target_keywords} onChange={(e) => setNewPlan((p) => ({ ...p, target_keywords: e.target.value }))} style={inputStyle} />
              <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600, margin: "10px 0 6px" }}>Каналы публикации</Typography.Body>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {MEDIA_PUBLISH_CHANNELS.map((ch) => {
                  const on = newPlan.channels.includes(ch.id);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      title={ch.hint}
                      onClick={() =>
                        setNewPlan((p) => ({
                          ...p,
                          channels: on ? p.channels.filter((c) => c !== ch.id) : [...p.channels, ch.id],
                        }))
                      }
                      style={{
                        fontSize: "0.75rem",
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid #cbd5e1",
                        background: on ? "#2563eb" : "#fff",
                        color: on ? "#fff" : "#374151",
                        cursor: "pointer",
                      }}
                    >
                      {ch.label}
                    </button>
                  );
                })}
              </div>
              <Button className="filter-button" style={{ marginTop: 12 }} onClick={handleCreatePlan}>
                Добавить в медиаплан
              </Button>
            </div>

            <Typography.Body style={{ fontWeight: 600, marginBottom: 8 }}>Запланированные материалы</Typography.Body>
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlanId(p.id)}
                style={{
                  ...cardStyle,
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 8,
                  cursor: "pointer",
                  borderColor: selectedPlanId === p.id ? "#2563eb" : cardStyle.border as string,
                }}
              >
                <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem" }}>{p.planned_date?.slice(0, 10)} · {p.title}</Typography.Body>
                <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                  {MEDIA_CONTENT_STATUSES.find((s) => s.id === p.status)?.label ?? p.status}
                  {p.article_slug ? ` · /blog/${p.article_slug}` : ""}
                </Typography.Body>
              </button>
            ))}
          </div>

          <div style={{ flex: "2 1 420px", minWidth: 300 }}>
            {selectedPlan ? (
              <div style={cardStyle}>
                <Flex justify="space-between" align="center" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <Typography.Body style={{ fontWeight: 700 }}>{selectedPlan.article_title || selectedPlan.title}</Typography.Body>
                  <Button className="filter-button" onClick={handleGenerate} disabled={generating}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" style={{ marginRight: 6 }} />}
                    {generating ? "GPT…" : "Сгенерировать статью"}
                  </Button>
                </Flex>
                <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: 8 }}>
                  OPENAI_API_KEY на сервере API. Модель: gpt-4o-mini. После генерации проверьте текст и опубликуйте в выбранных каналах.
                </Typography.Body>
                {selectedPlan.meta_description && (
                  <>
                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta description</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", marginBottom: 8 }}>{selectedPlan.meta_description}</Typography.Body>
                  </>
                )}
                {selectedPlan.telegram_teaser && (
                  <>
                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>Telegram (анонс)</Typography.Body>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", background: "#f9fafb", padding: 8, borderRadius: 8 }}>{selectedPlan.telegram_teaser}</pre>
                  </>
                )}
                {selectedPlan.email_subject && (
                  <>
                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem" }}>Email</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem" }}>{selectedPlan.email_subject}</Typography.Body>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem", background: "#f9fafb", padding: 8, borderRadius: 8 }}>{selectedPlan.email_teaser}</pre>
                  </>
                )}
                {selectedPlan.body_markdown && (
                  <>
                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", marginTop: 8 }}>Статья (Markdown)</Typography.Body>
                    <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", maxHeight: 420, overflow: "auto", background: "#f9fafb", padding: 10, borderRadius: 8 }}>
                      {selectedPlan.body_markdown}
                    </pre>
                  </>
                )}
                <Flex gap="0.5rem" style={{ marginTop: 12, flexWrap: "wrap" }}>
                  <Button
                    className="filter-button"
                    onClick={async () => {
                      await updateMediaPlan(adminToken, { id: selectedPlan.id, status: "ready" });
                      const { plan } = await fetchMediaPlan(adminToken, selectedPlan.id);
                      setSelectedPlan(plan);
                      loadPlans();
                    }}
                  >
                    Отметить «Готово»
                  </Button>
                  <Button
                    className="filter-button"
                    onClick={async () => {
                      if (!selectedPlan.article_slug || !selectedPlan.body_markdown) {
                        setError("Сначала сгенерируйте статью (нужны slug и текст)");
                        return;
                      }
                      await updateMediaPlan(adminToken, { id: selectedPlan.id, mark_published: true });
                      const { plan } = await fetchMediaPlan(adminToken, selectedPlan.id);
                      setSelectedPlan(plan);
                      loadPlans();
                    }}
                  >
                    Опубликовать на сайт
                  </Button>
                  {selectedPlan.status === "published" && selectedPlan.article_slug && (
                    <a
                      href={`/blog/${selectedPlan.article_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="filter-button"
                      style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                    >
                      Открыть /blog/{selectedPlan.article_slug}
                    </a>
                  )}
                  <Button
                    className="filter-button"
                    onClick={async () => {
                      if (!confirm("Удалить план?")) return;
                      await deleteMediaPlan(adminToken, selectedPlan.id);
                      setSelectedPlanId(null);
                      loadPlans();
                    }}
                  >
                    Удалить
                  </Button>
                </Flex>
              </div>
            ) : (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Выберите материал из списка или создайте новый.</Typography.Body>
            )}
          </div>
        </Flex>
      )}

      {sub === "ads" && (
        <>
          <div style={{ ...cardStyle, marginBottom: "1rem" }}>
            <Typography.Body style={{ fontWeight: 600, marginBottom: 8 }}>Новая интеграция / рекламное место</Typography.Body>
            <Flex gap="0.75rem" style={{ flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ fontSize: "0.8rem" }}>Тип</label>
                <select value={newAd.placement_type} onChange={(e) => setNewAd((a) => ({ ...a, placement_type: e.target.value }))} style={inputStyle}>
                  {MEDIA_AD_PLACEMENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "2 1 240px" }}>
                <label style={{ fontSize: "0.8rem" }}>Партнёр / блогер / площадка *</label>
                <input value={newAd.partner_name} onChange={(e) => setNewAd((a) => ({ ...a, partner_name: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: "0.8rem" }}>Платформа</label>
                <input value={newAd.platform} onChange={(e) => setNewAd((a) => ({ ...a, platform: e.target.value }))} placeholder="TG, YouTube…" style={inputStyle} />
              </div>
            </Flex>
            <Flex gap="0.75rem" style={{ flexWrap: "wrap", marginTop: 8 }}>
              <div style={{ flex: "1 1 120px" }}>
                <label style={{ fontSize: "0.8rem" }}>Бюджет ₽</label>
                <input value={newAd.cost_amount} onChange={(e) => setNewAd((a) => ({ ...a, cost_amount: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <label style={{ fontSize: "0.8rem" }}>С</label>
                <input type="date" value={newAd.start_date} onChange={(e) => setNewAd((a) => ({ ...a, start_date: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <label style={{ fontSize: "0.8rem" }}>По</label>
                <input type="date" value={newAd.end_date} onChange={(e) => setNewAd((a) => ({ ...a, end_date: e.target.value }))} style={inputStyle} />
              </div>
            </Flex>
            <label style={{ fontSize: "0.8rem", display: "block", marginTop: 8 }}>Описание</label>
            <textarea value={newAd.description} onChange={(e) => setNewAd((a) => ({ ...a, description: e.target.value }))} rows={2} style={inputStyle} />
            <Button className="filter-button" style={{ marginTop: 10 }} onClick={handleCreateAd}>
              Добавить
            </Button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {placements.map((pl) => (
              <div key={pl.id} style={cardStyle}>
                <Flex justify="space-between" align="flex-start" style={{ flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <Typography.Body style={{ fontWeight: 600 }}>
                      {MEDIA_AD_PLACEMENT_TYPES.find((t) => t.id === pl.placement_type)?.label ?? pl.placement_type} · {pl.partner_name}
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                      {pl.platform || "—"} · {MEDIA_AD_STATUSES.find((s) => s.id === pl.status)?.label ?? pl.status}
                      {pl.cost_amount ? ` · ${pl.cost_amount} ${pl.cost_currency}` : ""}
                      {pl.start_date ? ` · ${pl.start_date?.slice(0, 10)}` : ""}
                    </Typography.Body>
                    {pl.description && <Typography.Body style={{ fontSize: "0.85rem", marginTop: 4 }}>{pl.description}</Typography.Body>}
                  </div>
                  <Flex gap="0.35rem">
                    <select
                      value={pl.status}
                      onChange={async (e) => {
                        await updateMediaAdPlacement(adminToken, { id: pl.id, status: e.target.value });
                        loadPlacements();
                      }}
                      style={{ ...inputStyle, width: "auto" }}
                    >
                      {MEDIA_AD_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <Button
                      className="filter-button"
                      onClick={async () => {
                        if (!confirm("Удалить запись?")) return;
                        await deleteMediaAdPlacement(adminToken, pl.id);
                        loadPlacements();
                      }}
                    >
                      ×
                    </Button>
                  </Flex>
                </Flex>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
