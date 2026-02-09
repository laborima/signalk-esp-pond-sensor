"use client";

/**
 * List component for fish and plant recommendations
 */
export default function RecommendationList({ title, icon, items, type = "fish" }) {
    if (!items || items.length === 0) {
        return null;
    }
    
    const headerGradient = type === "fish" 
        ? "from-poi-ocean to-poi-sage" 
        : "from-poi-ocean via-poi-coral/80 to-poi-sage";
    
    return (
        <div className="bg-poi-surface rounded-2xl shadow-sm border border-poi-sage/20 overflow-hidden">
            <div className={`bg-gradient-to-r ${headerGradient} px-5 py-4`}>
                <h3 className="text-poi-surface font-semibold flex items-center gap-2">
                    <span className="text-2xl">{icon}</span>
                    {title}
                    <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">
                        {items.length}
                    </span>
                </h3>
            </div>
            
            <div className="divide-y divide-poi-sage/10">
                {items.map((item, index) => (
                    <div 
                        key={item.id || index}
                        className={`p-4 transition-colors ${
                            type === "fish" 
                                ? (item.compatible ? "hover:bg-poi-sage/10" : "hover:bg-poi-terra/10 opacity-60")
                                : (item.suitable ? "hover:bg-poi-sage/10" : "hover:bg-poi-terra/10 opacity-60")
                        }`}
                    >
                        <div className="flex items-start gap-3">
                            <span className="text-3xl">{item.emoji}</span>
                            <div className="flex-1">
                                <div className="flex items-center justify-between flex-wrap gap-1">
                                    <h4 className="font-medium text-poi-ocean">
                                        {item.name}
                                        {type === "fish" && item.count && (
                                            <span className="ml-2 text-xs text-poi-text/50 font-normal">
                                                x{item.count} • Bassin {item.basin}
                                            </span>
                                        )}
                                    </h4>
                                    {type === "fish" ? (
                                        <span className={`text-xs px-2 py-1 rounded-full ${
                                            item.compatible 
                                                ? item.comfort === "optimal" 
                                                    ? "bg-poi-sage/20 text-poi-ocean"
                                                    : "bg-poi-coral/20 text-poi-bark"
                                                : "bg-poi-terra/20 text-poi-bark"
                                        }`}>
                                            {item.compatible 
                                                ? item.comfort === "optimal" ? "Idéal" : "Compatible"
                                                : "Incompatible"
                                            }
                                        </span>
                                    ) : (
                                        <span className={`text-xs px-2 py-1 rounded-full ${
                                            item.suitable 
                                                ? "bg-poi-sage/20 text-poi-ocean"
                                                : "bg-poi-terra/20 text-poi-bark"
                                        }`}>
                                            {item.suitable ? "Recommandé" : "Déconseillé"}
                                        </span>
                                    )}
                                </div>
                                
                                {item.temperature && item.temperature.ideal && (
                                    <div className="mt-2 text-xs text-poi-text/70 space-y-1">
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="flex items-center gap-1">
                                                <span className="font-medium">🌡️</span>
                                                <span className="bg-poi-coral/15 px-2 py-0.5 rounded">
                                                    {item.temperature.ideal.min}°C - {item.temperature.ideal.max}°C
                                                </span>
                                            </span>
                                            {item.ph && item.ph.ideal && (
                                                <span className="flex items-center gap-1">
                                                    <span className="font-medium">⚗️</span>
                                                    <span className="bg-poi-coral/15 px-2 py-0.5 rounded">
                                                        pH {item.ph.ideal.min} - {item.ph.ideal.max}
                                                    </span>
                                                </span>
                                            )}
                                        </div>
                                        {item.plantation && (
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span className="flex items-center gap-1">
                                                    <span className="font-medium">🌱</span>
                                                    <span className="bg-poi-sage/15 px-2 py-0.5 rounded">
                                                        Plantation: {item.plantation}
                                                    </span>
                                                </span>
                                                {item.recolte && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="font-medium">🧺</span>
                                                        <span className="bg-poi-sun/20 px-2 py-0.5 rounded">
                                                            Récolte: {item.recolte}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {item.notes && item.notes.length > 0 && (
                                    <p className="text-sm text-poi-text/60 mt-1">
                                        {item.notes.join(" • ")}
                                    </p>
                                )}
                                
                                {item.benefits && item.benefits.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {item.benefits.map((benefit, i) => (
                                            <span 
                                                key={i}
                                                className="text-xs bg-poi-ocean/10 text-poi-ocean px-2 py-0.5 rounded-full"
                                            >
                                                {benefit}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
