import React from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { useAdminPresetsEditor } from "../hooks/useAdminPresetsEditor";
import { AdminPresetFormPanel } from "../components/AdminPresetFormPanel";
import { AdminPresetListPanel } from "../components/AdminPresetListPanel";
import type { PermissionPreset } from "../lib/permissions";

type AdminPresetsTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  permissionPresets: PermissionPreset[];
  fetchPresets: () => void;
  presetsLoading: boolean;
};

export function AdminPresetsTab({
  adminToken,
  isSuperAdmin,
  permissionPresets,
  fetchPresets,
  presetsLoading,
}: AdminPresetsTabProps) {
  const editor = useAdminPresetsEditor({ adminToken, permissionPresets, fetchPresets });

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Пресеты ролей</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Настройте наборы прав для быстрой подстановки при выдаче прав пользователям и при групповом изменении.
      </Typography.Body>
      {presetsLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : (
        <>
          <AdminPresetFormPanel isSuperAdmin={isSuperAdmin} {...editor} />
          <AdminPresetListPanel permissionPresets={permissionPresets} {...editor} />
        </>
      )}
    </Panel>
  );
}
