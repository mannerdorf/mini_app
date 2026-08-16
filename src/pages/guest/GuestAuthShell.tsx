import React, { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { LoginScreen } from "../../components/LoginScreen";
import { AboutCompanyPage } from "../AboutCompanyPage";
import { GuestFaqPage } from "./GuestFaqPage";
import { GuestHomePage } from "./GuestHomePage";
import { prepareGuestCalculatorNavigation } from "../../lib/profileViewPersist";

const ForgotPasswordPage = lazy(() =>
  import("../ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);

type GuestScreen = "home" | "login" | "about" | "faq" | "forgot" | "calculator";

export function GuestAuthShell() {
  const [screen, setScreen] = useState<GuestScreen>("home");
  const [loginHint, setLoginHint] = useState<string | null>(null);

  const openLogin = useCallback((hint?: string) => {
    setLoginHint(hint ?? null);
    setScreen("login");
  }, []);

  const openCalculator = useCallback(() => {
    prepareGuestCalculatorNavigation();
    setScreen("calculator");
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("guest-mode", "light-mode");
    return () => {
      root.classList.remove("guest-mode", "light-mode");
    };
  }, []);

  if (screen === "login") {
    return (
      <div className="guest-shell">
        <LoginScreen
          variant="sheet"
          hint={loginHint}
          onBack={() => {
            setLoginHint(null);
            setScreen("home");
          }}
          onOpenForgot={() => setScreen("forgot")}
        />
      </div>
    );
  }

  if (screen === "forgot") {
    return (
      <div className="guest-shell">
        <Suspense
          fallback={
            <div className="guest-login-screen">
              <Loader2 className="h-8 w-8 animate-spin guest-login-screen__loader" />
            </div>
          }
        >
          <div className="guest-login-screen">
            <ForgotPasswordPage onBackToLogin={() => setScreen("login")} />
          </div>
        </Suspense>
      </div>
    );
  }

  if (screen === "about") {
    return (
      <div className="guest-shell min-h-[100dvh] px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-guest">
          <AboutCompanyPage onBack={() => setScreen("home")} />
        </div>
      </div>
    );
  }

  if (screen === "faq") {
    return <GuestFaqPage onBack={() => setScreen("home")} />;
  }

  if (screen === "calculator") {
    return (
      <div className="guest-shell">
        <LoginScreen
          variant="sheet"
          heading="Калькулятор HAULZ"
          hint="Войдите, чтобы рассчитать стоимость перевозки"
          onBack={() => setScreen("home")}
          onOpenForgot={() => setScreen("forgot")}
        />
      </div>
    );
  }

  return (
    <GuestHomePage
      onLogin={() => openLogin()}
      onAbout={() => setScreen("about")}
      onFaq={() => setScreen("faq")}
      onCalculator={openCalculator}
    />
  );
}
