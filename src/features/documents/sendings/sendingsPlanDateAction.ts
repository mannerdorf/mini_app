import { postSendingsPlanDate } from "../../../api/client/documents";

type PlanDateActionSetters = {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setInfo: (info: string | null) => void;
  onClose?: () => void;
};

export async function applySendingsPlanDateForCargo(
  dateValue: string,
  cargoNumbers: string[],
  { setLoading, setError, setInfo, onClose }: PlanDateActionSetters,
): Promise<void> {
  if (!dateValue) {
    setError("Укажите плановую дату прибытия на терминал.");
    return;
  }
  if (cargoNumbers.length === 0) {
    setError("Не найдены номера перевозок.");
    return;
  }
  setLoading(true);
  setError(null);
  setInfo(null);
  try {
    const data = await postSendingsPlanDate(dateValue, cargoNumbers);
    const updated = Number(data?.updated ?? 0);
    const requested = Number(data?.requested ?? cargoNumbers.length);
    const failed = Number(data?.failed ?? Math.max(0, requested - updated));
    const firstError =
      Array.isArray(data?.errors) && data.errors.length > 0
        ? String(data.errors[0]?.error || "").trim()
        : "";
    if (failed > 0) {
      setError(
        `Плановая дата прибытия на терминал записана частично: ${updated} из ${requested}.${firstError ? ` Причина: ${firstError}` : ""}`,
      );
    } else {
      setInfo(`Плановая дата прибытия на терминал ${dateValue} записана для ${updated} перевозок.`);
    }
    onClose?.();
  } catch (e: unknown) {
    setError(String((e as Error)?.message || "Не удалось записать плановую дату прибытия на терминал."));
  } finally {
    setLoading(false);
  }
}
