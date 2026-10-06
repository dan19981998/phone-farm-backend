import { callKernel } from './kernel.js';
import { config } from '../config/index.js';

export const screenshotBuffer = async (id: string): Promise<Buffer> => {
    const data = await callKernel<{ image: string; code?: number }>(
        '/pic/screenshot',
        { id, jpg: true },
        8000,
    );
    if (!data.image) throw new Error('empty screenshot');
    return Buffer.from(data.image, 'base64');
};

export interface StreamHandle {
    stop: () => void;
}

export const streamDevice = (
    id: string,
    onFrame: (jpeg: Buffer) => void,
    onError?: (err: Error) => void,
): StreamHandle => {
    let running = true;
    const minFrameMs = 1000 / config.stream.fps;
    let latest: Buffer | null = null;
    let hasNewFrame = false;

    const worker = async () => {
        while (running) {
            try {
                const jpeg = await screenshotBuffer(id);
                if (!running) break;
                latest = jpeg;
                hasNewFrame = true;
            } catch (err) {
                if (!running) break;
                onError?.(err instanceof Error ? err : new Error(String(err)));
                await new Promise((r) => setTimeout(r, 500));
            }
        }
    };

    const emitter = async () => {
        while (running) {
            const frameStart = Date.now();
            if (hasNewFrame && latest) {
                onFrame(latest);
                hasNewFrame = false;
            }
            const elapsed = Date.now() - frameStart;
            const wait = Math.max(0, minFrameMs - elapsed);
            if (wait > 0 && running) {
                await new Promise((r) => setTimeout(r, wait));
            }
        }
    };

    for (let i = 0; i < config.stream.workers; i++) {
        void worker();
    }
    void emitter();

    return {
        stop: () => {
            running = false;
        },
    };
};
