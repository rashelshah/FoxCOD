/**
 * Quantity Offers Page - EasySell-Style Bundle Discounts
 * Route: /app/quantity-offers
 * Matching EasySell UI exactly with offers list, templates, color presets
 */

import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    type QuantityOffer,
    type QuantityOfferGroup,
    type OfferDesignSettings,
    DEFAULT_OFFER_DESIGN,
    DEFAULT_OFFERS,
    createDefaultOfferGroup,
} from "../config/quantity-offers.types";
import { supabase } from "../config/supabase.server";
import { getFormSettings } from "../config/supabase.server";

// Color Presets for quick selection
const COLOR_PRESETS = [
    { name: "Coral", bg: "#fff0ea", border: "#dc2626", tag: "#ef4444", tagText: "#ffffff" },
    { name: "Blue", bg: "#eff6ff", border: "#2563eb", tag: "#3b82f6", tagText: "#ffffff" },
    { name: "Rose", bg: "#fff1f2", border: "#f43f5e", tag: "#f43f5e", tagText: "#ffffff" },
    { name: "Indigo", bg: "#eef2ff", border: "#4f46e5", tag: "#6366f1", tagText: "#ffffff" },
    { name: "Navy", bg: "#1e3a5f", border: "#1e3a5f", tag: "#0ea5e9", tagText: "#ffffff" },
    { name: "Slate", bg: "#1e293b", border: "#334155", tag: "#64748b", tagText: "#ffffff" },
];

// Loader
export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const { data: offerGroups } = await supabase
        .from("quantity_offer_groups")
        .select("*")
        .eq("shop_domain", shopDomain)
        .order("updated_at", { ascending: false });

    const formSettings = await getFormSettings(shopDomain);

    return { shopDomain, offerGroups: offerGroups || [], formSettings };
};

