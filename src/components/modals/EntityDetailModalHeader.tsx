import React from "react";
import { FileText, Heart, Share2, X } from "lucide-react";

type EntityDetailModalHeaderProps = {
    badge: string;
    onClose: () => void;
    onShare?: () => void;
    isFavorite?: boolean;
    onToggleFavorite?: () => void;
    icon?: React.ReactNode;
};

export function EntityDetailModalHeader({
    badge,
    onClose,
    onShare,
    isFavorite,
    onToggleFavorite,
    icon,
}: EntityDetailModalHeaderProps) {
    return (
        <div className="modal-header">
            <div className="modal-header-main">
                {icon ?? (
                    <FileText
                        className="modal-header-transport-icon"
                        style={{ color: "var(--color-primary-blue)", width: 24, height: 24, flexShrink: 0 }}
                        aria-hidden
                    />
                )}
                <span className="role-badge modal-header-role-badge">{badge}</span>
            </div>
            <div className="modal-header-actions">
                {onShare ? (
                    <button type="button" className="modal-header-icon-btn" onClick={onShare} title="Поделиться">
                        <Share2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                    </button>
                ) : null}
                {onToggleFavorite ? (
                    <button
                        type="button"
                        className="modal-header-icon-btn"
                        onClick={onToggleFavorite}
                        title={isFavorite ? "Удалить из избранного" : "В избранное"}
                    >
                        <Heart
                            className="w-4 h-4"
                            style={{
                                fill: isFavorite ? "#ef4444" : "transparent",
                                color: isFavorite ? "#ef4444" : "var(--color-text-secondary)",
                            }}
                        />
                    </button>
                ) : null}
                <button type="button" className="modal-header-icon-btn" onClick={onClose} aria-label="Закрыть" title="Закрыть">
                    <X size={20} style={{ color: "var(--color-text-secondary)" }} />
                </button>
            </div>
        </div>
    );
}
