import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SNAPSHOT_FILE = process.env.FOLLOWER_SNAPSHOTS_PATH?.trim() ||
    path.join(process.cwd(), 'follower-snapshots.json');

export interface FollowerSnapshot {
    username: string;
    followerCount: number;
    followingCount: number;
    mediaCount: number;
    recordedAt: string;
}

interface SnapshotStore {
    snapshots: FollowerSnapshot[];
}

async function loadStore(): Promise<SnapshotStore> {
    try {
        const raw = await readFile(SNAPSHOT_FILE, 'utf-8');
        return JSON.parse(raw) as SnapshotStore;
    } catch {
        return { snapshots: [] };
    }
}

async function saveStore(store: SnapshotStore): Promise<void> {
    await writeFile(SNAPSHOT_FILE, JSON.stringify(store, null, 2));
}

export async function recordSnapshot(snapshot: FollowerSnapshot): Promise<void> {
    const store = await loadStore();
    // Keep one snapshot per username per day (replace if same day).
    const day = snapshot.recordedAt.slice(0, 10);
    const filtered = store.snapshots.filter(
        (s) => !(s.username.toLowerCase() === snapshot.username.toLowerCase() && s.recordedAt.slice(0, 10) === day),
    );
    filtered.push(snapshot);
    // Prune: keep last 90 days per user to keep file small.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const pruned = filtered.filter(
        (s) =>
            s.username.toLowerCase() !== snapshot.username.toLowerCase() ||
            new Date(s.recordedAt) >= cutoff,
    );
    await saveStore({ snapshots: pruned });
}

export interface GrowthWindow {
    days: number;
    startCount: number;
    endCount: number;
    absolute: number;
    percent: number;
}

export async function getFollowerGrowth(
    username: string,
    currentFollowers: number,
    windowsDays: number[] = [7, 14, 21, 28],
): Promise<GrowthWindow[]> {
    const store = await loadStore();
    const userSnaps = store.snapshots
        .filter((s) => s.username.toLowerCase() === username.toLowerCase())
        .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());

    const now = Date.now();

    return windowsDays.map((days) => {
        const target = now - days * 24 * 60 * 60 * 1000;
        // Find newest snapshot at or before the target date.
        let startCount = currentFollowers;
        for (let i = userSnaps.length - 1; i >= 0; i--) {
            const t = new Date(userSnaps[i].recordedAt).getTime();
            if (t <= target) {
                startCount = userSnaps[i].followerCount;
                break;
            }
        }
        const absolute = currentFollowers - startCount;
        const percent = startCount === 0 ? 0 : Number(((absolute / startCount) * 100).toFixed(2));
        return { days, startCount, endCount: currentFollowers, absolute, percent };
    });
}

export async function getFollowerHistory(username: string, days = 90): Promise<FollowerSnapshot[]> {
    const store = await loadStore();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return store.snapshots
        .filter(
            (s) =>
                s.username.toLowerCase() === username.toLowerCase() &&
                new Date(s.recordedAt) >= cutoff,
        )
        .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
}
