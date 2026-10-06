import { Router } from 'express';
import { streamDevice } from '../services/screen.js';

export const screenRouter = Router();

screenRouter.get('/:id/stream', (req, res) => {
    const id = req.params.id;
    const boundary = 'phonefarmframe';
    res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Connection: 'close',
    });

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

    const stop = () => handle.stop();
    req.on('close', stop);
    req.on('error', stop);
    res.on('error', stop);
});
