import { Router } from 'express';
import { fetchProfileAndPosts } from '../services/rapidapi.js';

export const rapidApiRouter = Router();

rapidApiRouter.get('/instagram/:username', async (req, res) => {
    const username = req.params.username;
    if (!username) {
        res.status(400).json({ ok: false, error: 'Username is required' });
        return;
    }
    const growthDays = String(req.query.growthDays ?? '7,14,21,28')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    try {
        const result = await fetchProfileAndPosts(username, growthDays.length > 0 ? growthDays : undefined);
        res.json({ ok: true, result });
    } catch (err) {
        res.status(502).json({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
});
