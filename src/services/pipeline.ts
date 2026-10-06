import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { downloadVideo, type DriveVideo } from './drive.js';
import { saveToAlbum } from './actions.js';

const safeName = (name: string): string => {
    const ext = path.extname(name);
    const base = path.basename(name, ext).replace(/[^a-zA-Z0-9._-]+/g, '_');
    return `${base}${ext || '.mp4'}`;
};

const resolveKernelPath = async (video: DriveVideo): Promise<string> => {
    await mkdir(config.uploadDir, { recursive: true });
    const name = safeName(video.name);
    const localPath = path.resolve(config.uploadDir, name);

    if (config.kernelUploadDir) {
        return `${config.kernelUploadDir.replace(/[\\/]+$/, '')}\\${video.name}`;
    }
    await downloadVideo(video.id, localPath);
    return localPath;
};

export interface SaveResult {
    video: DriveVideo;
    code: number;
    message?: string;
}

export const saveDriveVideoToAlbum = async (
    deviceId: string,
    video: DriveVideo,
): Promise<SaveResult> => {
    const kernelPath = await resolveKernelPath(video);
    const result = await saveToAlbum(deviceId, kernelPath);
    return { video, code: result.code, message: result.message };
};
