import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../types";
import { AdminDeliveredWithoutAppSection } from "../features/admin/sections/AdminDeliveredWithoutAppSection";

type Props = {
  auth: AuthData;
  useServiceRequest: boolean;
  onBack: () => void;
};

export function HaulzDeliveredWithoutAppPage({ auth, useServiceRequest, onBack }: Props) {
  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button type="button" className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Без АПП</Typography.Headline>
      </Flex>
      <AdminDeliveredWithoutAppSection auth={auth} useServiceRequest={useServiceRequest} />
    </div>
  );
}
