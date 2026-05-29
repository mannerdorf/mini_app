import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "../types";
import {
  emptyLegalStatusResponse,
  fetchLegalPublic,
  fetchLegalStatus,
  postLegalAccept,
  type LegalPublicDoc,
  type LegalStatusResponse,
} from "../api/client/legal";
import { PUBLIC_OFFER_TEXT, PERSONAL_DATA_CONSENT_TEXT } from "../constants/legalTexts";
import { adjustLegalStatusForAccount } from "../lib/legalCompliance";

export function useLegalCompliance(activeAccount: Account | null | undefined) {
  const [status, setStatus] = useState<LegalStatusResponse | null>(null);
  const [offerText, setOfferText] = useState(PUBLIC_OFFER_TEXT);
  const [consentText, setConsentText] = useState(PERSONAL_DATA_CONSENT_TEXT);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = activeAccount?.login?.trim().toLowerCase() ?? "";
  const password = activeAccount?.password ?? "";
  const permissions = activeAccount?.isRegisteredUser ? activeAccount.permissions : undefined;
  const serviceModeLegalExempt = permissions?.service_mode === true;

  const statusForUi = useMemo(
    () => (status ? adjustLegalStatusForAccount(status, permissions) : null),
    [status, permissions]
  );

  const refresh = useCallback(async () => {
    if (!login || !password) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [pub, st] = await Promise.all([
        fetchLegalPublic().catch(() => ({ offer: null, consent: null })),
        fetchLegalStatus(login, password).catch(() => emptyLegalStatusResponse()),
      ]);
      if (pub.offer?.body_text) setOfferText(pub.offer.body_text);
      if (pub.consent?.body_text) setConsentText(pub.consent.body_text);
      setStatus(st);
    } catch (e: unknown) {
      setError((e as Error)?.message || "Ошибка загрузки юридических документов");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [login, password]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const acceptCurrent = useCallback(async () => {
    if (!login || !password || !statusForUi || serviceModeLegalExempt) return;
    setAccepting(true);
    setError(null);
    try {
      await postLegalAccept(login, password, {
        ...(statusForUi.pending.offer ? { offerVersionId: statusForUi.current.offer?.id } : {}),
        ...(statusForUi.pending.consent ? { consentVersionId: statusForUi.current.consent?.id } : {}),
      });
      await refresh();
    } catch (e: unknown) {
      setError((e as Error)?.message || "Не удалось сохранить принятие");
      throw e;
    } finally {
      setAccepting(false);
    }
  }, [login, password, statusForUi, serviceModeLegalExempt, refresh]);

  const pending = !!statusForUi?.pending?.any;

  return {
    status: statusForUi,
    pending,
    offerText,
    consentText,
    loading,
    accepting,
    error,
    refresh,
    acceptCurrent,
  };
}

export type { LegalPublicDoc, LegalStatusResponse };
