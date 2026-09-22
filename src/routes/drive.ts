import { Router } from 'express';
import * as drive from '../services/drive.js';
import { postNextFromDrive } from '../services/pipeline.js';

export const driveRouter = Router();

driveRouter.get('/status', async (_req, res) => {
    try {
        const authed = await drive.isAuthed();
        res.json({ ok: true, authed });
    } catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

driveRouter.get('/auth', (_req, res) => {
    try {
        res.redirect(drive.getAuthUrl());
    } catch (err) {
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

driveRouter.get('/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
        res.status(400).send('Missing authorization code.');
        return;
    }
    try {
        await drive.handleCallback(code);
        res.send('✅ Google Drive connected. You can close this tab.');
    } catch (err) {
        res.status(502).send(`Drive connect failed: ${err instanceof Error ? err.message : String(err)}`);
    }
});

driveRouter.get('/videos', async (req, res) => {
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    try {
        const videos = await drive.listVideos(folderId);
        res.json({ ok: true, videos });
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

driveRouter.post('/post', async (req, res) => {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    if (!deviceId) {
        res.status(400).json({ ok: false, error: 'deviceId is required' });
        return;
    }
    const caption = typeof req.body?.caption === 'string' ? req.body.caption : 'test post from the farm';
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : undefined;
    try {
        const result = await postNextFromDrive(deviceId, caption, fileId);
        res.json({ ok: true, result });
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
