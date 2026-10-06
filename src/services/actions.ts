import { callKernel, callKernelForm } from './kernel.js';
import type { TextBox } from './ocr.js';

export const screenshot = (id: string) =>
    callKernel<{ image: string }>('/pic/screenshot', { id, jpg: true }).then((d) => d.image);

export const tap = (id: string, x: number, y: number) =>
    callKernelForm({ fun: '/mouse/click', id, x: String(Math.round(x)), y: String(Math.round(y)) });

const pointer = (fun: string, id: string, x: number, y: number) =>
    callKernelForm({ fun, id, x: String(Math.round(x)), y: String(Math.round(y)) });

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const swipe = async (id: string, x0: number, y0: number, x1: number, y1: number) => {
    const steps = 12;
    const delayMs = 5;

    await pointer('/mouse/down', id, x0, y0);

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        await pointer('/mouse/move', id, x, y);
        await delay(delayMs);
    }

    await pointer('/mouse/up', id, x1, y1);
};

export const pointerDown = (id: string, x: number, y: number) => pointer('/mouse/down', id, x, y);
export const pointerMove = (id: string, x: number, y: number) => pointer('/mouse/move', id, x, y);
export const pointerUp = (id: string, x: number, y: number) => pointer('/mouse/up', id, x, y);
export const sendKey = (id: string, key: string) =>
    callKernel('/key/sendkey', { id, fn_key: key });

export const typeText = (id: string, text: string) => {
    if (text.includes(' ') || /[A-Z]/.test(text)) {
        return typeTextHuman(id, text, Math.max(1, text.length / 12));
    }
    return callKernel('/key/sendkey', { id, key: text });
};

export const typeInstant = (id: string, text: string) => typeText(id, text);

// Raw USB-HID typing of the whole string in one shot (handles upper/lowercase,
// digits, symbols). No on-screen key tapping, no OCR — needs a focused text
// field. Used for OCR-free flows like Spotlight app search on the Windows host.
export const typeRaw = (id: string, text: string) =>
    callKernel('/key/sendkey', { id, key: text });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

// iOS keyboard dwell time setting (in ms). Adjust based on device setting:
// Device setting 0.1s → use 150ms | Device setting 1.5s → use 1600-1800ms
// Cache for keyboard layout to avoid redundant screenshots
let cachedKeyboardLayout: { width: number; height: number; points: ReturnType<typeof getKeyboardPointsFromScreenshot> } | null = null;
const getCachedKeyboardLayout = async (id: string, forceRefresh = false) => {
    if (cachedKeyboardLayout && !forceRefresh) return cachedKeyboardLayout;
    const { Jimp } = await import('jimp');
    const image = await Jimp.read(Buffer.from(await screenshot(id), 'base64'));
    const { width, height } = image;
    cachedKeyboardLayout = {
        width,
        height,
        points: getKeyboardPointsFromScreenshot(width, height),
    };
    return cachedKeyboardLayout;
};

// Clear cache when keyboard state changes
export const invalidateKeyboardCache = () => {
    cachedKeyboardLayout = null;
};

const getKeyboardPointsFromScreenshot = (width: number, height: number) => {
    return {
        shift: { x: Math.round(width * 0.10), y: Math.round(height * 0.855) },
        spacebar: { x: Math.round(width * 0.5), y: Math.round(height * 0.895) },
        emoji: { x: Math.round(width * 0.08), y: Math.round(height * 0.965) },
        oneTwoThree: { x: Math.round(width * 0.17), y: Math.round(height * 0.892) },
        hashPlusEquals: { x: Math.round(width * 0.12), y: Math.round(height * 0.82) },
        abc: { x: Math.round(width * 0.19), y: Math.round(height * 0.898) },
    };
};

