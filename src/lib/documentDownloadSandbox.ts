import { DOCUMENT_METHODS } from "../documentMethods";
import { downloadDocumentDirect, formatDateDocForDownloadApi } from "./downloadDocumentDirect";
import { createPdfPreviewFromBlob, type PdfPreviewState } from "./documentPreview";
import {
  fetchDocumentForPreview,
  fetchViaGetBinary,
  fetchViaPostJson,
  type FetchDocumentParams,
  type FetchDocumentResult,
} from "./fetchDocumentForPreview";
import { formatPerevozkaNumberForApi } from "./perevozkaNumber";
import { saveBlobFile } from "./saveBlobFile";
import { isCapacitorNative } from "./capacitorPlatform";
import type { AuthData } from "../types";

export const SANDBOX_DOC_TYPES = ["ЭР", "АПП", "СЧЕТ", "УПД", "Реестр"] as const;
export type SandboxDocType = (typeof SANDBOX_DOC_TYPES)[number];

export type SandboxFetchMode = "post_json" | "get_binary" | "production_default";

export type SandboxDocumentInputs = {
  cargoNumber: string;
  invoiceNumber: string;
  dateDoc: string;
  inn: string;
  /** Дополнять номер перевозки до 9 цифр для API. */
  formatCargoForApi: boolean;
  /** Для СЧЕТ: номер счёта вместо перевозки. */
  schetUseInvoiceNumber: boolean;
};

export type SandboxRunLog = {
  id: string;
  at: string;
  docType: SandboxDocType;
  variantLabel: string;
  ok: boolean;
  ms: number;
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  isHtml?: boolean;
  error?: string;
  request?: FetchDocumentParams;
};

export const DOWNLOAD_SANDBOX_VARIANTS = [
  { id: "post_pdfjs", label: "POST JSON → pdf.js", fetch: "post_json" as const, kind: "preview_pdfjs" as const },
  { id: "get_pdfjs", label: "GET binary → pdf.js", fetch: "get_binary" as const, kind: "preview_pdfjs" as const },
  { id: "post_save", label: "POST JSON → saveBlobFile", fetch: "post_json" as const, kind: "save_blob" as const },
  { id: "get_save", label: "GET binary → saveBlobFile", fetch: "get_binary" as const, kind: "save_blob" as const },
  { id: "post_tab", label: "POST JSON → blob URL (вкладка)", fetch: "post_json" as const, kind: "blob_tab" as const },
  { id: "get_tab", label: "GET binary → blob URL", fetch: "get_binary" as const, kind: "blob_tab" as const },
  { id: "post_iframe", label: "POST JSON → iframe", fetch: "post_json" as const, kind: "iframe" as const },
  { id: "get_iframe", label: "GET binary → iframe", fetch: "get_binary" as const, kind: "iframe" as const },
  { id: "direct", label: "downloadDocumentDirect (prod)", fetch: "production_default" as const, kind: "direct" as const },
  {
    id: "post_share",
    label: "POST JSON → Share (Capacitor)",
    fetch: "post_json" as const,
    kind: "share" as const,
    nativeOnly: true,
  },
  {
    id: "get_share",
    label: "GET binary → Share (Capacitor)",
    fetch: "get_binary" as const,
    kind: "share" as const,
    nativeOnly: true,
  },
  { id: "post_base64", label: "POST JSON → downloadBase64File", fetch: "post_json" as const, kind: "base64" as const },
] as const;

export type DownloadSandboxVariant = (typeof DOWNLOAD_SANDBOX_VARIANTS)[number];

export function resolveSandboxDocumentRequest(
  docType: SandboxDocType,
  inputs: SandboxDocumentInputs,
): FetchDocumentParams | { error: string } {
  const metod = DOCUMENT_METHODS[docType] ?? docType;
  const cargoRaw = inputs.cargoNumber.trim();
  const invoiceRaw = inputs.invoiceNumber.trim();
  const inn = inputs.inn.trim() || undefined;

  if (docType === "Реестр") {
    if (!invoiceRaw) return { error: "Укажите номер счёта для реестра" };
    const dateDoc = formatDateDocForDownloadApi(inputs.dateDoc);
    if (!dateDoc) return { error: "Укажите дату счёта (YYYY-MM-DD) для реестра" };
    return { metod, number: invoiceRaw, dateDoc, ...(inn ? { inn } : {}) };
  }

  if (docType === "СЧЕТ") {
    const numberRaw = inputs.schetUseInvoiceNumber ? invoiceRaw : cargoRaw;
    if (!numberRaw) {
      return {
        error: inputs.schetUseInvoiceNumber
          ? "Укажите номер счёта"
          : "Укажите номер перевозки (или включите «СЧЕТ по номеру счёта»)",
      };
    }
    const number = inputs.schetUseInvoiceNumber || !inputs.formatCargoForApi
      ? numberRaw
      : formatPerevozkaNumberForApi(numberRaw);
    return { metod, number, ...(inn ? { inn } : {}) };
  }

  if (!cargoRaw) return { error: "Укажите номер перевозки" };
  const number = inputs.formatCargoForApi ? formatPerevozkaNumberForApi(cargoRaw) : cargoRaw;
  return { metod, number, ...(inn ? { inn } : {}) };
}

