import { Router } from 'express';
import * as drive from '../services/drive.js';
import { saveDriveVideoToAlbum } from '../services/pipeline.js';
import { getWatcherStatus, markSeen, startWatcher, stopWatcher } from '../services/watcher.js';
import { logActivity } from '../services/activity.js';
import { getPhoneMeta } from '../services/phones.js';

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
        res.redirect('/admin/add-phone');
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

driveRouter.get('/thumbnail/:fileId', async (req, res) => {
    try {
        const thumb = await drive.fetchThumbnail(req.params.fileId);
        if (!thumb) {
            res.status(404).end();
            return;
        }
        res.setHeader('Content-Type', thumb.contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(thumb.buffer);
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

// Save a Drive video straight to the camera roll — no Instagram step.
driveRouter.post('/save', async (req, res) => {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : '';
    if (!deviceId) {
        res.status(400).json({ ok: false, error: 'deviceId is required' });
        return;
    }
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : undefined;
    const requestedFolder = typeof req.body?.folderId === 'string' ? req.body.folderId : undefined;
    try {
        // Fall back to this phone's assigned Drive folder when the client didn't
        // specify one, so each phone pulls from its own folder.
        const folderId = requestedFolder || (await getPhoneMeta(deviceId))?.driveFolderId || undefined;
        const videos = await drive.listVideos(folderId);
        if (videos.length === 0) throw new Error('No videos found in the Drive folder.');
        const video = fileId ? videos.find((v) => v.id === fileId) : videos[0];
        if (!video) throw new Error(`Video ${fileId} not found in the Drive folder.`);
        const result = await saveDriveVideoToAlbum(deviceId, video);
        const ok = result.code === 0 || result.code === 30;
        if (ok) {
            markSeen(video.id);
            logActivity(deviceId, 'save', `Saved "${video.name}" to camera roll`);
        }
        res.json({ ok, result });
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

driveRouter.get('/watcher', (_req, res) => {
    res.json({ ok: true, status: getWatcherStatus() });
});

driveRouter.post('/watcher/start', async (req, res) => {
    const deviceId = typeof req.body?.deviceId === 'string' ? req.body.deviceId : undefined;
    const skipBaseline = req.body?.processExisting === true;
    try {
        const status = await startWatcher({ deviceId, skipBaseline });
        res.json({ ok: true, status });
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

driveRouter.post('/watcher/stop', (_req, res) => {
    res.json({ ok: true, status: stopWatcher() });
});

driveRouter.get('/folders', async (_req, res) => {
    try {
        const folders = await drive.listFolders();
        res.json({ ok: true, folders });
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});

driveRouter.get('/folder', async (req, res) => {
    const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
    try {
        const folder = await drive.getFolder(folderId);
        res.json({ ok: true, folder });
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
});
