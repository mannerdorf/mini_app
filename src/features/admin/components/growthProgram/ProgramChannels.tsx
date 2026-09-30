import React, { useState } from "react";
import { ArrowUpRight, Globe2, Loader2, Radio, Save, Send, Youtube } from "lucide-react";
import type { ProgramChannel, ProgramChannelPatch } from "../../../../../lib/mediaMarketing/programTypes";
import { CHANNEL_STATUS, formatDate, safeExternalUrl } from "./programUi";
import { ProgramConflictReview } from "./ProgramConflictReview";

type ChannelDraft = ProgramChannelPatch & { expected_updated_at: string | null };
type DraftStateProps = { mutationPending: boolean; drafts: Record<string, ChannelDraft>; setDrafts: React.Dispatch<React.SetStateAction<Record<string, ChannelDraft>>> };
function ChannelCard({ channel, readOnly, onSave, mutationPending, drafts, setDrafts }: { channel: ProgramChannel; readOnly: boolean; onSave: (draft: ChannelDraft) => Promise<void> } & DraftStateProps) {
  const draft = drafts[channel.id] ?? null;
  const setDraft = (value: React.SetStateAction<ChannelDraft | null>) => setDrafts((current) => { const next = { ...current }; const nextDraft = typeof value === "function" ? value(current[channel.id] ?? null) : value; if (nextDraft) next[channel.id] = nextDraft; else delete next[channel.id]; return next; });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const values = draft ?? channel;
  const stale = Boolean(draft && draft.expected_updated_at !== channel.updated_at);
  const update = (patch: Partial<ChannelDraft>) => { setDraft((current) => ({ ...(current ?? { id: channel.id, status: channel.status, url: channel.url, notes: channel.notes, expected_updated_at: channel.updated_at }), ...patch })); setSaved(false); setError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!draft || readOnly || mutationPending || saving || stale) return;
    if (draft.url && !safeExternalUrl(draft.url)) { setError("Укажите полный адрес с https:// или http://"); return; }
    setSaving(true); setError("");
    try { await onSave(draft); setDraft(null); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить канал"); }
    finally { setSaving(false); }
  };
  const slug = channel.id.toLowerCase();
  const Icon = slug.includes("telegram") || slug === "tg" ? Send : slug.includes("youtube") ? Youtube : slug.includes("vk") ? Radio : Globe2;
  const href = safeExternalUrl(channel.url);
  return <article className="gp-card gp-channel-card">
    <div className="gp-channel-heading"><div className={`gp-channel-icon gp-channel-icon-${slug}`}><Icon size={22} /></div><div><h3>{channel.name}</h3><span className={`gp-channel-state gp-channel-state-${channel.status}`}>{CHANNEL_STATUS[channel.status]}</span></div>{href && <a className="gp-icon-button" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Открыть ${channel.name}`}><ArrowUpRight size={18} /></a>}</div>
    <p className="gp-description">{channel.description}</p>
    <form className="gp-form" onSubmit={save}><fieldset disabled={readOnly || saving || mutationPending}>
      <label>Адрес канала<input type="url" placeholder="https://…" value={values.url} maxLength={2000} onChange={(event) => update({ url: event.target.value })} /></label>
      <label>Статус готовности<select value={values.status} onChange={(event) => update({ status: event.target.value as ProgramChannel["status"] })}>{Object.entries(CHANNEL_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Заметки<textarea rows={3} value={values.notes} maxLength={10000} placeholder="Владелец, доступы и следующий шаг. Не сохраняйте токены и пароли." onChange={(event) => update({ notes: event.target.value })} /></label>
      {stale && draft && <ProgramConflictReview disabled={mutationPending || saving || readOnly} fields={[{ label: "Статус", server: CHANNEL_STATUS[channel.status], draft: CHANNEL_STATUS[draft.status] }, { label: "Адрес", server: channel.url, draft: draft.url }, { label: "Заметки", server: channel.notes, draft: draft.notes }]} onAccept={() => { setDraft({ ...draft, expected_updated_at: channel.updated_at }); setError(""); }} />}
      <div className="gp-save-row"><button className="gp-button gp-button-primary" type="submit" disabled={!draft || stale}>{saving ? <Loader2 className="gp-spin" size={15} /> : <Save size={15} />}{saving ? "Сохраняем…" : "Сохранить"}</button>{draft && <button type="button" className="gp-button gp-button-quiet" onClick={() => { setDraft(null); setError(""); }}>Отменить</button>}</div>
    </fieldset><div className="gp-save-feedback" aria-live="polite">{error ? <span role="alert" className="gp-error-text">{error}</span> : saved ? <span className="gp-success-text">Сохранено на сервере</span> : draft ? "Есть несохранённые изменения" : `Обновлено: ${formatDate(channel.updated_at)}`}</div></form>
  </article>;
}

export function ProgramChannels({ channels, readOnly, onSave, ...draftState }: { channels: ProgramChannel[]; readOnly: boolean; onSave: (draft: ChannelDraft) => Promise<void> } & DraftStateProps) {
  return <section><div className="gp-section-heading"><div><span className="gp-eyebrow">DISTRIBUTION</span><h2>Каналы присутствия</h2><p>Ручной реестр готовности. Статус подтверждает команда; он не подключает OAuth, публикацию или аналитику.</p></div></div><div className="gp-channels-grid">{channels.map((channel) => <ChannelCard key={channel.id} channel={channel} readOnly={readOnly} onSave={onSave} {...draftState} />)}</div>{channels.length === 0 && <div className="gp-card gp-empty">В программе пока нет каналов.</div>}</section>;
}
