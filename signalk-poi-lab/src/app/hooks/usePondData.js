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
            setData(pondData);
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
