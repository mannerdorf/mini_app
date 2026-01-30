/** Определение, запущено ли приложение в MAX (не Telegram) */
export function isMaxWebApp(): boolean {
    if (typeof window === "undefined") return false;
    const ua = window.navigator?.userAgent || "";
    return Boolean(
        (window as any).WebApp && !window.Telegram?.WebApp ||
        /max[^a-z0-9]?app/i.test(ua) ||
        /\bmax\b/i.test(ua)
    );
}

/** WebApp API: Telegram.WebApp или window.WebApp (MAX Bridge). При MAX и пустом initData парсит hash #WebAppData=... */
export function getWebApp(): any {
    if (typeof window === "undefined") return undefined;

    const webApp = window.Telegram?.WebApp || (window as any).WebApp;

    if (webApp && !webApp.initData && isMaxWebApp()) {
        try {
            const hash = window.location.hash || "";
            if (hash.includes("WebAppData=")) {
                const rawData = hash.split("WebAppData=")[1]?.split("&")[0];
                if (rawData) {
                    const decoded = decodeURIComponent(rawData);
                    webApp.initData = decoded;
                    const params = new URLSearchParams(decoded);
                    const unsafe: any = {};
                    params.forEach((val, key) => {
                        if (key === "user" || key === "chat") {
                            try { unsafe[key] = JSON.parse(val); } catch (e) {}
                        } else {
                            unsafe[key] = val;
                        }
                    });
                    webApp.initDataUnsafe = unsafe;
                    console.log("[getWebApp] Manually parsed WebAppData from hash:", unsafe);
                }
            }
        } catch (e) {
            console.error("[getWebApp] Error parsing MAX hash:", e);
        }
    }

    return webApp;
}

/** Включён ли режим документов через query maxdocs */
export function isMaxDocsEnabled(): boolean {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("maxdocs");
}
