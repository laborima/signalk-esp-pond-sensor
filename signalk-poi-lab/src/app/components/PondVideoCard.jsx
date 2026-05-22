"use client";

import { useState, useCallback, useEffect, useRef } from "react";

/**
 * PondVideoCard – Live stream from ESP32-S3 Sense or Raspberry Pi camera.
 *
 * Streaming strategy:
 *   - ESP32: WebSocket JPEG → <canvas>  (~30ms latency) or MJPEG fallback
 *   - Raspberry Pi: HLS → <video> (H.264 hardware encoding)
 *
 * Camera controls (brightness, contrast, etc.) via POST /config.
 *
 * @param {string} streamUrl - Optional override base URL for the camera
 */

const FRAME_SIZES = [
    { value: 4,  label: "QVGA 320×240" },
    { value: 8,  label: "VGA 640×480" },
    { value: 6,  label: "SVGA 800×600" },
    { value: 10, label: "UXGA 1600×1200" },
];

// Camera settings configs per platform
const CAMERA_CONFIGS = {
    esp32: {
        brightness: { min: -2, max: 2, default: -1, scale: 1 },
        contrast: { min: -2, max: 2, default: 1, scale: 1 },
        saturation: { min: -2, max: 2, default: 0, scale: 1 },
        ae_level: { min: -2, max: 2, default: 2, scale: 1 },
        gainceiling: { min: 0, max: 6, default: 6, scale: 1 },
        quality: { min: 4, max: 63, default: 10, scale: 1 },
        framesize: { values: [
            { value: 4, label: "QVGA 320×240" },
            { value: 6, label: "SVGA 800×600" },
            { value: 8, label: "VGA 640×480" },
            { value: 10, label: "UXGA 1600×1200" },
        ], default: 10 },
        hasPsram: true,
    },
    pi: {
        brightness: { min: -100, max: 100, default: 0, scale: 1 },
        contrast: { min: -100, max: 100, default: 0, scale: 1 },
        saturation: { min: -100, max: 100, default: 0, scale: 1 },
        // ae_level mapped to exposure for Pi
        exposure: { min: -13, max: -1, default: -6, scale: 1, label: "Exposition" },
        // gainceiling mapped to ISO for Pi
        iso: { min: 100, max: 800, default: 100, scale: 1, label: "ISO" },
        quality: { min: 1, max: 100, default: 70, scale: 1, label: "Qualité JPEG" },
        framesize: { values: [
            { value: "640x480", label: "640×480 (Pi Zero)" },
            { value: "1280x720", label: "1280×720 (HD)" },
            { value: "1920x1080", label: "1920×1080 (Full HD)" },
        ], default: "640x480" },
        hasPsram: false,
    },
};

const FIXED_CAMERA_SETTINGS_ESP32 = {
    brightness: -1,
    contrast: 1,
    saturation: 0,
    quality: 4,
    framesize: 10,
};

const getProxyBaseUrl = () => {
    if (typeof window === "undefined") return "";
    if (process.env.NODE_ENV !== "production") {
        return process.env.NEXT_PUBLIC_POND_VIDEO_URL || "http://192.168.1.84:8080";
    }
    return window.location.origin + "/signalk-poi-lab/pond-video";
};

