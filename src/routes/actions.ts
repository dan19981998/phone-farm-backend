import { Router } from 'express';
import * as actions from '../services/actions.js';
import { ocrDevice } from '../services/ocr.js';
import { openApp, postToInstagram } from '../services/flow.js';

export const actionsRouter = Router();

const run = (fn: () => Promise<unknown>) => async (res: import('express').Response) => {
    try {
        const result = await fn();
        res.json({ ok: true, result });
    } catch (err) {
        res.status(502).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
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

actionsRouter.post('/:id/type', (req, res) =>
    run(() => actions.typeText(req.params.id, req.body.text))(res),
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

actionsRouter.post('/:id/post-instagram', (req, res) =>
    run(() => postToInstagram(req.params.id, req.body.caption ?? 'test post from the farm 123'))(res),
);

actionsRouter.post('/:id/open-url', (req, res) =>
    run(() => actions.openUrl(req.params.id, req.body.url))(res),
);

actionsRouter.post('/:id/clipboard', (req, res) =>
    run(() => actions.setClipboard(req.params.id, req.body.text))(res),
);
