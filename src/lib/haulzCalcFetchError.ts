const GATEWAY_ERROR_RE = /\bHTTP\s+(502|503|504)\b/i;

export function formatHaulzGatewayStatus(status: number): string | null {
  if (status === 502) {
    return "Сервис подсказок временно недоступен. Подождите и попробуйте снова или введите наименование вручную.";
  }
  if (status === 503) {
    return "Сервис временно недоступен. Попробуйте через минуту или введите наименование вручную.";
  }
  if (status === 504) {
    return "Сервер долго не отвечает. Попробуйте ещё раз или введите наименование вручную.";
  }
  return null;
}

export function formatHaulzCalcFetchError(e: unknown, fallback: string): string {
  const msg = (e as Error)?.message || "";
  if (/failed to fetch/i.test(msg)) {
    return "Не удалось связаться с сервером. Обновите страницу или попробуйте позже.";
  }
  const gatewayMatch = msg.match(GATEWAY_ERROR_RE);
  if (gatewayMatch) {
    return formatHaulzGatewayStatus(Number(gatewayMatch[1])) || fallback;
  }
  return msg || fallback;
}