const LETTER_KEYS: Record<string, { row: number; col: number }> = {
    q: { row: 0, col: 0 }, w: { row: 0, col: 1 }, e: { row: 0, col: 2 }, r: { row: 0, col: 3 }, t: { row: 0, col: 4 },
    y: { row: 0, col: 5 }, u: { row: 0, col: 6 }, i: { row: 0, col: 7 }, o: { row: 0, col: 8 }, p: { row: 0, col: 9 },
    a: { row: 1, col: 0 }, s: { row: 1, col: 1 }, d: { row: 1, col: 2 }, f: { row: 1, col: 3 }, g: { row: 1, col: 4 },
    h: { row: 1, col: 5 }, j: { row: 1, col: 6 }, k: { row: 1, col: 7 }, l: { row: 1, col: 8 },
    z: { row: 2, col: 0 }, x: { row: 2, col: 1 }, c: { row: 2, col: 2 }, v: { row: 2, col: 3 }, b: { row: 2, col: 4 },
    n: { row: 2, col: 5 }, m: { row: 2, col: 6 },
    '1': { row: -1, col: 0 }, '2': { row: -1, col: 1 }, '3': { row: -1, col: 2 }, '4': { row: -1, col: 3 },
    '5': { row: -1, col: 4 }, '6': { row: -1, col: 5 }, '7': { row: -1, col: 6 }, '8': { row: -1, col: 7 },
    '9': { row: -1, col: 8 }, '0': { row: -1, col: 9 },
};

const SYMBOL_KEYS: Record<string, { page: '123' | '#+='; x: number; y: number }> = {
    // 123 page
    '1': { page: '123', x: 0.05, y: 0.70 },
    '2': { page: '123', x: 0.15, y: 0.70 },
    '3': { page: '123', x: 0.25, y: 0.70 },
    '4': { page: '123', x: 0.35, y: 0.70 },
    '5': { page: '123', x: 0.45, y: 0.70 },
    '6': { page: '123', x: 0.55, y: 0.70 },
    '7': { page: '123', x: 0.65, y: 0.70 },
    '8': { page: '123', x: 0.75, y: 0.70 },
    '9': { page: '123', x: 0.85, y: 0.70 },
    '0': { page: '123', x: 0.95, y: 0.70 },
    '-': { page: '123', x: 0.05, y: 0.755 },
    '/': { page: '123', x: 0.15, y: 0.755 },
    ':': { page: '123', x: 0.25, y: 0.755 },
    ';': { page: '123', x: 0.35, y: 0.755 },
    '(': { page: '123', x: 0.45, y: 0.755 },
    ')': { page: '123', x: 0.55, y: 0.755 },
    '$': { page: '123', x: 0.65, y: 0.755 },
    '&': { page: '123', x: 0.75, y: 0.755 },
    '@': { page: '123', x: 0.85, y: 0.755 },
    '"': { page: '123', x: 0.95, y: 0.755 },
    '.': { page: '123', x: 0.25, y: 0.82 },
    ',': { page: '123', x: 0.35, y: 0.82 },
    '?': { page: '123', x: 0.45, y: 0.82 },
    '!': { page: '123', x: 0.55, y: 0.82 },
    "'": { page: '123', x: 0.65, y: 0.82 },
    // #+= page
    '[': { page: '#+=', x: 0.05, y: 0.70 },
    ']': { page: '#+=', x: 0.15, y: 0.70 },
    '{': { page: '#+=', x: 0.25, y: 0.70 },
    '}': { page: '#+=', x: 0.35, y: 0.70 },
    '#': { page: '#+=', x: 0.45, y: 0.70 },
    '%': { page: '#+=', x: 0.55, y: 0.70 },
    '^': { page: '#+=', x: 0.65, y: 0.70 },
    '*': { page: '#+=', x: 0.75, y: 0.70 },
    '+': { page: '#+=', x: 0.85, y: 0.70 },
    '=': { page: '#+=', x: 0.95, y: 0.70 },
    '_': { page: '#+=', x: 0.08, y: 0.755 },
    '\\': { page: '#+=', x: 0.20, y: 0.755 },
    '|': { page: '#+=', x: 0.32, y: 0.755 },
    '~': { page: '#+=', x: 0.44, y: 0.755 },
    '<': { page: '#+=', x: 0.56, y: 0.755 },
    '>': { page: '#+=', x: 0.68, y: 0.755 },
    '£': { page: '#+=', x: 0.80, y: 0.755 },
    '€': { page: '#+=', x: 0.92, y: 0.755 },
    '¥': { page: '#+=', x: 0.92, y: 0.755 },
};

