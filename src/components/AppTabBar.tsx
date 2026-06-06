import React from "react";
import { TabBar } from "./TabBar";
import { useAuth } from "../contexts/AuthContext";
import { useAppShell } from "../contexts/AppShellContext";

type Props = {
  showDashboard: boolean;
};

export function AppTabBar({ showDashboard }: Props) {
  const { activeAccount } = useAuth();
  const { activeTab, setActiveTab, desktopExpanded, requestProfileRoot } = useAppShell();

  return (
    <TabBar
      active={activeTab}
      onChange={(tab) => {
        if (tab === "profile" && activeTab === "profile") {
          requestProfileRoot();
        }
        if (showDashboard) {
          if (tab === "home") {
            setActiveTab("dashboard");
          } else if (tab === "cargo") {
            setActiveTab("cargo");
          } else {
            setActiveTab(tab);
          }
        } else {
          if (tab === "home") setActiveTab("dashboard");
          else setActiveTab(tab);
        }
      }}
      showAllTabs
      permissions={activeAccount?.isRegisteredUser ? activeAccount.permissions ?? undefined : undefined}
      expanded={desktopExpanded}
    />
  );
}
