import React from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";

type Props = {
  selectedCount: number;
  onSelectAllOnPage: () => void;
  onSelectAllByFilter: () => void;
  onClearSelection: () => void;
};

export function AdminUsersSelectionBar({ selectedCount, onSelectAllOnPage, onSelectAllByFilter, onClearSelection }: Props) {
  return (
    <Flex gap="0.5rem" align="center" style={{ flexWrap: "wrap", marginBottom: "0.25rem" }}>
      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Выбрать:</Typography.Body>
      <Button type="button" className="filter-button" onClick={onSelectAllOnPage} style={{ padding: "0.35rem 0.6rem" }}>Все на странице</Button>
      <Button type="button" className="filter-button" onClick={onSelectAllByFilter} style={{ padding: "0.35rem 0.6rem" }}>Все по фильтру</Button>
      <Button type="button" className="filter-button" onClick={onClearSelection} style={{ padding: "0.35rem 0.6rem" }}>Снять выделение</Button>
      {selectedCount > 0 && <Typography.Body style={{ fontSize: "0.85rem" }}>Выбрано: {selectedCount}</Typography.Body>}
    </Flex>
  );
}
