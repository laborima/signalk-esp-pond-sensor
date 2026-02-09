"use client";

import { useMemo } from "react";
import usePondData from "./hooks/usePondData";
import GaugeCard from "./components/GaugeCard";
import AnimatedFish from "./components/AnimatedFish";
import WaterWaves from "./components/WaterWaves";
import AdviceCard from "./components/AdviceCard";
import RecommendationList from "./components/RecommendationList";
import DerivedDataCard from "./components/DerivedDataCard";
import ConnectionStatus from "./components/ConnectionStatus";
import HealthScore from "./components/HealthScore";
import AirDataCard from "./components/AirDataCard";
import WaterLevelCard from "./components/WaterLevelCard";
import { 
    OPTIMAL_RANGES,
    getPondHealthScore,
    getFishRecommendations,
    getPlantRecommendations,
    getAquaponieRecommendations,
    getAdvice,
    getDerivedData
} from "./services/pondAdvisorService";

export default function Home() {
    const { data, loading, error, connected, lastUpdate, refresh } = usePondData();
    
    const healthScore = useMemo(() => getPondHealthScore(data), [data]);
    const fishRecommendations = useMemo(() => getFishRecommendations(data), [data]);
    const plantRecommendations = useMemo(() => getPlantRecommendations(data), [data]);
    const aquaponieRecommendations = useMemo(() => getAquaponieRecommendations(data), [data]);
    const advice = useMemo(() => getAdvice(data), [data]);
    const derivedData = useMemo(() => getDerivedData(data), [data]);
    
    if (loading && !data) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-poi-coral/10 via-poi-sand to-poi-sage/20 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-poi-ocean border-t-transparent mx-auto mb-4" />
                    <p className="text-poi-ocean font-medium">Connexion à SignalK...</p>
                </div>
            </div>
        );
    }
    
    return (
        <WaterWaves className="min-h-screen bg-gradient-to-b from-poi-coral/15 via-poi-sand to-poi-surface">
            <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
                <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <img src="./logo.png" alt="POI Laboratory" className="h-14" />
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-poi-ocean via-poi-coral to-poi-sage bg-clip-text text-transparent">
                                POI Laboratory
                            </h1>
                            <p className="text-poi-text/70 mt-1">Monitoring du bassin en temps réel</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <ConnectionStatus connected={connected} lastUpdate={lastUpdate} />
                        <button 
                            onClick={refresh}
                            className="p-2 rounded-full bg-poi-surface shadow-sm hover:shadow-md transition-shadow border border-poi-sage/30"
                            title="Actualiser"
                        >
                            <svg className="w-5 h-5 text-poi-ocean" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                </header>
                
                {error && (
                    <div className="bg-poi-terra/10 border border-poi-terra/30 rounded-xl p-4 mb-6 flex items-center gap-3">
                        <span className="text-2xl">⚠️</span>
                        <div>
                            <p className="font-medium text-poi-bark">Erreur de connexion</p>
                            <p className="text-sm text-poi-terra">{error}</p>
                        </div>
                    </div>
                )}
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="lg:col-span-2">
                        <AnimatedFish healthScore={healthScore.score} size="lg" />
                    </div>
                    <div>
                        <HealthScore score={healthScore.score} status={healthScore.status} />
                    </div>
                </div>
                
                <section className="mb-8 bg-poi-surface rounded-2xl shadow-sm border border-poi-sage/20 overflow-hidden">
                    <div className="bg-gradient-to-r from-poi-ocean to-poi-sage px-5 py-4">
                        <h2 className="text-poi-surface font-semibold">
                            Paramètres de l'eau
                        </h2>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <GaugeCard
                                title="Température"
                                value={data?.water?.temperature}
                                unit="°C"
                                min={OPTIMAL_RANGES.temperature.min}
                                max={OPTIMAL_RANGES.temperature.max}
                                optimalMin={OPTIMAL_RANGES.temperature.ideal.min}
                                optimalMax={OPTIMAL_RANGES.temperature.ideal.max}
                            />
                            <GaugeCard
                                title="pH"
                                value={data?.water?.ph}
                                unit=""
                                min={OPTIMAL_RANGES.ph.min}
                                max={OPTIMAL_RANGES.ph.max}
                                optimalMin={OPTIMAL_RANGES.ph.ideal.min}
                                optimalMax={OPTIMAL_RANGES.ph.ideal.max}
                            />
                            <GaugeCard
                                title="Conductivité"
                                value={data?.water?.conductivity}
                                unit="µS/cm"
                                min={OPTIMAL_RANGES.conductivity.min}
                                max={OPTIMAL_RANGES.conductivity.max}
                                optimalMin={OPTIMAL_RANGES.conductivity.ideal.min}
                                optimalMax={OPTIMAL_RANGES.conductivity.ideal.max}
                                decimals={0}
                            />
                            <GaugeCard
                                title="Luminosité"
                                value={data?.light?.level}
                                unit="lux"
                                min={0}
                                max={15000}
                                optimalMin={OPTIMAL_RANGES.lightLevel.ideal.min}
                                optimalMax={OPTIMAL_RANGES.lightLevel.ideal.max}
                                decimals={0}
                            />
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <WaterLevelCard level={data?.water?.level} alertLow={0.3} alertHigh={0.9} />
                            <div className="rounded-xl bg-poi-sand/30 border border-poi-sage/20 p-4">
                                <h4 className="text-sm font-semibold text-poi-ocean/70 mb-3">Conditions atmosphériques</h4>
                                <AirDataCard 
                                    temperature={data?.air?.temperature}
                                    humidity={data?.air?.humidity}
                                    pressure={data?.air?.pressure}
                                />
                            </div>
                        </div>
                        
                        {derivedData && Object.keys(derivedData).length > 0 && (
                            <DerivedDataCard data={derivedData} />
                        )}
                    </div>
                </section>
                
                {advice && advice.length > 0 && (
                    <section className="mb-8 bg-poi-surface rounded-2xl shadow-sm border border-poi-sage/20 overflow-hidden">
                        <div className="bg-gradient-to-r from-poi-ocean to-poi-sage px-5 py-4">
                            <h2 className="text-poi-surface font-semibold">Conseils</h2>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {advice.map((item, index) => (
                                <AdviceCard key={index} advice={item} />
                            ))}
                        </div>
                    </section>
                )}
                
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <RecommendationList 
                        title="Poissons du bassin"
                        icon="🐟"
                        items={fishRecommendations}
                        type="fish"
                    />
                    <RecommendationList 
                        title="Plantes aquatiques"
                        icon="🌿"
                        items={plantRecommendations}
                        type="plant"
                    />
                </section>
                
                <section className="mb-8">
                    <RecommendationList 
                        title="Potager aquaponie — Billes d'argile"
                        icon="🌱"
                        items={aquaponieRecommendations}
                        type="plant"
                    />
                </section>
                
                <footer className="text-center text-poi-text/50 text-sm py-8 border-t border-poi-coral/20">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <img src="./logo.png" alt="POI" className="w-6 h-6 rounded-full opacity-60" />
                        <p className="font-medium text-poi-ocean/60">POI Laboratory</p>
                    </div>
                    <p>Données SignalK via ESP32</p>
                </footer>
            </div>
        </WaterWaves>
    );
}
