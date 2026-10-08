import { pointerDown, pointerMove, pointerUp } from './actions.js';

/**
 * Instagram text size control via vertical slider on left corner.
 * Slider bounds (iPhone typical): Y from ~150 (smallest) to ~600 (largest)
 * The slider thumb (circle) is always around X=30
 * 
 * value: 0-100
 *   0 = smallest text (top of slider)
 *   100 = largest text (bottom of slider)
 */

// Configurable bounds (adjust based on device/testing)
const SLIDER_X = 30;           // Circle X position (left corner)
const SLIDER_Y_MIN = 600;      // Bottom of slider range (smallest text)
const SLIDER_Y_MAX = 150;      // Top of slider range (largest text)

export const textSize = async (id: string, value: number): Promise<void> => {
    // Clamp value to 0-100
    const clampedValue = Math.max(0, Math.min(100, value));

    // Map 0-100 to Y coordinate range
    // value 0 = SLIDER_Y_MIN (600, smallest text)
    // value 100 = SLIDER_Y_MAX (150, largest text)
    const targetY = SLIDER_Y_MIN + (clampedValue / 100) * (SLIDER_Y_MAX - SLIDER_Y_MIN);

    // Start drag from middle of slider, drag to target
    const startY = (SLIDER_Y_MIN + SLIDER_Y_MAX) / 2;
    
    await pointerDown(id, SLIDER_X, startY);
    await pointerMove(id, SLIDER_X, targetY);
    await pointerUp(id, SLIDER_X, targetY);
};