async function fetchWithMode(
  auth: AuthData,
  params: FetchDocumentParams,
  mode: SandboxFetchMode,
): Promise<FetchDocumentResult> {
  if (mode === "post_json") return fetchViaPostJson(auth, params);
  if (mode === "get_binary") return fetchViaGetBinary(auth, params);
  return fetchDocumentForPreview(auth, params);
}

function formatLogResult(result: FetchDocumentResult): Pick<SandboxRunLog, "fileName" | "contentType" | "sizeBytes" | "isHtml"> {
  return {
    fileName: result.fileName,
    contentType: result.blob.type,
    sizeBytes: result.blob.size,
    isHtml: result.isHtml,
  };
}

export async function runDownloadSandboxVariant(
  auth: AuthData,
  docType: SandboxDocType,
  variant: DownloadSandboxVariant,
  inputs: SandboxDocumentInputs,
): Promise<{ log: SandboxRunLog; preview?: PdfPreviewState; iframeUrl?: string }> {
  const started = Date.now();
  const baseLog: Omit<SandboxRunLog, "ok" | "ms" | "error"> = {
    id: `${docType}-${variant.id}-${started}`,
    at: new Date().toISOString(),
    docType,
    variantLabel: variant.label,
  };

  const resolved = resolveSandboxDocumentRequest(docType, inputs);
  if ("error" in resolved) {
    return {
      log: {
        ...baseLog,
        ok: false,
        ms: Date.now() - started,
        error: resolved.error,
      },
    };
  }

  try {
    if (variant.kind === "direct") {
      await downloadDocumentDirect(auth, resolved);
      return {
        log: {
          ...baseLog,
          ok: true,
          ms: Date.now() - started,
          request: resolved,
        },
      };
    }

    const fetched = await fetchWithMode(auth, resolved, variant.fetch);

    if (variant.kind === "preview_pdfjs") {
      if (fetched.isHtml) {
        throw new Error("HTML-документ — pdf.js не подходит, попробуйте iframe или base64");
      }
      const preview = await createPdfPreviewFromBlob(fetched.blob, fetched.fileName);
      return {
        log: {
          ...baseLog,
          ok: true,
          ms: Date.now() - started,
          request: resolved,
          ...formatLogResult(fetched),
        },
        preview,
      };
    }

    if (variant.kind === "save_blob" || variant.kind === "share") {
      if (variant.kind === "share" && !isCapacitorNative()) {
        throw new Error("Share доступен только в native-приложении");
      }
      await saveBlobFile(fetched.blob, fetched.fileName);
      return {
        log: {
          ...baseLog,
          ok: true,
          ms: Date.now() - started,
          request: resolved,
          ...formatLogResult(fetched),
        },
      };
    }

    if (variant.kind === "blob_tab") {
      const url = URL.createObjectURL(fetched.blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        URL.revokeObjectURL(url);
        throw new Error("Не удалось открыть вкладку (popup blocked?)");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return {
        log: {
          ...baseLog,
          ok: true,
          ms: Date.now() - started,
          request: resolved,
          ...formatLogResult(fetched),
        },
      };
    }

    if (variant.kind === "iframe") {
      const url = URL.createObjectURL(fetched.blob);
      return {
        log: {
          ...baseLog,
          ok: true,
          ms: Date.now() - started,
          request: resolved,
          ...formatLogResult(fetched),
        },
        iframeUrl: url,
      };
    }

    if (variant.kind === "base64") {
      const { downloadBase64File } = await import("../utils");
      const buffer = await fetched.blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      await downloadBase64File({
        data: btoa(binary),
        name: fetched.fileName,
        isHtml: fetched.isHtml,
      });
      return {
        log: {
          ...baseLog,
          ok: true,
          ms: Date.now() - started,
          request: resolved,
          ...formatLogResult(fetched),
        },
      };
    }

    throw new Error("Неизвестный вариант");
  } catch (e: unknown) {
    return {
      log: {
        ...baseLog,
        ok: false,
        ms: Date.now() - started,
        request: resolved,
        error: (e as Error)?.message || "Ошибка",
      },
    };
  }
}

export const DOWNLOAD_SANDBOX_STORAGE_KEY = "haulz.downloadSandbox.inputs";

export function loadSandboxInputs(): SandboxDocumentInputs {
  const defaults: SandboxDocumentInputs = {
    cargoNumber: "",
    invoiceNumber: "",
    dateDoc: "",
    inn: "",
    formatCargoForApi: true,
    schetUseInvoiceNumber: false,
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(DOWNLOAD_SANDBOX_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SandboxDocumentInputs>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveSandboxInputs(inputs: SandboxDocumentInputs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOWNLOAD_SANDBOX_STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    /* ignore */
  }
}
