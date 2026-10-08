import { comparePlanningRecommendations, type RecommendationContext } from './planningRecommendations';

self.onmessage = (event: MessageEvent<RecommendationContext>) => {
  try { self.postMessage({ results: comparePlanningRecommendations(event.data) }); }
  catch { self.postMessage({ error: 'Не удалось подобрать перевозки. Повторите выбор режима.' }); }
};
