import { useEffect, useState } from "react";

export const MOBILE_LAYOUT_MQ = "(max-width: 768px)";

/** true на телефонах и узких экранах (≤768px). */
export function useMobileLayout(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_LAYOUT_MQ).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}
