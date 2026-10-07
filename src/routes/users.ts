import { Router } from 'express';
import type { Response } from 'express';
import { listUsers, createUser, updateUser, deleteUser } from '../services/users.js';

export const usersRouter = Router();

const run = (fn: () => Promise<unknown>) => async (res: Response) => {
    try {
        const result = await fn();
        res.json({ ok: true, result });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
};

usersRouter.get('/', (_req, res) => run(() => listUsers())(res));

usersRouter.post('/', (req, res) => {
    const { name, role, phoneIds } = req.body ?? {};
    return run(() => createUser({ name, role, phoneIds }))(res);
});

usersRouter.patch('/:id', (req, res) => {
    const { name, role, phoneIds } = req.body ?? {};
    return run(() => updateUser(req.params.id, { name, role, phoneIds }))(res);
});

usersRouter.delete('/:id', (req, res) => run(() => deleteUser(req.params.id))(res));
