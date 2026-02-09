"use client";

import { useEffect, useState } from "react";

/**
 * Circular health score indicator with animation
 */
export default function HealthScore({ score, status }) {
    const [animatedScore, setAnimatedScore] = useState(0);
    
    useEffect(() => {
        const duration = 1500;
        const startTime = Date.now();
        const startValue = animatedScore;
        const endValue = score;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 4);
            
            setAnimatedScore(Math.round(startValue + (endValue - startValue) * eased));
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }, [score]);
    
    const getColor = () => {
        if (status === "critical") return { stroke: "#E07A5F", bg: "bg-poi-terra/10", text: "text-poi-bark" };
        if (status === "warning") return { stroke: "#f1a387", bg: "bg-poi-coral/20", text: "text-poi-bark" };
        if (status === "acceptable") return { stroke: "#f1a387", bg: "bg-poi-coral/15", text: "text-poi-ocean" };
        if (status === "optimal") return { stroke: "#81B29A", bg: "bg-poi-sage/20", text: "text-poi-ocean" };
        return { stroke: "#2F3E46", bg: "bg-poi-sand", text: "text-poi-text" };
    };
    
    const colors = getColor();
    const circumference = 2 * Math.PI * 45;
    const strokeDashoffset = circumference - (animatedScore / 100) * circumference;
    
    const statusLabels = {
        critical: "Critique",
        warning: "Attention",
        acceptable: "Acceptable",
        optimal: "Optimal",
        unknown: "Inconnu"
    };
    
    return (
        <div className={`${colors.bg} rounded-2xl p-6 flex flex-col items-center`}>
            <h3 className="text-poi-ocean font-medium mb-4">Santé du bassin</h3>
            
            <div className="relative w-32 h-32">
                <svg className="w-full h-full transform -rotate-90">
                    <circle
                        cx="64"
                        cy="64"
                        r="45"
                        fill="none"
                        stroke="#F4F1DE"
                        strokeWidth="10"
                    />
                    <circle
                        cx="64"
                        cy="64"
                        r="45"
                        fill="none"
                        stroke={colors.stroke}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-4xl font-bold ${colors.text}`}>
                        {animatedScore}
                    </span>
                    <span className="text-poi-text/50 text-sm">/ 100</span>
                </div>
            </div>
            
            <div className={`mt-4 px-4 py-2 rounded-full ${colors.bg} ${colors.text} font-medium`}>
                {statusLabels[status] || "Inconnu"}
            </div>
        </div>
    );
}
