import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Account } from "../types";

function readPreference(key: string): boolean {
    try {
        return !!key && window.localStorage.getItem(key) === "1";
    } catch {
        return false;
    }
}

export function usePersistedServiceMode(account: Account | null): [boolean, Dispatch<SetStateAction<boolean>>] {
    const login = account?.login?.trim().toLowerCase();
    const key = login ? `haulz.serviceMode:${encodeURIComponent(login)}` : "";
    const allowed = !!account?.isRegisteredUser && account.permissions?.service_mode === true;
    const [preference, setPreference] = useState(() => ({ key, value: readPreference(key) }));
    // Restore before rendering children: Documents otherwise replaces Отправки with ЭДО.
    const value = preference.key === key ? preference.value : readPreference(key);
    if (preference.key !== key) setPreference({ key, value });

    useEffect(() => {
        if (!key || !allowed) return;
        try {
            window.localStorage.setItem(key, value ? "1" : "0");
        } catch {
            // The toggle still works when browser storage is unavailable.
        }
    }, [key, allowed, value]);

    const setMode = useCallback<Dispatch<SetStateAction<boolean>>>((next) => {
        if (!allowed || !key) return;
        setPreference(previous => {
            const current = previous.key === key ? previous.value : readPreference(key);
            return { key, value: typeof next === "function" ? next(current) : next };
        });
    }, [key, allowed]);

    return [allowed && value, setMode];
}
