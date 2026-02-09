/**
 * SignalK Service for POI Laboratory
 * Connects to SignalK server to retrieve pond sensor data from ESP32
 */

const getSignalKBaseUrl = () => {
    if (typeof window === "undefined") {
        return process.env.NEXT_PUBLIC_SIGNALK_URL || "http://localhost:3000";
    }
    
    const envUrl = process.env.NEXT_PUBLIC_SIGNALK_URL;
    if (envUrl) {
        return envUrl;
    }
    
    return window.location.origin;
};

const normalizeHumidityPercent = (humidity) => {
    if (humidity === null || humidity === undefined || isNaN(humidity)) {
        return null;
    }

    if (humidity <= 1.5) {
        return humidity * 100;
    }

    return humidity;
};

/**
 * Make an API call to SignalK server
 */
const apiCall = async (path, options = {}) => {
    const baseUrl = getSignalKBaseUrl();
    const url = `${baseUrl}${path}`;

    try {
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            throw new Error(`SignalK API error (${response.status}): ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        if (error.name === "TypeError" && error.message === "Failed to fetch") {
            const networkError = new Error(`SignalK server unreachable at ${baseUrl}`);
            networkError.name = "NetworkError";
            throw networkError;
        }
        throw error;
    }
};

/**
 * Get SignalK path value
 */
export const getSignalKValue = async (signalkPath) => {
    const path = `/signalk/v1/api/vessels/self/${signalkPath.replace(/\./g, "/")}`;
    try {
        const data = await apiCall(path);
        return data?.value ?? data;
    } catch (error) {
        console.warn(`[SignalKService] Failed to get ${signalkPath}:`, error.message);
        return null;
    }
};

/**
 * Pond data paths from ESP32 sensor
 * Matches paths defined in signalk_esp_pond_sensor.ino
 */
const POND_PATHS = {
    waterTemperature: "tanks.liveWell.pond.temperature",
    waterTemperature1: "tanks.liveWell.pond1.temperature",
    waterTemperature2: "tanks.liveWell.pond2.temperature",
    waterPh: "tanks.liveWell.pond.ph",
    waterConductivity: "tanks.liveWell.pond.conductivity",
    waterLevel: "tanks.liveWell.pond.currentLevel",
    lightLevel: "environment.inside.pond.illuminance",
    airTemperature: "environment.inside.pond.temperature",
    airHumidity: "environment.outside.relativeHumidity",
    airPressure: "environment.inside.pond.pressure"
};

/**
 * Get all pond sensor data from SignalK
 */
export const getPondData = async () => {
    try {
        const results = {};
        for (const [key, path] of Object.entries(POND_PATHS)) {
            results[key] = await getSignalKValue(path);
        }

        const newData = {
            water: {
                temperature: results.waterTemperature,
                temperature1: results.waterTemperature1,
                temperature2: results.waterTemperature2,
                ph: results.waterPh,
                conductivity: results.waterConductivity,
                level: results.waterLevel
            },
            light: {
                level: results.lightLevel
            },
            air: {
                temperature: results.airTemperature,
                humidity: normalizeHumidityPercent(results.airHumidity),
                pressure: results.airPressure ? results.airPressure / 100 : null
            },
            timestamp: new Date().toISOString()
        };

        return newData;
    } catch (error) {
        console.error("[SignalKService] Failed to get pond data:", error.message);
        throw error;
    }
};

/**
 * Check if SignalK server is reachable
 */
export const checkServerAvailability = async () => {
    try {
        const baseUrl = getSignalKBaseUrl();
        const response = await fetch(`${baseUrl}/signalk`, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        return response.ok;
    } catch (error) {
        return false;
    }
};

/**
 * Create WebSocket connection for real-time updates
 */
export const createPondWebSocket = (onData, onError) => {
    const baseUrl = getSignalKBaseUrl();
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/signalk/v1/stream?subscribe=self";
    
    let ws = null;
    let reconnectTimeout = null;
    
    const connect = () => {
        try {
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                console.log("[SignalK WebSocket] Connected");
                const subscription = {
                    context: "vessels.self",
                    subscribe: [
                        { path: "environment.inside.pond.*" },
                        { path: "environment.outside.relativeHumidity" }
                    ]
                };
                ws.send(JSON.stringify(subscription));
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.updates) {
                        const pondData = parseDeltaUpdate(data.updates);
                        if (Object.keys(pondData).length > 0) {
                            onData(pondData);
                        }
                    }
                } catch (e) {
                    console.warn("[SignalK WebSocket] Parse error:", e);
                }
            };
            
            ws.onerror = (error) => {
                console.warn("[SignalK WebSocket] Connection error");
                if (onError) onError(error);
            };
            
            ws.onclose = () => {
                console.log("[SignalK WebSocket] Disconnected, reconnecting in 5s...");
                reconnectTimeout = setTimeout(connect, 5000);
            };
        } catch (error) {
            console.warn("[SignalK WebSocket] Connection failed");
            reconnectTimeout = setTimeout(connect, 5000);
        }
    };
    
    connect();
    
    return {
        close: () => {
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (ws) ws.close();
        }
    };
};

/**
 * Parse SignalK delta update to pond data structure
 */
const parseDeltaUpdate = (updates) => {
    const result = {};
    
    for (const update of updates) {
        if (!update.values) continue;
        
        for (const value of update.values) {
            const path = value.path;
            
            if (path === "tanks.liveWell.pond.temperature") {
                result.waterTemperature = value.value;
            } else if (path === "tanks.liveWell.pond1.temperature") {
                result.waterTemperature1 = value.value;
            } else if (path === "tanks.liveWell.pond2.temperature") {
                result.waterTemperature2 = value.value;
            } else if (path === "tanks.liveWell.pond.ph") {
                result.waterPh = value.value;
            } else if (path === "tanks.liveWell.pond.conductivity") {
                result.waterConductivity = value.value;
            } else if (path === "tanks.liveWell.pond.currentLevel") {
                result.waterLevel = value.value;
            } else if (path === "environment.inside.pond.illuminance") {
                result.lightLevel = value.value;
            } else if (path === "environment.inside.pond.temperature") {
                result.airTemperature = value.value;
            } else if (path === "environment.outside.relativeHumidity") {
                result.airHumidity = normalizeHumidityPercent(value.value);
            } else if (path === "environment.inside.pond.pressure") {
                result.airPressure = value.value;
            }
        }
    }
    
    return result;
};

export default {
    getSignalKBaseUrl,
    getSignalKValue,
    getPondData,
    checkServerAvailability,
    createPondWebSocket
};
