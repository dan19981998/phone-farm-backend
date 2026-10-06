import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { tap, pointerDown, pointerMove, pointerUp, sendKey, typeText, typeLiveKey, doubleTap } from './actions.js';

interface TapMsg { type: 'tap'; x: number; y: number }
interface DownMsg { type: 'down'; x: number; y: number }
interface MoveMsg { type: 'move'; x: number; y: number }
interface UpMsg { type: 'up'; x: number; y: number }
interface KeyMsg { type: 'key'; key: string; shift?: boolean }
interface TextMsg { type: 'text'; text: string }
interface DoubleTapMsg { type: 'doubleTap'; x: number; y: number }
type ControlMsg = TapMsg | DownMsg | MoveMsg | UpMsg | KeyMsg | TextMsg | DoubleTapMsg;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

const handle = async (id: string, msg: ControlMsg): Promise<void> => {
    switch (msg.type) {
        case 'tap':
            await tap(id, msg.x, msg.y);
            break;
        case 'down':
            await pointerDown(id, msg.x, msg.y);
            break;
        case 'move':
            await pointerMove(id, msg.x, msg.y);
            break;
        case 'up':
            await pointerUp(id, msg.x, msg.y);
            break;
        case 'key': {
            const key = msg.key;
            if (key === 'space') {
                await typeLiveKey(id, ' ');
            } else if (key === 'Backspace' || key === 'Enter' || key === 'Home' || key === 'AppSwitch') {
                await sendKey(id, key);
                await new Promise((r) => setTimeout(r, 120));
            } else if (key.length === 1) {
                await typeLiveKey(id, key);
            } else {
                await sendKey(id, key);
                await new Promise((r) => setTimeout(r, 120));
            }
            break;
        }
        case 'text':
            await typeText(id, msg.text);
            break;
        case 'doubleTap':
            await doubleTap(id, msg.x, msg.y);
            break;
    }
};

export const attachControlWs = (server: Server): void => {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        if (url.pathname !== '/api/control') return;
        const id = url.searchParams.get('id') ?? '';
        if (!id) {
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            bind(ws, id);
        });
    });
};

const bind = (ws: WebSocket, id: string): void => {

    const queue: ControlMsg[] = [];
    let draining = false;

    const drain = async () => {
        if (draining) return;
        draining = true;
        while (queue.length) {
            const msg = queue.shift() as ControlMsg;
            try {
                // Wait for ALL messages in order (including moves) to ensure swipes execute properly
                await handle(id, msg);
            } catch {
            }
        }
        draining = false;
    };

    ws.on('message', (raw) => {
        let msg: ControlMsg;
        try {
            msg = JSON.parse(raw.toString()) as ControlMsg;
        } catch {
            return;
        }
        if (msg.type !== 'key' && msg.type !== 'text') {
            if (Number.isNaN(num((msg as TapMsg).x)) || Number.isNaN(num((msg as TapMsg).y))) return;
        }
        queue.push(msg);
        void drain();
    });
};
