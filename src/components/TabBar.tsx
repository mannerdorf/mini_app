import React from "react";
import { Button, Flex } from "@maxhub/max-ui";
import { Home, Truck, FileText, User, LayoutGrid } from "lucide-react";
import type { Tab } from "../types";

export type TabBarPermissions = {
  cargo?: boolean;
  doc_invoices?: boolean;
  doc_acts?: boolean;
  doc_orders?: boolean;
  doc_claims?: boolean;
  doc_contracts?: boolean;
  doc_acts_settlement?: boolean;
  doc_tariffs?: boolean;
};

type TabBarProps = {
  active: Tab;
  onChange: (t: Tab) => void;
  onCargoPressStart?: () => void;
  onCargoPressEnd?: () => void;
  showAllTabs?: boolean;
  permissions?: TabBarPermissions | null;
};

const TabBtn = ({
  label,
  icon,
  active,
  onClick,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  onTouchStart,
  onTouchEnd,
}: {
  label?: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}) => (
  <Button
    type="button"
    className={`tab-button ${active ? "active" : ""}`}
    onClick={onClick}
    onMouseDown={onMouseDown}
    onMouseUp={onMouseUp}
    onMouseLeave={onMouseLeave}
    onTouchStart={onTouchStart}
    onTouchEnd={onTouchEnd}
    title={label || undefined}
    aria-label={label || undefined}
  >
    <Flex align="center" justify="center">
      <div className="tab-icon">{icon}</div>
    </Flex>
  </Button>
);

export function TabBar({
  active,
  onChange,
  onCargoPressStart,
  onCargoPressEnd,
  showAllTabs,
  permissions,
}: TabBarProps) {
  const showCargo = permissions ? permissions.cargo !== false : true;
  const hasDocAccess = permissions
    ? !!(permissions.doc_invoices || permissions.doc_acts || permissions.doc_orders || permissions.doc_claims || permissions.doc_contracts || permissions.doc_acts_settlement || permissions.doc_tariffs)
    : true;

  if (showAllTabs) {
    return (
      <div className="tabbar-container">
        <TabBtn label="Главная" icon={<Home />} active={active === "home" || active === "dashboard"} onClick={() => onChange("home")} />
        <TabBtn label="Домой 2" icon={<LayoutGrid />} active={active === "home2"} onClick={() => onChange("home2")} />
        {showCargo && <TabBtn label="Грузы" icon={<Truck />} active={active === "cargo"} onClick={() => onChange("cargo")} />}
        {hasDocAccess && <TabBtn label="Документы" icon={<FileText />} active={active === "docs"} onClick={() => onChange("docs")} />}
        <TabBtn label="Профиль" icon={<User />} active={active === "profile"} onClick={() => onChange("profile")} />
      </div>
    );
  }

  return (
    <div className="tabbar-container">
      <TabBtn label="Главная" icon={<Home />} active={active === "home" || active === "dashboard"} onClick={() => onChange("home")} />
      <TabBtn label="Домой 2" icon={<LayoutGrid />} active={active === "home2"} onClick={() => onChange("home2")} />
      {showCargo && (
        <TabBtn
          label="Грузы"
          icon={<Truck />}
          active={active === "cargo"}
          onClick={() => onChange("cargo")}
          onMouseDown={onCargoPressStart}
          onMouseUp={onCargoPressEnd}
          onMouseLeave={onCargoPressEnd}
          onTouchStart={onCargoPressStart}
          onTouchEnd={onCargoPressEnd}
        />
      )}
      <TabBtn label="Профиль" icon={<User />} active={active === "profile"} onClick={() => onChange("profile")} />
    </div>
  );
}

