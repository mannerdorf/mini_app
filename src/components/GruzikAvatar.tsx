import React, { useState, useRef, useEffect } from "react";

/** Эмоции Грузика: под каждую можно положить gruzik-{emotion}.gif / .webm / .png в public */
export type GruzikEmotion = "default" | "typing" | "thinking" | "happy" | "sad" | "error" | "wave" | "ok" | string;

/** Аватар Грузика: приоритет GIF, затем WebM, затем PNG (или JPG). Для анимации нужен файл gruzik.gif или gruzik.webm в public/ */
export function GruzikAvatar({
    size = 40,
    typing = false,
    emotion: emotionProp,
    className = "",
}: {
    size?: number;
    typing?: boolean;
    /** Эмоция/вариант анимации: default, typing, thinking, happy, sad, error, wave, ok или свой ключ — ищутся файлы /gruzik-{emotion}.gif */
    emotion?: GruzikEmotion;
    className?: string;
}) {
    const emotion = typing ? "typing" : (emotionProp ?? "default");
    const base = emotion === "default" ? "" : `-${emotion}`;
    const [source, setSource] = useState<"gif" | "webm" | "png" | "jpg">("gif");
    const [currentBase, setCurrentBase] = useState(base);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        setCurrentBase(base);
        setSource("gif");
    }, [base]);

    const gifSrc = `/gruzik${currentBase || ""}.gif`;
    const webmSrc = `/gruzik${currentBase || ""}.webm`;
    const pngSrc = `/gruzik${currentBase || ""}.png`;
    const defaultGif = "/gruzik.gif";
    const defaultWebm = "/gruzik.webm";
    const defaultPng = "/gruzik.png";
    const defaultJpg = "/gruzik.jpg";

    const onGifError = () => {
        if (currentBase) {
            setCurrentBase("");
        } else {
            setSource("webm");
        }
    };
    const onWebmError = () => {
        if (currentBase) {
            setCurrentBase("");
            setSource("webm");
        } else {
            setSource("png");
        }
    };
    const onPngError = () => {
        if (currentBase) {
            setCurrentBase("");
            setSource("png");
        } else {
            setSource("jpg");
        }
    };

    useEffect(() => {
        if (source !== "webm") return;
        const video = videoRef.current;
        if (!video) return;
        const play = () => {
            video.play().catch(() => setSource("png"));
        };
        play();
        video.addEventListener("loadeddata", play);
        video.addEventListener("canplay", play);
        return () => {
            video.removeEventListener("loadeddata", play);
            video.removeEventListener("canplay", play);
        };
    }, [source]);

    return (
        <div
            className={`gruzik-avatar ${typing ? "typing" : ""} ${className}`.trim()}
            style={{
                width: size,
                height: size,
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--color-bg-primary)",
            }}
            aria-hidden
        >
            {source === "png" || source === "jpg" ? (
                <img
                    src={source === "jpg" ? defaultJpg : currentBase ? pngSrc : defaultPng}
                    alt="Грузик"
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: "contain", display: "block" }}
                    title="Грузик"
                    onError={source === "jpg" ? undefined : onPngError}
                />
            ) : source === "webm" ? (
                <video
                    ref={videoRef}
                    src={currentBase ? webmSrc : defaultWebm}
                    autoPlay
                    loop
                    muted
                    playsInline
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: "contain", display: "block" }}
                    title="Грузик"
                    onError={onWebmError}
                />
            ) : (
                <img
                    key={currentBase || "default"}
                    src={currentBase ? gifSrc : defaultGif}
                    alt="Грузик"
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: "contain", display: "block" }}
                    title="Грузик"
                    onError={onGifError}
                />
            )}
        </div>
    );
}

/** По тексту ответа ассистента подбираем эмоцию Грузика (для анимации) */
export function deriveEmotionFromReply(text: string): GruzikEmotion {
    if (!text || typeof text !== "string") return "default";
    const t = text.toLowerCase();
    if (/\b(ошибка|не удалось|не получилось|проблема|к сожалению)\b/.test(t)) return "sad";
    if (/\b(готово|успешно|отлично|сделано|принято)\b/.test(t)) return "happy";
    if (/\b(думаю|сейчас проверю|ищу|подождите)\b/.test(t)) return "thinking";
    return "default";
}
