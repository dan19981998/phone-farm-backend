import { config } from '../config/index.js';
import { listVideos, type DriveVideo } from './drive.js';
import { listDevices } from './kernel.js';
import { saveDriveVideoToAlbum } from './pipeline.js';
const CODE_SAVED = 0;
const CODE_TIMEOUT = 30;
const CODE_MISSING = 35;
const MAX_ATTEMPTS = 40;

export interface WatcherStatus {
    enabled: boolean;
    deviceId: string;
    pollMs: number;
    running: boolean;
    lastCheck: string | null;
    lastSaved: { name: string; at: string } | null;
    lastError: string | null;
    pending: string[];
    savedCount: number;
}

const seen = new Set<string>(); // drive file ids fully handled (saved or given up)
const attempts = new Map<string, number>(); // file id -> attempt count

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;
let deviceId = '';
let savedCount = 0;
let lastCheck: string | null = null;
let lastSaved: { name: string; at: string } | null = null;
let lastError: string | null = null;

const resolveDeviceId = async (preferred?: string): Promise<string> => {
    if (preferred) return preferred;
    if (config.watcher.deviceId) return config.watcher.deviceId;
    const devices = await listDevices();
    if (devices.length === 0) throw new Error('No devices available to the kernel.');
    return devices[0].deviceid;
};

const trySave = async (video: DriveVideo): Promise<boolean> => {
    const n = (attempts.get(video.id) ?? 0) + 1;
    attempts.set(video.id, n);
    try {
        const { code, message } = await saveDriveVideoToAlbum(deviceId, video);
        if (code === CODE_SAVED) {
            savedCount += 1;
            lastSaved = { name: video.name, at: new Date().toISOString() };
            lastError = null;
            console.log(`[watcher] saved "${video.name}" to ${deviceId}`);
            return true;
        }
        if (code === CODE_TIMEOUT) {
            savedCount += 1;
            lastSaved = { name: video.name, at: new Date().toISOString() };
            lastError = null;
            console.log(`[watcher] "${video.name}" reported timeout (code 30) but likely saved — marking done`);
            return true;
        }
        if (code === CODE_MISSING) {
            console.log(`[watcher] "${video.name}" not synced yet (code 35), attempt ${n}`);
        } else {
            console.log(`[watcher] "${video.name}" code ${code}${message ? ` (${message})` : ''}, attempt ${n}`);
        }
    } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.log(`[watcher] error saving "${video.name}": ${lastError}`);
    }
    if (n >= MAX_ATTEMPTS) {
        console.log(`[watcher] giving up on "${video.name}" after ${n} attempts`);
        return true; // mark handled so it stops blocking the queue
    }
    return false;
};

const tick = async (): Promise<void> => {
    if (ticking) return; // never overlap
    ticking = true;
    try {
        const videos = await listVideos();
        lastCheck = new Date().toISOString();
        // Oldest first so uploads land in the order they were added.
        for (const video of [...videos].reverse()) {
            if (!video.id || seen.has(video.id)) continue;
            const handled = await trySave(video);
            if (handled) {
                seen.add(video.id);
                attempts.delete(video.id);
            }
        }
    } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.log(`[watcher] tick error: ${lastError}`);
    } finally {
        ticking = false;
    }
};

const baseline = async (): Promise<void> => {
    try {
        const videos = await listVideos();
        for (const v of videos) if (v.id) seen.add(v.id);
        lastCheck = new Date().toISOString();
        console.log(`[watcher] baselined ${seen.size} existing video(s); watching for new uploads`);
    } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.log(`[watcher] baseline error: ${lastError}`);
    }
};

export const startWatcher = async (
    opts: { deviceId?: string; skipBaseline?: boolean } = {},
): Promise<WatcherStatus> => {
    deviceId = await resolveDeviceId(opts.deviceId);
    if (timer) clearInterval(timer);
    if (opts.skipBaseline) {

        seen.clear();
        attempts.clear();
        console.log('[watcher] process-existing mode: cleared seen list');
    } else {
        await baseline();
    }
    timer = setInterval(() => void tick(), config.watcher.pollMs);
    console.log(`[watcher] started for device ${deviceId}, polling every ${config.watcher.pollMs}ms`);
    void tick(); // run immediately instead of waiting a full interval
    return getWatcherStatus();
};

export const stopWatcher = (): WatcherStatus => {
    if (timer) clearInterval(timer);
    timer = null;
    console.log('[watcher] stopped');
    return getWatcherStatus();
};

export const getWatcherStatus = (): WatcherStatus => ({
    enabled: timer !== null,
    deviceId,
    pollMs: config.watcher.pollMs,
    running: ticking,
    lastCheck,
    lastSaved,
    lastError,
    pending: [...attempts.keys()],
    savedCount,
});

export const markSeen = (fileId: string): void => {
    if (!fileId) return;
    seen.add(fileId);
    attempts.delete(fileId);
};
