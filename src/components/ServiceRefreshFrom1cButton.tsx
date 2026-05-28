import React, { useCallback, useState } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { Loader2, RefreshCw } from "lucide-react";
import { postServiceRefreshFrom1c, type ServiceRefreshKind } from "../lib/serviceRefreshFrom1c";
import type { AuthData } from "../types";

export type ServiceRefreshFrom1cButtonProps = {
  auth: AuthData | null;
  dateFrom: string;
  dateTo: string;
  kinds: ServiceRefreshKind[];
  onRefreshed?: () => void | Promise<void>;
  className?: string;
  compact?: boolean;
};

export function ServiceRefreshFrom1cButton({
  auth,
  dateFrom,
  dateTo,
  kinds,
  onRefreshed,
  className = "filter-button",
  compact = false,
}: ServiceRefreshFrom1cButtonProps) {
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (!auth?.login || !auth?.password || kinds.length === 0 || loading) return;
    setLoading(true);
    setHint(null);
    try {
      const res = await postServiceRefreshFrom1c({ auth, dateFrom, dateTo, kinds });
      const totalFetched = res.kinds.reduce((sum, k) => sum + (k.fetched || 0), 0);
      const errors = res.kinds.filter((k) => k.error).map((k) => `${k.kind}: ${k.error}`);
      if (errors.length > 0) {
        setHint(errors[0] ?? res.message ?? "Ошибка обновления");
      } else {
        setHint(`Из 1С: ${totalFetched} записей, кэш обновлён`);
      }
      await onRefreshed?.();
    } catch (e: any) {
      setHint(e?.message || "Не удалось обновить из 1С");
    } finally {
      setLoading(false);
      window.setTimeout(() => setHint(null), 5000);
    }
  }, [auth, dateFrom, dateTo, kinds, loading, onRefreshed]);

  if (!auth?.login || kinds.length === 0) return null;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
      <Button
        className={className}
        onClick={() => void handleClick()}
        disabled={loading}
        title="Загрузить период из 1С и обновить кэш"
        aria-label="Обновить из 1С"
        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", whiteSpace: "nowrap" }}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {!compact ? <span>Обновить из 1С</span> : null}
      </Button>
      {hint ? (
        <Typography.Body
          style={{
            fontSize: "0.72rem",
            color: hint.startsWith("Из 1С") ? "var(--color-success, #16a34a)" : "#ef4444",
            marginTop: "0.2rem",
            maxWidth: 220,
            textAlign: "right",
          }}
        >
          {hint}
        </Typography.Body>
      ) : null}
    </div>
  );
}