const getLetterPoint = (width: number, height: number, char: string) => {
    const info = LETTER_KEYS[char.toLowerCase()];
    if (!info) return null;
    if (info.row === -1) {
        const x = 0.05 + (info.col / 9) * 0.90;
        return { x: Math.round(width * x), y: Math.round(height * 0.64) };
    }
    const rows = [
        { y: 0.70, keys: 10, startX: 0.05, endX: 0.95 },
        { y: 0.755, keys: 9, startX: 0.08, endX: 0.92 },
        { y: 0.82, keys: 7, startX: 0.12, endX: 0.78 },
    ];
    const row = rows[info.row];
    const x = row.startX + (info.col / (row.keys - 1)) * (row.endX - row.startX);
    return { x: Math.round(width * x), y: Math.round(height * row.y) };
};

const getSymbolPoint = (width: number, height: number, char: string) => {
    const info = SYMBOL_KEYS[char];
    if (!info) return null;
    return { x: Math.round(width * info.x), y: Math.round(height * info.y) };
};

export const tapLetterKey = async (id: string, char: string) => {
    const layout = await getCachedKeyboardLayout(id);
    const point = getLetterPoint(layout.width, layout.height, char);
    if (!point) throw new Error(`No on-screen key for character: ${char}`);
    await tap(id, point.x, point.y);
};

export const tapSymbolKey = async (id: string, char: string) => {
    const layout = await getCachedKeyboardLayout(id);
    const point = getSymbolPoint(layout.width, layout.height, char);
    if (!point) throw new Error(`No on-screen key for symbol: ${char}`);
    await tap(id, point.x, point.y);
};

export const tapSpacebar = async (id: string) => {
    const layout = await getCachedKeyboardLayout(id);
    await tap(id, layout.points.spacebar.x, layout.points.spacebar.y);
};

export const tapShiftKey = async (id: string) => {
    const layout = await getCachedKeyboardLayout(id);
    await tap(id, layout.points.shift.x, layout.points.shift.y);
    await wait(rand(80, 150));
};

export const tapEmojiKey = async (id: string) => {
    const layout = await getCachedKeyboardLayout(id);
    await tap(id, layout.points.emoji.x, layout.points.emoji.y);
};

export const typeTextHuman = async (id: string, text: string, targetSeconds = 5, fast = false): Promise<{ durationMs: number }> => {
    if (!text.length) return { durationMs: 0 };

    const start = Date.now();

    // Get cached layout once for all operations
    await getCachedKeyboardLayout(id);

    // Minimal overhead estimates
    const overheadPerChar = fast ? 30 : 50;
    const overheadPerSpace = fast ? 80 : 120;
    const overheadPerUpper = fast ? 150 : 250;
    const overheadPerSymbol = fast ? 400 : 600;

    let totalOverhead = 0;
    for (const ch of text) {
        if (ch === ' ') totalOverhead += overheadPerSpace;
        else if (ch >= 'A' && ch <= 'Z') totalOverhead += overheadPerUpper;
        else if (ch >= '0' && ch <= '9') totalOverhead += overheadPerChar;
        else if (SYMBOL_KEYS[ch]) totalOverhead += overheadPerSymbol;
        else totalOverhead += overheadPerChar;
    }

    const targetMs = Math.max(fast ? 100 : 600, targetSeconds * 1000);
    const remainingMs = Math.max(0, targetMs - totalOverhead);
    const delayPerChar = text.length > 0 ? remainingMs / text.length : 0;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const charStart = Date.now();

        if (ch === ' ') {
            // Use cached layout for space
            const layout = await getCachedKeyboardLayout(id, false);
            await tap(id, layout.points.spacebar.x, layout.points.spacebar.y);
        } else if (ch >= 'A' && ch <= 'Z') {
            // Uppercase: shift + tap letter (must tap, not sendkey)
            const layout = await getCachedKeyboardLayout(id, false);
            await tap(id, layout.points.shift.x, layout.points.shift.y);
            await wait(fast ? rand(20, 50) : rand(20, 50));
            const pt = getLetterPoint(layout.width, layout.height, ch.toLowerCase());
            if (pt) await tap(id, pt.x, pt.y);
            await wait(fast ? rand(20, 50) : rand(20, 50));
        } else if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) {
            // Lowercase/digits: direct send (fastest)
            await callKernel('/key/sendkey', { id, key: ch });
            await wait(fast ? 30 : 50);
        } else if (SYMBOL_KEYS[ch]) {
            // Symbol: use optimized tap
            await tapSymbolKeyOcr(id, ch);
        }

        const elapsed = Date.now() - charStart;
        const targetDelay = fast ? rand(15, 30) : delayPerChar * rand(0.7, 1.3);
        const waitMs = Math.max(0, Math.round(targetDelay - elapsed));
        if (waitMs > 0) await wait(waitMs);
    }

    return { durationMs: Date.now() - start };
};

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

