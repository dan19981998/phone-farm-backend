import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { listVideos, downloadVideo, type DriveVideo } from './drive.js';
import { saveToAlbum } from './actions.js';
import { postToInstagram } from './flow.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const safeName = (name: string): string => {
    const ext = path.extname(name);
    const base = path.basename(name, ext).replace(/[^a-zA-Z0-9._-]+/g, '_');
    return `${base}${ext || '.mp4'}`;
};

export interface PostResult {
    video: DriveVideo;
    localPath: string;
    caption: string;
    posted: boolean;
    steps: string[];
}

export const postNextFromDrive = async (
    deviceId: string,
    caption: string,
    fileId?: string,
): Promise<PostResult> => {
    const videos = await listVideos();
    if (videos.length === 0) throw new Error('No videos found in the Drive folder.');
    const video = fileId ? videos.find((v) => v.id === fileId) : videos[0];
    if (!video) throw new Error(`Video ${fileId} not found in the Drive folder.`);

    await mkdir(config.uploadDir, { recursive: true });
    const localPath = path.resolve(config.uploadDir, safeName(video.name));
    await downloadVideo(video.id, localPath);

    await saveToAlbum(deviceId, localPath);
    await delay(3000);

    const result = await postToInstagram(deviceId, caption);

    return { video, localPath, caption, posted: result.posted, steps: result.steps };
};
