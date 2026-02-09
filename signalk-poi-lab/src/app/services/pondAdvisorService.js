/**
 * Pond Advisor Service
 * Provides recommendations and health analysis for pond ecosystem
 */

/**
 * Optimal ranges for pond parameters
 * Bassin extérieur: température acceptable de 8°C à 30°C (hiver à été)
 */
export const OPTIMAL_RANGES = {
    temperature: { min: 8, max: 30, ideal: { min: 15, max: 25 }, unit: "°C" },
    ph: { min: 6.0, max: 8.0, ideal: { min: 6.5, max: 7.5 }, unit: "" },
    conductivity: { min: 200, max: 2000, ideal: { min: 400, max: 1500 }, unit: "µS/cm" },
    lightLevel: { min: 500, max: 10000, ideal: { min: 2000, max: 8000 }, unit: "lux" },
    airHumidity: { min: 40, max: 80, ideal: { min: 50, max: 70 }, unit: "%" }
};

/**
 * Fish species recommendations based on water parameters
 * Bassin 1: Petits poissons d'eau froide
 * Bassin 2: Carpes et poissons de bassin
 */
const FISH_SPECIES = {
    notropisChrosomus: {
        name: "Notropis chrosomus (Rainbow Shiner)",
        emoji: "🐟",
        basin: 1,
        count: 5,
        temperature: { min: 10, max: 25, ideal: { min: 15, max: 22 } },
        ph: { min: 6.5, max: 7.5, ideal: { min: 6.8, max: 7.2 } },
        conductivity: { min: 200, max: 1200 }
    },
    tanichthysAlbonubes: {
        name: "Tanichthys albonubes (White Cloud)",
        emoji: "🐠",
        basin: 1,
        count: 15,
        temperature: { min: 5, max: 25, ideal: { min: 15, max: 22 } },
        ph: { min: 6.0, max: 8.0, ideal: { min: 6.5, max: 7.5 } },
        conductivity: { min: 150, max: 1000 }
    },
    medaka: {
        name: "Medaka clairs (Oryzias latipes)",
        emoji: "🐡",
        basin: 1,
        count: 12,
        temperature: { min: 5, max: 30, ideal: { min: 18, max: 25 } },
        ph: { min: 6.5, max: 8.0, ideal: { min: 7.0, max: 7.5 } },
        conductivity: { min: 200, max: 1500 }
    },
    locheRiviere: {
        name: "Loche de rivière",
        emoji: "🐍",
        basin: 1,
        count: 2,
        temperature: { min: 5, max: 22, ideal: { min: 12, max: 20 } },
        ph: { min: 6.5, max: 7.5, ideal: { min: 6.8, max: 7.2 } },
        conductivity: { min: 200, max: 1000 }
    },
    koi: {
        name: "Carpes Koï",
        emoji: "🎏",
        basin: 2,
        count: 4,
        temperature: { min: 4, max: 30, ideal: { min: 15, max: 25 } },
        ph: { min: 6.5, max: 8.5, ideal: { min: 7.0, max: 7.5 } },
        conductivity: { min: 200, max: 2000 }
    },
    carpe: {
        name: "Carpes communes",
        emoji: "🐟",
        basin: 2,
        count: 4,
        temperature: { min: 4, max: 30, ideal: { min: 15, max: 25 } },
        ph: { min: 6.5, max: 8.5, ideal: { min: 7.0, max: 7.8 } },
        conductivity: { min: 200, max: 2000 }
    },
    comet: {
        name: "Comètes",
        emoji: "⭐",
        basin: 2,
        count: 4,
        temperature: { min: 2, max: 30, ideal: { min: 15, max: 24 } },
        ph: { min: 6.0, max: 8.0, ideal: { min: 7.0, max: 7.5 } },
        conductivity: { min: 200, max: 1500 }
    },
    shubunkin: {
        name: "Shubunkins",
        emoji: "🎨",
        basin: 2,
        count: 2,
        temperature: { min: 2, max: 28, ideal: { min: 12, max: 22 } },
        ph: { min: 6.5, max: 8.0, ideal: { min: 7.0, max: 7.5 } },
        conductivity: { min: 200, max: 1500 }
    },
    gardon: {
        name: "Gardons",
        emoji: "🪻",
        basin: 2,
        count: 4,
        temperature: { min: 4, max: 28, ideal: { min: 12, max: 24 } },
        ph: { min: 6.5, max: 8.0, ideal: { min: 7.0, max: 7.5 } },
        conductivity: { min: 200, max: 1500 }
    },
    neocaridina: {
        name: "Crevettes Neocaridina",
        emoji: "🦐",
        basin: 1,
        count: 10,
        temperature: { min: 10, max: 28, ideal: { min: 18, max: 24 } },
        ph: { min: 6.5, max: 8.0, ideal: { min: 7.0, max: 7.5 } },
        conductivity: { min: 150, max: 500 }
    }
};

