/**
 * Sliding announcement banner preview — cycles through `statements` one at a
 * time, mirroring the storefront's auto-rotate + manual chevron behavior
 * (see cod-form-core.liquid's .cod-announcement-banner) so what the merchant
 * sees in any admin live preview matches what shoppers see live.
 *
 * Shared across every admin page that renders the COD form's live preview
 * (Form Builder, Bundle Offers, Tick Upsell) so the banner shows up wherever
 * the form title does — same component, no drift between previews.
 */
import { useEffect, useState } from "react";
import type { AnnouncementBannerSettings } from "../config/supabase.server";

export function AnnouncementBannerPreview({ banner }: { banner: AnnouncementBannerSettings | null | undefined }) {
    const statements = (banner?.statements || []).filter(Boolean);
    const [index, setIndex] = useState(0);

    useEffect(() => {
        setIndex(0);
    }, [statements.join('|')]);

    useEffect(() => {
        if (statements.length <= 1) return;
        const timer = setInterval(() => setIndex((i) => (i + 1) % statements.length), 3500);
        return () => clearInterval(timer);
    }, [statements.length]);

    if (!banner?.enabled || statements.length === 0) return null;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 8, marginBottom: 12,
            backgroundColor: banner.backgroundColor || '#111827',
            color: banner.textColor || '#ffffff',
            fontSize: 11.5, fontWeight: 600, textAlign: 'center', overflow: 'hidden',
        }}>
            {statements.length > 1 && (
                <button type="button" onClick={() => setIndex((i) => (i - 1 + statements.length) % statements.length)}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, opacity: 0.8, flexShrink: 0, padding: 0 }}
                    aria-label="Previous">‹</button>
            )}
            <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '1.4em', overflow: 'hidden' }}>
                {statements.map((statement: string, i: number) => (
                    <span key={i} style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        opacity: i === index ? 1 : 0,
                        transform: i === index ? 'translateX(0)' : 'translateX(10px)',
                        transition: 'opacity 0.35s ease, transform 0.35s ease',
                    }}>
                        {statement}
                    </span>
                ))}
            </div>
            {statements.length > 1 && (
                <button type="button" onClick={() => setIndex((i) => (i + 1) % statements.length)}
                    style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1, opacity: 0.8, flexShrink: 0, padding: 0 }}
                    aria-label="Next">›</button>
            )}
        </div>
    );
}
