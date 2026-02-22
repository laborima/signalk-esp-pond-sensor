const http = require('http');
const net = require('net');

/**
 * SignalK plugin for POI Laboratory.
 * Provides a reverse proxy to the ESP32 pond video camera,
 * avoiding mixed-content issues when the dashboard is served over HTTPS.
 *
 * Proxied HTTP routes (port cameraPort, default 81):
 *   /signalk-poi-lab/pond-video/wake    -> http://ESP32_IP:PORT/wake
 *   /signalk-poi-lab/pond-video/sleep   -> http://ESP32_IP:PORT/sleep
 *   /signalk-poi-lab/pond-video/stream  -> http://ESP32_IP:PORT/stream
 *   /signalk-poi-lab/pond-video/capture -> http://ESP32_IP:PORT/capture
 *   /signalk-poi-lab/pond-video/config  -> http://ESP32_IP:PORT/config
 *   /signalk-poi-lab/pond-video/*       -> http://ESP32_IP:PORT/*
 *
 * WebSocket tunnel (port cameraWsPort, default 82):
 *   ws://SIGNALK_HOST/signalk-poi-lab/pond-ws -> ws://ESP32_IP:WS_PORT/
 */
module.exports = function (app) {
    const plugin = {};

    plugin.id = 'signalk-poi-lab';
    plugin.name = 'POI Laboratory';
    plugin.description = 'Pond monitoring dashboard with ESP32 camera proxy';

    plugin.schema = {
        type: 'object',
        title: 'POI Laboratory Settings',
        properties: {
            cameraHost: {
                type: 'string',
                title: 'ESP32 Camera Host',
                description: 'IP or hostname of the ESP32 camera (e.g. 192.168.1.82)',
                default: '192.168.1.82'
            },
            cameraPort: {
                type: 'number',
                title: 'ESP32 Camera HTTP Port',
                description: 'HTTP port of the ESP32 camera stream server',
                default: 81
            },
            cameraWsPort: {
                type: 'number',
                title: 'ESP32 Camera WebSocket Port',
                description: 'WebSocket port for low-latency JPEG streaming',
                default: 82
            }
        }
    };

    let cameraHost = '192.168.1.82';
    let cameraPort = 81;
    let cameraWsPort = 82;

    const PROXY_PATH = '/signalk-poi-lab/pond-video';
    const WS_PROXY_PATH = '/signalk-poi-lab/pond-ws';

    let wsUpgradeHandler = null;

    plugin.start = function (options) {
        cameraHost = options.cameraHost || '192.168.1.82';
        cameraPort = options.cameraPort || 81;
        cameraWsPort = options.cameraWsPort || 82;

        app.use(PROXY_PATH, (req, res) => {
            proxyRequest(req, res, req.url || '/');
        });

        wsUpgradeHandler = (req, socket, head) => {
            if (!req.url.startsWith(WS_PROXY_PATH)) return;
            tunnelWebSocket(req, socket, head);
        };

        if (app.server) {
            app.server.on('upgrade', wsUpgradeHandler);
            app.debug(`POI Lab WS tunnel registered on ${WS_PROXY_PATH}`);
        } else {
            app.debug('POI Lab: app.server not available, WS tunnel skipped');
        }

        app.debug(`POI Lab proxy started: ${PROXY_PATH}/* -> http://${cameraHost}:${cameraPort}`);
        app.debug(`POI Lab WS tunnel: ${WS_PROXY_PATH} -> ws://${cameraHost}:${cameraWsPort}`);
    };

    plugin.stop = function () {
        if (app.server && wsUpgradeHandler) {
            app.server.removeListener('upgrade', wsUpgradeHandler);
        }
        app.debug('POI Lab proxy stopped');
    };

    /**
     * Proxies an HTTP request to the ESP32 camera.
     *
     * @param {object} req        Express request
     * @param {object} res        Express response
     * @param {string} targetPath Path on the ESP32
     */
    function proxyRequest(req, res, targetPath) {
        if (req.method === 'OPTIONS') {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type');
            res.sendStatus(204);
            return;
        }

        const options = {
            hostname: cameraHost,
            port: cameraPort,
            path: targetPath,
            method: req.method,
            headers: { 'Host': `${cameraHost}:${cameraPort}` },
            timeout: 6000
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.set('Access-Control-Allow-Origin', '*');
            res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type');
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
        });

        proxyReq.on('error', (err) => {
            app.debug(`Proxy error: ${err.message}`);
            if (!res.headersSent) {
                res.status(502).json({
                    error: 'Camera unreachable',
                    message: err.message,
                    target: `${cameraHost}:${cameraPort}${targetPath}`
                });
            }
        });

        proxyReq.on('timeout', () => {
            proxyReq.destroy();
            if (!res.headersSent) {
                res.status(504).json({ error: 'Camera timeout' });
            }
        });

        req.pipe(proxyReq, { end: true });
    }

    /**
     * Tunnels a WebSocket upgrade request to the ESP32 WebSocket server.
     * The browser connects to ws://SIGNALK/signalk-poi-lab/pond-ws
     * and this function opens a raw TCP tunnel to ESP32_IP:cameraWsPort.
     *
     * @param {net.Socket} socket Browser socket from the upgrade event
     * @param {Buffer}     head   Initial data buffer
     */
    function tunnelWebSocket(req, socket, head) {
        socket.on('error', (err) => app.debug(`WS browser socket error: ${err.message}`));

        const esp = net.createConnection({ host: cameraHost, port: cameraWsPort });

        esp.on('error', (err) => {
            app.debug(`WS tunnel error: ${err.message}`);
            if (!socket.destroyed) {
                socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
                socket.destroy();
            }
        });

        esp.on('connect', () => {
            const headers = [
                `GET / HTTP/1.1`,
                `Host: ${cameraHost}:${cameraWsPort}`,
                `Upgrade: websocket`,
                `Connection: Upgrade`,
                `Sec-WebSocket-Version: ${req.headers['sec-websocket-version'] || '13'}`,
                `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
            ];
            if (req.headers['sec-websocket-protocol']) {
                headers.push(`Sec-WebSocket-Protocol: ${req.headers['sec-websocket-protocol']}`);
            }
            esp.write(headers.join('\r\n') + '\r\n\r\n');
            if (head && head.length) esp.write(head);
            esp.pipe(socket);
            socket.pipe(esp);
        });

        socket.on('close', () => { if (!esp.destroyed) esp.destroy(); });
        esp.on('close', () => { if (!socket.destroyed) socket.destroy(); });
    }

    return plugin;
};
