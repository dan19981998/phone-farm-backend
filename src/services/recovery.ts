import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tap, sendKey } from './actions.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));


export interface MirrorPoints {
    appX: number;
    appY: number;
    ipX: number;
    ipY: number;
    startX: number;
    startY: number;
    broadcastX: number;
    broadcastY: number;
    closeX: number;
    closeY: number;
}

const STORE = path.resolve('.mirror-calibration.json');

type Store = Record<string, MirrorPoints>;

const readStore = async (): Promise<Store> => {
    try {
        return JSON.parse(await readFile(STORE, 'utf8')) as Store;
    } catch {
        return {};
    }
};

const writeStore = async (store: Store): Promise<void> => {
    await mkdir(path.dirname(STORE), { recursive: true });
    await writeFile(STORE, JSON.stringify(store, null, 2));
};

export const getMirrorPoints = async (id: string): Promise<MirrorPoints | null> => {
    const store = await readStore();
    return store[id] ?? null;
};

export const calibrateMirror = async (id: string, points: MirrorPoints): Promise<MirrorPoints> => {
    const store = await readStore();
    store[id] = points;
    await writeStore(store);
    return points;
};

export const restartMirror = async (id: string): Promise<{ restarted: true; points: MirrorPoints }> => {
    const points = await getMirrorPoints(id);
    if (!points) {
        throw new Error(
            `no mirror calibration for ${id} — calibrate the 4 recovery taps (app icon, IP, Start, Start Broadcast popup) while the phone is alive first`,
        );
    }

    await sendKey(id, 'Home');
    await delay(600);
    await sendKey(id, 'Home');
    await delay(1200);
    await tap(id, points.appX, points.appY);
    await delay(3000);
    await tap(id, points.ipX, points.ipY);
    await delay(1500);
    await tap(id, points.startX, points.startY);
    await delay(1500);
    await tap(id, points.broadcastX, points.broadcastY);
    await delay(4000);
    await tap(id, points.closeX, points.closeY);
    await delay(1000);
    await sendKey(id, 'Home');
    await delay(1000);
    return { restarted: true, points };
};
