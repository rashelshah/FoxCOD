/**
 * Custom form logo preview — shown above the product image/title in any
 * admin live preview of the COD form (mirrors the storefront's
 * .cod-form-logo, see cod-form-core.liquid).
 *
 * Renders the logo inside a soft "badge" backdrop (padding + shadow) rather
 * than as a bare <img> — a raw image floating directly on the form
 * background reads as broken/unfinished, especially for square or
 * transparent-background logos.
 *
 * The badge is height-driven, not a forced square: most logos (wordmarks,
 * logo+text lockups) are wider than tall, so cramming them into a 1:1 box
 * either crops them or leaves them tiny with dead space on both sides.
 * Circle is the one shape where a square footprint is actually correct (it's
 * an avatar treatment), so it keeps the square window; Original/Rounded get
 * a wide rectangular window sized to the logo's own proportions instead.
 *
 * Size vs. Zoom stay independent: Size fixes the badge's own footprint (the
 * only thing that should push the rest of the form down when changed). Zoom
 * only scales the image *inside* that fixed-height window, so it never
 * changes the badge's footprint or shifts layout.
 */
import type { FormLogoSettings } from "../config/supabase.server";

export function FormLogoPreview({ logo }: { logo: FormLogoSettings | null | undefined }) {
    if (!logo?.enabled || !logo.logo_url) return null;

    const isCircle = logo.shape === 'circle';
    const imageRadius = isCircle ? '50%' : logo.shape === 'rounded' ? '10px' : '0px';
    const containerRadius = isCircle ? '50%' : '16px';
    const zoomScale = logo.zoom ? logo.zoom / 100 : 1;
    // Cap defensively — this is a compact popup form, not a page header, and
    // stale saved values from before this cap existed must never render huge.
    const height = Math.min(logo.size || 48, 88);
    const justify = logo.align === 'left' ? 'flex-start' : logo.align === 'right' ? 'flex-end' : 'center';
    const padding = logo.background ? Math.max(8, Math.min(14, Math.round(height * 0.14))) : 0;
    const windowWidth = isCircle ? height : Math.round(height * 2.6);
    const containerWidth = windowWidth + padding * 2;
    const containerHeight = height + padding * 2;

    return (
        <div style={{ display: 'flex', justifyContent: justify, marginBottom: 0 }}>
            <div style={{
                width: containerWidth,
                height: containerHeight,
                padding,
                boxSizing: 'border-box',
                borderRadius: containerRadius,
                background: logo.background ? logo.backgroundColor || '#f3f4f6' : 'transparent',
                boxShadow: logo.background ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
                border: logo.background ? '1px solid rgba(0,0,0,0.04)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {/* Fixed-size clipped window — this is the "logo container" the Zoom slider scales inside of */}
                <div style={{ width: windowWidth, height, overflow: 'hidden', borderRadius: imageRadius, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isCircle ? (
                        <img
                            src={logo.logo_url}
                            alt="Store logo"
                            style={{ display: 'block', width: height * zoomScale, height: height * zoomScale, flexShrink: 0, objectFit: 'cover' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <img
                            src={logo.logo_url}
                            alt="Store logo"
                            style={{ display: 'block', height: height * zoomScale, width: 'auto', maxWidth: 'none', objectFit: 'contain' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
