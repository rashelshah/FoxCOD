/**
 * Attach to onScroll of any `.preview-phone-screen` / `.pv-phone-screen`
 * live-preview container. Toggles a class (styled globally in app/root.tsx)
 * that reveals the scrollbar thumb only while actively scrolling, fading it
 * back out shortly after scrolling stops — instead of a persistently visible
 * scrollbar track (the default on Windows/Chrome).
 */
type ElWithScrollTimer = HTMLDivElement & { _scrollHideTimer?: number };

export function handlePreviewAutoHideScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget as ElWithScrollTimer;
    el.classList.add('is-scrolling');
    window.clearTimeout(el._scrollHideTimer);
    el._scrollHideTimer = window.setTimeout(() => {
        el.classList.remove('is-scrolling');
    }, 700);
}
