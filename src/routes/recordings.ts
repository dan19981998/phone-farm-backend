import { Router } from 'express';
import { listFrames, framePath } from '../services/recorder.js';

export const recordingsRouter = Router();

// Timestamps of available frames for a device, optional ?from & ?to (epoch ms).
recordingsRouter.get('/:id/frames', async (req, res) => {
    const from = req.query.from ? Number(req.query.from) : undefined;
    const to = req.query.to ? Number(req.query.to) : undefined;
    try {
        const frames = await listFrames(req.params.id, from, to);
        res.json({ ok: true, result: frames });
    } catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

// Serve a single recorded frame (JPEG) by its timestamp.
recordingsRouter.get('/:id/frame/:ts', async (req, res) => {
    const ts = Number(req.params.ts);
    if (!Number.isFinite(ts)) {
        res.status(400).json({ ok: false, error: 'bad timestamp' });
        return;
    }
    const file = await framePath(req.params.id, ts);
    if (!file) {
        res.status(404).end();
        return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(file);
});
