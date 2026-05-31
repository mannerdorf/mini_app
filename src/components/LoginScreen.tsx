import React, { FormEvent, Suspense, lazy, useCallback, useEffect, useState } from "react";
import { HaulzBrandLogo } from "./HaulzBrandLogo";
import { LegalModal } from "./modals/LegalModal";
import { PUBLIC_OFFER_TEXT, PERSONAL_DATA_CONSENT_TEXT } from "../constants/legalTexts";
import { useAuth, normalizePermissions } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";
import {
  loadAuthMethodsConfig,
  postAuthRegisteredLogin,
  type AuthMethodsConfig,
} from "../api/client/auth";
import {
  fetchTwoFaSettings,
  sendTelegramTwoFaCode,
  verifyTwoFactorCode,
} from "../api/client/twoFa";
import { postCompaniesSave } from "../api/client/companies";
import { postGetCustomers, postPerevozkiList } from "../api/client/perevozkiClient";
import { fetchLegalPublic, recordLegalAcceptanceQuiet } from "../api/client/legal";
import {
  ensureOk,
  readJsonOrText,
  extractErrorMessage,
  extractCustomerFromPerevozki,
  extractInnFromPerevozki,
  getExistingInns,
  dedupeCustomersByInn,
} from "../utils";
import * as dateUtils from "../lib/dateUtils";
import type { Account, CustomerOption } from "../types";

const ForgotPasswordPage = lazy(() =>
  import("../pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);

const { getDateRange } = dateUtils;

const resolveChecked = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    const target = (value as { target?: { checked?: boolean } }).target;
    if (typeof target?.checked === "boolean") return target.checked;
  }
  return false;
};

type PendingLogin = {
  login: string;
  loginKey: string;
  password: string;
  customer?: string | null;
  customers?: CustomerOption[];
  perevozkiInn?: string;
  twoFaMethod?: "google" | "telegram";
};

