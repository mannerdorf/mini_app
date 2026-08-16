import React, { useCallback, useLayoutEffect, useState } from "react";
import { LoginScreen } from "../../components/LoginScreen";
import { AboutCompanyPage } from "../AboutCompanyPage";
import { ForgotPasswordPage } from "../ForgotPasswordPage";
import { GuestAppDownloadPage } from "./GuestAppDownloadPage";
import { GuestCalculatorPage } from "./GuestCalculatorPage";
import { GuestFaqPage } from "./GuestFaqPage";
import { GuestHomePage } from "./GuestHomePage";
import { GuestWarehousesPage } from "./GuestWarehousesPage";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";

type GuestScreen = "home" | "login" | "about" | "warehouses" | "faq" | "forgot" | "app" | "calculator";

export function GuestAuthShell() {
  const [screen, setScreen] = useState<GuestScreen>("home");
  const [loginHint, setLoginHint] = useState<string | null>(null);

  const openLogin = useCallback((hint?: string) => {
    setLoginHint(hint ?? null);
    setScreen("login");
  }, []);

  const openCalculator = useCallback(() => {
    setScreen("calculator");
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("guest-mode", "light-mode");
    root.classList.remove("dark-mode");
    body.classList.add("guest-mode", "light-mode");
    body.classList.remove("dark-mode");
    return () => {
      root.classList.remove("guest-mode", "light-mode");
      body.classList.remove("guest-mode", "light-mode");
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
        <div className="guest-login-screen">
          <ForgotPasswordPage onBackToLogin={() => setScreen("login")} />
        </div>
      </div>
    );
  }

  if (screen === "about") {
    return (
      <AboutCompanyPage
        onBack={() => setScreen("home")}
        emailLabel={GUEST_CONTACT_EMAIL_LABEL}
        showWarehouses={false}
      />
    );
  }

  if (screen === "warehouses") {
    return <GuestWarehousesPage onBack={() => setScreen("home")} />;
  }

  if (screen === "faq") {
    return <GuestFaqPage onBack={() => setScreen("home")} />;
  }

  if (screen === "app") {
    return <GuestAppDownloadPage onBack={() => setScreen("home")} />;
  }

  if (screen === "calculator") {
    return (
      <GuestCalculatorPage
        onBack={() => setScreen("home")}
        onLogin={() => openLogin("Войдите, чтобы оформить заявку или сохранить черновик")}
      />
    );
  }

  return (
    <GuestHomePage
      onLogin={() => openLogin()}
      onAbout={() => setScreen("about")}
      onWarehouses={() => setScreen("warehouses")}
      onFaq={() => setScreen("faq")}
      onApp={() => setScreen("app")}
      onCalculator={openCalculator}
    />
  );
}
