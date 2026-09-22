import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { config } from '../config/index.js';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export interface DriveVideo {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number | null;
    createdTime: string | null;
}

const createOAuthClient = (): OAuth2Client => {
    const { clientId, clientSecret, redirectUri } = config.drive;
    if (!clientId || !clientSecret) {
        throw new Error(
            'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server .env.',
        );
    }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const loadSavedToken = async (): Promise<Record<string, unknown> | null> => {
    try {
        const raw = await readFile(config.drive.tokenPath, 'utf8');
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }
};

export const isAuthed = async (): Promise<boolean> => {
    const token = await loadSavedToken();
    return token !== null;
};

export const getAuthUrl = (): string => {
    const client = createOAuthClient();
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
    });
};

export const handleCallback = async (code: string): Promise<void> => {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    await writeFile(config.drive.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
};

const authorizedClient = async (): Promise<OAuth2Client> => {
    const token = await loadSavedToken();
    if (!token) {
        throw new Error('Not signed in to Google Drive. Visit /api/drive/auth first.');
    }
    const client = createOAuthClient();
    client.setCredentials(token);
    client.on('tokens', (fresh) => {
        void writeFile(
            config.drive.tokenPath,
            JSON.stringify({ ...token, ...fresh }, null, 2),
            'utf8',
        );
    });
    return client;
};

export const listVideos = async (folderId?: string): Promise<DriveVideo[]> => {
    const targetFolder = folderId || config.drive.folderId;
    if (!targetFolder) {
        throw new Error('No Drive folder configured. Set GOOGLE_DRIVE_FOLDER_ID in the server .env.');
    }
    const auth = await authorizedClient();
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
        q: `'${targetFolder}' in parents and mimeType contains 'video/' and trashed = false`,
        orderBy: 'createdTime desc',
        fields: 'files(id, name, mimeType, size, createdTime)',
        pageSize: 100,
    });
    return (res.data.files ?? []).map((f) => ({
        id: f.id ?? '',
        name: f.name ?? '',
        mimeType: f.mimeType ?? '',
        sizeBytes: f.size ? Number(f.size) : null,
        createdTime: f.createdTime ?? null,
    }));
};

export const downloadVideo = async (fileId: string, destPath: string): Promise<string> => {
    const auth = await authorizedClient();
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' },
    );
    const absolute = path.resolve(destPath);
    await pipeline(res.data, createWriteStream(absolute));
    return absolute;
};
