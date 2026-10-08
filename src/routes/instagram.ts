import { Router } from 'express';
import * as instagram from '../services/instagram.js';

const instagramRouter = Router();

// POST /api/instagram/:id/calibrate
// Body: { x: number, y: number }
instagramRouter.post('/:id/calibrate', async (req, res) => {
    const { id } = req.params;
    const { x, y } = req.body as { x?: unknown; y?: unknown };

    if (typeof x !== 'number' || typeof y !== 'number') {
        return res.status(400).json({ error: 'x and y must be numbers' });
    }

    try {
        const coords = await instagram.calibrate(id, x, y);
        res.json({ ok: true, x: coords.x, y: coords.y });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

// POST /api/instagram/:id/textSize
// Body: { value: 0-100 }
instagramRouter.post('/:id/textSize', async (req, res) => {
    const { id } = req.params;
    const { value } = req.body as { value?: unknown };

    if (typeof value !== 'number' || value < 0 || value > 100) {
        return res.status(400).json({ error: 'value must be a number 0-100' });
    }

    try {
        await instagram.textSize(id, value);
        res.json({ ok: true, value });
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

export default instagramRouter;
