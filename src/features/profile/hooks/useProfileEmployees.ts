import { useCallback, useEffect, useState } from "react";
import type { Account } from "../../../types";
import {
    deleteMyEmployee,
    fetchRolePresets,
    inviteMyEmployee,
    listMyEmployees,
    patchMyEmployee,
} from "../../../api/client/profile/employees";

export type ProfileEmployeeRow = {
    id: number;
    login: string;
    active: boolean;
    createdAt: string;
    presetLabel: string;
    fullName?: string;
    department?: string;
    employeeRole?: "employee" | "department_head";
};

export type UseProfileEmployeesParams = {
    activeAccount: Account | null;
    /** Подгружать список при открытии экрана (employees / haulz). */
    fetchEnabled: boolean;
};

export function useProfileEmployees({ activeAccount, fetchEnabled }: UseProfileEmployeesParams) {
    const [employeesList, setEmployeesList] = useState<ProfileEmployeeRow[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeesError, setEmployeesError] = useState<string | null>(null);
    const [rolePresets, setRolePresets] = useState<{ id: string; label: string }[]>([]);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteFullName, setInviteFullName] = useState("");
    const [invitePresetId, setInvitePresetId] = useState("");
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
    const [employeeDeleteId, setEmployeeDeleteId] = useState<number | null>(null);
    const [employeeDeleteLoading, setEmployeeDeleteLoading] = useState(false);
    const [employeePresetLoadingId, setEmployeePresetLoadingId] = useState<number | null>(null);

    const fetchEmployeesAndPresets = useCallback(async () => {
        if (!activeAccount?.login) return;
        setEmployeesLoading(true);
        setEmployeesError(null);
        try {
            const presets = await fetchRolePresets();
            setRolePresets(presets);
            if (!activeAccount?.password) {
                setEmployeesList([]);
                return;
            }
            const { employees } = await listMyEmployees({
                login: activeAccount.login,
                password: activeAccount.password,
            });
            setEmployeesList(employees as ProfileEmployeeRow[]);
        } catch (e) {
            setEmployeesError((e as Error)?.message || "Ошибка загрузки");
        } finally {
            setEmployeesLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password]);

    useEffect(() => {
        if (fetchEnabled && activeAccount?.login) void fetchEmployeesAndPresets();
    }, [fetchEnabled, activeAccount?.login, fetchEmployeesAndPresets]);

    const auth = activeAccount?.login && activeAccount?.password
        ? { login: activeAccount.login, password: activeAccount.password }
        : null;

    const changeEmployeePreset = useCallback(
        async (employeeId: number, presetId: string, currentLabel: string) => {
            if (!auth || !presetId) return;
            setEmployeePresetLoadingId(employeeId);
            setEmployeesError(null);
            try {
                await patchMyEmployee(auth, employeeId, { presetId });
                const newLabel = rolePresets.find((p) => p.id === presetId)?.label ?? currentLabel;
                setEmployeesList((prev) =>
                    prev.map((e) => (e.id === employeeId ? { ...e, presetLabel: newLabel } : e)),
                );
            } catch (e) {
                setEmployeesError((e as Error)?.message || "Не удалось изменить роль");
            } finally {
                setEmployeePresetLoadingId(null);
            }
        },
        [auth, rolePresets],
    );

    const toggleEmployeeActive = useCallback(
        async (employeeId: number, active: boolean) => {
            if (!auth) return;
            setEmployeesError(null);
            try {
                await patchMyEmployee(auth, employeeId, { active: !active });
                setEmployeesList((prev) =>
                    prev.map((e) => (e.id === employeeId ? { ...e, active: !active } : e)),
                );
            } catch (e) {
                setEmployeesError((e as Error)?.message || "Не удалось изменить доступ");
            }
        },
        [auth],
    );

    const confirmDeleteEmployee = useCallback(async () => {
        if (!auth || employeeDeleteId == null || employeeDeleteLoading) return;
        setEmployeeDeleteLoading(true);
        try {
            await deleteMyEmployee(auth, employeeDeleteId);
            setEmployeesList((prev) => prev.filter((e) => e.id !== employeeDeleteId));
            setEmployeeDeleteId(null);
        } catch (e) {
            setEmployeesError((e as Error)?.message ?? "Ошибка удаления");
        } finally {
            setEmployeeDeleteLoading(false);
        }
    }, [auth, employeeDeleteId, employeeDeleteLoading]);

    const submitInvite = useCallback(async () => {
        if (!auth) return;
        setInviteError(null);
        setInviteSuccess(null);
        setInviteLoading(true);
        try {
            const data = await inviteMyEmployee(auth, {
                email: inviteEmail.trim(),
                fullName: inviteFullName.trim(),
                presetId: invitePresetId,
            });
            setInviteSuccess(data.message || "Готово");
            setInviteEmail("");
            setInviteFullName("");
            setInvitePresetId("");
            void fetchEmployeesAndPresets();
        } catch (e) {
            setInviteError((e as Error)?.message || "Ошибка приглашения");
        } finally {
            setInviteLoading(false);
        }
    }, [auth, inviteEmail, inviteFullName, invitePresetId, fetchEmployeesAndPresets]);

    return {
        employeesList,
        employeesLoading,
        employeesError,
        rolePresets,
        inviteEmail,
        setInviteEmail,
        inviteFullName,
        setInviteFullName,
        invitePresetId,
        setInvitePresetId,
        inviteLoading,
        inviteError,
        inviteSuccess,
        setInviteError,
        setInviteSuccess,
        employeeDeleteId,
        setEmployeeDeleteId,
        employeeDeleteLoading,
        employeePresetLoadingId,
        fetchEmployeesAndPresets,
        changeEmployeePreset,
        toggleEmployeeActive,
        confirmDeleteEmployee,
        submitInvite,
    };
}

export type ProfileEmployeesState = ReturnType<typeof useProfileEmployees>;
