export type LegalPublicDoc = {
  id: number;
  version_label: string;
  body_text: string;
  published_at: string | null;
};

export type LegalStatusResponse = {
  current: {
    offer: { id: number; version_label: string; published_at: string | null } | null;
    consent: { id: number; version_label: string; published_at: string | null } | null;
  };
  accepted: {
    offer: { version_id: number; version_label: string; accepted_at: string } | null;
    consent: { version_id: number; version_label: string; accepted_at: string } | null;
  };
  pending: { offer: boolean; consent: boolean; any: boolean };
};

export async function fetchLegalPublic(): Promise<{
  offer: LegalPublicDoc | null;
  consent: LegalPublicDoc | null;
}> {
  const res = await fetch("/api/legal-public");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Не удалось загрузить документы");
  return {
    offer: (data as { offer?: LegalPublicDoc | null }).offer ?? null,
    consent: (data as { consent?: LegalPublicDoc | null }).consent ?? null,
  };
}

export async function fetchLegalStatus(login: string, password: string): Promise<LegalStatusResponse> {
  const res = await fetch("/api/legal-status", {
    headers: { "x-login": login.trim().toLowerCase(), "x-password": password },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Ошибка проверки согласий");
  return data as LegalStatusResponse;
}

export async function postLegalAccept(
  login: string,
  password: string,
  opts?: { offerVersionId?: number; consentVersionId?: number }
): Promise<void> {
  const res = await fetch("/api/legal-accept", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-login": login.trim().toLowerCase(),
      "x-password": password,
    },
    body: JSON.stringify({
      ...(opts?.offerVersionId != null ? { offer_version_id: opts.offerVersionId } : {}),
      ...(opts?.consentVersionId != null ? { consent_version_id: opts.consentVersionId } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Не удалось сохранить принятие");
}

/** После успешного входа — записать принятие текущих редакций (если пользователь отметил галочки). */
export function recordLegalAcceptanceQuiet(login: string, password: string): void {
  void postLegalAccept(login, password).catch((err) => {
    console.warn("legal-accept:", err);
  });
}