/**
 * Plant recommendations based on conditions
 * Plantes actuelles dans les bassins
 */
const AQUATIC_PLANTS = {
    nenuphar: {
        name: "Nénuphar",
        emoji: "🪷",
        temperature: { min: 15, max: 30, ideal: { min: 18, max: 26 } },
        ph: { min: 6.5, max: 7.5, ideal: { min: 6.8, max: 7.2 } },
        light: { min: 4000 },
        benefits: ["Ombre pour poissons", "Oxygénation", "Esthétique", "Filtration naturelle"]
    },
    myriophylleBresil: {
        name: "Myriophylle du Brésil",
        emoji: "🌿",
        temperature: { min: 10, max: 28, ideal: { min: 18, max: 25 } },
        ph: { min: 6.0, max: 7.5, ideal: { min: 6.5, max: 7.0 } },
        light: { min: 2000 },
        benefits: ["Oxygénation intense", "Anti-algues", "Refuge pour alevins", "Filtration nitrates"]
    },
    ceratophylle: {
        name: "Cératophylle immergée",
        emoji: "🌱",
        temperature: { min: 5, max: 30, ideal: { min: 15, max: 25 } },
        ph: { min: 6.0, max: 8.0, ideal: { min: 6.5, max: 7.5 } },
        light: { min: 1000 },
        benefits: ["Oxygénation maximale", "Anti-algues puissant", "Refuge pour alevins", "Absorbe nitrates"]
    },
    marimo: {
        name: "Boule de mousse Marimo",
        emoji: "🟢",
        temperature: { min: 5, max: 25, ideal: { min: 15, max: 22 } },
        ph: { min: 6.0, max: 8.0, ideal: { min: 6.5, max: 7.5 } },
        light: { min: 500 },
        benefits: ["Filtration naturelle", "Décoratif", "Absorbe nitrates", "Peu d'entretien"]
    },
    butomus: {
        name: "Jonc fleuri (Butomus umbellatus)",
        emoji: "🌸",
        count: 4,
        temperature: { min: 5, max: 30, ideal: { min: 15, max: 25 } },
        ph: { min: 6.0, max: 8.0, ideal: { min: 6.5, max: 7.5 } },
        light: { min: 3000 },
        benefits: ["Floraison rose", "Filtration naturelle", "Berges stabilisées", "Mellifère"]
    },
    typha: {
        name: "Massette (Typha latifolia)",
        emoji: "🌾",
        count: 4,
        temperature: { min: 0, max: 35, ideal: { min: 10, max: 28 } },
        ph: { min: 5.5, max: 8.5, ideal: { min: 6.0, max: 7.5 } },
        light: { min: 3000 },
        benefits: ["Filtration puissante", "Absorbe métaux lourds", "Refuge faune", "Très rustique"]
    },
    pontederia: {
        name: "Épiaire (Pontederia cordata)",
        emoji: "💜",
        count: 4,
        temperature: { min: 5, max: 30, ideal: { min: 15, max: 25 } },
        ph: { min: 6.0, max: 8.0, ideal: { min: 6.5, max: 7.5 } },
        light: { min: 4000 },
        benefits: ["Floraison bleue/violette", "Filtration nitrates", "Mellifère", "Esthétique"]
    },
    pontederiaPink: {
        name: "Épiaire rose (Pontederia cordata Pink Pons)",
        emoji: "🌺",
        count: 4,
        temperature: { min: 5, max: 30, ideal: { min: 15, max: 25 } },
        ph: { min: 6.0, max: 8.0, ideal: { min: 6.5, max: 7.5 } },
        light: { min: 4000 },
        benefits: ["Floraison rose", "Filtration nitrates", "Mellifère", "Esthétique"]
    },
    equisetum: {
        name: "Prêle du Japon (Equisetum japonicum)",
        emoji: "🎋",
        count: 4,
        temperature: { min: -10, max: 30, ideal: { min: 10, max: 25 } },
        ph: { min: 5.5, max: 7.5, ideal: { min: 6.0, max: 7.0 } },
        light: { min: 2000 },
        benefits: ["Graphique et structurant", "Très rustique", "Filtration naturelle", "Persistant"]
    },
    salade: {
        name: "Laitue",
        emoji: "🥬",
        aquaponie: true,
        temperature: { min: 10, max: 25, ideal: { min: 15, max: 20 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 4000 },
        plantation: "Mars - Septembre",
        recolte: "Avril - Novembre",
        benefits: ["Croissance rapide", "Idéale en billes d'argile", "Peu exigeante", "Filtration nitrates"]
    },
    basilic: {
        name: "Basilic",
        emoji: "🌿",
        aquaponie: true,
        temperature: { min: 18, max: 30, ideal: { min: 20, max: 28 } },
        ph: { min: 5.5, max: 6.5, ideal: { min: 5.8, max: 6.5 } },
        light: { min: 5000 },
        plantation: "Avril - Juin",
        recolte: "Juin - Octobre",
        benefits: ["Aromatique", "Excellente en billes d'argile", "Croissance rapide", "Anti-insectes"]
    },
    ciboulette: {
        name: "Ciboulette",
        emoji: "🌱",
        aquaponie: true,
        temperature: { min: 10, max: 25, ideal: { min: 15, max: 22 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 3000 },
        plantation: "Mars - Mai",
        recolte: "Avril - Novembre",
        benefits: ["Aromatique", "Vivace", "Peu exigeante", "Bonne tenue en billes d'argile"]
    },
    fraise: {
        name: "Fraisier",
        emoji: "🍓",
        aquaponie: true,
        temperature: { min: 12, max: 28, ideal: { min: 18, max: 24 } },
        ph: { min: 5.5, max: 6.5, ideal: { min: 5.8, max: 6.2 } },
        light: { min: 5000 },
        plantation: "Mars - Avril",
        recolte: "Mai - Septembre",
        benefits: ["Fruit comestible", "Vivace", "Très adapté aux billes d'argile", "Esthétique"]
    },
    epinard: {
        name: "Épinard",
        emoji: "🥗",
        aquaponie: true,
        temperature: { min: 8, max: 22, ideal: { min: 12, max: 18 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 3000 },
        plantation: "Mars - Mai / Août - Oct.",
        recolte: "Avril - Juin / Sept. - Déc.",
        benefits: ["Riche en nutriments", "Résistant au froid", "Bonne tenue en billes d'argile"]
    },
    blette: {
        name: "Blette (Poirée)",
        emoji: "🥬",
        aquaponie: true,
        temperature: { min: 10, max: 28, ideal: { min: 15, max: 24 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.2, max: 6.8 } },
        light: { min: 4000 },
        plantation: "Avril - Juin",
        recolte: "Juin - Novembre",
        benefits: ["Productive", "Résistante", "Excellente en billes d'argile", "Riche en minéraux"]
    },
    tomate: {
        name: "Tomate cerise",
        emoji: "🍅",
        aquaponie: true,
        temperature: { min: 18, max: 30, ideal: { min: 20, max: 26 } },
        ph: { min: 5.5, max: 6.8, ideal: { min: 5.8, max: 6.5 } },
        light: { min: 6000 },
        plantation: "Mars - Mai",
        recolte: "Juillet - Octobre",
        benefits: ["Production élevée", "Adaptée aux billes d'argile", "Tuteurage nécessaire"]
    },
    persil: {
        name: "Persil",
        emoji: "☘️",
        aquaponie: true,
        temperature: { min: 10, max: 25, ideal: { min: 15, max: 22 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 3000 },
        plantation: "Mars - Août",
        recolte: "Mai - Décembre",
        benefits: ["Aromatique", "Bisannuel", "Riche en vitamines", "Bonne tenue en billes d'argile"]
    },
    chou_kale: {
        name: "Chou Kale",
        emoji: "🥦",
        aquaponie: true,
        temperature: { min: 5, max: 25, ideal: { min: 10, max: 20 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 4000 },
        plantation: "Mars - Juillet",
        recolte: "Juin - Décembre",
        benefits: ["Super-aliment", "Résistant au froid", "Productif", "Adapté aux billes d'argile"]
    },
    pak_choi: {
        name: "Pak Choï",
        emoji: "🥬",
        aquaponie: true,
        temperature: { min: 10, max: 25, ideal: { min: 15, max: 22 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 3000 },
        plantation: "Mars - Septembre",
        recolte: "Avril - Novembre",
        benefits: ["Croissance très rapide", "Idéal en billes d'argile", "Peu exigeant", "Riche en vitamines"]
    },
    mache: {
        name: "Mâche",
        emoji: "🥗",
        aquaponie: true,
        temperature: { min: 5, max: 20, ideal: { min: 10, max: 15 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 2000 },
        plantation: "Août - Octobre",
        recolte: "Octobre - Mars",
        benefits: ["Résistante au froid", "Idéale en billes d'argile", "Culture d'hiver", "Peu exigeante"]
    },
    radis: {
        name: "Radis",
        emoji: "🔴",
        aquaponie: true,
        temperature: { min: 8, max: 22, ideal: { min: 12, max: 18 } },
        ph: { min: 6.0, max: 7.0, ideal: { min: 6.0, max: 6.8 } },
        light: { min: 3000 },
        plantation: "Mars - Septembre",
        recolte: "Avril - Octobre (30 jours)",
        benefits: ["Récolte ultra-rapide", "Parfait en billes d'argile", "Facile", "Peu d'espace"]
    }
};

/**
 * Evaluate parameter status
 */
export const evaluateParameter = (value, range) => {
    if (value === null || value === undefined || isNaN(value)) {
        return { status: "unknown", score: 0, message: "Données non disponibles" };
    }
    
    if (value < range.min || value > range.max) {
        return { 
            status: "critical", 
            score: 0,
            message: value < range.min ? "Trop bas - Action urgente requise" : "Trop élevé - Action urgente requise"
        };
    }
    
    if (range.ideal) {
        if (value >= range.ideal.min && value <= range.ideal.max) {
            return { status: "optimal", score: 100, message: "Conditions idéales" };
        }
        
        const distanceFromIdeal = value < range.ideal.min 
            ? range.ideal.min - value 
            : value - range.ideal.max;
        const maxDistance = Math.max(range.ideal.min - range.min, range.max - range.ideal.max);
        const score = Math.round(100 - (distanceFromIdeal / maxDistance) * 50);
        
        return { 
            status: "acceptable", 
            score,
            message: value < range.ideal.min ? "Légèrement bas" : "Légèrement élevé"
        };
    }
    
    return { status: "acceptable", score: 75, message: "Dans la plage acceptable" };
};

/**
 * Get overall pond health score
 */
export const getPondHealthScore = (data) => {
    if (!data || !data.water) return { score: 0, status: "unknown" };
    
    const evaluations = [];
    
    if (data.water.temperature !== null) {
        evaluations.push(evaluateParameter(data.water.temperature, OPTIMAL_RANGES.temperature));
    }
    if (data.water.ph !== null) {
        evaluations.push(evaluateParameter(data.water.ph, OPTIMAL_RANGES.ph));
    }
    if (data.water.conductivity !== null) {
        evaluations.push(evaluateParameter(data.water.conductivity, OPTIMAL_RANGES.conductivity));
    }
    
    if (evaluations.length === 0) {
        return { score: 0, status: "unknown" };
    }
    
    const avgScore = evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length;
    const hasCritical = evaluations.some(e => e.status === "critical");
    
    let status = "optimal";
    if (hasCritical) {
        status = "critical";
    } else if (avgScore < 70) {
        status = "warning";
    } else if (avgScore < 90) {
        status = "acceptable";
    }
    
    return { score: Math.round(avgScore), status };
};

/**
 * Get fish recommendations based on current conditions
 */
export const getFishRecommendations = (data) => {
    if (!data || !data.water) return [];
    
    const recommendations = [];
    const temp = data.water.temperature;
    const ph = data.water.ph;
    const ec = data.water.conductivity;
    
    for (const [id, fish] of Object.entries(FISH_SPECIES)) {
        let compatible = true;
        let comfort = "optimal";
        const notes = [];
        
        if (temp !== null) {
            if (temp < fish.temperature.min || temp > fish.temperature.max) {
                compatible = false;
                notes.push(`Température hors plage (${fish.temperature.min}-${fish.temperature.max}°C)`);
            } else if (temp < fish.temperature.ideal.min || temp > fish.temperature.ideal.max) {
                comfort = "acceptable";
                notes.push("Température non idéale");
            }
        }
        
        if (ph !== null && compatible) {
            if (ph < fish.ph.min || ph > fish.ph.max) {
                compatible = false;
                notes.push(`pH hors plage (${fish.ph.min}-${fish.ph.max})`);
            } else if (ph < fish.ph.ideal.min || ph > fish.ph.ideal.max) {
                comfort = "acceptable";
            }
        }
        
        if (ec !== null && compatible) {
            if (ec < fish.conductivity.min || ec > fish.conductivity.max) {
                compatible = false;
                notes.push("Conductivité inadaptée");
            }
        }
        
        recommendations.push({
            id,
            ...fish,
            compatible,
            comfort,
            notes
        });
    }
    
    return recommendations.sort((a, b) => {
        if (a.compatible !== b.compatible) return b.compatible - a.compatible;
        if (a.comfort === "optimal" && b.comfort !== "optimal") return -1;
        if (b.comfort === "optimal" && a.comfort !== "optimal") return 1;
        return 0;
    });
};

/**
 * Evaluate a single plant against current conditions
 */
const evaluatePlant = (id, plant, temp, ph, light, checkLight = false) => {
    let suitable = true;
    let comfort = "optimal";
    const notes = [];
    
    if (temp !== null && temp !== undefined) {
        if (temp < plant.temperature.min || temp > plant.temperature.max) {
            suitable = false;
            notes.push(`Température hors plage (${plant.temperature.min}-${plant.temperature.max}°C)`);
        } else if (plant.temperature.ideal && (temp < plant.temperature.ideal.min || temp > plant.temperature.ideal.max)) {
            comfort = "acceptable";
            notes.push("Température non idéale");
        }
    }
    
    if (ph !== null && ph !== undefined && plant.ph) {
        if (ph < plant.ph.min || ph > plant.ph.max) {
            suitable = false;
            notes.push(`pH hors plage (${plant.ph.min}-${plant.ph.max})`);
        } else if (plant.ph.ideal && (ph < plant.ph.ideal.min || ph > plant.ph.ideal.max)) {
            comfort = "acceptable";
        }
    }
    
    if (checkLight && light !== null && light !== undefined && plant.light?.min) {
        if (light < plant.light.min) {
            suitable = false;
            notes.push(`Luminosité insuffisante (min ${plant.light.min} lux)`);
        }
    }
    
    return { id, ...plant, suitable, comfort, notes };
};

/**
 * Get aquatic plant recommendations based on current conditions
 */
export const getPlantRecommendations = (data) => {
    if (!data) return [];
    
    const temp = data.water?.temperature;
    const ph = data.water?.ph;
    const light = data.light?.level;
    
    const recommendations = Object.entries(AQUATIC_PLANTS)
        .filter(([, plant]) => !plant.aquaponie)
        .map(([id, plant]) => evaluatePlant(id, plant, temp, ph, light));
    
    return recommendations.sort((a, b) => {
        if (a.suitable !== b.suitable) return b.suitable - a.suitable;
        if (a.comfort === "optimal" && b.comfort !== "optimal") return -1;
        if (b.comfort === "optimal" && a.comfort !== "optimal") return 1;
        return 0;
    });
};

/**
 * Get aquaponie plant recommendations based on current conditions
 */
export const getAquaponieRecommendations = (data) => {
    if (!data) return [];
    
    const temp = data.water?.temperature;
    const ph = data.water?.ph;
    const light = data.light?.level;
    
    const recommendations = Object.entries(AQUATIC_PLANTS)
        .filter(([, plant]) => plant.aquaponie)
        .map(([id, plant]) => evaluatePlant(id, plant, temp, ph, light));
    
    return recommendations.sort((a, b) => {
        if (a.suitable !== b.suitable) return b.suitable - a.suitable;
        if (a.comfort === "optimal" && b.comfort !== "optimal") return -1;
        if (b.comfort === "optimal" && a.comfort !== "optimal") return 1;
        return 0;
    });
};

/**
 * Get actionable advice based on current conditions
 */
export const getAdvice = (data) => {
    const advice = [];
    
    if (!data || !data.water) {
        advice.push({
            type: "error",
            icon: "⚠️",
            title: "Données indisponibles",
            message: "Impossible de récupérer les données du capteur. Vérifiez la connexion."
        });
        return advice;
    }
    
    const temp = data.water.temperature;
    const ph = data.water.ph;
    const ec = data.water.conductivity;
    const light = data.light?.level;
    const airTemp = data.air?.temperature;
    
    // Temperature advice - bassin extérieur avec températures hivernales
    if (temp !== null) {
        if (temp < 8) {
            advice.push({
                type: "critical",
                icon: "🥶",
                title: "Eau très froide",
                message: `À ${temp.toFixed(1)}°C, risque de gel. Vérifiez que la surface n'est pas entièrement gelée.`
            });
        } else if (temp < 12) {
            advice.push({
                type: "info",
                icon: "❄️",
                title: "Mode hivernal",
                message: `À ${temp.toFixed(1)}°C, les poissons sont en dormance. Ne pas nourrir.`
            });
        } else if (temp > 28) {
            advice.push({
                type: "critical",
                icon: "🔥",
                title: "Eau trop chaude",
                message: `À ${temp.toFixed(1)}°C, l'oxygène dissous diminue. Ajoutez de l'ombre ou une fontaine.`
            });
        } else if (temp >= 15 && temp <= 25) {
            advice.push({
                type: "success",
                icon: "✅",
                title: "Température idéale",
                message: "Les conditions sont parfaites pour la plupart des poissons de bassin."
            });
        }
    }
    
    // pH advice
    if (ph !== null) {
        if (ph < 6.0) {
            advice.push({
                type: "critical",
                icon: "⚗️",
                title: "pH trop acide",
                message: "Ajoutez du calcaire ou des coquilles d'huîtres broyées pour remonter le pH."
            });
        } else if (ph > 7.5) {
            advice.push({
                type: "warning",
                icon: "⚗️",
                title: "pH trop alcalin",
                message: "Ajoutez de la tourbe ou du bois flotté pour acidifier légèrement l'eau."
            });
        }
    }
    
    // Conductivity advice
    if (ec !== null) {
        if (ec < 400) {
            advice.push({
                type: "info",
                icon: "💧",
                title: "Eau très douce",
                message: "L'eau manque de minéraux. Ajoutez des sels minéraux pour bassin."
            });
        } else if (ec > 1600) {
            advice.push({
                type: "warning",
                icon: "🧂",
                title: "Conductivité élevée",
                message: "Trop de minéraux dissous. Effectuez un changement d'eau partiel."
            });
        }
    }
    
    // Light advice
    if (light !== null) {
        if (light > 10000) {
            advice.push({
                type: "info",
                icon: "☀️",
                title: "Forte luminosité",
                message: "Risque de prolifération d'algues. Les plantes flottantes aideront à filtrer la lumière."
            });
        } else if (light < 500) {
            advice.push({
                type: "info",
                icon: "🌙",
                title: "Faible luminosité",
                message: "Les plantes aquatiques auront du mal à se développer dans ces conditions."
            });
        }
    }
    
    // Temperature differential
    if (temp !== null && airTemp !== null) {
        const diff = Math.abs(temp - airTemp);
        if (diff > 10) {
            advice.push({
                type: "info",
                icon: "🌡️",
                title: "Écart thermique important",
                message: `${diff.toFixed(1)}°C d'écart entre l'eau et l'air. L'eau se réchauffera/refroidira progressivement.`
            });
        }
    }
    
    // Seasonal feeding advice based on temperature
    if (temp !== null) {
        if (temp < 8) {
            advice.push({
                type: "warning",
                icon: "🍽️",
                title: "Pas d'alimentation",
                message: "Ne nourrissez pas les poissons. Température trop basse pour la digestion."
            });
        } else if (temp >= 8 && temp < 12) {
            advice.push({
                type: "info",
                icon: "🍽️",
                title: "Alimentation hivernale",
                message: "Nourriture spéciale hiver 1 fois par semaine maximum si les poissons sont actifs."
            });
        } else if (temp >= 12 && temp < 15) {
            advice.push({
                type: "info",
                icon: "🍽️",
                title: "Alimentation réduite",
                message: "Nourrissez 2-3 fois par semaine avec une nourriture facilement digestible."
            });
        } else if (temp >= 15 && temp <= 28) {
            advice.push({
                type: "info",
                icon: "🍽️",
                title: "Période d'alimentation active",
                message: "Nourrissez 2-3 fois par jour. C'est la période de croissance optimale."
            });
        }
    }
    
    return advice;
};

/**
 * Calculate derived/interpolated data
 */
export const getDerivedData = (data) => {
    if (!data) return {};
    
    const derived = {};
    
    // Oxygen saturation estimation based on temperature
    if (data.water?.temperature !== null) {
        const temp = data.water.temperature;
        // Simplified oxygen saturation formula (mg/L at sea level)
        const oxygenSaturation = 14.6 - (0.4 * temp) + (0.0045 * temp * temp);
        derived.estimatedOxygen = {
            value: Math.max(0, oxygenSaturation).toFixed(1),
            unit: "mg/L",
            label: "O₂ dissous estimé"
        };
    }
    
    // Dew point calculation
    if (data.air?.temperature !== null && data.air?.humidity !== null) {
        const T = data.air.temperature;
        const RH = data.air.humidity;
        const a = 17.27;
        const b = 237.7;
        const alpha = ((a * T) / (b + T)) + Math.log(RH / 100);
        const dewPoint = (b * alpha) / (a - alpha);
        derived.dewPoint = {
            value: dewPoint.toFixed(1),
            unit: "°C",
            label: "Point de rosée"
        };
    }
    
    // Heat index (feels like) for air
    if (data.air?.temperature !== null && data.air?.humidity !== null) {
        const T = data.air.temperature;
        const RH = data.air.humidity;
        let heatIndex = T;
        if (T >= 27 && RH >= 40) {
            heatIndex = -8.785 + 1.611 * T + 2.339 * RH - 0.146 * T * RH;
        }
        derived.heatIndex = {
            value: heatIndex.toFixed(1),
            unit: "°C",
            label: "Ressenti"
        };
    }
    
    // Evaporation risk
    if (data.water?.temperature !== null && data.air?.temperature !== null && data.air?.humidity !== null) {
        const waterTemp = data.water.temperature;
        const airTemp = data.air.temperature;
        const humidity = data.air.humidity;
        
        let evaporationRisk = "faible";
        if (waterTemp > airTemp && humidity < 50) {
            evaporationRisk = "élevé";
        } else if (waterTemp > airTemp || humidity < 60) {
            evaporationRisk = "modéré";
        }
        
        derived.evaporationRisk = {
            value: evaporationRisk,
            label: "Risque d'évaporation"
        };
    }
    
    // Algae growth risk
    if (data.water?.temperature !== null && data.light?.level !== null) {
        const temp = data.water.temperature;
        const light = data.light.level;
        
        let algaeRisk = "faible";
        if (temp > 25 && light > 8000) {
            algaeRisk = "élevé";
        } else if (temp > 20 && light > 5000) {
            algaeRisk = "modéré";
        }
        
        derived.algaeRisk = {
            value: algaeRisk,
            label: "Risque algues"
        };
    }
    
    return derived;
};

export default {
    OPTIMAL_RANGES,
    evaluateParameter,
    getPondHealthScore,
    getFishRecommendations,
    getPlantRecommendations,
    getAquaponieRecommendations,
    getAdvice,
    getDerivedData
};
