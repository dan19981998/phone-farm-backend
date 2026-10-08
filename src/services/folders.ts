import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

export interface Folder {
    id: string;
    name: string;
}

const FOLDERS_PATH = path.join(config.dataDir, 'folders.json');

const ensureDir = async (): Promise<void> => {
    try {
        await mkdir(config.dataDir, { recursive: true });
    } catch {
        // directory already exists
    }
};

const loadFolders = async (): Promise<Folder[]> => {
    try {
        const raw = await readFile(FOLDERS_PATH, 'utf8');
        return JSON.parse(raw) as Folder[];
    } catch {
        return [];
    }
};

const saveFolders = async (folders: Folder[]): Promise<void> => {
    await ensureDir();
    await writeFile(FOLDERS_PATH, JSON.stringify(folders, null, 2), 'utf8');
};

export const listFolders = async (): Promise<Folder[]> => {
    return loadFolders();
};

export const addFolder = async (id: string, name: string): Promise<Folder> => {
    const folders = await loadFolders();
    const existing = folders.find((f) => f.id === id);
    if (existing) {
        throw new Error(`Folder with ID ${id} already exists`);
    }
    const folder: Folder = { id, name };
    folders.push(folder);
    await saveFolders(folders);
    return folder;
};

export const removeFolder = async (id: string): Promise<void> => {
    const folders = await loadFolders();
    const filtered = folders.filter((f) => f.id !== id);
    if (filtered.length === folders.length) {
        throw new Error(`Folder with ID ${id} not found`);
    }
    await saveFolders(filtered);
};