export default function PondVideoCard({ streamUrl }) {
    const resolvedUrl = streamUrl || getProxyBaseUrl();

    const [status, setStatus] = useState("sleeping");
    const [deviceInfo, setDeviceInfo] = useState(null);
    const [deviceType, setDeviceType] = useState("esp32"); // "esp32" or "pi"
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [waking, setWaking] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [camSettings, setCamSettings] = useState(null);
    const [streamMode, setStreamMode] = useState("ws"); // "ws", "mjpeg", or "hls"
    const [hlsUrl, setHlsUrl] = useState(null); // HLS stream URL for Pi
    const [fps, setFps] = useState(0);
    const [streamError, setStreamError] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [showFullscreenOverlay, setShowFullscreenOverlay] = useState(true);

    // Get camera config based on device type
    const camConfig = CAMERA_CONFIGS[deviceType] || CAMERA_CONFIGS.esp32;
    
    // Video ref for HLS playback
    const videoRef = useRef(null);

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
    const fullscreenOverlayTimerRef = useRef(null);
    useEffect(() => { statusRef.current = status; }, [status]);

    useEffect(() => {
        fpsTimerRef.current = setInterval(() => {
            setFps(fpsCountRef.current);
            fpsCountRef.current = 0;
        }, 1000);
        return () => clearInterval(fpsTimerRef.current);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const mediaQuery = window.matchMedia("(max-width: 768px)");
        const updateViewport = (event) => {
            setIsMobileViewport(event.matches);
        };

        setIsMobileViewport(mediaQuery.matches);
        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener("change", updateViewport);
        } else {
            mediaQuery.addListener(updateViewport);
        }

        return () => {
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener("change", updateViewport);
            } else {
                mediaQuery.removeListener(updateViewport);
            }
        };
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
                // Detect device type: ESP32 has 'psram' or 'free_heap', Pi doesn't
                const detectedType = (info.psram !== undefined || info.free_heap !== undefined) ? "esp32" : "pi";
                setDeviceType(detectedType);
                
                // Detect stream type: Pi H.264 has hls_url pointing to Flask, ESP32 uses WebSocket/MJPEG
                if (info.hls_url && !info.hls_url.includes(':8888')) {
                    // New Flask-based HLS (port 8080)
                    setHlsUrl(getProxyBaseUrl() + "/hls/index.m3u8");
                    setStreamMode("hls");
                } else if (detectedType === "esp32") {
                    setStreamMode("ws");
                    setHlsUrl(null);
                }
                
                if (info.standby) setStatus("standby");
                else if (info.camera_awake) {
                    // For HLS, camera_awake means streaming is active
                    if (info.hls_url) {
                        setStatus("streaming");
                    } else {
                        setStatus("awake");
                    }
                }
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

    const applyFixedCamSettings = useCallback(async () => {
        const params = new URLSearchParams();
        const settings = deviceType === "pi" ? {
            brightness: camConfig.brightness.default,
            contrast: camConfig.contrast.default,
            saturation: camConfig.saturation.default,
            exposure: camConfig.exposure.default,
            iso: camConfig.iso.default,
            quality: camConfig.quality.default,
            framesize: camConfig.framesize.default,
        } : FIXED_CAMERA_SETTINGS_ESP32;
        
        Object.entries(settings).forEach(([key, value]) => {
            params.set(key, String(value));
        });

        try {
            await fetch(`${resolvedUrl}/config?${params.toString()}`, { method: "POST", signal: AbortSignal.timeout(5000) });
            setCamSettings(previous => ({ ...(previous || {}), ...settings }));
        } catch {
            // Ignore transient network/config errors
        }
    }, [resolvedUrl, deviceType, camConfig]);

    const handleWake = useCallback(async () => {
        if (wakeAbortRef.current) wakeAbortRef.current.abort();
        const controller = new AbortController();
        wakeAbortRef.current = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        setWaking(true);
        try {
            const r = await fetch(resolvedUrl + "/wake", { method: "POST", signal: controller.signal });
            if (r.ok) {
                const data = await r.json();
                await applyFixedCamSettings();
                
                // Check if HLS stream is available (Pi H.264 mode)
                if (data.hls_url) {
                    setHlsUrl(getProxyBaseUrl() + "/hls/index.m3u8");
                    setStreamMode("hls");
                    setStatus("streaming");
                } else {
                    setStatus("awake");
                }
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
    }, [applyFixedCamSettings, resolvedUrl]);

    const handleSleep = useCallback(async () => {
        stopWsStream();
        setStatus("sleeping");
        setFps(0);
        setHlsUrl(null);
        try {
            await fetch(resolvedUrl + "/sleep", { method: "POST", signal: AbortSignal.timeout(5000) });
        } catch { /* ignore */ }
    }, [resolvedUrl, stopWsStream]);

    useEffect(() => {
        // Only start WebSocket stream for ESP32 (not HLS mode)
        if (status === "awake" && streamMode !== "hls" && !wsRef.current) {
            startWsStream();
        }
    }, [status, streamMode, startWsStream]);

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

    const requestLandscapeOrientation = useCallback(async () => {
        if (typeof screen === "undefined" || !screen.orientation?.lock) return;
        try {
            await screen.orientation.lock("landscape");
        } catch {
            // Not supported or blocked by browser policy
        }
    }, []);

    const releaseOrientationLock = useCallback(() => {
        if (typeof screen === "undefined" || !screen.orientation?.unlock) return;
        screen.orientation.unlock();
    }, []);

    const clearFullscreenOverlayTimer = useCallback(() => {
        if (fullscreenOverlayTimerRef.current) {
            clearTimeout(fullscreenOverlayTimerRef.current);
            fullscreenOverlayTimerRef.current = null;
        }
    }, []);

    const scheduleFullscreenOverlayHide = useCallback(() => {
        clearFullscreenOverlayTimer();
        fullscreenOverlayTimerRef.current = setTimeout(() => {
            setShowFullscreenOverlay(false);
            fullscreenOverlayTimerRef.current = null;
        }, 3000);
    }, [clearFullscreenOverlayTimer]);

    const toggleFullscreen = useCallback(async () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            try {
                await containerRef.current.requestFullscreen();
                await requestLandscapeOrientation();
            } catch {
                // Ignore fullscreen/orientation failures
            }
        } else {
            document.exitFullscreen().catch(() => {});
        }
    }, [requestLandscapeOrientation]);

    useEffect(() => {
        const handler = () => {
            const fullscreen = !!document.fullscreenElement;
            setIsFullscreen(fullscreen);
            if (fullscreen) {
                setShowFullscreenOverlay(true);
            }
            if (!fullscreen) {
                releaseOrientationLock();
            }
        };
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, [releaseOrientationLock]);

    useEffect(() => {
        if (isFullscreen && isMobileViewport && showFullscreenOverlay) {
            scheduleFullscreenOverlayHide();
        } else {
            clearFullscreenOverlayTimer();
        }

        return () => {
            clearFullscreenOverlayTimer();
        };
    }, [isFullscreen, isMobileViewport, showFullscreenOverlay, scheduleFullscreenOverlayHide, clearFullscreenOverlayTimer]);

    useEffect(() => {
        return () => {
            clearFullscreenOverlayTimer();
            releaseOrientationLock();
        };
    }, [releaseOrientationLock, clearFullscreenOverlayTimer]);

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
    const hasImmersiveMobileFullscreen = isFullscreen && isMobileViewport;
    const hideFullscreenChrome = hasImmersiveMobileFullscreen && !showFullscreenOverlay;

    const revealFullscreenOverlay = useCallback(() => {
        if (!hasImmersiveMobileFullscreen) return;
        setShowFullscreenOverlay(true);
        scheduleFullscreenOverlayHide();
    }, [hasImmersiveMobileFullscreen, scheduleFullscreenOverlayHide]);

    return (
        <div ref={containerRef} className={`bg-poi-surface rounded-2xl shadow-sm border border-poi-sage/20 overflow-hidden ${isFullscreen ? "bg-black flex flex-col" : ""}`}>

            {/* ── Header ── */}
            {!hideFullscreenChrome && (
            <div className="bg-gradient-to-r from-poi-ocean to-poi-sage px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h2 className="text-poi-surface font-semibold">Caméra Bassin</h2>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${currentStatus.color} ${currentStatus.textColor}`}>
                        {currentStatus.icon} {currentStatus.label}
                    </span>
                    {isStreaming && (
                        <span className="text-xs text-white/70 font-mono">
                            {streamMode === "ws" ? "WS" : streamMode === "hls" ? "HLS" : "MJPEG"}
                            {streamMode !== "hls" && ` · ${fps} fps`}
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
            )}

            {/* ── Camera controls panel ── */}
            {showControls && isActive && !isFullscreen && (
                <div className="px-5 py-4 border-b border-poi-sage/10 bg-poi-ocean/5">
                    <p className="text-xs font-semibold text-poi-ocean mb-3">
                        Réglages caméra {deviceType === "pi" && <span className="text-poi-sage">(Pi)</span>}
                    </p>
                    {!camSettings ? (
                        <p className="text-xs text-poi-text/50">Chargement...</p>
                    ) : (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                            {/* Brightness */}
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-poi-text/60">
                                    Luminosité <span className="font-mono text-poi-ocean">{camSettings.brightness ?? camConfig.brightness.default}</span>
                                </span>
                                <input type="range" min={camConfig.brightness.min} max={camConfig.brightness.max}
                                    value={camSettings.brightness ?? camConfig.brightness.default}
                                    onChange={e => applyCamSetting("brightness", e.target.value)}
                                    className="w-full accent-poi-ocean" />
                            </label>
                            {/* Contrast */}
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-poi-text/60">
                                    Contraste <span className="font-mono text-poi-ocean">{camSettings.contrast ?? camConfig.contrast.default}</span>
                                </span>
                                <input type="range" min={camConfig.contrast.min} max={camConfig.contrast.max}
                                    value={camSettings.contrast ?? camConfig.contrast.default}
                                    onChange={e => applyCamSetting("contrast", e.target.value)}
                                    className="w-full accent-poi-ocean" />
                            </label>
                            {/* Saturation */}
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-poi-text/60">
                                    Saturation <span className="font-mono text-poi-ocean">{camSettings.saturation ?? camConfig.saturation.default}</span>
                                </span>
                                <input type="range" min={camConfig.saturation.min} max={camConfig.saturation.max}
                                    value={camSettings.saturation ?? camConfig.saturation.default}
                                    onChange={e => applyCamSetting("saturation", e.target.value)}
                                    className="w-full accent-poi-ocean" />
                            </label>
                            {/* Exposure / AE Level - different param names */}
                            {deviceType === "pi" ? (
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-poi-text/60">
                                        {camConfig.exposure.label} <span className="font-mono text-poi-ocean">{camSettings.exposure ?? camConfig.exposure.default}</span>
                                    </span>
                                    <input type="range" min={camConfig.exposure.min} max={camConfig.exposure.max}
                                        value={camSettings.exposure ?? camConfig.exposure.default}
                                        onChange={e => applyCamSetting("exposure", e.target.value)}
                                        className="w-full accent-poi-ocean" />
                                </label>
                            ) : (
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-poi-text/60">
                                        Exposition <span className="font-mono text-poi-ocean">{camSettings.ae_level ?? camConfig.ae_level.default}</span>
                                    </span>
                                    <input type="range" min={camConfig.ae_level.min} max={camConfig.ae_level.max}
                                        value={camSettings.ae_level ?? camConfig.ae_level.default}
                                        onChange={e => applyCamSetting("ae_level", e.target.value)}
                                        className="w-full accent-poi-ocean" />
                                </label>
                            )}
                            {/* Gain / ISO - different param names */}
                            {deviceType === "pi" ? (
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-poi-text/60">
                                        {camConfig.iso.label} <span className="font-mono text-poi-ocean">{camSettings.iso ?? camConfig.iso.default}</span>
                                    </span>
                                    <input type="range" min={camConfig.iso.min} max={camConfig.iso.max}
                                        value={camSettings.iso ?? camConfig.iso.default}
                                        onChange={e => applyCamSetting("iso", e.target.value)}
                                        className="w-full accent-poi-ocean" />
                                </label>
                            ) : (
                                <label className="flex flex-col gap-1">
                                    <span className="text-xs text-poi-text/60">
                                        Gain <span className="font-mono text-poi-ocean">{camSettings.gainceiling ?? camConfig.gainceiling.default}</span>
                                    </span>
                                    <input type="range" min={camConfig.gainceiling.min} max={camConfig.gainceiling.max}
                                        value={camSettings.gainceiling ?? camConfig.gainceiling.default}
                                        onChange={e => applyCamSetting("gainceiling", e.target.value)}
                                        className="w-full accent-poi-ocean" />
                                </label>
                            )}
                            {/* Quality */}
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-poi-text/60">
                                    {deviceType === "pi" ? "Qualité JPEG (haut=meilleur)" : "Qualité JPEG (bas=meilleur)"}
                                    <span className="font-mono text-poi-ocean">{camSettings.quality ?? camConfig.quality.default}</span>
                                </span>
                                <input type="range" min={camConfig.quality.min} max={camConfig.quality.max}
                                    value={camSettings.quality ?? camConfig.quality.default}
                                    onChange={e => applyCamSetting("quality", e.target.value)}
                                    className="w-full accent-poi-ocean" />
                            </label>
                            {/* Resolution */}
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-poi-text/60">Résolution</span>
                                <select value={camSettings.framesize ?? camConfig.framesize.default}
                                    onChange={e => applyCamSetting("framesize", e.target.value)}
                                    className="text-xs rounded border border-poi-sage/30 bg-poi-surface px-2 py-1 text-poi-text">
                                    {camConfig.framesize.values.map(f => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                </select>
                            </label>
                            <div className="flex gap-4 items-center pt-1">
                                <label className="flex items-center gap-2 text-xs text-poi-text/60 cursor-pointer">
                                    <input type="checkbox" checked={camSettings.vflip === 1 || camSettings.vflip === true}
                                        onChange={e => applyCamSetting("vflip", e.target.checked ? 1 : 0)}
                                        className="accent-poi-ocean" />
                                    Retourner V
                                </label>
                                <label className="flex items-center gap-2 text-xs text-poi-text/60 cursor-pointer">
                                    <input type="checkbox" checked={camSettings.hmirror === 1 || camSettings.hmirror === true || camSettings.hflip === 1 || camSettings.hflip === true}
                                        onChange={e => applyCamSetting(deviceType === "pi" ? "hflip" : "hmirror", e.target.checked ? 1 : 0)}
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
            <div
                className={`relative ${isFullscreen ? "flex-1 flex items-center justify-center bg-black" : "aspect-video bg-poi-ocean/5"} ${hasImmersiveMobileFullscreen ? "cursor-pointer" : ""}`}
                onClick={() => {
                    if (hasImmersiveMobileFullscreen) {
                        if (hideFullscreenChrome) {
                            revealFullscreenOverlay();
                        } else {
                            scheduleFullscreenOverlayHide();
                        }
                    }
                }}
                onPointerMove={() => {
                    if (hasImmersiveMobileFullscreen && !hideFullscreenChrome) {
                        scheduleFullscreenOverlayHide();
                    }
                }}
            >

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

                {/* HLS video for Raspberry Pi H.264 */}
                {isStreaming && streamMode === "hls" && hlsUrl && (
                    <video
                        ref={videoRef}
                        src={hlsUrl}
                        autoPlay
                        muted
                        playsInline
                        controls={isFullscreen}
                        style={isFullscreen ? { width: "100%", height: "100%", objectFit: "contain", display: "block" } : {}}
                        className={isFullscreen ? "" : "w-full h-full object-cover"}
                        onError={() => {
                            setStreamError(true);
                            checkCamera();
                        }}
                    />
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

                {hideFullscreenChrome && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-xs backdrop-blur-sm pointer-events-none">
                        Touchez pour afficher les contrôles
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            {deviceInfo && !hideFullscreenChrome && (
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
                        {deviceInfo.battery_percentage !== undefined && deviceInfo.battery_percentage >= 0 && (
                            <span className={deviceInfo.battery_percentage < 20 ? "text-poi-terra" : ""}>
                                🔋 {deviceInfo.battery_percentage}% ({deviceInfo.battery_voltage?.toFixed(2)}V)
                            </span>
                        )}
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
