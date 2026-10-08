import { pointerDown, pointerMove, pointerUp } from './actions.js';

/**
 * Instagram text size control via vertical slider.
 * Users calibrate by clicking exactly where the slider is on their phone.
 * Once calibrated, we know the exact X,Y coordinate of the slider.
 * 
 * Dragging strategy:
 *   - value 0-100 maps to pointer movement from calibrated Y up/down
 *   - 50% = at calibrated point (middle)
 *   - 0% = drag down (smaller text)
 *   - 100% = drag up (larger text)
 */

interface CalibratedCoords {
    x: number;
    y: number;
}

// Storage for calibrated coordinates per device
const calibrationData = new Map<string, CalibratedCoords>();

// Fallback bounds if not calibrated
const DEFAULT_SLIDER_X = 30;
const DEFAULT_Y_MIN = 600;
const DEFAULT_Y_MAX = 150;

export const calibrate = async (id: string, x: number, y: number): Promise<CalibratedCoords> => {
    const coords = { x, y };
    calibrationData.set(id, coords);
    console.log(`[instagram] Calibrated device ${id} at X=${x}, Y=${y}`);
    return coords;
};

export const getCalibration = (id: string): CalibratedCoords | null => {
    return calibrationData.get(id) || null;
};

export const textSize = async (id: string, value: number): Promise<void> => {
    // Clamp value to 0-100
    const clampedValue = Math.max(0, Math.min(100, value));

    // Get calibrated coordinates or use defaults
    const calibrated = calibrationData.get(id);
    const sliderX = calibrated?.x || DEFAULT_SLIDER_X;
    const sliderY = calibrated?.y || (DEFAULT_Y_MIN + DEFAULT_Y_MAX) / 2;

    // Map 0-100 value to Y movement around calibrated point
    // 0 = drag down (smaller text)
    // 50 = at calibrated point (middle)
    // 100 = drag up (larger text)
    const dragRange = 150; // Total drag distance up/down (pixels)
    const targetY = sliderY - (dragRange / 2) + (clampedValue / 100) * dragRange;

    console.log(`[instagram] textSize: value=${value}, startY=${sliderY}, targetY=${targetY}`);

    // Simulate continuous drag with multiple intermediate moves
    await pointerDown(id, sliderX, sliderY);

    // Send 5 intermediate moves to simulate smooth drag
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
        const progress = i / steps;
        const intermediateY = sliderY + (targetY - sliderY) * progress;
        await pointerMove(id, sliderX, intermediateY);
        await new Promise(resolve => setTimeout(resolve, 50)); // 50ms between moves
    }

    await pointerUp(id, sliderX, targetY);
};
