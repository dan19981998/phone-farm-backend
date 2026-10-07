import { Router } from 'express';
import type { Response } from 'express';
import { listActivity, clearActivity } from '../services/activity.js';

export const activityRouter = Router();

const run = (fn: () => Promise<unknown>) => async (res: Response) => {
    try {
        const result = await fn();
        res.json({ ok: true, result });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
};

// All activity, or ?deviceId=XXX to filter to one phone.
activityRouter.get('/', (req, res) => {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    return run(() => listActivity(deviceId))(res);
});

activityRouter.delete('/', (req, res) => {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    return run(() => clearActivity(deviceId))(res);
});
