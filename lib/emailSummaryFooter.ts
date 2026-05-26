import { getAppUrl } from "./sendRegistrationEmail.js";
import { buildSummaryUnsubscribeUrl } from "./haulzSummaryUnsubscribe.js";
import { HAULZ_LEGAL } from "./haulzLegal.js";

/** Синий блок шапки/подвала — bgcolor для Outlook + gradient там, где поддерживается. */
export const HAULZ_EMAIL_BRAND_BAR_ATTRS =
  'bgcolor="#1e3a8a" style="background-color:#1e3a8a;background-image:linear-gradient(135deg,#1e3a8a,#2563eb);padding:20px;color:#ffffff;"';

/** Подвал письма «Отчёт» — тот же стиль, что шапка (синий градиент). */
export function renderWeeklySummaryFooterHtml(targetLogin: string): string {
  const appUrl = getAppUrl().replace(/\/$/, "");
  const unsubUrl = buildSummaryUnsubscribeUrl(targetLogin);
  const phones = HAULZ_LEGAL.offices.map((o) => `${o.city}: ${o.phone}`).join(" · ");

  return `
    <tr><td ${HAULZ_EMAIL_BRAND_BAR_ATTRS}>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:22px;font-weight:700;line-height:1.2;">HAULZ</div>
            <div style="font-size:14px;opacity:0.9;margin-top:4px;">Контакты и реквизиты</div>
          </td>
        </tr>
      </table>
      <div style="margin-top:14px;font-size:12px;line-height:1.55;opacity:0.92;">
        Сервисная сводка для пользователей личного кабинета HAULZ.
      </div>
      <div style="margin-top:10px;font-size:12px;line-height:1.55;opacity:0.92;">
        ${HAULZ_LEGAL.name} · ИНН ${HAULZ_LEGAL.inn} · ОГРН ${HAULZ_LEGAL.ogrn}<br/>
        ${HAULZ_LEGAL.address}
      </div>
      <div style="margin-top:8px;font-size:12px;line-height:1.55;opacity:0.92;">
        <a href="mailto:${HAULZ_LEGAL.email}" style="color:#fff;text-decoration:underline;">${HAULZ_LEGAL.email}</a>
        · <a href="https://${HAULZ_LEGAL.site}" style="color:#fff;text-decoration:underline;">${HAULZ_LEGAL.site}</a>
      </div>
      <div style="margin-top:6px;font-size:12px;line-height:1.55;opacity:0.88;">
        ${phones}
      </div>
      <div style="margin-top:14px;font-size:13px;line-height:1.5;opacity:0.95;">
        С уважением к вашему бизнесу,<br/><strong>команда HAULZ</strong>
      </div>
      <div style="margin-top:12px;font-size:11px;line-height:1.45;opacity:0.8;">
        Письмо сформировано автоматически. Оферта и обработка персональных данных — в личном кабинете.
      </div>
      <div style="margin-top:12px;font-size:13px;line-height:1.5;">
        <a href="${appUrl}" style="color:#fff;font-weight:600;text-decoration:underline;">Открыть личный кабинет</a>
        <span style="opacity:0.7;margin:0 6px;">·</span>
        <a href="${unsubUrl}" style="color:rgba(255,255,255,0.95);text-decoration:underline;">Отписаться от рассылки</a>
      </div>
    </td></tr>`;
}
