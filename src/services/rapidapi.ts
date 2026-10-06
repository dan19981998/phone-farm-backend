import { config } from '../config/index.js';
import { getFollowerGrowth, getFollowerHistory, recordSnapshot, type FollowerSnapshot, type GrowthWindow } from './followerSnapshots.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = `https://${config.rapidapi.host}`;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const cache = new Map<string, { at: number; data: RapidApiProfileResponse }>();

export interface RapidApiProfile {
    pk: string;
    full_name: string;
    username: string;
    is_verified: boolean;
    profile_pic_url: string;
    hd_profile_pic_url_info?: { url: string };
    follower_count: number;
    following_count: number;
    media_count: number;
    is_private: boolean;
    biography?: string;
    external_url?: string;
}

export interface RapidApiPost {
    id: string;
    code: string;
    type: 'carousel' | 'video' | 'photo';
    thumbnailUrl: string;
    mediaId: string;
    likeCount: number;
    viewCount?: number;
    caption?: string;
    takenAt?: number;
}

export interface RapidApiProfileResponse {
    profile: RapidApiProfile;
    posts: RapidApiPost[];
    growth: GrowthWindow[];
    history: FollowerSnapshot[];
    totals: {
        likes: number;
        views: number;
        posts: number;
    };
}

interface RawProfileHoverResponse {
    user_data?: {
        pk?: string;
        full_name?: string;
        username?: string;
        is_verified?: boolean;
        profile_pic_url?: string;
        hd_profile_pic_url_info?: { url?: string };
        follower_count?: number;
        following_count?: number;
        media_count?: number;
        is_private?: boolean;
        biography?: string;
        external_url?: string;
    };
}

interface RawUserPostItem {
    node?: {
        __typename?: string;
        code?: string;
        pk?: string;
        id?: string;
        media_type?: number;
        carousel_media_count?: number;
        image_versions2?: {
            candidates?: Array<{ url?: string }>;
        };
        like_count?: number;
        view_count?: number;
        caption?: { text?: string };
        taken_at?: number;
    };
}

interface RawUserPostsResponse {
    posts?: RawUserPostItem[];
}

function normalizeUserPost(raw: RawUserPostItem): RapidApiPost | null {
    const node = raw?.node;
    if (!node) return null;
    const code = node.code;
    if (!code) return null;
    const isCarousel = (node.carousel_media_count ?? 0) > 1;
    const type: RapidApiPost['type'] =
        node.media_type === 2 ? 'video' : isCarousel ? 'carousel' : 'photo';
    const thumbnailUrl = node.image_versions2?.candidates?.[0]?.url ?? '';
    return {
        id: node.id ?? `${code}_${Date.now()}`,
        code,
        type,
        thumbnailUrl,
        mediaId: node.pk ?? node.id ?? '',
        likeCount: node.like_count ?? 0,
        viewCount: node.view_count,
        caption: node.caption?.text,
        takenAt: node.taken_at,
    };
}

async function fetchUserPosts(username: string): Promise<RapidApiPost[]> {
    if (!config.rapidapi.key) return [];

    const url = new URL(`${BASE_URL}/get_ig_user_posts.php`);
    url.searchParams.set('username_or_url', username);

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            'x-rapidapi-host': config.rapidapi.host,
            'x-rapidapi-key': config.rapidapi.key,
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`RapidAPI posts HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as RawUserPostsResponse;
    return (data.posts ?? []).map(normalizeUserPost).filter((p): p is RapidApiPost => p !== null);
}

const DEMO_DATA_PATH = path.join(process.cwd(), 'demo-data.json');

async function loadDemoData(): Promise<RapidApiProfileResponse | null> {
    try {
        const raw = await readFile(DEMO_DATA_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Omit<RapidApiProfileResponse, 'growth' | 'history' | 'totals'>;
        const profile = parsed.profile;
        const posts = parsed.posts;
        await recordSnapshot({
            username: profile.username,
            followerCount: profile.follower_count,
            followingCount: profile.following_count,
            mediaCount: profile.media_count,
            recordedAt: new Date().toISOString(),
        });
        const growth = await getFollowerGrowth(profile.username, profile.follower_count);
        const history = await getFollowerHistory(profile.username);
        const totals = posts.reduce(
            (acc, p) => ({
                likes: acc.likes + (p.likeCount ?? 0),
                views: acc.views + (p.viewCount ?? 0),
                posts: acc.posts + 1,
            }),
            { likes: 0, views: 0, posts: 0 },
        );
        return { profile, posts, growth, history, totals };
    } catch (err) {
        console.warn('Failed to load demo data:', err instanceof Error ? err.message : String(err));
        return null;
    }
}

export async function fetchProfileAndPosts(
    username: string,
    growthDays: number[] = [7, 14, 21, 28],
): Promise<RapidApiProfileResponse> {
    if (config.rapidapi.demoMode) {
        const demo = await loadDemoData();
        if (demo) return demo;
    }

    const key = username.toLowerCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return cached.data;
    }

    const url = new URL(`${BASE_URL}/ig_get_fb_profile_hover.php`);
    url.searchParams.set('username_or_url', username);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'x-rapidapi-host': config.rapidapi.host,
            'x-rapidapi-key': config.rapidapi.key,
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`RapidAPI HTTP ${res.status}: ${text}`);
    }

    const data = (await res.json()) as RawProfileHoverResponse;
    const rawUser = data.user_data ?? {};

    const profile: RapidApiProfile = {
        pk: rawUser.pk ?? '',
        full_name: rawUser.full_name ?? '',
        username: rawUser.username ?? username,
        is_verified: rawUser.is_verified ?? false,
        profile_pic_url: rawUser.hd_profile_pic_url_info?.url ?? rawUser.profile_pic_url ?? '',
        hd_profile_pic_url_info: rawUser.hd_profile_pic_url_info
            ? { url: rawUser.hd_profile_pic_url_info.url ?? '' }
            : undefined,
        follower_count: rawUser.follower_count ?? 0,
        following_count: rawUser.following_count ?? 0,
        media_count: rawUser.media_count ?? 0,
        is_private: rawUser.is_private ?? false,
        biography: rawUser.biography,
        external_url: rawUser.external_url,
    };

    const posts = await fetchUserPosts(username).catch((err) => {
        console.warn('RapidAPI posts fetch failed:', err instanceof Error ? err.message : String(err));
        return [];
    });

    await recordSnapshot({
        username: profile.username,
        followerCount: profile.follower_count,
        followingCount: profile.following_count,
        mediaCount: profile.media_count,
        recordedAt: new Date().toISOString(),
    });

    const growth = await getFollowerGrowth(profile.username, profile.follower_count, growthDays);
    const history = await getFollowerHistory(profile.username);

    const totals = posts.reduce(
        (acc, p) => ({
            likes: acc.likes + (p.likeCount ?? 0),
            views: acc.views + (p.viewCount ?? 0),
            posts: acc.posts + 1,
        }),
        { likes: 0, views: 0, posts: 0 },
    );

    const result = { profile, posts, growth, history, totals };
    cache.set(key, { at: Date.now(), data: result });
    return result;
}
