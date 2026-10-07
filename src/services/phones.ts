import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Per-phone metadata that the kernel doesn't track: the friendly name shown in
// the UI and the Google Drive folder this phone's videos should be saved to.
// Keyed by kernel device id. Device presence/online state still comes from the
// kernel; this store only augments it.

export interface PhoneMeta {
    id: string;
    name: string;
    /** Google Drive folder id this phone saves to (empty = use global default). */
    driveFolderId: string;
}

export interface PhoneMetaInput {
    name?: string;
    driveFolderId?: string;
}

const STORE = path.resolve('.phones.json');

const readStore = async (): Promise<Record<string, PhoneMeta>> => {
    try {
        const parsed = JSON.parse(await readFile(STORE, 'utf8'));
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, PhoneMeta>) : {};
    } catch {
        return {};
    }
};

const writeStore = async (data: Record<string, PhoneMeta>): Promise<void> => {
    await mkdir(path.dirname(STORE), { recursive: true });
    await writeFile(STORE, JSON.stringify(data, null, 2));
};

export const listPhoneMeta = async (): Promise<Record<string, PhoneMeta>> => readStore();

export const getPhoneMeta = async (id: string): Promise<PhoneMeta | null> => {
    const data = await readStore();
    return data[id] ?? null;
};

export const upsertPhoneMeta = async (id: string, input: PhoneMetaInput): Promise<PhoneMeta> => {
    if (!id) throw new Error('Device id is required');
    const data = await readStore();
    const existing = data[id] ?? { id, name: '', driveFolderId: '' };
    const next: PhoneMeta = {
        id,
        name: input.name !== undefined ? input.name.trim() : existing.name,
        driveFolderId: input.driveFolderId !== undefined ? input.driveFolderId.trim() : existing.driveFolderId,
    };
    data[id] = next;
    await writeStore(data);
    return next;
};
