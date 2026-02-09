"use client";

import { useEffect, useState } from "react";

/**
 * Animated gauge card for displaying sensor values
 */
export default function GaugeCard({ 
    title, 
    value, 
    unit, 
    min, 
    max, 
    optimalMin, 
    optimalMax,
    decimals = 1 
}) {
    const [animatedValue, setAnimatedValue] = useState(null);
    const [isAnimating, setIsAnimating] = useState(false);
    
    useEffect(() => {
        if (value === null || value === undefined || isNaN(value)) return;
        
        if (animatedValue === null) {
            setAnimatedValue(value);
            return;
        }
        
        setIsAnimating(true);
        const duration = 1000;
        const startTime = Date.now();
        const startValue = animatedValue;
        const endValue = value;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            
            setAnimatedValue(startValue + (endValue - startValue) * eased);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                setIsAnimating(false);
            }
        };
        
        requestAnimationFrame(animate);
    }, [value]);
    
    const getStatus = () => {
        if (value === null || value === undefined || isNaN(value)) return "unknown";
        if (value < min || value > max) return "critical";
        if (optimalMin !== undefined && optimalMax !== undefined) {
            if (value >= optimalMin && value <= optimalMax) return "optimal";
            return "acceptable";
        }
        return "acceptable";
    };
    
    const status = getStatus();
    
    const statusColors = {
        unknown: { bg: "bg-poi-sand", ring: "ring-poi-text/30", text: "text-poi-text/60", bar: "bg-poi-text/40" },
        critical: { bg: "bg-poi-terra/10", ring: "ring-poi-terra", text: "text-poi-bark", bar: "bg-poi-terra" },
        acceptable: { bg: "bg-poi-coral/15", ring: "ring-poi-coral", text: "text-poi-bark", bar: "bg-poi-coral" },
        optimal: { bg: "bg-poi-sage/20", ring: "ring-poi-sage", text: "text-poi-ocean", bar: "bg-poi-sage" }
    };
    
    const colors = statusColors[status];
    
    const percentage = value !== null && !isNaN(value) && animatedValue !== null
        ? Math.max(0, Math.min(100, ((animatedValue - min) / (max - min)) * 100))
        : 0;
    
    const optimalStart = optimalMin !== undefined ? ((optimalMin - min) / (max - min)) * 100 : 0;
    const optimalEnd = optimalMax !== undefined ? ((optimalMax - min) / (max - min)) * 100 : 100;
    
    return (
        <div className={`relative overflow-hidden rounded-2xl ${colors.bg} p-5 ring-2 ${colors.ring} transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h3 className="font-semibold text-poi-ocean">{title}</h3>
                    <p className="text-xs text-poi-text/60">
                        Plage: {min} - {max} {unit}
                    </p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                    {status === "optimal" && "Optimal"}
                    {status === "acceptable" && "Acceptable"}
                    {status === "critical" && "Critique"}
                    {status === "unknown" && "N/A"}
                </div>
            </div>
            
            <div className="flex items-baseline gap-2 mb-4">
                <span className={`text-4xl font-bold ${colors.text} transition-all duration-300 ${isAnimating ? "scale-105" : ""}`}>
                    {value !== null && !isNaN(value) && animatedValue !== null ? animatedValue.toFixed(decimals) : "--"}
                </span>
                <span className="text-lg text-poi-text/60">{unit}</span>
            </div>
            
            <div className="relative h-3 bg-poi-sand rounded-full overflow-hidden">
                <div 
                    className="absolute h-full bg-poi-sage/30 opacity-50"
                    style={{ left: `${optimalStart}%`, width: `${optimalEnd - optimalStart}%` }}
                />
                <div 
                    className={`absolute h-full ${colors.bar} rounded-full transition-all duration-1000 ease-out`}
                    style={{ width: `${percentage}%` }}
                />
                <div 
                    className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-md border-2 ${colors.ring.replace("ring-", "border-")} transition-all duration-1000 ease-out`}
                    style={{ left: `calc(${percentage}% - 8px)` }}
                />
            </div>
            
            <div className="flex justify-between mt-1 text-xs text-poi-text/40">
                <span>{min}</span>
                <span>{max}</span>
            </div>
        </div>
    );
}
