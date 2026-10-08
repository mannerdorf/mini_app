import { planLoad } from "./planner";
import type { TmsCargo, PlanOptions } from "./model";
self.onmessage = (
  event: MessageEvent<{ cargo: TmsCargo[]; options: PlanOptions }>,
) => {
  try {
    const started = performance.now();
    const plan = planLoad(event.data.cargo, event.data.options, (progress) =>
      self.postMessage({ progress }),
    );
    self.postMessage({
      plan: { ...plan, calculationMs: Math.round(performance.now() - started) },
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "Не удалось рассчитать план",
    });
  }
};
