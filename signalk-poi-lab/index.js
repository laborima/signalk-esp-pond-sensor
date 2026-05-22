const http = require('http');

/**
 * SignalK plugin for POI Laboratory.
 * Provides a reverse proxy to the Raspberry Pi pond video camera,
 * avoiding mixed-content issues when the dashboard is served over HTTPS.
 *
 * Proxied HTTP routes (port cameraPort, default 8080):
 *   /signalk-poi-lab/pond-video/wake    -> http://PI_IP:PORT/wake
 *   /signalk-poi-lab/pond-video/sleep   -> http://PI_IP:PORT/sleep
 *   /signalk-poi-lab/pond-video/hls/*   -> http://PI_IP:PORT/hls/*
 *   /signalk-poi-lab/pond-video/capture -> http://PI_IP:PORT/capture
 *   /signalk-poi-lab/pond-video/config  -> http://PI_IP:PORT/config
 *   /signalk-poi-lab/pond-video/*       -> http://PI_IP:PORT/*
 */
module.exports = function (app) {
    const plugin = {};

    plugin.id = 'signalk-poi-lab';
    plugin.name = 'POI Laboratory';
    plugin.description = 'Pond monitoring dashboard with Raspberry Pi camera proxy';

    plugin.schema = {
        type: 'object',
        title: 'POI Laboratory Settings',
        properties: {
            cameraHost: {
                type: 'string',
                title: 'Pi Camera Host',
                description: 'IP or hostname of the Raspberry Pi camera (e.g. 192.168.1.84)',
                default: '192.168.1.84'
            },
            cameraPort: {
                type: 'number',
                title: 'Pi Camera HTTP Port',
                description: 'HTTP port of the Pi Flask server (default 8080)',
                default: 8080
            }
        }
    };

    let cameraHost = '192.168.1.84';
    let cameraPort = 8080;

    const PROXY_PATH = '/signalk-poi-lab/pond-video';

    plugin.start = function (options) {
        cameraHost = options.cameraHost || '192.168.1.84';
        cameraPort = options.cameraPort || 8080;

        app.use(PROXY_PATH, (req, res) => {
            proxyRequest(req, res, req.url || '/');
        });

        app.debug(`POI Lab proxy started: ${PROXY_PATH}/* -> http://${cameraHost}:${cameraPort}`);
    };

    plugin.stop = function () {
        app.debug('POI Lab proxy stopped');
    };

    /**
     * Proxies an HTTP request to the Pi camera.
     *
     * @param {object} req        Express request
     * @param {object} res        Express response
     * @param {string} targetPath Path on the Pi
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
                    error: 'Pi camera unreachable',
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

    return plugin;
};
