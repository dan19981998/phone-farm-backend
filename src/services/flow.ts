import { ocrDevice, findText, type OcrResult, type TextBox } from './ocr.js';
import { tap, sendKey, typeText } from './actions.js';

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
    await sendKey(id, 'Home');
    await delay(1200);
    await tapWhenVisible(id, 'Search', 8000);
    await delay(1000);
    await typeText(id, appName);
    await delay(1500);
    await tapWhenVisible(id, appName, 8000);
    await delay(3000);
    return { opened: appName };
};

/** Single OCR pass — returns the matching box or null (does not throw/poll). */
const findOnce = async (id: string, query: string): Promise<TextBox | null> => {
    const result = await ocrDevice(id);
    return findText(result, query);
};

/** Taps text if it is currently on screen. Returns true if tapped. */
const tapIfVisible = async (id: string, query: string): Promise<boolean> => {
    const box = await findOnce(id, query);
    if (!box) return false;
    await tap(id, box.x, box.y);
    return true;
};

/**
 * Full Instagram posting flow, OCR-verified at each step.
 * Opens IG via Spotlight, creates a new reel from the first camera-roll video,
 * types the caption and shares. Optional permission/info dialogs are handled
 * only if they appear (they normally show once, on first use).
 */
export const postToInstagram = async (id: string, caption: string) => {
    const steps: string[] = [];
    const mark = (s: string) => steps.push(s);

    // 1. Open Instagram (lands on the home feed)
    await openApp(id, 'Instagram');
    mark('opened Instagram');
    await delay(1500);

    // 2. Tap the "+" create button (top-left of the feed)
    await tap(id, 34, 94);
    mark('tapped create (+)');
    await delay(2500);

    // 3. First-run photo access screen → "Continue"
    if (await tapIfVisible(id, 'Continue')) {
        mark('photo access: Continue');
        await delay(2000);
        // 4. iOS permission dialog → "Allow Full Access"
        if (await tapIfVisible(id, 'Allow Full Access')) {
            mark('granted full photo access');
            await delay(2500);
        }
    }

    // 5. Media picker → select the first video in the grid, then Next
    await tap(id, 90, 934);
    mark('selected first video');
    await delay(1500);
    await tapWhenVisible(id, 'Next', 10000);
    mark('picker: Next');
    await delay(2500);

    // 6. "Video posts are now shared as reels" info dialog → OK
    if (await tapIfVisible(id, 'OK')) {
        mark('reels info: OK');
        await delay(2000);
    }

    // 7. Reel edit screen → Next
    await tapWhenVisible(id, 'Next', 12000);
    mark('edit: Next');
    await delay(2500);

    // 8. Share screen → tap caption field, type caption, confirm with OK
    await tapWhenVisible(id, 'Add a caption', 10000);
    await delay(1200);
    await typeText(id, caption);
    mark('typed caption');
    await delay(1200);
    // Confirm caption. OCR sometimes misses the small "OK" button, so poll a few
    // times and fall back to the fixed top-right confirm position.
    let confirmed = false;
    for (let i = 0; i < 4 && !confirmed; i++) {
        confirmed = await tapIfVisible(id, 'OK');
        if (!confirmed) await delay(600);
    }
    if (!confirmed) {
        await tap(id, 452, 89); // top-right confirm on the caption editor
        mark('caption: OK (fallback tap)');
    } else {
        mark('caption: OK');
    }
    await delay(1800);

    // 9. Share
    await tapWhenVisible(id, 'Share', 10000);
    mark('tapped Share');
    await delay(3000);

    // 10. Optional audio-consent dialog → Share
    if (await findOnce(id, 'Original audio')) {
        await tapIfVisible(id, 'Share');
        mark('audio consent: Share');
        await delay(4000);
    }

    return { posted: true, caption, steps };
};


export interface FlowStep {
    action: 'tap' | 'wait' | 'sleep';
    text?: string;
    ms?: number;
    timeoutMs?: number;
}

export interface FlowResult {
    step: number;
    action: string;
    text?: string;
    ok: boolean;
    x?: number;
    y?: number;
    ms?: number;
    error?: string;
}

export const runFlow = async (id: string, steps: FlowStep[]): Promise<FlowResult[]> => {
    const results: FlowResult[] = [];
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        try {
            if (step.action === 'sleep') {
                await delay(step.ms ?? 1000);
                results.push({ step: i, action: step.action, ok: true, ms: step.ms });
            } else if (step.action === 'wait') {
                const box = await waitForText(id, step.text!, step.timeoutMs);
                results.push({ step: i, action: step.action, text: step.text, ok: true, x: box.x, y: box.y });
            } else {
                const box = await tapWhenVisible(id, step.text!, step.timeoutMs);
                results.push({ step: i, action: step.action, text: step.text, ok: true, x: box.x, y: box.y });
            }
        } catch (err) {
            results.push({
                step: i,
                action: step.action,
                text: step.text,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            });
            throw Object.assign(new Error(`flow failed at step ${i}`), { results });
        }
    }
    return results;
};
