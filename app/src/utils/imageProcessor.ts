export interface ProAdjustments {
    brightness: number;   // -100 to 100
    exposure: number;     // -100 to 100 (-3 EV to +3 EV)
    highlights: number;   // -100 to 100
    shadows: number;      // -100 to 100
    contrast: number;     // -100 to 100
    saturate: number;     // -100 to 100
    temperature: number;  // -100 to 100
    tint: number;         // -100 to 100
    selective_colors?: {
        target_hue: number;
        d_hue: number;
        d_sat: number;
        d_lum: number;
    }[];
}

export function applyProAdjustments(
    imageData: ImageData,
    adj: ProAdjustments
): void {
    const data = imageData.data;
    const len = data.length;

    // Normalizations
    // Exposure: Use Gamma curve so white stays white and black stays black
    // If exposure > 0, gamma < 1 (boost midtones). If exposure < 0, gamma > 1 (darken midtones).
    const gamma = Math.pow(2, -adj.exposure / 50); 
    
    // Brightness: Simple linear shift
    const brightnessShift = adj.brightness / 100;
    
    // contrast: -100 => 0.2, +100 => 2.0 (non-linear mapped)
    const contrastFact = adj.contrast >= 0 
        ? 1 + (adj.contrast / 100) * 1.5 // 1 to 2.5
        : 1 + (adj.contrast / 100) * 0.8; // 0.2 to 1

    // saturation: -100 => 0 (grayscale), +100 => 2.5
    const saturationFact = adj.saturate >= 0
        ? 1 + (adj.saturate / 100) * 1.5
        : 1 + (adj.saturate / 100);

    // Temperature (Blue <-> Amber)
    const tempK = adj.temperature / 100;
    const rTemp = 1 + (tempK > 0 ? tempK * 0.25 : 0);
    const bTemp = 1 + (tempK < 0 ? -tempK * 0.25 : 0);
    
    // Tint (Green <-> Magenta)
    const tintK = adj.tint / 100;
    const gTint = 1 + (tintK < 0 ? -tintK * 0.25 : 0);
    const rbTint = 1 + (tintK > 0 ? tintK * 0.15 : 0);

    const hlFact = adj.highlights / 100; // -1 to 1
    const shFact = adj.shadows / 100;    // -1 to 1

    for (let i = 0; i < len; i += 4) {
        let r = data[i] / 255;
        let g = data[i + 1] / 255;
        let b = data[i + 2] / 255;

        // 1. Exposure (Gamma Curve - protects 0 and 1)
        if (gamma !== 1) {
            r = Math.pow(r, gamma);
            g = Math.pow(g, gamma);
            b = Math.pow(b, gamma);
        }

        // 2. Brightness (Linear Shift - turns white to gray when negative)
        if (brightnessShift !== 0) {
            r += brightnessShift;
            g += brightnessShift;
            b += brightnessShift;
        }

        // 2. Temp and Tint (White Balance)
        r = r * rTemp * rbTint;
        g = g * gTint;
        b = b * bTemp * rbTint;

        // 3. Contrast (apply around midpoint 0.5)
        if (contrastFact !== 1) {
            r = (r - 0.5) * contrastFact + 0.5;
            g = (g - 0.5) * contrastFact + 0.5;
            b = (b - 0.5) * contrastFact + 0.5;
        }

        // Clamp before HSL conversion
        r = r < 0 ? 0 : (r > 1 ? 1 : r);
        g = g < 0 ? 0 : (g > 1 ? 1 : g);
        b = b < 0 ? 0 : (b > 1 ? 1 : b);

        // 4. Shadows / Highlights / Saturation (via HSL)
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) {
                h = (g - b) / d + (g < b ? 6 : 0);
            } else if (max === g) {
                h = (b - r) / d + 2;
            } else {
                h = (r - g) / d + 4;
            }
            h /= 6;
        }

        // Apply Saturation
        if (saturationFact !== 1) {
            s *= saturationFact;
            s = s < 0 ? 0 : (s > 1 ? 1 : s);
        }

        // Apply Shadows and Highlights to L
        // Shadows curve: strongest effect at l=0.1, trails off at l=0.5
        if (shFact !== 0 && l < 0.5) {
            const weight = Math.cos((l / 0.5) * (Math.PI / 2)); // 1 at 0, 0 at 0.5
            l += shFact * 0.35 * weight;
        }

        // Highlights curve: strongest effect at l=0.9, trails off at l=0.5
        if (hlFact !== 0 && l > 0.5) {
            const weight = Math.sin(((l - 0.5) / 0.5) * (Math.PI / 2)); // 0 at 0.5, 1 at 1.0
            l += hlFact * 0.35 * weight;
        }

        // 5. Selective Color (HSL Local Adjustments)
        if (adj.selective_colors && adj.selective_colors.length > 0) {
            for (let i = 0; i < adj.selective_colors.length; i++) {
                const sc = adj.selective_colors[i];
                // Distance in degrees (h is 0-1)
                const hueDeg = h * 360;
                let diff = Math.abs(hueDeg - sc.target_hue);
                if (diff > 180) diff = 360 - diff;
                
                // Falloff range of 25 degrees
                if (diff < 25) {
                    // Smooth feathering: 1 at center, 0 at 25
                    const weight = 0.5 * (1 + Math.cos(Math.PI * (diff / 25)));
                    
                    if (weight > 0) {
                        h += (sc.d_hue / 360) * weight;
                        s += (sc.d_sat / 100) * weight;
                        l += (sc.d_lum / 100) * weight;
                    }
                }
            }
            // re-normalize h
            if (h < 0) h += 1;
            if (h > 1) h -= 1;
            s = s < 0 ? 0 : (s > 1 ? 1 : s);
            // Wait to clamp l until next block
        }
        
        l = l < 0 ? 0 : (l > 1 ? 1 : l);

        // Convert back to RGB
        let fr, fg, fb;
        if (s === 0) {
            fr = fg = fb = l;
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            fr = hue2rgb(p, q, h + 1/3);
            fg = hue2rgb(p, q, h);
            fb = hue2rgb(p, q, h - 1/3);
        }

        data[i] = fr * 255;
        data[i + 1] = fg * 255;
        data[i + 2] = fb * 255;
        // Alpha data[i+3] remains untouched
    }
}
