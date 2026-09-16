import React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@maxhub/max-ui";
import { useAppShell } from "../contexts/AppShellContext";

/** Переключатель светлой / тёмной темы (шапка ЛК и упрощённые оболочки). */
export function ThemeToggleButton() {
  const { theme, setTheme } = useAppShell();
  return (
    <Button
      className="search-toggle-button"
      onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
      title={theme === "light" ? "Включить тёмный режим" : "Включить светлый режим"}
      aria-label={theme === "light" ? "Включить тёмный режим" : "Включить светлый режим"}
    >
      {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </Button>
  );
}
