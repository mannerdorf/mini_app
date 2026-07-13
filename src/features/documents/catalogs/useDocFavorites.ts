import { useCallback, useState } from "react";

const STORAGE_KEY = "haulz.docFavorites";

type FavoritesMap = Record<string, (string | number)[]>;

function readFavorites(): FavoritesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as FavoritesMap;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function writeFavorites(map: FavoritesMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function shareDocumentLines(title: string, lines: string[]) {
  const text = lines.filter(Boolean).join("\n");
  if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share === "function") {
    void (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({ title, text }).catch(() => {});
  } else {
    try {
      void navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
  }
}

export function useDocFavorites() {
  const [favVersion, setFavVersion] = useState(0);

  const isDocFavorite = useCallback(
    (category: string, id: string | number) => {
      void favVersion;
      const map = readFavorites();
      const list = map[category] || [];
      return list.some((entry) => String(entry) === String(id));
    },
    [favVersion]
  );

  const toggleDocFavorite = useCallback((category: string, id: string | number) => {
    const map = readFavorites();
    const list = [...(map[category] || [])];
    const idx = list.findIndex((entry) => String(entry) === String(id));
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(id);
    }
    map[category] = list;
    writeFavorites(map);
    setFavVersion((v) => v + 1);
  }, []);

  return { isDocFavorite, toggleDocFavorite, favVersion };
}
