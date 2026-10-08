import { recommendPlanningCargo, type RecommendationRequest } from './planningRecommendations';

self.onmessage = (event: MessageEvent<RecommendationRequest>) => {
  try { self.postMessage({ result: recommendPlanningCargo(event.data) }); }
  catch { self.postMessage({ error: 'Не удалось подобрать перевозки. Повторите выбор режима.' }); }
};
