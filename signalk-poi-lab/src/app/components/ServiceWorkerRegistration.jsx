"use client";

import { useEffect } from "react";

/**
 * Registers the service worker with correct basePath handling
 */
export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            const basePath = process.env.NODE_ENV === 'production' ? '/signalk-poi-lab' : '';
            navigator.serviceWorker
                .register(`${basePath}/sw.js`, { scope: `${basePath}/` })
                .then((registration) => {
                    console.log('Service Worker registered:', registration.scope);
                })
                .catch((error) => {
                    console.log('Service Worker registration failed:', error);
                });
        }
    }, []);

    return null;
}
