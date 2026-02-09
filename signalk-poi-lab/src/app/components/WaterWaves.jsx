"use client";

/**
 * Animated water waves background component
 */
export default function WaterWaves({ children, className = "" }) {
    return (
        <div className={`relative overflow-hidden ${className}`}>
            <div className="absolute inset-0 pointer-events-none">
                <svg 
                    className="absolute bottom-0 left-0 w-full h-32"
                    viewBox="0 0 1440 120"
                    preserveAspectRatio="none"
                >
                    <path 
                        className="animate-wave1"
                        fill="rgba(61, 64, 91, 0.08)"
                        d="M0,60 C360,120 720,0 1080,60 C1260,90 1380,30 1440,60 L1440,120 L0,120 Z"
                    />
                    <path 
                        className="animate-wave2"
                        fill="rgba(129, 178, 154, 0.12)"
                        d="M0,80 C240,40 480,100 720,80 C960,60 1200,100 1440,80 L1440,120 L0,120 Z"
                    />
                    <path 
                        className="animate-wave3"
                        fill="rgba(61, 64, 91, 0.15)"
                        d="M0,90 C180,110 360,70 540,90 C720,110 900,70 1080,90 C1260,110 1380,70 1440,90 L1440,120 L0,120 Z"
                    />
                </svg>
            </div>
            {children}
        </div>
    );
}
