import React, { useRef } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { useFocusTrap } from "../../../hooks/useFocusTrap";
import { patchAdminUser } from "../../../api/client/admin/users";
import type { User } from "../types/adminUsers";

type Props = {
  user: User;
  adminToken: string;
  onError: (msg: string | null) => void;
  onClose: () => void;
  onDeactivated: (userId: number) => void;
};

export function AdminUserDeactivateModal({ user, adminToken, onError, onClose, onDeactivated }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true, onClose);

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="deactivate-user-title">
      <div ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <Panel className="cargo-card" style={{ maxWidth: "24rem", margin: "2rem auto", padding: "var(--pad-card, 1rem)" }}>
          <Typography.Body id="deactivate-user-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Деактивировать пользователя?</Typography.Body>
          <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
            {user.login} не сможет войти в приложение.
          </Typography.Body>
          <Flex gap="0.5rem">
            <Button
              type="button"
              className="filter-button"
              style={{ background: "var(--color-error, #dc2626)", color: "white" }}
              aria-label="Деактивировать пользователя"
              onClick={async () => {
                try {
                  await patchAdminUser(adminToken, user.id, { active: false });
                  onDeactivated(user.id);
                } catch (e: unknown) {
                  onError((e as Error)?.message || "Ошибка обновления");
                }
                onClose();
              }}
            >
              Деактивировать
            </Button>
            <Button type="button" className="filter-button" onClick={onClose} aria-label="Отмена">
              Отмена
            </Button>
          </Flex>
        </Panel>
      </div>
    </div>
  );
}
