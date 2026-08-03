import { useCallback, useRef, useState } from "react";
import { deleteAdminPreset, saveAdminPreset } from "../../../api/client/admin/presets";
import {
  createDefaultPermissions,
  normalizeAnalyticsDashboardPermissions,
  type PermissionPreset,
} from "../lib/permissions";

const DEFAULT_PRESET_PERMISSIONS = normalizeAnalyticsDashboardPermissions({
  cms_access: false,
  home: true,
  dashboard: true,
  cargo: true,
  doc_invoices: true,
  doc_acts: true,
  doc_orders: true,
  doc_sendings: false,
  doc_claims: true,
  doc_contracts: true,
  doc_acts_settlement: true,
  doc_tariffs: true,
  haulz: false,
  service_mode: false,
  analytics: false,
  supervisor: false,
  eor: false,
  wb: false,
  wb_admin: false,
});

type Params = {
  adminToken: string;
  permissionPresets: PermissionPreset[];
  fetchPresets: () => void;
};

export function useAdminPresetsEditor({ adminToken, permissionPresets, fetchPresets }: Params) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>(() => createDefaultPermissions());
  const [formFinancial, setFormFinancial] = useState(false);
  const [formServiceMode, setFormServiceMode] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormLabel("");
    setFormPermissions(DEFAULT_PRESET_PERMISSIONS);
    setFormFinancial(false);
    setFormServiceMode(false);
    setFormError(null);
  }, []);

  const beginEdit = useCallback((preset: PermissionPreset) => {
    setEditingId(preset.id);
    setFormLabel(preset.label);
    setFormPermissions(normalizeAnalyticsDashboardPermissions({ ...preset.permissions }));
    setFormFinancial(preset.financial);
    setFormServiceMode(preset.serviceMode);
    setFormError(null);
  }, []);

  const savePreset = useCallback(async () => {
    setFormError(null);
    setFormSaving(true);
    try {
      await saveAdminPreset(adminToken, {
        ...(editingId ? { id: editingId } : {}),
        label: formLabel.trim(),
        permissions: normalizeAnalyticsDashboardPermissions(formPermissions),
        financial: formFinancial,
        serviceMode: formServiceMode,
      });
      resetForm();
      fetchPresets();
    } catch (e: unknown) {
      setFormError((e as Error)?.message || "Ошибка");
    } finally {
      setFormSaving(false);
    }
  }, [adminToken, editingId, fetchPresets, formFinancial, formLabel, formPermissions, formServiceMode, resetForm]);

  const confirmDeletePreset = useCallback(async () => {
    if (!deleteConfirmId || deleteLoading) return;
    setFormError(null);
    setDeleteLoading(true);
    const idToDelete = deleteConfirmId;
    try {
      await deleteAdminPreset(adminToken, idToDelete);
      setDeleteConfirmId(null);
      fetchPresets();
    } catch (e: unknown) {
      setFormError((e as Error)?.message || "Не удалось удалить пресет");
    } finally {
      setDeleteLoading(false);
    }
  }, [adminToken, deleteConfirmId, deleteLoading, fetchPresets]);

  const deletePresetLabel = deleteConfirmId
    ? permissionPresets.find((x) => x.id === deleteConfirmId)?.label ?? deleteConfirmId
    : "";

  return {
    editingId,
    formLabel,
    setFormLabel,
    formPermissions,
    setFormPermissions,
    formFinancial,
    setFormFinancial,
    formServiceMode,
    setFormServiceMode,
    formError,
    formSaving,
    deleteConfirmId,
    setDeleteConfirmId,
    deleteLoading,
    deleteModalRef,
    resetForm,
    beginEdit,
    savePreset,
    confirmDeletePreset,
    deletePresetLabel,
  };
}

export type AdminPresetsEditorState = ReturnType<typeof useAdminPresetsEditor>;
