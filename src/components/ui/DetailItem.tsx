import React from "react";
import { Flex, Typography } from "@maxhub/max-ui";

type DetailItemProps = {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  statusClass?: string;
  highlighted?: boolean;
  textColor?: string;
  /** Без серой плитки — как мета-поля в модалках документов */
  plain?: boolean;
  /** Компактная плитка для мобильной сетки модалки груза */
  compact?: boolean;
};

export function DetailItem({ label, value, icon, statusClass, highlighted, textColor, plain, compact }: DetailItemProps) {
  const rootClass = plain
    ? "detail-field-plain"
    : `details-item-modal${highlighted ? " highlighted-detail" : ""}${compact ? " details-item-modal--compact" : ""}`;
  return (
    <div className={rootClass}>
      <Typography.Label className="detail-item-label">{label}</Typography.Label>
      <Flex align="center" className={`detail-item-value ${statusClass || ""}`}>
        {icon}
        <Typography.Body style={textColor ? { color: textColor } : {}}>{value}</Typography.Body>
      </Flex>
    </div>
  );
}
