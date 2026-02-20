/**
 * Upsells & Downsells Page — Premium UI
 * Route: /app/upsell-downsell
 */
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getUpsellCampaigns, saveCampaign, deleteCampaign, toggleCampaignActive, syncUpsellsToMetafield } from "../services/upsell-offers.server";
import { type UpsellCampaign, type UpsellType, type CampaignOffer, type CampaignDesign, type ButtonDesign, createDefaultCampaign, createDefaultOffer, DEFAULT_CAMPAIGN_DESIGN } from "../config/upsell-offers.types";
import { ColorSelector, colorSelectorStyles } from "./ColorSelector";
import { RangeSlider } from "@shopify/polaris";
import { getFormSettings } from "../config/supabase.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const campaigns = await getUpsellCampaigns(shopDomain);
    // Fetch product details for offers
    const enriched = await Promise.all(campaigns.map(async (c: any) => {
        if (!c.offers || c.offers.length === 0) return c;
        const enrichedOffers = await Promise.all(c.offers.map(async (o: any) => {
            if (!o.upsell_product_id) return o;
            try {
                const pid = o.upsell_product_id.includes('gid://') ? o.upsell_product_id : `gid://shopify/Product/${o.upsell_product_id}`;
                const res = await admin.graphql(`query($id:ID!){product(id:$id){id title featuredImage{url} variants(first:10){edges{node{id title price compareAtPrice image{url}}}}}}`, { variables: { id: pid } });
                const r = await res.json();
                if (r.data?.product) return { ...o, _selectedProduct: r.data.product };
            } catch (e) { /* skip */ }
            return o;
        }));
        return { ...c, offers: enrichedOffers };
    }));
    const formSettings = await getFormSettings(shopDomain);
    return { shopDomain, campaigns: enriched, formSettings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const formData = await request.formData();
    const act = formData.get("action") as string;
    try {
        if (act === "save") {
            const data = JSON.parse(formData.get("campaignData") as string);
            const result = await saveCampaign(data, shopDomain);
            await syncUpsellsToMetafield(admin, shopDomain);
            return { success: true, savedId: result.id };
        }
        if (act === "delete") {
            await deleteCampaign(formData.get("campaignId") as string, shopDomain);
            await syncUpsellsToMetafield(admin, shopDomain);
            return { success: true };
        }
        if (act === "toggle") {
            await toggleCampaignActive(formData.get("campaignId") as string, formData.get("active") === "true", shopDomain);
            await syncUpsellsToMetafield(admin, shopDomain);
            return { success: true };
        }
    } catch (e: any) { return { success: false, error: e.message }; }
    return { success: false };
};

const S = `
${colorSelectorStyles}
/* ==================== PAGE LAYOUT ==================== */
.up-page{max-width:1200px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
.up-header{display:flex;align-items:center;gap:12px;margin-bottom:28px}
.up-header h1{font-size:22px;font-weight:700;color:#111827;margin:0;flex:1}
.btn-back{width:40px;height:40px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:#374151;transition:all .15s ease}
.btn-back:hover{background:#f3f4f6;border-color:#d1d5db}
.toggle-pill{display:flex;align-items:center;gap:8px}
.toggle-track{width:44px;height:24px;border-radius:12px;background:var(--p-color-bg-surface-secondary-active, #dfe3e8);cursor:pointer;position:relative;transition:.2s cubic-bezier(.25,.1,.25,1)}
.toggle-track.on{background:var(--p-color-bg-fill-inverse, #1a1a1a)}
.toggle-thumb{width:20px;height:20px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:.2s cubic-bezier(.25,.1,.25,1);box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06)}
.toggle-track.on .toggle-thumb{left:22px}
.active-badge{padding:3px 12px;border-radius:12px;font-size:12px;font-weight:600}
/* ==================== PILL TABS ==================== */
.up-tabs{display:flex;gap:4px;margin-bottom:28px;background:#f3f4f6;border-radius:12px;padding:4px}
.up-tab{padding:10px 22px;cursor:pointer;font-size:13px;font-weight:600;color:#6b7280;border:none;border-radius:10px;background:none;transition:all .2s ease}
.up-tab:hover{color:#374151;background:rgba(0,0,0,.03)}
.up-tab.active{background:#1f2937;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.up-tab .cnt{background:rgba(0,0,0,.08);color:#6b7280;padding:1px 8px;border-radius:10px;font-size:11px;margin-left:6px}
.up-tab.active .cnt{background:rgba(255,255,255,.2);color:#fff}
/* ==================== LIST CARDS ==================== */
.up-list{display:flex;flex-direction:column;gap:10px}
.up-card{background:#fff;border:1px solid #e5e7eb;border-left:3px solid transparent;border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:16px;cursor:pointer;transition:all .2s ease}
.up-card:hover{border-left-color:#1f2937;box-shadow:0 4px 16px rgba(0,0,0,.06)}
.up-card-img{width:52px;height:52px;border-radius:10px;background:#f3f4f6;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;overflow:hidden}
.up-card-img img{width:100%;height:100%;object-fit:cover}
.up-card-info{flex:1;min-width:0}
.up-card-name{font-weight:600;font-size:15px;color:#111827;margin-bottom:4px}
.up-card-meta{font-size:13px;color:#6b7280;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.up-card-badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#dcfce7;color:#166534}
.up-card-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}
/* Icon Buttons */
.up-icon-btn{width:32px;height:32px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s ease}
.up-icon-btn.delete{background:rgba(239,68,68,.08);color:#ef4444}
.up-icon-btn.delete:hover{background:rgba(239,68,68,.15)}
.up-edit-cta{font-size:12px;font-weight:700;color:#1f2937;cursor:pointer;white-space:nowrap}
/* Empty State */
.up-empty{text-align:center;padding:60px 20px;background:#fafafa;border-radius:16px;border:2px dashed #e5e7eb}
.up-empty h3{font-size:18px;color:#374151;margin:0 0 8px}
.up-empty p{color:#6b7280;margin:0 0 20px;font-size:14px}
/* CTA Buttons (black) */
.btn-create{background:#1f2937;color:#fff;border:none;border-radius:10px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s ease}
.btn-create:hover{background:#111827;box-shadow:0 2px 8px rgba(0,0,0,.15)}
/* ==================== EDITOR LAYOUT ==================== */
.up-editor{display:grid;grid-template-columns:1fr 380px;gap:24px}
@media(max-width:900px){.up-editor{grid-template-columns:1fr}}
/* Settings Card (Form Builder style) */
.sec{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:16px}
.sec h3{font-size:15px;font-weight:700;color:#111827;margin:0 0 20px;display:flex;align-items:center;gap:8px}
.sec h3 .icon{font-size:18px}
/* Input Group (Form Builder style) */
.fg{margin-bottom:16px}
.fg label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
.fg input,.fg select,.fg textarea{width:100%;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;font-size:14px;color:#111827;box-sizing:border-box;background:#f9fafb;transition:all .15s ease}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:#1f2937;background:#fff;outline:none;box-shadow:0 0 0 3px rgba(31,41,55,.06)}
.fg textarea{min-height:50px;resize:vertical}
/* Grid Layout */
.fr{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fr3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
/* Mode Toggle (Style Options pattern) */
.mode-toggle{display:flex;gap:8px;margin-bottom:12px}
.mode-btn{flex:1;padding:10px 16px;text-align:center;cursor:pointer;font-size:13px;font-weight:600;background:#fff;border:1px solid #e5e7eb;border-radius:10px;color:#6b7280;transition:all .2s ease}
.mode-btn:hover{border-color:#9ca3af;color:#374151}
.mode-btn.active{background:#1f2937;color:#fff;border-color:#1f2937}
/* Pick Button (black) */
.btn-pick{background:#1f2937;color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px;font-weight:600;transition:all .15s ease}
.btn-pick:hover{background:#111827}
/* Product Row */
.prod-row{display:flex;align-items:center;gap:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-top:8px}
.prod-row img{width:40px;height:40px;border-radius:8px;object-fit:cover}
.prod-row-info{flex:1;min-width:0}
.prod-row-info .name{font-weight:600;font-size:13px;color:#1f2937}
.prod-row-info .vid{font-size:11px;color:#9ca3af}
.prod-x{background:none;border:none;cursor:pointer;font-size:16px;color:#9ca3af}
.prod-x:hover{color:#ef4444}
/* Offer Card */
.offer-card{border:1px solid #e5e7eb;border-radius:12px;margin-bottom:12px;overflow:hidden}
.offer-header{display:flex;align-items:center;gap:8px;padding:12px 16px;background:#f9fafb;cursor:pointer;border-bottom:1px solid #e5e7eb}
.offer-header .drag{cursor:grab;color:#9ca3af;font-size:14px}
.offer-header .title{flex:1;font-weight:600;font-size:14px;color:#1f2937}
.offer-header .chevron{font-size:12px;color:#9ca3af;transition:.2s}
.offer-header .chevron.open{transform:rotate(180deg)}
.offer-header .del-offer{background:none;border:none;cursor:pointer;font-size:16px;color:#9ca3af}
.offer-header .del-offer:hover{color:#ef4444}
.offer-body{padding:16px}
.offer-body.collapsed{display:none}
/* Toggle Option (Form Builder style) */
.up-toggle-row{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f9fafb;border-radius:10px;cursor:pointer;margin-bottom:8px}
.up-toggle-row span{font-size:14px;font-weight:500;color:#374151}
.up-mini-toggle{width:44px;height:24px;border-radius:12px;position:relative;transition:background .2s cubic-bezier(.25,.1,.25,1);flex-shrink:0;cursor:pointer}
.up-mini-toggle::after{content:'';position:absolute;width:20px;height:20px;background:#fff;border-radius:50%;top:2px;transition:left .2s cubic-bezier(.25,.1,.25,1);box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06)}
.up-mini-toggle.on{background:var(--p-color-bg-fill-inverse, #1a1a1a)}
.up-mini-toggle.on::after{left:22px}
.up-mini-toggle.off{background:var(--p-color-bg-surface-secondary-active, #dfe3e8)}
.up-mini-toggle.off::after{left:2px}
/* Checkbox row (for offer options) */
.cb-row{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;margin-bottom:8px}
.cb-row input{width:18px;height:18px;accent-color:#1f2937}
/* Styled Slider (Form Builder exact match) */
.up-slider-wrap{display:flex;align-items:center;gap:12px}
.up-slider-wrap input[type="range"]{flex:1;-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer;margin:0}
.up-slider-wrap input[type="range"]::-webkit-slider-runnable-track{width:100%;height:4px;border-radius:2px;border:none}
.up-slider-wrap input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#6366f1;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.15),0 0 0 1px rgba(99,102,241,0.2);margin-top:-6px;transition:transform 0.1s ease,box-shadow 0.1s ease}
.up-slider-wrap input[type="range"]::-webkit-slider-thumb:hover{transform:scale(1.1)}
.up-slider-wrap input[type="range"]:focus::-webkit-slider-thumb{box-shadow:0 0 0 4px rgba(99,102,241,0.2)}
.up-slider-val{font-size:13px;color:#4b5563;min-width:24px;text-align:right}
/* Add Offer */
.btn-add-offer{background:#fff;border:2px dashed #d1d5db;border-radius:12px;padding:12px;width:100%;cursor:pointer;font-size:14px;font-weight:600;color:#6b7280;text-align:center;transition:all .15s ease}
.btn-add-offer:hover{border-color:#1f2937;color:#1f2937}
/* Info Banner */
.info-banner{background:#f0f4ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 16px;font-size:13px;color:#4338ca;display:flex;align-items:center;gap:8px;margin-bottom:16px}
.info-banner .close-banner{background:none;border:none;cursor:pointer;font-size:16px;color:#6366f1;margin-left:auto}
/* ==================== LIVE PREVIEW ==================== */
.pv-wrap{position:sticky;top:20px}
.pv-panel{background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.1)}
.pv-panel-header{background:#f9fafb;padding:14px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between}
.pv-panel-header h3{margin:0;font-size:14px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px}
.pv-panel-header .pv-badge{font-size:11px;color:#6b7280;background:#f3f4f6;padding:4px 10px;border-radius:6px;font-weight:500}
.pv-phone{background:#1f2937;border-radius:32px;padding:6px;max-width:300px;margin:16px auto}
.pv-phone-screen{background:#fff;border-radius:24px;overflow-y:auto;height:560px}
/* Accept button animations */
@keyframes up-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes up-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes up-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
.pv-anim-pulse{animation:up-pulse 1.5s ease-in-out infinite}
.pv-anim-bounce{animation:up-bounce 1s ease-in-out infinite}
.pv-anim-shake{animation:up-shake .5s ease-in-out infinite}
.pv-modal{background:#fff}
.pv-header{text-align:center;padding:20px 20px 8px}
.pv-header h2{margin:0 0 4px;font-weight:700}
.pv-header p{margin:0;color:#6b7280;font-size:14px}
.pv-timer{text-align:center;padding:10px 20px;margin:8px 20px;border-radius:8px;font-weight:600;white-space:pre-line}
.pv-img-wrap{text-align:center;padding:0 20px;margin:12px 0}
.pv-img-wrap img{max-width:200px;max-height:200px;object-fit:contain}
.pv-product-title{text-align:center;padding:8px 20px 4px;font-size:14px}
.pv-discount{text-align:center;margin:8px 0}
.pv-discount span{display:inline-block;padding:4px 16px;border-radius:20px;font-size:13px;font-weight:700;color:#fff}
.pv-prices{text-align:center;padding:4px 0 16px}
.pv-prices s{color:#9ca3af;font-size:14px;margin-right:8px}
.pv-prices strong{font-size:18px;color:#1f2937}
.pv-accept{display:block;width:calc(100% - 40px);margin:0 20px 8px;padding:14px;border:none;font-size:16px;font-weight:700;cursor:pointer}
.pv-reject{display:block;width:calc(100% - 40px);margin:0 20px 16px;padding:12px;font-size:14px;cursor:pointer}
/* Section Label */
.up-section-label{font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #f3f4f6}
/* ==================== TICK UPSELL STYLES ==================== */
.tick-pv-product{padding:16px}
.tick-pv-product-img{width:100%;height:100px;background:linear-gradient(135deg,#e5e7eb 0%,#d1d5db 100%);border-radius:12px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;font-size:32px}
.tick-pv-product-title{font-size:14px;font-weight:600;color:#111827;margin-bottom:4px}
.tick-pv-product-price{font-size:16px;font-weight:700;color:#1f2937;margin-bottom:8px}
.tick-pv-modal{padding:16px;margin-top:12px;border-radius:12px;background:#f9fafb}
.tick-pv-modal-title{font-weight:600;margin-bottom:12px;color:#111;font-size:14px}
.tick-pv-input{width:100%;padding:10px 12px;margin-bottom:8px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;box-sizing:border-box;background:#fff;color:#9ca3af}
.tick-pv-label{display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:4px}
.tick-pv-summary{background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border-radius:10px;padding:12px;margin:12px 0;border:1px solid #e2e8f0}
.tick-pv-row{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-radius:10px;cursor:pointer;transition:all .15s ease;margin:12px 0}
.tick-pv-row:hover{opacity:.85}
.tick-pv-cb{width:18px;height:18px;border-radius:4px;border:2px solid;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center}
.tick-pv-text{flex:1;font-size:13px;font-weight:600;line-height:1.4}
.tick-pv-submit{width:100%;padding:12px;border:none;color:#fff;border-radius:8px;font-weight:600;font-size:13px;margin-top:4px;background:#1f2937;cursor:pointer}
@keyframes tick-marching-ants{to{stroke-dashoffset:-20}}
`;

