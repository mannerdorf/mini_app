import React, { useState, FormEvent } from "react";
import { Button, Input, Flex, Typography } from "@maxhub/max-ui";
import { Search, Home } from "lucide-react";

type NotFoundPageProps = {
  /** При нажатии «На главную» */
  onGoHome?: () => void;
  /** При отправке поиска (текст запроса) — опционально, можно перейти на поиск в приложении */
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
      style={{
        minHeight: "100vh",
        padding: "2rem 1.5rem",
        boxSizing: "border-box",
        background: "var(--color-bg-page, #fff)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "2rem",
          alignItems: "center",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Typography.Headline
            style={{
              fontSize: "3.5rem",
              fontWeight: 700,
              color: "var(--color-text-primary, #1f2937)",
              marginBottom: "0.25rem",
              lineHeight: 1.1,
            }}
          >
            404
          </Typography.Headline>
          <Typography.Body
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "var(--color-text-primary, #1f2937)",
              marginBottom: "0.75rem",
            }}
          >
            Ошибка!
          </Typography.Body>
          <Typography.Body
            style={{
              fontSize: "1rem",
              color: "var(--color-text-secondary, #6b7280)",
              marginBottom: "1.5rem",
              lineHeight: 1.5,
            }}
          >
            К сожалению, запрашиваемая Вами страница не найдена.
          </Typography.Body>
          <Typography.Body
            style={{
              fontSize: "0.95rem",
              color: "var(--color-text-secondary, #6b7280)",
              marginBottom: "0.5rem",
            }}
          >
            Попробуйте воспользоваться поиском:
          </Typography.Body>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", maxWidth: 320 }}>
            <Input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-form-input"
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                border: "1px solid var(--color-border, #e5e7eb)",
                background: "var(--color-bg-input, #f9fafb)",
              }}
            />
            <Button
              type="submit"
              className="filter-button"
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                border: "1px solid var(--color-border, #e5e7eb)",
                background: "var(--color-bg-input, #f9fafb)",
              }}
              aria-label="Искать"
            >
              <Search size={20} />
            </Button>
          </form>
          {onGoHome && (
            <Button
              type="button"
              className="button-primary"
              onClick={onGoHome}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Home size={18} />
              На главную
            </Button>
          )}
        </div>
        <div
          style={{
            width: 160,
            height: 160,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-hidden
        >
          <svg
            width="140"
            height="140"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ opacity: 0.9 }}
          >
            <circle cx="60" cy="65" r="38" stroke="var(--color-border, #e5e7eb)" strokeWidth="2" fill="var(--color-bg-hover, #f3f4f6)" />
            <ellipse cx="60" cy="58" rx="18" ry="14" fill="var(--color-text-secondary, #9ca3af)" opacity="0.6" />
            <circle cx="55" cy="55" r="2.5" fill="var(--color-text-primary, #374151)" />
            <circle cx="65" cy="55" r="2.5" fill="var(--color-text-primary, #374151)" />
            <path d="M 45 68 Q 60 78 75 68" stroke="var(--color-text-secondary, #6b7280)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M 30 95 Q 60 75 90 95" stroke="var(--color-border, #d1d5db)" strokeWidth="2" fill="none" />
            <line x1="52" y1="42" x2="45" y2="28" stroke="var(--color-text-secondary, #9ca3af)" strokeWidth="2" strokeLinecap="round" />
            <line x1="68" y1="42" x2="75" y2="28" stroke="var(--color-text-secondary, #9ca3af)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
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
