import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Jimp, intToRGBA } from 'jimp';
import { screenshot } from './actions.js';

const run = promisify(execFile);
const binary = join(dirname(fileURLToPath(import.meta.url)), '../../tools/ocr');

// The OCR binary (tools/ocr) is a compiled macOS Apple Vision executable. It
// only runs on macOS. On any other host (e.g. the Windows box the backend is
// deployed to) it doesn't exist / can't execute, so OCR is unavailable there.
const ocrAvailable = platform() === 'darwin' && existsSync(binary);

export interface TextBox {
    text: string;
    confidence: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface OcrResult {
    width: number;
    height: number;
    boxes: TextBox[];
}

// macOS Apple Vision binary (tools/ocr) — reads the phone screen.
// Returns an empty result (no boxes) when OCR isn't available on this host,
// instead of spawning the missing binary and crashing with ENOENT.
export const ocrImage = async (jpegBase64: string): Promise<OcrResult> => {
    if (!ocrAvailable) {
        const image = await Jimp.read(Buffer.from(jpegBase64, 'base64'));
        return { width: image.width, height: image.height, boxes: [] };
    }
    const file = join(tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    await writeFile(file, Buffer.from(jpegBase64, 'base64'));
    try {
        const { stdout } = await run(binary, [file], { maxBuffer: 8 * 1024 * 1024 });
        return JSON.parse(stdout) as OcrResult;
    } finally {
        await unlink(file).catch(() => { });
    }
};

export const ocrDevice = (id: string) => screenshot(id).then(ocrImage);

export interface Point {
    x: number;
    y: number;
}

export const findBlueButton = async (jpegBase64: string): Promise<Point | null> => {
    const image = await Jimp.read(Buffer.from(jpegBase64, 'base64'));
    const width = image.width;
    const height = image.height;
    const isBlue = (x: number, y: number): boolean => {
        const { r, g, b } = intToRGBA(image.getPixelColor(x, y));
        return b > 170 && g > 110 && r < 130;
    };
    let best: { y: number; coverage: number } | null = null;
    for (let y = height - 1; y > height * 0.6; y--) {
        let hits = 0;
        const samples = Math.floor(width / 8);
        for (let i = 0; i < samples; i++) if (isBlue(i * 8, y)) hits++;
        const coverage = hits / samples;
        if (coverage > 0.5 && (!best || coverage >= best.coverage)) best = { y, coverage };
    }
    return best ? { x: Math.round(width / 2), y: best.y } : null;
};

export const findBlueButtonOnDevice = (id: string) =>
    screenshot(id).then(findBlueButton);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const matchPhrase = (result: OcrResult, q: string): TextBox | null => {
    const words = q.split(' ');
    const boxes = result.boxes;
    const rowGap = 12;
    for (let i = 0; i < boxes.length; i++) {
        const seq: TextBox[] = [boxes[i]];
        let joined = norm(boxes[i].text);
        if (joined === words[0] || joined.startsWith(words[0])) {
            for (let j = i + 1; j < boxes.length && seq.length < words.length; j++) {
                if (Math.abs(boxes[j].y - boxes[i].y) > rowGap) continue;
                seq.push(boxes[j]);
                joined += ' ' + norm(boxes[j].text);
                if (joined.startsWith(q)) break;
            }
        }
        if (joined.startsWith(q) || joined.replace(/\.+$/, '') === q) {
            const xs = seq.map((b) => b.x);
            const ys = seq.map((b) => b.y);
            return {
                text: seq.map((b) => b.text).join(' '),
                confidence: Math.min(...seq.map((b) => b.confidence)),
                x: xs.reduce((a, b) => a + b, 0) / xs.length,
                y: ys.reduce((a, b) => a + b, 0) / ys.length,
                w: Math.max(...seq.map((b) => b.x + b.w / 2)) - Math.min(...seq.map((b) => b.x - b.w / 2)),
                h: Math.max(...seq.map((b) => b.h)),
            };
        }
    }
    return null;
};

export const findText = (result: OcrResult, query: string): TextBox | null => {
    const q = norm(query);
    const exact = result.boxes.find((b) => norm(b.text) === q);
    if (exact) return exact;
    const single = result.boxes.find((b) => norm(b.text).includes(q));
    if (single) return single;
    if (q.includes(' ')) return matchPhrase(result, q);
    return null;
};
