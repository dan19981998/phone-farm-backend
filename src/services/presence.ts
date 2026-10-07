// Tracks which devices currently have a USER control page open (i.e. the phone
// is "in use on the user's end"). A viewer is counted only when the control
// page opens the stream with ?use=control — the admin "All Phones" preview
// uses a different tag so previewing never marks a phone as in use.

const counts = new Map<string, number>();

export const addViewer = (id: string): void => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
};

export const removeViewer = (id: string): void => {
    const next = (counts.get(id) ?? 0) - 1;
    if (next <= 0) counts.delete(id);
    else counts.set(id, next);
};

export const inUse = (id: string): boolean => (counts.get(id) ?? 0) > 0;

/** Map of deviceId -> true for every phone currently in use by a user. */
export const presenceMap = (): Record<string, boolean> => {
    const out: Record<string, boolean> = {};
    for (const id of counts.keys()) out[id] = true;
    return out;
};
