import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { healthRouter } from './routes/health.js';
import { devicesRouter } from './routes/devices.js';
import { actionsRouter } from './routes/actions.js';
import { driveRouter } from './routes/drive.js';
import { screenRouter } from './routes/screen.js';
import { rapidApiRouter } from './routes/rapidapi.js';
import { usersRouter } from './routes/users.js';
import { phonesRouter } from './routes/phones.js';
import { activityRouter } from './routes/activity.js';
import { recordingsRouter } from './routes/recordings.js';
import videoRouter from './routes/video.js';

// Built frontend lives in <server>/public (copy web/dist there before deploy).
// dist/app.js -> ../public
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export const createApp = () => {
    const app = express();

    // CORS: allow all origins in dev
    app.use(cors());
    app.use(express.json());

    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 500 * 1024 * 1024, // 500MB for video
            fieldSize: 50 * 1024 * 1024, // 50MB for JSON fields
            fields: 10, // allow up to 10 fields
        }
    });

    app.use((req, _res, next) => {
        console.log(`${req.method} ${req.url}`);
        next();
    });

    app.use('/api/health', healthRouter);
    app.use('/api/devices', devicesRouter);
    app.use('/api/devices', actionsRouter);
    app.use('/api/devices', screenRouter);
    app.use('/api/drive', driveRouter);
    app.use('/api/rapidapi', rapidApiRouter);
    app.use('/api/users', usersRouter);
    app.use('/api/phones', phonesRouter);
    app.use('/api/activity', activityRouter);
    app.use('/api/recordings', recordingsRouter);
    app.use('/api/video', upload.single('video'), videoRouter);


    // Serve the built frontend (if present) so one origin serves app + API.
    // This means the browser hits the backend directly — no CORS, no proxy —
    // and a single tunnel can expose the whole thing.
    if (existsSync(publicDir)) {
        app.use(express.static(publicDir));
        // SPA fallback: non-API GETs return index.html so client routing works.
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api/')) return next();
            res.sendFile(path.join(publicDir, 'index.html'));
        });
    }

    return app;
};
