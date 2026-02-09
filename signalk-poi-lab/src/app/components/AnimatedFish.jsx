"use client";

import { useEffect, useState } from "react";

/**
 * Animated fish component that reflects pond health
 */
export default function AnimatedFish({ healthScore, size = "lg" }) {
    const [position, setPosition] = useState({ x: 50, y: 50 });
    const [direction, setDirection] = useState(1);
    const [bubbles, setBubbles] = useState([]);
    
    const sizeClasses = {
        sm: "w-16 h-16",
        md: "w-24 h-24",
        lg: "w-32 h-32",
        xl: "w-48 h-48"
    };
    
    const getColor = () => {
        if (healthScore >= 80) return "#81B29A";
        if (healthScore >= 60) return "#F2CC8F";
        return "#E07A5F";
    };
    
    useEffect(() => {
        const moveInterval = setInterval(() => {
            setPosition(prev => {
                let newX = prev.x + (Math.random() - 0.5) * 10 * direction;
                let newY = prev.y + (Math.random() - 0.5) * 5;
                
                if (newX < 10 || newX > 90) {
                    setDirection(d => -d);
                    newX = Math.max(10, Math.min(90, newX));
                }
                newY = Math.max(20, Math.min(80, newY));
                
                return { x: newX, y: newY };
            });
        }, 2000);
        
        return () => clearInterval(moveInterval);
    }, [direction]);
    
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
    
    const fishColor = getColor();
    
    return (
        <div className="relative w-full h-64 bg-gradient-to-b from-poi-sage/60 via-poi-ocean to-poi-ocean rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCI+PGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+')] opacity-50" />
            
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
                <svg viewBox="0 0 100 60" className="w-full h-full drop-shadow-lg">
                    <ellipse cx="50" cy="30" rx="30" ry="20" fill={fishColor} />
                    <ellipse cx="35" cy="30" rx="20" ry="15" fill={fishColor} />
                    
                    <polygon points="10,30 -5,15 -5,45" fill={fishColor} />
                    <polygon points="8,25 -2,10 5,20" fill={fishColor} opacity="0.8" />
                    <polygon points="8,35 -2,50 5,40" fill={fishColor} opacity="0.8" />
                    
                    <polygon points="45,12 40,0 55,8" fill={fishColor} opacity="0.9" />
                    <polygon points="45,48 40,60 55,52" fill={fishColor} opacity="0.9" />
                    
                    <circle cx="65" cy="25" r="6" fill="white" />
                    <circle cx="67" cy="25" r="3" fill="#1a1a2e" />
                    <circle cx="68" cy="24" r="1" fill="white" />
                    
                    <path d="M 75 32 Q 80 34 78 36" stroke="#1a1a2e" strokeWidth="1.5" fill="none" />
                    
                    <ellipse cx="40" cy="28" rx="5" ry="4" fill="white" opacity="0.2" />
                    <ellipse cx="55" cy="30" rx="4" ry="3" fill="white" opacity="0.15" />
                    <ellipse cx="30" cy="32" rx="4" ry="3" fill="white" opacity="0.15" />
                    
                    <circle cx="25" cy="35" r="3" fill="rgba(255,150,150,0.3)" />
                </svg>
            </div>
            
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-poi-bark/30 to-transparent" />
            
            <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                <div 
                    className="w-3 h-3 rounded-full animate-pulse"
                    style={{ backgroundColor: fishColor }}
                />
                <span className="text-white text-sm font-medium">
                    Santé: {healthScore}%
                </span>
            </div>
        </div>
    );
}
