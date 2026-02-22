"use client";

import { useState, useCallback, useEffect, useRef } from "react";

/**
 * PondVideoCard – Live stream from ESP32-S3 Sense camera.
 *
 * Streaming strategy:
 *   1. WebSocket JPEG → <canvas>  (~30ms latency)
 *   2. MJPEG fallback → <img>     (~200ms latency)
 *
 * Camera controls (brightness, contrast, etc.) via POST /config.
 *
 * @param {string} streamUrl - Optional override base URL for the ESP32 camera
 */

const FRAME_SIZES = [
    { value: 4,  label: "QVGA 320×240" },
    { value: 8,  label: "VGA 640×480" },
    { value: 6,  label: "SVGA 800×600" },
    { value: 10, label: "UXGA 1600×1200" },
];

const getProxyBaseUrl = () => {
    if (typeof window === "undefined") return "";
    if (process.env.NODE_ENV !== "production") {
        return process.env.NEXT_PUBLIC_POND_VIDEO_URL || "http://192.168.1.82:81";
    }
    return window.location.origin + "/signalk-poi-lab/pond-video";
};

const getWsUrl = () => {
    if (typeof window === "undefined") return "";
    if (process.env.NODE_ENV !== "production") {
        const base = process.env.NEXT_PUBLIC_POND_VIDEO_URL || "http://192.168.1.82:81";
        return base.replace(/^http/, "ws").replace(/:81$/, ":82");
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/signalk-poi-lab/pond-ws`;
};

export default function PondVideoCard({ streamUrl }) {
    const resolvedUrl = streamUrl || getProxyBaseUrl();

    const [status, setStatus] = useState("sleeping");
    const [deviceInfo, setDeviceInfo] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [waking, setWaking] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [camSettings, setCamSettings] = useState(null);
    const [streamMode, setStreamMode] = useState("ws");
    const [fps, setFps] = useState(0);
    const [streamError, setStreamError] = useState(false);

    const canvasRef = useRef(null);
    const imgRef = useRef(null);
    const containerRef = useRef(null);
    const wsRef = useRef(null);
    const fpsCountRef = useRef(0);
    const fpsTimerRef = useRef(null);
    const statusRef = useRef(status);
    const intentionalCloseRef = useRef(false);
    const configAbortRef = useRef(null);
    const wakeAbortRef = useRef(null);
    const checkAbortRef = useRef(null);
    const wsReconnectTimerRef = useRef(null);
    const wsReconnectDelayRef = useRef(1000);
    useEffect(() => { statusRef.current = status; }, [status]);

    useEffect(() => {
        fpsTimerRef.current = setInterval(() => {
            setFps(fpsCountRef.current);
            fpsCountRef.current = 0;
        }, 1000);
        return () => clearInterval(fpsTimerRef.current);
    }, []);

    const checkCamera = useCallback(async () => {
        if (checkAbortRef.current) checkAbortRef.current.abort();
        const controller = new AbortController();
        checkAbortRef.current = controller;
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
            const r = await fetch(resolvedUrl + "/", { signal: controller.signal });
            if (r.ok) {
                const info = await r.json();
                setDeviceInfo(info);
                if (info.standby) setStatus("standby");
                else if (info.camera_awake) setStatus("awake");
                else setStatus("sleeping");
            } else {
                setStatus("offline");
            }
        } catch (e) {
            if (e.name !== "AbortError") setStatus("offline");
        } finally {
            clearTimeout(timer);
            checkAbortRef.current = null;
        }
    }, [resolvedUrl]);

    useEffect(() => { checkCamera(); }, [checkCamera]);

    const stopWsStream = useCallback(() => {
        intentionalCloseRef.current = true;
        if (wsReconnectTimerRef.current) { clearTimeout(wsReconnectTimerRef.current); wsReconnectTimerRef.current = null; }
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    }, []);

    const startWsStream = useCallback(() => {
        if (wsRef.current) return;
        intentionalCloseRef.current = false;
        wsReconnectDelayRef.current = 1000;

        const connect = () => {
            if (intentionalCloseRef.current) return;
            if (wsRef.current) return;

            const ws = new WebSocket(getWsUrl());
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;

            ws.onopen = () => {
                wsReconnectDelayRef.current = 1000;
                setStreamMode("ws");
                setStreamError(false);
                setStatus("streaming");
            };

            ws.onmessage = (evt) => {
                const blob = new Blob([evt.data], { type: "image/jpeg" });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => {
                    const canvas = canvasRef.current;
                    if (canvas) {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        canvas.getContext("2d").drawImage(img, 0, 0);
                        fpsCountRef.current++;
                    }
                    URL.revokeObjectURL(url);
                };
                img.onerror = () => URL.revokeObjectURL(url);
                img.src = url;
            };

            ws.onerror = () => {
                setStreamMode("mjpeg");
                setStreamError(false);
                setStatus("streaming");
                intentionalCloseRef.current = true;
            };

            ws.onclose = () => {
                wsRef.current = null;
                if (intentionalCloseRef.current) return;
                if (statusRef.current !== "streaming" && statusRef.current !== "awake") return;
                setStreamError(true);
                const delay = Math.min(wsReconnectDelayRef.current, 16000);
                wsReconnectDelayRef.current = delay * 2;
                wsReconnectTimerRef.current = setTimeout(() => {
                    wsReconnectTimerRef.current = null;
                    connect();
                }, delay);
            };
        };

        connect();
    }, []);

    const handleWake = useCallback(async () => {
        if (wakeAbortRef.current) wakeAbortRef.current.abort();
        const controller = new AbortController();
        wakeAbortRef.current = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        setWaking(true);
        try {
            const r = await fetch(resolvedUrl + "/wake", { method: "POST", signal: controller.signal });
            if (r.ok) {
                setStatus("awake");
            } else {
                const data = await r.json().catch(() => ({}));
                setStatus(data.status === "standby" ? "standby" : "offline");
            }
        } catch (e) {
            if (e.name !== "AbortError") setStatus("offline");
        } finally {
            clearTimeout(timer);
            wakeAbortRef.current = null;
            setWaking(false);
        }
    }, [resolvedUrl]);

    const handleSleep = useCallback(async () => {
        stopWsStream();
        setStatus("sleeping");
        setFps(0);
        try {
            await fetch(resolvedUrl + "/sleep", { method: "POST", signal: AbortSignal.timeout(5000) });
        } catch { /* ignore */ }
    }, [resolvedUrl, stopWsStream]);

    useEffect(() => {
        if (status === "awake" && !wsRef.current) startWsStream();
    }, [status, startWsStream]);

    useEffect(() => () => {
        stopWsStream();
        if (configAbortRef.current) configAbortRef.current.abort();
        if (checkAbortRef.current) checkAbortRef.current.abort();
        if (wsReconnectTimerRef.current) clearTimeout(wsReconnectTimerRef.current);
    }, [stopWsStream]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (statusRef.current !== "streaming" && statusRef.current !== "waking") {
                checkCamera();
            }
        }, 15000);
        return () => clearInterval(interval);
    }, [checkCamera]);

    useEffect(() => {
        const onUnload = () => {
            if (statusRef.current === "streaming" || statusRef.current === "awake") {
                navigator.sendBeacon(resolvedUrl + "/sleep");
            }
        };
        window.addEventListener("beforeunload", onUnload);
        return () => window.removeEventListener("beforeunload", onUnload);
    }, [resolvedUrl]);

    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }, []);

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    const loadCamSettings = useCallback(async () => {
        if (configAbortRef.current) configAbortRef.current.abort();
        const controller = new AbortController();
        configAbortRef.current = controller;
        try {
            const r = await fetch(resolvedUrl + "/config", { signal: controller.signal });
            if (r.ok) setCamSettings(await r.json());
        } catch (e) {
            if (e.name !== "AbortError") { /* ignore other errors */ }
        }
    }, [resolvedUrl]);

    const applyCamSetting = useCallback(async (key, value) => {
        setCamSettings(prev => prev ? { ...prev, [key]: Number(value) } : prev);
        try {
            await fetch(`${resolvedUrl}/config?${key}=${value}`, { method: "POST", signal: AbortSignal.timeout(5000) });
        } catch { /* ignore */ }
    }, [resolvedUrl]);

    useEffect(() => {
        if (showControls && !camSettings) loadCamSettings();
    }, [showControls, camSettings, loadCamSettings]);

    const statusConfig = {
        sleeping:  { label: "En veille",      color: "bg-poi-ocean/70", textColor: "text-white",    icon: "💤" },
        waking:    { label: "Démarrage...",    color: "bg-poi-sun",      textColor: "text-poi-bark", icon: "⏳" },
        awake:     { label: "Prête",           color: "bg-green-500",    textColor: "text-white",    icon: "✅" },
        streaming: { label: "En direct",       color: "bg-green-500",    textColor: "text-white",    icon: "🔴" },
        standby:   { label: "Veille nocturne", color: "bg-poi-ocean",    textColor: "text-white",    icon: "🌙" },
        offline:   { label: "Hors ligne",      color: "bg-poi-terra",    textColor: "text-white",    icon: "📡" },
    };

    const currentStatus = statusConfig[waking ? "waking" : status] || statusConfig.offline;
    const isActive = status === "streaming" || status === "awake";
    const isStreaming = status === "streaming";

    return (
        <div ref={containerRef} className={`bg-poi-surface rounded-2xl shadow-sm border border-poi-sage/20 overflow-hidden ${isFullscreen ? "bg-black flex flex-col" : ""}`}>

            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-poi-ocean to-poi-sage px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-poi-surface font-semibold">Caméra Bassin</h2>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${currentStatus.color} ${currentStatus.textColor}`}>
                        {currentStatus.icon} {currentStatus.label}
                    </span>
                    {isStreaming && (
                        <span className="text-xs text-white/70 font-mono">
                            {streamMode === "ws" ? "WS" : "MJPEG"} · {fps} fps
                            {streamError && <span className="text-yellow-300"> · reconnexion...</span>}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!isActive && status !== "standby" && (
                        <button onClick={handleWake} disabled={waking}
                            className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white text-xs font-medium disabled:opacity-50">
                            {waking ? "Démarrage..." : "Allumer"}
                        </button>
                    )}
                    {isActive && (
                        <>
                            <button onClick={() => setShowControls(v => !v)}
                                className={`p-1.5 rounded-lg transition-colors text-white ${showControls ? "bg-white/40" : "bg-white/20 hover:bg-white/30"}`}
                                title="Réglages caméra">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>
                            <button onClick={handleSleep}
                                className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white text-xs font-medium">
                                Éteindre
                            </button>
                            <button onClick={toggleFullscreen}
                                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white"
                                title={isFullscreen ? "Quitter plein écran" : "Plein écran"}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {isFullscreen
                                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                    }
                                </svg>
                            </button>
                        </>
                    )}
                    {status === "offline" && (
                        <button onClick={checkCamera}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white" title="Réessayer">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Camera controls panel ── */}
            {showControls && isActive && !isFullscreen && (
                <div className="px-5 py-4 border-b border-poi-sage/10 bg-poi-ocean/5">
                    <p className="text-xs font-semibold text-poi-ocean mb-3">Réglages caméra</p>
                    {!camSettings ? (
                        <p className="text-xs text-poi-text/50">Chargement...</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                            {[
                                { key: "brightness",  label: "Luminosité",  min: -2, max: 2 },
                                { key: "contrast",    label: "Contraste",   min: -2, max: 2 },
                                { key: "saturation",  label: "Saturation",  min: -2, max: 2 },
                                { key: "ae_level",    label: "Exposition",  min: -2, max: 2 },
                                { key: "gainceiling", label: "Gain",        min: 0,  max: 6 },
                                { key: "quality",     label: "Qualité JPEG (bas=meilleur)", min: 4, max: 63 },
                            ].map(({ key, label, min, max }) => (
                                <label key={key} className="flex flex-col gap-1">
                                    <span className="text-xs text-poi-text/60">
                                        {label} <span className="font-mono text-poi-ocean">{camSettings[key]}</span>
                                    </span>
                                    <input type="range" min={min} max={max} value={camSettings[key] ?? 0}
                                        onChange={e => applyCamSetting(key, e.target.value)}
                                        className="w-full accent-poi-ocean" />
                                </label>
                            ))}
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-poi-text/60">Résolution</span>
                                <select value={camSettings.framesize ?? 6}
                                    onChange={e => applyCamSetting("framesize", e.target.value)}
                                    className="text-xs rounded border border-poi-sage/30 bg-poi-surface px-2 py-1 text-poi-text">
                                    {FRAME_SIZES.map(f => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                </select>
                            </label>
                            <div className="flex gap-4 items-center pt-1">
                                <label className="flex items-center gap-2 text-xs text-poi-text/60 cursor-pointer">
                                    <input type="checkbox" checked={camSettings.vflip === 1}
                                        onChange={e => applyCamSetting("vflip", e.target.checked ? 1 : 0)}
                                        className="accent-poi-ocean" />
                                    Retourner V
                                </label>
                                <label className="flex items-center gap-2 text-xs text-poi-text/60 cursor-pointer">
                                    <input type="checkbox" checked={camSettings.hmirror === 1}
                                        onChange={e => applyCamSetting("hmirror", e.target.checked ? 1 : 0)}
                                        className="accent-poi-ocean" />
                                    Miroir H
                                </label>
                            </div>
                            <div className="col-span-2 pt-2 border-t border-poi-sage/10 flex justify-end">
                                <button
                                    onClick={async () => {
                                        await fetch(`${resolvedUrl}/config?reset=1`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(() => {});
                                        setCamSettings(null);
                                        loadCamSettings();
                                    }}
                                    className="px-3 py-1 text-xs rounded-lg bg-poi-terra/10 hover:bg-poi-terra/20 text-poi-terra border border-poi-terra/20 transition-colors">
                                    ↺ Réinitialiser
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Video area ── */}
            <div className={`relative ${isFullscreen ? "flex-1 flex items-center justify-center bg-black" : "aspect-video bg-poi-ocean/5"}`}>

                {/* WebSocket canvas */}
                {isStreaming && streamMode === "ws" && (
                    <canvas ref={canvasRef}
                        style={isFullscreen ? { width: "100%", height: "100%", objectFit: "contain", display: "block" } : {}}
                        className={isFullscreen ? "" : "w-full h-full object-cover"} />
                )}

                {/* MJPEG fallback */}
                {isStreaming && streamMode === "mjpeg" && (
                    <img ref={imgRef} src={resolvedUrl + "/stream"} alt="Bassin en direct"
                        style={isFullscreen ? { width: "100%", height: "100%", objectFit: "contain", display: "block" } : {}}
                        className={isFullscreen ? "" : "w-full h-full object-cover"}
                        onError={checkCamera} />
                )}

                {(status === "sleeping" || waking) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                            {waking ? (
                                <>
                                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-poi-ocean border-t-transparent mx-auto mb-3" />
                                    <p className="text-poi-text/60 text-sm">Démarrage de la caméra...</p>
                                </>
                            ) : (
                                <>
                                    <span className="text-4xl mb-3 block">📷</span>
                                    <p className="text-poi-ocean font-medium">Caméra en veille</p>
                                    <p className="text-poi-text/50 text-sm mt-1">Cliquez sur Allumer pour voir le bassin</p>
                                    <button onClick={handleWake}
                                        className="mt-3 px-4 py-1.5 bg-poi-ocean text-white rounded-lg text-sm hover:bg-poi-ocean/80 transition-colors">
                                        Allumer la caméra
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {status === "standby" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-poi-ocean/10">
                        <div className="text-center">
                            <span className="text-4xl mb-3 block">🌙</span>
                            <p className="text-poi-ocean font-medium">Mode nuit</p>
                            <p className="text-poi-text/50 text-sm mt-1">La caméra refuse les connexions la nuit</p>
                        </div>
                    </div>
                )}

                {status === "offline" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-poi-terra/5">
                        <div className="text-center">
                            <span className="text-4xl mb-3 block">📡</span>
                            <p className="text-poi-terra font-medium">Caméra hors ligne</p>
                            <p className="text-poi-text/50 text-sm mt-1">Vérifiez la connexion de l&apos;ESP32</p>
                            <button onClick={checkCamera}
                                className="mt-3 px-4 py-1.5 bg-poi-ocean text-white rounded-lg text-sm hover:bg-poi-ocean/80 transition-colors">
                                Réessayer
                            </button>
                        </div>
                    </div>
                )}

                {streamError && isStreaming && streamMode === "ws" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent mx-auto mb-3" />
                            <p className="text-white text-sm font-medium">Reconnexion en cours...</p>
                            <button
                                onClick={() => {
                                    stopWsStream();
                                    setStreamError(false);
                                    checkCamera();
                                }}
                                className="mt-3 px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm transition-colors">
                                Redémarrer
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            {deviceInfo && (
                <div className="px-5 py-3 border-t border-poi-sage/10 flex items-center justify-between text-xs text-poi-text/50">
                    <span>{deviceInfo.device || "esp-pond-video"}</span>
                    <div className="flex items-center gap-3">
                        {deviceInfo.local_time && (
                            <span className={deviceInfo.ntp_synced ? "" : "text-yellow-500"}>
                                🕐 {deviceInfo.local_time}{!deviceInfo.ntp_synced && " (NTP?)"}
                            </span>
                        )}
                        {deviceInfo.standby && <span className="text-poi-ocean">🌙 Veille nocturne</span>}
                        {deviceInfo.wifi_rssi && <span>WiFi: {deviceInfo.wifi_rssi} dBm</span>}
                        {deviceInfo.free_heap && <span>RAM: {Math.round(deviceInfo.free_heap / 1024)} KB</span>}
                        {deviceInfo.uptime !== undefined && (
                            <span>↑ {Math.floor(deviceInfo.uptime / 3600)}h{Math.floor((deviceInfo.uptime % 3600) / 60)}m</span>
                        )}
                        {deviceInfo.ws_clients !== undefined && isStreaming && (
                            <span>{deviceInfo.ws_clients} client{deviceInfo.ws_clients !== 1 ? "s" : ""} WS</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
