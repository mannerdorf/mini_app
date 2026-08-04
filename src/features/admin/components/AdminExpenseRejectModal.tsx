import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { AdminExpenseModalSharedProps } from "../lib/adminExpenseModalShared";

export function AdminExpenseRejectModal(props: AdminExpenseModalSharedProps) {
  const {
    adminExpenseRequests,
    expenseRejectId,
    setExpenseRejectId,
    expenseRejectComment,
    setExpenseRejectComment,
    updateExpenseStatus,
  } = props;

  if (!expenseRejectId) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setExpenseRejectId(null)}>
      <div style={{ background: "var(--color-bg-card, #fff)", borderRadius: 12, padding: "1.25rem", maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>Отказать в заявке</Typography.Body>
        <textarea
          placeholder="Причина отказа (обязательно)"
          value={expenseRejectComment}
          onChange={(e) => setExpenseRejectComment(e.target.value)}
          className="admin-form-input"
          style={{ width: "100%", minHeight: 80, resize: "vertical", marginBottom: "0.75rem" }}
          rows={3}
          autoFocus
        />
        <Flex gap="0.5rem" justify="flex-end">
          <Button type="button" className="filter-button" onClick={() => setExpenseRejectId(null)}>Отмена</Button>
          <Button
            type="button"
            className="filter-button"
            style={{ background: "#ef4444", color: "white" }}
            disabled={!expenseRejectComment.trim()}
            onClick={() => {
              const item = adminExpenseRequests.find((r) => r.id === expenseRejectId);
              if (item) updateExpenseStatus(item.id, item.login, "rejected", expenseRejectComment.trim(), item);
              setExpenseRejectId(null);
            }}
          >
            Отказать
          </Button>
        </Flex>
      </div>
    </div>
  );
}
