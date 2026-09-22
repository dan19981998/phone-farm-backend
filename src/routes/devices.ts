import { Router } from 'express';
import { listDevices, type KernelDevice } from '../services/kernel.js';

export const devicesRouter = Router();

interface Device {
    id: string;
    name: string;
    model: string;
    iosVersion: string;
    ip: string;
    online: boolean;
}

const toDevice = (d: KernelDevice): Device => ({
    id: d.deviceid,
    name: d.user_name || d.device_name || d.deviceid,
    model: d.model ?? '',
    iosVersion: d.version ?? '',
    ip: d.ip ?? '',
    online: d.state === 1,
});

devicesRouter.get('/', async (_req, res) => {
    try {
        const devices = (await listDevices()).map(toDevice);
        res.json({ devices });
    } catch (err) {
        res.status(502).json({
            error: 'Failed to reach the phone farm kernel',
            detail: err instanceof Error ? err.message : String(err),
        });
    }
});
