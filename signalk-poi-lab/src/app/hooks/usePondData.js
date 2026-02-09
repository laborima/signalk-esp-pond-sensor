"use client";

import { useState, useEffect, useCallback } from "react";
import { getPondData, checkServerAvailability } from "../services/signalkService";

/**
 * Custom hook for managing pond data via REST polling
 * Polls SignalK server at the given interval (default 60s)
 */
export default function usePondData(pollingInterval = 60000) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [connected, setConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    
    const fetchData = useCallback(async () => {
        try {
            const isAvailable = await checkServerAvailability();
            setConnected(isAvailable);
            
            if (!isAvailable) {
                setError("SignalK server non disponible");
                return;
            }
            
            const pondData = await getPondData();
            setData(prevData => {
                if (!prevData) return pondData;
                const merged = { ...prevData };
                if (pondData.water) {
                    merged.water = { ...merged.water };
                    for (const [key, val] of Object.entries(pondData.water)) {
                        if (val !== null && val !== undefined) {
                            merged.water[key] = val;
                        }
                    }
                }
                if (pondData.light) {
                    merged.light = { ...merged.light };
                    for (const [key, val] of Object.entries(pondData.light)) {
                        if (val !== null && val !== undefined) {
                            merged.light[key] = val;
                        }
                    }
                }
                if (pondData.air) {
                    merged.air = { ...merged.air };
                    for (const [key, val] of Object.entries(pondData.air)) {
                        if (val !== null && val !== undefined) {
                            merged.air[key] = val;
                        }
                    }
                }
                merged.timestamp = pondData.timestamp;
                return merged;
            });
            setLastUpdate(pondData.timestamp);
            setError(null);
        } catch (err) {
            setError(err.message);
            setConnected(false);
        } finally {
            setLoading(false);
        }
    }, []);
    
    useEffect(() => {
        fetchData();
        
        const pollInterval = setInterval(fetchData, pollingInterval);
        
        return () => {
            clearInterval(pollInterval);
        };
    }, [fetchData, pollingInterval]);
    
    const refresh = useCallback(() => {
        setLoading(true);
        fetchData();
    }, [fetchData]);
    
    return {
        data,
        loading,
        error,
        connected,
        lastUpdate,
        refresh
    };
}
