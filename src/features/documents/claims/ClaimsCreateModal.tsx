import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { ChevronDown } from "lucide-react";
import { TapSwitch } from "../../../components/TapSwitch";
import { formatPerevozkaNumberForApi } from "../../../lib/perevozkaNumber";
import { fetchPerevozkaDetails } from "../../../lib/perevozkaDetails";
import { fetchClaimById, saveClaimDraft } from "../../../api/client/documents";
import {
  FILE_PICKER_BUTTON_STYLE,
  MANIPULATION_SIGN_OPTIONS,
  MAX_CLAIM_FILE_BYTES,
  PACKAGING_TYPE_OPTIONS,
  type ClaimFormType,
  type ClaimNomenclatureRow,
} from "./claimFormConstants";
import {
  fileToBase64,
  formatPhoneMask,
  normalizeAcceptedCargoNomenclatureRows,
  normalizeClaimCargoNumber,
} from "./claimFormUtils";

export type ClaimsCreateModalProps = {
  isOpen: boolean;
  editingId: number | null;
  prefillCargoNumber?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  auth: { login: string; password: string; inn?: string };
  effectiveActiveInn: string | null;
  claimCargoOptions: string[];
  perevozkiItems: unknown[];
  normCargoKey: (value: string) => string;
};

function resetFormFields(
  setters: {
    setError: (v: string | null) => void;
    setCargoNumber: (v: string) => void;
    setCargoNumberDebounced: (v: string) => void;
    setType: (v: ClaimFormType) => void;
    setDescription: (v: string) => void;
    setAmount: (v: string) => void;
    setContactName: (v: string) => void;
    setPhone: (v: string) => void;
    setEmail: (v: string) => void;
    setVideoLink: (v: string) => void;
    setManipulationSignIds: (v: string[]) => void;
    setManipulationPhotoFiles: (v: File[]) => void;
    setPackagingTypeIds: (v: string[]) => void;
    setSelectedPlaceKeys: (v: string[]) => void;
    setPhotoFiles: (v: File[]) => void;
    setDocumentFiles: (v: File[]) => void;
  },
  prefill: string,
  defaultEmail: string
) {
  setters.setError(null);
  setters.setCargoNumber(prefill);
  setters.setCargoNumberDebounced(prefill);
  setters.setType("cargo_damage");
  setters.setDescription("");
  setters.setAmount("");
  setters.setContactName("");
  setters.setPhone("");
  setters.setEmail(defaultEmail);
  setters.setVideoLink("");
  setters.setManipulationSignIds([]);
  setters.setManipulationPhotoFiles([]);
  setters.setPackagingTypeIds([]);
  setters.setSelectedPlaceKeys([]);
  setters.setPhotoFiles([]);
  setters.setDocumentFiles([]);
}

