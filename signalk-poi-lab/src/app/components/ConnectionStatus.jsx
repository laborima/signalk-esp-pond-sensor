"use client";

/**
 * SignalK connection status indicator
 */
export default function ConnectionStatus({ connected, lastUpdate }) {
    const formatTime = (isoString) => {
        if (!isoString) return "Jamais";
        const date = new Date(isoString);
        return date.toLocaleTimeString("fr-FR", { 
            hour: "2-digit", 
            minute: "2-digit", 
            second: "2-digit" 
        });
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
                <span className="text-xs opacity-75">
                    • {formatTime(lastUpdate)}
                </span>
            )}
        </div>
    );
}
