import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Role = 'admin' | 'user';

export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    /** Kernel device ids this user can control. Admins typically see all. */
    phoneIds: string[];
    /** Admin-set sign-in password (demo only — stored as plain text). */
    password: string;
    createdAt: string;
}

export interface UserInput {
    name: string;
    email: string;
    role: Role;
    phoneIds: string[];
    password: string;
}

/** User as returned to the client — never leaks the password itself. */
export type PublicUser = Omit<User, 'password'> & { hasPassword: boolean };

const toPublic = (u: User): PublicUser => {
    const { password, ...rest } = u;
    return { ...rest, hasPassword: Boolean(password) };
};

const STORE = path.resolve('.users.json');

const readStore = async (): Promise<User[]> => {
    try {
        const parsed = JSON.parse(await readFile(STORE, 'utf8'));
        let users = Array.isArray(parsed) ? (parsed as User[]) : [];

        // Migration: add missing fields to old users
        let needsWrite = false;
        users = users.map((u) => {
            let updated = false;
            const user: Partial<User> & { id: string } = { ...u };

            // Add email if missing
            if (!user.email) {
                user.email = `user+${user.id.slice(0, 8)}@phone-farm.local`;
                updated = true;
            }

            // Add password if missing (mark as needing reset)
            if (!user.password) {
                user.password = '';
                updated = true;
            }

            if (updated) needsWrite = true;
            return user as User;
        });

        // Write back if any migrations were applied
        if (needsWrite) {
            await writeStore(users);
        }

        return users;
    } catch {
        return [];
    }
};

const writeStore = async (users: User[]): Promise<void> => {
    await mkdir(path.dirname(STORE), { recursive: true });
    await writeFile(STORE, JSON.stringify(users, null, 2));
};

const isStrongPassword = (value: string) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/.test(value.trim());

const normaliseEmail = (value: string) => value.trim().toLowerCase();

const validatePassword = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) throw new Error('Password is required');
    if (!isStrongPassword(trimmed)) {
        throw new Error('Password must be at least 10 characters and include upper/lower case, a number, and a symbol.');
    }
    return trimmed;
};

const clean = (input: Partial<UserInput>) => ({
    name: (input.name ?? '').trim(),
    email: normaliseEmail((input.email ?? '').trim()),
    role: (input.role === 'admin' ? 'admin' : 'user') as Role,
    phoneIds: Array.isArray(input.phoneIds) ? input.phoneIds.filter((id) => typeof id === 'string') : [],
    password: typeof input.password === 'string' ? validatePassword(input.password) : '',
});

export const listUsers = async (): Promise<PublicUser[]> => (await readStore()).map(toPublic);

export const createUser = async (input: UserInput): Promise<PublicUser> => {
    const data = clean(input);
    if (!data.name) throw new Error('Name is required');
    if (!data.email) throw new Error('Email is required');
    const users = await readStore();
    const existing = users.find((u) => u.email.toLowerCase() === data.email.toLowerCase());
    if (existing) throw new Error('A user with that email already exists');
    const user: User = {
        id: randomUUID(),
        ...data,
        password: data.password,
        createdAt: new Date().toISOString(),
    };
    users.push(user);
    await writeStore(users);
    return toPublic(user);
};

export const updateUser = async (id: string, input: Partial<UserInput>): Promise<PublicUser> => {
    const users = await readStore();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) throw new Error('User not found');
    const existing = users[idx];
    const nextEmail = input.email !== undefined ? normaliseEmail((input.email ?? '').trim()) : existing.email;
    const nextPassword = typeof input.password === 'string' ? validatePassword(input.password) : existing.password;
    const next: User = {
        ...existing,
        name: input.name !== undefined ? input.name.trim() || existing.name : existing.name,
        email: nextEmail || existing.email,
        role: input.role !== undefined ? (input.role === 'admin' ? 'admin' : 'user') : existing.role,
        phoneIds: input.phoneIds !== undefined
            ? input.phoneIds.filter((pid) => typeof pid === 'string')
            : existing.phoneIds,
        password: nextPassword,
    };
    if (input.email !== undefined && nextEmail && users.some((u) => u.id !== id && u.email.toLowerCase() === nextEmail)) {
        throw new Error('A user with that email already exists');
    }
    users[idx] = next;
    await writeStore(users);
    return toPublic(next);
};

export const deleteUser = async (id: string): Promise<{ deleted: true }> => {
    const users = await readStore();
    const next = users.filter((u) => u.id !== id);
    if (next.length === users.length) throw new Error('User not found');
    await writeStore(next);
    return { deleted: true };
};
