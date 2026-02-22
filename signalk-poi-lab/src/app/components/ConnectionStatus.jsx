"use client";

import { useState, useEffect } from "react";

/**
 * SignalK connection status indicator with last update time.
 */
export default function ConnectionStatus({ connected, lastUpdate }) {
    const [, setTick] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 10000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (isoString) => {
        if (!isoString) return null;
        const date = new Date(isoString);
        return date.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    };

    const formatRelative = (isoString) => {
        if (!isoString) return null;
        const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
        if (seconds < 10) return "à l'instant";
        if (seconds < 60) return `il y a ${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `il y a ${minutes} min`;
        return `il y a ${Math.floor(minutes / 60)}h`;
    };

    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm ${
            connected
                ? "bg-poi-sage/20 text-poi-ocean"
                : "bg-poi-terra/20 text-poi-bark"
        }`}>
            <div className={`w-2 h-2 rounded-full ${
                connected ? "bg-poi-sage animate-pulse" : "bg-poi-terra"
            }`} />
            <span className="font-medium">
                {connected ? "Connecté" : "Déconnecté"}
            </span>
            {lastUpdate && (
                <span className="text-xs opacity-75" title={formatTime(lastUpdate)}>
                    • {formatRelative(lastUpdate)}
                </span>
            )}
        </div>
    );
}
