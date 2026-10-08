import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = dirname(dirname(__dirname));

const num = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const host = process.env.KERNEL_HOST?.trim() || '192.168.70.170';
const port = num(process.env.KERNEL_PORT, 9911);

const serverPort = num(process.env.PORT, 8080);

export const config = {
    port: serverPort,
    corsOrigin: process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    kernel: {
        host,
        port,
        baseUrl: `http://${host}:${port}/api`,
    },
    drive: {
        clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
        redirectUri:
            process.env.GOOGLE_REDIRECT_URI?.trim() ||
            `http://localhost:${serverPort}/api/drive/callback`,
        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '',
        tokenPath: process.env.GOOGLE_TOKEN_PATH?.trim() || '.drive-token.json',
        allowedFolders: process.env.DRIVE_ALLOWED_FOLDERS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [],
    },
    rapidapi: {
        key: process.env.RAPIDAPI_KEY?.trim() || '',
        host: process.env.RAPIDAPI_HOST?.trim() || 'instagram-scraper-stable-api.p.rapidapi.com',
        demoMode: /^(1|true|yes|on)$/i.test(process.env.RAPIDAPI_DEMO_MODE?.trim() || ''),
    },
    uploadDir: process.env.UPLOAD_DIR?.trim() || 'uploads',
    dataDir: process.env.DATA_DIR?.trim() || `${PROJECT_ROOT}/data`,
    kernelUploadDir: process.env.KERNEL_UPLOAD_DIR?.trim() || '',
    watcher: {
        enabled: /^(1|true|yes|on)$/i.test(process.env.WATCHER_ENABLED?.trim() || ''),
        deviceId: process.env.WATCHER_DEVICE_ID?.trim() || '',
        pollMs: num(process.env.WATCHER_POLL_MS, 15_000),
    },

    activityWatcher: {
        enabled: /^(1|true|yes|on)$/i.test(process.env.ACTIVITY_WATCHER_ENABLED?.trim() || ''),
        pollMs: num(process.env.ACTIVITY_WATCHER_POLL_MS, 8_000),
    },

    recorder: {
        enabled: /^(1|true|yes|on)$/i.test(process.env.RECORDER_ENABLED?.trim() || ''),
        intervalMs: num(process.env.RECORDER_INTERVAL_MS, 5_000),
        retentionMs: num(process.env.RECORDER_RETENTION_MS, 24 * 60 * 60 * 1000),
        dir: process.env.RECORDER_DIR?.trim() || 'recordings',
    },
    stream: {

        fps: num(process.env.STREAM_FPS, 10),
        workers: num(process.env.STREAM_WORKERS, 2),
    },
} as const;
