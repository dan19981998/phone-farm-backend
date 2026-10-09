import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { renderVideoWithText } from '../services/video.js';

const videoRouter = Router();

/**
 * POST /api/video/render
 * Render a video with text overlays
 * 
 * Multipart form:
 *   - video: File (video file)
 *   - textLayers: JSON string of TextLayer[]
 */
videoRouter.post('/render', async (req: Request, res: Response) => {
    try {
        console.log('[video] Render request received');

        // This assumes multer middleware is handling file upload
        const videoFile = (req as any).file;
        if (!videoFile) {
            console.log('[video] No file in request');
            return res.status(400).json({ error: 'No video file provided' });
        }

        console.log('[video] Video file:', { buffer: !!videoFile.buffer, path: videoFile.path, size: videoFile.size });

        const textLayersJson = req.body.textLayers;
        if (!textLayersJson) {
            console.log('[video] No textLayers in request');
            return res.status(400).json({ error: 'No textLayers provided' });
        }

        let textLayers;
        try {
            textLayers = JSON.parse(textLayersJson);
            console.log('[video] Parsed textLayers:', textLayers);
        } catch (err) {
            console.log('[video] Failed to parse textLayers:', err);
            return res.status(400).json({ error: 'Invalid textLayers JSON' });
        }

        // Create temp output file
        const tempDir = os.tmpdir();
        const outputFilename = `edited-${Date.now()}.mp4`;
        const outputPath = path.join(tempDir, outputFilename);

        // If multer uses memory storage, videoFile.buffer exists; if disk, videoFile.path exists
        let inputVideoPath: string;
        if (videoFile.buffer) {
            // Memory storage: write buffer to a temp file
            inputVideoPath = path.join(tempDir, `upload-${Date.now()}.mp4`);
            await fs.writeFile(inputVideoPath, videoFile.buffer);
            console.log(`[video] Wrote upload buffer to ${inputVideoPath}`);
        } else {
            // Disk storage: use the path directly
            inputVideoPath = videoFile.path;
        }

        console.log(`[video] Starting render: ${inputVideoPath} -> ${outputPath}`);

        // Render video with FFmpeg
        await renderVideoWithText(inputVideoPath, textLayers, outputPath);

        console.log('[video] Render complete, reading file');

        // Read the rendered file
        const fileData = await fs.readFile(outputPath);
        console.log('[video] File read, sending:', fileData.length, 'bytes');

        // Send file and clean up
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        res.send(fileData);

        // Clean up temp files
        await Promise.all([
            (videoFile.buffer ? fs.unlink(inputVideoPath).catch(() => { }) : Promise.resolve()),
            fs.unlink(outputPath).catch(() => { }),
        ]);

        console.log('[video] Render complete and cleaned up');
    } catch (err) {
        console.error('[video] Render error:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: errorMessage });
    }
});

export default videoRouter;
