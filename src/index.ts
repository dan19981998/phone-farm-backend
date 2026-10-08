import { createApp } from './app.js';
import { config } from './config/index.js';
import { startWatcher } from './services/watcher.js';
import { startActivityWatcher } from './services/appWatcher.js';
import { startRecorder } from './services/recorder.js';
import { attachControlWs } from './services/control.js';
import * as foldersService from './services/folders.js';

const initializeFolders = async () => {
    try {
        const existing = await foldersService.listFolders();
        if (existing.length === 0 && config.drive.allowedFolders.length > 0) {
            console.log('[folders] Initializing from DRIVE_ALLOWED_FOLDERS env var');
            for (const folderId of config.drive.allowedFolders) {
                await foldersService.addFolder(folderId, `Folder: ${folderId}`);
            }
        }
    } catch (err) {
        console.error('[folders] initialization error:', err instanceof Error ? err.message : err);
    }
};

const app = createApp();

await initializeFolders();

const server = app.listen(config.port, () => {
    console.log(`Phone farm server listening on http://localhost:${config.port}`);
    console.log(`Kernel: ${config.kernel.baseUrl}`);
    if (config.watcher.enabled) {
        void startWatcher().catch((err) => {
            console.error(`[watcher] failed to start: ${err instanceof Error ? err.message : err}`);
        });
    }
    startActivityWatcher();
    startRecorder();
});

attachControlWs(server);
