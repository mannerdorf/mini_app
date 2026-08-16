import React, { Suspense, lazy, useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { LoginScreen } from "../../components/LoginScreen";
import { AboutCompanyPage } from "../AboutCompanyPage";
import { GuestFaqPage } from "./GuestFaqPage";
import { GuestHomePage } from "./GuestHomePage";

const ForgotPasswordPage = lazy(() =>
  import("../ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })),
);

type GuestScreen = "home" | "login" | "about" | "faq" | "forgot";

export function GuestAuthShell() {
  const [screen, setScreen] = useState<GuestScreen>("home");
  const [loginHint, setLoginHint] = useState<string | null>(null);

  const openLogin = useCallback((hint?: string) => {
    setLoginHint(hint ?? null);
    setScreen("login");
  }, []);

  const openCalculator = useCallback(() => {
    openLogin("После входа откройте калькулятор в профиле → HAULZ.");
  }, [openLogin]);

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

  return (
    <GuestHomePage
      onLogin={() => openLogin()}
      onAbout={() => setScreen("about")}
      onFaq={() => setScreen("faq")}
      onCalculator={openCalculator}
    />
  );
}
