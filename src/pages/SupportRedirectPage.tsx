import React, { useEffect } from "react";
import { Typography } from "@maxhub/max-ui";

type SupportRedirectPageProps = {
  onOpenSupport: () => void;
};

export function SupportRedirectPage({ onOpenSupport }: SupportRedirectPageProps) {
  const didRunRef = React.useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;
  }, [onOpenSupport]);

  const message =
    "Поддержка временно доступна только внутри мини‑приложения.";

  return (
    <div className="w-full p-8 text-center">
      <Typography.Headline>Поддержка</Typography.Headline>
      <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
        {message}
      </Typography.Body>
    </div>
  );
}
