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
    width?: string;
    height?: string;
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

// --- Device binding (iMouseXP "Equipment related" endpoints) --------------
// A phone that is physically connected via its USB controller auto-registers
// in /device/get. "Binding" it for use is: name it on the kernel, start its
// screen mirror, and calibrate the mouse mapping so taps land correctly.
// NOTE: the AssistiveTouch "Send Binding Key" step is GUI-only and cannot be
// automated via this API.

export const setKernelDevice = (id: string, name?: string, gid?: string): Promise<unknown> => {
    const data: Record<string, unknown> = { id };
    if (name !== undefined) data.name = name;
    if (gid !== undefined) data.gid = gid;
    return callKernel('/device/set', data);
};

export const deleteKernelDevice = (id: string): Promise<unknown> =>
    callKernel('/device/del', { id });

export const connectAirplay = (id: string): Promise<unknown> =>
    callKernel('/device/airplay/connect', { id });

export const disconnectAirplay = (id: string): Promise<unknown> =>
    callKernel('/device/airplay/disconnect', { id });

// cmd: 0 = start mouse-parameter collection (calibration). Used to teach the
// kernel how this phone model maps hardware-mouse movement to screen coords.
export const collectMouse = (id: string, cmd: number): Promise<unknown> =>
    callKernel('/device/collection/mouse', { id, cmd });

// Save the collected mouse parameters to the public library with a description.
export const saveMouseParams = (id: string, describe: string): Promise<unknown> =>
    callKernel('/device/collection/mouse/save', { id, describe });

export const getDeviceDimensions = async (id: string): Promise<{ width: number; height: number }> => {
    const devices = await listDevices();
    const device = devices.find((d) => d.deviceid === id);
    const width = Number(device?.width);
    const height = Number(device?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error(`Could not get native dimensions for device ${id}`);
    }
    return { width, height };
};
