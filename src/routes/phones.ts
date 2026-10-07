import { Router } from 'express';
import type { Response } from 'express';
import {
    listDevices,
    setKernelDevice,
    connectAirplay,
    disconnectAirplay,
    collectMouse,
    saveMouseParams,
    deleteKernelDevice,
} from '../services/kernel.js';
import { listPhoneMeta, upsertPhoneMeta, getPhoneMeta } from '../services/phones.js';

export const phonesRouter = Router();

const run = (fn: () => Promise<unknown>) => async (res: Response) => {
    try {
        const result = await fn();
        res.json({ ok: true, result });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
};

export interface PhoneInfo {
    id: string;
    name: string;
    model: string;
    iosVersion: string;
    ip: string;
    online: boolean;
    driveFolderId: string;
}

// Merge the live kernel device list with stored per-phone metadata so the UI
// gets one list: every connected phone, with its editable name + Drive folder.
const listPhones = async (): Promise<PhoneInfo[]> => {
    const [devices, meta] = await Promise.all([listDevices(), listPhoneMeta()]);
    return devices.map((d) => {
        const m = meta[d.deviceid];
        return {
            id: d.deviceid,
            name: m?.name || d.device_name || d.user_name || d.deviceid,
            model: d.model ?? '',
            iosVersion: d.version ?? '',
            ip: d.ip ?? '',
            online: d.state === 1,
            driveFolderId: m?.driveFolderId ?? '',
        };
    });
};

phonesRouter.get('/', (_req, res) => run(() => listPhones())(res));

phonesRouter.put('/:id', (req, res) => {
    const { name, driveFolderId } = req.body ?? {};
    return run(() => upsertPhoneMeta(req.params.id, { name, driveFolderId }))(res);
});

// Bind/activate a physically-connected phone for use in the farm:
//   1) register its name (and the stored name) on the kernel
//   2) start its screen mirror so the live feed comes up
// The AssistiveTouch "Send Binding Key" step is GUI-only and NOT automatable.
phonesRouter.post('/:id/bind', (req, res) => {
    const id = req.params.id;
    return run(async () => {
        const name = (req.body?.name as string | undefined) ?? (await getPhoneMeta(id))?.name;
        if (name) await setKernelDevice(id, name);
        await connectAirplay(id);
        return { bound: true };
    })(res);
});

// Unbind: stop the mirror (device stays physically connected). Pass
// ?remove=1 to also delete it from the kernel's device list entirely.
phonesRouter.post('/:id/unbind', (req, res) => {
    const id = req.params.id;
    const remove = req.body?.remove === true || req.query.remove === '1';
    return run(async () => {
        await disconnectAirplay(id);
        if (remove) await deleteKernelDevice(id);
        return { unbound: true, removed: remove };
    })(res);
});

// Mouse calibration. POST { cmd: 0 } to start collecting parameters for this
// phone model (so taps map to the right screen coordinates).
phonesRouter.post('/:id/calibrate', (req, res) => {
    const cmd = Number(req.body?.cmd ?? 0);
    return run(() => collectMouse(req.params.id, cmd))(res);
});

// Save the collected mouse parameters to the shared library.
phonesRouter.post('/:id/calibrate/save', (req, res) => {
    const describe = (req.body?.describe as string | undefined) ?? req.params.id;
    return run(() => saveMouseParams(req.params.id, describe))(res);
});
