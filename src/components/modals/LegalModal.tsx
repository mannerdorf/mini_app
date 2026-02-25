import React from "react";
import { Button, Typography } from "@maxhub/max-ui";
import { X } from "lucide-react";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
};

/** Модальное окно для длинных текстов (оферта, согласие на ПД и т.п.). */
export function LegalModal({ isOpen, onClose, title, children }: Props) {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <Typography.Headline style={{ fontSize: "1.1rem" }}>{title}</Typography.Headline>
                    <Button
                        className="modal-close-button"
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        <X size={20} />
                    </Button>
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.45 }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
