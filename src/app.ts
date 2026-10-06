import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { healthRouter } from './routes/health.js';
import { devicesRouter } from './routes/devices.js';
import { actionsRouter } from './routes/actions.js';
import { driveRouter } from './routes/drive.js';
import { screenRouter } from './routes/screen.js';
import { rapidApiRouter } from './routes/rapidapi.js';

export const createApp = () => {
    const app = express();

    app.use(cors({ origin: config.corsOrigin }));
    app.use(express.json());

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

    return app;
};
