import { mkdir, readdir, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { listDevices } from './kernel.js';
import { screenshotBuffer } from './screen.js';

// Timelapse "DVR" recorder.
// Periodically saves one screenshot per ONLINE phone to disk, named by its
// capture timestamp. A ring buffer prunes anything older than the retention
// window (default 24h) so storage stays bounded. The Activity page scrubber
// reads these frames back to "rewind" each phone.

const ROOT = path.resolve(config.recorder.dir);

/** <root>/<deviceId> */
const deviceDir = (deviceId: string) => path.join(ROOT, deviceId);

/** Frame files are "<epochMillis>.jpg". */
const frameFile = (deviceId: string, ts: number) => path.join(deviceDir(deviceId), `${ts}.jpg`);

const parseTs = (filename: string): number | null => {
    const m = /^(\d+)\.jpg$/.exec(filename);
    return m ? Number(m[1]) : null;
};

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

const captureDevice = async (deviceId: string): Promise<void> => {
    const jpeg = await screenshotBuffer(deviceId);
    await mkdir(deviceDir(deviceId), { recursive: true });
    await writeFile(frameFile(deviceId, Date.now()), jpeg);
};

/** Delete frames older than the retention window for one device. */
const pruneDevice = async (deviceId: string): Promise<void> => {
    const cutoff = Date.now() - config.recorder.retentionMs;
    let names: string[];
    try {
        names = await readdir(deviceDir(deviceId));
    } catch {
        return;
    }
    await Promise.all(
        names.map(async (name) => {
            const ts = parseTs(name);
            if (ts !== null && ts < cutoff) {
                await unlink(path.join(deviceDir(deviceId), name)).catch(() => { });
            }
        }),
    );
};

const tick = async (): Promise<void> => {
    if (ticking) return;
    ticking = true;
    try {
        const devices = await listDevices();
        const online = devices.filter((d) => d.state === 1);
        for (const d of online) {
            try {
                await captureDevice(d.deviceid);
                await pruneDevice(d.deviceid);
            } catch (err) {
                console.error(`[recorder] capture ${d.deviceid} failed:`, err instanceof Error ? err.message : err);
            }
        }
    } catch (err) {
        console.error('[recorder] tick failed:', err instanceof Error ? err.message : err);
    } finally {
        ticking = false;
    }
};

/** Timestamps (ascending) of frames available for a device within [from, to]. */
export const listFrames = async (
    deviceId: string,
    from?: number,
    to?: number,
): Promise<number[]> => {
    let names: string[];
    try {
        names = await readdir(deviceDir(deviceId));
    } catch {
        return [];
    }
    const cutoff = Date.now() - config.recorder.retentionMs;
    const lo = Math.max(from ?? 0, cutoff);
    const hi = to ?? Number.MAX_SAFE_INTEGER;
    return names
        .map(parseTs)
        .filter((ts): ts is number => ts !== null && ts >= lo && ts <= hi)
        .sort((a, b) => a - b);
};

/** Absolute path to a frame file (or null if it doesn't exist). */
export const framePath = async (deviceId: string, ts: number): Promise<string | null> => {
    const file = frameFile(deviceId, ts);
    try {
        await stat(file);
        return file;
    } catch {
        return null;
    }
};

/** Start the timelapse recorder. No-op if disabled. */
export const startRecorder = (): void => {
    if (timer) return;
    if (!config.recorder.enabled) {
        console.log('[recorder] disabled (set RECORDER_ENABLED=1 to enable)');
        return;
    }
    const ms = config.recorder.intervalMs;
    console.log(`[recorder] started — ${ms}ms interval, ${Math.round(config.recorder.retentionMs / 3_600_000)}h retention`);
    timer = setInterval(() => void tick(), ms);
};

export const stopRecorder = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
};
