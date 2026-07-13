import React from "react";
import { Button } from "@maxhub/max-ui";
import type { AuthData } from "../../../types";

type Props = {
  auth: AuthData;
  onOpen: () => void;
};

export function ClaimsCreateActionButton({ auth, onOpen }: Props) {
  return (
    <div className="documents-new-order-bar documents-new-order-bar--in-sticky">
      <Button
        className="button-primary doc-section-action-btn"
        onClick={onOpen}
        disabled={!auth?.login || !auth?.password}
      >
        + Создать претензию
      </Button>
    </div>
  );
}
