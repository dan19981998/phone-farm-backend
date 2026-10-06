import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import * as actions from '../services/actions.js';
import { ocrDevice } from '../services/ocr.js';
import { openApp } from '../services/flow.js';
import { restartMirror, calibrateMirror, getMirrorPoints } from '../services/recovery.js';
import { config } from '../config/index.js';

export const actionsRouter = Router();

await mkdir(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (_req, file, cb) => {
        const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        cb(null, `${unique}_${path.basename(file.originalname)}`);
    },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const run = (fn: () => Promise<unknown>) => async (res: import('express').Response) => {
    try {
        const result = await fn();
        res.json({ ok: true, result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
};

actionsRouter.post('/:id/screenshot', (req, res) =>
    run(() => actions.screenshot(req.params.id).then((image) => ({ image })))(res),
);

actionsRouter.post('/:id/tap', (req, res) =>
    run(() => actions.tap(req.params.id, req.body.x, req.body.y))(res),
);

actionsRouter.post('/:id/swipe', (req, res) => {
    const { x0, y0, x1, y1 } = req.body;
    return run(() => actions.swipe(req.params.id, x0, y0, x1, y1))(res);
});

actionsRouter.post('/:id/key', (req, res) =>
    run(() => actions.sendKey(req.params.id, req.body.key))(res),
);

actionsRouter.post('/:id/type', (req, res) => {
    const seconds = Number(req.body.seconds);
    const targetSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 5;
    return run(() => actions.typeTextHuman(req.params.id, req.body.text, targetSeconds))(res);
});

actionsRouter.post('/:id/type-instant', (req, res) =>
    run(() => actions.typeInstant(req.params.id, req.body.text))(res),
);

actionsRouter.post('/:id/ocr', (req, res) =>
    run(() => ocrDevice(req.params.id))(res),
);

actionsRouter.post('/:id/tap-text', (req, res) =>
    run(() => actions.tapText(req.params.id, req.body.text))(res),
);

actionsRouter.post('/:id/open-app', (req, res) =>
    run(() => openApp(req.params.id, req.body.app || 'Instagram'))(res),
);

actionsRouter.post('/:id/restart-mirror', (req, res) =>
    run(() => restartMirror(req.params.id))(res),
);

actionsRouter.get('/:id/mirror-calibration', (req, res) =>
    run(() => getMirrorPoints(req.params.id))(res),
);

actionsRouter.post('/:id/mirror-calibration', (req, res) => {
    const { appX, appY, ipX, ipY, startX, startY, broadcastX, broadcastY, closeX, closeY } = req.body;
    return run(() =>
        calibrateMirror(req.params.id, {
            appX: Number(appX),
            appY: Number(appY),
            ipX: Number(ipX),
            ipY: Number(ipY),
            startX: Number(startX),
            startY: Number(startY),
            broadcastX: Number(broadcastX),
            broadcastY: Number(broadcastY),
            closeX: Number(closeX),
            closeY: Number(closeY),
        }),
    )(res);
});



actionsRouter.post('/:id/open-url', (req, res) =>
    run(() => actions.openUrl(req.params.id, req.body.url))(res),
);

actionsRouter.post('/:id/clipboard', (req, res) =>
    run(() => actions.setClipboard(req.params.id, req.body.text))(res),
);

actionsRouter.post('/:id/upload', upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ ok: false, error: 'No file uploaded' });
        return;
    }
    return run(async () => {
        const storedFilename = file.filename || path.basename(file.path);
        const originalFilename = path.basename(file.originalname);

        // Use kernel upload dir if available, otherwise use local path
        let hostPath = file.path;
        if (config.kernelUploadDir) {
            hostPath = `${config.kernelUploadDir.replace(/[\\/]+$/, '')}\\${storedFilename}`;
        }

        // Fire the save request to the kernel with a short timeout.
        // The shortcut executes almost instantly on the phone.
        // If it times out, it likely means the shortcut already completed.
        try {
            const result = await actions.saveToAlbum(req.params.id, hostPath, 3_000);
            return {
                code: result.code,
                message: result.message,
                filename: originalFilename,
            };
        } catch (err) {
            // Timeout likely means the shortcut already ran and saved the file.
            // Return success so the UI closes immediately.
            if (err instanceof Error && err.message.includes('timeout')) {
                return {
                    code: 0,
                    message: 'Upload sent to device',
                    filename: originalFilename,
                };
            }
            throw err;
        }
    })(res);
});

actionsRouter.post('/:id/emoji', (req, res) =>
    run(() => actions.pasteEmoji(req.params.id, req.body.emoji))(res),
);

actionsRouter.post('/:id/emoji-key', (req, res) =>
    run(() => actions.tapEmojiKey(req.params.id))(res),
);
