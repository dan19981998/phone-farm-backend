import 'dotenv/config';

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
    kernelUploadDir: process.env.KERNEL_UPLOAD_DIR?.trim() || '',
    watcher: {
        enabled: /^(1|true|yes|on)$/i.test(process.env.WATCHER_ENABLED?.trim() || ''),
        deviceId: process.env.WATCHER_DEVICE_ID?.trim() || '',
        pollMs: num(process.env.WATCHER_POLL_MS, 15_000),
    },
    // OCR-based read-only activity watcher: periodically screenshots each online
    // phone, reads the screen, and logs app transitions (opened/closed/posted).
    // Needs OCR (macOS only), so keep it on the Mac-side backend.
    activityWatcher: {
        enabled: /^(1|true|yes|on)$/i.test(process.env.ACTIVITY_WATCHER_ENABLED?.trim() || ''),
        pollMs: num(process.env.ACTIVITY_WATCHER_POLL_MS, 8_000),
    },
    // Timelapse "DVR" recorder: saves one screenshot per online phone on an
    // interval, kept for a rolling retention window (default 24h) so the
    // Activity page can scrub back in time. Works on any host (no OCR needed).
    recorder: {
        enabled: /^(1|true|yes|on)$/i.test(process.env.RECORDER_ENABLED?.trim() || ''),
        intervalMs: num(process.env.RECORDER_INTERVAL_MS, 5_000),
        retentionMs: num(process.env.RECORDER_RETENTION_MS, 24 * 60 * 60 * 1000),
        dir: process.env.RECORDER_DIR?.trim() || 'recordings',
    },
    stream: {
        // Max frames per second for each live phone stream. Higher = smoother
        // but heavier load on the kernel and USB bus.
        fps: num(process.env.STREAM_FPS, 10),
        // Number of parallel screenshot workers per stream. More workers mean
        // we always serve the freshest frame instead of waiting on one request.
        workers: num(process.env.STREAM_WORKERS, 2),
    },
} as const;
