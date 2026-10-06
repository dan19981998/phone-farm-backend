import { ocrDevice, findText, type OcrResult, type TextBox } from './ocr.js';
import { tap, sendKey, swipe, typeRaw, screenshot } from './actions.js';

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

export const openApp = async (id: string, appName: string) => {
    // Open an app via iOS Spotlight search — works without OCR, so it runs on
    // the Windows host (where the Apple Vision OCR binary isn't available).
    // Flow: go to the home screen -> swipe down to open Spotlight -> type the
    // app name into the focused search field (raw USB-HID) -> press Return to
    // launch the top hit.
    const { Jimp } = await import('jimp');
    const image = await Jimp.read(Buffer.from(await screenshot(id), 'base64'));
    const { width, height } = image;
    const cx = Math.round(width / 2);

    // Make sure we're on the home screen (close any open app).
    await sendKey(id, 'Home');
    await delay(450);
    await sendKey(id, 'Home');
    await delay(550);

    // Swipe down from the middle of the home screen to open Spotlight search.
    await swipe(id, cx, Math.round(height * 0.32), cx, Math.round(height * 0.70));
    await delay(800);

    // Type the app name into the focused Spotlight field, then open top result.
    await typeRaw(id, appName);
    await delay(1000);
    await sendKey(id, 'Enter');
    await delay(400);

    return { opened: appName };
};

export interface FlowStep {
    action: 'tap' | 'wait' | 'sleep';
    text?: string;
    ms?: number;
    timeoutMs?: number;
}
