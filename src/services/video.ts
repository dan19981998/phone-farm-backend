import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';

interface TextLayer {
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontColor: string;
    fontFamily: string;
    rotation: number;
    startTime: number;
    endTime: number;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    opacity: number;
    letterSpacing: number;
    textAlign: 'left' | 'center' | 'right';
    textStroke?: { enabled: boolean; width: number; color: string };
    textShadow?: { enabled: boolean; offsetX: number; offsetY: number; blur: number; color: string };
}

interface ImageLayer {
    id: string;
    imageUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    startTime: number;
    endTime: number;
    opacity: number;
    borderRadius?: number;
    shadow?: { enabled: boolean; offsetX: number; offsetY: number; blur: number; color: string };
}

async function renderTextLayer(layer: TextLayer, videoWidth: number, videoHeight: number): Promise<Buffer> {
    try {
        const canvas = createCanvas(videoWidth, videoHeight);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0)';
        ctx.fillRect(0, 0, videoWidth, videoHeight);

        ctx.globalAlpha = layer.opacity || 1;
        ctx.fillStyle = layer.fontColor;
        const fontWeight = layer.bold ? 'bold' : 'normal';
        const fontStyle = layer.italic ? 'italic' : 'normal';
        const fontFamily = layer.fontFamily || 'Arial';
        ctx.font = `${fontStyle} ${fontWeight} ${layer.fontSize}px ${fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Apply text shadow if enabled
        if (layer.textShadow?.enabled) {
            ctx.shadowColor = layer.textShadow.color;
            ctx.shadowBlur = layer.textShadow.blur;
            ctx.shadowOffsetX = layer.textShadow.offsetX;
            ctx.shadowOffsetY = layer.textShadow.offsetY;
        }

        const textX = layer.x;
        const textY = layer.y;

        console.log(`  [renderTextLayer DRAW] at (${textX}, ${textY}) | fontSize: ${layer.fontSize} | align: ${ctx.textAlign}`);

        // Draw text stroke if enabled
        if (layer.textStroke?.enabled) {
            ctx.strokeStyle = layer.textStroke.color;
            ctx.lineWidth = layer.textStroke.width;
            ctx.strokeText(layer.text, textX, textY);
        }

        // Draw text
        ctx.fillText(layer.text, textX, textY);

        // Handle underline
        if (layer.underline) {
            const metrics = ctx.measureText(layer.text);
            ctx.globalAlpha = layer.opacity; // Restore opacity
            ctx.strokeStyle = layer.fontColor;
            ctx.lineWidth = Math.max(1, Math.round(layer.fontSize / 15));
            const underlineY = textY + layer.fontSize + 2;
            ctx.beginPath();
            ctx.moveTo(textX, underlineY);
            ctx.lineTo(textX + metrics.width, underlineY);
            ctx.stroke();
        }

        // Handle strikethrough
        if (layer.strikethrough) {
            const metrics = ctx.measureText(layer.text);
            ctx.globalAlpha = layer.opacity; // Restore opacity
            ctx.strokeStyle = layer.fontColor;
            ctx.lineWidth = Math.max(1, Math.round(layer.fontSize / 15));
            const strikethroughY = textY + layer.fontSize * 0.5;
            ctx.beginPath();
            ctx.moveTo(textX, strikethroughY);
            ctx.lineTo(textX + metrics.width, strikethroughY);
            ctx.stroke();
        }

        // Export as PNG buffer
        const buffer = canvas.toBuffer('image/png');
        console.log('[renderTextLayer] Canvas rendered text layer:', {
            text: layer.text,
            fontSize: layer.fontSize,
            color: layer.fontColor,
            bold: layer.bold,
            italic: layer.italic,
        });

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

async function videoHasAudio(videoPath: string): Promise<boolean> {
    try {
        const cmd = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
        const output = execSync(cmd, { encoding: 'utf-8' }).trim();
        const hasAudio = output.includes('audio');
        console.log('[videoHasAudio] Detected audio:', hasAudio);
        return hasAudio;
    } catch (err) {
        console.error('[videoHasAudio] Failed to detect, assuming no audio:', err);
        return false;
    }
}

/**
 * Render a video with text overlays and image overlays using FFmpeg
 */
export const renderVideoWithText = async (
    inputVideoPath: string,
    textLayers: TextLayer[],
    imageLayers: ImageLayer[],
    outputPath: string,
    filters?: any,
    cropStart: number = 0,
    cropEnd: number = 0
): Promise<void> => {
    console.log(`[renderVideo] Starting with ${textLayers.length} text layers and ${imageLayers.length} image layers`, filters ? `and filters: ${JSON.stringify(filters)}` : '');

    if (textLayers.length === 0 && imageLayers.length === 0 && !filters && (cropStart === 0 && cropEnd === 0)) {
        console.log('[renderVideo] No text layers, image layers, filters, or crop, copying video');
        await fs.copyFile(inputVideoPath, outputPath);
        console.log('[renderVideo] Copy complete');
        return;
    }

    if (cropEnd > 0 && cropStart < cropEnd) {
        console.log(`[renderVideo] Cropping video from ${cropStart}s to ${cropEnd}s (duration: ${cropEnd - cropStart}s)`);
    }

    // Get video dimensions
    const { width, height } = await getVideoDimensions(inputVideoPath);

    // Render text layers as PNG images
    const tempDir = os.tmpdir();
    const textImagePaths: Array<{ path: string; layer: TextLayer }> = [];

    for (const layer of textLayers) {
        try {
            console.log(`[RENDER TEXT] "${layer.text}" | position: (${layer.x},${layer.y}) | fontSize: ${layer.fontSize} | align: ${layer.textAlign} | video: ${width}x${height}`);
            const imageBuffer = await renderTextLayer(layer, width, height);
            const imagePath = path.join(tempDir, `text-layer-${layer.id}.png`);
            await fs.writeFile(imagePath, imageBuffer);
            textImagePaths.push({ path: imagePath, layer });
        } catch (err) {
            console.error(`[renderVideo] Failed to render text layer ${layer.id}:`, err);
        }
    }

    // Image layers are pre-rendered to PNG with rounded corners and shadow, like text layers
    const imageLayerPaths: Array<{ path: string; layer: ImageLayer; x: number; y: number }> = [];
    for (const layer of imageLayers) {
        try {
            let source: string | Buffer = layer.imageUrl;
            const matches = layer.imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
            if (matches) source = Buffer.from(matches[1], 'base64');

            const { buffer, x, y } = await renderImageLayer(layer, source);
            const imagePath = path.join(tempDir, `image-layer-${layer.id}.png`);
            await fs.writeFile(imagePath, buffer);
            imageLayerPaths.push({ path: imagePath, layer, x, y });
            console.log(`[renderVideo] Rendered image layer: ${imagePath}`);
        } catch (err) {
            console.error(`[renderVideo] Failed to process image layer ${layer.id}:`, err);
        }
    }

    // Add crop filter if needed
    const cropFilter = (cropEnd > 0 && cropStart < cropEnd) ? `trim=start=${cropStart}:end=${cropEnd},setpts=PTS-STARTPTS` : null;

    // Video filters: crop first, then color filters
    const videoFilterParts: string[] = [];
    if (cropFilter) videoFilterParts.push(cropFilter);
    if (filters) {
        // ffmpeg has no brightness/contrast/saturate filters; they are options of eq.
        // Grayscale is applied as desaturation on top of the saturate value.
        const saturation = (filters.saturate / 100) * (1 - filters.grayscale / 100);
        const eqOptions: string[] = [];
        if (filters.brightness !== 100) eqOptions.push(`brightness=${(filters.brightness - 100) / 100}`);
        if (filters.contrast !== 100) eqOptions.push(`contrast=${filters.contrast / 100}`);
        if (saturation !== 1) eqOptions.push(`saturation=${Math.min(3, Math.max(0, saturation))}`);
        if (eqOptions.length > 0) videoFilterParts.push(`eq=${eqOptions.join(':')}`);
        if (filters.hueRotate !== 0) videoFilterParts.push(`hue=h=${filters.hueRotate}`);
        if (filters.blur > 0) videoFilterParts.push(`boxblur=${filters.blur}`);
    }

    // Overlay times are absolute video times, but overlays run after the crop trim,
    // so they must be shifted by cropStart
    const overlayTimeOffset = cropFilter ? cropStart : 0;
    const hasVideoFilters = videoFilterParts.length > 0;
    const baseLabel = hasVideoFilters ? '[vf]' : '[0:v]';
    const videoPreChain = hasVideoFilters ? `[0:v]${videoFilterParts.join(',')}[vf];` : '';
    const filterChain = videoPreChain + buildOverlayFilterChain(textImagePaths, imageLayerPaths, baseLabel, overlayTimeOffset);

    console.log('[renderVideo] Filter chain:', filterChain);

    // Check if video has audio
    const hasAudio = await videoHasAudio(inputVideoPath);

    // Map all input files
    const inputFlags = textImagePaths.map(({ path: p }) => `-i "${p}"`).join(' ') + ' ' +
        imageLayerPaths.map(({ path: p }) => `-i "${p}"`).join(' ');

    // Build audio flags conditionally
    const audioChain = hasAudio && cropFilter ? `;[0:a]atrim=start=${cropStart}:end=${cropEnd},asetpts=PTS-STARTPTS[a]` : '';
    const audioMap = cropFilter ? '-map "[a]"' : '-map 0:a';
    const audioFlags = hasAudio ? `${audioMap} -c:a aac -b:a 128k` : '';

    const cmd = `ffmpeg -i "${inputVideoPath}" ${inputFlags} -filter_complex "${filterChain}${audioChain}" -map "[v]" ${audioFlags} -c:v libx264 -crf 23 -y "${outputPath}"`;

    console.log(`[renderVideo] FFmpeg command: ${cmd}`);

    try {
        execSync(cmd, { encoding: 'utf-8' });
        console.log('[renderVideo] FFmpeg succeeded');

        // Cleanup
        for (const { path: imagePath } of textImagePaths) {
            await fs.unlink(imagePath).catch(() => { });
        }
        for (const { path: imagePath } of imageLayerPaths) {
            // Only delete temp files we created, not original image URLs
            if (imagePath.includes('image-layer-')) {
                await fs.unlink(imagePath).catch(() => { });
            }
        }

        console.log('[renderVideo] Render complete');
    } catch (err) {
        const error = err as any;
        const errorMessage = error.message || String(err);
        console.error(`[renderVideo] FFmpeg failed: ${errorMessage}`);

        for (const { path: imagePath } of textImagePaths) {
            await fs.unlink(imagePath).catch(() => { });
        }
        for (const { path: imagePath } of imageLayerPaths) {
            if (imagePath.includes('image-layer-')) {
                await fs.unlink(imagePath).catch(() => { });
            }
        }

        throw new Error(`Video render failed: ${errorMessage}`);
    }
};


function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Renders an image layer to a PNG with rotation, opacity, rounded corners and an optional box shadow.
// The PNG is larger than the box when rotated or shadowed, so it also returns where its top-left goes on the video.
async function renderImageLayer(layer: ImageLayer, source: string | Buffer): Promise<{ buffer: Buffer; x: number; y: number }> {
    const img = await loadImage(source);
    const w = Math.max(1, Math.round(layer.width));
    const h = Math.max(1, Math.round(layer.height));
    const radius = Math.max(0, Math.min(layer.borderRadius ?? 0, w / 2, h / 2));
    const shadow = layer.shadow?.enabled ? layer.shadow : null;
    const opacity = layer.opacity ?? 1;
    const angle = (layer.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const shadowReach = shadow ? Math.ceil(shadow.blur * 2 + Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY))) : 0;
    const canvasW = Math.ceil(Math.abs(w * cos) + Math.abs(h * sin)) + shadowReach * 2;
    const canvasH = Math.ceil(Math.abs(w * sin) + Math.abs(h * cos)) + shadowReach * 2;

    const canvas = createCanvas(canvasW, canvasH);
    const ctx = canvas.getContext('2d');
    // Draw around the centre so the box rotates about its own centre, like CSS transform
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate(angle);

    if (shadow) {
        // Canvas shadow offsets are not rotated by the transform, so rotate them manually
        ctx.globalAlpha = opacity;
        ctx.shadowColor = shadow.color;
        ctx.shadowBlur = shadow.blur;
        ctx.shadowOffsetX = shadow.offsetX * cos - shadow.offsetY * sin;
        ctx.shadowOffsetY = shadow.offsetX * sin + shadow.offsetY * cos;
        ctx.fillStyle = '#000000';
        roundRectPath(ctx, -w / 2, -h / 2, w, h, radius);
        ctx.fill();

        // Remove the box itself so the shadow only shows outside it, like CSS box-shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    ctx.globalAlpha = opacity;
    roundRectPath(ctx, -w / 2, -h / 2, w, h, radius);
    ctx.clip();
    const fit = Math.min(w / img.width, h / img.height);
    const dw = img.width * fit;
    const dh = img.height * fit;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);

    return {
        buffer: canvas.toBuffer('image/png'),
        x: Math.round(layer.x + w / 2 - canvasW / 2),
        y: Math.round(layer.y + h / 2 - canvasH / 2),
    };
}

function buildOverlayFilterChain(
    textImagePaths: Array<{ path: string; layer: TextLayer }>,
    imageLayerPaths: Array<{ path: string; layer: ImageLayer; x: number; y: number }>,
    baseLabel: string,
    timeOffset: number
): string {
    const allOverlays: Array<{ type: 'text' | 'image'; layer: TextLayer | ImageLayer; inputIndex: number; x: number; y: number }> = [];

    let inputIndex = 1;
    for (const item of textImagePaths) {
        allOverlays.push({ type: 'text', layer: item.layer, inputIndex, x: 0, y: 0 });
        inputIndex++;
    }
    for (const item of imageLayerPaths) {
        allOverlays.push({ type: 'image', layer: item.layer, inputIndex, x: item.x, y: item.y });
        inputIndex++;
    }

    if (allOverlays.length === 0) {
        return `${baseLabel}format=yuv420p[v]`;
    }

    const operations: string[] = [];

    for (let i = 0; i < allOverlays.length; i++) {
        const item = allOverlays[i];
        const isLast = i === allOverlays.length - 1;
        const inLabel = i === 0 ? baseLabel : `[temp${i - 1}]`;
        const outLabel = isLast ? '[v]' : `[temp${i}]`;
        const imageInput = `[${item.inputIndex}:v]`;
        const enable = `enable='between(t,${(item.layer.startTime - timeOffset).toFixed(3)},${(item.layer.endTime - timeOffset).toFixed(3)})'`;

        if (item.type === 'text') {
            operations.push(`${inLabel}${imageInput}overlay=${enable}${outLabel}`);
        } else {
            operations.push(`${inLabel}${imageInput}overlay=x=${item.x}:y=${item.y}:${enable}${outLabel}`);
        }
    }

    return operations.join(';');
}
