import { useEffect, useState } from "react";
import type { Account } from "../../../types";
import { fetchLegalStatus, type LegalStatusResponse } from "../../../api/client/legal";

export type UseProfileMainParams = {
    activeAccount: Account | null;
    fetchEnabled: boolean;
};

export function useProfileMain({ activeAccount, fetchEnabled }: UseProfileMainParams) {
    const [legalStatus, setLegalStatus] = useState<LegalStatusResponse | null>(null);

    useEffect(() => {
        if (!fetchEnabled || !activeAccount?.login || !activeAccount.password) {
            return;
        }
        void fetchLegalStatus(activeAccount.login, activeAccount.password)
            .then(setLegalStatus)
            .catch(() => setLegalStatus(null));
    }, [fetchEnabled, activeAccount?.login, activeAccount?.password]);

    return { legalStatus };
}

export type ProfileMainState = ReturnType<typeof useProfileMain>;