export function ClaimsCreateModal({
  isOpen,
  editingId,
  prefillCargoNumber = "",
  onClose,
  onSaved,
  onBusyChange,
  auth,
  effectiveActiveInn,
  claimCargoOptions,
  perevozkiItems,
  normCargoKey,
}: ClaimsCreateModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargoNumber, setCargoNumber] = useState("");
  const [cargoNumberDebounced, setCargoNumberDebounced] = useState("");
  const [cargoDropdownOpen, setCargoDropdownOpen] = useState(false);
  const cargoInputRef = useRef<HTMLDivElement>(null);
  const [claimType, setClaimType] = useState<ClaimFormType>("cargo_damage");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [videoLink, setVideoLink] = useState("");
  const [manipulationSignIds, setManipulationSignIds] = useState<string[]>([]);
  const [manipulationPhotoFiles, setManipulationPhotoFiles] = useState<File[]>([]);
  const [packagingTypeIds, setPackagingTypeIds] = useState<string[]>([]);
  const [selectedPlaceKeys, setSelectedPlaceKeys] = useState<string[]>([]);
  const [nomenclatureLoading, setNomenclatureLoading] = useState(false);
  const [nomenclatureError, setNomenclatureError] = useState<string | null>(null);
  const [nomenclatureRows, setNomenclatureRows] = useState<ClaimNomenclatureRow[]>([]);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [documentFiles, setDocumentFiles] = useState<File[]>([]);
  const openSessionRef = useRef(0);

  const formSetters = useMemo(
    () => ({
      setError,
      setCargoNumber,
      setCargoNumberDebounced,
      setType: setClaimType,
      setDescription,
      setAmount,
      setContactName,
      setPhone,
      setEmail,
      setVideoLink,
      setManipulationSignIds,
      setManipulationPhotoFiles,
      setPackagingTypeIds,
      setSelectedPlaceKeys,
      setPhotoFiles,
      setDocumentFiles,
    }),
    []
  );

  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);

  useEffect(() => {
    if (!isOpen) {
      setCargoDropdownOpen(false);
      return;
    }
    const session = ++openSessionRef.current;
    if (editingId) {
      setSubmitting(true);
      setError(null);
      const claimAuth = {
        login: auth.login,
        password: auth.password,
        inn: String(effectiveActiveInn || auth?.inn || "").trim(),
      };
      fetchClaimById(claimAuth, editingId)
        .then(({ ok, data }) => {
          if (session !== openSessionRef.current) return;
          if (!ok) throw new Error((data as { error?: string })?.error || "Не удалось загрузить черновик");
          const claim = (data as { claim?: Record<string, unknown> })?.claim || {};
          const events = Array.isArray((data as { events?: unknown[] })?.events)
            ? ((data as { events?: unknown[] }).events as Record<string, unknown>[])
            : [];
          const draftPayload =
            [...events]
              .reverse()
              .find(
                (e) =>
                  e?.eventType === "claim_draft_saved" || e?.eventType === "claim_created"
              )?.payload || {};
          setCargoNumber(String(claim?.cargoNumber || ""));
          setCargoNumberDebounced(String(claim?.cargoNumber || ""));
          setClaimType(String(claim?.claimType || "cargo_damage") as ClaimFormType);
          setDescription(String(claim?.description || ""));
          setAmount(claim?.requestedAmount != null ? String(claim.requestedAmount) : "");
          setContactName(String((draftPayload as Record<string, unknown>)?.customerContactName || ""));
          setPhone(String(claim?.customerPhone || ""));
          setEmail(String(claim?.customerEmail || auth.login || ""));
          setVideoLink("");
          setManipulationSignIds(
            Array.isArray((draftPayload as Record<string, unknown>)?.manipulationSigns)
              ? ((draftPayload as Record<string, unknown>).manipulationSigns as unknown[]).map((x) =>
                  String(x)
                )
              : []
          );
          setPackagingTypeIds(
            Array.isArray((draftPayload as Record<string, unknown>)?.packagingTypes)
              ? ((draftPayload as Record<string, unknown>).packagingTypes as unknown[]).map((x) =>
                  String(x)
                )
              : []
          );
          setSelectedPlaceKeys([]);
          setPhotoFiles([]);
          setManipulationPhotoFiles([]);
          setDocumentFiles([]);
        })
        .catch((e: { message?: string }) => {
          if (session !== openSessionRef.current) return;
          setError(e?.message || "Не удалось открыть черновик");
        })
        .finally(() => {
          if (session !== openSessionRef.current) return;
          setSubmitting(false);
        });
      return;
    }
    resetFormFields(formSetters, String(prefillCargoNumber || "").trim(), auth?.login || "");
  }, [isOpen, editingId, prefillCargoNumber, auth.login, auth.inn, effectiveActiveInn, formSetters]);

  const cargoFilteredOptions = useMemo(() => {
    const q = String(cargoNumber || "").trim().toLowerCase();
    if (!q) return claimCargoOptions;
    return claimCargoOptions.filter((opt) => String(opt).toLowerCase().includes(q));
  }, [claimCargoOptions, cargoNumber]);

  useEffect(() => {
    if (!cargoDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (cargoInputRef.current && !cargoInputRef.current.contains(e.target as Node)) {
        setCargoDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cargoDropdownOpen]);

  useEffect(() => {
    const q = String(cargoNumber || "").trim();
    if (!q) {
      setCargoNumberDebounced("");
      return;
    }
    const t = setTimeout(() => setCargoNumberDebounced(q), 400);
    return () => clearTimeout(t);
  }, [cargoNumber]);

  useEffect(() => {
    const number = normalizeClaimCargoNumber(String(cargoNumberDebounced || ""));
    if (!number || !auth?.login || !auth?.password) {
      setNomenclatureRows([]);
      setNomenclatureError(null);
      setNomenclatureLoading(false);
      return;
    }
    let cancelled = false;
    setNomenclatureLoading(true);
    setNomenclatureError(null);
    const selectedCargoKey = normCargoKey(number);
    const matchedCargo = (perevozkiItems || []).find((c) => {
      const item = c as Record<string, unknown>;
      const raw = String(item?.Number ?? item?.number ?? "").trim();
      return raw && normCargoKey(raw) === selectedCargoKey;
    });
    const cargoItem = matchedCargo || {
      Number: number,
      CitySender: "",
      CityReceiver: "",
    };
    fetchPerevozkaDetails(auth, formatPerevozkaNumberForApi(number), cargoItem as never)
      .then(({ nomenclature }) => {
        if (cancelled) return;
        const normalized = normalizeAcceptedCargoNomenclatureRows(
          Array.isArray(nomenclature) ? (nomenclature as Record<string, unknown>[]) : []
        );
        setNomenclatureRows(normalized);
      })
      .catch((e: { message?: string }) => {
        if (cancelled) return;
        setNomenclatureRows([]);
        setNomenclatureError(e?.message || "Не удалось загрузить номенклатуру принятого груза");
      })
      .finally(() => {
        if (cancelled) return;
        setNomenclatureLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cargoNumberDebounced, auth, perevozkiItems, normCargoKey]);

  useEffect(() => {
    const allowed = new Set(nomenclatureRows.map((row) => row.key));
    setSelectedPlaceKeys((prev) => prev.filter((k) => allowed.has(k)));
  }, [nomenclatureRows]);

  useEffect(() => {
    if (manipulationSignIds.length === 0 && manipulationPhotoFiles.length > 0) {
      setManipulationPhotoFiles([]);
    }
  }, [manipulationSignIds, manipulationPhotoFiles.length]);

  useEffect(() => {
    if (claimType !== "cargo_damage") {
      if (manipulationSignIds.length > 0) setManipulationSignIds([]);
      if (manipulationPhotoFiles.length > 0) setManipulationPhotoFiles([]);
      if (packagingTypeIds.length > 0) setPackagingTypeIds([]);
    }
  }, [claimType, manipulationSignIds.length, manipulationPhotoFiles.length, packagingTypeIds.length]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!auth?.login || !auth?.password) {
      setError("Не удалось определить авторизацию");
      return;
    }
    if (!cargoNumber.trim() || !description.trim()) {
      setError("Заполните номер перевозки и описание");
      return;
    }
    const amountNum = Number(amount || 0);
    if (!Number.isFinite(amountNum) || amountNum < 0) {
      setError("Некорректная сумма требования");
      return;
    }
    const totalPhotoFiles = photoFiles.length + manipulationPhotoFiles.length;
    if (totalPhotoFiles > 10) {
      setError("Можно прикрепить не более 10 фото");
      return;
    }
    if (photoFiles.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
      setError("Размер одного фото не должен превышать 5MB");
      return;
    }
    if (manipulationPhotoFiles.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
      setError("Размер одного фото не должен превышать 5MB");
      return;
    }
    if (documentFiles.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
      setError("Размер одного PDF не должен превышать 5MB");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const photosPayload = await Promise.all(
        photoFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          base64: await fileToBase64(file),
        }))
      );
      const manipulationPhotosPayload = await Promise.all(
        manipulationPhotoFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "image/jpeg",
          caption: `Манипуляционные знаки: ${manipulationSignIds
            .map((id) => MANIPULATION_SIGN_OPTIONS.find((s) => s.id === id)?.label || id)
            .join(", ")}`,
          base64: await fileToBase64(file),
        }))
      );
      const documentsPayload = await Promise.all(
        documentFiles.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          docType: "other" as const,
          base64: await fileToBase64(file),
        }))
      );
      const selectedPlacesPayload = nomenclatureRows
        .filter((row) => selectedPlaceKeys.includes(row.key))
        .map((row) => ({
          placeNumber: row.barcode || null,
          name: row.name,
          sourceDoc: "accepted_cargo",
        }));
      const bodyPayload = {
        cargoNumber: cargoNumber.trim(),
        claimType,
        description: description.trim(),
        requestedAmount: amountNum,
        customerContactName: contactName.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim(),
        customerInn: effectiveActiveInn || undefined,
        photos: [...photosPayload, ...manipulationPhotosPayload],
        documents: documentsPayload,
        selectedPlaces: selectedPlacesPayload,
        manipulationSigns: manipulationSignIds,
        packagingTypes: packagingTypeIds,
        videoLinks: videoLink.trim()
          ? [{ url: videoLink.trim(), title: "Видео от клиента" }]
          : [],
      };
      const isEditDraft = !!editingId;
      const claimAuth = {
        login: auth.login,
        password: auth.password,
        inn: String(effectiveActiveInn || auth?.inn || "").trim(),
      };
      const { ok, data } = await saveClaimDraft(claimAuth, editingId, bodyPayload);
      if (!ok) {
        throw new Error(
          (data as { error?: string })?.error ||
            (isEditDraft ? "Не удалось сохранить черновик" : "Не удалось создать претензию")
        );
      }
      onClose();
      await onSaved();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : null;
      setError(message || (editingId ? "Ошибка сохранения черновика" : "Ошибка создания претензии"));
    } finally {
      setSubmitting(false);
    }
  }, [
    auth,
    cargoNumber,
    description,
    amount,
    photoFiles,
    manipulationPhotoFiles,
    documentFiles,
    nomenclatureRows,
    selectedPlaceKeys,
    claimType,
    contactName,
    phone,
    email,
    effectiveActiveInn,
    manipulationSignIds,
    packagingTypeIds,
    videoLink,
    editingId,
    onClose,
    onSaved,
  ]);

  if (!isOpen) return null;

  return (
    <div
      className="claims-create-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "1rem 0.5rem",
      }}
      onClick={handleClose}
    >
      <div
        className="claims-create-content"
        style={{
          width: "100%",
          maxWidth: 560,
          borderRadius: 12,
          background: "var(--color-bg-card, #fff)",
          padding: "1rem",
          maxHeight: "calc(100vh - 2rem)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography.Body style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
          {editingId ? `Черновик претензии #${editingId}` : "Новая претензия"}
        </Typography.Body>
        <div style={{ display: "grid", gap: "0.55rem", marginBottom: "0.75rem" }}>
          <div ref={cargoInputRef} style={{ position: "relative" }}>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              Номер перевозки
            </Typography.Body>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                background: "var(--color-bg-card, #fff)",
              }}
            >
              <input
                type="text"
                className="admin-form-input"
                placeholder="Начните вводить или выберите номер перевозки"
                value={cargoNumber}
                onChange={(e) => setCargoNumber(e.target.value)}
                onFocus={() => setCargoDropdownOpen(true)}
                onClick={() => setCargoDropdownOpen(true)}
                style={{ flex: 1, padding: "0.45rem", border: "none", background: "transparent" }}
              />
              <button
                type="button"
                onClick={() => setCargoDropdownOpen((v) => !v)}
                style={{
                  padding: "0.35rem 0.5rem",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                }}
                title={cargoDropdownOpen ? "Свернуть список" : "Показать список"}
              >
                <ChevronDown
                  className="w-4 h-4"
                  style={{
                    transform: cargoDropdownOpen ? "rotate(180deg)" : undefined,
                    transition: "transform 0.2s",
                  }}
                />
              </button>
            </div>
            {cargoDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: 2,
                  maxHeight: 220,
                  overflowY: "auto",
                  background: "var(--color-bg-card, #fff)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  zIndex: 1100,
                }}
              >
                {cargoFilteredOptions.length === 0 ? (
                  <div
                    style={{
                      padding: "0.6rem 0.75rem",
                      fontSize: "0.82rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Нет совпадений
                  </div>
                ) : (
                  cargoFilteredOptions.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setCargoNumber(opt);
                        setCargoNumberDebounced(opt);
                        setCargoDropdownOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "0.45rem 0.75rem",
                        textAlign: "left",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background =
                          "var(--color-bg-hover, #f3f4f6)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "none";
                      }}
                    >
                      {opt}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              Тип претензии
            </Typography.Body>
            <select
              className="admin-form-input"
              value={claimType}
              onChange={(e) => setClaimType(e.target.value as ClaimFormType)}
              style={{ width: "100%", padding: "0.45rem" }}
            >
              <option value="cargo_damage">Повреждение груза</option>
              <option value="quantity_mismatch">Недовоз</option>
              <option value="other">Прочее</option>
            </select>
          </div>
          <div
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              padding: "0.55rem",
              background: "var(--color-bg-secondary, #f8f9fa)",
            }}
          >
            <Typography.Body
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--color-text)",
                marginBottom: "0.2rem",
              }}
            >
              Сумма требования, ₽
            </Typography.Body>
            <input
              type="number"
              className="admin-form-input"
              placeholder="Введите сумму в рублях"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ width: "100%", padding: "0.45rem", maxWidth: 200 }}
            />
          </div>
          <div>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              Укажите номера мест
            </Typography.Body>
            <details style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.45rem 0.55rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.84rem", fontWeight: 500 }}>
                Номенклатура принятого груза
              </summary>
              {nomenclatureLoading ? (
                <Typography.Body
                  style={{ marginTop: "0.45rem", fontSize: "0.76rem", color: "var(--color-text-secondary)" }}
                >
                  Загрузка номенклатуры...
                </Typography.Body>
              ) : nomenclatureError ? (
                <Typography.Body style={{ marginTop: "0.45rem", fontSize: "0.76rem", color: "#ef4444" }}>
                  {nomenclatureError}
                </Typography.Body>
              ) : nomenclatureRows.length === 0 ? (
                <Typography.Body
                  style={{ marginTop: "0.45rem", fontSize: "0.76rem", color: "var(--color-text-secondary)" }}
                >
                  Для выбранной перевозки нет данных по номенклатуре принятого груза.
                </Typography.Body>
              ) : (
                <div style={{ marginTop: "0.45rem", maxHeight: 220, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ textAlign: "left", padding: "0.25rem", width: 34 }}>#</th>
                        <th style={{ textAlign: "left", padding: "0.25rem", whiteSpace: "nowrap" }}>Штрихкод</th>
                        <th style={{ textAlign: "left", padding: "0.25rem" }}>Номенклатура</th>
                        <th style={{ textAlign: "left", padding: "0.25rem", whiteSpace: "nowrap" }}>
                          Объявленная стоимость
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {nomenclatureRows.map((row) => {
                        const checked = selectedPlaceKeys.includes(row.key);
                        return (
                          <tr key={row.key} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "0.25rem" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedPlaceKeys((prev) => {
                                    if (e.target.checked)
                                      return prev.includes(row.key) ? prev : [...prev, row.key];
                                    return prev.filter((k) => k !== row.key);
                                  });
                                }}
                              />
                            </td>
                            <td style={{ padding: "0.25rem", whiteSpace: "nowrap" }}>{row.barcode || "—"}</td>
                            <td style={{ padding: "0.25rem" }}>{row.name}</td>
                            <td style={{ padding: "0.25rem", whiteSpace: "nowrap" }}>{row.declaredCost}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          </div>
          {claimType === "cargo_damage" ? (
            <>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.55rem" }}>
                <Typography.Body
                  style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}
                >
                  Наличие манипуляционных знаков
                </Typography.Body>
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  {MANIPULATION_SIGN_OPTIONS.map((sign) => {
                    const checked = manipulationSignIds.includes(sign.id);
                    return (
                      <Flex key={sign.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                        <Typography.Body style={{ fontSize: "0.82rem" }}>{sign.label}</Typography.Body>
                        <TapSwitch
                          checked={checked}
                          onToggle={() => {
                            setManipulationSignIds((prev) =>
                              prev.includes(sign.id)
                                ? prev.filter((id) => id !== sign.id)
                                : [...prev, sign.id]
                            );
                          }}
                        />
                      </Flex>
                    );
                  })}
                </div>
                {manipulationSignIds.length > 0 ? (
                  <div style={{ marginTop: "0.5rem" }}>
                    <Typography.Body
                      style={{
                        fontSize: "0.76rem",
                        color: "var(--color-text-secondary)",
                        marginBottom: "0.2rem",
                      }}
                    >
                      Фото манипуляционных знаков (до 5MB каждый)
                    </Typography.Body>
                    <input
                      id="claims-manipulation-photos"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setManipulationPhotoFiles(files);
                        if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                          setError("Размер одного фото не должен превышать 5MB");
                        } else {
                          setError(null);
                        }
                      }}
                      style={{ display: "none" }}
                    />
                    <input
                      id="claims-manipulation-photos-camera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length === 0) return;
                        setManipulationPhotoFiles((prev) => [...prev, ...files]);
                        if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                          setError("Размер одного фото не должен превышать 5MB");
                        } else {
                          setError(null);
                        }
                        e.currentTarget.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                    <Flex align="center" gap="0.45rem" wrap="wrap">
                      <label htmlFor="claims-manipulation-photos" style={FILE_PICKER_BUTTON_STYLE}>
                        Выбрать фото
                      </label>
                      <label htmlFor="claims-manipulation-photos-camera" style={FILE_PICKER_BUTTON_STYLE}>
                        Сделать фото
                      </label>
                      <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                        {manipulationPhotoFiles.length > 0
                          ? `Выбрано: ${manipulationPhotoFiles.length}`
                          : "Файлы не выбраны"}
                      </Typography.Body>
                    </Flex>
                    {manipulationPhotoFiles.length > 0 ? (
                      <Typography.Body
                        style={{ fontSize: "0.74rem", color: "var(--color-text-secondary)", marginTop: "0.2rem" }}
                      >
                        Выбрано фото: {manipulationPhotoFiles.map((f) => f.name).join(", ")}
                      </Typography.Body>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: "0.55rem" }}>
                <Typography.Body
                  style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.35rem" }}
                >
                  Упаковка
                </Typography.Body>
                <div style={{ display: "grid", gap: "0.35rem" }}>
                  {PACKAGING_TYPE_OPTIONS.map((pack) => {
                    const checked = packagingTypeIds.includes(pack.id);
                    return (
                      <Flex key={pack.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                        <Typography.Body style={{ fontSize: "0.82rem" }}>{pack.label}</Typography.Body>
                        <TapSwitch
                          checked={checked}
                          onToggle={() => {
                            setPackagingTypeIds((prev) =>
                              prev.includes(pack.id)
                                ? prev.filter((id) => id !== pack.id)
                                : [...prev, pack.id]
                            );
                          }}
                        />
                      </Flex>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
          <div>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              Описание
            </Typography.Body>
            <textarea
              className="admin-form-input"
              placeholder="Опишите суть претензии, расчет суммы и обстоятельства"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ width: "100%", minHeight: 90, padding: "0.45rem" }}
            />
          </div>
          <div>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              Ссылка на видео (опционально)
            </Typography.Body>
            <input
              type="url"
              className="admin-form-input"
              placeholder="https://..."
              value={videoLink}
              onChange={(e) => setVideoLink(e.target.value)}
              style={{ width: "100%", padding: "0.45rem" }}
            />
          </div>
          <div>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              Фото (до 10 файлов, до 5MB каждый)
            </Typography.Body>
            <input
              id="claims-photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setPhotoFiles(files);
                if (files.length > 10) {
                  setError("Можно прикрепить не более 10 фото");
                } else if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                  setError("Размер одного фото не должен превышать 5MB");
                } else {
                  setError(null);
                }
              }}
              style={{ display: "none" }}
            />
            <input
              id="claims-photos-camera"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                const mergedCount = photoFiles.length + files.length;
                setPhotoFiles((prev) => [...prev, ...files].slice(0, 10));
                if (mergedCount > 10) {
                  setError("Можно прикрепить не более 10 фото");
                } else if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                  setError("Размер одного фото не должен превышать 5MB");
                } else {
                  setError(null);
                }
                e.currentTarget.value = "";
              }}
              style={{ display: "none" }}
            />
            <Flex align="center" gap="0.45rem" wrap="wrap">
              <label htmlFor="claims-photos" style={FILE_PICKER_BUTTON_STYLE}>
                Выбрать фото
              </label>
              <label htmlFor="claims-photos-camera" style={FILE_PICKER_BUTTON_STYLE}>
                Сделать фото
              </label>
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                {photoFiles.length > 0 ? `Выбрано: ${photoFiles.length}` : "Файлы не выбраны"}
              </Typography.Body>
            </Flex>
            {photoFiles.length > 0 ? (
              <div style={{ marginTop: "0.25rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {photoFiles.map((file, idx) => (
                  <span
                    key={`${file.name}-${idx}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.15rem 0.4rem",
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-bg-hover)",
                      fontSize: "0.72rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {file.name}
                    <button
                      type="button"
                      onClick={() => setPhotoFiles((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#ef4444",
                        cursor: "pointer",
                        padding: 0,
                        lineHeight: 1,
                      }}
                      aria-label={`Удалить ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              PDF документы (до 5MB каждый)
            </Typography.Body>
            <input
              id="claims-documents"
              type="file"
              accept="application/pdf"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setDocumentFiles(files);
                if (files.some((f) => f.size > MAX_CLAIM_FILE_BYTES)) {
                  setError("Размер одного PDF не должен превышать 5MB");
                } else {
                  setError(null);
                }
              }}
              style={{ display: "none" }}
            />
            <Flex align="center" gap="0.45rem" wrap="wrap">
              <label htmlFor="claims-documents" style={FILE_PICKER_BUTTON_STYLE}>
                Выбрать PDF
              </label>
              <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                {documentFiles.length > 0 ? `Выбрано: ${documentFiles.length}` : "Файлы не выбраны"}
              </Typography.Body>
            </Flex>
            {documentFiles.length > 0 ? (
              <div style={{ marginTop: "0.25rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {documentFiles.map((file, idx) => (
                  <span
                    key={`${file.name}-${idx}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      padding: "0.15rem 0.4rem",
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "var(--color-bg-hover)",
                      fontSize: "0.72rem",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {file.name}
                    <button
                      type="button"
                      onClick={() => setDocumentFiles((prev) => prev.filter((_, i) => i !== idx))}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#ef4444",
                        cursor: "pointer",
                        padding: 0,
                        lineHeight: 1,
                      }}
                      aria-label={`Удалить ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <Typography.Body
              style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.2rem" }}
            >
              Контакты
            </Typography.Body>
            <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.5rem" }}>
              <div style={{ flex: "1 1 260px" }}>
                <input
                  type="text"
                  className="admin-form-input"
                  placeholder="ФИО контактного лица"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  style={{ width: "100%", padding: "0.45rem" }}
                />
              </div>
            </Flex>
            <Flex gap="0.5rem" wrap="wrap">
              <div style={{ flex: "1 1 180px" }}>
                <input
                  type="tel"
                  inputMode="tel"
                  className="admin-form-input"
                  placeholder="+7 (___) ___-__-__"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneMask(e.target.value))}
                  style={{ width: "100%", padding: "0.45rem" }}
                />
              </div>
              <div style={{ flex: "1 1 220px" }}>
                <input
                  type="email"
                  className="admin-form-input"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: "100%", padding: "0.45rem" }}
                />
              </div>
            </Flex>
          </div>
        </div>
        {error ? (
          <Typography.Body style={{ color: "#ef4444", fontSize: "0.78rem", marginBottom: "0.6rem" }}>
            {error}
          </Typography.Body>
        ) : null}
        <Flex justify="flex-end" gap="0.45rem" align="center" wrap="nowrap" style={{ flexWrap: "nowrap" }}>
          <Button
            className="filter-button"
            disabled={submitting}
            style={{ height: 40, minWidth: 120, padding: "0 0.7rem", flexShrink: 0 }}
            onClick={handleClose}
          >
            Отмена
          </Button>
          <Button
            className="button-primary"
            disabled={submitting}
            style={{ height: 40, minWidth: 120, padding: "0 0.7rem", flexShrink: 0 }}
            onClick={handleSubmit}
          >
            {submitting
              ? editingId
                ? "Сохранение..."
                : "Создание..."
              : editingId
                ? "Сохранить черновик"
                : "Создать черновик"}
          </Button>
        </Flex>
      </div>
    </div>
  );
}
