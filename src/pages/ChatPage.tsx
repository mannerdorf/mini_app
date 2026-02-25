import React, { useState, useRef, useEffect, useCallback } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { ArrowUp } from "lucide-react";
import { Button, Input, Panel, Typography } from "@maxhub/max-ui";
import type { AuthData, CargoItem } from "../types";
import { GruzikAvatar, deriveEmotionFromReply, type GruzikEmotion } from "../components/GruzikAvatar";
import { cityToCode } from "../lib/formatUtils";
import { normalizeStatus, getFilterKeyByStatus, getPaymentFilterKey } from "../lib/statusUtils";
import { isFerry } from "../lib/cargoUtils";
export function ChatPage({ 
    prefillMessage, 
    onClearPrefill,
    auth,
    cargoItems,
    sessionOverride,
    userIdOverride,
    customerOverride,
    onOpenCargo,
    clearChatRef,
    onChatCustomerState
}: { 
    prefillMessage?: string; 
    onClearPrefill?: () => void;
    auth?: AuthData;
    cargoItems?: CargoItem[];
    sessionOverride?: string;
    userIdOverride?: string;
    customerOverride?: string;
    onOpenCargo?: (cargoNumber: string) => void;
    /** ref для вызова очистки чата из родителя (кнопка «Очистить чат») */
    clearChatRef?: React.MutableRefObject<(() => void) | null>;
    /** вызывается при смене заказчика/отвязке в чате — для отображения в шапке */
    onChatCustomerState?: (state: { customer: string | null; unlinked: boolean }) => void;
}) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; emotion?: GruzikEmotion }[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [isTyping, setIsReady] = useState(false);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [sessionId, setSessionId] = useState<string>(() => {
        if (sessionOverride) return sessionOverride;
        if (typeof window === "undefined") return "server";
        const key = "haulz.chat.sessionId";
        const existing = window.localStorage.getItem(key);
        if (existing) return existing;
        const sid =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        window.localStorage.setItem(key, sid);
        return sid;
    });
    const [sessionUnlinked, setSessionUnlinked] = useState(false);
    /** Отладка на экране: последний статус ответа API и текст ошибки */
    const [chatStatus, setChatStatus] = useState<{ status?: number; error?: string } | null>(null);
    /** Отдельная строка: какие запросы по API выполнялись (перевозки, чат) */
    const [apiRequestInfo, setApiRequestInfo] = useState<{ context?: string; chat?: string } | null>(null);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // После отвязки в чате не отправляем заказчика, пока пользователь снова не выберет компанию
    useEffect(() => {
        if (customerOverride) setSessionUnlinked(false);
    }, [customerOverride]);

    const effectiveCustomer = sessionUnlinked ? null : customerOverride ?? null;
    useEffect(() => {
        onChatCustomerState?.({ customer: effectiveCustomer ?? null, unlinked: sessionUnlinked });
    }, [effectiveCustomer, sessionUnlinked, onChatCustomerState]);
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<Blob[]>([]);
    const streamRef = React.useRef<MediaStream | null>(null);
    const ffmpegRef = React.useRef<FFmpeg | null>(null);
    const ffmpegLoadingRef = React.useRef<Promise<FFmpeg> | null>(null);

    const renderLineWithLinks = (line: string) => {
        const parts: React.ReactNode[] = [];
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const cargoRegex = /№\s*\d{4,}|\b\d{6,}\b/g;
        const combined = new RegExp(`${urlRegex.source}|${cargoRegex.source}`, "g");
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        let keyIndex = 0;
        const openChatLink = (url: string) => {
            const webApp = (window as any)?.Telegram?.WebApp || (window as any)?.MaxWebApp;
            if (webApp && typeof webApp.openLink === "function") {
                webApp.openLink(url);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
        };

        while ((match = combined.exec(line)) !== null) {
            const start = match.index;
            const rawValue = match[0];
            if (start > lastIndex) {
                parts.push(line.slice(lastIndex, start));
            }

            if (rawValue.startsWith("http")) {
                parts.push(
                    <button
                        key={`url-${keyIndex}`}
                        type="button"
                        onClick={() => openChatLink(rawValue)}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "inherit",
                            textDecoration: "underline",
                            font: "inherit",
                            textAlign: "left"
                        }}
                    >
                        {rawValue}
                    </button>
                );
            } else if (onOpenCargo) {
                const cargoNumber = rawValue.replace(/\D+/g, "");
                parts.push(
                    <button
                        key={`cargo-${keyIndex}`}
                        type="button"
                        onClick={() => onOpenCargo(cargoNumber)}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "inherit",
                            textDecoration: "underline",
                            font: "inherit"
                        }}
                    >
                        {rawValue}
                    </button>
                );
            } else {
                parts.push(rawValue);
            }

            lastIndex = start + rawValue.length;
            keyIndex += 1;
        }

        if (lastIndex < line.length) {
            parts.push(line.slice(lastIndex));
        }

        return parts;
    };

    const renderMessageContent = (text: string) => {
        const blocks = String(text || "").split(/\n{2,}/).filter(Boolean);
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {blocks.map((block, blockIndex) => {
                    const lines = block.split(/\n/).filter(Boolean);
                    const isBulleted = lines.length > 0 && lines.every(line => /^[-•]\s+/.test(line));
                    const isNumbered = lines.length > 0 && lines.every(line => /^\d+[.)]\s+/.test(line));

                    if (isBulleted) {
                        return (
                            <ul key={blockIndex} style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc' }}>
                                {lines.map((line, lineIndex) => (
                                    <li key={lineIndex}>
                                        <Typography.Body style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0 }}>
                                            {renderLineWithLinks(line.replace(/^[-•]\s+/, ""))}
                                        </Typography.Body>
                                    </li>
                                ))}
                            </ul>
                        );
                    }

                    if (isNumbered) {
                        return (
                            <ol key={blockIndex} style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                {lines.map((line, lineIndex) => (
                                    <li key={lineIndex}>
                                        <Typography.Body style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0 }}>
                                            {renderLineWithLinks(line.replace(/^\d+[.)]\s+/, ""))}
                                        </Typography.Body>
                                    </li>
                                ))}
                            </ol>
                        );
                    }

                    return (
                        <Typography.Body
                            key={blockIndex}
                            style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0, whiteSpace: 'pre-wrap' }}
                        >
                            {renderLineWithLinks(block)}
                        </Typography.Body>
                    );
                })}
            </div>
        );
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    };

    const loadFfmpeg = async () => {
        if (ffmpegRef.current) return ffmpegRef.current;
        if (!ffmpegLoadingRef.current) {
            const ffmpeg = new FFmpeg();
            const baseUrl = "https://unpkg.com/@ffmpeg/core@0.12.6/dist";
            ffmpegLoadingRef.current = (async () => {
                await ffmpeg.load({
                    coreURL: `${baseUrl}/ffmpeg-core.js`,
                    wasmURL: `${baseUrl}/ffmpeg-core.wasm`,
                    workerURL: `${baseUrl}/ffmpeg-core.worker.js`
                });
                ffmpegRef.current = ffmpeg;
                return ffmpeg;
            })();
        }
        return ffmpegLoadingRef.current;
    };

    const convertAacToMp4 = async (inputBlob: Blob) => {
        const ffmpeg = await loadFfmpeg();
        const inputName = "input.aac";
        const outputName = "output.mp4";
        try {
            await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));
            await ffmpeg.exec(["-i", inputName, "-c:a", "aac", "-b:a", "128k", outputName]);
            const data = await ffmpeg.readFile(outputName);
            return new Blob([data], { type: "audio/mp4" });
        } finally {
            try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
            try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
        }
    };

    const encodeWav = (audioBuffer: AudioBuffer) => {
        const channelCount = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        const buffer = new ArrayBuffer(44 + length * 2 * channelCount);
        const view = new DataView(buffer);
        let offset = 0;

        const writeString = (s: string) => {
            for (let i = 0; i < s.length; i += 1) {
                view.setUint8(offset++, s.charCodeAt(i));
            }
        };

        writeString("RIFF");
        view.setUint32(offset, 36 + length * 2 * channelCount, true); offset += 4;
        writeString("WAVE");
        writeString("fmt ");
        view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
        view.setUint16(offset, 1, true); offset += 2; // PCM format
        view.setUint16(offset, channelCount, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, sampleRate * channelCount * 2, true); offset += 4;
        view.setUint16(offset, channelCount * 2, true); offset += 2;
        view.setUint16(offset, 16, true); offset += 2;
        writeString("data");
        view.setUint32(offset, length * 2 * channelCount, true); offset += 4;

        for (let i = 0; i < length; i += 1) {
            for (let ch = 0; ch < channelCount; ch += 1) {
                const sample = audioBuffer.getChannelData(ch)[i];
                const clamped = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: "audio/wav" });
    };

    const convertAacToWav = async (blob: Blob) => {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            return encodeWav(audioBuffer);
        } finally {
            audioContext.close().catch(() => {});
        }
    };

    const getAudioFileName = (mimeType: string) => {
        if (mimeType.includes("webm")) return "voice.webm";
        if (mimeType.includes("ogg")) return "voice.ogg";
        if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "voice.mp3";
        if (mimeType.includes("wav")) return "voice.wav";
        if (mimeType.includes("mp4")) return "voice.mp4";
        if (mimeType.includes("m4a")) return "voice.m4a";
        return "voice.webm";
    };

    const transcribeAndSend = async (blob: Blob) => {
        setIsTranscribing(true);
        try {
            if (!blob || blob.size < 256) {
                throw new Error("Запись слишком короткая");
            }
            const rawType = blob.type || recorderRef.current?.mimeType || "audio/webm";
            let baseType = rawType.split(";")[0];
            if (baseType === "audio/aac" || baseType === "audio/x-aac") {
                // iOS can return raw AAC (ADTS). Convert to MP4 (AAC) via ffmpeg.wasm.
                try {
                    blob = await convertAacToMp4(blob);
                    baseType = "audio/mp4";
                } catch (err) {
                    // Fallback to WAV if ffmpeg fails to load or convert.
                    blob = await convertAacToWav(blob);
                    baseType = "audio/wav";
                }
            }
            const fileName = getAudioFileName(baseType);
            const file = new File([blob], fileName, { type: baseType });
            const formData = new FormData();
            formData.append("audio", file);

            const res = await fetch("/api/transcribe", {
                method: "POST",
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || `Ошибка ${res.status}`);
            }
            const text = String(data?.text || "").trim();
            if (text) {
                await handleSend(text);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "Не удалось распознать речь." }]);
            }
        } catch (e: any) {
            const msg = e?.message || "Не удалось распознать речь";
            setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка распознавания: ${msg}` }]);
        } finally {
            setIsTranscribing(false);
        }
    };

    const startRecording = async () => {
        if (isRecording || isTranscribing) return;
        if (typeof MediaRecorder === "undefined") {
            setMessages(prev => [...prev, { role: 'assistant', content: "Запись голоса не поддерживается в этом браузере." }]);
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const preferredTypes = [
                "audio/webm;codecs=opus",
                "audio/ogg;codecs=opus",
                "audio/webm",
                "audio/ogg",
                "audio/mp4",
                "audio/mpeg"
            ];
            const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            chunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
                stopStream();
                await transcribeAndSend(blob);
            };

            recorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
        } catch (e) {
            stopStream();
            setMessages(prev => [...prev, { role: 'assistant', content: "Не удалось получить доступ к микрофону." }]);
        }
    };

    const stopRecording = () => {
        if (!recorderRef.current) return;
        recorderRef.current.stop();
        recorderRef.current = null;
        setIsRecording(false);
    };

    useEffect(() => {
        return () => {
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                try { recorderRef.current.stop(); } catch { /* ignore */ }
            }
            stopStream();
        };
    }, []);

    useEffect(() => {
        if (!sessionOverride) return;
        setSessionId(sessionOverride);
        setMessages([]);
        setInputValue("");
        setHasLoadedHistory(false);
    }, [sessionOverride]);

    useEffect(() => {
        let isActive = true;
        const loadHistory = async () => {
            if (!sessionId) return;
            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, action: "history" })
                });
                if (!res.ok) return;
                const data = await res.json().catch(() => ({}));
                if (!isActive) return;
                if (Array.isArray(data?.history)) {
                    setMessages(
                        data.history
                            .filter((item: any) => item?.role === "user" || item?.role === "assistant")
                            .map((item: any) => ({ role: item.role, content: String(item.content || ""), emotion: item.emotion }))
                    );
                }
            } finally {
                if (isActive) setHasLoadedHistory(true);
            }
        };

        loadHistory();
        return () => {
            isActive = false;
        };
    }, [sessionId]);

    // Начальное приветствие
    useEffect(() => {
        if (hasLoadedHistory && messages.length === 0) {
            setMessages([
                { role: 'assistant', content: "Здравствуйте! Меня зовут Грузик, я AI-помощник HAULZ. Как я могу вам помочь?" }
            ]);
        }
    }, [hasLoadedHistory, messages.length]);

    const clearChat = useCallback(async () => {
        try {
            await fetch('/api/chat-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
        } catch {
            // ignore
        }
        setMessages([]);
    }, [sessionId]);

    useEffect(() => {
        if (clearChatRef) clearChatRef.current = clearChat;
        return () => { if (clearChatRef) clearChatRef.current = null; };
    }, [clearChatRef, clearChat]);

    // Автоматическая прокрутка вниз
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // Обработка предзаполненного сообщения
    useEffect(() => {
        if (prefillMessage && prefillMessage.trim()) {
            handleSend(prefillMessage);
            if (onClearPrefill) onClearPrefill();
        }
    }, [prefillMessage]);

    const handleSend = async (text: string) => {
        const messageText = text || inputValue.trim();
        if (!messageText || isTyping) return;

        const newMessages = [...messages, { role: 'user' as const, content: messageText }];
        setMessages(newMessages);
        setInputValue("");
        setIsReady(true);
        setChatStatus(null);
        setApiRequestInfo(null);

        let fetchedCargo: CargoItem[] = [];
        let contextApiLabel = '';
        try {
            if (auth?.login && auth?.password) {
                const now = new Date();
                const today = now.toISOString().split("T")[0];
                const t = (messageText || '').toLowerCase();
                let dateFrom = today;
                let dateTo = today;
                if (/\b(недел|за неделю|на неделю)\b/.test(t)) {
                    const from = new Date(now);
                    from.setDate(from.getDate() - 7);
                    dateFrom = from.toISOString().split('T')[0];
                } else if (/\b(месяц|за месяц|на месяц)\b/.test(t)) {
                    const from = new Date(now);
                    from.setDate(from.getDate() - 30);
                    dateFrom = from.toISOString().split('T')[0];
                }
                const perevozkiRes = await fetch('/api/perevozki', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        login: auth.login,
                        password: auth.password,
                        dateFrom,
                        dateTo,
                        ...(customerOverride ? { customer: customerOverride } : {}),
                        ...(auth.inn ? { inn: auth.inn } : {}),
                    }),
                });
                if (perevozkiRes.ok) {
                    const data = await perevozkiRes.json().catch(() => ({}));
                    const list = Array.isArray(data) ? data : (data?.items ?? []);
                    const count = Array.isArray(list) ? list.length : 0;
                    contextApiLabel = `POST /api/perevozki (${count} перевозок)`;
                    fetchedCargo = (list as any[]).slice(0, 30).map((i: any) => ({
                        Number: i.Number,
                        DatePrih: i.DatePrih,
                        DateVr: i.DateVr,
                        State: i.State,
                        StateBill: i.StateBill,
                        Mest: i.Mest,
                        PW: i.PW,
                        Sum: i.Sum,
                        Sender: i.Sender,
                        Receiver: i.Receiver,
                        Customer: i.Customer ?? i.customer,
                    }));
                } else {
                    contextApiLabel = `POST /api/perevozki (код ${perevozkiRes.status})`;
                }
            } else {
                contextApiLabel = 'POST /api/perevozki не вызывался (нет авторизации)';
            }
        } catch {
            contextApiLabel = 'POST /api/perevozki (ошибка или таймаут)';
        }
        setApiRequestInfo(prev => ({ ...prev, context: contextApiLabel || undefined }));

        const cargoForContext = fetchedCargo.length > 0 ? fetchedCargo : (cargoItems ?? []);
        const recentCargoList = cargoForContext.slice(0, 35).map(i => {
            const from = cityToCode(i.CitySender);
            const to = cityToCode(i.CityReceiver);
            const route = from === 'MSK' && to === 'KGD' ? 'MSK-KGD' : from === 'KGD' && to === 'MSK' ? 'KGD-MSK' : 'other';
            return {
                number: i.Number,
                status: normalizeStatus(i.State),
                statusKey: getFilterKeyByStatus(i.State),
                datePrih: i.DatePrih,
                dateVr: i.DateVr,
                stateBill: i.StateBill,
                paymentKey: getPaymentFilterKey(i.StateBill),
                sum: i.Sum,
                sender: i.Sender,
                receiver: i.Receiver ?? (i as any).receiver,
                customer: i.Customer ?? (i as any).customer,
                type: isFerry(i) ? 'ferry' : 'auto',
                route,
            };
        });

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const todayLabel = now.toLocaleDateString('ru-RU');
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekStartStr = weekAgo.toISOString().split('T')[0];
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        const monthStartStr = monthAgo.toISOString().split('T')[0];
        // Подготавливаем контекст: данные перевозок из API или переданный cargoItems
        const context = {
            userLogin: auth?.login,
            customer: customerOverride,
            todayDate: todayStr,
            todayLabel,
            weekStartDate: weekStartStr,
            weekEndDate: todayStr,
            monthStartDate: monthStartStr,
            monthEndDate: todayStr,
            activeCargoCount: cargoForContext.length,
            cargoList: recentCargoList,
        };

        const CHAT_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('haulz.chatDebug') === '1';

        try {
            if (CHAT_DEBUG) console.log('[chat] send start', { sessionId, messageLen: messageText.length });
            const effectiveCustomer = sessionUnlinked ? null : customerOverride;
            let preloadedCargo: unknown = undefined;
            if (typeof window !== "undefined") {
                try {
                    const stored = window.sessionStorage.getItem("haulz.chat.cargoPreload");
                    if (stored) {
                        preloadedCargo = JSON.parse(stored);
                        window.sessionStorage.removeItem("haulz.chat.cargoPreload");
                    }
                } catch (_) {}
            }
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sessionId,
                    userId: userIdOverride || auth?.login,
                    message: messageText,
                    context: { ...context, customer: effectiveCustomer },
                    customer: effectiveCustomer,
                    ...(preloadedCargo != null ? { preloadedCargo } : {}),
                    auth: auth?.login && auth?.password ? { login: auth.login, password: auth.password, ...(auth.inn ? { inn: auth.inn } : {}), ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}) } : undefined
                }),
            });
            const data = await res.json().catch((parseErr) => {
                if (CHAT_DEBUG) console.warn('[chat] response json parse failed', parseErr);
                return {};
            });
            if (CHAT_DEBUG) console.log('[chat] response', { status: res.status, ok: res.ok, hasReply: !!data?.reply, replyLen: data?.reply?.length });
            if (!res.ok) {
                const msg = data?.reply || data?.error || data?.message || `Код ${res.status}`;
                setChatStatus({ status: res.status, error: msg });
                setApiRequestInfo(prev => ({ ...prev, chat: `POST /api/chat (${res.status})` }));
                throw new Error(msg);
            }
            setChatStatus({ status: 200 });
            setApiRequestInfo(prev => ({ ...prev, chat: 'POST /api/chat (200)' }));
            if (data?.unlinked === true) {
                setSessionUnlinked(true);
            }
            if (!sessionOverride && data?.sessionId && typeof data.sessionId === "string" && data.sessionId !== sessionId) {
                setSessionId(data.sessionId);
                if (typeof window !== "undefined") {
                    window.localStorage.setItem("haulz.chat.sessionId", data.sessionId);
                }
            }
            const replyText = typeof data?.reply === "string" ? data.reply : "";
            const emotion = typeof data?.emotion === "string" ? data.emotion : deriveEmotionFromReply(replyText);
            setMessages(prev => [...prev, { role: 'assistant', content: replyText || "(Нет ответа от сервера. Попробуйте ещё раз.)", emotion }]);
        } catch (e: any) {
            const isAbort = e?.name === 'AbortError';
            const msg = isAbort ? 'Ответ занял слишком много времени. Попробуйте ещё раз.' : (e?.message || 'Не удалось получить ответ');
            setChatStatus({ error: msg });
            setApiRequestInfo(prev => ({ ...prev, chat: 'POST /api/chat (ошибка)' }));
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `Ошибка: ${msg}`,
                emotion: 'error'
            }]);
        } finally {
            setIsReady(false);
        }
    };

    return (
        <div className="chat-shell" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
            {/* Окно сообщений — скролл сверху вниз */}
            <div 
                ref={scrollRef}
                className="chat-messages"
                style={{ 
                    flex: 1, 
                    minHeight: 0,
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    padding: '1rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1rem',
                    scrollBehavior: 'smooth' 
                }}
            >
                {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '0.5rem' }}>
                        {msg.role === 'assistant' && <GruzikAvatar size={40} emotion={msg.emotion} />}
                        <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`} style={{ 
                            maxWidth: '85%', 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            backgroundColor: msg.role === 'user' ? 'var(--color-theme-primary)' : 'var(--color-panel-secondary)',
                            color: msg.role === 'user' ? '#fff' : 'inherit',
                            borderBottomRightRadius: msg.role === 'user' ? '0' : '1rem',
                            borderBottomLeftRadius: msg.role === 'user' ? '1rem' : '0',
                            border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)'
                        }}>
                            {renderMessageContent(msg.content)}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: '0.5rem' }}>
                        <GruzikAvatar size={52} typing />
                        <div className="chat-bubble chat-bubble-assistant" style={{ 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            backgroundColor: 'var(--color-panel-secondary)',
                            border: '1px solid var(--color-border)',
                            borderBottomLeftRadius: '0',
                            maxWidth: '85%'
                        }}>
                            <span className="chat-typing-text">печатает</span>
                            <span className="chat-typing-dots">
                                <span>.</span><span>.</span><span>.</span>
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Поле ввода — прижато к низу, без линии сверху */}
            <div className="chat-input-bar" style={{ padding: '0.75rem', background: 'var(--color-bg-primary)', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
                    style={{ display: 'flex', gap: '0.5rem', height: '44px', width: '100%', minWidth: 0 }}
                >
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(inputValue);
                            }
                        }}
                        placeholder="Напишите ваш вопрос..."
                        className="chat-input"
                        style={{ flex: 1, minWidth: 0, height: '44px' }}
                        disabled={isTyping || isRecording || isTranscribing}
                    />
                    <Button 
                        type="submit" 
                        disabled={!inputValue.trim() || isTyping || isRecording || isTranscribing}
                        className="chat-action-button chat-send-button"
                        style={{ padding: '0.5rem', minWidth: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <ArrowUp size={20} />
                    </Button>
                </form>
            </div>
        </div>
    );
}
