"use client";

/**
 * Card component for displaying advice and recommendations
 */
export default function AdviceCard({ advice }) {
    const typeStyles = {
        success: {
            bg: "bg-poi-sage/10",
            border: "border-poi-sage/30",
            iconBg: "bg-poi-sage/20",
            title: "text-poi-ocean",
            text: "text-poi-ocean/80"
        },
        warning: {
            bg: "bg-poi-coral/10",
            border: "border-poi-coral/30",
            iconBg: "bg-poi-coral/20",
            title: "text-poi-bark",
            text: "text-poi-bark/80"
        },
        critical: {
            bg: "bg-poi-terra/10",
            border: "border-poi-terra/30",
            iconBg: "bg-poi-terra/20",
            title: "text-poi-bark",
            text: "text-poi-terra"
        },
        info: {
            bg: "bg-poi-ocean/5",
            border: "border-poi-ocean/20",
            iconBg: "bg-poi-ocean/10",
            title: "text-poi-ocean",
            text: "text-poi-ocean/80"
        },
        error: {
            bg: "bg-poi-sand",
            border: "border-poi-text/20",
            iconBg: "bg-poi-text/10",
            title: "text-poi-text",
            text: "text-poi-text/70"
        }
    };
    
    const styles = typeStyles[advice.type] || typeStyles.info;
    
    return (
        <div className={`${styles.bg} ${styles.border} border rounded-xl p-4 transition-all duration-300 hover:shadow-md`}>
            <div className="flex items-start gap-3">
                <div className={`${styles.iconBg} w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0`}>
                    <span className="text-xl">{advice.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold ${styles.title} mb-1`}>
                        {advice.title}
                    </h4>
                    <p className={`text-sm ${styles.text} leading-relaxed`}>
                        {advice.message}
                    </p>
                </div>
            </div>
        </div>
    );
}
