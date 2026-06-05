import { useEffect, useState } from "react";

const MOBILE_MQ = "(max-width: 768px)";

/** Мобильная вёрстка калькулятора — отдельные экраны и переходы. */
export function useHaulzCalcMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_MQ).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return mobile;
}
