import 'dotenv/config';

const num = (value: string | undefined, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const host = process.env.KERNEL_HOST?.trim() || '192.168.70.170';
const port = num(process.env.KERNEL_PORT, 9911);

const serverPort = num(process.env.PORT, 8080);

export const config = {
    port: serverPort,
    corsOrigin: process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    kernel: {
        host,
        port,
        baseUrl: `http://${host}:${port}/api`,
    },
    drive: {
        clientId: process.env.GOOGLE_CLIENT_ID?.trim() || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || '',
        redirectUri:
            process.env.GOOGLE_REDIRECT_URI?.trim() ||
            `http://localhost:${serverPort}/api/drive/callback`,
        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || '',
        tokenPath: process.env.GOOGLE_TOKEN_PATH?.trim() || '.drive-token.json',
    },
    uploadDir: process.env.UPLOAD_DIR?.trim() || 'uploads',
} as const;
