import React from "react";
import { Button } from "@maxhub/max-ui";

type Props = {
  disabled: boolean;
  onOpen: () => void;
};

export function SverkiOrderActionButton({ disabled, onOpen }: Props) {
  return (
    <div className="documents-new-order-bar documents-new-order-bar--in-sticky">
      <Button className="button-primary doc-section-action-btn" disabled={disabled} onClick={onOpen}>
        Заказать Акт сверки
      </Button>
    </div>
  );
}
