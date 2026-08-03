import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../../types";
import { TapSwitch } from "../../../components/TapSwitch";
import type { ProfileEmployeesState, ProfileEmployeeRow } from "../hooks/useProfileEmployees";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
    employees: ProfileEmployeesState;
};

function EmployeeDeleteDialog({
    emp,
    loading,
    onCancel,
    onConfirm,
}: {
    emp: ProfileEmployeeRow | undefined;
    loading: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div
            className="modal-overlay"
            style={{ zIndex: 10000 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-delete-title"
            onClick={() => !loading && onCancel()}
        >
            <div className="modal-content" style={{ maxWidth: "22rem", padding: "1.25rem" }} onClick={(e) => e.stopPropagation()}>
                <Typography.Body id="employee-delete-title" style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                    Удалить сотрудника?
                </Typography.Body>
                <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                    {(emp?.fullName || emp?.login || "")} будет удалён из списка и не сможет войти в приложение.
                </Typography.Body>
                <Flex gap="0.5rem" wrap="wrap">
                    <Button
                        type="button"
                        disabled={loading}
                        style={{ background: "var(--color-error)", color: "#fff", border: "none" }}
                        onClick={() => void onConfirm()}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Удалить"}
                    </Button>
                    <Button type="button" className="filter-button" disabled={loading} onClick={onCancel}>
                        Отмена
                    </Button>
                </Flex>
            </div>
        </div>
    );
}

function EmployeeDirectoryList({ activeAccount, employees }: Props) {
    const {
        employeesList,
        employeesLoading,
        employeesError,
        rolePresets,
        employeeDeleteId,
        setEmployeeDeleteId,
        employeeDeleteLoading,
        employeePresetLoadingId,
        changeEmployeePreset,
        toggleEmployeeActive,
        confirmDeleteEmployee,
    } = employees;

    if (employeesLoading) {
        return (
            <Flex align="center" gap="0.5rem">
                <Loader2 className="w-4 h-4 animate-spin" />
                <Typography.Body>Загрузка...</Typography.Body>
            </Flex>
        );
    }
    if (employeesError) {
        return <Typography.Body style={{ color: "var(--color-error)" }}>{employeesError}</Typography.Body>;
    }
    if (employeesList.length === 0) {
        return <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Пока никого не приглашали.</Typography.Body>;
    }

    const deleteTarget = employeeDeleteId != null ? employeesList.find((e) => e.id === employeeDeleteId) : undefined;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {employeesList.map((emp) => (
                <Panel key={emp.id} className="cargo-card" style={{ padding: "0.75rem" }}>
                    <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem">
                        <div>
                            <Typography.Body style={{ fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                {emp.department ? `${emp.department} · ` : ""}
                                {emp.presetLabel} · {emp.active ? "Доступ включён" : "Отключён"}
                            </Typography.Body>
                        </div>
                        <Flex align="center" gap="0.5rem" wrap="wrap">
                            <select
                                className="admin-form-input invite-role-select"
                                value={rolePresets.find((p) => p.label === emp.presetLabel)?.id ?? rolePresets[0]?.id ?? ""}
                                disabled={rolePresets.length === 0 || employeePresetLoadingId === emp.id}
                                onChange={(e) => void changeEmployeePreset(emp.id, e.target.value, emp.presetLabel)}
                                style={{
                                    padding: "0.35rem 0.5rem",
                                    borderRadius: 6,
                                    border: "1px solid var(--color-border)",
                                    background: "var(--color-bg)",
                                    fontSize: "0.85rem",
                                    minWidth: "8rem",
                                }}
                                aria-label="Роль (пресет)"
                                title="Изменить роль"
                            >
                                {rolePresets.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                            <Typography.Body style={{ fontSize: "0.85rem" }}>{emp.active ? "Вкл" : "Выкл"}</Typography.Body>
                            <TapSwitch checked={emp.active} onToggle={() => void toggleEmployeeActive(emp.id, emp.active)} />
                            <Button
                                type="button"
                                className="filter-button"
                                style={{ padding: "0.35rem" }}
                                aria-label="Удалить сотрудника"
                                onClick={() => setEmployeeDeleteId(emp.id)}
                            >
                                <Trash2 className="w-4 h-4" style={{ color: "var(--color-error)" }} />
                            </Button>
                        </Flex>
                    </Flex>
                </Panel>
            ))}
            {employeeDeleteId != null ? (
                <EmployeeDeleteDialog
                    emp={deleteTarget}
                    loading={employeeDeleteLoading}
                    onCancel={() => !employeeDeleteLoading && setEmployeeDeleteId(null)}
                    onConfirm={confirmDeleteEmployee}
                />
            ) : null}
        </div>
    );
}

/** Справочник сотрудников компании (приглашение, роли, доступ). */
export function ProfileEmployeesSection({ activeAccount, onBack, employees }: Props) {
    const {
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
        employeesLoading,
        fetchEmployeesAndPresets,
        submitInvite,
    } = employees;

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline className="text-page-title">Справочник сотрудников</Typography.Headline>
            </Flex>
            <Typography.Body style={{ marginBottom: "1rem", color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
                Регистрируйте сотрудников компании: укажите ФИО и пресет роли. Пароль для входа отправляется на email.
            </Typography.Body>

            {!activeAccount?.isRegisteredUser ? (
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                        Доступно только зарегистрированным пользователям (вход по email и паролю).
                    </Typography.Body>
                </Panel>
            ) : !activeAccount?.login || !activeAccount?.password ? (
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                        Нужны логин и пароль текущего аккаунта для управления сотрудниками.
                    </Typography.Body>
                </Panel>
            ) : activeAccount.permissions?.supervisor !== true ? (
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                        Раздел «Сотрудники» доступен только при включённом праве «Руководитель» в админке.
                    </Typography.Body>
                </Panel>
            ) : activeAccount.inCustomerDirectory === false ? (
                <>
                    <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                            Приглашать сотрудников могут только пользователи, чья компания есть в справочнике заказчиков.
                        </Typography.Body>
                    </Panel>
                    <div style={{ marginTop: "1rem" }}>
                        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                            Справочник сотрудников
                        </Typography.Body>
                        <EmployeeDirectoryList activeAccount={activeAccount} onBack={onBack} employees={employees} />
                    </div>
                </>
            ) : (
                <>
                    <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Регистрация сотрудника</Typography.Body>
                        <Flex className="form-row-same-height invite-form-row" gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.5rem" }}>
                            <input
                                type="text"
                                placeholder="Email сотрудника"
                                value={inviteEmail}
                                onChange={(e) => {
                                    setInviteEmail(e.target.value);
                                    setInviteError(null);
                                    setInviteSuccess(null);
                                }}
                                style={{ width: "12rem", minWidth: "10rem", height: "2.5rem", boxSizing: "border-box" }}
                                className="admin-form-input"
                                autoComplete="off"
                            />
                            <Input
                                type="text"
                                placeholder="ФИО"
                                value={inviteFullName}
                                onChange={(e) => {
                                    setInviteFullName(e.target.value);
                                    setInviteError(null);
                                    setInviteSuccess(null);
                                }}
                                style={{ width: "14rem", minWidth: "12rem", height: "2.5rem", boxSizing: "border-box" }}
                                className="admin-form-input"
                            />
                            <select
                                className="admin-form-input invite-role-select"
                                value={invitePresetId}
                                onChange={(e) => {
                                    setInvitePresetId(e.target.value);
                                    setInviteError(null);
                                }}
                                style={{
                                    padding: "0 0.6rem",
                                    borderRadius: 6,
                                    border: "1px solid var(--color-border)",
                                    background: "var(--color-bg)",
                                    fontSize: "0.9rem",
                                    height: "2.5rem",
                                    boxSizing: "border-box",
                                    minWidth: "10rem",
                                }}
                                aria-label="Выберите роль"
                                title={rolePresets.length === 0 ? "Роли загружаются или не настроены" : undefined}
                            >
                                <option value="">{rolePresets.length === 0 ? "Нет ролей" : "Выберите роль"}</option>
                                {rolePresets.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                            <Button
                                type="button"
                                className="filter-button"
                                onClick={() => void fetchEmployeesAndPresets()}
                                disabled={employeesLoading}
                                title="Обновить список ролей и сотрудников"
                                style={{ height: "2.5rem", padding: "0 1rem", boxSizing: "border-box" }}
                            >
                                Обновить
                            </Button>
                            <Button
                                type="button"
                                className="button-primary"
                                style={{ height: "2.5rem", padding: "0 1rem", boxSizing: "border-box" }}
                                disabled={inviteLoading || !inviteEmail.trim() || !inviteFullName.trim() || !invitePresetId}
                                onClick={() => void submitInvite()}
                            >
                                {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Пригласить"}
                            </Button>
                        </Flex>
                        {rolePresets.length === 0 ? (
                            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                                Роли не загружены. Создайте пресеты в админ-панели (раздел «Пресеты ролей») или нажмите «Обновить».
                            </Typography.Body>
                        ) : null}
                        {inviteError ? (
                            <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem" }}>{inviteError}</Typography.Body>
                        ) : null}
                        {inviteSuccess ? (
                            <Typography.Body style={{ color: "var(--color-success-status)", fontSize: "0.85rem" }}>{inviteSuccess}</Typography.Body>
                        ) : null}
                    </Panel>
                    <div style={{ marginTop: "1rem" }}>
                        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem", display: "block" }}>
                            Справочник сотрудников
                        </Typography.Body>
                        <EmployeeDirectoryList activeAccount={activeAccount} onBack={onBack} employees={employees} />
                    </div>
                </>
            )}
        </div>
    );
}
