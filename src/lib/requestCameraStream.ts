/** Запрос видеопотока с камеры с понятными сообщениями об ошибках (Web + Capacitor WebView). */
export async function requestCameraStream(): Promise<MediaStream> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Камера не поддерживается на этом устройстве");
    }
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
        });
    } catch (e: unknown) {
        const err = e as DOMException;
        const name = err?.name ?? "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            throw new Error(
                "Нет доступа к камере. Разрешите использование камеры в настройках приложения или браузера и попробуйте снова.",
            );
        }
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
            throw new Error("Камера не найдена на этом устройстве.");
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
            throw new Error("Камера занята другим приложением. Закройте его и попробуйте снова.");
        }
        if (name === "OverconstrainedError") {
            try {
                return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (retryErr: unknown) {
                const retry = retryErr as DOMException;
                if (retry?.name === "NotAllowedError" || retry?.name === "PermissionDeniedError") {
                    throw new Error(
                        "Нет доступа к камере. Разрешите использование камеры в настройках приложения или браузера и попробуйте снова.",
                    );
                }
            }
        }
        throw new Error(err?.message || "Не удалось открыть камеру");
    }
}
