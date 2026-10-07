import { createApp } from './app.js';
import { config } from './config/index.js';
import { startWatcher } from './services/watcher.js';
import { startActivityWatcher } from './services/appWatcher.js';
import { startRecorder } from './services/recorder.js';
import { attachControlWs } from './services/control.js';

const app = createApp();


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
