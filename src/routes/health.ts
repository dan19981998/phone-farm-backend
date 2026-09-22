import { Router } from 'express';
import { config } from '../config/index.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
    let reachable = false;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const kernelRes = await fetch(`${config.kernel.baseUrl}/device/get`, {
            signal: controller.signal,
        });
        clearTimeout(timer);
        reachable = kernelRes.ok;
    } catch {
        reachable = false;
    }

    res.json({ status: 'ok', kernel: { host: config.kernel.host, reachable } });
});
