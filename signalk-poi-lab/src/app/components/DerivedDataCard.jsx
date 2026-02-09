"use client";

/**
 * Card for displaying derived/interpolated data
 */
export default function DerivedDataCard({ data }) {
    if (!data || Object.keys(data).length === 0) {
        return null;
    }
    
    const getRiskColor = (value) => {
        if (value === "faible") return "text-poi-ocean bg-poi-sage/20";
        if (value === "modéré") return "text-poi-bark bg-poi-sun/20";
        if (value === "élevé") return "text-poi-bark bg-poi-terra/20";
        return "text-poi-text bg-poi-sand";
    };
    
    const icons = {
        estimatedOxygen: "💨",
        dewPoint: "💧",
        heatIndex: "🌡️",
        evaporationRisk: "☀️",
        algaeRisk: "🌿"
    };
    
    return (
        <div>
            <h4 className="text-sm font-semibold text-poi-ocean/70 mb-3">Données calculées</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(data).map(([key, item]) => (
                    <div 
                        key={key}
                        className="bg-poi-sand/50 rounded-xl p-3 text-center hover:bg-poi-sage/10 transition-colors"
                    >
                        <span className="text-xl">{icons[key] || "📊"}</span>
                        <p className="text-xs text-poi-text/60 mt-1">{item.label}</p>
                        <p className={`text-base font-bold mt-1 ${
                            typeof item.value === "string" && !item.unit 
                                ? getRiskColor(item.value) + " px-2 py-0.5 rounded-full text-xs"
                                : "text-poi-ocean"
                        }`}>
                            {item.value}{item.unit || ""}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
