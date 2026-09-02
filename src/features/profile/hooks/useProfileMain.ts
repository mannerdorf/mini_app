import { useEffect, useState, useCallback } from "react";
import type { Account } from "../../../types";
import { fetchLegalStatus, type LegalStatusResponse } from "../../../api/client/legal";

export type UseProfileMainParams = {
    activeAccount: Account | null;
    fetchEnabled: boolean;
};

export function useProfileMain({ activeAccount, fetchEnabled }: UseProfileMainParams) {
    const [legalStatus, setLegalStatus] = useState<LegalStatusResponse | null>(null);

    const reloadLegalStatus = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount.password) {
            setLegalStatus(null);
            return;
        }
        try {
            setLegalStatus(await fetchLegalStatus(activeAccount.login, activeAccount.password));
        } catch {
            setLegalStatus(null);
        }
    }, [activeAccount?.login, activeAccount?.password]);

    useEffect(() => {
        if (!fetchEnabled) return;
        void reloadLegalStatus();
    }, [fetchEnabled, reloadLegalStatus]);

    return { legalStatus, reloadLegalStatus };
}

export type ProfileMainState = ReturnType<typeof useProfileMain>;
