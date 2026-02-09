"use client";

/**
 * Card for displaying air/atmospheric data
 */
export default function AirDataCard({ temperature, humidity, pressure }) {
    const formatValue = (value, decimals = 1) => {
        if (value === null || value === undefined || isNaN(value)) return "--";
        return value.toFixed(decimals);
    };
    
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between bg-poi-sand/50 rounded-lg px-4 py-3">
                <p className="text-sm text-poi-text/60">Température air</p>
                <p className="text-xl font-bold text-poi-ocean">
                    {formatValue(temperature)}°C
                </p>
            </div>
            <div className="flex items-center justify-between bg-poi-sand/50 rounded-lg px-4 py-3">
                <p className="text-sm text-poi-text/60">Humidité</p>
                <p className="text-xl font-bold text-poi-ocean">
                    {formatValue(humidity, 0)}%
                </p>
            </div>
            <div className="flex items-center justify-between bg-poi-sand/50 rounded-lg px-4 py-3">
                <p className="text-sm text-poi-text/60">Pression</p>
                <p className="text-xl font-bold text-poi-ocean">
                    {formatValue(pressure, 0)} hPa
                </p>
            </div>
        </div>
    );
}
