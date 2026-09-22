import { execFile } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { screenshot } from './actions.js';

const run = promisify(execFile);
const binary = join(dirname(fileURLToPath(import.meta.url)), '../../tools/ocr');

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

export const ocrImage = async (jpegBase64: string): Promise<OcrResult> => {
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

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export const findText = (result: OcrResult, query: string): TextBox | null => {
    const q = norm(query);
    const exact = result.boxes.find((b) => norm(b.text) === q);
    if (exact) return exact;
    return result.boxes.find((b) => norm(b.text).includes(q)) ?? null;
};

export const findAllText = (result: OcrResult, query: string): TextBox[] => {
    const q = norm(query);
    return result.boxes.filter((b) => norm(b.text).includes(q));
};
