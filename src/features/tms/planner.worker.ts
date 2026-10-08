import { planLoad } from "./planner";
import type { TmsCargo, PlanOptions } from "./model";
self.onmessage = (
  event: MessageEvent<{ cargo: TmsCargo[]; options: PlanOptions }>,
) => {
  try {
    self.postMessage({
      plan: planLoad(event.data.cargo, event.data.options, (progress) =>
        self.postMessage({ progress }),
      ),
    });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error ? e.message : "Не удалось рассчитать план",
    });
  }
};
