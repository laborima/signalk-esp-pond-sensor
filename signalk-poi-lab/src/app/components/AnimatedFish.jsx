"use client";

import { useEffect, useState } from "react";

/**
 * Animated fish component that reflects pond health
 */
export default function AnimatedFish({ healthScore, lightLevel, waterLevel, size = "lg" }) {
    const [position, setPosition] = useState({ x: 50, y: 50 });
    const [direction, setDirection] = useState(1);
    const [bubbles, setBubbles] = useState([]);
    
    const sizeClasses = {
        sm: "w-20 h-20",
        md: "w-28 h-28",
        lg: "w-40 h-40",
        xl: "w-56 h-56"
    };

    const clampedHealth = Math.max(0, Math.min(100, healthScore ?? 0));
    const normalizedLight = lightLevel === null || lightLevel === undefined
        ? 0.5
        : Math.max(0, Math.min(1, lightLevel / 1200));
    // Number(null) === 0, so null must be filtered out explicitly.
    // Without valid data, render a normal water level (the tile shows N/A).
    const parsedWaterLevel = waterLevel === null || waterLevel === undefined
        ? NaN
        : Number(waterLevel);
    const hasWaterLevel = Number.isFinite(parsedWaterLevel);
    const waterLevelPercent = hasWaterLevel
        ? Math.max(0, Math.min(100, parsedWaterLevel <= 1 ? parsedWaterLevel * 100 : parsedWaterLevel))
        : 68;
    const normalizedWaterLevel = waterLevelPercent / 100;

    const waterSurfaceY = 58 - (normalizedWaterLevel * 22);
    const waterSurfacePercent = (waterSurfaceY / 64) * 100;
    const fishMinY = Math.min(92, Math.max(46, waterSurfacePercent + 8));
    const fishMaxY = 94;

    const poiPalette = {
        terra: [224, 122, 95],
        sun: [242, 204, 143],
        bark: [139, 69, 19],
        ocean: [61, 64, 91],
        sage: [129, 178, 154],
        sand: [244, 241, 222],
        text: [47, 62, 70]
    };

    const mixThemeColor = (from, to, ratio) => {
        const clampedRatio = Math.max(0, Math.min(1, ratio));
        const red = Math.round(from[0] + (to[0] - from[0]) * clampedRatio);
        const green = Math.round(from[1] + (to[1] - from[1]) * clampedRatio);
        const blue = Math.round(from[2] + (to[2] - from[2]) * clampedRatio);
        return `rgb(${red}, ${green}, ${blue})`;
    };

    const healthRatio = clampedHealth / 100;
    const healthIndicatorColor = clampedHealth >= 80
        ? "#81B29A"
        : clampedHealth >= 60
            ? "#F2CC8F"
            : "#E07A5F";
    const skyTopColor = mixThemeColor(poiPalette.ocean, poiPalette.sage, normalizedLight);
    const skyBottomColor = mixThemeColor(poiPalette.text, poiPalette.sand, normalizedLight * 0.85);
    const waterSurfaceColor = mixThemeColor(poiPalette.terra, poiPalette.sage, healthRatio);
    const waterMidColor = mixThemeColor(poiPalette.bark, poiPalette.ocean, healthRatio);
    const waterDeepColor = mixThemeColor(poiPalette.text, poiPalette.ocean, healthRatio * 0.7);
    const algaeColor = mixThemeColor(poiPalette.bark, poiPalette.sage, 0.55 + (healthRatio * 0.3));
    
    useEffect(() => {
        const moveInterval = setInterval(() => {
            setPosition(prev => {
                let newX = prev.x + (Math.random() - 0.5) * 10 * direction;
                let newY = prev.y + (Math.random() - 0.5) * 5;
                
                if (newX < 10 || newX > 90) {
                    setDirection(d => -d);
                    newX = Math.max(10, Math.min(90, newX));
                }
                newY = Math.max(fishMinY, Math.min(fishMaxY, newY));
                
                return { x: newX, y: newY };
            });
        }, 2000);
        
        return () => clearInterval(moveInterval);
    }, [direction, fishMinY]);

    useEffect(() => {
        setPosition(prev => ({
            ...prev,
            y: Math.max(fishMinY, Math.min(fishMaxY, prev.y))
        }));
    }, [fishMaxY, fishMinY]);
    
    useEffect(() => {
        const bubbleInterval = setInterval(() => {
            const newBubble = {
                id: Date.now(),
                x: position.x + (direction > 0 ? -5 : 5),
                y: position.y,
                size: Math.random() * 8 + 4
            };
            setBubbles(prev => [...prev.slice(-5), newBubble]);
        }, 1500);
        
        return () => clearInterval(bubbleInterval);
    }, [position, direction]);
    
    useEffect(() => {
        const cleanupInterval = setInterval(() => {
            setBubbles(prev => prev.filter(b => Date.now() - b.id < 3000));
        }, 500);
        
        return () => clearInterval(cleanupInterval);
    }, []);
    
    const koiFilter = healthScore >= 80
        ? "drop-shadow(0 6px 10px rgba(255, 210, 120, 0.45))"
        : healthScore >= 60
            ? "drop-shadow(0 6px 10px rgba(120, 210, 255, 0.35))"
            : "grayscale(0.2) saturate(0.9) drop-shadow(0 6px 10px rgba(110, 140, 170, 0.35))";
    
    return (
        <div className="relative w-full h-64 rounded-3xl overflow-hidden border border-poi-sage/20">
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 64" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                    <linearGradient id="pondSky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={skyTopColor} />
                        <stop offset="100%" stopColor={skyBottomColor} />
                    </linearGradient>
                    <linearGradient id="pondWater" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={waterSurfaceColor} stopOpacity="0.9" />
                        <stop offset="55%" stopColor={waterMidColor} />
                        <stop offset="100%" stopColor={waterDeepColor} />
                    </linearGradient>
                </defs>

                <rect x="0" y="0" width="120" height={waterSurfaceY} fill="url(#pondSky)" />

                <circle
                    cx="96"
                    cy="12"
                    r="5.5"
                    fill="#F2CC8F"
                    opacity={0.2 + (normalizedLight * 0.8)}
                />
                <circle
                    cx="96"
                    cy="12"
                    r="3.6"
                    fill="#F4F1DE"
                    opacity={0.75 - (normalizedLight * 0.7)}
                />

                {[8, 18, 28, 38, 48].map((x, index) => (
                    <circle
                        key={`star-${x}`}
                        cx={x}
                        cy={8 + (index % 2) * 4}
                        r="0.7"
                        fill="white"
                        opacity={(1 - normalizedLight) * (0.35 + index * 0.1)}
                    />
                ))}

                <g opacity={0.15 + (normalizedLight * 0.35)}>
                    <ellipse cx="24" cy="14" rx="10" ry="3" fill="white" />
                    <ellipse cx="65" cy="10" rx="12" ry="3.5" fill="white" />
                </g>

                <rect x="0" y={waterSurfaceY} width="120" height={64 - waterSurfaceY} fill="url(#pondWater)" />

                <path d={`M0 ${waterSurfaceY} C 20 ${waterSurfaceY - 1.8}, 35 ${waterSurfaceY + 1.8}, 60 ${waterSurfaceY} C 82 ${waterSurfaceY - 1.5}, 100 ${waterSurfaceY + 1.6}, 120 ${waterSurfaceY}`} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8">
                    <animate attributeName="d" dur="5s" repeatCount="indefinite"
                        values={`M0 ${waterSurfaceY} C 20 ${waterSurfaceY - 1.8}, 35 ${waterSurfaceY + 1.8}, 60 ${waterSurfaceY} C 82 ${waterSurfaceY - 1.5}, 100 ${waterSurfaceY + 1.6}, 120 ${waterSurfaceY};M0 ${waterSurfaceY} C 18 ${waterSurfaceY + 1.6}, 36 ${waterSurfaceY - 1.6}, 60 ${waterSurfaceY} C 84 ${waterSurfaceY + 1.5}, 102 ${waterSurfaceY - 1.3}, 120 ${waterSurfaceY};M0 ${waterSurfaceY} C 20 ${waterSurfaceY - 1.8}, 35 ${waterSurfaceY + 1.8}, 60 ${waterSurfaceY} C 82 ${waterSurfaceY - 1.5}, 100 ${waterSurfaceY + 1.6}, 120 ${waterSurfaceY}`}
                    />
                </path>

                <g opacity="0.7">
                    {[12, 24, 88, 102].map((x, index) => (
                        <path
                            key={`algae-${x}`}
                            d={`M ${x} 64 C ${x - 1.5} 57, ${x + 2.5} 50, ${x + 0.5} ${waterSurfaceY + 8}`}
                            stroke={algaeColor}
                            strokeWidth={index % 2 === 0 ? "1.8" : "1.4"}
                            strokeLinecap="round"
                            fill="none"
                        >
                            <animateTransform
                                attributeName="transform"
                                type="rotate"
                                values={`-3 ${x} 64;2 ${x} 64;-3 ${x} 64`}
                                dur={`${5 + index}s`}
                                repeatCount="indefinite"
                            />
                        </path>
                    ))}
                </g>
            </svg>

            <div
                className="absolute top-2 right-3 text-[11px] text-white/85 font-medium bg-black/25 backdrop-blur-sm rounded-full px-2 py-1"
                title="Niveau d'eau"
            >
                Eau {hasWaterLevel ? `${Math.round(waterLevelPercent)}%` : "--"}
            </div>
            
            {bubbles.map(bubble => (
                <div
                    key={bubble.id}
                    className="absolute rounded-full bg-white/30 animate-bubble"
                    style={{
                        left: `${bubble.x}%`,
                        bottom: `${100 - bubble.y}%`,
                        width: bubble.size,
                        height: bubble.size,
                        animation: "bubble 3s ease-out forwards"
                    }}
                />
            ))}
            
            <div 
                className={`absolute ${sizeClasses[size]} transition-all duration-2000 ease-in-out`}
                style={{ 
                    left: `${position.x}%`, 
                    top: `${position.y}%`,
                    transform: `translate(-50%, -50%) scaleX(${direction})`
                }}
            >
                <div className="relative w-full h-full animate-koi-swim">
                    <img
                        src="./koi.png"
                        alt="Carpe koi"
                        className="w-full h-full object-contain animate-koi-float"
                        style={{ filter: koiFilter }}
                    />
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-transparent via-white/10 to-transparent animate-koi-shimmer" />
                </div>
            </div>

            <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                <div
                    className="w-3 h-3 rounded-full animate-pulse"
                    style={{ backgroundColor: healthIndicatorColor }}
                />
                <span className="text-white text-sm font-medium">
                    Santé: {Math.round(clampedHealth)}%
                </span>
            </div>
        </div>
    );
}
