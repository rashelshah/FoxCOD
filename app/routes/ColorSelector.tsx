/**
 * ColorSelector - Polaris Color Picker Component
 * Uses Shopify Polaris ColorPicker instead of browser native <input type="color">
 * Provides: Color picker palette + Hex input + color swatch preview
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { ColorPicker } from "@shopify/polaris";

interface ColorSelectorProps {
    label: string;
    value: string;
    onChange: (color: string) => void;
}

/* ─── Hex ↔ HSB conversion helpers ─── */

interface HSBColor {
    hue: number;       // 0–360
    saturation: number; // 0–1
    brightness: number; // 0–1
}

function hexToHsb(hex: string): HSBColor {
    // Normalise shorthand (#RGB → #RRGGBB)
    let h = hex.replace('#', '');
    if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let hue = 0;
    if (d !== 0) {
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) hue = ((b - r) / d + 2) * 60;
        else hue = ((r - g) / d + 4) * 60;
    }

    const saturation = max === 0 ? 0 : d / max;
    const brightness = max;

    return { hue, saturation, brightness };
}

function hsbToHex(hsb: HSBColor): string {
    const { hue, saturation, brightness } = hsb;
    const c = brightness * saturation;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = brightness - c;

    let r = 0, g = 0, b = 0;
    if (hue < 60) { r = c; g = x; }
    else if (hue < 120) { r = x; g = c; }
    else if (hue < 180) { g = c; b = x; }
    else if (hue < 240) { g = x; b = c; }
    else if (hue < 300) { r = x; b = c; }
    else { r = c; b = x; }

    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function isValidHex(hex: string): boolean {
    return /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex);
}

function normalizeHex(hex: string): string {
    if (/^#[A-Fa-f0-9]{3}$/.test(hex)) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex.toLowerCase();
}

export function ColorSelector({ label, value, onChange }: ColorSelectorProps) {
    const safeValue = isValidHex(value) ? normalizeHex(value) : '#000000';
    const [hsbColor, setHsbColor] = useState<HSBColor>(hexToHsb(safeValue));
    const [hexInput, setHexInput] = useState(safeValue.toUpperCase());
    const [hexError, setHexError] = useState('');
    const [pickerOpen, setPickerOpen] = useState(false);
    const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Sync internal state when parent value changes externally
    useEffect(() => {
        if (isValidHex(value)) {
            const norm = normalizeHex(value);
            setHsbColor(hexToHsb(norm));
            setHexInput(norm.toUpperCase());
            setHexError('');
        }
    }, [value]);

    // Close picker when clicking outside (supports fixed-position popover)
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            const target = e.target as Node;
            const wrapper = wrapperRef.current;
            const popover = popoverRef.current;
            if (
                wrapper &&
                !wrapper.contains(target) &&
                (!popover || !popover.contains(target))
            ) {
                setPickerOpen(false);
            }
        }
        if (pickerOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [pickerOpen]);

    const handlePickerChange = useCallback((color: HSBColor) => {
        setHsbColor(color);
        const hex = hsbToHex(color);
        onChange(hex);
        setHexInput(hex.toUpperCase());
        setHexError('');
    }, [onChange]);

    const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.toUpperCase();
        if (val && !val.startsWith('#')) val = '#' + val;
        setHexInput(val);

        if (isValidHex(val)) {
            const normalized = normalizeHex(val);
            onChange(normalized);
            setHsbColor(hexToHsb(normalized));
            setHexError('');
        } else if (val.length > 1) {
            setHexError('Invalid hex');
        } else {
            setHexError('');
        }
    }, [onChange]);

    return (
        <div className="polaris-color-selector" ref={wrapperRef}>
            <label className="input-label">{label}</label>
            <div className="polaris-color-row">
                {/* Color swatch that toggles the picker */}
                <div
                    className="polaris-color-swatch"
                    style={{ backgroundColor: safeValue }}
                    onClick={() => {
                        if (!pickerOpen && wrapperRef.current) {
                            const rect = wrapperRef.current.getBoundingClientRect();
                            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
                            const estimatedHeight = 280; // Approx height of Polaris ColorPicker
                            const spaceBelow = viewportHeight - rect.bottom;
                            const openAbove = spaceBelow < estimatedHeight;

                            let top: number;
                            if (openAbove) {
                                top = rect.top - estimatedHeight - 8;
                                if (top < 8) top = 8; // clamp to top padding
                            } else {
                                top = rect.bottom + 8;
                            }

                            setPopoverPos({
                                top,
                                left: rect.left,
                                width: rect.width,
                            });
                        }
                        setPickerOpen((open) => !open);
                    }}
                    title="Click to pick a color"
                />
                <input
                    type="text"
                    className={`polaris-hex-input ${hexError ? 'error' : ''}`}
                    value={hexInput}
                    placeholder="#FFFFFF"
                    maxLength={7}
                    onChange={handleHexChange}
                />
            </div>
            {hexError && <span className="polaris-hex-error">{hexError}</span>}
            {pickerOpen && popoverPos && (
                <div
                    ref={popoverRef}
                    className="polaris-picker-popover"
                    style={{
                        position: 'fixed',
                        top: popoverPos.top,
                        left: popoverPos.left,
                        width: popoverPos.width,
                    }}
                >
                    <ColorPicker
                        onChange={handlePickerChange}
                        color={hsbColor}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * CSS styles for Polaris ColorSelector
 */
export const colorSelectorStyles = `
    .polaris-color-selector {
        margin-bottom: 16px;
        position: relative;
    }
    .polaris-color-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 6px;
        background: #f9fafb;
        border-radius: 12px;
        padding: 8px 12px;
    }
    .polaris-color-swatch {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        border: 2px solid #e5e7eb;
        cursor: pointer;
        flex-shrink: 0;
        transition: box-shadow 0.15s ease;
    }
    .polaris-color-swatch:hover {
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }
    .polaris-hex-input {
        flex: 1;
        padding: 14px 16px;
        border: 1px solid #e5e7eb;
        border-radius: 10px;
        font-size: 14px;
        font-family: 'SF Mono', Monaco, monospace;
        text-transform: uppercase;
        background: #ffffff;
        box-sizing: border-box;
    }
    .polaris-hex-input:focus {
        border-color: #6366f1;
        outline: none;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
    .polaris-hex-input.error {
        border-color: #ef4444;
        background: #fef2f2;
    }
    .polaris-hex-error {
        color: #ef4444;
        font-size: 11px;
        margin-top: 4px;
        display: block;
    }
    .polaris-picker-popover {
        margin-top: 8px;
        padding: 12px;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        z-index: 9999;
    }
    /* Ensure Polaris ColorPicker fills the popover width */
    .polaris-picker-popover .Polaris-ColorPicker {
        width: 100% !important;
    }
`;
