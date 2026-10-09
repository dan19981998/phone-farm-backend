import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createCanvas } from 'canvas';

interface TextLayer {
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontColor: string;
    rotation: number;
    startTime: number;
    endTime: number;
}

/**
 * Render text layer as PNG using Node.js Canvas
 */
async function renderTextLayer(layer: TextLayer, videoWidth: number, videoHeight: number): Promise<Buffer> {
    try {
        // Create canvas matching video dimensions
        const canvas = createCanvas(videoWidth, videoHeight);
        const ctx = canvas.getContext('2d');

        // Fill with transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, videoWidth, videoHeight);

        // Set text properties
        ctx.fillStyle = layer.fontColor;
        ctx.font = `${layer.fontSize}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Apply rotation if needed
        if (layer.rotation !== 0) {
            ctx.save();
            ctx.translate(layer.x + layer.fontSize / 2, layer.y + layer.fontSize / 2);
            ctx.rotate((layer.rotation * Math.PI) / 180);
            ctx.fillText(layer.text, -layer.fontSize / 2, -layer.fontSize / 2);
            ctx.restore();
        } else {
            ctx.fillText(layer.text, layer.x, layer.y);
        }

        // Export as PNG buffer
        const buffer = canvas.toBuffer('image/png');
        console.log('[renderTextLayer] Canvas rendered text layer successfully');

        return buffer;
    } catch (err) {
        console.error('[renderTextLayer] Canvas render failed:', err);
        // Return transparent image as fallback
        const canvas = createCanvas(videoWidth, videoHeight);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, videoWidth, videoHeight);
        return canvas.toBuffer('image/png');
    }
}

/**
 * Get video dimensions using ffprobe
 */
async function getVideoDimensions(videoPath: string): Promise<{ width: number; height: number }> {
    try {
        const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`;
        const output = execSync(cmd, { encoding: 'utf-8' }).trim();
        const [width, height] = output.split(',').map(v => parseInt(v, 10));
        console.log('[getVideoDimensions] Detected:', { width, height });
        return { width, height };
    } catch (err) {
        console.error('[getVideoDimensions] Failed, using default 1920x1080:', err);
        return { width: 1920, height: 1080 };
    }
}

/**
 * Render a video with text overlays using FFmpeg
 * Now uses overlay filters with image files instead of drawtext
 */
export const renderVideoWithText = async (
    inputVideoPath: string,
    textLayers: TextLayer[],
    outputPath: string
): Promise<void> => {
    console.log(`[renderVideo] Starting with ${textLayers.length} text layers`);

    if (textLayers.length === 0) {
        console.log('[renderVideo] No text layers, copying video');
        await fs.copyFile(inputVideoPath, outputPath);
        console.log('[renderVideo] Copy complete');
        return;
    }

    // Get video dimensions
    const { width, height } = await getVideoDimensions(inputVideoPath);

    // Render text layers as PNG images
    const tempDir = os.tmpdir();
    const textImagePaths: Array<{ path: string; layer: TextLayer }> = [];

    for (const layer of textLayers) {
        try {
            const imageBuffer = await renderTextLayer(layer, width, height);
            const imagePath = path.join(tempDir, `text-layer-${layer.id}.png`);
            await fs.writeFile(imagePath, imageBuffer);
            textImagePaths.push({ path: imagePath, layer });
            console.log(`[renderVideo] Created text layer: ${imagePath}`);
        } catch (err) {
            console.error(`[renderVideo] Failed to render text layer ${layer.id}:`, err);
        }
    }

    // Build FFmpeg command with overlay filters
    const inputFlags = textImagePaths.map(({ path: p }) => `-i "${p}"`).join(' ');
    const filterChain = buildOverlayFilterChain(textImagePaths);
    console.log('[renderVideo] Filter chain:', filterChain);

    // Map the filtered video output and original audio
    const cmd = `ffmpeg -i "${inputVideoPath}" ${inputFlags} -filter_complex "${filterChain}" -map "[v]" -map 0:a -c:a aac -b:a 128k -c:v libx264 -crf 23 -y "${outputPath}"`;

    console.log(`[renderVideo] FFmpeg command: ${cmd}`);

    try {
        execSync(cmd, { encoding: 'utf-8' });
        console.log('[renderVideo] FFmpeg succeeded');

        // Cleanup
        for (const { path: imagePath } of textImagePaths) {
            await fs.unlink(imagePath).catch(() => { });
        }

        console.log('[renderVideo] Render complete');
    } catch (err) {
        const error = err as any;
        const errorMessage = error.message || String(err);
        console.error(`[renderVideo] FFmpeg failed: ${errorMessage}`);

        for (const { path: imagePath } of textImagePaths) {
            await fs.unlink(imagePath).catch(() => { });
        }

        throw new Error(`Video render failed: ${errorMessage}`);
    }
};

/**
 * Build overlay filter chain
 */
function buildOverlayFilterChain(textImagePaths: Array<{ path: string; layer: TextLayer }>): string {
    if (textImagePaths.length === 0) {
        return '[0:v]format=yuv420p[v]';
    }

    let chain = '[0:v]';

    for (let i = 0; i < textImagePaths.length; i++) {
        const { layer } = textImagePaths[i];
        const isLast = i === textImagePaths.length - 1;
        const outLabel = isLast ? '[v]' : `[temp${i}]`;

        // Chain each overlay filter
        if (i === 0) {
            chain += `[${i + 1}:v]overlay=x=${Math.round(layer.x)}:y=${Math.round(layer.y)}:enable='between(t,${layer.startTime},${layer.endTime})'${outLabel}`;
        } else {
            chain = chain.replace(/\]$/, `[${i + 1}:v]overlay=x=${Math.round(layer.x)}:y=${Math.round(layer.y)}:enable='between(t,${layer.startTime},${layer.endTime})'${outLabel}`);
        }
    }

    return chain;
}
