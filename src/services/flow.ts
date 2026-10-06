import { ocrDevice, findText, type OcrResult, type TextBox } from './ocr.js';
import { tap } from './actions.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const waitForText = async (
    id: string,
    query: string,
    timeoutMs = 15000,
    intervalMs = 800,
): Promise<TextBox> => {
    const deadline = Date.now() + timeoutMs;
    let last: OcrResult | null = null;
    while (Date.now() < deadline) {
        last = await ocrDevice(id);
        const box = findText(last, query);
        if (box) return box;
        await delay(intervalMs);
    }
    const seen = last ? last.boxes.map((b) => b.text).join(' | ') : '(none)';
    throw new Error(`timeout waiting for "${query}". saw: ${seen}`);
};

export const tapWhenVisible = async (
    id: string,
    query: string,
    timeoutMs = 15000,
): Promise<TextBox> => {
    const box = await waitForText(id, query, timeoutMs);
    await tap(id, box.x, box.y);
    return box;
};

export const openApp = async (_id: string, appName: string) => {
    // Disabled — app launching removed. Swipe gestures cover navigation.
    return { opened: appName };
};

export interface FlowStep {
    action: 'tap' | 'wait' | 'sleep';
    text?: string;
    ms?: number;
    timeoutMs?: number;
}
