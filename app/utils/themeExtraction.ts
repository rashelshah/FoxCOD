import { AdminApiContext } from "@shopify/shopify-app-remix/server";
import { Session } from "@shopify/shopify-api";
import * as fs from "fs";
import * as path from "path";

export interface ThemeProfile {
  colors: {
    primary?: string;
    background?: string;
    text?: string;
    button?: string;
    buttonText?: string;
    border?: string;
  };
  fonts: {
    heading?: string;
    body?: string;
  };
  styles: {
    borderRadius?: string;
    borderWidth?: string;
    buttonPadding?: string;
    shadow?: string;
    cardStyle?: 'flat' | 'shadow' | 'bordered' | 'glass';
  };
  themeClassification?: string;
  debug?: Record<string, any>;
}

/**
 * Convert Shopify RGB string "R G B" to hex color
 */
function rgbStringToHex(rgb: string): string | null {
  if (!rgb || typeof rgb !== 'string') return null;
  // Strip leading # if already hex
  if (rgb.startsWith('#')) return rgb;
  const parts = rgb.trim().split(/\s+/);
  if (parts.length === 3) {
    const r = parseInt(parts[0]);
    const g = parseInt(parts[1]);
    const b = parseInt(parts[2]);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }
  }
  return null;
}

/**
 * Resolve a color value - handles hex (3/6/8-char), RGB "R G B", rgba(), and returns null if unresolvable
 */
function resolveColor(value: any): string | null {
  if (!value) return null;
  const str = String(value).trim();
  // Already valid 3 or 6-char hex
  if (str.startsWith('#') && (str.length === 4 || str.length === 7)) return str;
  // 8-char hex with alpha (e.g. #000000cf) — strip alpha, use first 7 chars
  if (str.startsWith('#') && str.length === 9) return str.slice(0, 7);
  // 4-char hex with alpha (#abcd) — strip alpha, use first 4 chars
  if (str.startsWith('#') && str.length === 5) return str.slice(0, 4);
  // rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = str.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]);
    const g = parseInt(rgbaMatch[2]);
    const b = parseInt(rgbaMatch[3]);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  // "R G B" space-separated string (used by Dawn)
  const fromRgb = rgbStringToHex(str);
  if (fromRgb) return fromRgb;
  return null;
}

/**
 * Main theme extraction engine using Shopify Asset API
 */
