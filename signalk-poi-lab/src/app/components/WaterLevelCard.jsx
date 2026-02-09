"use client";

import { useEffect, useState } from "react";

/**
 * Water level card with visual gauge and alert thresholds
 * @param {number} level - Water level as ratio (0-1)
 * @param {number} alertLow - Low alert threshold ratio (default 0.3)
 * @param {number} alertHigh - High alert threshold ratio (default 0.9)
 */
export default function WaterLevelCard({ level, alertLow = 0.3, alertHigh = 0.9 }) {
    const [animatedLevel, setAnimatedLevel] = useState(0);

    useEffect(() => {
        if (level === null || level === undefined || isNaN(level)) return;

        const duration = 1200;
        const startTime = Date.now();
        const startValue = animatedLevel;
        const endValue = Math.max(0, Math.min(1, level));

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setAnimatedLevel(startValue + (endValue - startValue) * eased);
            if (progress < 1) requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }, [level]);

    const getStatus = () => {
        if (level === null || level === undefined || isNaN(level)) return "unknown";
        if (level <= alertLow) return "critical-low";
        if (level >= alertHigh) return "critical-high";
        if (level <= alertLow + 0.1) return "warning-low";
        if (level >= alertHigh - 0.1) return "warning-high";
        return "normal";
    };

    const status = getStatus();
    const percentage = animatedLevel * 100;
    const levelCm = level !== null && !isNaN(level) ? (level * 100).toFixed(0) : "--";

    const statusConfig = {
        "unknown":       { color: "text-poi-text/60", bg: "bg-poi-sand", border: "border-poi-text/20", label: "N/A" },
        "critical-low":  { color: "text-poi-terra", bg: "bg-poi-terra/10", border: "border-poi-terra", label: "Niveau critique" },
        "critical-high": { color: "text-poi-terra", bg: "bg-poi-terra/10", border: "border-poi-terra", label: "Débordement" },
        "warning-low":   { color: "text-poi-coral", bg: "bg-poi-coral/10", border: "border-poi-coral", label: "Niveau bas" },
        "warning-high":  { color: "text-poi-coral", bg: "bg-poi-coral/10", border: "border-poi-coral", label: "Niveau haut" },
        "normal":        { color: "text-poi-ocean", bg: "bg-poi-sage/10", border: "border-poi-sage/40", label: "Normal" }
    };

    const config = statusConfig[status];
    const isAlert = status.startsWith("critical") || status.startsWith("warning");

    const getWaterColor = () => {
        if (status.startsWith("critical")) return "from-poi-terra/60 to-poi-terra/30";
        if (status.startsWith("warning")) return "from-poi-coral/50 to-poi-coral/25";
        return "from-poi-ocean/50 to-poi-ocean/25";
    };

    return (
        <div className={`rounded-xl ${config.bg} border ${config.border} p-4 transition-all duration-500`}>
            <div className="flex items-center justify-between mb-3">
                <h4 className={`text-sm font-semibold ${config.color}`}>
                    Niveau d'eau
                </h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${config.bg} ${config.color} border ${config.border}`}>
                    {config.label}
                </span>
            </div>

            <div className="flex items-end gap-5">
                <div className="relative w-16 h-28 bg-poi-sand/80 rounded-lg border-2 border-poi-text/20 overflow-hidden flex-shrink-0">
                    <div
                        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t ${getWaterColor()} transition-all duration-1000 ease-out rounded-b-lg`}
                        style={{ height: `${percentage}%` }}
                    />
                    <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-poi-terra/50"
                        style={{ bottom: `${alertLow * 100}%` }}
                        title="Seuil bas"
                    />
                    <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-poi-coral/50"
                        style={{ bottom: `${alertHigh * 100}%` }}
                        title="Seuil haut"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-sm font-bold text-poi-bark/80 drop-shadow-sm">
                            {percentage.toFixed(0)}%
                        </span>
                    </div>
                </div>

                <div className="flex-1 space-y-3">
                    <div>
                        <p className={`text-3xl font-bold ${config.color}`}>
                            {levelCm} <span className="text-lg font-normal">cm</span>
                        </p>
                    </div>
                    <div className="space-y-1 text-xs text-poi-text/60">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-0.5 bg-poi-terra/50 border-t border-dashed border-poi-terra/50"></span>
                            Alerte basse: {(alertLow * 100).toFixed(0)} cm
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-0.5 bg-poi-coral/50 border-t border-dashed border-poi-coral/50"></span>
                            Alerte haute: {(alertHigh * 100).toFixed(0)} cm
                        </div>
                    </div>
                    {isAlert && (
                        <p className={`text-sm font-medium ${config.color}`}>
                            {status === "critical-low" && "Remplissage nécessaire !"}
                            {status === "warning-low" && "Surveiller le niveau"}
                            {status === "warning-high" && "Niveau élevé"}
                            {status === "critical-high" && "Risque de débordement !"}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
