import { useCallback, useEffect, useState } from "react";
import {
  deleteAdminFerry,
  enrichAdminFerriesMarinesia,
  fetchAdminFerries,
  saveAdminFerry,
  type AdminFerryRow,
} from "../../../api/client/admin/directories";

type Params = {
  adminToken: string;
};

export function useAdminFerries({ adminToken }: Params) {
  const [ferriesList, setFerriesList] = useState<AdminFerryRow[]>([]);
  const [ferriesLoading, setFerriesLoading] = useState(false);
  const [ferriesFetchTrigger, setFerriesFetchTrigger] = useState(0);
  const [ferriesEnrichLoading, setFerriesEnrichLoading] = useState(false);
  const [ferriesEnrichMessage, setFerriesEnrichMessage] = useState<string | null>(null);
  const [ferryEditMmsi, setFerryEditMmsi] = useState<Record<number, string>>({});
  const [ferrySaveLoading, setFerrySaveLoading] = useState<number | null>(null);
  const [ferryDeleteLoading, setFerryDeleteLoading] = useState<number | null>(null);
  const [ferryAddModalOpen, setFerryAddModalOpen] = useState(false);
  const [ferryAddName, setFerryAddName] = useState("");
  const [ferryAddMmsi, setFerryAddMmsi] = useState("");
  const [ferryAddLoading, setFerryAddLoading] = useState(false);
  const [ferryAddError, setFerryAddError] = useState<string | null>(null);

  const refreshList = useCallback(() => {
    setFerriesFetchTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    setFerriesLoading(true);
    fetchAdminFerries(adminToken)
      .then(setFerriesList)
      .catch(() => setFerriesList([]))
      .finally(() => setFerriesLoading(false));
  }, [adminToken, ferriesFetchTrigger]);

  const openAddModal = useCallback(() => {
    setFerryAddModalOpen(true);
    setFerryAddName("");
    setFerryAddMmsi("");
    setFerryAddError(null);
  }, []);

  const closeAddModal = useCallback(() => {
    if (ferryAddLoading) return;
    setFerryAddModalOpen(false);
  }, [ferryAddLoading]);

  const enrichFromMarinesia = useCallback(async () => {
    setFerriesEnrichLoading(true);
    setFerriesEnrichMessage(null);
    try {
      const data = await enrichAdminFerriesMarinesia(adminToken);
      setFerriesEnrichMessage(`Обновлено: ${data.updated} из ${data.total} паромов`);
      refreshList();
    } catch (e) {
      setFerriesEnrichMessage((e as Error)?.message || "Ошибка обогащения");
    } finally {
      setFerriesEnrichLoading(false);
    }
  }, [adminToken, refreshList]);

  const saveMmsi = useCallback(async (ferry: AdminFerryRow, mmsi: string) => {
    setFerrySaveLoading(ferry.id);
    try {
      await saveAdminFerry(adminToken, { id: ferry.id, name: ferry.name, mmsi });
      setFerryEditMmsi((prev) => {
        const next = { ...prev };
        delete next[ferry.id];
        return next;
      });
      refreshList();
    } catch (e) {
      setFerriesEnrichMessage((e as Error)?.message || "Ошибка сохранения");
    } finally {
      setFerrySaveLoading(null);
    }
  }, [adminToken, refreshList]);

  const deleteFerry = useCallback(async (ferry: AdminFerryRow) => {
    if (!window.confirm(`Удалить паром «${ferry.name}» (${ferry.mmsi})?`)) return;
    setFerryDeleteLoading(ferry.id);
    try {
      await deleteAdminFerry(adminToken, ferry.id);
      setFerryEditMmsi((prev) => {
        const next = { ...prev };
        delete next[ferry.id];
        return next;
      });
      refreshList();
    } catch (err) {
      setFerriesEnrichMessage((err as Error)?.message || "Ошибка удаления");
    } finally {
      setFerryDeleteLoading(null);
    }
  }, [adminToken, refreshList]);

  const submitAddFerry = useCallback(async () => {
    const name = ferryAddName.trim();
    const mmsi = ferryAddMmsi.replace(/\D/g, "");
    if (!name || mmsi.length !== 9) return;
    setFerryAddLoading(true);
    setFerryAddError(null);
    try {
      await saveAdminFerry(adminToken, { name, mmsi });
      setFerryAddModalOpen(false);
      refreshList();
    } catch (e) {
      setFerryAddError((e as Error)?.message || "Ошибка");
    } finally {
      setFerryAddLoading(false);
    }
  }, [adminToken, ferryAddName, ferryAddMmsi, refreshList]);

  return {
    ferriesList,
    ferriesLoading,
    ferriesEnrichLoading,
    ferriesEnrichMessage,
    ferryEditMmsi,
    setFerryEditMmsi,
    ferrySaveLoading,
    ferryDeleteLoading,
    ferryAddModalOpen,
    ferryAddName,
    setFerryAddName,
    ferryAddMmsi,
    setFerryAddMmsi,
    ferryAddLoading,
    ferryAddError,
    refreshList,
    openAddModal,
    closeAddModal,
    enrichFromMarinesia,
    saveMmsi,
    deleteFerry,
    submitAddFerry,
  };
}

export type AdminFerriesState = ReturnType<typeof useAdminFerries>;