// Ensure metafield definition
async function ensureQuantityOffersMetafield(admin: any) {
    try {
        await admin.graphql(`
            mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
                metafieldDefinitionCreate(definition: $definition) {
                    createdDefinition { id key }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                definition: {
                    name: "Quantity Offers JSON",
                    namespace: "fox_cod",
                    key: "quantity_offers_json",
                    type: "json",
                    ownerType: "SHOP",
                    access: { storefront: "PUBLIC_READ" }
                }
            }
        });
    } catch (e) {
        console.log('[Quantity Offers] Metafield definition exists');
    }
}

// Sync to metafield
async function syncOffersToMetafield(admin: any, offerGroups: any[]) {
    await ensureQuantityOffersMetafield(admin);

    // Get shop GID
    const shopResponse = await admin.graphql(`{ shop { id } }`);
    const shopData = await shopResponse.json();
    const shopId = shopData.data.shop.id;

    await admin.graphql(`
        mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                metafields { id key value }
                userErrors { field message }
            }
        }
    `, {
        variables: {
            metafields: [{
                ownerId: shopId,
                namespace: "fox_cod",
                key: "quantity_offers_json",
                value: JSON.stringify(offerGroups),
                type: "json"
            }]
        }
    });
}

// Action
export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, admin } = await authenticate.admin(request);
    const shopDomain = session.shop;
    const formData = await request.formData();
    const actionType = formData.get("action") as string;

    if (actionType === "save") {
        const offerGroup = JSON.parse(formData.get("offerGroup") as string);

        if (offerGroup.id) {
            await supabase.from("quantity_offer_groups").update({
                name: offerGroup.name,
                active: offerGroup.active,
                product_ids: offerGroup.productIds,
                offers: offerGroup.offers,
                design: offerGroup.design,
                placement: offerGroup.placement,
            }).eq("id", offerGroup.id).eq("shop_domain", shopDomain);
        } else {
            await supabase.from("quantity_offer_groups").insert({
                shop_domain: shopDomain,
                name: offerGroup.name,
                active: offerGroup.active,
                product_ids: offerGroup.productIds,
                offers: offerGroup.offers,
                design: offerGroup.design,
                placement: offerGroup.placement,
            });
        }

        // Sync ALL active offers to metafield
        const { data: allOffers } = await supabase
            .from("quantity_offer_groups")
            .select("*")
            .eq("shop_domain", shopDomain)
            .eq("active", true);

        await syncOffersToMetafield(admin, allOffers || []);
        return { success: true };
    }

    if (actionType === "delete") {
        const groupId = formData.get("groupId") as string;
        await supabase.from("quantity_offer_groups").delete().eq("id", groupId).eq("shop_domain", shopDomain);
        return { success: true };
    }

    return { success: false };
};

// Sortable Offer Item with Edit/Done toggle
function SortableOfferItem({
    offer,
    isEditing,
    onToggleEdit,
    onUpdate,
    onDelete
}: {
    offer: QuantityOffer;
    isEditing: boolean;
    onToggleEdit: (id: string) => void;
    onUpdate: (id: string, updates: Partial<QuantityOffer>) => void;
    onDelete: (id: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: offer.id });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div ref={setNodeRef} style={style} className="offer-item">
            <div className="offer-drag" {...attributes} {...listeners}>
                <span>⋮⋮</span>
            </div>
            <div className="offer-main">
                {!isEditing ? (
                    <div className="offer-collapsed">
                        <span className="offer-title">{offer.quantity} {offer.quantity === 1 ? 'Unit' : 'Units'}</span>
                        <div className="offer-actions">
                            <button className="btn-edit" onClick={() => onToggleEdit(offer.id)}>Edit</button>
                            <button className="btn-delete-icon" onClick={() => onDelete(offer.id)}>🗑</button>
                        </div>
                    </div>
                ) : (
                    <div className="offer-expanded">
                        <div className="offer-row">
                            <div className="offer-field">
                                <label>Quantity</label>
                                <input type="number" min="1" value={offer.quantity}
                                    onChange={(e) => onUpdate(offer.id, { quantity: parseInt(e.target.value) || 1 })} />
                            </div>
                            <div className="offer-field">
                                <label>Title</label>
                                <input type="text" value={offer.title || `${offer.quantity} Unit${offer.quantity !== 1 ? 's' : ''}`}
                                    onChange={(e) => onUpdate(offer.id, { title: e.target.value })} />
                            </div>
                        </div>
                        <div className="offer-row">
                            <div className="offer-field">
                                <label>Discount type</label>
                                <select value={offer.discountType || 'percentage'}
                                    onChange={(e) => onUpdate(offer.id, { discountType: e.target.value as any })}>
                                    <option value="percentage">Percentage</option>
                                    <option value="fixed">Fixed Amount</option>
                                </select>
                            </div>
                            <div className="offer-field">
                                <label>Discount value</label>
                                <div className="input-suffix">
                                    <input type="number" min="0" value={offer.discountPercent || 0}
                                        onChange={(e) => onUpdate(offer.id, { discountPercent: parseInt(e.target.value) || 0 })} />
                                    <span>{offer.discountType === 'fixed' ? '₹' : '%'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="offer-row">
                            <div className="offer-field">
                                <label>Tag</label>
                                <input type="text" placeholder="Save 0%" value={offer.label || ''}
                                    onChange={(e) => onUpdate(offer.id, { label: e.target.value })} />
                            </div>
                            <div className="offer-field">
                                <label>Tag background</label>
                                <div className="color-input-row">
                                    <input type="color" value={offer.tagBgColor || '#ef4444'}
                                        onChange={(e) => onUpdate(offer.id, { tagBgColor: e.target.value })} />
                                    <input type="text" value={offer.tagBgColor || '#ffffff'}
                                        onChange={(e) => onUpdate(offer.id, { tagBgColor: e.target.value })} />
                                </div>
                            </div>
                        </div>
                        <div className="offer-row">
                            <label className="checkbox-row">
                                <input type="checkbox" checked={offer.preselect || false}
                                    onChange={(e) => onUpdate(offer.id, { preselect: e.target.checked })} />
                                <span>Preselect this offer</span>
                            </label>
                        </div>
                        <div className="offer-actions">
                            <button className="btn-done" onClick={() => onToggleEdit(offer.id)}>Done</button>
                            <button className="btn-delete-icon" onClick={() => onDelete(offer.id)}>🗑</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Main Component
export default function QuantityOffersPage() {
    const { shopDomain, offerGroups: initialOfferGroups, formSettings } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const isSaving = navigation.state === "submitting";

    const primaryColor = formSettings?.primary_color || "#ef4444";
    const buttonStyles = (formSettings?.button_styles || {}) as any;

    // State
    const [activeGroup, setActiveGroup] = useState<QuantityOfferGroup | null>(
        initialOfferGroups[0] ? {
            ...initialOfferGroups[0],
            productIds: initialOfferGroups[0].product_ids || [],
            offers: initialOfferGroups[0].offers || DEFAULT_OFFERS,
            design: { ...DEFAULT_OFFER_DESIGN, ...(initialOfferGroups[0].design || {}) },
        } : null
    );
    const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'offers' | 'design'>('offers');

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Handlers
    const handleCreateNew = () => {
        const newGroup = { ...createDefaultOfferGroup(), id: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as QuantityOfferGroup;
        setActiveGroup(newGroup);
    };

    const updateActiveGroup = useCallback((updates: Partial<QuantityOfferGroup>) => {
        if (!activeGroup) return;
        setActiveGroup({ ...activeGroup, ...updates });
    }, [activeGroup]);

    const updateOffer = useCallback((offerId: string, updates: Partial<QuantityOffer>) => {
        if (!activeGroup) return;
        const newOffers = activeGroup.offers.map(o => o.id === offerId ? { ...o, ...updates } : o);
        updateActiveGroup({ offers: newOffers });
    }, [activeGroup, updateActiveGroup]);

    const deleteOffer = useCallback((offerId: string) => {
        if (!activeGroup || activeGroup.offers.length <= 1) return;
        updateActiveGroup({ offers: activeGroup.offers.filter(o => o.id !== offerId) });
        if (editingOfferId === offerId) setEditingOfferId(null);
    }, [activeGroup, updateActiveGroup, editingOfferId]);

    const addOffer = useCallback(() => {
        if (!activeGroup) return;
        const maxQty = Math.max(...activeGroup.offers.map(o => o.quantity));
        const newOffer: QuantityOffer = {
            id: `offer-${Date.now()}`, quantity: maxQty + 1, price: 0, discountPercent: 0,
            label: "", order: activeGroup.offers.length, title: `${maxQty + 1} Units`,
        };
        updateActiveGroup({ offers: [...activeGroup.offers, newOffer] });
    }, [activeGroup, updateActiveGroup]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || !activeGroup || active.id === over.id) return;
        const oldIdx = activeGroup.offers.findIndex(o => o.id === active.id);
        const newIdx = activeGroup.offers.findIndex(o => o.id === over.id);
        updateActiveGroup({ offers: arrayMove(activeGroup.offers, oldIdx, newIdx).map((o, i) => ({ ...o, order: i })) });
    };

    const updateDesign = useCallback((updates: Partial<OfferDesignSettings>) => {
        if (!activeGroup) return;
        updateActiveGroup({ design: { ...activeGroup.design, ...updates } });
    }, [activeGroup, updateActiveGroup]);

    const applyColorPreset = (preset: typeof COLOR_PRESETS[0]) => {
        updateDesign({
            selectedBgColor: preset.bg,
            selectedBorderColor: preset.border,
            selectedTagBgColor: preset.tag,
            selectedTagTextColor: preset.tagText,
            unselectedBgColor: "#ffffff",
            unselectedBorderColor: "#e5e7eb",
        });
    };

    const openProductPicker = async () => {
        try {
            const selection = await shopify.resourcePicker({
                type: 'product',
                multiple: true,
                selectionIds: activeGroup?.productIds?.map(id => ({ id: `gid://shopify/Product/${id}` })) || [],
            });
            if (selection) {
                const productIds = selection.map((p: any) => p.id.replace('gid://shopify/Product/', ''));
                updateActiveGroup({ productIds, selectedProducts: selection });
            }
        } catch (e) { console.log('Picker cancelled'); }
    };

    const handleSave = () => {
        if (!activeGroup) return;
        const formData = new FormData();
        formData.append("action", "save");
        formData.append("offerGroup", JSON.stringify(activeGroup));
        submit(formData, { method: "post" });
    };

    const samplePrice = 2495;

    return (
        <>
            <style>{styles}</style>
            <div className="qo-page">
                {/* Header */}
                <div className="qo-header">
                    <div className="qo-header-left">
                        <button className="btn-back" onClick={() => setActiveGroup(null)}>←</button>
                        <h1>{activeGroup ? activeGroup.name || 'New offer' : 'Quantity Offers'}</h1>
                        {activeGroup && (
                            <div className={`status-toggle ${activeGroup.active ? 'on' : ''}`}
                                onClick={() => updateActiveGroup({ active: !activeGroup.active })}>
                                <div className="toggle-track"><div className="toggle-thumb" /></div>
                                <span>{activeGroup.active ? 'Active' : 'Inactive'}</span>
                            </div>
                        )}
                    </div>
                    <div className="qo-header-right">
                        {activeGroup && (
                            <button className="btn-save" onClick={handleSave} disabled={isSaving}>
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        )}
                    </div>
                </div>

                <div className="qo-body">
                    {/* Builder */}
                    <div className="qo-builder">
                        {activeGroup ? (
                            <>
                                {/* Name Input */}
                                <div className="qo-card">
                                    <div className="field-row">
                                        <label>Name</label>
                                        <input type="text" value={activeGroup.name} placeholder="New offer"
                                            onChange={(e) => updateActiveGroup({ name: e.target.value })} />
                                    </div>
                                </div>

                                {/* Products */}
                                <div className="qo-card">
                                    <div className="card-header-row">
                                        <span>Create offers for these products. ({activeGroup.productIds?.length || 0} selected)</span>
                                    </div>
                                    <button className="btn-product" onClick={openProductPicker}>Change product</button>
                                    {activeGroup.selectedProducts && activeGroup.selectedProducts.length > 0 && (
                                        <div className="product-list">
                                            {activeGroup.selectedProducts.map((p: any) => (
                                                <div key={p.id} className="product-row">
                                                    <div className="product-thumb">🎁</div>
                                                    <div className="product-info">
                                                        <span className="product-name">{p.title}</span>
                                                        <span className="product-id">{p.id.split('/').pop()}</span>
                                                    </div>
                                                    <button onClick={() => updateActiveGroup({
                                                        productIds: activeGroup.productIds.filter((id: string) => id !== p.id.replace('gid://shopify/Product/', '')),
                                                        selectedProducts: activeGroup.selectedProducts?.filter((sp: any) => sp.id !== p.id)
                                                    })}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Tabs */}
                                <div className="qo-tabs">
                                    <button className={activeTab === 'offers' ? 'active' : ''} onClick={() => setActiveTab('offers')}>
                                        ◇ Offers
                                    </button>
                                    <button className={activeTab === 'design' ? 'active' : ''} onClick={() => setActiveTab('design')}>
                                        ✧ Design
                                    </button>
                                </div>

                                {activeTab === 'offers' && (
                                    <div className="qo-card">
                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                            <SortableContext items={activeGroup.offers.map(o => o.id)} strategy={verticalListSortingStrategy}>
                                                <div className="offers-list">
                                                    {activeGroup.offers.map(offer => (
                                                        <SortableOfferItem
                                                            key={offer.id}
                                                            offer={offer}
                                                            isEditing={editingOfferId === offer.id}
                                                            onToggleEdit={(id) => setEditingOfferId(editingOfferId === id ? null : id)}
                                                            onUpdate={updateOffer}
                                                            onDelete={deleteOffer}
                                                        />
                                                    ))}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                        <button className="btn-add-offer" onClick={addOffer}>+ Add offer</button>
                                    </div>
                                )}

                                {activeTab === 'design' && (
                                    <div className="qo-card design-card">
                                        {/* Template Selection */}
                                        <div className="design-section">
                                            <label>Template</label>
                                            <div className="template-grid">
                                                <div className={`template-opt ${activeGroup.design.template === 'classic' ? 'selected' : ''}`}
                                                    onClick={() => updateDesign({ template: 'classic' })}>
                                                    <div className="template-preview classic">
                                                        <div className="t-row"><div className="t-img"></div><div className="t-lines"></div></div>
                                                        <div className="t-row"><div className="t-img"></div><div className="t-lines"></div></div>
                                                    </div>
                                                    <span>Classic</span>
                                                </div>
                                                <div className={`template-opt ${activeGroup.design.template === 'modern' ? 'selected' : ''}`}
                                                    onClick={() => updateDesign({ template: 'modern' })}>
                                                    <div className="template-preview modern">
                                                        <div className="t-row"><div className="t-lines full"></div></div>
                                                        <div className="t-row"><div className="t-lines full"></div></div>
                                                    </div>
                                                    <span>Modern</span>
                                                </div>
                                                <div className={`template-opt ${activeGroup.design.template === 'vertical' ? 'selected' : ''}`}
                                                    onClick={() => updateDesign({ template: 'vertical' })}>
                                                    <div className="template-preview vertical">
                                                        <div className="t-col"><div className="t-img"></div><div className="t-lines"></div></div>
                                                        <div className="t-col"><div className="t-img"></div><div className="t-lines"></div></div>
                                                    </div>
                                                    <span>Vertical</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Placement */}
                                        <div className="design-section">
                                            <label>Show offers in:</label>
                                            <div className="placement-opts">
                                                <label className="radio-opt">
                                                    <input type="radio" name="placement" checked={activeGroup.placement === 'inside_form'}
                                                        onChange={() => updateActiveGroup({ placement: 'inside_form' })} />
                                                    <span>Inside the Form</span>
                                                </label>
                                                <label className="radio-opt">
                                                    <input type="radio" name="placement" checked={activeGroup.placement === 'above_button'}
                                                        onChange={() => updateActiveGroup({ placement: 'above_button' })} />
                                                    <span>Above Buy Button</span>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Color Presets */}
                                        <div className="design-section">
                                            <label>Color Presets</label>
                                            <div className="color-presets">
                                                {COLOR_PRESETS.map(preset => (
                                                    <div key={preset.name} className="preset-swatch"
                                                        style={{ background: `linear-gradient(135deg, ${preset.bg} 50%, ${preset.border} 50%)` }}
                                                        onClick={() => applyColorPreset(preset)}
                                                        title={preset.name} />
                                                ))}
                                            </div>
                                        </div>

                                        {/* Custom Colors */}
                                        <div className="design-section">
                                            <div className="color-row">
                                                <div className="color-field">
                                                    <label>Background color</label>
                                                    <div className="color-input">
                                                        <input type="color" value={activeGroup.design.selectedBgColor}
                                                            onChange={(e) => updateDesign({ selectedBgColor: e.target.value })} />
                                                        <input type="text" value={activeGroup.design.selectedBgColor}
                                                            onChange={(e) => updateDesign({ selectedBgColor: e.target.value })} />
                                                    </div>
                                                </div>
                                                <div className="color-field">
                                                    <label>Border color</label>
                                                    <div className="color-input">
                                                        <input type="color" value={activeGroup.design.selectedBorderColor}
                                                            onChange={(e) => updateDesign({ selectedBorderColor: e.target.value })} />
                                                        <input type="text" value={activeGroup.design.selectedBorderColor}
                                                            onChange={(e) => updateDesign({ selectedBorderColor: e.target.value })} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="color-row">
                                                <div className="color-field">
                                                    <label>Tag color</label>
                                                    <div className="color-input">
                                                        <input type="color" value={activeGroup.design.selectedTagBgColor}
                                                            onChange={(e) => updateDesign({ selectedTagBgColor: e.target.value })} />
                                                        <input type="text" value={activeGroup.design.selectedTagBgColor}
                                                            onChange={(e) => updateDesign({ selectedTagBgColor: e.target.value })} />
                                                    </div>
                                                </div>
                                                <div className="color-field">
                                                    <label>Tag text color</label>
                                                    <div className="color-input">
                                                        <input type="color" value={activeGroup.design.selectedTagTextColor}
                                                            onChange={(e) => updateDesign({ selectedTagTextColor: e.target.value })} />
                                                        <input type="text" value={activeGroup.design.selectedTagTextColor}
                                                            onChange={(e) => updateDesign({ selectedTagTextColor: e.target.value })} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="qo-empty">
                                <h2>Create Quantity Offers</h2>
                                <p>Encourage customers to buy more with volume discounts</p>
                                <button className="btn-create" onClick={handleCreateNew}>+ New Offer</button>
                            </div>
                        )}
                    </div>

                    {/* Live Preview */}
                    <div className="qo-preview">
                        <div className="preview-label">Live preview:</div>
                        <div className="preview-container">
                            <div className="preview-scroll">
                                <div className="preview-header-row">
                                    <span>Please fill in the form to order</span>
                                    <span className="preview-close">×</span>
                                </div>

                                {/* Quantity Offers - Starts here */}
                                {activeGroup && (
                                    <div className={`preview-offers template-${activeGroup.design.template || 'classic'}`}>
                                        {activeGroup.offers.map((offer, i) => {
                                            const total = samplePrice * offer.quantity * (1 - (offer.discountPercent || 0) / 100);
                                            const original = samplePrice * offer.quantity;
                                            const isSelected = offer.preselect || i === 0;
                                            const showImage = activeGroup.design.template !== 'modern';

                                            return (
                                                <div key={offer.id}
                                                    className={`preview-offer ${isSelected ? 'selected' : ''}`}
                                                    style={{
                                                        background: isSelected ? activeGroup.design.selectedBgColor : '#fff',
                                                        borderColor: isSelected ? activeGroup.design.selectedBorderColor : '#e5e7eb',
                                                    }}>
                                                    {showImage && <div className="offer-thumb">🎁</div>}
                                                    <div className="offer-details">
                                                        <div className="offer-qty">{offer.title || `${offer.quantity} Unit${offer.quantity !== 1 ? 's' : ''}`}</div>
                                                        {offer.label && (
                                                            <span className="offer-tag" style={{
                                                                background: offer.tagBgColor || activeGroup.design.selectedTagBgColor,
                                                                color: activeGroup.design.selectedTagTextColor,
                                                            }}>{offer.label || `Save ${offer.discountPercent || 0}%`}</span>
                                                        )}
                                                    </div>
                                                    <div className="offer-pricing">
                                                        {offer.discountPercent ? (
                                                            <span className="offer-original">₹{original.toFixed(0)}</span>
                                                        ) : null}
                                                        <span className="offer-price">₹{total.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Product Selector */}
                                <div className="preview-product-select">
                                    <label>Title</label>
                                    <div className="select-box">
                                        <span>#1</span>
                                        <select disabled><option>Sample Product</option></select>
                                    </div>
                                </div>

                                {/* Summary */}
                                <div className="preview-summary">
                                    <div className="summary-row"><span>Subtotal</span><span>₹{samplePrice.toFixed(2)}</span></div>
                                    <div className="summary-row discount"><span>Discount</span><span>-₹{(samplePrice * 0.1).toFixed(2)}</span></div>
                                    <div className="summary-row"><span>Shipping</span><span>₹{samplePrice.toFixed(2)}</span></div>
                                    <div className="summary-row total"><span>Total</span><span>₹{(samplePrice * 1.9).toFixed(2)}</span></div>
                                </div>

                                {/* Form fields */}
                                <div className="preview-form">
                                    <div className="preview-field"><label>Name *</label><input type="text" disabled placeholder="Enter name" /></div>
                                    <div className="preview-field"><label>Phone *</label><input type="text" disabled placeholder="Enter phone" /></div>
                                    <div className="preview-field"><label>Address *</label><textarea disabled placeholder="Enter address" /></div>
                                </div>

                                {/* Order Button */}
                                <button className="preview-btn" style={{
                                    background: buttonStyles.backgroundColor || primaryColor,
                                    color: buttonStyles.textColor || '#fff',
                                    borderRadius: (buttonStyles.borderRadius || 8) + 'px',
                                }}>
                                    {formSettings?.submit_button_text || 'Place Order (COD)'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

const styles = `
    * { box-sizing: border-box; }
    .qo-page { display: flex; flex-direction: column; min-height: 100vh; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    
    /* Header */
    .qo-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #fff; border-bottom: 1px solid #e5e5e5; }
    .qo-header-left { display: flex; align-items: center; gap: 12px; }
    .qo-header-left h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .btn-back { background: none; border: none; font-size: 18px; cursor: pointer; padding: 4px 8px; }
    .status-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .toggle-track { width: 40px; height: 22px; background: #e5e5e5; border-radius: 11px; position: relative; transition: 0.2s; }
    .status-toggle.on .toggle-track { background: #10b981; }
    .toggle-thumb { width: 18px; height: 18px; background: #fff; border-radius: 50%; position: absolute; top: 2px; left: 2px; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    .status-toggle.on .toggle-thumb { left: 20px; }
    .status-toggle span { font-size: 12px; color: #10b981; background: #d1fae5; padding: 2px 8px; border-radius: 4px; }
    .status-toggle:not(.on) span { color: #6b7280; background: #f3f4f6; }
    .btn-save { background: #1f2937; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .btn-save:disabled { opacity: 0.6; }
    
    /* Body */
    .qo-body { display: grid; grid-template-columns: 1fr 380px; gap: 24px; padding: 24px; flex: 1; }
    
    /* Builder */
    .qo-builder { display: flex; flex-direction: column; gap: 16px; }
    .qo-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
    .field-row { display: flex; align-items: center; gap: 12px; }
    .field-row label { font-size: 14px; font-weight: 500; min-width: 50px; }
    .field-row input { flex: 1; padding: 10px 14px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; }
    .card-header-row { font-size: 13px; color: #374151; margin-bottom: 12px; }
    .btn-product { background: #1f2937; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: pointer; }
    .product-list { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
    .product-row { display: flex; align-items: center; gap: 12px; padding: 10px; background: #f9fafb; border-radius: 8px; }
    .product-thumb { width: 40px; height: 40px; background: #fef3c7; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
    .product-info { flex: 1; }
    .product-name { display: block; font-size: 13px; font-weight: 500; }
    .product-id { font-size: 11px; color: #9ca3af; }
    .product-row button { background: none; border: none; font-size: 18px; color: #9ca3af; cursor: pointer; }
    
    /* Tabs */
    .qo-tabs { display: flex; gap: 4px; }
    .qo-tabs button { flex: 1; padding: 12px; background: #fff; border: 1px solid #e5e7eb; font-size: 13px; cursor: pointer; border-radius: 8px; }
    .qo-tabs button.active { background: #f3f4f6; font-weight: 600; }
    
    /* Offers List */
    .offers-list { display: flex; flex-direction: column; gap: 8px; }
    .offer-item { display: flex; align-items: flex-start; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
    .offer-drag { padding: 16px 8px; color: #9ca3af; cursor: grab; font-size: 16px; letter-spacing: -2px; }
    .offer-main { flex: 1; padding: 12px 16px 12px 0; }
    .offer-collapsed { display: flex; justify-content: space-between; align-items: center; }
    .offer-title { font-size: 14px; font-weight: 500; }
    .offer-actions { display: flex; gap: 8px; }
    .btn-edit, .btn-done { padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; }
    .btn-edit { background: #f3f4f6; border: 1px solid #e5e7eb; color: #374151; }
    .btn-done { background: #1f2937; border: none; color: #fff; }
    .btn-delete-icon { background: #fef2f2; border: 1px solid #fecaca; color: #ef4444; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
    .offer-expanded { }
    .offer-row { display: flex; gap: 12px; margin-bottom: 12px; }
    .offer-field { flex: 1; }
    .offer-field label { display: block; font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .offer-field input, .offer-field select { width: 100%; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; }
    .input-suffix { display: flex; align-items: center; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .input-suffix input { border: none; flex: 1; padding: 8px 10px; }
    .input-suffix span { padding: 0 10px; background: #f9fafb; color: #6b7280; font-size: 12px; }
    .color-input-row { display: flex; gap: 8px; }
    .color-input-row input[type="color"] { width: 36px; height: 36px; border: 1px solid #e5e7eb; border-radius: 6px; cursor: pointer; }
    .color-input-row input[type="text"] { flex: 1; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
    .btn-add-offer { width: 100%; margin-top: 12px; padding: 12px; background: #f9fafb; border: 2px dashed #d1d5db; border-radius: 8px; font-size: 13px; cursor: pointer; }
    
    /* Design Tab */
    .design-card { }
    .design-section { margin-bottom: 20px; }
    .design-section > label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 10px; }
    .template-grid { display: flex; gap: 12px; }
    .template-opt { flex: 1; text-align: center; cursor: pointer; }
    .template-opt.selected .template-preview { border-color: #3b82f6; }
    .template-preview { background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 6px; min-height: 60px; display: flex; flex-direction: column; gap: 6px; }
    .template-preview.classic .t-row, .template-preview.modern .t-row { display: flex; gap: 8px; align-items: center; }
    .template-preview .t-img { width: 20px; height: 20px; background: #d1d5db; border-radius: 4px; }
    .template-preview .t-lines { flex: 1; height: 8px; background: #d1d5db; border-radius: 4px; }
    .template-preview .t-lines.full { width: 100%; }
    .template-preview.vertical { flex-direction: row; }
    .template-preview.vertical .t-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .template-preview.vertical .t-img { width: 24px; height: 24px; }
    .template-preview.vertical .t-lines { width: 100%; height: 6px; }
    .template-opt span { font-size: 12px; color: #6b7280; }
    .placement-opts { display: flex; gap: 20px; }
    .radio-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
    .radio-opt input { width: 16px; height: 16px; }
    .color-presets { display: flex; gap: 8px; flex-wrap: wrap; }
    .preset-swatch { width: 36px; height: 36px; border-radius: 8px; cursor: pointer; border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .preset-swatch:hover { transform: scale(1.1); }
    .color-row { display: flex; gap: 16px; margin-bottom: 12px; }
    .color-field { flex: 1; }
    .color-field label { display: block; font-size: 11px; color: #6b7280; margin-bottom: 6px; }
    .color-input { display: flex; gap: 8px; }
    .color-input input[type="color"] { width: 40px; height: 40px; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; padding: 2px; }
    .color-input input[type="text"] { flex: 1; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; font-family: monospace; }
    
    /* Empty State */
    .qo-empty { text-align: center; padding: 80px 24px; background: #fff; border-radius: 12px; }
    .qo-empty h2 { margin: 0 0 8px; font-size: 20px; }
    .qo-empty p { margin: 0 0 24px; color: #6b7280; }
    .btn-create { background: #1f2937; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    
    /* Preview Panel */
    .qo-preview { position: sticky; top: 24px; }
    .preview-label { font-size: 13px; font-weight: 500; color: #6b7280; margin-bottom: 8px; text-align: center; }
    .preview-container { background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; }
    .preview-scroll { max-height: calc(100vh - 150px); overflow-y: auto; }
    .preview-header-row { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #f3f4f6; }
    .preview-header-row span { font-size: 14px; font-weight: 500; }
    .preview-close { font-size: 20px; color: #9ca3af; cursor: pointer; }
    
    /* Preview Offers */
    .preview-offers { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
    .preview-offers.template-vertical { flex-direction: row; flex-wrap: wrap; }
    .preview-offers.template-vertical .preview-offer { flex: 1; min-width: 120px; flex-direction: column; align-items: center; text-align: center; }
    .preview-offer { display: flex; align-items: center; gap: 12px; padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; cursor: pointer; transition: 0.2s; }
    .preview-offer.selected { border-width: 2px; }
    .offer-thumb { width: 40px; height: 40px; background: #fef3c7; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .offer-details { flex: 1; }
    .offer-qty { font-size: 14px; font-weight: 600; color: #1f2937; }
    .offer-tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-top: 4px; }
    .offer-pricing { text-align: right; }
    .offer-original { display: block; font-size: 11px; color: #9ca3af; text-decoration: line-through; }
    .offer-price { font-size: 16px; font-weight: 700; color: #1f2937; }
    
    /* Product Selector */
    .preview-product-select { padding: 12px 16px; }
    .preview-product-select label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .select-box { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .select-box span { font-size: 12px; color: #6b7280; }
    .select-box select { flex: 1; border: none; background: none; font-size: 13px; }
    
    /* Summary */
    .preview-summary { padding: 12px 16px; border-top: 1px solid #f3f4f6; }
    .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #6b7280; }
    .summary-row.discount span:last-child { color: #10b981; }
    .summary-row.total { font-weight: 600; color: #1f2937; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 6px; }
    
    /* Form */
    .preview-form { padding: 12px 16px; }
    .preview-field { margin-bottom: 12px; }
    .preview-field label { display: block; font-size: 12px; font-weight: 500; color: #374151; margin-bottom: 4px; }
    .preview-field input, .preview-field textarea { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: #fafafa; }
    .preview-field textarea { height: 60px; resize: none; }
    
    /* Button */
    .preview-btn { width: calc(100% - 32px); margin: 0 16px 16px; padding: 14px; font-size: 15px; font-weight: 600; border: none; cursor: pointer; }
`;
