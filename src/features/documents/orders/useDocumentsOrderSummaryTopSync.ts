import type { RefObject } from "react";
import { useHaulzCalcSummaryLayoutSync } from "../../haulzCalculator/useHaulzCalcSummaryLayoutSync";

/** Синхронизация «Ваш расчёт» с формой заявки: верх = маршрут, низ не ниже «Может пригодиться». */
export function useDocumentsOrderSummaryTopSync(
  formRef: RefObject<HTMLElement | null>,
  anchorRef: RefObject<HTMLElement | null>,
  mainRef: RefObject<HTMLElement | null>,
): void {
  useHaulzCalcSummaryLayoutSync(formRef, anchorRef, mainRef, { clampBottomToMain: true });
}
