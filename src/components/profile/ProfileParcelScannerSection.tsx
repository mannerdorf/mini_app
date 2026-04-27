import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, X, Camera, FileDown, ScanLine } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";
import { DOCUMENT_METHODS } from "../../documentMethods";
import { PROXY_API_DOWNLOAD_URL } from "../../constants/config";
import { normalizeWbPerevozkaHaulzDigits } from "../../lib/wbPerevozkaNumber";
import { downloadBase64File } from "../../utils";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

/** Ввод ШК / камера / статус посылки и скачивание АПП по перевозке HAULZ. */
export function ProfileParcelScannerSection({ activeAccount, onBack }: Props) {
    const [parcelCode, setParcelCode] = useState("");
    const [parcelLookupLoading, setParcelLookupLoading] = useState(false);
    const [parcelLookupError, setParcelLookupError] = useState<string | null>(null);
    const [parcelLookupResult, setParcelLookupResult] = useState<{
        lastStatus: string;
        perevozka: string;
        posilkaSteps: Array<{ title: string; date: string }>;
    } | null>(null);
    const [parcelAppLoading, setParcelAppLoading] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scannerError, setScannerError] = useState<string | null>(null);
    const [scannerDetected, setScannerDetected] = useState("");
    const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
    const scannerStreamRef = useRef<MediaStream | null>(null);
    const scannerRafRef = useRef<number | null>(null);
    const scannerZxingReaderRef = useRef<{ reset?: () => void } | null>(null);
    const scannerZxingControlsRef = useRef<{ stop?: () => void } | null>(null);

    const stopParcelScanner = useCallback(() => {
        if (scannerRafRef.current !== null) {
            window.cancelAnimationFrame(scannerRafRef.current);
            scannerRafRef.current = null;
        }
        const zxingControls = scannerZxingControlsRef.current;
        if (zxingControls?.stop) {
            try {
                zxingControls.stop();
            } catch {
                // ignore
            }
        }
        scannerZxingControlsRef.current = null;
        const zxingReader = scannerZxingReaderRef.current;
        if (zxingReader?.reset) {
            try {
                zxingReader.reset();
            } catch {
                // ignore
            }
        }
        scannerZxingReaderRef.current = null;
        const stream = scannerStreamRef.current;
        if (stream) {
            for (const track of stream.getTracks()) track.stop();
        }
        scannerStreamRef.current = null;
        const video = scannerVideoRef.current;
        if (video) {
            try {
                video.pause();
            } catch {
                // ignore
            }
            (video as HTMLVideoElement & { srcObject?: MediaStream | null }).srcObject = null;
        }
        setScannerOpen(false);
    }, []);

    const handleLookupParcel = useCallback(async (rawCode?: string) => {
        const code = String(rawCode ?? parcelCode).trim();
        if (!code) {
            setParcelLookupError("Введите ШК посылки");
            return;
        }
        if (!activeAccount?.login || !activeAccount?.password) {
            setParcelLookupError("Требуется авторизация");
            return;
        }
        setParcelLookupLoading(true);
        setParcelLookupError(null);
        try {
            const res = await fetch(`/api/haulz/postb-posilka?code=${encodeURIComponent(code)}`, {
                headers: {
                    "x-login": activeAccount.login,
                    "x-password": activeAccount.password,
                },
            });
            const data = await res.json().catch(() => ({} as Record<string, unknown>));
            if (!res.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Ошибка запроса статуса посылки");
            }
            if (!data || data.ok !== true) {
                throw new Error(typeof data?.error === "string" ? data.error : "Посылка не найдена");
            }
            setParcelCode(code);
            setParcelLookupResult({
                lastStatus: String((data as { lastStatus?: unknown }).lastStatus ?? "").trim(),
                perevozka: String((data as { perevozka?: unknown }).perevozka ?? "").trim(),
                posilkaSteps: Array.isArray((data as { posilkaSteps?: unknown }).posilkaSteps)
                    ? ((data as { posilkaSteps: Array<{ title?: string; date?: string }> }).posilkaSteps || []).map((step) => ({
                        title: String(step?.title ?? "").trim(),
                        date: String(step?.date ?? "").trim(),
                    }))
                    : [],
            });
        } catch (e: unknown) {
            setParcelLookupResult(null);
            setParcelLookupError((e as Error)?.message || "Ошибка запроса статуса посылки");
        } finally {
            setParcelLookupLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password, parcelCode]);

    const startParcelScanner = useCallback(async () => {
        setScannerError(null);
        setScannerDetected("");
        if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setScannerError("Камера не поддерживается на этом устройстве");
            return;
        }
        try {
            setScannerOpen(true);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false,
            });
            scannerStreamRef.current = stream;
            let video = scannerVideoRef.current;
            if (!video) {
                for (let i = 0; i < 12 && !video; i += 1) {
                    await new Promise((resolve) => window.setTimeout(resolve, 25));
                    video = scannerVideoRef.current;
                }
            }
            if (!video) {
                for (const track of stream.getTracks()) track.stop();
                scannerStreamRef.current = null;
                setScannerError("Не удалось открыть окно сканера");
                setScannerOpen(false);
                return;
            }
            (video as HTMLVideoElement & { srcObject?: MediaStream | null }).srcObject = stream;
            await video.play().catch(() => undefined);

            const detectorCtor = (window as Window & {
                BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
            }).BarcodeDetector;
            if (!detectorCtor) {
                try {
                    const zxingModule = await import("@zxing/browser");
                    const ReaderCtor = (zxingModule as { BrowserMultiFormatReader?: new () => {
                        decodeFromVideoElement?: (
                            source: HTMLVideoElement,
                            callback: (result: unknown, error: unknown, controls?: { stop?: () => void }) => void,
                        ) => Promise<{ stop?: () => void }> | { stop?: () => void };
                        reset?: () => void;
                    } }).BrowserMultiFormatReader;
                    if (!ReaderCtor) {
                        setScannerError("Автосканер недоступен на этом устройстве. Введите ШК вручную и нажмите ОК.");
                        return;
                    }
                    const reader = new ReaderCtor();
                    scannerZxingReaderRef.current = reader;
                    if (!reader.decodeFromVideoElement) {
                        setScannerError("Автосканер недоступен на этом устройстве. Введите ШК вручную и нажмите ОК.");
                        return;
                    }
                    const controlsMaybe = await Promise.resolve(
                        reader.decodeFromVideoElement(video, (result, _error, controls) => {
                            if (controls && !scannerZxingControlsRef.current) scannerZxingControlsRef.current = controls;
                            const value =
                                typeof (result as { getText?: unknown })?.getText === "function"
                                    ? String((result as { getText: () => string }).getText()).trim()
                                    : String((result as { text?: unknown })?.text ?? "").trim();
                            if (!value) return;
                            setScannerDetected(value);
                            setParcelCode(value);
                            stopParcelScanner();
                            void handleLookupParcel(value);
                        }),
                    );
                    if (controlsMaybe) scannerZxingControlsRef.current = controlsMaybe;
                } catch {
                    setScannerError("Автосканер недоступен на этом устройстве. Введите ШК вручную и нажмите ОК.");
                }
                return;
            }
            const detector = new detectorCtor({ formats: ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"] });
            const tick = async () => {
                if (!scannerStreamRef.current) return;
                try {
                    const codes = await detector.detect(video);
                    const raw = String(codes?.[0]?.rawValue ?? "").trim();
                    if (raw) {
                        setScannerDetected(raw);
                        setParcelCode(raw);
                        stopParcelScanner();
                        void handleLookupParcel(raw);
                        return;
                    }
                } catch {
                    // ignore and continue polling
                }
                scannerRafRef.current = window.requestAnimationFrame(() => {
                    void tick();
                });
            };
            scannerRafRef.current = window.requestAnimationFrame(() => {
                void tick();
            });
        } catch (e: unknown) {
            setScannerError((e as Error)?.message || "Не удалось открыть камеру");
            stopParcelScanner();
        }
    }, [handleLookupParcel, stopParcelScanner]);

    const handleDownloadParcelApp = useCallback(async () => {
        const n = normalizeWbPerevozkaHaulzDigits(String(parcelLookupResult?.perevozka ?? ""));
        if (!n) {
            setParcelLookupError("В ответе не найден номер перевозки для АПП");
            return;
        }
        if (!activeAccount?.login || !activeAccount?.password) {
            setParcelLookupError("Требуется авторизация для скачивания АПП");
            return;
        }
        setParcelAppLoading(true);
        setParcelLookupError(null);
        try {
            const requestBody: Record<string, unknown> = {
                login: activeAccount.login,
                password: activeAccount.password,
                metod: DOCUMENT_METHODS["АПП"] ?? "АПП",
                number: n,
                ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
            };
            const requestUrl = typeof window !== "undefined" && window.location?.origin
                ? `${window.location.origin}${PROXY_API_DOWNLOAD_URL}`
                : PROXY_API_DOWNLOAD_URL;
            const res = await fetch(requestUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });
            const data = await res.json().catch(() => ({} as Record<string, unknown>));
            if (!res.ok) throw new Error((data?.message as string) || (data?.error as string) || "Не удалось получить АПП");
            if (!data?.data) throw new Error("Документ АПП не найден");
            await downloadBase64File({
                data: String(data.data),
                name: String((data as { name?: unknown }).name ?? `АПП_${n}.pdf`),
                isHtml: Boolean((data as { isHtml?: unknown }).isHtml),
            });
        } catch (e: unknown) {
            setParcelLookupError((e as Error)?.message || "Ошибка скачивания АПП");
        } finally {
            setParcelAppLoading(false);
        }
    }, [activeAccount?.isRegisteredUser, activeAccount?.login, activeAccount?.password, parcelLookupResult?.perevozka]);

    useEffect(() => {
        return () => {
            stopParcelScanner();
        };
    }, [stopParcelScanner]);

    const canDownloadApp = normalizeWbPerevozkaHaulzDigits(String(parcelLookupResult?.perevozka ?? "")) !== "";

    return (
        <div
            className="w-full"
            style={{
                maxHeight: "calc(100vh - 120px)",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                paddingBottom: "1rem",
            }}
        >
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Сканер посылки</Typography.Headline>
            </Flex>
            <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.65rem" }}>
                    Введите ШК посылки или откройте камеру для сканирования. После ввода нажмите «ОК».
                </Typography.Body>
                <Flex gap="0.5rem" wrap="wrap" align="center" className="parcel-scanner-row">
                    <Input
                        className="admin-form-input"
                        placeholder="Например: GA0101000178704"
                        value={parcelCode}
                        onChange={(e) => setParcelCode(e.target.value)}
                        style={{ minWidth: 260, flex: "1 1 320px" }}
                    />
                    <Button
                        type="button"
                        className="button-primary"
                        onClick={() => void handleLookupParcel()}
                        disabled={parcelLookupLoading}
                        style={{ minWidth: 90 }}
                    >
                        {parcelLookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "ОК"}
                    </Button>
                    <Button
                        type="button"
                        className="filter-button"
                        onClick={() => void startParcelScanner()}
                        disabled={scannerOpen}
                        style={{ minWidth: 170 }}
                    >
                        <Camera className="w-4 h-4" style={{ marginRight: "0.25rem" }} />
                        Сканировать
                    </Button>
                </Flex>
                {scannerDetected ? (
                    <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                        Распознано: <strong style={{ color: "var(--color-text-primary)" }}>{scannerDetected}</strong>
                    </Typography.Body>
                ) : null}
                {parcelLookupError ? (
                    <Typography.Body style={{ marginTop: "0.5rem", color: "var(--color-error)", fontSize: "0.84rem" }}>
                        {parcelLookupError}
                    </Typography.Body>
                ) : null}
            </Panel>

            {parcelLookupResult ? (
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Flex gap="0.75rem" wrap="wrap" align="center" justify="space-between" style={{ marginBottom: "0.7rem" }}>
                        <Typography.Body style={{ fontWeight: 700 }}>
                            Статус: {parcelLookupResult.lastStatus || "—"}
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.86rem", color: "var(--color-text-secondary)" }}>
                            Перевозка HAULZ: <strong style={{ color: "var(--color-text-primary)" }}>{parcelLookupResult.perevozka || "—"}</strong>
                        </Typography.Body>
                    </Flex>
                    <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: parcelLookupResult.posilkaSteps.length > 0 ? "0.75rem" : 0 }}>
                        <Button
                            type="button"
                            className="filter-button"
                            onClick={() => void handleLookupParcel(parcelCode)}
                            disabled={parcelLookupLoading}
                        >
                            <ScanLine className="w-4 h-4" style={{ marginRight: "0.25rem" }} />
                            Обновить статус
                        </Button>
                        {canDownloadApp ? (
                            <Button
                                type="button"
                                className="button-primary"
                                onClick={() => void handleDownloadParcelApp()}
                                disabled={parcelAppLoading}
                            >
                                {parcelAppLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                                <span style={{ marginLeft: "0.35rem" }}>АПП</span>
                            </Button>
                        ) : null}
                    </Flex>
                    {parcelLookupResult.posilkaSteps.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            {parcelLookupResult.posilkaSteps.map((step, idx) => (
                                <Typography.Body key={`${step.title}-${step.date}-${idx}`} style={{ fontSize: "0.82rem", margin: 0 }}>
                                    {idx + 1}. {step.title || "—"}
                                    {step.date ? ` — ${step.date}` : ""}
                                </Typography.Body>
                            ))}
                        </div>
                    ) : (
                        <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", margin: 0 }}>
                            Шаги по посылке не найдены.
                        </Typography.Body>
                    )}
                </Panel>
            ) : null}

            {scannerOpen ? (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.55)",
                        zIndex: 1000,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1rem",
                    }}
                    onClick={() => stopParcelScanner()}
                >
                    <div
                        style={{
                            width: "min(92vw, 420px)",
                            background: "var(--color-bg-card)",
                            borderRadius: 12,
                            border: "1px solid var(--color-border)",
                            padding: "0.85rem",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Flex align="center" justify="space-between" style={{ marginBottom: "0.55rem" }}>
                            <Typography.Body style={{ fontWeight: 700, margin: 0 }}>Сканирование ШК</Typography.Body>
                            <Button type="button" className="filter-button" onClick={() => stopParcelScanner()} style={{ padding: "0.3rem 0.45rem" }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </Flex>
                        <video
                            ref={scannerVideoRef}
                            autoPlay
                            playsInline
                            muted
                            style={{
                                width: "100%",
                                borderRadius: 8,
                                border: "1px solid var(--color-border)",
                                background: "#000",
                                maxHeight: "55vh",
                            }}
                        />
                        <Typography.Body style={{ marginTop: "0.45rem", fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
                            Наведите камеру на штрихкод посылки. При распознавании запрос отправится автоматически.
                        </Typography.Body>
                        {scannerError ? (
                            <Typography.Body style={{ marginTop: "0.35rem", color: "var(--color-error)", fontSize: "0.78rem" }}>
                                {scannerError}
                            </Typography.Body>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
