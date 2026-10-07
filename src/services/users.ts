import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Role = 'admin' | 'user';

export interface User {
    id: string;
    name: string;
    role: Role;
    /** Kernel device ids this user can control. Admins typically see all. */
    phoneIds: string[];
    createdAt: string;
}

export interface UserInput {
    name: string;
    role: Role;
    phoneIds: string[];
}

const STORE = path.resolve('.users.json');

const readStore = async (): Promise<User[]> => {
    try {
        const parsed = JSON.parse(await readFile(STORE, 'utf8'));
        return Array.isArray(parsed) ? (parsed as User[]) : [];
    } catch {
        return [];
    }
};

const writeStore = async (users: User[]): Promise<void> => {
    await mkdir(path.dirname(STORE), { recursive: true });
    await writeFile(STORE, JSON.stringify(users, null, 2));
};

const clean = (input: Partial<UserInput>) => ({
    name: (input.name ?? '').trim(),
    role: (input.role === 'admin' ? 'admin' : 'user') as Role,
    phoneIds: Array.isArray(input.phoneIds) ? input.phoneIds.filter((id) => typeof id === 'string') : [],
});

export const listUsers = async (): Promise<User[]> => readStore();

export const createUser = async (input: UserInput): Promise<User> => {
    const data = clean(input);
    if (!data.name) throw new Error('Name is required');
    const users = await readStore();
    const user: User = {
        id: randomUUID(),
        ...data,
        createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeStore(users);
    return user;
};

export const updateUser = async (id: string, input: Partial<UserInput>): Promise<User> => {
    const users = await readStore();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    const existing = users[idx];
    const next: User = {
        ...existing,
        name: input.name !== undefined ? input.name.trim() || existing.name : existing.name,
        role: input.role !== undefined ? (input.role === 'admin' ? 'admin' : 'user') : existing.role,
        phoneIds: input.phoneIds !== undefined
            ? input.phoneIds.filter((pid) => typeof pid === 'string')
            : existing.phoneIds,
    };
    users[idx] = next;
    await writeStore(users);
    return next;
};

export const deleteUser = async (id: string): Promise<{ deleted: true }> => {
    const users = await readStore();
    const next = users.filter((u) => u.id !== id);
    if (next.length === users.length) throw new Error('User not found');
    await writeStore(next);
    return { deleted: true };
};
