import React, { useState, useEffect } from "react";
import { Button, Input, Typography } from "@maxhub/max-ui";
import { X } from "lucide-react";

export function CustomPeriodModal({
    isOpen,
    onClose,
    dateFrom,
    dateTo,
    onApply,
}: {
    isOpen: boolean;
    onClose: () => void;
    dateFrom: string;
    dateTo: string;
    onApply: (from: string, to: string) => void;
}) {
    const [localFrom, setLocalFrom] = useState<string>(dateFrom);
    const [localTo, setLocalTo] = useState<string>(dateTo);

    useEffect(() => {
        setLocalFrom(dateFrom);
        setLocalTo(dateTo);
    }, [dateFrom, dateTo]);

    if (!isOpen) return null;

    const handleApply = () => {
        if (!localFrom || !localTo) return;
        onApply(localFrom, localTo);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <Typography.Headline>Произвольный период</Typography.Headline>
                    <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть">
                        <X size={20} />
                    </Button>
                </div>
                <div className="modal-body">
                    <label className="modal-label">
                        Дата с
                        <Input type="date" className="modal-input" value={localFrom} onChange={(e) => setLocalFrom(e.target.value)} />
                    </label>
                    <label className="modal-label">
                        Дата по
                        <Input type="date" className="modal-input" value={localTo} onChange={(e) => setLocalTo(e.target.value)} />
                    </label>
                </div>
                <div className="modal-footer">
                    <Button className="primary-button" onClick={handleApply}>
                        Применить
                    </Button>
                </div>
            </div>
        </div>
    );
}