export interface AlbumUploadResult {
    code: number;
    id: string;
    message?: string;
    list?: unknown[];
}

export const saveToAlbum = (id: string, hostPath: string, timeoutMs = 30_000) =>
    callKernel<AlbumUploadResult>(
        '/shortcut/album/upload',
        { id, files: [hostPath], outtime: 18_000 },
        timeoutMs,
    );

export const doubleTap = async (id: string, x: number, y: number) => {
    await tap(id, x, y);
    await delay(90);
    await tap(id, x, y);
};

export const pasteEmoji = async (id: string, emoji: string) => {
    await setClipboard(id, emoji);
    await delay(150);
    await sendKey(id, 'Command+v');
    await delay(150);
};

export const tapSymbolKeyOcr = async (id: string, char: string) => {
    const { ocrDevice, findText } = await import('./ocr.js');
    const { Jimp } = await import('jimp');

    const image = await Jimp.read(Buffer.from(await screenshot(id), 'base64'));
    const { oneTwoThree, hashPlusEquals, abc } = getKeyboardPointsFromScreenshot(image.width, image.height);

    // Open the 123 symbols page.
    await tap(id, oneTwoThree.x, oneTwoThree.y);
    await wait(rand(120, 180));

    // If the character is on the #+= page, open it.
    const info = SYMBOL_KEYS[char];
    if (info?.page === '#+=') {
        await tap(id, hashPlusEquals.x, hashPlusEquals.y);
        await wait(rand(120, 180));
    }

    // Find the key on screen. OCR (macOS Apple Vision) is unavailable on the
    // Windows host, so treat any OCR failure as "not found" and fall back to
    // the hard-coded key position instead of crashing (spawn tools/ocr ENOENT).
    let box: TextBox | null = null;
    try {
        let result = await ocrDevice(id);
        box = findText(result, char);
        let attempts = 0;
        while (!box && attempts < 2) {
            await wait(150);
            result = await ocrDevice(id);
            box = findText(result, char);
            attempts++;
        }
    } catch {
        // OCR binary not present (e.g. running on Windows) — use coordinates.
    }
    if (box) {
        await tap(id, box.x, box.y);
    } else {
        // Fall back to hard-coded position (screen dims from the screenshot).
        const pt = getSymbolPoint(image.width, image.height, char);
        if (pt) {
            await tap(id, pt.x, pt.y);
        }
    }

    await wait(rand(80, 140));

    // Return to ABC.
    await tap(id, abc.x, abc.y);
    await wait(rand(80, 140));
    if (info?.page === '#+=') {
        await tap(id, abc.x, abc.y);
        await wait(rand(80, 140));
    }
};

export const typeLiveKey = async (id: string, char: string) => {
    const layout = await getCachedKeyboardLayout(id);
    const { width, height } = layout;
    const { shift, spacebar, oneTwoThree, abc } = layout.points;

    // Space
    if (char === ' ') {
        await tap(id, spacebar.x, spacebar.y);
        await wait(rand(150, 180));
        return;
    }

    // Uppercase letter: shift + letter
    if (char >= 'A' && char <= 'Z') {
        await tap(id, shift.x, shift.y);
        await wait(rand(150, 180));
        const pt = getLetterPoint(width, height, char.toLowerCase());
        if (pt) await tap(id, pt.x, pt.y);
        await wait(rand(150, 180));
        return;
    }

    // Lowercase letter
    if (char >= 'a' && char <= 'z') {
        const pt = getLetterPoint(width, height, char);
        if (pt) await tap(id, pt.x, pt.y);
        await wait(rand(150, 180));
        return;
    }

    // Digit: switch page, tap, switch back
    if (char >= '0' && char <= '9') {
        await tap(id, oneTwoThree.x, oneTwoThree.y);
        await wait(rand(150, 180));
        const pt = getSymbolPoint(width, height, char);
        if (pt) await tap(id, pt.x, pt.y);
        await wait(rand(150, 180));
        await tap(id, abc.x, abc.y);
        await wait(rand(150, 180));
        return;
    }

    // Symbol
    await tapSymbolKeyOcr(id, char);
};
