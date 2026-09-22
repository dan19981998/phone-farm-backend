import { config } from '../config/index.js';

const TIMEOUT_MS = 15_000;

export interface KernelDevice {
    deviceid: string;
    device_name?: string;
    user_name?: string;
    model?: string;
    version?: string;
    ip?: string;
    state?: number;
}

const timeoutSignal = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
};

export const listDevices = async (): Promise<KernelDevice[]> => {
    const res = await fetch(`${config.kernel.baseUrl}/device/get`, {
        signal: timeoutSignal(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Kernel /device/get failed: HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { list?: KernelDevice[] } };
    return body.data?.list ?? [];
};

interface KernelResponse<T> {
    status?: number;
    message?: string;
    data?: T;
}

const check = <T>(fun: string, body: KernelResponse<T>): T => {
    if (body.status !== 200) {
        throw new Error(`Kernel ${fun} failed: ${body.message || `status ${body.status}`}`);
    }
    return body.data as T;
};

export const callKernel = async <T = unknown>(
    fun: string,
    data: Record<string, unknown> = {},
    timeoutMs = TIMEOUT_MS,
): Promise<T> => {
    const res = await fetch(config.kernel.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fun, data }),
        signal: timeoutSignal(timeoutMs),
    });
    if (!res.ok) throw new Error(`Kernel ${fun} failed: HTTP ${res.status}`);
    return check(fun, (await res.json()) as KernelResponse<T>);
};

export const callKernelForm = async <T = unknown>(
    fields: Record<string, string>,
): Promise<T> => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const res = await fetch(config.kernel.baseUrl, {
        method: 'POST',
        body: form,
        signal: timeoutSignal(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Kernel ${fields.fun} failed: HTTP ${res.status}`);
    return check(fields.fun, (await res.json()) as KernelResponse<T>);
};
