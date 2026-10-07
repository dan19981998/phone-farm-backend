import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ActivityEvent {
    id: string;
    deviceId: string;
    /** Short machine type, e.g. 'open-app', 'post', 'save', 'type', 'mirror'. */
    type: string;
    /** Human-readable summary, e.g. "Opened Instagram". */
    message: string;
    at: string;
}

const STORE = path.resolve('.activity.json');
// Keep the log bounded so the file never grows without limit.
const MAX_EVENTS = 1000;

let cache: ActivityEvent[] | null = null;

const read = async (): Promise<ActivityEvent[]> => {
    if (cache) return cache;
    try {
        const parsed = JSON.parse(await readFile(STORE, 'utf8'));
        cache = Array.isArray(parsed) ? (parsed as ActivityEvent[]) : [];
    } catch {
        cache = [];
    }
    return cache;
};

const persist = async (events: ActivityEvent[]): Promise<void> => {
    await mkdir(path.dirname(STORE), { recursive: true });
    await writeFile(STORE, JSON.stringify(events, null, 2));
};

/** Record an activity event for a phone. Fire-and-forget safe (never throws). */
export const logActivity = (deviceId: string, type: string, message: string): void => {
    if (!deviceId) return;
    void (async () => {
        try {
            const events = await read();
            events.unshift({
                id: randomUUID(),
                deviceId,
                type,
                message,
                at: new Date().toISOString(),
            });
            if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
            cache = events;
            await persist(events);
        } catch (err) {
            console.error('logActivity failed', err);
        }
    })();
};

/** Most-recent-first events, optionally filtered to one device. */
export const listActivity = async (deviceId?: string, limit = 200): Promise<ActivityEvent[]> => {
    const events = await read();
    const filtered = deviceId ? events.filter((e) => e.deviceId === deviceId) : events;
    return filtered.slice(0, limit);
};

/** Wipe all activity (optionally for a single device). */
export const clearActivity = async (deviceId?: string): Promise<{ cleared: true }> => {
    const events = await read();
    cache = deviceId ? events.filter((e) => e.deviceId !== deviceId) : [];
    await persist(cache);
    return { cleared: true };
};
