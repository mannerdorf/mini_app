import React from "react";

export function ProgramConflictReview({ fields, disabled, onAccept }: { fields: { label: string; server: string; draft: string }[]; disabled: boolean; onAccept: () => void }) {
  return <div className="gp-conflict" role="alert"><strong>На сервере появилась новая версия</strong><p>Сверьте изменения команды со своим черновиком. Можно отредактировать поля выше или отменить свои правки.</p><div className="gp-conflict-fields">{fields.filter((field) => field.server !== field.draft).map((field) => <div key={field.label}><strong>{field.label}</strong><div><span>Сейчас на сервере</span><p>{field.server || "Не заполнено"}</p></div><div><span>Ваш черновик</span><p>{field.draft || "Не заполнено"}</p></div></div>)}</div><button type="button" className="gp-button" disabled={disabled} onClick={onAccept}>Сверил изменения — оставить мой вариант</button><small>После этого нажмите «Сохранить». До сохранения серверная версия не изменится.</small></div>;
}
