import { createApp } from './app.js';
import { config } from './config/index.js';

const app = createApp();

app.listen(config.port, () => {
    console.log(`Phone farm server listening on http://localhost:${config.port}`);
    console.log(`Kernel: ${config.kernel.baseUrl}`);
});
