import { config } from '../config/index.js';
import { listDevices } from './kernel.js';
import { screenshot } from './actions.js';
import { ocrImage, isOcrAvailable } from './ocr.js';
import { logActivity } from './activity.js';

// Read-only OCR activity watcher.
// Periodically screenshots each ONLINE phone, reads the on-screen text, and
// logs simple app transitions (opened / closed / posted). It NEVER taps — it
// only looks — so there is no automation / ban risk.

interface AppSignature {
    app: string;
    // If any of these phrases appear on screen, it's a strong match for the app.
    keywords: string[];
    // Minimum number of keyword hits required to call it this app.
    minHits?: number;
}

// Lowercase phrases. Order matters: first confident match wins.
const APP_SIGNATURES: AppSignature[] = [
    {
        app: 'Instagram',
        keywords: ['for you', 'reels', 'your story', 'add to story', 'suggested for you', 'liked by', 'threads', 'add a comment'],
        minHits: 2,
    },
    {
        app: 'Reddit',
        keywords: ['r/', 'popular', 'upvote', 'join', 'comments', 'communities'],
        minHits: 2,
    },
    {
        app: 'TikTok',
        keywords: ['following', 'for you', 'live', 'discover', 'add comment'],
        minHits: 3,
    },
    {
        app: 'YouTube',
        keywords: ['subscriptions', 'shorts', 'subscribe', 'views', 'home'],
        minHits: 2,
    },
    {
        app: 'Safari',
        keywords: ['search or enter website', 'bookmarks', 'tabs', 'reading list'],
        minHits: 1,
    },
    {
        app: 'Messages',
        keywords: ['imessage', 'text message', 'messages'],
        minHits: 1,
    },
];

// Phrases that signal a successful post/share (logged as "Posted on account").
const POSTED_PHRASES = [
    'your post has been shared',
    'your reel has been shared',
    'your story has been added',
    'post shared',
    'reel shared',
];

interface DeviceState {
    // Last committed app name (or null = unknown/home).
    lastApp: string | null;
    // Debounce: candidate app + how many consecutive polls we've seen it.
    candidate: string | null;
    candidateCount: number;
    // Cooldown so we don't log "posted" repeatedly for the same share.
    lastPostedAt: number;
}

const states = new Map<string, DeviceState>();

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/** Classify the current screen into a known app, or null if unrecognised. */
const classify = (texts: string[]): string | null => {
    const haystack = texts.join(' \n ').toLowerCase();
    let best: { app: string; hits: number } | null = null;
    for (const sig of APP_SIGNATURES) {
        let hits = 0;
        for (const kw of sig.keywords) {
            if (haystack.includes(kw)) hits += 1;
        }
        if (hits >= (sig.minHits ?? 1) && (!best || hits > best.hits)) {
            best = { app: sig.app, hits };
        }
    }
    return best?.app ?? null;
};

const detectPosted = (texts: string[]): boolean => {
    const haystack = texts.join(' \n ').toLowerCase();
    return POSTED_PHRASES.some((p) => haystack.includes(p));
};

const getState = (id: string): DeviceState => {
    let s = states.get(id);
    if (!s) {
        s = { lastApp: null, candidate: null, candidateCount: 0, lastPostedAt: 0 };
        states.set(id, s);
    }
    return s;
};

const scanDevice = async (id: string): Promise<void> => {
    const shot = await screenshot(id);
    const result = await ocrImage(shot);
    const texts = result.boxes.map((b) => b.text);
    if (texts.length === 0) return; // OCR unavailable or blank frame — skip.

    const state = getState(id);

    // --- Posted detection (one-shot, with cooldown) ---
    if (detectPosted(texts) && Date.now() - state.lastPostedAt > 60_000) {
        state.lastPostedAt = Date.now();
        logActivity(id, 'post', 'Posted on account');
    }

    // --- App transition detection (debounced) ---
    const detected = classify(texts);
    if (detected === state.candidate) {
        state.candidateCount += 1;
    } else {
        state.candidate = detected;
        state.candidateCount = 1;
    }

    // Require 2 consecutive identical reads before committing a change, to
    // avoid flapping on transient/loading screens.
    if (state.candidateCount >= 2 && detected !== state.lastApp) {
        if (state.lastApp) logActivity(id, 'close-app', `Closed ${state.lastApp}`);
        if (detected) logActivity(id, 'open-app', `Opened ${detected}`);
        state.lastApp = detected;
    }
};

const tick = async (): Promise<void> => {
    if (ticking) return;
    ticking = true;
    try {
        const devices = await listDevices();
        const online = devices.filter((d) => d.state === 1);
        for (const d of online) {
            try {
                await scanDevice(d.deviceid);
            } catch (err) {
                console.error(`[activity-watcher] scan ${d.deviceid} failed:`, err instanceof Error ? err.message : err);
            }
        }
    } catch (err) {
        console.error('[activity-watcher] tick failed:', err instanceof Error ? err.message : err);
    } finally {
        ticking = false;
    }
};

/** Start the OCR activity watcher. No-op if disabled or OCR is unavailable. */
export const startActivityWatcher = (): void => {
    if (timer) return;
    if (!config.activityWatcher.enabled) {
        console.log('[activity-watcher] disabled (set ACTIVITY_WATCHER_ENABLED=1 to enable)');
        return;
    }
    if (!isOcrAvailable()) {
        console.log('[activity-watcher] OCR not available on this host — watcher not started (run on the macOS backend)');
        return;
    }
    const ms = config.activityWatcher.pollMs;
    console.log(`[activity-watcher] started — scanning online phones every ${ms}ms`);
    timer = setInterval(() => void tick(), ms);
};

export const stopActivityWatcher = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
};
