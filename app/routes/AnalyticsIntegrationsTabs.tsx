import { Link } from "react-router";

/**
 * Shared nav bar between /app/analytics and /app/integrations — the two are
 * reached through one combined sidebar entry ("Analytics & Integrations"),
 * styled to match the tab bar pattern already used on the Settings page.
 */
export function AnalyticsIntegrationsTabs({ active }: { active: "analytics" | "integrations" }) {
    return (
        <>
            <style>{`
                .ai-tabs { display: flex; gap: 4px; margin-bottom: 24px; background: #ffffff; padding: 6px; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); }
                .ai-tab { flex: 1; padding: 10px 16px; border: none; background: transparent; border-radius: 6px; font-size: 13px; font-weight: 500; color: #4b5563; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease; text-decoration: none; }
                .ai-tab:hover { background: #f9fafb; color: #111827; }
                .ai-tab.active { background: #f3f4f6; color: #111827; box-shadow: none; font-weight: 600; }
            `}</style>
            <div className="ai-tabs">
                <Link to="/app/analytics" className={`ai-tab ${active === "analytics" ? "active" : ""}`}>Analytics</Link>
                <Link to="/app/integrations" className={`ai-tab ${active === "integrations" ? "active" : ""}`}>Integrations</Link>
            </div>
        </>
    );
}