export function LoginScreen() {
  const { accounts, setAccounts, setActiveAccountId } = useAuth();
  const { setActiveTab } = useAppShell();

  const [authMethods, setAuthMethods] = useState<AuthMethodsConfig>({
    api_v1: true,
    api_v2: true,
    cms: true,
  });
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [agreeOffer, setAgreeOffer] = useState(true);
  const [agreePersonal, setAgreePersonal] = useState(true);
  const [loginOfferText, setLoginOfferText] = useState(PUBLIC_OFFER_TEXT);
  const [loginConsentText, setLoginConsentText] = useState(PERSONAL_DATA_CONSENT_TEXT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);
  const [showForgotPage, setShowForgotPage] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      return new URL(window.location.href).searchParams.get("forgot") === "1";
    } catch {
      return false;
    }
  });
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [isPersonalConsentOpen, setIsPersonalConsentOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAuthMethodsConfig().then((cfg) => {
      if (cancelled || !cfg) return;
      setAuthMethods(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void fetchLegalPublic()
      .then((pub) => {
        if (pub.offer?.body_text) setLoginOfferText(pub.offer.body_text);
        if (pub.consent?.body_text) setLoginConsentText(pub.consent.body_text);
      })
      .catch(() => {
        /* default texts */
      });
  }, []);

  const recordLoginLegalAcceptance = useCallback(
    (loginVal: string, passwordVal: string, opts?: { skipLegal?: boolean }) => {
      if (opts?.skipLegal) return;
      if (agreeOffer && agreePersonal) {
        recordLegalAcceptanceQuiet(loginVal, passwordVal);
      }
    },
    [agreeOffer, agreePersonal],
  );

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setTwoFactorError(null);
    if (!login || !password) return setError("Введите логин и пароль");
    if (!authMethods.cms) {
      if (!agreePersonal) return setError("Подтвердите согласие на обработку персональных данных");
      if (!agreeOffer) return setError("Подтвердите согласие с публичной офертой");
    }
    if (!authMethods.cms && !authMethods.api_v2 && !authMethods.api_v1) {
      setError("Недоступны способы авторизации");
      return;
    }

    try {
      setLoading(true);
      const loginKey = login.trim().toLowerCase();

      const attemptCmsAuth = async (): Promise<true | string> => {
        const { ok: regOk, data: regData } = await postAuthRegisteredLogin({ email: loginKey, password });
        if (!regOk) {
          return (typeof regData?.error === "string" ? regData.error : null) || "Неверный email или пароль";
        }
        if (regData?.ok && regData?.user) {
          const u = regData.user as Record<string, unknown>;
          const cmsPerms = normalizePermissions(u.permissions);
          const cmsServiceMode = cmsPerms?.service_mode === true;
          if (!cmsServiceMode) {
            if (!agreeOffer) return "Подтвердите согласие с публичной офертой";
            if (!agreePersonal) return "Подтвердите согласие на обработку персональных данных";
          }
          const existingAccount = accounts.find((acc) => acc.login === loginKey);
          const customers: CustomerOption[] = u.inn ? [{ name: (u.companyName as string) || (u.inn as string), inn: u.inn as string }] : [];
          const accessAllInns = !!u.accessAllInns;
          if (existingAccount) {
            setAccounts((prev) =>
              prev.map((acc) =>
                acc.id === existingAccount.id
                  ? {
                      ...acc,
                      password,
                      customers,
                      activeCustomerInn: acc.activeCustomerInn ?? (u.inn as string),
                      customer: u.companyName as string,
                      isRegisteredUser: true,
                      accessAllInns,
                      inCustomerDirectory: !!u.inCustomerDirectory,
                      ...(normalizePermissions(u.permissions) ? { permissions: normalizePermissions(u.permissions) } : {}),
                      financialAccess: u.financialAccess as boolean | undefined,
                    }
                  : acc,
              ),
            );
            setActiveAccountId(existingAccount.id);
          } else {
            const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newAccount: Account = {
              login: loginKey,
              password,
              id: accountId,
              customers,
              activeCustomerInn: u.inn as string,
              customer: u.companyName as string,
              isRegisteredUser: true,
              accessAllInns,
              inCustomerDirectory: !!u.inCustomerDirectory,
              ...(normalizePermissions(u.permissions) ? { permissions: normalizePermissions(u.permissions) } : {}),
              financialAccess: u.financialAccess as boolean | undefined,
            };
            setAccounts((prev) => [...prev, newAccount]);
            setActiveAccountId(accountId);
          }
          setActiveTab((prev) => prev || "cargo");
          recordLoginLegalAcceptance(loginKey, password, { skipLegal: cmsServiceMode });
          return true;
        }
        return "Неверный email или пароль";
      };

      const attemptApiV2Auth = async (): Promise<boolean> => {
        const { ok: customersOk, data: customersData } = await postGetCustomers(login, password);
        if (!customersOk) return false;
        const rawList = Array.isArray(customersData?.customers)
          ? customersData.customers
          : Array.isArray(customersData?.Customers)
            ? customersData.Customers
            : [];
        const customers: CustomerOption[] = dedupeCustomersByInn(
          rawList
            .map((c: Record<string, unknown>) => ({
              name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
              inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
            }))
            .filter((c: CustomerOption) => c.inn.length > 0),
        );
        if (customers.length === 0) return false;
        const existingInns = await getExistingInns(
          accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean),
        );
        const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
        if (alreadyAdded) {
          setError("Компания уже в списке");
          return true;
        }
        const twoFaJson = await fetchTwoFaSettings(loginKey);
        const twoFaSettings = twoFaJson?.settings;
        const twoFaEnabled = !!twoFaSettings?.enabled;
        const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
        const twoFaLinked = !!twoFaSettings?.telegramLinked;
        const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;
        if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
          await sendTelegramTwoFaCode(loginKey);
          setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "telegram" });
          setTwoFactorPending(true);
          setTwoFactorCode("");
          return true;
        }
        if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
          setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "google" });
          setTwoFactorPending(true);
          setTwoFactorCode("");
          return true;
        }
        const existingAccount = accounts.find((acc) => acc.login === login);
        const firstCustomer = customers[0];
        const firstInn = firstCustomer.inn;
        const firstName = firstCustomer.name;
        if (existingAccount) {
          setAccounts((prev) =>
            prev.map((acc) =>
              acc.id === existingAccount.id
                ? { ...acc, customers, activeCustomerInn: firstInn, customer: firstName }
                : acc,
            ),
          );
          setActiveAccountId(existingAccount.id);
        } else {
          const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newAccount: Account = { login, password, id: accountId, customers, activeCustomerInn: firstInn, customer: firstName };
          setAccounts((prev) => [...prev, newAccount]);
          setActiveAccountId(accountId);
        }
        setActiveTab((prev) => prev || "cargo");
        postCompaniesSave({ login: loginKey, customers })
          .then((data: unknown) => {
            const d = data as { saved?: number; warning?: string };
            if (d?.saved !== undefined && d.saved === 0 && d.warning) console.warn("companies-save:", d.warning);
          })
          .catch((err) => console.warn("companies-save error:", err));
        recordLoginLegalAcceptance(loginKey, password);
        return true;
      };

      const attemptApiV1Auth = async (): Promise<boolean> => {
        const { dateFrom, dateTo } = getDateRange("все");
        const res = await postPerevozkiList({ login, password, dateFrom, dateTo });
        await ensureOk(res, "Ошибка авторизации");
        const payload = await readJsonOrText(res);
        const detectedCustomer = extractCustomerFromPerevozki(payload);
        const detectedInn = extractInnFromPerevozki(payload);
        const existingInns = await getExistingInns(
          accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean),
        );
        if (detectedInn && existingInns.has(detectedInn)) {
          setError("Компания уже в списке");
          return true;
        }
        const twoFaJson = await fetchTwoFaSettings(loginKey);
        const twoFaSettings = twoFaJson?.settings;
        const twoFaEnabled = !!twoFaSettings?.enabled;
        const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
        const twoFaLinked = !!twoFaSettings?.telegramLinked;
        const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;
        if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
          await sendTelegramTwoFaCode(loginKey);
          setPendingLogin({
            login,
            password,
            customer: detectedCustomer,
            loginKey,
            perevozkiInn: detectedInn ?? undefined,
            twoFaMethod: "telegram",
          });
          setTwoFactorPending(true);
          setTwoFactorCode("");
          return true;
        }
        if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
          setPendingLogin({
            login,
            password,
            customer: detectedCustomer,
            loginKey,
            perevozkiInn: detectedInn ?? undefined,
            twoFaMethod: "google",
          });
          setTwoFactorPending(true);
          setTwoFactorCode("");
          return true;
        }
        const existingAccount = accounts.find((acc) => acc.login === login);
        let accountId: string;
        if (existingAccount) {
          accountId = existingAccount.id;
          if (detectedCustomer && existingAccount.customer !== detectedCustomer) {
            setAccounts((prev) =>
              prev.map((acc) => (acc.id === existingAccount.id ? { ...acc, customer: detectedCustomer } : acc)),
            );
          }
          setActiveAccountId(accountId);
        } else {
          accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newAccount: Account = {
            login,
            password,
            id: accountId,
            customer: detectedCustomer || undefined,
            ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
          };
          setAccounts((prev) => [...prev, newAccount]);
          setActiveAccountId(accountId);
        }
        const companyInn = detectedInn ?? "";
        const companyName = detectedCustomer || login.trim() || "Компания";
        postCompaniesSave({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }).catch(() => {});
        setActiveTab((prev) => prev || "cargo");
        recordLoginLegalAcceptance(loginKey, password);
        return true;
      };

      let lastError = "Неверный логин или пароль";
      if (authMethods.cms) {
        const cmsResult = await attemptCmsAuth();
        if (cmsResult === true) return;
        lastError = cmsResult;
      }
      if (authMethods.api_v2 && (await attemptApiV2Auth())) return;
      if (authMethods.api_v1 && (await attemptApiV1Auth())) return;
      setError(lastError);
    } catch (err: unknown) {
      const raw = (err as { message?: string })?.message || "Ошибка сети.";
      const message = extractErrorMessage(raw) || (typeof raw === "string" ? raw : "Ошибка сети.");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTwoFactorError(null);
    if (!pendingLogin?.loginKey || !twoFactorCode.trim()) {
      setTwoFactorError(
        pendingLogin?.twoFaMethod === "google" ? "Введите код из приложения." : "Введите код из Telegram.",
      );
      return;
    }
    try {
      setTwoFactorLoading(true);
      const isGoogle = pendingLogin.twoFaMethod === "google";
      await verifyTwoFactorCode(isGoogle ? "google" : "telegram", pendingLogin.loginKey, twoFactorCode);

      const detectedCustomer = pendingLogin.customer;
      const customers = pendingLogin.customers;
      const firstInn = customers?.length ? customers[0].inn : undefined;
      const existingAccount = accounts.find((acc) => acc.login === pendingLogin.login);
      let accountId: string;
      const firstCustomerName = customers?.length ? customers[0].name : undefined;
      if (existingAccount) {
        accountId = existingAccount.id;
        setAccounts((prev) =>
          prev.map((acc) =>
            acc.id === existingAccount.id
              ? {
                  ...acc,
                  ...(detectedCustomer && acc.customer !== detectedCustomer ? { customer: detectedCustomer } : {}),
                  ...(customers?.length
                    ? { customers, activeCustomerInn: firstInn, customer: firstCustomerName ?? acc.customer }
                    : {}),
                }
              : acc,
          ),
        );
        setActiveAccountId(accountId);
      } else {
        accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAccount: Account = {
          login: pendingLogin.login,
          password: pendingLogin.password,
          id: accountId,
          customer: firstCustomerName ?? detectedCustomer ?? undefined,
          ...(customers?.length ? { customers, activeCustomerInn: firstInn } : {}),
        };
        setAccounts((prev) => [...prev, newAccount]);
        setActiveAccountId(accountId);
      }
      const loginKeyToSave = pendingLogin.loginKey;
      const customersToSave = pendingLogin.customers;
      const loginDisplay = pendingLogin.login?.trim() || "";

      setActiveTab((prev) => prev || "cargo");
      setTwoFactorPending(false);
      setPendingLogin(null);
      setTwoFactorCode("");

      if (customersToSave?.length) {
        postCompaniesSave({ login: loginKeyToSave, customers: customersToSave })
          .then((data: unknown) => {
            const d = data as { saved?: number; warning?: string };
            if (d?.saved !== undefined && d.saved === 0 && d.warning) console.warn("companies-save:", d.warning);
          })
          .catch((err) => console.warn("companies-save error:", err));
      } else {
        const perevozkiInn = pendingLogin.perevozkiInn ?? "";
        postCompaniesSave({
          login: loginKeyToSave,
          customers: [{ name: (detectedCustomer ?? loginDisplay) || "Компания", inn: perevozkiInn }],
        }).catch(() => {});
      }
      recordLoginLegalAcceptance(loginKeyToSave, pendingLogin.password);
    } catch (err: unknown) {
      setTwoFactorError((err as { message?: string })?.message || "Неверный код");
    } finally {
      setTwoFactorLoading(false);
    }
  };

  if (showForgotPage) {
    return (
      <Suspense
        fallback={
          <div className="p-8 flex justify-center items-center min-h-[40vh]">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        }
      >
        <ForgotPasswordPage
          initialEmail={login}
          onBackToLogin={() => {
            setShowForgotPage(false);
            try {
              const u = new URL(window.location.href);
              u.searchParams.delete("forgot");
              window.history.replaceState(null, "", u.toString());
            } catch {
              // ignore
            }
          }}
        />
      </Suspense>
    );
  }

  return (
    <>
      <Container className="app-container login-form-wrapper">
        <Panel mode="secondary" className="login-card">
          <div className="login-brand">
            <HaulzBrandLogo />
            <Typography.Body className="tagline">Доставка грузов в Калининград и обратно</Typography.Body>
          </div>
          {twoFactorPending ? (
            <form onSubmit={handleTwoFactorSubmit} className="form">
              <Typography.Body style={{ marginBottom: "0.75rem", textAlign: "center", color: "var(--color-text-secondary)" }}>
                {pendingLogin?.twoFaMethod === "google"
                  ? "Введите 6-значный код из приложения"
                  : "Введите код из Telegram"}
              </Typography.Body>
              <div className="field">
                <Input
                  className="login-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder={pendingLogin?.twoFaMethod === "google" ? "000000" : "Код подтверждения"}
                  value={twoFactorCode}
                  onChange={(e) =>
                    setTwoFactorCode(
                      pendingLogin?.twoFaMethod === "google"
                        ? e.target.value.replace(/\D/g, "").slice(0, 6)
                        : e.target.value,
                    )
                  }
                />
              </div>
              <Button className="button-primary" type="submit" disabled={twoFactorLoading}>
                {twoFactorLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить код"}
              </Button>
              <Flex justify="center" style={{ marginTop: "0.75rem", gap: "0.5rem" }}>
                {pendingLogin?.twoFaMethod === "telegram" && (
                  <Button
                    type="button"
                    className="filter-button"
                    disabled={twoFactorLoading}
                    onClick={async () => {
                      if (!pendingLogin?.loginKey) return;
                      try {
                        setTwoFactorError(null);
                        setTwoFactorLoading(true);
                        await sendTelegramTwoFaCode(pendingLogin.loginKey);
                      } catch (err: unknown) {
                        setTwoFactorError((err as { message?: string })?.message || "Не удалось отправить код");
                      } finally {
                        setTwoFactorLoading(false);
                      }
                    }}
                  >
                    Отправить код еще раз
                  </Button>
                )}
                <Button
                  type="button"
                  className="filter-button"
                  disabled={twoFactorLoading}
                  onClick={() => {
                    setTwoFactorPending(false);
                    setPendingLogin(null);
                    setTwoFactorCode("");
                  }}
                >
                  Назад
                </Button>
              </Flex>
              {twoFactorError && (
                <Flex align="center" className="login-error mt-4">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  <Typography.Body>{twoFactorError}</Typography.Body>
                </Flex>
              )}
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} className="form">
              <div className="field">
                <Input
                  className="login-input"
                  type="text"
                  placeholder="Логин (email)"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="field">
                <div className="password-input-container">
                  <Input
                    className="login-input password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    style={{ paddingRight: "3rem" }}
                  />
                  <Button type="button" className="toggle-password-visibility" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </Button>
                </div>
              </div>
              <label className="checkbox-row switch-wrapper">
                <Typography.Body>
                  Согласие с{" "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsOfferOpen(true);
                    }}
                  >
                    публичной офертой
                  </a>
                </Typography.Body>
                <Switch
                  checked={agreeOffer}
                  onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))}
                  onChange={(event) => setAgreeOffer(resolveChecked(event))}
                />
              </label>
              <label className="checkbox-row switch-wrapper">
                <Typography.Body>
                  Согласие на{" "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsPersonalConsentOpen(true);
                    }}
                  >
                    обработку данных
                  </a>
                </Typography.Body>
                <Switch
                  checked={agreePersonal}
                  onCheckedChange={(value) => setAgreePersonal(resolveChecked(value))}
                  onChange={(event) => setAgreePersonal(resolveChecked(event))}
                />
              </label>
              <Button className="button-primary" type="submit" disabled={loading}>
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить"}
              </Button>
              <Flex justify="center" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  style={{
                    color: "var(--color-primary-blue)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "0.9rem",
                    background: "none",
                    border: "none",
                    padding: 0,
                  }}
                  onClick={() => {
                    setShowForgotPage(true);
                    try {
                      const u = new URL(window.location.href);
                      u.searchParams.set("forgot", "1");
                      window.history.pushState(null, "", u.toString());
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Забыли пароль?
                </button>
              </Flex>
            </form>
          )}
          {error && (
            <Flex align="center" className="login-error mt-4">
              <AlertTriangle className="w-5 h-5 mr-2" />
              <Typography.Body>{error}</Typography.Body>
            </Flex>
          )}
          <LegalModal isOpen={!!isOfferOpen} onClose={() => setIsOfferOpen(false)} title="Публичная оферта">
            {loginOfferText}
          </LegalModal>
          <LegalModal
            isOpen={!!isPersonalConsentOpen}
            onClose={() => setIsPersonalConsentOpen(false)}
            title="Согласие на обработку персональных данных"
          >
            {loginConsentText}
          </LegalModal>
        </Panel>
      </Container>
    </>
  );
}
