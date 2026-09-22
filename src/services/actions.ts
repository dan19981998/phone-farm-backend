import { callKernel, callKernelForm } from './kernel.js';

export const screenshot = (id: string) =>
    callKernel<{ image: string }>('/pic/screenshot', { id, jpg: true }).then((d) => d.image);

export const tap = (id: string, x: number, y: number) =>
    callKernelForm({ fun: '/mouse/click', id, x: String(Math.round(x)), y: String(Math.round(y)) });

const pointer = (fun: string, id: string, x: number, y: number) =>
    callKernelForm({ fun, id, x: String(Math.round(x)), y: String(Math.round(y)) });

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const swipe = async (id: string, x0: number, y0: number, x1: number, y1: number) => {
    const steps = 12;
    await pointer('/mouse/down', id, x0, y0);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await pointer('/mouse/move', id, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        await delay(12);
    }
    await pointer('/mouse/up', id, x1, y1);
};

export const sendKey = (id: string, key: string) =>
    callKernel('/key/sendkey', { id, fn_key: key });

export const typeText = (id: string, text: string) =>
    callKernel('/key/sendkey', { id, key: text });

export const tapText = async (id: string, query: string) => {
    const { ocrDevice, findText } = await import('./ocr.js');
    const result = await ocrDevice(id);
    const box = findText(result, query);
    if (!box) throw new Error(`text not found on screen: "${query}"`);
    await tap(id, box.x, box.y);
    return box;
};

export const openUrl = (id: string, url: string) =>
    callKernel('/shortcut/exec/url', { id, url }, 8000);

export const setClipboard = (id: string, text: string) =>
    callKernel('/shortcut/clipboard/set', { id, text }, 8000);

export const getClipboard = (id: string) =>
    callKernel<{ text: string }>('/shortcut/clipboard/get', { id }, 8000);

export const saveToAlbum = (id: string, hostPath: string, timeoutMs = 120_000) =>
    callKernel('/shortcut/album/upload', { id, files: [hostPath], outtime: 100_000 }, timeoutMs);
