import React, { useState, FormEvent } from "react";
import { Input, Typography } from "@maxhub/max-ui";
import { Search } from "lucide-react";

type NotFoundPageProps = {
  /** При нажатии «На главную» */
  onGoHome?: () => void;
  /** При отправке поиска (текст запроса) — опционально */
  onSearch?: (query: string) => void;
};

const isValidPath = (path: string): boolean => {
  const p = (path || "/").replace(/\/$/, "") || "/";
  return p === "/" || p === "" || p === "/index.html" || /^\/(admin|cms)$/i.test(p);
};

export function NotFoundPage({ onGoHome, onSearch }: NotFoundPageProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q && onSearch) onSearch(q);
    else if (onGoHome) onGoHome();
  };

  return (
    <div
      className="not-found-page"
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem 4rem",
        boxSizing: "border-box",
        background: "var(--color-bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%" }}>
        <Typography.Headline
          style={{
            fontSize: "clamp(1.5rem, 4.5vw, 2rem)",
            fontWeight: 600,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            color: "var(--color-text-primary)",
            marginBottom: "2rem",
          }}
        >
          Страницу, которую вы ищете, не удалось найти.
        </Typography.Headline>

        <form
          onSubmit={handleSearchSubmit}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 360,
            margin: "0 auto 1.25rem",
          }}
        >
          <Search
            size={20}
            style={{
              position: "absolute",
              left: "1rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-secondary)",
              pointerEvents: "none",
            }}
          />
          <Input
            type="text"
            placeholder="Поиск по HAULZ"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="not-found-search-input"
            style={{
              width: "100%",
              padding: "0.75rem 1rem 0.75rem 2.75rem",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              fontSize: "1rem",
            }}
            aria-label="Поиск"
          />
        </form>

        {onGoHome && (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onGoHome();
            }}
            className="not-found-home-link"
            style={{
              fontSize: "1rem",
              color: "var(--color-primary-blue)",
              textDecoration: "none",
              fontWeight: 400,
            }}
          >
            Или перейдите на главную ›
          </a>
        )}
      </div>
    </div>
  );
}

/** Проверка: показывать ли 404 по текущему pathname (SPA: неизвестный путь). */
export function shouldShowNotFound(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname || "/";
  return !isValidPath(path);
}
