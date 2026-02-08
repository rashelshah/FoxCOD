/**
 * ColorSelector - Compact Color Selection Component
 * Simple: Color picker square + Hex input only
 * Used for all color inputs EXCEPT Button Color (which has the full preset palette)
 */

import { useState, useCallback } from "react";

interface ColorSelectorProps {
    label: string;
    value: string;
    onChange: (color: string) => void;
}

/**
 * Validate hex color format (#RGB or #RRGGBB)
 */
function isValidHex(hex: string): boolean {
    return /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex);
}

/**
 * Normalize shorthand hex (#RGB → #RRGGBB)
 */
function normalizeHex(hex: string): string {
    if (/^#[A-Fa-f0-9]{3}$/.test(hex)) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex.toLowerCase();
}

export function ColorSelector({ label, value, onChange }: ColorSelectorProps) {
    const [hexInput, setHexInput] = useState(value || '#000000');
    const [hexError, setHexError] = useState('');

    // Handle color picker change
    const handlePickerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const color = e.target.value;
        onChange(color);
        setHexInput(color.toUpperCase());
        setHexError('');
    }, [onChange]);

    // Handle hex input change
    const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        let val = e.target.value.toUpperCase();

        // Auto-add # if missing
        if (val && !val.startsWith('#')) {
            val = '#' + val;
        }

        setHexInput(val);

        if (isValidHex(val)) {
            const normalized = normalizeHex(val);
            onChange(normalized);
            setHexError('');
        } else if (val.length > 1) {
            setHexError('Invalid hex');
        } else {
            setHexError('');
        }
    }, [onChange]);

    return (
        <div className="compact-color-selector">
            <label className="input-label">{label}</label>
            <div className="compact-color-row">
                <input
                    type="color"
                    className="compact-color-picker"
                    value={value}
                    onChange={handlePickerChange}
                />
                <input
                    type="text"
                    className={`compact-hex-input ${hexError ? 'error' : ''}`}
                    value={hexInput}
                    placeholder="#FFFFFF"
                    maxLength={7}
                    onChange={handleHexChange}
                />
            </div>
            {hexError && <span className="compact-hex-error">{hexError}</span>}
        </div>
    );
}

/**
 * CSS styles for compact ColorSelector
 */
export const colorSelectorStyles = `
    .compact-color-selector {
        margin-bottom: 16px;
    }
    .compact-color-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 6px;
        background: #f9fafb;
        border-radius: 12px;
        padding: 8px 12px;
    }
    .compact-color-picker {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        border: none;
        cursor: pointer;
        padding: 0;
        background: none;
        flex-shrink: 0;
    }
    .compact-color-picker::-webkit-color-swatch-wrapper {
        padding: 0;
    }
    .compact-color-picker::-webkit-color-swatch {
        border-radius: 10px;
        border: none;
    }
    .compact-hex-input {
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
    .compact-hex-input:focus {
        border-color: #6366f1;
        outline: none;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }
    .compact-hex-input.error {
        border-color: #ef4444;
        background: #fef2f2;
    }
    .compact-hex-error {
        color: #ef4444;
        font-size: 11px;
        margin-top: 4px;
        display: block;
    }
`;