export default function UpsellDownsellPage() {
    const { shopDomain, campaigns: initialCampaigns, formSettings } = useLoaderData<typeof loader>();
    const actionData = useActionData<typeof action>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const isSaving = navigation.state === "submitting";

    const [activeTab, setActiveTab] = useState<UpsellType>('click_upsell');
    const tickPreviewRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState<UpsellCampaign | null>(null);
    const [savedStr, setSavedStr] = useState<string | null>(null);
    const lastActionRef = useRef<any>(null);
    const pendingSaveRef = useRef<string | null>(null);

    const filtered = useMemo(() => (initialCampaigns || []).filter((c: any) => c.type === activeTab), [initialCampaigns, activeTab]);

    const hasChanges = useMemo(() => {
        if (!editing) return false;
        if (!savedStr) return true;
        const { _triggerProducts, ...comp } = editing;
        return JSON.stringify(comp) !== savedStr;
    }, [editing, savedStr]);

    useEffect(() => {
        try { hasChanges && editing ? shopify.saveBar.show('upsell-bar') : shopify.saveBar.hide('upsell-bar'); } catch { }
    }, [hasChanges, editing, shopify]);

    useEffect(() => {
        if (actionData?.success && actionData !== lastActionRef.current) {
            lastActionRef.current = actionData;
            if (pendingSaveRef.current) { setSavedStr(pendingSaveRef.current); pendingSaveRef.current = null; }
            if ((actionData as any).savedId && editing && !editing.id) setEditing(p => p ? { ...p, id: (actionData as any).savedId } : p);
            shopify.toast.show('Saved!', { duration: 3000 });
        }
    }, [actionData]);

    // Auto-scroll tick upsell preview to bottom so seller can see the checkbox
    useEffect(() => {
        if (editing?.type === 'tick_upsell' && tickPreviewRef.current) {
            setTimeout(() => {
                tickPreviewRef.current?.scrollTo({ top: tickPreviewRef.current.scrollHeight, behavior: 'smooth' });
            }, 100);
        }
    }, [editing?.type]);

    useEffect(() => {
        if (actionData && (actionData as any).success === false && (actionData as any).error) try { shopify.toast.show(`Error: ${(actionData as any).error}`, { duration: 5000 }); } catch { }
    }, [actionData, shopify]);

    const handleCreate = () => { const c = createDefaultCampaign(activeTab) as UpsellCampaign; setEditing(c); setSavedStr(null); };
    const handleEdit = (c: UpsellCampaign) => { setEditing({ ...c }); const { _triggerProducts, ...comp } = c; setSavedStr(JSON.stringify(comp)); };

    const handleSave = () => {
        if (!editing) return;
        const { _triggerProducts, ...data } = editing;
        const fd = new FormData(); fd.append("action", "save"); fd.append("campaignData", JSON.stringify(data));
        pendingSaveRef.current = JSON.stringify(data);
        submit(fd, { method: "post" });
    };

    const handleDiscard = () => { if (savedStr) setEditing(JSON.parse(savedStr)); };
    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); if (!confirm('Delete this campaign?')) return;
        const fd = new FormData(); fd.append("action", "delete"); fd.append("campaignId", id);
        submit(fd, { method: "post" });
        if (editing?.id === id) { setEditing(null); setSavedStr(null); }
    };
    const handleToggle = (id: string, active: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
        const fd = new FormData(); fd.append("action", "toggle"); fd.append("campaignId", id); fd.append("active", String(active));
        submit(fd, { method: "post" });
    };

    const upd = useCallback((u: Partial<UpsellCampaign>) => setEditing(p => p ? { ...p, ...u } : p), []);
    const updDesign = useCallback((u: Partial<CampaignDesign>) => setEditing(p => p ? { ...p, design: { ...p.design, ...u } } : p), []);
    const updAccept = useCallback((u: Partial<ButtonDesign>) => setEditing(p => p ? { ...p, design: { ...p.design, acceptButton: { ...p.design.acceptButton, ...u } } } : p), []);
    const updReject = useCallback((u: Partial<ButtonDesign>) => setEditing(p => p ? { ...p, design: { ...p.design, rejectButton: { ...p.design.rejectButton, ...u } } } : p), []);

    const updOffer = useCallback((offerId: string, u: Partial<CampaignOffer>) => {
        setEditing(p => {
            if (!p) return p;
            return { ...p, offers: p.offers.map(o => o.id === offerId ? { ...o, ...u } : o) };
        });
    }, []);

    const addOffer = () => {
        if (!editing || editing.offers.length >= 5) return;
        upd({ offers: [...editing.offers, createDefaultOffer(editing.offers.length + 1)] });
    };

    const delOffer = (offerId: string) => {
        if (!editing || editing.offers.length <= 1) return;
        upd({ offers: editing.offers.filter(o => o.id !== offerId) });
    };

    const pickProduct = async (offerId: string) => {
        const offer = editing?.offers.find(o => o.id === offerId);
        try {
            const sel = await shopify.resourcePicker({ type: 'product', multiple: false, selectionIds: offer?.upsell_product_id ? [{ id: offer.upsell_product_id.includes('gid://') ? offer.upsell_product_id : `gid://shopify/Product/${offer.upsell_product_id}` }] : [] });
            if (sel && sel.length > 0) {
                const p = sel[0] as any; const v = p.variants?.[0];
                const price = parseFloat(v?.price || '0');
                const img = p.images?.[0]?.originalSrc || p.images?.[0]?.url || p.featuredImage?.url || '';
                updOffer(offerId, { upsell_product_id: p.id.replace('gid://shopify/Product/', ''), upsell_variant_id: v?.id?.replace('gid://shopify/ProductVariant/', '') || '', upsell_product_title: p.title, upsell_product_image: img, original_price: price, offer_price: price, _selectedProduct: p });
            }
        } catch { }
    };

    const pickTrigger = async () => {
        try {
            const sel = await shopify.resourcePicker({ type: 'product', multiple: true, selectionIds: (editing?.trigger_product_ids || []).map(id => ({ id: id.includes('gid://') ? id : `gid://shopify/Product/${id}` })) });
            if (sel) { upd({ trigger_product_ids: sel.map((p: any) => p.id.replace('gid://shopify/Product/', '')), _triggerProducts: sel }); }
        } catch { }
    };

    // Compute offer prices
    const getOfferPrice = (o: CampaignOffer) => {
        if (o.discount_type === 'percentage') return Math.round((o.original_price - o.original_price * o.discount_value / 100) * 100) / 100;
        return Math.max(0, o.original_price - o.discount_value);
    };

    const expandedOfferIdx = editing?.offers?.findIndex(o => o.expanded) ?? 0;
    const activeOffer = editing?.offers?.[expandedOfferIdx >= 0 ? expandedOfferIdx : 0];
    const activeOfferPrice = activeOffer ? getOfferPrice(activeOffer) : 0;

    const tabLabels: Record<UpsellType, string> = { tick_upsell: '1-Tick Upsell', click_upsell: '1-Click Upsell', downsell: 'Downsell' };
    const tabCounts = useMemo(() => ({ tick_upsell: (initialCampaigns || []).filter((c: any) => c.type === 'tick_upsell').length, click_upsell: (initialCampaigns || []).filter((c: any) => c.type === 'click_upsell').length, downsell: (initialCampaigns || []).filter((c: any) => c.type === 'downsell').length }), [initialCampaigns]);
    const availableDownsells = useMemo(() => (initialCampaigns || []).filter((c: any) => c.type === 'downsell'), [initialCampaigns]);

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: S }} />
            <ui-save-bar id="upsell-bar">
                <button variant="primary" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</button>
                <button onClick={handleDiscard} disabled={isSaving}>Discard</button>
            </ui-save-bar>
            <div className="up-page">
                <div className="up-header">
                    {editing && <button className="btn-back" onClick={() => { setEditing(null); setSavedStr(null); }}>←</button>}
                    <h1>{editing ? (editing.campaign_name || 'New Upsell') : 'Upsells & Downsells'}</h1>
                    {editing && (
                        <div className="toggle-pill">
                            <div className={`toggle-track ${editing.active ? 'on' : ''}`} onClick={() => upd({ active: !editing.active })}>
                                <div className="toggle-thumb" />
                            </div>
                            <span className="active-badge" style={{ background: editing.active ? '#dcfce7' : '#fee2e2', color: editing.active ? '#166534' : '#991b1b' }}>
                                {editing.active ? 'Active' : 'Inactive'}
                            </span>
                        </div>
                    )}
                </div>

                {!editing ? (
                    <>
                        <div className="up-tabs">
                            {(['tick_upsell', 'click_upsell', 'downsell'] as UpsellType[]).map(t => (
                                <button key={t} className={`up-tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                                    {tabLabels[t]}<span className="cnt">{tabCounts[t]}</span>
                                </button>
                            ))}
                        </div>
                        {filtered.length === 0 ? (
                            <div className="up-empty">
                                <h3>No {tabLabels[activeTab]} campaigns yet</h3>
                                <p>Create your first campaign to boost your average order value.</p>
                                <button className="btn-create" onClick={handleCreate}>+ Create {tabLabels[activeTab]}</button>
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: 16, textAlign: 'right' }}><button className="btn-create" onClick={handleCreate}>+ Create {tabLabels[activeTab]}</button></div>
                                <div className="up-list">
                                    {filtered.map((c: any) => {
                                        const firstOffer = c.offers?.[0];
                                        return (
                                            <div key={c.id} className="up-card" onClick={() => handleEdit(c)}>
                                                <div className="up-card-img">{firstOffer?.upsell_product_image ? <img src={firstOffer.upsell_product_image} alt="" /> : '🎁'}</div>
                                                <div className="up-card-info">
                                                    <div className="up-card-name">{c.campaign_name || 'Untitled'}</div>
                                                    <div className="up-card-meta">
                                                        <span>{c.offers?.length || 0} offer{c.offers?.length !== 1 ? 's' : ''}</span>
                                                        {firstOffer?.discount_value > 0 && <span className="up-card-badge">{firstOffer.discount_type === 'percentage' ? `${firstOffer.discount_value}%` : `₹${firstOffer.discount_value}`} OFF</span>}
                                                    </div>
                                                </div>
                                                <div className="up-card-actions">
                                                    <div onClick={e => e.stopPropagation()}>
                                                        <div className={`toggle-track ${c.active ? 'on' : ''}`} onClick={e => handleToggle(c.id, !c.active, e)}><div className="toggle-thumb" /></div>
                                                    </div>
                                                    <button className="up-icon-btn delete" onClick={e => handleDelete(c.id, e)} title="Delete">🗑</button>
                                                    <span className="up-edit-cta">Edit →</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <div className="up-editor">
                        {editing.type === 'tick_upsell' ? (
                            /* ==================== TICK UPSELL EDITOR ==================== */
                            <>
                                <div>
                                    {/* Name */}
                                    <div className="sec">
                                        <div className="fg"><label>Name</label><input value={editing.campaign_name} placeholder="New 1-Tick Upsell" onChange={e => upd({ campaign_name: e.target.value })} /></div>
                                    </div>

                                    {/* Where to show */}
                                    <div className="sec">
                                        <h3><span className="icon">🛒</span> Where you want to show this upsell?</h3>
                                        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>This upsell will show up on the products you choose below, you can show it on all products or specific</div>
                                        <div className="mode-toggle">
                                            <button className={`mode-btn ${editing.show_condition_type === 'always' ? 'active' : ''}`} onClick={() => upd({ show_condition_type: 'always' as any })}>All products</button>
                                            <button className={`mode-btn ${editing.show_condition_type === 'specific_products' ? 'active' : ''}`} onClick={() => upd({ show_condition_type: 'specific_products' as any })}>Specific products</button>
                                        </div>
                                        {editing.show_condition_type === 'specific_products' && (
                                            <>
                                                <button className="btn-pick" onClick={pickTrigger}>Select products ({editing.trigger_product_ids?.length || 0} selected)</button>
                                                {editing._triggerProducts?.map((p: any) => (
                                                    <div key={p.id} className="prod-row">
                                                        {p.images?.[0] && <img src={p.images[0].originalSrc || p.images[0].url} alt="" />}
                                                        <div className="prod-row-info"><div className="name">{p.title}</div><div className="vid">{p.id.replace('gid://shopify/Product/', '')}</div></div>
                                                        <button className="prod-x" onClick={() => upd({ trigger_product_ids: editing.trigger_product_ids.filter(id => id !== p.id.replace('gid://shopify/Product/', '')), _triggerProducts: editing._triggerProducts?.filter((tp: any) => tp.id !== p.id) })}>×</button>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                    </div>

                                    {/* Configure 1-Tick Offer */}
                                    <div className="sec">
                                        <h3><span className="icon">⚡</span> Configure 1-Tick Offer</h3>
                                        {editing.offers[0] && (() => {
                                            const offer = editing.offers[0];
                                            return (
                                                <>
                                                    <div className="fr">
                                                        <div className="fg"><label>Offer title</label><input value={offer.upsell_product_title || ''} placeholder="Shipping protection" onChange={e => updOffer(offer.id, { upsell_product_title: e.target.value })} /></div>
                                                        <div className="fg"><label>Offer price</label><input value={offer.original_price || ''} placeholder="USD 0.99" type="number" min="0" step="0.01" onChange={e => updOffer(offer.id, { original_price: parseFloat(e.target.value) || 0 })} /></div>
                                                    </div>
                                                    <div className="fg"><label>Select upsell product (optional)</label></div>
                                                    {offer.upsell_product_id ? (
                                                        <div className="prod-row">
                                                            {offer.upsell_product_image && <img src={offer.upsell_product_image} alt="" />}
                                                            <div className="prod-row-info"><div className="name">{offer.upsell_product_title}</div><div className="vid">{offer.upsell_product_id}</div></div>
                                                            <button className="btn-pick" onClick={() => pickProduct(offer.id)}>Change</button>
                                                        </div>
                                                    ) : (
                                                        <button className="btn-pick" onClick={() => pickProduct(offer.id)}>Link to a product</button>
                                                    )}
                                                    <div className="fg" style={{ marginTop: 14 }}>
                                                        <label>Offer text</label>
                                                        <textarea value={editing.design.headerText || ''} placeholder={`🔥 Add {{title}} for only {{price}}`} onChange={e => updDesign({ headerText: e.target.value })} style={{ minHeight: 60 }} />
                                                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>You can use {'{{title}}'} and {'{{price}}'} to dynamically replace the values</div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    {/* Settings */}
                                    <div className="sec">
                                        <h3><span className="icon">⚙️</span> Settings</h3>
                                        <div className="up-toggle-row" onClick={() => upd({ checkbox_default_checked: !editing.checkbox_default_checked })}>
                                            <span>Ticked by default</span>
                                            <div className={`up-mini-toggle ${editing.checkbox_default_checked ? 'on' : 'off'}`} />
                                        </div>
                                    </div>

                                    {/* Style */}
                                    <div className="sec">
                                        <h3><span className="icon">🎨</span> Style</h3>
                                        <div className="fr">
                                            <ColorSelector label="Tick Color" value={editing.design.acceptButton.bgColor} onChange={c => updAccept({ bgColor: c })} />
                                            <ColorSelector label="Background color" value={editing.design.bgColor} onChange={c => updDesign({ bgColor: c })} />
                                        </div>
                                        <div className="fr" style={{ marginTop: 12 }}>
                                            <ColorSelector label="Text Color" value={editing.design.headerTextColor} onChange={c => updDesign({ headerTextColor: c })} />
                                            <ColorSelector label="Border color" value={editing.design.acceptButton.borderColor} onChange={c => updAccept({ borderColor: c })} />
                                        </div>
                                        <div className="fg" style={{ marginTop: 12 }}>
                                            <label>Border Width (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Border Width"
                                                    min={0}
                                                    max={4}
                                                    value={editing.design.acceptButton.borderWidth}
                                                    onChange={val => updAccept({ borderWidth: Number(val) })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="fg">
                                            <label>Border style</label>
                                            <select value={editing.design.acceptButton.borderStyle || 'dashed'} onChange={e => updAccept({ borderStyle: e.target.value })}>
                                                <option value="none">None</option>
                                                <option value="solid">Solid</option>
                                                <option value="dashed">Dashed</option>
                                                <option value="dashed_animation">Dashed (Animation)</option>
                                            </select>
                                        </div>
                                        <div className="fg">
                                            <label>Rounded Corners (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Rounded Corners"
                                                    min={0}
                                                    max={20}
                                                    value={editing.design.acceptButton.borderRadius}
                                                    onChange={val => updAccept({ borderRadius: Number(val) })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="fg">
                                            <label>Text Size (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Text Size"
                                                    min={10}
                                                    max={20}
                                                    value={editing.design.headerTextSize}
                                                    onChange={val => updDesign({ headerTextSize: Number(val) })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tick Upsell Live Preview */}
                                <div>
                                    <div className="pv-wrap">
                                        <div className="pv-panel">
                                            <div className="pv-panel-header">
                                                <h3>📱 Live Preview</h3>
                                            </div>
                                            <div className="pv-phone">
                                                <div className="pv-phone-screen" ref={tickPreviewRef}>

                                                    {/* Product Section + Form Modal - same structure as Form Builder */}
                                                    <div className="tick-pv-product">
                                                        <div className="tick-pv-product-img">📦</div>
                                                        <div className="tick-pv-product-title">Sample Product</div>
                                                        <div className="tick-pv-product-price">₹1,999</div>

                                                        {/* COD Form Modal - uses real Form Builder settings + modal style */}
                                                        <div style={(() => {
                                                            const ms = formSettings?.modal_style || 'modern';
                                                            const fs: any = formSettings?.styles || {};
                                                            const bg = fs.backgroundColor || '#ffffff';
                                                            const br = (fs.borderRadius || 12) + 'px';
                                                            const base: any = {
                                                                background: bg,
                                                                borderRadius: br,
                                                                padding: '16px',
                                                                marginTop: '12px',
                                                                transition: 'all 0.3s ease',
                                                            };
                                                            if (ms === 'glassmorphism') {
                                                                base.backdropFilter = 'blur(10px)';
                                                                base.WebkitBackdropFilter = 'blur(10px)';
                                                                base.border = '1px solid rgba(255,255,255,0.3)';
                                                                base.boxShadow = '0 8px 32px rgba(0,0,0,0.1)';
                                                            } else if (ms === 'minimal') {
                                                                base.border = '1px solid #e5e7eb';
                                                                base.boxShadow = 'none';
                                                            } else {
                                                                // modern
                                                                base.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
                                                                const bw = fs.borderWidth ?? 0;
                                                                if (bw > 0) {
                                                                    base.border = `${bw}px solid ${fs.borderColor || '#e5e7eb'}`;
                                                                } else {
                                                                    base.border = '1px solid rgba(0,0,0,0.06)';
                                                                }
                                                            }
                                                            return base;
                                                        })()}>
                                                            {/* Form Title */}
                                                            <div style={{
                                                                fontWeight: 600,
                                                                fontSize: (formSettings?.styles?.textSize || 16) + 'px',
                                                                marginBottom: '4px',
                                                                color: (formSettings?.styles as any)?.textColor || '#111',
                                                                textAlign: (formSettings?.styles?.labelAlignment || 'left') as any,
                                                            }}>
                                                                {formSettings?.form_title || 'Cash on Delivery Order'}
                                                            </div>

                                                            {/* Form Subtitle */}
                                                            {formSettings?.form_subtitle && (
                                                                <div style={{
                                                                    fontSize: (formSettings?.styles?.textSize || 14) - 2 + 'px',
                                                                    color: '#6b7280',
                                                                    marginBottom: '16px',
                                                                    textAlign: (formSettings?.styles?.labelAlignment || 'left') as any,
                                                                }}>
                                                                    {formSettings.form_subtitle}
                                                                </div>
                                                            )}

                                                            {/* Dynamic Form Fields - from Form Builder */}
                                                            {(formSettings?.fields || [])
                                                                .filter((f: any) => f.visible)
                                                                .sort((a: any, b: any) => a.order - b.order)
                                                                .map((field: any) => {
                                                                    const styles = formSettings?.styles || {} as any;
                                                                    const labelColor = styles.labelColor || styles.textColor || '#374151';
                                                                    const textColor = styles.textColor || '#111827';
                                                                    const textSize = styles.textSize ?? 14;
                                                                    const fontStyle = styles.fontStyle || 'normal';
                                                                    const borderRadius = styles.borderRadius ?? 8;
                                                                    const borderColor = styles.borderColor || '#e5e7eb';
                                                                    const borderWidth = styles.borderWidth ?? 1;
                                                                    const fieldBg = styles.fieldBackgroundColor || '#ffffff';
                                                                    const iconColor = styles.iconColor || '#6b7280';

                                                                    const fieldIcons: Record<string, React.ReactNode> = {
                                                                        phone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
                                                                        name: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
                                                                        email: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
                                                                        address: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
                                                                        notes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
                                                                        state: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
                                                                        city: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
                                                                        zip: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>,
                                                                        quantity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></svg>,
                                                                    };
                                                                    const icon = fieldIcons[field.id] || fieldIcons.name;
                                                                    const isTextarea = field.type === 'textarea';

                                                                    return (
                                                                        <div key={field.id} style={{ marginBottom: '10px' }}>
                                                                            <label style={{
                                                                                display: 'block',
                                                                                fontSize: (styles.labelFontSize ?? textSize) + 'px',
                                                                                fontWeight: fontStyle === 'bold' ? 700 : 600,
                                                                                color: labelColor,
                                                                                marginBottom: '4px',
                                                                                textAlign: (styles.labelAlignment || 'left') as any,
                                                                            }}>
                                                                                {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                                                                            </label>
                                                                            <div style={{ position: 'relative' }}>
                                                                                <span style={{
                                                                                    position: 'absolute',
                                                                                    left: '10px',
                                                                                    top: isTextarea ? '10px' : '50%',
                                                                                    transform: isTextarea ? 'none' : 'translateY(-50%)',
                                                                                    pointerEvents: 'none',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                }}>{icon}</span>
                                                                                {isTextarea ? (
                                                                                    <textarea
                                                                                        disabled
                                                                                        placeholder={field.id === 'address' ? (formSettings?.address_placeholder || 'Enter address') :
                                                                                            field.id === 'notes' ? (formSettings?.notes_placeholder || 'Any notes...') :
                                                                                                `Enter ${field.label.toLowerCase()}`}
                                                                                        style={{
                                                                                            width: '100%',
                                                                                            padding: '10px 12px 10px 36px',
                                                                                            border: `${borderWidth}px solid ${borderColor}`,
                                                                                            borderRadius: `${borderRadius}px`,
                                                                                            fontSize: `${textSize}px`,
                                                                                            fontWeight: fontStyle === 'bold' ? 700 : 400,
                                                                                            fontStyle: fontStyle === 'italic' ? 'italic' : 'normal',
                                                                                            color: textColor,
                                                                                            backgroundColor: fieldBg,
                                                                                            boxShadow: (styles as any).shadow ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                                                            boxSizing: 'border-box' as any,
                                                                                            height: '55px',
                                                                                            resize: 'none' as any,
                                                                                        }}
                                                                                        rows={2}
                                                                                    />
                                                                                ) : (
                                                                                    <input
                                                                                        type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
                                                                                        disabled
                                                                                        placeholder={field.id === 'name' ? (formSettings?.name_placeholder || 'John Doe') :
                                                                                            field.id === 'phone' ? (formSettings?.phone_placeholder || '+91 98765 43210') :
                                                                                                field.id === 'email' ? 'email@example.com' :
                                                                                                    `Enter ${field.label.toLowerCase()}`}
                                                                                        style={{
                                                                                            width: '100%',
                                                                                            padding: '10px 12px 10px 36px',
                                                                                            border: `${borderWidth}px solid ${borderColor}`,
                                                                                            borderRadius: `${borderRadius}px`,
                                                                                            fontSize: `${textSize}px`,
                                                                                            fontWeight: fontStyle === 'bold' ? 700 : 400,
                                                                                            fontStyle: fontStyle === 'italic' ? 'italic' : 'normal',
                                                                                            color: textColor,
                                                                                            backgroundColor: fieldBg,
                                                                                            boxShadow: (styles as any).shadow ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                                                                            boxSizing: 'border-box' as any,
                                                                                            height: '38px',
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}

                                                            {/* Order Summary */}
                                                            {formSettings?.blocks?.order_summary && (
                                                                <div style={{
                                                                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                                                    borderRadius: '10px',
                                                                    padding: '12px',
                                                                    marginTop: '12px',
                                                                    marginBottom: '12px',
                                                                    border: '1px solid #e2e8f0',
                                                                }}>
                                                                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>🧾 Order Summary</div>
                                                                    {(() => {
                                                                        const unitPrice = 1999;
                                                                        const shippingEnabled = formSettings?.shipping_options?.enabled;
                                                                        const shippingOption = formSettings?.shipping_options?.options?.find((o: any) => o.id === formSettings?.shipping_options?.defaultOption);
                                                                        const shippingCost = shippingEnabled ? (shippingOption?.price || 0) : 0;
                                                                        const tickOffer = editing.offers[0];
                                                                        const tickUpsellPrice = (editing.checkbox_default_checked && tickOffer) ? (tickOffer.original_price || 0) : 0;
                                                                        const total = unitPrice + shippingCost + tickUpsellPrice;
                                                                        return (
                                                                            <>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}><span>Subtotal (1 item)</span><span>₹{unitPrice.toLocaleString()}</span></div>
                                                                                {shippingEnabled && (
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}><span>Shipping</span><span>{shippingCost === 0 ? 'FREE' : `₹${shippingCost}`}</span></div>
                                                                                )}
                                                                                {tickUpsellPrice > 0 && (
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#059669', marginBottom: '6px' }}><span>{tickOffer?.upsell_product_title || 'Upsell'}</span><span>₹{tickUpsellPrice.toFixed(2)}</span></div>
                                                                                )}
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, color: '#111827', paddingTop: '8px', borderTop: '1px dashed #d1d5db' }}><span>Total</span><span style={{ color: formSettings?.primary_color || '#10b981' }}>₹{total.toLocaleString()}</span></div>
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            )}

                                                            {/* Shipping Options */}
                                                            {formSettings?.blocks?.shipping_options && formSettings?.shipping_options?.enabled && (
                                                                <div style={{
                                                                    background: '#f8fafc',
                                                                    borderRadius: '8px',
                                                                    padding: '10px',
                                                                    marginBottom: '12px',
                                                                    border: '1px solid #e2e8f0',
                                                                }}>
                                                                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>🚚 Shipping</div>
                                                                    {formSettings?.shipping_options?.options?.slice(0, 2).map((opt: any) => (
                                                                        <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>
                                                                            <input type="radio" name="tick-shipping-preview" disabled checked={opt.id === formSettings?.shipping_options?.defaultOption} style={{ width: '12px', height: '12px' }} />
                                                                            <span>{opt.label}</span>
                                                                            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{opt.price === 0 ? 'Free' : `₹${opt.price}`}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Buyer Marketing */}
                                                            {formSettings?.blocks?.buyer_marketing && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '10px', color: '#6b7280' }}>
                                                                    <input type="checkbox" disabled style={{ width: '14px', height: '14px' }} />
                                                                    <span>Keep me updated with offers & news</span>
                                                                </div>
                                                            )}

                                                            {/* Tick upsell row */}
                                                            {editing.offers[0] && (() => {
                                                                const offer = editing.offers[0];
                                                                const tickColor = editing.design.acceptButton.bgColor || '#1579ff';
                                                                const bgColor = editing.design.bgColor || '#f6fff4';
                                                                const borderColor = editing.design.acceptButton.borderColor || '#0eda52';
                                                                const bw = editing.design.acceptButton.borderWidth || 2;
                                                                const br = editing.design.acceptButton.borderRadius || 10;
                                                                const textColor = editing.design.headerTextColor || '#000000';
                                                                const textSize = editing.design.headerTextSize || 13;
                                                                const bStyle = editing.design.acceptButton.borderStyle || 'dashed';
                                                                const displayText = (editing.design.headerText || '🔥 Add {{title}} for only {{price}}')
                                                                    .replace('{{title}}', `<strong>${offer.upsell_product_title || 'Shipping protection'}</strong>`)
                                                                    .replace('{{price}}', `$${(offer.original_price || 0).toFixed(2)}`);

                                                                const rowStyle: any = { background: bgColor, borderRadius: br, position: 'relative' };
                                                                let svgOverlay: React.ReactNode = null;
                                                                if (bStyle === 'none') {
                                                                    rowStyle.border = 'none';
                                                                } else if (bStyle === 'dashed_animation') {
                                                                    rowStyle.border = 'none';
                                                                    rowStyle.overflow = 'hidden';
                                                                    svgOverlay = (
                                                                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                                                                            <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx={br} ry={br} fill="none" stroke={borderColor} strokeWidth={bw} strokeDasharray="8 4" style={{ animation: 'tick-marching-ants 0.4s linear infinite' }} />
                                                                        </svg>
                                                                    );
                                                                } else {
                                                                    rowStyle.border = `${bw}px ${bStyle} ${borderColor}`;
                                                                }
                                                                return (
                                                                    <div className="tick-pv-row" style={rowStyle}>
                                                                        {svgOverlay}
                                                                        <div className="tick-pv-cb" style={{ borderColor: tickColor, background: editing.checkbox_default_checked ? tickColor : 'transparent' }}>
                                                                            {editing.checkbox_default_checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                                                                        </div>
                                                                        <div className="tick-pv-text" style={{ color: textColor, fontSize: textSize }} dangerouslySetInnerHTML={{ __html: displayText }} />
                                                                    </div>
                                                                );
                                                            })()}

                                                            {/* Submit Button - Styled exactly like Form Builder */}
                                                            {(() => {
                                                                const primaryColor = formSettings?.primary_color || '#ef4444';
                                                                const btn = (formSettings?.button_styles || {}) as any;
                                                                const buttonColor = primaryColor;
                                                                const borderCol = btn.borderColor || buttonColor;
                                                                const borderW = btn.borderWidth ?? 0;
                                                                const buttonSize = btn.buttonSize || 'medium';
                                                                const bRadius = btn.borderRadius || 12;
                                                                const buttonStyle = btn.buttonStyle || 'solid';

                                                                const base: any = {
                                                                    width: '100%',
                                                                    padding: buttonSize === 'small' ? '10px' : buttonSize === 'large' ? '16px' : '13px',
                                                                    borderRadius: bRadius + 'px',
                                                                    fontWeight: btn.fontStyle === 'bold' ? 700 : 400,
                                                                    fontStyle: btn.fontStyle === 'italic' ? 'italic' : 'normal',
                                                                    fontSize: (btn.textSize ?? 15) + 'px',
                                                                    border: borderW ? `${borderW}px solid ${borderCol}` : 'none',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease',
                                                                    color: btn.textColor || '#ffffff',
                                                                    background: buttonColor,
                                                                    boxShadow: btn.shadow ? '0 4px 6px rgba(0,0,0,0.1)' : 'none',
                                                                    marginTop: '4px',
                                                                    fontFamily: 'inherit',
                                                                };

                                                                if (buttonStyle === 'outline') {
                                                                    base.background = 'transparent';
                                                                    base.backgroundColor = 'transparent';
                                                                    base.border = borderW > 0 ? `${borderW}px solid ${buttonColor}` : 'none';
                                                                    const isWhite = (btn.textColor || '#ffffff').toLowerCase() === '#ffffff';
                                                                    base.color = isWhite ? buttonColor : btn.textColor;
                                                                    base.boxShadow = 'none';
                                                                } else if (buttonStyle === 'gradient') {
                                                                    const darkenColor = (hex: string, percent: number) => {
                                                                        const num = parseInt(hex.replace('#', ''), 16);
                                                                        const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
                                                                        const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
                                                                        const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
                                                                        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
                                                                    };
                                                                    const darkColor = darkenColor(buttonColor, 25);
                                                                    base.background = `linear-gradient(135deg, ${buttonColor} 0%, ${darkColor} 100%)`;
                                                                    base.boxShadow = btn.shadow ? '0 6px 12px rgba(0,0,0,0.2)' : 'none';
                                                                }

                                                                return (
                                                                    <button style={base}>
                                                                        {formSettings?.submit_button_text || 'Place Order'}
                                                                    </button>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : editing.type === 'downsell' ? (
                            /* ==================== DOWNSELL EDITOR (EasySell-style) ==================== */
                            <>
                                <div>
                                    {/* Name + Active */}
                                    <div className="sec">
                                        <div className="fr">
                                            <div className="fg"><label>Name</label><input value={editing.campaign_name} placeholder="New Downsell" onChange={e => upd({ campaign_name: e.target.value })} /></div>
                                        </div>
                                    </div>

                                    {/* 1 - Display the downsell for */}
                                    <div className="sec">
                                        <h3>1- Display the downsell for</h3>
                                        <div className="mode-toggle">
                                            <button className={`mode-btn ${editing.show_condition_type === 'always' ? 'active' : ''}`} onClick={() => upd({ show_condition_type: 'always' as any })}>✅ All products</button>
                                            <button className={`mode-btn ${editing.show_condition_type === 'specific_products' ? 'active' : ''}`} onClick={() => upd({ show_condition_type: 'specific_products' as any })}>Specific products</button>
                                        </div>
                                        {editing.show_condition_type === 'specific_products' && (
                                            <>
                                                <button className="btn-pick" onClick={pickTrigger}>Select products ({editing.trigger_product_ids?.length || 0} selected)</button>
                                                {editing._triggerProducts?.map((p: any) => (
                                                    <div key={p.id} className="prod-row">
                                                        {p.images?.[0] && <img src={p.images[0].originalSrc || p.images[0].url} alt="" />}
                                                        <div className="prod-row-info"><div className="name">{p.title}</div><div className="vid">{p.id.replace('gid://shopify/Product/', '')}</div></div>
                                                        <button className="prod-x" onClick={() => upd({ trigger_product_ids: editing.trigger_product_ids.filter(id => id !== p.id.replace('gid://shopify/Product/', '')), _triggerProducts: editing._triggerProducts?.filter((tp: any) => tp.id !== p.id) })}>×</button>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                        <div style={{ marginTop: 16 }}>
                                            <div className="fg"><label>How many times should the form be closed before displaying the downsell?</label></div>
                                            <div style={{ display: 'flex', gap: 24 }}>
                                                {[1, 2, 3, 4].map(n => (
                                                    <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: '#374151' }}>
                                                        <input type="radio" name="form-close-count" checked={editing.form_close_count === n} onChange={() => upd({ form_close_count: n })} style={{ accentColor: '#1f2937', width: 18, height: 18 }} />
                                                        {n}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2 - Discount value */}
                                    <div className="sec">
                                        <h3>2- Discount value</h3>
                                        {editing.offers[0] && (() => {
                                            const offer = editing.offers[0];
                                            return (
                                                <>
                                                    <div className="mode-toggle">
                                                        <button className={`mode-btn ${offer.discount_type === 'fixed' ? 'active' : ''}`} onClick={() => updOffer(offer.id, { discount_type: 'fixed' as any })}>Fixed amount</button>
                                                        <button className={`mode-btn ${offer.discount_type === 'percentage' ? 'active' : ''}`} onClick={() => updOffer(offer.id, { discount_type: 'percentage' as any })}>Percentage</button>
                                                    </div>
                                                    <div className="fr" style={{ marginTop: 12 }}>
                                                        <div className="fg">
                                                            <input type="number" min="0" value={offer.discount_value} onChange={e => updOffer(offer.id, { discount_value: parseFloat(e.target.value) || 0 })} />
                                                        </div>
                                                        <div style={{ alignSelf: 'center', fontWeight: 700, fontSize: 18, color: '#374151' }}>{offer.discount_type === 'percentage' ? '%' : '₹'}</div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    {/* Product selection */}
                                    <div className="sec">
                                        <h3>Downsell product</h3>
                                        {editing.offers[0] && (() => {
                                            const offer = editing.offers[0];
                                            return (
                                                <>
                                                    <button className="btn-pick" onClick={() => pickProduct(offer.id)}>Select product</button>
                                                    {offer.upsell_product_id ? (
                                                        <div className="prod-row" style={{ marginTop: 8 }}>
                                                            {offer.upsell_product_image && <img src={offer.upsell_product_image} alt="" />}
                                                            <div className="prod-row-info"><div className="name">{offer.upsell_product_title}</div><div className="vid">₹{offer.original_price?.toFixed(2) || '0.00'}</div></div>
                                                            <button className="prod-x" onClick={() => updOffer(offer.id, { upsell_product_id: '', upsell_variant_id: '', upsell_product_title: '', upsell_product_image: '', original_price: 0, offer_price: 0, _selectedProduct: undefined })}>×</button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ padding: 12, border: '1px dashed #e5e7eb', borderRadius: 10, textAlign: 'center', color: '#9ca3af', fontSize: 13, marginTop: 8 }}>No product selected — select a product to show its price in the downsell</div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>

                                    {/* 3 - Customize the downsell */}
                                    <div className="sec">
                                        <h3>3- Customize the downsell</h3>

                                        {/* Background color swatches */}
                                        <div className="fg"><label>Background color</label></div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
                                            {[
                                                'linear-gradient(135deg, #ffd700, #ff8c00)',
                                                'linear-gradient(135deg, #667eea, #764ba2)',
                                                'linear-gradient(135deg, #43e97b, #38f9d7)',
                                                'linear-gradient(135deg, #fa709a, #fee140)',
                                                'linear-gradient(135deg, #d4fc79, #96e6a1)',
                                                'linear-gradient(135deg, #a18cd1, #fbc2eb)',
                                                'linear-gradient(135deg, #fccb90, #d57eeb)',
                                                'linear-gradient(135deg, #e0c3fc, #8ec5fc)',
                                                'linear-gradient(135deg, #f093fb, #f5576c)',
                                                '#ffffff',
                                            ].map((bg, i) => (
                                                <div key={i} onClick={() => updDesign({ bgColor: bg })} style={{
                                                    width: '100%', aspectRatio: '1', borderRadius: 12, background: bg, cursor: 'pointer',
                                                    border: editing.design.bgColor === bg ? '3px solid #1f2937' : '2px solid #e5e7eb',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
                                                    boxShadow: editing.design.bgColor === bg ? '0 0 0 2px #fff, 0 0 0 4px #1f2937' : 'none',
                                                }}>
                                                    {editing.design.bgColor === bg && <span style={{ background: '#1f2937', color: '#fff', borderRadius: 4, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>✓</span>}
                                                </div>
                                            ))}
                                        </div>
                                        <ColorSelector label="Custom background" value={editing.design.bgColor.startsWith('#') ? editing.design.bgColor : '#ffd700'} onChange={c => updDesign({ bgColor: c })} />
                                        <div className="fg" style={{ marginTop: 8 }}>
                                            <label>Background image URL</label>
                                            <input value={editing.design.bgImage || ''} placeholder="https://example.com/image.jpg" onChange={e => updDesign({ bgImage: e.target.value })} />
                                            {editing.design.bgImage && (
                                                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <img src={editing.design.bgImage} alt="" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                                                    <button onClick={() => updDesign({ bgImage: '' })} style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#ef4444', background: '#fff' }}>Remove</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Discount badge */}
                                    <div className="sec">
                                        <h3>Discount badge</h3>
                                        <div className="fr">
                                            <div className="fg"><label>Title</label><input value={editing.design.discountBadgeTitle} placeholder="" onChange={e => updDesign({ discountBadgeTitle: e.target.value })} /></div>
                                            <ColorSelector label="Background color" value={editing.design.discountBadgeBgColor.startsWith('#') ? editing.design.discountBadgeBgColor : '#ff4500'} onChange={c => updDesign({ discountBadgeBgColor: c })} />
                                        </div>
                                        <ColorSelector label="Discount color" value={editing.design.discountBadgeDiscountColor} onChange={c => updDesign({ discountBadgeDiscountColor: c })} />
                                        <div className="fr">
                                            <div className="fg">
                                                <label>Badge size</label>
                                                <div style={{ padding: '0 8px', width: '100%' }}>
                                                    <RangeSlider labelHidden label="Badge size" min={20} max={80} value={editing.design.discountBadgeSize} onChange={val => updDesign({ discountBadgeSize: Number(val) })} output />
                                                </div>
                                            </div>
                                            <div className="fg">
                                                <label>Text size</label>
                                                <div style={{ padding: '0 8px', width: '100%' }}>
                                                    <RangeSlider labelHidden label="Text size" min={10} max={40} value={editing.design.discountBadgeTextSize} onChange={val => updDesign({ discountBadgeTextSize: Number(val) })} output />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Edit text */}
                                    <div className="sec">
                                        <h3>Edit text</h3>

                                        {/* Title */}
                                        <div style={{ marginBottom: 20 }}>
                                            <div className="fg"><label>Title</label><input value={editing.design.titleText} placeholder="Hold on!" onChange={e => updDesign({ titleText: e.target.value })} /></div>
                                            <div className="fr3">
                                                <ColorSelector label="Text color" value={editing.design.titleTextColor} onChange={c => updDesign({ titleTextColor: c })} />
                                                <div className="fg"><label>Text size</label><input type="number" min="8" max="48" value={editing.design.titleTextSize} onChange={e => updDesign({ titleTextSize: parseInt(e.target.value) || 24 })} /><span style={{ fontSize: 11, color: '#9ca3af' }}>px</span></div>
                                                <div className="fg"><label>Style</label>
                                                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                                        <button onClick={() => updDesign({ titleBold: !editing.design.titleBold })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 700, background: editing.design.titleBold ? '#1f2937' : '#fff', color: editing.design.titleBold ? '#fff' : '#374151' }}>B</button>
                                                        <button onClick={() => updDesign({ titleItalic: !editing.design.titleItalic })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontStyle: 'italic', background: editing.design.titleItalic ? '#1f2937' : '#fff', color: editing.design.titleItalic ? '#fff' : '#374151' }}>I</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Subtitle */}
                                        <div style={{ marginBottom: 20 }}>
                                            <div className="fg"><label>Subtitle</label><input value={editing.design.subtitleText} placeholder="Congratulations! You've just unlocked a special discount!" onChange={e => updDesign({ subtitleText: e.target.value })} /></div>
                                            <div className="fr3">
                                                <ColorSelector label="Text color" value={editing.design.subtitleTextColor} onChange={c => updDesign({ subtitleTextColor: c })} />
                                                <div className="fg"><label>Text size</label><input type="number" min="8" max="48" value={editing.design.subtitleTextSize} onChange={e => updDesign({ subtitleTextSize: parseInt(e.target.value) || 16 })} /><span style={{ fontSize: 11, color: '#9ca3af' }}>px</span></div>
                                                <div className="fg"><label>Style</label>
                                                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                                        <button onClick={() => updDesign({ subtitleBold: !editing.design.subtitleBold })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 700, background: editing.design.subtitleBold ? '#1f2937' : '#fff', color: editing.design.subtitleBold ? '#fff' : '#374151' }}>B</button>
                                                        <button onClick={() => updDesign({ subtitleItalic: !editing.design.subtitleItalic })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontStyle: 'italic', background: editing.design.subtitleItalic ? '#1f2937' : '#fff', color: editing.design.subtitleItalic ? '#fff' : '#374151' }}>I</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div style={{ marginBottom: 20 }}>
                                            <div className="fg"><label>Description</label><input value={editing.design.descriptionText} placeholder="Buy now, get a discount!" onChange={e => updDesign({ descriptionText: e.target.value })} /></div>
                                            <div className="fr3">
                                                <ColorSelector label="Text color" value={editing.design.descriptionTextColor} onChange={c => updDesign({ descriptionTextColor: c })} />
                                                <div className="fg"><label>Text size</label><input type="number" min="8" max="48" value={editing.design.descriptionTextSize} onChange={e => updDesign({ descriptionTextSize: parseInt(e.target.value) || 20 })} /><span style={{ fontSize: 11, color: '#9ca3af' }}>px</span></div>
                                                <div className="fg"><label>Style</label>
                                                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                                        <button onClick={() => updDesign({ descriptionBold: !editing.design.descriptionBold })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 700, background: editing.design.descriptionBold ? '#1f2937' : '#fff', color: editing.design.descriptionBold ? '#fff' : '#374151' }}>B</button>
                                                        <button onClick={() => updDesign({ descriptionItalic: !editing.design.descriptionItalic })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontStyle: 'italic', background: editing.design.descriptionItalic ? '#1f2937' : '#fff', color: editing.design.descriptionItalic ? '#fff' : '#374151' }}>I</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div>
                                            <div className="fg"><label>Content</label><textarea value={editing.design.contentText} placeholder="Additional content..." onChange={e => updDesign({ contentText: e.target.value })} /></div>
                                            <div className="fr3">
                                                <ColorSelector label="Text color" value={editing.design.contentTextColor} onChange={c => updDesign({ contentTextColor: c })} />
                                                <div className="fg"><label>Text size</label><input type="number" min="8" max="48" value={editing.design.contentTextSize} onChange={e => updDesign({ contentTextSize: parseInt(e.target.value) || 16 })} /><span style={{ fontSize: 11, color: '#9ca3af' }}>px</span></div>
                                                <div className="fg"><label>Style</label>
                                                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                                        <button onClick={() => updDesign({ contentBold: !editing.design.contentBold })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 700, background: editing.design.contentBold ? '#1f2937' : '#fff', color: editing.design.contentBold ? '#fff' : '#374151' }}>B</button>
                                                        <button onClick={() => updDesign({ contentItalic: !editing.design.contentItalic })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontStyle: 'italic', background: editing.design.contentItalic ? '#1f2937' : '#fff', color: editing.design.contentItalic ? '#fff' : '#374151' }}>I</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Complete order button */}
                                    <div className="sec">
                                        <h3>Complete order button</h3>
                                        <div className="fg"><label>Button Text</label><input value={editing.design.acceptButton.text} placeholder="Complete order with {discount} OFF" onChange={e => updAccept({ text: e.target.value })} /></div>
                                        <div className="fr">
                                            <ColorSelector label="Background color" value={editing.design.acceptButton.bgColor.startsWith('#') ? editing.design.acceptButton.bgColor : '#ff4500'} onChange={c => updAccept({ bgColor: c })} />
                                            <div className="fg"><label>Animation</label><select value={editing.design.acceptButton.animation} onChange={e => updAccept({ animation: e.target.value })}><option value="none">None</option><option value="pulse">Pulse</option><option value="bounce">Bounce</option><option value="shake">Shake</option></select></div>
                                        </div>
                                        <div className="fg"><label>Change icon</label>
                                            <select value={editing.design.acceptButton.changeIcon || 'none'} onChange={e => updAccept({ changeIcon: e.target.value })}>
                                                <option value="none">None</option>
                                                <option value="cart">🛒 Cart</option>
                                                <option value="check">✓ Check</option>
                                                <option value="star">⭐ Star</option>
                                                <option value="gift">🎁 Gift</option>
                                                <option value="heart">❤️ Heart</option>
                                            </select>
                                        </div>
                                        <div className="fr3">
                                            <ColorSelector label="Text color" value={editing.design.acceptButton.textColor} onChange={c => updAccept({ textColor: c })} />
                                            <div className="fg"><label>Text size</label><input type="number" min="8" max="32" value={editing.design.acceptButton.textSize} onChange={e => updAccept({ textSize: parseInt(e.target.value) || 16 })} /><span style={{ fontSize: 11, color: '#9ca3af' }}>px</span></div>
                                            <div className="fg"><label>Style</label>
                                                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                                    <button onClick={() => updAccept({ bold: !editing.design.acceptButton.bold })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 700, background: editing.design.acceptButton.bold ? '#1f2937' : '#fff', color: editing.design.acceptButton.bold ? '#fff' : '#374151' }}>B</button>
                                                    <button onClick={() => updAccept({ italic: !editing.design.acceptButton.italic })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontStyle: 'italic', background: editing.design.acceptButton.italic ? '#1f2937' : '#fff', color: editing.design.acceptButton.italic ? '#fff' : '#374151' }}>I</button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="up-section-label">Border</div>
                                        <ColorSelector label="Border color" value={editing.design.acceptButton.borderColor} onChange={c => updAccept({ borderColor: c })} />
                                        <div className="fg"><label>Border width</label><div style={{ padding: '0 8px', width: '100%' }}><RangeSlider labelHidden label="Border width" min={0} max={5} value={editing.design.acceptButton.borderWidth} onChange={val => updAccept({ borderWidth: Number(val) })} output /></div></div>
                                        <div className="fg"><label>Rounded corners</label><div style={{ padding: '0 8px', width: '100%' }}><RangeSlider labelHidden label="Rounded corners" min={0} max={30} value={editing.design.acceptButton.borderRadius} onChange={val => updAccept({ borderRadius: Number(val) })} output /></div></div>
                                        <div className="fg"><label>Shadow</label><div style={{ padding: '0 8px', width: '100%' }}><RangeSlider labelHidden label="Shadow" min={0} max={20} value={editing.design.acceptButton.shadow ? 10 : 0} onChange={val => updAccept({ shadow: Number(val) > 0 })} output /></div></div>
                                    </div>

                                    {/* No thank you button */}
                                    <div className="sec">
                                        <h3>No thank you button</h3>
                                        <div className="fg"><label>Button Text</label><input value={editing.design.rejectButton.text} placeholder="No thanks" onChange={e => updReject({ text: e.target.value })} /></div>
                                        <div className="fr">
                                            <ColorSelector label="Background color" value={editing.design.rejectButton.bgColor.startsWith('#') ? editing.design.rejectButton.bgColor : '#ffffff'} onChange={c => updReject({ bgColor: c })} />
                                            <div className="fg"><label>Animation</label><select value={editing.design.rejectButton.animation} onChange={e => updReject({ animation: e.target.value })}><option value="none">None</option><option value="pulse">Pulse</option><option value="bounce">Bounce</option><option value="shake">Shake</option></select></div>
                                        </div>
                                        <div className="fg"><label>Change icon</label>
                                            <select value={editing.design.rejectButton.changeIcon || 'none'} onChange={e => updReject({ changeIcon: e.target.value })}>
                                                <option value="none">None</option>
                                                <option value="cart">🛒 Cart</option>
                                                <option value="check">✓ Check</option>
                                                <option value="star">⭐ Star</option>
                                                <option value="gift">🎁 Gift</option>
                                                <option value="heart">❤️ Heart</option>
                                            </select>
                                        </div>
                                        <div className="fr3">
                                            <ColorSelector label="Text color" value={editing.design.rejectButton.textColor} onChange={c => updReject({ textColor: c })} />
                                            <div className="fg"><label>Text size</label><input type="number" min="8" max="32" value={editing.design.rejectButton.textSize} onChange={e => updReject({ textSize: parseInt(e.target.value) || 16 })} /><span style={{ fontSize: 11, color: '#9ca3af' }}>px</span></div>
                                            <div className="fg"><label>Style</label>
                                                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                                    <button onClick={() => updReject({ bold: !editing.design.rejectButton.bold })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontWeight: 700, background: editing.design.rejectButton.bold ? '#1f2937' : '#fff', color: editing.design.rejectButton.bold ? '#fff' : '#374151' }}>B</button>
                                                    <button onClick={() => updReject({ italic: !editing.design.rejectButton.italic })} style={{ padding: '8px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontStyle: 'italic', background: editing.design.rejectButton.italic ? '#1f2937' : '#fff', color: editing.design.rejectButton.italic ? '#fff' : '#374151' }}>I</button>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="up-section-label">Border</div>
                                        <ColorSelector label="Border color" value={editing.design.rejectButton.borderColor} onChange={c => updReject({ borderColor: c })} />
                                        <div className="fg"><label>Border width</label><div style={{ padding: '0 8px', width: '100%' }}><RangeSlider labelHidden label="Border width" min={0} max={5} value={editing.design.rejectButton.borderWidth} onChange={val => updReject({ borderWidth: Number(val) })} output /></div></div>
                                        <div className="fg"><label>Rounded corners</label><div style={{ padding: '0 8px', width: '100%' }}><RangeSlider labelHidden label="Rounded corners" min={0} max={30} value={editing.design.rejectButton.borderRadius} onChange={val => updReject({ borderRadius: Number(val) })} output /></div></div>
                                        <div className="fg"><label>Shadow</label><div style={{ padding: '0 8px', width: '100%' }}><RangeSlider labelHidden label="Shadow" min={0} max={20} value={editing.design.rejectButton.shadow ? 10 : 0} onChange={val => updReject({ shadow: Number(val) > 0 })} output /></div></div>
                                    </div>
                                </div>

                                {/* Downsell Live Preview */}
                                <div>
                                    <div className="pv-wrap">
                                        <div className="pv-panel">
                                            <div className="pv-panel-header">
                                                <h3>Live preview:</h3>
                                            </div>
                                            <div style={{ padding: 16 }}>
                                                {/* Downsell popup preview */}
                                                {(() => {
                                                    const d = editing.design;
                                                    const offer = editing.offers?.[0];
                                                    const origPrice = offer?.original_price || 0;
                                                    const discountVal = offer?.discount_value || 10;
                                                    const discountLabel = offer?.discount_type === 'percentage' ? discountVal + '%' : '₹' + discountVal;
                                                    const discountedPrice = offer?.discount_type === 'percentage'
                                                        ? Math.round((origPrice - origPrice * discountVal / 100) * 100) / 100
                                                        : Math.max(0, origPrice - discountVal);
                                                    const acceptText = (d.acceptButton.text || 'Complete order with {discount} OFF').replace('{discount}', discountLabel);
                                                    const rejectText = d.rejectButton.text || 'No thanks';

                                                    // Button icon helper
                                                    const iconMap: Record<string, string> = { cart: '🛒', check: '✓', star: '⭐', gift: '🎁', heart: '❤️' };
                                                    const acceptIcon = d.acceptButton.changeIcon && d.acceptButton.changeIcon !== 'none' ? iconMap[d.acceptButton.changeIcon] + ' ' : '';
                                                    const rejectIcon = d.rejectButton.changeIcon && d.rejectButton.changeIcon !== 'none' ? iconMap[d.rejectButton.changeIcon] + ' ' : '';

                                                    // Animation class
                                                    const acceptAnimClass = d.acceptButton.animation && d.acceptButton.animation !== 'none' ? `pv-anim-${d.acceptButton.animation}` : '';
                                                    const rejectAnimClass = d.rejectButton.animation && d.rejectButton.animation !== 'none' ? `pv-anim-${d.rejectButton.animation}` : '';

                                                    // Background style (supports gradient, solid color, and image)
                                                    const bgStyle: React.CSSProperties = d.bgImage
                                                        ? { backgroundImage: `url(${d.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                                                        : { background: d.bgColor || '#ffd700' };

                                                    return (
                                                        <div style={{
                                                            ...bgStyle,
                                                            borderRadius: 16,
                                                            overflow: 'hidden',
                                                            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                                        }}>
                                                            <div style={{ padding: '24px 20px 8px', textAlign: 'center' }}>
                                                                {/* Title */}
                                                                {d.titleText && (
                                                                    <div style={{
                                                                        color: d.titleTextColor || '#000',
                                                                        fontSize: d.titleTextSize || 24,
                                                                        fontWeight: d.titleBold ? 700 : 400,
                                                                        fontStyle: d.titleItalic ? 'italic' : 'normal',
                                                                        marginBottom: 4,
                                                                    }}>{d.titleText}</div>
                                                                )}
                                                                {/* Subtitle */}
                                                                {d.subtitleText && (
                                                                    <div style={{
                                                                        color: d.subtitleTextColor || '#000',
                                                                        fontSize: d.subtitleTextSize || 16,
                                                                        fontWeight: d.subtitleBold ? 700 : 400,
                                                                        fontStyle: d.subtitleItalic ? 'italic' : 'normal',
                                                                        marginBottom: 8,
                                                                    }}>{d.subtitleText}</div>
                                                                )}
                                                                {/* Description */}
                                                                {d.descriptionText && (
                                                                    <div style={{
                                                                        color: d.descriptionTextColor || '#000',
                                                                        fontSize: d.descriptionTextSize || 20,
                                                                        fontWeight: d.descriptionBold ? 700 : 400,
                                                                        fontStyle: d.descriptionItalic ? 'italic' : 'normal',
                                                                        marginBottom: 12,
                                                                    }}>{d.descriptionText}</div>
                                                                )}
                                                            </div>

                                                            {/* Discount badge */}
                                                            <div style={{ textAlign: 'center', padding: '0 20px 12px' }}>
                                                                <div style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    width: d.discountBadgeSize + 20 || 70,
                                                                    height: d.discountBadgeSize + 20 || 70,
                                                                    borderRadius: '50%',
                                                                    background: d.discountBadgeBgColor || 'linear-gradient(135deg, #ff4500, #ff8c00)',
                                                                    boxShadow: '0 4px 20px rgba(255,69,0,0.3)',
                                                                    position: 'relative' as const,
                                                                }}>
                                                                    {d.discountBadgeTitle && (
                                                                        <div style={{ position: 'absolute', top: -8, right: -8, background: '#ff4500', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 700 }}>
                                                                            {d.discountBadgeTitle.slice(0, 2)}
                                                                        </div>
                                                                    )}
                                                                    <span style={{
                                                                        color: d.discountBadgeDiscountColor || '#fff',
                                                                        fontSize: d.discountBadgeTextSize || 20,
                                                                        fontWeight: 700,
                                                                    }}>{discountLabel}</span>
                                                                </div>
                                                            </div>

                                                            {/* Content */}
                                                            {
                                                                d.contentText && (
                                                                    <div style={{
                                                                        textAlign: 'center',
                                                                        padding: '0 20px 12px',
                                                                        color: d.contentTextColor || '#fff',
                                                                        fontSize: d.contentTextSize || 16,
                                                                        fontWeight: d.contentBold ? 700 : 400,
                                                                        fontStyle: d.contentItalic ? 'italic' : 'normal',
                                                                    }}>{d.contentText}</div>
                                                                )
                                                            }

                                                            {/* Product image & price */}
                                                            {
                                                                offer?.upsell_product_image && (
                                                                    <div style={{ textAlign: 'center', padding: '0 20px 8px' }}>
                                                                        <img src={offer.upsell_product_image} alt="" style={{ maxWidth: 160, maxHeight: 160, objectFit: 'contain', borderRadius: 10 }} />
                                                                    </div>
                                                                )
                                                            }
                                                            {
                                                                offer?.upsell_product_title && (
                                                                    <div style={{ textAlign: 'center', padding: '0 20px 4px', fontSize: 14, color: '#374151' }}>{offer.upsell_product_title}</div>
                                                                )
                                                            }
                                                            {
                                                                origPrice > 0 && (
                                                                    <div style={{ textAlign: 'center', padding: '0 20px 12px' }}>
                                                                        {discountVal > 0 && <s style={{ color: '#9ca3af', fontSize: 14, marginRight: 8 }}>₹{origPrice.toFixed(2)}</s>}
                                                                        <strong style={{ fontSize: 20, color: '#1f2937' }}>₹{discountedPrice.toFixed(2)}</strong>
                                                                    </div>
                                                                )
                                                            }

                                                            {/* Buttons */}
                                                            <div style={{ padding: '8px 20px 20px' }}>
                                                                <button className={acceptAnimClass} style={{
                                                                    display: 'block', width: '100%', padding: '14px 16px', marginBottom: 8, border: `${d.acceptButton.borderWidth || 0}px solid ${d.acceptButton.borderColor || '#000'}`,
                                                                    borderRadius: d.acceptButton.borderRadius || 8, cursor: 'pointer',
                                                                    background: d.acceptButton.bgColor || '#ff4500', color: d.acceptButton.textColor || '#fff',
                                                                    fontSize: d.acceptButton.textSize || 16, fontWeight: d.acceptButton.bold ? 700 : 400, fontStyle: d.acceptButton.italic ? 'italic' : 'normal',
                                                                    boxShadow: d.acceptButton.shadow ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                                                                }}>{acceptIcon}{acceptText}</button>
                                                                <button className={rejectAnimClass} style={{
                                                                    display: 'block', width: '100%', padding: '12px 16px', border: `${d.rejectButton.borderWidth || 1}px solid ${d.rejectButton.borderColor || '#000'}`,
                                                                    borderRadius: d.rejectButton.borderRadius || 8, cursor: 'pointer',
                                                                    background: d.rejectButton.bgColor || '#fff', color: d.rejectButton.textColor || '#000',
                                                                    fontSize: d.rejectButton.textSize || 16, fontWeight: d.rejectButton.bold ? 700 : 400, fontStyle: d.rejectButton.italic ? 'italic' : 'normal',
                                                                    boxShadow: d.rejectButton.shadow ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                                                                }}>{rejectIcon}{rejectText}</button>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* ==================== CLICK UPSELL EDITOR ==================== */
                            <>
                                <div>
                                    {/* Name */}
                                    <div className="sec">
                                        <div className="fg"><label>Name</label><input value={editing.campaign_name} placeholder="New Upsell" onChange={e => upd({ campaign_name: e.target.value })} /></div>
                                    </div>

                                    {/* Upsell Mode */}
                                    <div className="sec">
                                        <h3>Upsell Mode</h3>
                                        <div className="mode-toggle">
                                            <button className={`mode-btn ${editing.upsell_mode === 'post_purchase' ? 'active' : ''}`} onClick={() => upd({ upsell_mode: 'post_purchase' })}>Post-Purchase</button>
                                            <button className={`mode-btn ${editing.upsell_mode === 'pre_purchase' ? 'active' : ''}`} onClick={() => upd({ upsell_mode: 'pre_purchase' })}>Pre-Purchase</button>
                                        </div>
                                        <div style={{ fontSize: 13, color: '#6b7280' }}>
                                            {editing.upsell_mode === 'post_purchase' ? 'ℹ️ The upsell appears immediately after customers submit the order form.' : 'ℹ️ The upsell appears before customers submit the order form.'}
                                        </div>
                                    </div>

                                    {/* Trigger Rules */}
                                    <div className="sec">
                                        <h3><span className="icon">🛒</span> 1. If a customer bought one of these products</h3>
                                        <div className="fg">
                                            <select value={editing.show_condition_type} onChange={e => upd({ show_condition_type: e.target.value as any })}>
                                                <option value="always">Show for all products</option>
                                                <option value="specific_products">Specific products</option>
                                                <option value="order_value">Order value range</option>
                                            </select>
                                        </div>
                                        {editing.show_condition_type === 'specific_products' && (
                                            <>
                                                <button className="btn-pick" onClick={pickTrigger}>Select products ({editing.trigger_product_ids?.length || 0} selected)</button>
                                                {editing._triggerProducts?.map((p: any) => (
                                                    <div key={p.id} className="prod-row">
                                                        {p.images?.[0] && <img src={p.images[0].originalSrc || p.images[0].url} alt="" />}
                                                        <div className="prod-row-info"><div className="name">{p.title}</div><div className="vid">{p.id.replace('gid://shopify/Product/', '')}</div></div>
                                                        <button className="prod-x" onClick={() => upd({ trigger_product_ids: editing.trigger_product_ids.filter(id => id !== p.id.replace('gid://shopify/Product/', '')), _triggerProducts: editing._triggerProducts?.filter((tp: any) => tp.id !== p.id) })}>×</button>
                                                    </div>
                                                ))}
                                            </>
                                        )}
                                        {editing.show_condition_type === 'order_value' && (
                                            <div className="fr">
                                                <div className="fg"><label>Min (₹)</label><input type="number" min="0" value={editing.min_order_value} onChange={e => upd({ min_order_value: parseFloat(e.target.value) || 0 })} /></div>
                                                <div className="fg"><label>Max (₹)</label><input type="number" min="0" value={editing.max_order_value} onChange={e => upd({ max_order_value: parseFloat(e.target.value) || 0 })} /></div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Offers */}
                                    <div className="sec">
                                        <h3 style={{ justifyContent: 'space-between' }}>
                                            <span><span className="icon">⚡</span> 2. Create offer to include in this upsell</span>
                                            {editing.offers.length < 5 && <button className="btn-pick" onClick={addOffer}>Add offer</button>}
                                        </h3>
                                        {editing.offers.map((offer, idx) => (
                                            <div key={offer.id} className="offer-card">
                                                <div className="offer-header" onClick={() => updOffer(offer.id, { expanded: !offer.expanded })}>
                                                    <span className="drag">⋮⋮</span>
                                                    <span className="title">Offer #{idx + 1} {offer.discount_value > 0 ? ` -${offer.discount_type === 'percentage' ? offer.discount_value + '%' : '₹' + offer.discount_value}` : ''}</span>
                                                    <span className={`chevron ${offer.expanded ? 'open' : ''}`}>▼</span>
                                                    {editing.offers.length > 1 && <button className="del-offer" onClick={e => { e.stopPropagation(); delOffer(offer.id); }}>🗑</button>}
                                                </div>
                                                <div className={`offer-body ${offer.expanded ? '' : 'collapsed'}`}>
                                                    <div className="fg"><label>Select the product you want to offer</label></div>
                                                    {offer.upsell_product_id ? (
                                                        <div className="prod-row">
                                                            {offer.upsell_product_image && <img src={offer.upsell_product_image} alt="" />}
                                                            <div className="prod-row-info"><div className="name">{offer.upsell_product_title}</div><div className="vid">{offer.upsell_product_id}</div></div>
                                                            <button className="btn-pick" onClick={() => pickProduct(offer.id)}>Change product</button>
                                                        </div>
                                                    ) : (
                                                        <button className="btn-pick" onClick={() => pickProduct(offer.id)}>Change product</button>
                                                    )}
                                                    <div style={{ marginTop: 14 }}>
                                                        <div className="fr">
                                                            <div className="fg"><label>Discount</label>
                                                                <div style={{ display: 'flex', gap: 8 }}>
                                                                    <select value={offer.discount_type} onChange={e => updOffer(offer.id, { discount_type: e.target.value as any })} style={{ width: 120 }}>
                                                                        <option value="percentage">Percentage</option><option value="fixed">Fixed</option>
                                                                    </select>
                                                                    <input type="number" min="0" value={offer.discount_value} onChange={e => updOffer(offer.id, { discount_value: parseFloat(e.target.value) || 0 })} style={{ width: 80 }} />
                                                                    <span style={{ alignSelf: 'center', fontWeight: 600 }}>{offer.discount_type === 'percentage' ? '%' : '₹'}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {editing.offers.length >= 2 && (
                                            <div className="info-banner">ℹ️ Create up to 5 upsell offers. When the customer accepts or rejects an offer, the next one will be shown.</div>
                                        )}
                                    </div>

                                    {/* Header Design */}
                                    <div className="sec">
                                        <h3><span className="icon">📝</span> Header</h3>
                                        <div className="fg"><label>Header Text</label><input value={editing.design.headerText} onChange={e => updDesign({ headerText: e.target.value })} /></div>
                                        <div className="fg"><label>Subheader</label><input value={editing.design.subheaderText} onChange={e => updDesign({ subheaderText: e.target.value })} /></div>
                                        <div className="fg">
                                            <label>Text Size (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Text Size"
                                                    min={10}
                                                    max={36}
                                                    value={editing.design.headerTextSize}
                                                    onChange={val => updDesign({ headerTextSize: Number(val) || 20 })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <ColorSelector label="Text Color" value={editing.design.headerTextColor} onChange={c => updDesign({ headerTextColor: c })} />
                                    </div>

                                    {/* Timer */}
                                    <div className="sec">
                                        <h3><span className="icon">⏱️</span> Timer</h3>
                                        <div className="up-toggle-row" onClick={() => updDesign({ timer: { ...editing.design.timer, enabled: !editing.design.timer.enabled } })}>
                                            <span>Enable timer</span>
                                            <div className={`up-mini-toggle ${editing.design.timer.enabled ? 'on' : 'off'}`} />
                                        </div>
                                        {editing.design.timer.enabled && (
                                            <>
                                                <div className="fg" style={{ marginTop: 12 }}><label>Timer Text</label><textarea value={editing.design.timer.text} onChange={e => updDesign({ timer: { ...editing.design.timer, text: e.target.value } })} /></div>
                                                <p style={{ fontSize: 12, color: '#9ca3af', marginTop: -8, marginBottom: 12 }}>Use {'{time}'} to insert the timer value</p>
                                                <div className="fg"><label>Time (minutes)</label><input type="number" min="1" value={editing.design.timer.minutes} onChange={e => updDesign({ timer: { ...editing.design.timer, minutes: parseInt(e.target.value) || 10 } })} /></div>
                                                <ColorSelector label="Background Color" value={editing.design.timer.bgColor} onChange={c => updDesign({ timer: { ...editing.design.timer, bgColor: c } })} />
                                            </>
                                        )}
                                    </div>

                                    {/* Discount Tag */}
                                    <div className="sec">
                                        <h3><span className="icon">🏷️</span> Discount Tag</h3>
                                        <div className="fg"><label>Text</label><input value={editing.design.discountTag.text} onChange={e => updDesign({ discountTag: { ...editing.design.discountTag, text: e.target.value } })} /></div>
                                        <ColorSelector label="Background" value={editing.design.discountTag.bgColor.startsWith('#') ? editing.design.discountTag.bgColor : '#ec4899'} onChange={c => updDesign({ discountTag: { ...editing.design.discountTag, bgColor: c } })} />
                                        <ColorSelector label="Text Color" value={editing.design.discountTag.textColor} onChange={c => updDesign({ discountTag: { ...editing.design.discountTag, textColor: c } })} />
                                        <div className="fg">
                                            <label>Text Size (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Text Size"
                                                    min={8}
                                                    max={24}
                                                    value={editing.design.discountTag.textSize}
                                                    onChange={val => updDesign({ discountTag: { ...editing.design.discountTag, textSize: Number(val) || 14 } })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="fg">
                                            <label>Rounded Corners (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Rounded Corners"
                                                    min={0}
                                                    max={30}
                                                    value={editing.design.discountTag.borderRadius}
                                                    onChange={val => updDesign({ discountTag: { ...editing.design.discountTag, borderRadius: Number(val) } })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Accept Button */}
                                    <div className="sec">
                                        <h3><span className="icon">✅</span> Accept Button</h3>
                                        <div className="fg"><label>Button Text</label><input value={editing.design.acceptButton.text} onChange={e => updAccept({ text: e.target.value })} /></div>
                                        <div className="fg"><label>Animation</label><select value={editing.design.acceptButton.animation} onChange={e => updAccept({ animation: e.target.value })}><option value="none">None</option><option value="pulse">Pulse</option><option value="bounce">Bounce</option><option value="shake">Shake</option></select></div>
                                        <div className="up-section-label">Colors</div>
                                        <ColorSelector label="Background" value={editing.design.acceptButton.bgColor} onChange={c => updAccept({ bgColor: c })} />
                                        <ColorSelector label="Text Color" value={editing.design.acceptButton.textColor} onChange={c => updAccept({ textColor: c })} />
                                        <div className="fg">
                                            <label>Text Size (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Text Size"
                                                    min={10}
                                                    max={24}
                                                    value={editing.design.acceptButton.textSize}
                                                    onChange={val => updAccept({ textSize: Number(val) || 16 })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="up-section-label">Border</div>
                                        <ColorSelector label="Border Color" value={editing.design.acceptButton.borderColor} onChange={c => updAccept({ borderColor: c })} />
                                        <div className="fg">
                                            <label>Border Width (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Border Width"
                                                    min={0}
                                                    max={5}
                                                    value={editing.design.acceptButton.borderWidth}
                                                    onChange={val => updAccept({ borderWidth: Number(val) })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="fg">
                                            <label>Rounded Corners (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Rounded Corners"
                                                    min={0}
                                                    max={30}
                                                    value={editing.design.acceptButton.borderRadius}
                                                    onChange={val => updAccept({ borderRadius: Number(val) })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="up-toggle-row" onClick={() => updAccept({ shadow: !editing.design.acceptButton.shadow })}>
                                            <span>Shadow</span>
                                            <div className={`up-mini-toggle ${editing.design.acceptButton.shadow ? 'on' : 'off'}`} />
                                        </div>
                                    </div>

                                    {/* Reject Button */}
                                    <div className="sec">
                                        <h3><span className="icon">❌</span> Reject Button</h3>
                                        <div className="fg"><label>Button Text</label><input value={editing.design.rejectButton.text} onChange={e => updReject({ text: e.target.value })} /></div>
                                        <div className="up-section-label">Colors</div>
                                        <ColorSelector label="Background" value={editing.design.rejectButton.bgColor} onChange={c => updReject({ bgColor: c })} />
                                        <ColorSelector label="Text Color" value={editing.design.rejectButton.textColor} onChange={c => updReject({ textColor: c })} />
                                        <div className="up-section-label">Border</div>
                                        <ColorSelector label="Border Color" value={editing.design.rejectButton.borderColor} onChange={c => updReject({ borderColor: c })} />
                                        <div className="fg">
                                            <label>Border Width (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Border Width"
                                                    min={0}
                                                    max={5}
                                                    value={editing.design.rejectButton.borderWidth}
                                                    onChange={val => updReject({ borderWidth: Number(val) })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="fg">
                                            <label>Rounded Corners (px)</label>
                                            <div style={{ padding: '0 8px', width: '100%' }}>
                                                <RangeSlider
                                                    labelHidden
                                                    label="Rounded Corners"
                                                    min={0}
                                                    max={30}
                                                    value={editing.design.rejectButton.borderRadius}
                                                    onChange={val => updReject({ borderRadius: Number(val) })}
                                                    output
                                                />
                                            </div>
                                        </div>
                                        <div className="up-toggle-row" onClick={() => updReject({ shadow: !editing.design.rejectButton.shadow })}>
                                            <span>Shadow</span>
                                            <div className={`up-mini-toggle ${editing.design.rejectButton.shadow ? 'on' : 'off'}`} />
                                        </div>
                                    </div>

                                    {/* Linked Downsell (for click_upsell) */}
                                    {editing.type === 'click_upsell' && (
                                        <div className="sec">
                                            <h3>Linked Downsell</h3>
                                            <div className="fg">
                                                <label>Show this downsell if customer declines</label>
                                                <select value={editing.linked_downsell_id || ''} onChange={e => upd({ linked_downsell_id: e.target.value || undefined })}>
                                                    <option value="">None</option>
                                                    {availableDownsells.map((ds: any) => <option key={ds.id} value={ds.id}>{ds.campaign_name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Live Preview */}
                                <div>
                                    <div className="pv-wrap">
                                        <div className="pv-panel">
                                            <div className="pv-panel-header">
                                                <h3>📱 Live Preview</h3>
                                                <span className="pv-badge">Offer #{(expandedOfferIdx >= 0 ? expandedOfferIdx : 0) + 1}</span>
                                            </div>
                                            <div className="pv-phone">
                                                <div className="pv-phone-screen">
                                                    <div className="pv-modal" style={{ background: editing.design.bgColor }}>
                                                        <div className="pv-header">
                                                            <h2 style={{ fontSize: editing.design.headerTextSize, color: editing.design.headerTextColor, fontWeight: editing.design.headerBold ? 700 : 400 }}>{editing.design.headerText || "You've unlocked a special deal"}</h2>
                                                            <p>{editing.design.subheaderText || 'Only for a limited time!'}</p>
                                                        </div>
                                                        {editing.design.timer.enabled && (
                                                            <div className="pv-timer" style={{ background: editing.design.timer.bgColor, color: editing.design.timer.textColor }}>
                                                                {(editing.design.timer.text || 'Hurry! sale ends in\n{time}').replace('{time}', `${String(editing.design.timer.minutes).padStart(2, '0')}:00`)}
                                                            </div>
                                                        )}
                                                        {activeOffer?.upsell_product_image && (
                                                            <div className="pv-img-wrap">
                                                                <img src={activeOffer.upsell_product_image} alt="" />
                                                            </div>
                                                        )}
                                                        <div className="pv-product-title">{activeOffer?.upsell_product_title || 'Product Name'}</div>
                                                        {activeOffer && activeOffer.discount_value > 0 && (
                                                            <div className="pv-discount">
                                                                <span style={{ background: editing.design.discountTag.bgColor, color: editing.design.discountTag.textColor, fontSize: editing.design.discountTag.textSize, borderRadius: editing.design.discountTag.borderRadius }}>
                                                                    {(editing.design.discountTag.text || '- {discount}').replace('{discount}', activeOffer.discount_type === 'percentage' ? activeOffer.discount_value + '%' : '₹' + activeOffer.discount_value)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="pv-prices">
                                                            {activeOffer && activeOffer.discount_value > 0 && <s>₹{activeOffer.original_price.toFixed(2)}</s>}
                                                            <strong>₹{activeOfferPrice.toFixed(2)}</strong>
                                                        </div>
                                                        <button className={`pv-accept ${editing.design.acceptButton.animation && editing.design.acceptButton.animation !== 'none' ? 'pv-anim-' + editing.design.acceptButton.animation : ''}`} style={{ background: editing.design.acceptButton.bgColor, color: editing.design.acceptButton.textColor, fontSize: editing.design.acceptButton.textSize, borderRadius: editing.design.acceptButton.borderRadius, borderWidth: editing.design.acceptButton.borderWidth, borderStyle: 'solid', borderColor: editing.design.acceptButton.borderColor, fontWeight: editing.design.acceptButton.bold ? 700 : 400, boxShadow: editing.design.acceptButton.shadow ? '0 4px 12px rgba(0,0,0,0.15)' : 'none' }}>
                                                            {editing.design.acceptButton.text}
                                                        </button>
                                                        <button className="pv-reject" style={{ background: editing.design.rejectButton.bgColor, color: editing.design.rejectButton.textColor, fontSize: editing.design.rejectButton.textSize, borderRadius: editing.design.rejectButton.borderRadius, borderWidth: editing.design.rejectButton.borderWidth, borderStyle: 'solid', borderColor: editing.design.rejectButton.borderColor, boxShadow: editing.design.rejectButton.shadow ? '0 4px 12px rgba(0,0,0,0.15)' : 'none' }}>
                                                            {editing.design.rejectButton.text}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div >
        </>
    );
}
