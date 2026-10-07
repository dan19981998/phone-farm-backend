import { Router } from 'express';
import { streamDevice } from '../services/screen.js';
import { addViewer, removeViewer, presenceMap } from '../services/presence.js';

export const screenRouter = Router();

// Which phones are currently in use by a user (control page open).
screenRouter.get('/presence', (_req, res) => {
    res.json({ ok: true, result: presenceMap() });
});

screenRouter.get('/:id/stream', (req, res) => {
    const id = req.params.id;
    // Only the user control page tags its stream with ?use=control, which is
    // what marks a phone "in use". The admin preview grid doesn't count.
    const isControl = req.query.use === 'control';
    const boundary = 'phonefarmframe';
    res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Connection: 'close',
    });

    if (isControl) addViewer(id);

    const handle = streamDevice(
        id,
        (jpeg) => {
            res.write(`--${boundary}\r\n`);
            res.write('Content-Type: image/jpeg\r\n');
            res.write(`Content-Length: ${jpeg.length}\r\n\r\n`);
            res.write(jpeg);
            res.write('\r\n');
        },
        () => {
        },
    );

    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (isControl) removeViewer(id);
        handle.stop();
    };
    req.on('close', stop);
    req.on('error', stop);
    res.on('error', stop);
});