export async function extractThemeSettings(admin: AdminApiContext, session: Session): Promise<ThemeProfile> {
  const profile: ThemeProfile = {
    colors: {},
    fonts: {},
    styles: {},
    debug: {},
  };
  // settings_data.json's "current" section — populated in the LEVEL 1 block
  // below, but also read later in the LEVEL 2/3 CSS-vars block (monochrome
  // theme fallback), which is a separate scope. Declared here so it's still
  // in scope there instead of throwing "current is not defined" — which
  // crashed theme extraction entirely any time a theme's button color came
  // out black/white/same-as-background (a very common case).
  let current: Record<string, any> = {};

  try {
    // 1. Fetch the main theme ID - CORRECT GraphQL query format
    const themesRes = await admin.graphql(`
      query {
        themes(first: 5, roles: [MAIN]) {
          nodes {
            id
            name
            role
          }
        }
      }
    `);
    
    const themesData = await themesRes.json();
    console.log('[ThemeExtraction] themes response:', JSON.stringify(themesData?.data?.themes));
    
    const mainTheme = themesData.data?.themes?.nodes?.[0];
    if (!mainTheme) {
      console.warn('[ThemeExtraction] No main theme found.');
      return profile;
    }

    const themeGid = mainTheme.id;
    const themeId = themeGid.split('/').pop();
    console.log(`[ThemeExtraction] Extracting from theme: ${mainTheme.name} (${themeId})`);
    profile.debug!.themeName = mainTheme.name;
    profile.debug!.themeId = themeId;

    // 2. Fetch config/settings_data.json
    const settingsUrl = `https://${session.shop}/admin/api/2023-10/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`;
    const settingsReq = await fetch(settingsUrl, {
      headers: {
        "X-Shopify-Access-Token": session.accessToken as string,
        "Content-Type": "application/json"
      }
    });
    
    if (!settingsReq.ok) {
      console.warn(`[ThemeExtraction] settings_data.json fetch failed: ${settingsReq.status} ${settingsReq.statusText}`);
    } else {
      const settingsDataRaw = await settingsReq.json();
      const settingsContent = settingsDataRaw?.asset?.value;
      
      if (settingsContent) {
        const parsedSettings = JSON.parse(settingsContent);
        current = parsedSettings.current || {};
        
        const colorKeys = Object.keys(current).filter(k => 
          k.includes('color') || k.includes('colour') || k.includes('accent') || 
          k.includes('primary') || k.includes('button') || k.includes('btn') || k.includes('font') || k.includes('radius')
        );
        console.log('[ThemeExtraction] Color-related settings keys:', colorKeys);
        profile.debug!.settingsKeys = colorKeys;
        // Also log the raw VALUES for the color keys so we can debug
        profile.debug!.settingsValues = Object.fromEntries(colorKeys.map(k => [k, current[k]]));

        // Helper: try a list of key names and return first resolved color
        const tryKeys = (...keys: string[]): string | null => {
          for (const key of keys) {
            if (current[key]) {
              const resolved = resolveColor(current[key]);
              if (resolved) return resolved;
            }
          }
          return null;
        };

        // Smart scan: find any key containing "button"/"btn"/"accent"/"primary"/"cta" 
        // that resolves to a valid color - used as fallback
        const scanForButtonColor = (): string | null => {
          const buttonKeyPatterns = ['button', 'btn', 'cta', 'accent', 'primary', 'highlight'];
          const excludeText = ['text', 'label', 'hover', 'font']; // skip text-color keys in button scan
          for (const key of Object.keys(current)) {
            const lk = key.toLowerCase();
            const isButtonKey = buttonKeyPatterns.some(p => lk.includes(p));
            const isTextKey = excludeText.some(p => lk.includes(p));
            if (isButtonKey && !isTextKey) {
              const resolved = resolveColor(current[key]);
              if (resolved) {
                console.log(`[ThemeExtraction] Found button color via scan: ${key} = ${resolved}`);
                return resolved;
              }
            }
          }
          return null;
        };

        const scanForBgColor = (): string | null => {
          for (const key of Object.keys(current)) {
            const lk = key.toLowerCase();
            if ((lk.includes('bg') || lk.includes('background')) && !lk.includes('button') && !lk.includes('btn')) {
              const resolved = resolveColor(current[key]);
              if (resolved) return resolved;
            }
          }
          return null;
        };

        const scanForTextColor = (): string | null => {
          for (const key of Object.keys(current)) {
            const lk = key.toLowerCase();
            if (lk.includes('text') || lk.includes('body_color') || lk.includes('foreground')) {
              const resolved = resolveColor(current[key]);
              if (resolved && resolved !== '#ffffff') return resolved; // skip pure white text
            }
          }
          return null;
        };

        // LEVEL 1: Extract from settings_data.json - try all known naming patterns
        // Background
        const bg = tryKeys(
          'color_body_bg', 'colors_background_1', 'color_bg', 'color_background_1',
          'background_color', 'color_page_bg', 'background'
        ) || scanForBgColor();

        // Body text
        const text = tryKeys(
          'color_body_text', 'colors_text', 'color_text', 'body_text', 'color_foreground',
          'text_color', 'color_body'
        ) || scanForTextColor();

        // Primary accent / button background
        // Dawn: colors_accent_1. Horizon: color_accent. Others: color_primary
        const accent = tryKeys(
          'colors_accent_1', 'color_accent_1', 'color_accent', 'color_primary',
          'accent_color', 'primary_color', 'color_highlight', 'color_cta'
        );

        // Explicit button color keys (highest priority)
        const btnExplicit = tryKeys(
          'color_button', 'button_color', 'color_btn', 'btn_color',
          'colors_solid_button_labels', 'color_button_bg', 'button_background'
        );

        // Button background = explicit OR accent OR scanned
        const btnBg = btnExplicit || accent || scanForButtonColor();

        // Button text label
        const btnLabel = tryKeys(
          'color_button_text', 'button_text_color', 'colors_background_1', 'color_button_label',
          'btn_text_color'
        ) || '#ffffff';

        // Border
        const border = tryKeys(
          'color_borders', 'colors_outline_button_labels', 'color_border',
          'color_image_borders', 'border_color'
        );

        profile.debug!.resolvedColors = { bg, text, accent, btnExplicit, btnBg, btnLabel, border };
        console.log('[ThemeExtraction] Resolved colors from settings:', profile.debug!.resolvedColors);

        if (bg) profile.colors.background = bg;
        if (text) profile.colors.text = text;
        if (accent) profile.colors.primary = accent;
        if (btnBg) profile.colors.button = btnBg;
        if (btnLabel) profile.colors.buttonText = btnLabel;
        if (border) profile.colors.border = border;

        // LEVEL 1b: Try to extract from modern `color_schemes` object
        if (current.color_schemes && typeof current.color_schemes === 'object') {
          // Find the primary/first scheme (usually scheme-1 or the first key)
          const schemeKeys = Object.keys(current.color_schemes);
          const primarySchemeKey = schemeKeys.find(k => k === 'scheme-1') || schemeKeys[0];
          const primaryScheme = current.color_schemes[primarySchemeKey]?.settings;
          
          if (primaryScheme) {
            const schemeBg = resolveColor(primaryScheme.background) || resolveColor(primaryScheme.background_1);
            const schemeText = resolveColor(primaryScheme.foreground) || resolveColor(primaryScheme.foreground_heading) || resolveColor(primaryScheme.text);
            const schemeBtnBg = resolveColor(primaryScheme.button) || resolveColor(primaryScheme.primary_button_background) || resolveColor(primaryScheme.primary_button) || resolveColor(primaryScheme.primary);
            const schemeBtnText = resolveColor(primaryScheme.button_label) || resolveColor(primaryScheme.primary_button_text) || resolveColor(primaryScheme.primary_button_label) || resolveColor(primaryScheme.primary_foreground);
            const schemeBorder = resolveColor(primaryScheme.input_border_color) || resolveColor(primaryScheme.border) || resolveColor(primaryScheme.secondary_button);

            // color_schemes values are authoritative — override previous flat-key results
            if (schemeBg) profile.colors.background = schemeBg;
            if (schemeText && schemeText !== '#000000cf') profile.colors.text = schemeText;
            if (schemeBtnBg) profile.colors.button = schemeBtnBg;
            if (schemeBtnText) profile.colors.buttonText = schemeBtnText;
            if (schemeBorder) profile.colors.border = schemeBorder;
            // Also set primary to the button color since that's the brand accent
            if (schemeBtnBg) profile.colors.primary = schemeBtnBg;

            // Font from inter_n4 style string → "Inter". Body font key name
            // varies by theme — Dawn/Horizon use type_body_font, others
            // (e.g. Minimog) use type_base_font.
            const bodyFontRaw = current.type_body_font || current.type_base_font;
            const headingFontRaw = current.type_heading_font || current.type_header_font;
            if (bodyFontRaw) profile.fonts.body = extractFontFamily(bodyFontRaw);
            if (headingFontRaw) profile.fonts.heading = extractFontFamily(headingFontRaw);

            // Border radius from scheme settings
            if (current.button_border_radius_primary !== undefined) {
              profile.styles.borderRadius = `${current.button_border_radius_primary}px`;
            }
          }
        }

        // Ride theme radius property
        if (current.buttons_radius !== undefined) {
          profile.styles.borderRadius = `${current.buttons_radius}px`;
        }

        const fallbackBodyFontRaw = current.type_body_font || current.type_base_font;
        const fallbackHeadingFontRaw = current.type_header_font || current.type_heading_font;
        if (fallbackBodyFontRaw) profile.fonts.body = extractFontFamily(fallbackBodyFontRaw);
        if (fallbackHeadingFontRaw) profile.fonts.heading = extractFontFamily(fallbackHeadingFontRaw);

        // Last resort for themes using a key name we don't already know
        // about: scan every settings key for anything shaped like a Shopify
        // font-picker value ("some_slug_n4") whose name suggests body vs
        // heading — same defensive-scanning approach already used above for
        // colors (scanForButtonColor / scanForBgColor / scanForTextColor).
        if (!profile.fonts.body) {
          const scannedBody = scanForFont(current, ['body', 'base', 'paragraph', 'text']);
          if (scannedBody) profile.fonts.body = extractFontFamily(scannedBody);
        }
        if (!profile.fonts.heading) {
          const scannedHeading = scanForFont(current, ['head', 'title']);
          if (scannedHeading) profile.fonts.heading = extractFontFamily(scannedHeading);
        }

        if (current.buttons_radius !== undefined) {
          profile.styles.borderRadius = `${current.buttons_radius}px`;
        }

        // Button border width — try known theme setting keys (Dawn/Horizon/Ride conventions)
        const borderWidthKeys = ['buttons_border_thickness', 'buttons_border_width', 'button_border_width'];
        for (const key of borderWidthKeys) {
          if (current[key] !== undefined) {
            profile.styles.borderWidth = `${current[key]}px`;
            break;
          }
        }
      }
    }

    // LEVEL 2 & 3: Fetch CSS assets to extract CSS variables
    const assetListUrl = `https://${session.shop}/admin/api/2023-10/themes/${themeId}/assets.json`;
    const assetListReq = await fetch(assetListUrl, {
      headers: {
        "X-Shopify-Access-Token": session.accessToken as string,
        "Content-Type": "application/json"
      }
    });
    
    if (assetListReq.ok) {
      const assetList = await assetListReq.json();
      const assets: any[] = assetList?.assets || [];
      const assetKeys = assets.map((a: any) => a.key);
      console.log('[ThemeExtraction] Total assets:', assets.length);
      profile.debug!.cssAssets = assetKeys.filter((k: string) => k.endsWith('.css') || k.endsWith('.css.liquid'));
      
      // Prioritized list of CSS files to try (ordered by likelihood of containing :root vars)
      const priorityCssFiles = [
        'assets/base.css', 'assets/theme.css', 'assets/theme.css.liquid',
        'assets/styles.css', 'assets/global.css', 'assets/main.css',
        'assets/application.css', 'assets/custom.css',
      ];
      // Also include any CSS file found in the theme that isn't in our priority list
      const allCssFiles = [
        ...priorityCssFiles.filter(f => assetKeys.includes(f)),
        ...assetKeys.filter((k: string) => 
          (k.endsWith('.css') || k.endsWith('.css.liquid')) && 
          !priorityCssFiles.includes(k)
        ).slice(0, 3) // Try up to 3 additional CSS files
      ];

      // Aggregate CSS variables from multiple files
      let allRootVars: Record<string, string> = {};
      for (const cssKey of allCssFiles.slice(0, 5)) { // Max 5 files to avoid rate limits
        try {
          const cssUrl = `https://${session.shop}/admin/api/2023-10/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(cssKey)}`;
          const cssReq = await fetch(cssUrl, {
            headers: {
              "X-Shopify-Access-Token": session.accessToken as string,
              "Content-Type": "application/json"
            }
          });
          if (cssReq.ok) {
            const cssData = await cssReq.json();
            const cssContent = cssData?.asset?.value || "";
            const fileVars = extractCssVariables(cssContent);
            const fileVarCount = Object.keys(fileVars).length;
            if (fileVarCount > 0) {
              console.log(`[ThemeExtraction] ${cssKey}: found ${fileVarCount} CSS vars`);
              allRootVars = { ...allRootVars, ...fileVars };
            }
          }
        } catch (e) {
          console.warn(`[ThemeExtraction] Failed to fetch ${cssKey}:`, e);
        }
      }

      profile.debug!.cssVars = Object.keys(allRootVars).slice(0, 50);
      // Show color-related CSS vars for debugging
      profile.debug!.allCssVarValues = Object.fromEntries(
        Object.entries(allRootVars).filter(([k]) => 
          k.includes('color') || k.includes('accent') || k.includes('button') || k.includes('primary') || k.includes('brand')
        ).slice(0, 30)
      );
      
      if (Object.keys(allRootVars).length > 0) {
        // Comprehensive CSS variable name coverage for all major Shopify themes
        const bgVar = 
          allRootVars['--color-base-background-1'] ||  // Dawn
          allRootVars['--color-background'] ||
          allRootVars['--color-body-bg'] ||
          allRootVars['--color-bg'] ||
          allRootVars['--background'] ||
          allRootVars['--page-bg'];
          
        const textVar = 
          allRootVars['--color-base-text'] ||           // Dawn
          allRootVars['--color-text'] ||
          allRootVars['--color-body-text'] ||
          allRootVars['--body-color'] ||
          allRootVars['--text-color'];
          
        const accentVar = 
          allRootVars['--color-base-accent-1'] ||       // Dawn
          allRootVars['--color-accent'] ||
          allRootVars['--color-accent-1'] ||
          allRootVars['--color-primary'] ||
          allRootVars['--accent-color'] ||
          allRootVars['--primary-color'] ||
          allRootVars['--color-highlight'] ||
          allRootVars['--color-brand'] ||
          allRootVars['--brand-color'] ||
          allRootVars['--color-cta'];
          
        // Button background - broad coverage across all themes
        const btnVar = 
          allRootVars['--color-button'] ||              // Horizon, Refresh, Ride
          allRootVars['--color-base-accent-1'] ||       // Dawn
          allRootVars['--button-background'] ||
          allRootVars['--btn-background'] ||
          allRootVars['--color-button-background'] ||
          allRootVars['--color-btn-primary'] ||
          allRootVars['--color-btn-bg'] ||
          allRootVars['--btn-bg-color'] ||
          allRootVars['--color-accent'] ||
          allRootVars['--color-accent-1'] ||
          allRootVars['--color-brand'] ||
          allRootVars['--color-cta'];
          
        const btnTextVar = 
          allRootVars['--color-button-text'] ||         // Horizon, Refresh, Ride
          allRootVars['--color-base-solid-button-labels'] || // Dawn
          allRootVars['--button-text-color'] ||
          allRootVars['--btn-text'] ||
          allRootVars['--color-button-label'] ||
          allRootVars['--color-btn-text'];
          
        const borderVar = 
          allRootVars['--color-base-outline-button-labels'] || // Dawn
          allRootVars['--color-border'] ||
          allRootVars['--color-base-border-1'] ||
          allRootVars['--border-color'] ||
          allRootVars['--color-line'];
        
        if (bgVar && resolveColor(bgVar)) profile.colors.background = resolveColor(bgVar)!;
        if (textVar && resolveColor(textVar)) profile.colors.text = resolveColor(textVar)!;
        if (accentVar && resolveColor(accentVar)) profile.colors.primary = resolveColor(accentVar)!;
        if (btnVar && resolveColor(btnVar)) profile.colors.button = resolveColor(btnVar)!;
        if (btnTextVar && resolveColor(btnTextVar)) profile.colors.buttonText = resolveColor(btnTextVar)!;
        if (borderVar && resolveColor(borderVar)) profile.colors.border = resolveColor(borderVar)!;
        
        // If no button color found, fall back to primary/accent
        if (!profile.colors.button && profile.colors.primary) {
          profile.colors.button = profile.colors.primary;
        }

        // For dark themes: if button color = background color (both black), 
        // For monochrome themes (light or dark): if button color = background color, 
        // or if button is pure black/white, scan ALL CSS vars and ALL settings for the most vibrant non-neutral color
        const btnColor = profile.colors.button;
        const bgColor = profile.colors.background;
        const isBtnSameAsBg = btnColor && bgColor && btnColor.toLowerCase() === bgColor.toLowerCase();
        const isBtnBlack = btnColor && ['#000000', '#000', '#111111', '#0d0d0d', '#111'].includes(btnColor.toLowerCase());
        const isBtnWhite = btnColor && ['#ffffff', '#fff', '#f4f4f4', '#fafafa'].includes(btnColor.toLowerCase());
        
        if (isBtnSameAsBg || isBtnBlack || isBtnWhite) {
          // Collect ALL possible colors from CSS and settings_data.json
          const allColors = [
            ...Object.values(allRootVars),
            ...extractAllColorsFromJson(current)
          ];
          const vibrantColor = findMostVibrantColor(allColors);
          if (vibrantColor) {
            console.log('[ThemeExtraction] Monochrome theme: using vibrant accent as button color:', vibrantColor);
            profile.colors.button = vibrantColor;
            profile.colors.primary = vibrantColor;
            
            // If the button is now vibrant, ensure the text on it is readable (dark text for light buttons, light text for dark buttons)
            // (We could compute contrast, but for now we leave buttonText as is, or default to something readable)
          }
        }
        
        // CSS-var font names are only a fallback for when settings_data.json
        // didn't already resolve one — settings_data.json's value is the
        // theme's own configured picker choice and should win. Overwriting
        // it unconditionally here was also a real bug: extractCssVariables()
        // doesn't evaluate nested var(...) references, so a rule like
        // "--font-body-family: var(--font-primary);" would get captured
        // literally as the string "var(--font-primary)" and clobber a good
        // font with garbage. isPlausibleFontName() rejects that along with
        // generic bare keywords ("sans-serif", "inherit", etc).
        const cssBodyFont = allRootVars['--font-body-family']?.replace(/['"]/g, '').split(',')[0].trim();
        const cssHeadingFont = allRootVars['--font-heading-family']?.replace(/['"]/g, '').split(',')[0].trim();
        if (!profile.fonts.body && cssBodyFont && isPlausibleFontName(cssBodyFont)) profile.fonts.body = cssBodyFont;
        if (!profile.fonts.heading && cssHeadingFont && isPlausibleFontName(cssHeadingFont)) profile.fonts.heading = cssHeadingFont;
        
        const radiusVar = allRootVars['--buttons-radius'] || allRootVars['--border-radius-base'] || allRootVars['--border-radius'] || allRootVars['--radius-button'];
        // Only apply CSS radius if it wasn't already found in settings_data.json
        if (radiusVar && !profile.styles.borderRadius) {
          profile.styles.borderRadius = radiusVar.trim();
        }

        const borderWidthVar = allRootVars['--buttons-border-thickness'] || allRootVars['--buttons-border-width'] || allRootVars['--border-width-button'] || allRootVars['--button-border-width'];
        if (borderWidthVar && !profile.styles.borderWidth) {
          profile.styles.borderWidth = borderWidthVar.trim();
        }

        const paddingVar = allRootVars['--buttons-padding-block'] || allRootVars['--buttons-block-padding'] || allRootVars['--button-padding'];
        if (paddingVar && !profile.styles.buttonPadding) {
          profile.styles.buttonPadding = paddingVar.trim();
        }

        console.log('[ThemeExtraction] Final colors after CSS:', profile.colors);
      }
    }

    // LEVEL 4: Theme Classification
    profile.themeClassification = classifyTheme(profile);
    console.log('[ThemeExtraction] Final profile:', JSON.stringify(profile, null, 2));

  } catch (error: any) {
    console.error("[ThemeExtraction] Error extracting theme settings:", error);
    throw new Error(`Failed to extract theme: ${error.message || error}`);
  }

  try {
    fs.writeFileSync(path.join(process.cwd(), 'theme_debug.json'), JSON.stringify(profile, null, 2));
  } catch (e) {
    console.error("Failed to write debug file", e);
  }

  return profile;
}

/**
 * Rejects CSS custom-property font values that aren't an actual font name —
 * either a generic CSS keyword ("sans-serif", "inherit", ...) or an
 * unresolved var(...) reference our regex-based CSS var scan couldn't
 * evaluate (extractCssVariables only reads literal `--x: value;` pairs, it
 * doesn't resolve nested variable references).
 */
const GENERIC_FONT_KEYWORDS = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'none',
]);
function isPlausibleFontName(name: string): boolean {
  if (!name) return false;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('var(')) return false;
  if (GENERIC_FONT_KEYWORDS.has(normalized)) return false;
  return true;
}

// A Shopify font-picker value: one or more underscore-joined slug words,
// then a trailing style+weight code — "josefin_slab_n7", "inter_n4".
const SHOPIFY_FONT_PICKER_PATTERN = /^[a-z0-9-]+(?:_[a-z0-9-]+)*_[ni]\d$/i;

/**
 * Scans every top-level settings_data.json key for one whose name contains
 * "font" plus one of `keywords` (e.g. "body"/"base" for body copy,
 * "head"/"title" for headings) and whose value looks like an actual
 * Shopify font-picker value — used when none of the theme-family-specific
 * key names we already check (type_body_font, type_base_font, ...) exist,
 * so an unfamiliar theme's font can still usually be found.
 */
function scanForFont(settings: Record<string, any>, keywords: string[]): string | null {
  for (const key of Object.keys(settings)) {
    const lowerKey = key.toLowerCase();
    if (!lowerKey.includes('font')) continue;
    if (!keywords.some(k => lowerKey.includes(k))) continue;
    const value = settings[key];
    if (typeof value === 'string' && SHOPIFY_FONT_PICKER_PATTERN.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

function extractFontFamily(shopifyFontString: string): string {
  if (typeof shopifyFontString !== 'string') return '';
  // Shopify's font-picker values are underscore-joined: a font slug — itself
  // possibly multiple words, e.g. "josefin_slab", "playfair_display",
  // "ibm_plex_mono" — followed by a trailing style+weight suffix like "_n7"
  // (normal 700) or "_i4" (italic 400). Only strip that trailing suffix;
  // taking just the first segment (the old approach) drops words from any
  // multi-word family — "josefin_slab_n7" became "Josefin" instead of the
  // correct "Josefin Slab", and "Josefin" isn't even a real Google Font
  // (only "Josefin Sans"/"Josefin Slab" are), so the font failed to load.
  const parts = shopifyFontString.split('_');
  const lastPart = parts[parts.length - 1];
  const hasStyleWeightSuffix = parts.length > 1 && /^[ni]\d$/.test(lastPart);
  const slugParts = hasStyleWeightSuffix ? parts.slice(0, -1) : parts;
  const slug = slugParts.join(' ').replace(/-/g, ' ');
  // Title-case each word so it matches Google Fonts' naming convention
  // (e.g. "assistant" -> "Assistant", "work sans" -> "Work Sans").
  return slug
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Find the most vibrant/saturated color among an array of color strings.
 * Used as a fallback for dark themes where button color = background = black.
 * Returns the color with the highest HSL saturation that isn't neutral (white/black/grey).
 */
function findMostVibrantColor(colorStrings: string[]): string | null {
  let bestColor: string | null = null;
  let bestSaturation = 0;

  for (const val of colorStrings) {
    const hex = resolveColor(val);
    if (!hex) continue;

    // Skip pure white, near-white, pure black, near-black, greys
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    // Convert to HSL to check saturation
    const max = Math.max(r, g, b) / 255;
    const min = Math.min(r, g, b) / 255;
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

    // Only consider colors with reasonable saturation and lightness
    // (skip neutral greys, pure whites, pure blacks)
    if (s > 0.2 && l > 0.1 && l < 0.95 && s > bestSaturation) {
      bestSaturation = s;
      bestColor = hex;
    }
  }

  return bestColor;
}

function extractAllColorsFromJson(obj: any): string[] {
  const colors = new Set<string>();
  const traverse = (o: any) => {
    if (typeof o === 'string') {
      const hex = resolveColor(o);
      if (hex) colors.add(hex);
    } else if (typeof o === 'object' && o !== null) {
      for (const key of Object.keys(o)) traverse(o[key]);
    }
  };
  traverse(obj);
  return Array.from(colors);
}

function extractCssVariables(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  // Match ANY CSS variable globally (so we catch .color-scheme-1 blocks, not just :root)
  const varRegex = /(--[\w-]+)\s*:\s*([^;}]+)/g;
  let i = 0;
  for (const match of css.matchAll(varRegex)) {
    const key = match[1].trim();
    const value = match[2].trim();
    // Keep a suffixed key so we don't overwrite if redefined (useful for vibrant color scanning)
    vars[`${key}_${i++}`] = value;
    // Also keep the exact key for targeted lookups (last one wins)
    vars[key] = value;
  }
  return vars;
}

function classifyTheme(profile: ThemeProfile): string {
  const isDark = profile.colors.background && isDarkColor(profile.colors.background);
  const isMinimal = !profile.colors.primary || profile.colors.primary === '#000000' || profile.colors.primary === '#121212';
  const hasSerif = profile.fonts.heading && (
    profile.fonts.heading.toLowerCase().includes('playfair') ||
    profile.fonts.heading.toLowerCase().includes('baskerville') ||
    profile.fonts.heading.toLowerCase().includes('serif')
  );
  const isFullyRounded = profile.styles.borderRadius && (
    parseInt(profile.styles.borderRadius) > 40
  );
  
  if (hasSerif && isMinimal) {
    profile.styles.cardStyle = 'bordered';
    return "Luxury";
  } else if (isDark) {
    profile.styles.cardStyle = 'shadow';
    return "Dark Mode";
  } else if (isFullyRounded) {
    profile.styles.cardStyle = 'flat';
    return "Playful";
  } else if (isMinimal) {
    profile.styles.cardStyle = 'bordered';
    return "Minimal";
  } else {
    profile.styles.cardStyle = 'shadow';
    return "Modern";
  }
}

function isDarkColor(color: string): boolean {
  const hex = color.replace('#', '');
  if (hex.length === 3 || hex.length === 6) {
    const r = parseInt(hex.length === 3 ? hex[0]+hex[0] : hex.slice(0, 2), 16);
    const g = parseInt(hex.length === 3 ? hex[1]+hex[1] : hex.slice(2, 4), 16);
    const b = parseInt(hex.length === 3 ? hex[2]+hex[2] : hex.slice(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  }
  return false;
}

/**
 * Color-math helpers shared by every server-side consumer of a ThemeProfile
 * that needs to derive *new* colors from it (payment mode cards, bundle
 * offer cards) rather than just copy extracted values 1:1. Kept here next
 * to the extraction logic so every derived surface uses the same formulas;
 * app.settings.tsx keeps its own client-side copies (that file can't import
 * this module — it pulls in "fs"/"path" for the debug dump above).
 */
function isValidHexColor(hex: any): hex is string {
  return typeof hex === 'string' && /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Mix `weight` (0..1) of hexB into hexA. weight=0 -> hexA, weight=1 -> hexB. */
export function mixHex(hexA: string, hexB: string, weight: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(a.r + (b.r - a.r) * w, a.g + (b.g - a.g) * w, a.b + (b.b - a.b) * w);
}

function darkenHex(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const amt = Math.round(255 * percent / 100);
  return rgbToHex(r - amt, g - amt, b - amt);
}

/** Readable text color for text sitting on top of `bgHex`. */
function pickTextOn(bgHex: string): string {
  return isDarkColor(bgHex) ? '#ffffff' : darkenHex(bgHex, 55);
}

/**
 * Field/input surface that reads as a distinct layer on top of `pageBg`
 * without being a stark, theme-agnostic white — mirrors
 * computeFieldBackground() in app.settings.tsx exactly.
 */
export function computeFieldBackgroundColor(pageBg?: string, accentColor?: string): string {
  if (pageBg && isValidHexColor(pageBg) && isDarkColor(pageBg)) {
    const { r, g, b } = hexToRgb(pageBg);
    const amt = Math.round(255 * 12 / 100);
    return rgbToHex(r + amt, g + amt, b + amt);
  }
  let base = pageBg && isValidHexColor(pageBg) ? mixHex('#FFFFFF', pageBg, 0.08) : '#FFFFFF';
  if (accentColor && isValidHexColor(accentColor)) {
    base = mixHex(base, accentColor, 0.035);
  }
  return base;
}

/**
 * Color/radius fields to merge into every bundle-offer group's `design`
 * object so "Match Store Theme" carries through to the Bundle Offers page —
 * same accent-tint formula as the payment-mode-card and field-background
 * derivations, just targeting the offer-card design keys.
 */
export function deriveOfferDesignColors(profile: ThemeProfile): Record<string, any> | null {
  const accent = profile.colors.button || profile.colors.primary;
  if (!accent || !isValidHexColor(accent)) return null;

  const pageBg = profile.colors.background;
  const text = profile.colors.text;
  const selectedTextColor = (text && isValidHexColor(text) && isDarkColor(text)) ? text : darkenHex(accent, 45);

  const colors: Record<string, any> = {
    selectedBgColor: mixHex('#FFFFFF', accent, 0.10),
    selectedBorderColor: accent,
    selectedTagBgColor: accent,
    selectedTagTextColor: profile.colors.buttonText && isValidHexColor(profile.colors.buttonText)
      ? profile.colors.buttonText
      : pickTextOn(accent),
    selectedTextColor,
    unselectedBgColor: computeFieldBackgroundColor(pageBg, accent),
    unselectedBorderColor: profile.colors.border && isValidHexColor(profile.colors.border) ? profile.colors.border : mixHex('#FFFFFF', accent, 0.25),
  };

  if (profile.styles.borderRadius) {
    const radius = parseInt(profile.styles.borderRadius, 10);
    if (!isNaN(radius)) colors.selectedBorderRadius = radius;
  }

  return colors;
}

/**
 * Single color set applied uniformly across all three Payment Mode cards
 * (Full Prepaid / Partial Payment / Cash on Delivery) — server-side mirror
 * of deriveThemeCardStyle() in app.settings.tsx, used so "Match Store
 * Theme" can persist the match immediately (same immediacy as
 * deriveOfferDesignColors/applyThemeToOfferGroups) instead of requiring a
 * separate Save click.
 */
export function derivePaymentModeCardStyle(profile: ThemeProfile): Record<string, any> | null {
  const accent = profile.colors.button || profile.colors.primary;
  if (!accent || !isValidHexColor(accent)) return null;

  const themeText = profile.colors.text;
  const textColor = (themeText && isValidHexColor(themeText) && isDarkColor(themeText))
    ? themeText
    : darkenHex(accent, 45);
  const iconBg = mixHex('#FFFFFF', accent, 0.16);

  return {
    mode: 'custom',
    cardBackgroundColor: mixHex('#FFFFFF', accent, 0.10),
    borderColor: accent,
    descriptionColor: textColor,
    descriptionBackgroundColor: iconBg,
    textColor,
    iconColor: accent,
    iconBackgroundColor: iconBg,
    tagBackgroundColor: accent,
    tagTextColor: (profile.colors.buttonText && isValidHexColor(profile.colors.buttonText))
      ? profile.colors.buttonText
      : pickTextOn(accent),
  };
}
