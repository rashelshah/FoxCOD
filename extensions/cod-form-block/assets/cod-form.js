/**
 * COD Form JavaScript Handler
 * Replaces Buy buttons with COD buttons and handles form submission
 * Uses Shopify App Proxy for stable API URLs
 * Supports dynamic fields, custom styles, and advanced configuration
 */

(function() {
  'use strict';

  /*
  TEMPORARY APP REVIEW IMPLEMENTATION
  Shopify App Review requires COD orders to use Shopify Checkout.
  Legacy direct order creation flow has been preserved below and can be restored by setting:
  USE_NATIVE_COD_CHECKOUT = false
  */
  const USE_NATIVE_COD_CHECKOUT = true;

  // Ensure FoxCod.pixelTracking always exists
  window.FoxCod = window.FoxCod || {};
  window.FoxCod.pixelTracking = window.FoxCod.pixelTracking || {};

  var isShopifyEditor = !!(
    window.Shopify &&
    (window.Shopify.designMode || window.Shopify.visualPreviewMode)
  );

  if (isShopifyEditor) {
    console.log('FoxlyCOD: Running in Theme Editor (safe mode)');
  }

  // =============================================
  // CENTRAL CURRENCY CONFIGURATION
  // =============================================
  FoxCod.currencyConfig = {
    code: window.FoxCod.currency || 'USD',
  };

  console.log('[FoxCod] Currency:', FoxCod.currencyConfig.code);
  console.log('[FoxCod] Pixel Tracking init:', window.FoxCod.pixelTracking);

  // =============================================
  // PIXEL TRACKING — Script Loader & Event Dispatcher
  // =============================================
  var _pixelsLoaded = false;
  var _activeConfigs = {}; // Global map of COD form configs for event delegation
  var _activeConfigs = {}; // Global map of COD form configs for event delegation

  function loadPixelScripts() {
      if (_pixelsLoaded) return;
      _pixelsLoaded = true;
      var pixels = (window.FoxCod && window.FoxCod.pixelTracking) || {};
      console.log('[FoxCod Pixels] Loading scripts for:', Object.keys(pixels));

      // Facebook Pixel
      if (pixels.facebook && pixels.facebook.pixel_id) {
          (function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', pixels.facebook.pixel_id);
          console.log('[FoxCod Pixels] Facebook pixel loaded:', pixels.facebook.pixel_id);
      }

      // Google Tag (gtag)
      if (pixels.google && pixels.google.pixel_id) {
          var gs = document.createElement('script');
          gs.async = true;
          gs.src = 'https://www.googletagmanager.com/gtag/js?id=' + pixels.google.pixel_id;
          document.head.appendChild(gs);
          window.dataLayer = window.dataLayer || [];
          window.gtag = function() { window.dataLayer.push(arguments); };
          window.gtag('js', new Date());
          window.gtag('config', pixels.google.pixel_id);
          console.log('[FoxCod Pixels] Google tag loaded:', pixels.google.pixel_id);
      }

      // Snapchat Pixel (supports both "snap" and "snapchat" keys)
      var snapConfig = pixels.snapchat || pixels.snap;
      if (snapConfig && snapConfig.pixel_id && snapConfig.enabled !== false) {
          if (window.snaptr) {
              console.log('[FoxCod Pixels] Snapchat already loaded');
          } else {
              (function(e,t,n){
                  if(e.snaptr)return;
                  var a=e.snaptr=function(){
                      a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments);
                  };
                  a.queue=[];
                  var s=t.createElement('script');
                  s.async=true;
                  s.src=n;
                  var u=t.getElementsByTagName('script')[0];
                  u.parentNode.insertBefore(s,u);
              })(window,document,'https://sc-static.net/scevent.min.js');
              snaptr('init', snapConfig.pixel_id);
              console.log('[FoxCod Pixels] Snapchat Pixel initialized:', snapConfig.pixel_id);
          }
      }

      // Pinterest Tag
      if (pixels.pinterest && pixels.pinterest.pixel_id) {
          !function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(
          Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[];n.version="3.0";
          var t=document.createElement("script");t.async=!0;t.src=e;
          var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}
          ("https://s.pinimg.com/ct/core.js");
          pintrk('load', pixels.pinterest.pixel_id);
          pintrk('page');
          console.log('[FoxCod Pixels] Pinterest tag loaded:', pixels.pinterest.pixel_id);
      }

      // Taboola Pixel
      if (pixels.taboola && pixels.taboola.pixel_id) {
          window._tfa = window._tfa || [];
          window._tfa.push({notify: 'event', name: 'page_view', id: pixels.taboola.pixel_id});
          !function(t,f,a,x){if(!document.getElementById(x)){t.async=1;t.src=a;t.id=x;
          f.parentNode.insertBefore(t,f)}}(document.createElement('script'),
          document.getElementsByTagName('script')[0],'//cdn.taboola.com/libtrc/unip/' + pixels.taboola.pixel_id + '/tfa.js','tb_tfa_script');
          console.log('[FoxCod Pixels] Taboola pixel loaded:', pixels.taboola.pixel_id);
      }

      // Kwai Pixel
      if (pixels.kwai && pixels.kwai.pixel_id) {
          var ks = document.createElement('script');
          ks.async = true;
          ks.src = 'https://s1.kwai.net/kos/s101/nlav11187/pixel/events.js';
          document.head.appendChild(ks);
          ks.onload = function() {
              if (window.kwaiq) {
                  kwaiq.load(pixels.kwai.pixel_id);
                  kwaiq.page();
              }
          };
          console.log('[FoxCod Pixels] Kwai pixel loaded:', pixels.kwai.pixel_id);
      }
  }

  function foxCodTrackEvent(eventName, data) {
      var pixels = (window.FoxCod && window.FoxCod.pixelTracking) || {};
      if (!pixels || Object.keys(pixels).length === 0) return;

      console.log('[FoxCod Pixels] Tracking:', eventName, data);

      // Facebook
      if (pixels.facebook && pixels.facebook.enabled && window.fbq) {
          var fbEvent = eventName;
          if (eventName === 'InitiateCheckout') fbEvent = 'InitiateCheckout';
          else if (eventName === 'Purchase') fbEvent = 'Purchase';
          else if (eventName === 'AddToCart') fbEvent = 'AddToCart';
          else if (eventName === 'ViewContent') fbEvent = 'ViewContent';
          else if (eventName === 'AddPaymentInfo') fbEvent = 'AddPaymentInfo';
          try { fbq('track', fbEvent, data); } catch(e) { console.warn('[FoxCod Pixels] FB error:', e); }
      }

      // Google
      if (pixels.google && pixels.google.enabled && window.gtag) {
          var gEvent = eventName.toLowerCase();
          if (eventName === 'InitiateCheckout') gEvent = 'begin_checkout';
          else if (eventName === 'Purchase') gEvent = 'purchase';
          try { gtag('event', gEvent, data); } catch(e) { console.warn('[FoxCod Pixels] GA error:', e); }
      }

      // Snapchat (supports both "snap" and "snapchat" keys)
      var snapConf = pixels.snapchat || pixels.snap;
      if (snapConf && snapConf.enabled && window.snaptr) {
          try {
              if (eventName === 'Purchase') {
                  snaptr('track', 'PURCHASE', {
                      price: data.value || 0,
                      currency: data.currency || (FoxCod.currencyConfig && FoxCod.currencyConfig.code) || 'USD'
                  });
              } else if (eventName === 'InitiateCheckout') {
                  snaptr('track', 'START_CHECKOUT');
              } else if (eventName === 'AddPaymentInfo') {
                  snaptr('track', 'ADD_PAYMENT_INFO');
              } else if (eventName === 'ViewContent') {
                  snaptr('track', 'VIEW_CONTENT');
              }
          } catch(e) { console.warn('[FoxCod Pixels] Snap error:', e); }
      }

      // Pinterest
      if (pixels.pinterest && pixels.pinterest.enabled && window.pintrk) {
          var pinEvent = 'checkout';
          try { pintrk('track', pinEvent, data); } catch(e) { console.warn('[FoxCod Pixels] Pin error:', e); }
      }

      // Taboola
      if (pixels.taboola && pixels.taboola.enabled && window._tfa) {
          var tabEvent = eventName === 'Purchase' ? 'make_purchase' : 'start_checkout';
          try { _tfa.push({notify: 'event', name: tabEvent, id: pixels.taboola.pixel_id}); } catch(e) { console.warn('[FoxCod Pixels] Tab error:', e); }
      }

      // Kwai
      if (pixels.kwai && pixels.kwai.enabled && window.kwaiq) {
          var kwEvent = eventName.charAt(0).toLowerCase() + eventName.slice(1);
          if (eventName === 'InitiateCheckout') kwEvent = 'initiatedCheckout';
          else if (eventName === 'Purchase') kwEvent = 'purchase';
          else if (eventName === 'ViewContent') kwEvent = 'contentView';
          try { kwaiq.track(kwEvent, data); } catch(e) { console.warn('[FoxCod Pixels] Kwai error:', e); }
      }
  }

  // =============================================
  // Load pixel scripts on page load
  // =============================================
  if (!isShopifyEditor) {
      if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', loadPixelScripts);
      } else {
          loadPixelScripts();
      }
  }

  // =============================================
  // GLOBAL STATE & HELPERS
  // =============================================
  window.FoxCod.contextualPrices = {
    loaded: false,
    currencyCode: null,
    prices: {}
  };

  window.FoxCod.resolveActiveMarket = function(form) {
      var countryInfo = window.FoxCod.CountryRestrictionEngine ? window.FoxCod.CountryRestrictionEngine.getCustomerCountry(form) : null;
      var explicitFormCountry = (countryInfo && countryInfo.source === 'form') ? countryInfo.country : null;
      return {
          country:
              explicitFormCountry ||
              (window.Shopify && window.Shopify.country) ||
              (window.Shopify && window.Shopify.routes && window.Shopify.routes.root && window.Shopify.routes.root !== '/' ? window.Shopify.routes.root.replace(/\//g, '').toUpperCase() : null) ||
              window.FOXCOD_IP_COUNTRY ||
              (countryInfo && countryInfo.country),
          currency:
              (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) ||
              (window.FoxCod && window.FoxCod.currencyConfig && window.FoxCod.currencyConfig.code)
      };
  };

  window.FoxCod.fetchContextualPricesForOffers = function(form, config) {
      if (window.FoxCod.contextualPrices.loaded) return Promise.resolve();

      var variantIds = [];
      if (config.upsellOffers) {
          ['tick_upsells', 'click_upsells', 'downsells'].forEach(function(key) {
              if (config.upsellOffers[key]) {
                  config.upsellOffers[key].forEach(function(c) {
                      if (c.offers) {
                          c.offers.forEach(function(o) { 
                              var vid = o.upsell_variant_id || o.variant_id;
                              if (vid) variantIds.push(String(vid)); 
                          });
                      }
                      // Downsell object is flat
                      var downsellVid = c.upsell_variant_id || c.variant_id;
                      if (downsellVid) variantIds.push(String(downsellVid));
                  });
              }
          });
      }
      if (config.quantityOffers && config.quantityOffers.length > 0) {
          config.quantityOffers.forEach(function(group) {
              if (group.offers) {
                  group.offers.forEach(function(o) {
                      if (o.variant_id) variantIds.push(String(o.variant_id));
                  });
              }
          });
      }

      // Filter uniques
      variantIds = variantIds.filter(function(value, index, self) {
          return self.indexOf(value) === index;
      });

      if (variantIds.length === 0) {
          window.FoxCod.contextualPrices.loaded = true;
          return Promise.resolve();
      }

      var activeMarket = window.FoxCod.resolveActiveMarket(form);
      var shopDomain = window.Shopify && window.Shopify.shop;

      return fetch('/apps/fox-cod/api/contextual-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              shop: shopDomain,
              marketCountry: activeMarket.country || 'US',
              variantIds: variantIds
          })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
          if (data && data.success && data.prices) {
              window.FoxCod.contextualPrices.prices = data.prices;
              if (data.currencyCode) {
                  window.FoxCod.contextualPrices.currencyCode = data.currencyCode;
              }
          }
          window.FoxCod.contextualPrices.loaded = true;
      })
      .catch(function(err) {
          console.warn('[FoxCod] Failed to fetch contextual prices:', err);
          window.FoxCod.contextualPrices.loaded = true; // prevent infinite retries
      });
  };

  // =============================================
  // Track ViewContent on page load
  // =============================================
  if (!isShopifyEditor) {
      setTimeout(function() {
          var pixels = (window.FoxCod && window.FoxCod.pixelTracking) || {};
          if (pixels.facebook && pixels.facebook.track_view_content ||
              pixels.google && pixels.google.track_view_content ||
              pixels.kwai && pixels.kwai.track_view_content ||
              (pixels.snapchat || pixels.snap || {}).track_view_content) {
              foxCodTrackEvent('ViewContent', {});
          }
      }, 1000);
  }

  // =============================================
  // COUNTRY RESTRICTION ENGINE
  // =============================================
  window.FoxCod.CountryRestrictionEngine = {
    currentCountry: null,
    currentSource: null,
    ipCountry: null,

    initAsync: function() {
      var self = this;
      if (this.ipCountry) return Promise.resolve(this.ipCountry);
      // Fast Cloudflare IP trace
      return fetch('https://1.1.1.1/cdn-cgi/trace')
        .then(function(res) { return res.text(); })
        .then(function(data) {
          var match = data.match(/loc=([A-Z]{2})/);
          if (match && match[1]) {
            self.ipCountry = match[1];
          }
          return self.ipCountry;
        })
        .catch(function(err) {
          console.warn('[FoxCod] Failed to fetch IP geolocation:', err);
          return null;
        });
    },

    /**
     * Determines the customer's country based on priority:
     * 1. Customer-selected country (if the Country field is enabled)
     * 2. Previously saved country from local storage
     * 3. IP geolocation
     * 4. Shopify localization (window.Shopify.country)
     * 5. Browser locale (navigator.language)
     * 6. Merchant default country
     */
    getCustomerCountry: function(form) {
      var detectedCountry = null;
      var source = 'unknown';

      var countryMap = {
        "AFGHANISTAN":"AF","ALBANIA":"AL","ALGERIA":"DZ","ANDORRA":"AD","ANGOLA":"AO","ARGENTINA":"AR","ARMENIA":"AM","AUSTRALIA":"AU",
        "AUSTRIA":"AT","AZERBAIJAN":"AZ","BAHAMAS":"BS","BAHRAIN":"BH","BANGLADESH":"BD","BARBADOS":"BB","BELARUS":"BY","BELGIUM":"BE",
        "BELIZE":"BZ","BENIN":"BJ","BHUTAN":"BT","BOLIVIA":"BO","BOSNIA":"BA","BOTSWANA":"BW","BRAZIL":"BR","BRUNEI":"BN","BULGARIA":"BG",
        "BURKINA FASO":"BF","BURUNDI":"BI","CAMBODIA":"KH","CAMEROON":"CM","CANADA":"CA","CHAD":"TD","CHILE":"CL","CHINA":"CN","COLOMBIA":"CO",
        "COMOROS":"KM","CONGO":"CG","COSTA RICA":"CR","CROATIA":"HR","CUBA":"CU","CYPRUS":"CY","CZECHIA":"CZ","DENMARK":"DK","DJIBOUTI":"DJ",
        "DOMINICA":"DM","ECUADOR":"EC","EGYPT":"EG","EL SALVADOR":"SV","ERITREA":"ER","ESTONIA":"EE","ESWATINI":"SZ","ETHIOPIA":"ET","FIJI":"FJ",
        "FINLAND":"FI","FRANCE":"FR","GABON":"GA","GAMBIA":"GM","GEORGIA":"GE","GERMANY":"DE","GHANA":"GH","GREECE":"GR","GRENADA":"GD",
        "GUATEMALA":"GT","GUINEA":"GN","GUYANA":"GY","HAITI":"HT","HONDURAS":"HN","HUNGARY":"HU","ICELAND":"IS","INDIA":"IN","INDONESIA":"ID",
        "IRAN":"IR","IRAQ":"IQ","IRELAND":"IE","ISRAEL":"IL","ITALY":"IT","JAMAICA":"JM","JAPAN":"JP","JORDAN":"JO","KAZAKHSTAN":"KZ",
        "KENYA":"KE","KIRIBATI":"KI","KUWAIT":"KW","KYRGYZSTAN":"KG","LAOS":"LA","LATVIA":"LV","LEBANON":"LB","LESOTHO":"LS","LIBERIA":"LR",
        "LIBYA":"LY","LIECHTENSTEIN":"LI","LITHUANIA":"LT","LUXEMBOURG":"LU","MADAGASCAR":"MG","MALAWI":"MW","MALAYSIA":"MY","MALDIVES":"MV",
        "MALI":"ML","MALTA":"MT","MAURITANIA":"MR","MAURITIUS":"MU","MEXICO":"MX","MICRONESIA":"FM","MOLDOVA":"MD","MONACO":"MC","MONGOLIA":"MN",
        "MONTENEGRO":"ME","MOROCCO":"MA","MOZAMBIQUE":"MZ","MYANMAR":"MM","NAMIBIA":"NA","NAURU":"NR","NEPAL":"NP","NETHERLANDS":"NL",
        "NEW ZEALAND":"NZ","NICARAGUA":"NI","NIGER":"NE","NIGERIA":"NG","NORTH KOREA":"KP","NORWAY":"NO","OMAN":"OM","PAKISTAN":"PK",
        "PALAU":"PW","PALESTINE":"PS","PANAMA":"PA","PAPUA NEW GUINEA":"PG","PARAGUAY":"PY","PERU":"PE","PHILIPPINES":"PH","POLAND":"PL",
        "PORTUGAL":"PT","QATAR":"QA","ROMANIA":"RO","RUSSIA":"RU","RWANDA":"RW","SAMOA":"WS","SAN MARINO":"SM","SAUDI ARABIA":"SA","SENEGAL":"SN",
        "SERBIA":"RS","SEYCHELLES":"SC","SIERRA LEONE":"SL","SINGAPORE":"SG","SLOVAKIA":"SK","SLOVENIA":"SI","SOMALIA":"SO","SOUTH AFRICA":"ZA",
        "SOUTH KOREA":"KR","SOUTH SUDAN":"SS","SPAIN":"ES","SRI LANKA":"LK","SUDAN":"SD","SURINAME":"SR","SWEDEN":"SE","SWITZERLAND":"CH",
        "SYRIA":"SY","TAIWAN":"TW","TAJIKISTAN":"TJ","TANZANIA":"TZ","THAILAND":"TH","TOGO":"TG","TONGA":"TO","TRINIDAD AND TOBAGO":"TT",
        "TUNISIA":"TN","TURKEY":"TR","TURKMENISTAN":"TM","TUVALU":"TV","UGANDA":"UG","UKRAINE":"UA","UNITED ARAB EMIRATES":"AE","UAE":"AE",
        "UNITED KINGDOM":"GB","UK":"GB","UNITED STATES":"US","USA":"US","URUGUAY":"UY","UZBEKISTAN":"UZ","VANUATU":"VU","VATICAN CITY":"VA",
        "VENEZUELA":"VE","VIETNAM":"VN","YEMEN":"YE","ZAMBIA":"ZM","ZIMBABWE":"ZW"
      };

      // Priority 1: Customer-selected country
      if (!detectedCountry && form) {
        var countryInput = (typeof findInputByCanonicalKey === 'function' ? findInputByCanonicalKey(form, 'country') : null) || form.querySelector('input[name="country"]') || form.querySelector('select[name="country"]');
        if (countryInput && countryInput.value) {
          var rawVal = countryInput.value.trim().toUpperCase();
          detectedCountry = countryMap[rawVal] || rawVal;
          source = 'form';
        }
      }

      // Priority 2: Previously saved country from local storage
      if (!detectedCountry) {
        try {
          var stored = localStorage.getItem('cod_customer');
          if (stored) {
            var data = JSON.parse(stored);
            if (data && data.country) {
              var rawVal = data.country.trim().toUpperCase();
              detectedCountry = countryMap[rawVal] || rawVal;
              source = 'local_storage';
            }
          }
        } catch(e) {}
      }

      // Priority 3: IP geolocation (resolved via initAsync)
      if (!detectedCountry && this.ipCountry) {
        detectedCountry = this.ipCountry;
        source = 'ip_geolocation';
      }

      // Priority 4: Shopify Window Variable
      if (!detectedCountry) {
        var shopifyCountry = (window.Shopify && window.Shopify.country) || null;
        if (shopifyCountry) {
          detectedCountry = String(shopifyCountry).trim().toUpperCase();
          source = 'shopify';
        }
      }

      // Priority 5: Browser locale
      if (!detectedCountry && typeof navigator !== 'undefined' && navigator.language) {
        var parts = navigator.language.split('-');
        if (parts.length > 1) {
          var loc = parts[1].toUpperCase();
          if (loc.length === 2) {
             detectedCountry = loc;
             source = 'browser_locale';
          }
        }
      }

      // Priority 6: Merchant default country
      if (!detectedCountry && window.FoxCod && window.FoxCod.defaultCountry) {
        detectedCountry = window.FoxCod.defaultCountry.trim().toUpperCase();
        source = 'merchant_default';
      }

      // Final fallback
      if (!detectedCountry) {
        detectedCountry = 'US';
        source = 'fallback';
      }

      this.currentCountry = detectedCountry;
      this.currentSource = source;

      return {
        country: this.currentCountry,
        source: this.currentSource
      };
    },

    isPaymentMethodCountryAllowed: function(paymentMethod, country, settings) {
      var allowed = [];
      var excluded = [];

      var restrictionKey = paymentMethod === 'pure_cod' ? 'full_cod' : paymentMethod;
      if (settings && settings.country_restrictions && settings.country_restrictions[restrictionKey]) {
        var config = settings.country_restrictions[restrictionKey];
        allowed = config.allowedCountries || [];
        excluded = config.excludedCountries || [];
      } else if (paymentMethod === 'partial_payment') {
        // Legacy fallback
        allowed = (settings && settings.allowed_countries) ? settings.allowed_countries : [];
        excluded = (settings && settings.excluded_countries) ? settings.excluded_countries : [];
      }
      
      console.log("[COUNTRY RESTRICTION]", {
        paymentMethod: paymentMethod,
        country: country,
        allowedCountries: allowed,
        excludedCountries: excluded
      });

      if (!country) {
        return true;
      }

      var c = country.toUpperCase();

      // Rule 1: Excluded
      if (excluded.indexOf(c) !== -1) {
        return false;
      }

      // Rule 2 & 3: Allowed
      if (allowed.length > 0) {
        return allowed.indexOf(c) !== -1;
      }

      return true;
    }
  };

  // =============================================
  // LOCATION ENGINE (Countries & States)
  // =============================================
  window.FoxCod.LocationEngine = {
    countries: [],
    statesCache: {},
    loadingStates: {}, // Keep track of pending state promises
    
    getCountries: function(appUrl) {
      var self = this;
      if (this.countries.length > 0) return Promise.resolve(this.countries);
      if (this.loadingCountries) return this.loadingCountries;
      
      var url = appUrl ? (appUrl + '/data/countries.json') : '/apps/fox-cod/data/countries.json';
      this.loadingCountries = fetch(url)
        .then(function(res) {
          if (!res.ok) throw new Error('Network response was not ok');
          return res.json();
        })
        .catch(function(err) {
          if (appUrl) {
            console.warn('[FoxCod] Direct CDN fetch failed for countries, falling back to app proxy:', err);
            return fetch('/apps/fox-cod/data/countries.json').then(function(res) {
                if (!res.ok) throw new Error('Proxy network response was not ok');
                return res.json();
            });
          }
          throw err;
        })
        .then(function(data) {
          self.countries = data;
          return data;
        })
        .catch(function(err) {
          console.error('[FoxCod LocationEngine] Failed to load countries:', err);
          return [];
        });
      return this.loadingCountries;
    },

    getStates: function(appUrl, countryCode) {
      var self = this;
      if (!countryCode) return Promise.resolve([]);
      if (this.statesCache[countryCode]) return Promise.resolve(this.statesCache[countryCode]);
      if (this.loadingStates[countryCode]) return this.loadingStates[countryCode];
      
      var url = appUrl ? (appUrl + '/data/states/' + encodeURIComponent(countryCode) + '.json') : '/apps/fox-cod/data/states/' + encodeURIComponent(countryCode) + '.json';
      this.loadingStates[countryCode] = fetch(url)
        .then(function(res) {
          if (!res.ok) throw new Error('Network response was not ok');
          return res.json();
        })
        .catch(function(err) {
          if (appUrl) {
            console.warn('[FoxCod] Direct CDN fetch failed for states, falling back to app proxy:', err);
            return fetch('/apps/fox-cod/data/states/' + encodeURIComponent(countryCode) + '.json').then(function(res) {
                if (!res.ok) throw new Error('Proxy network response was not ok');
                return res.json();
            });
          }
          throw err;
        })
        .then(function(data) {
          self.statesCache[countryCode] = data;
          return data;
        })
        .catch(function(err) {
          console.error('[FoxCod LocationEngine] Failed to load states for ' + countryCode + ':', err);
          self.statesCache[countryCode] = [];
          return [];
        });
        
      return this.loadingStates[countryCode];
    }
  };

  function initCartPageFlow() {
      var globalRoot = document.querySelector('#fox-cod-root-embed_global') || document.querySelector('[data-fox-cod-root]');
      if (!globalRoot) return;
      var dataContainer = globalRoot.querySelector('.cod-form-data');
      if (!dataContainer) return;
      var enableCartPage = dataContainer.dataset.enableCartPage === 'true';
      if (!enableCartPage) return;

      var debounceTimer;
      var observer = new MutationObserver(function() {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(injectCartButtons, 300);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      injectCartButtons();

      function injectCartButtons() {
          var checkoutBtns = document.querySelectorAll('button[name="checkout"], input[name="checkout"], .cart__checkout-button, .cart-drawer__checkout');
          
          checkoutBtns.forEach(function(btn) {
              if (btn.parentNode.querySelector('.foxcod-cart-button-wrapper')) return;
              
              // Hide standard checkout button as requested
              btn.style.display = 'none';

              var wrapper = document.createElement('div');
              wrapper.className = 'foxcod-cart-button-wrapper';
              wrapper.style.cssText = 'width: 100%; margin-bottom: 10px; display: block; clear: both;';
              
              var codBtn = document.createElement('button');
              codBtn.type = 'button';
              codBtn.className = 'foxcod-block-trigger foxcod-cart-page-btn';
              
              var originalTrigger = globalRoot.querySelector('[data-foxcod-trigger]');
              if (originalTrigger) {
                  codBtn.style.cssText = originalTrigger.style.cssText;
              } else {
                  codBtn.style.cssText = 'width:100%; padding:12px; background:' + (dataContainer.dataset.primaryColor || '#000') + '; color:#fff; border:none; border-radius:4px; font-weight:bold; cursor:pointer;';
              }
              codBtn.style.width = '100%';
              codBtn.textContent = dataContainer.dataset.buttonText || 'Buy Now - Cash on Delivery';
              
              codBtn.addEventListener('click', function(e) {
                  e.preventDefault();
                  e.stopPropagation();
                  
                  codBtn.textContent = 'Loading...';
                  codBtn.disabled = true;
                  fetch(window.Shopify.routes.root + 'cart.js')
                    .then(function(res) { return res.json(); })
                    .then(function(cart) {
                        codBtn.textContent = dataContainer.dataset.buttonText || 'Buy Now - Cash on Delivery';
                        codBtn.disabled = false;
                        if (!cart.items || cart.items.length === 0) {
                            alert('Your cart is empty');
                            return;
                        }
                        
                        var cartItems = cart.items.map(function(item) {
                            return {
                                variantId: 'gid://shopify/ProductVariant/' + item.variant_id,
                                productId: 'gid://shopify/Product/' + item.product_id,
                                title: item.product_title || item.title,
                                price: (item.price / 100).toFixed(2),
                                quantity: item.quantity
                            };
                        });
                        
                        window.FoxCod = window.FoxCod || {};
                        window.FoxCod._cartItems = cartItems;
                        window.FoxCod._orderSource = window.location.pathname.indexOf('/cart') !== -1 ? 'cart_page' : 'cart_drawer';
                        window.FoxCod._pendingCartFlow = true;
                        window.FoxCod._selectedBundleVariants = null;
                        
                        var titleEl = globalRoot.querySelector('.cod-product-title');
                        if (titleEl) titleEl.textContent = 'Cart Order (' + cart.item_count + ' items)';
                        var imgEl = globalRoot.querySelector('.cod-product-image');
                        if (imgEl && cart.items[0].image) imgEl.src = cart.items[0].image;
                        
                        // ── Close the cart drawer before opening the COD form ──
                        // Covers Dawn, Debut, Motion, Impulse, Expanse, and most popular themes
                        (function closeCartDrawer() {
                            try {
                                // 1. Dawn / OS2 themes — cart-drawer custom element
                                var cartDrawerEl = document.querySelector('cart-drawer');
                                if (cartDrawerEl && typeof cartDrawerEl.close === 'function') {
                                    cartDrawerEl.close();
                                }
                                // 2. Click the close button inside common drawer containers
                                var closeSelectors = [
                                    '.cart-drawer__close',
                                    '.cart-drawer .js-drawer-close',
                                    '.cart-drawer [aria-label*="Close"]',
                                    '.drawer--right .js-drawer-close',
                                    '[data-cart-drawer] .drawer__close',
                                    '.js-cart-cart-drawer-close',
                                    'cart-drawer button[aria-label*="Close"]',
                                    'cart-notification button[aria-label*="Close"]'
                                ];
                                closeSelectors.forEach(function(sel) {
                                    var closeBtn = document.querySelector(sel);
                                    if (closeBtn) closeBtn.click();
                                });
                                // 3. Remove open/active class from common drawer wrappers
                                var drawerSelectors = [
                                    '.cart-drawer',
                                    '.cart-notification',
                                    '[data-cart-drawer]',
                                    '#CartDrawer',
                                    '#cart-drawer',
                                    '.drawer--right',
                                    '.js-drawer-open-right'
                                ];
                                drawerSelectors.forEach(function(sel) {
                                    var el = document.querySelector(sel);
                                    if (el) {
                                        el.classList.remove('is-open', 'open', 'active', 'drawer--open', 'js-drawer-open');
                                        el.setAttribute('aria-hidden', 'true');
                                        el.setAttribute('hidden', '');
                                    }
                                });
                                // 4. Remove body classes that keep drawer open
                                document.body.classList.remove('js-drawer-open', 'js-drawer-open-right', 'drawer-open', 'overflow-hidden');
                                // 5. Remove overlay backdrop that may cover content
                                var overlays = document.querySelectorAll('.drawer-backdrop, .js-drawer-overlay, .cart-drawer__overlay');
                                overlays.forEach(function(ov) { ov.style.display = 'none'; ov.classList.remove('is-visible'); });
                            } catch(err) {
                                console.warn('[FoxlyCOD] Could not close cart drawer:', err);
                            }
                        })();
                        
                        // Ensure it's initialized before trying to open
                        if (dataContainer.dataset.foxcodInitialized !== 'true') {
                            initFoxCod(globalRoot, originalTrigger || codBtn);
                        }
                        
                        // ── ALWAYS open the modal directly using the stored config ──
                        // We must NEVER call originalTrigger.click() here because:
                        // - On a product page, originalTrigger is the Buy Now button for that product.
                        // - Clicking it would open the PRODUCT form (not the cart form),
                        //   conflicting with the cart items we just set in window.FoxCod._cartItems.
                        // Instead, we use the config that was registered by initFoxCod on the root element
                        // and call openModal() directly, bypassing the product trigger entirely.
                        setTimeout(function() {
                            var storedConfig = globalRoot._foxcodConfig;
                            if (storedConfig && typeof openModal === 'function') {
                                // Use stored config but ensure the root element reference is current
                                storedConfig.rootElement = globalRoot;
                                openModal('', storedConfig);
                            } else if (typeof openModal === 'function') {
                                // Fallback: build config from dataset attributes
                                console.warn('[FoxlyCOD] No stored config on root, building from dataset');
                                var builtConfig = {
                                    rootElement: globalRoot,
                                    shop: dataContainer.dataset.shop || (window.Shopify && window.Shopify.shop) || '',
                                    proxyUrl: dataContainer.dataset.proxyBase || '/apps/fox-cod',
                                    buttonText: dataContainer.dataset.buttonText || 'Buy Now - Cash on Delivery',
                                    primaryColor: dataContainer.dataset.primaryColor || '#000000',
                                    partialPaymentSettings: (window.FoxCod && window.FoxCod.partialPaymentSettings) || null,
                                    buttonStyles: safeJSONParse(dataContainer.dataset.buttonStyles, {}),
                                    formSubmitButton: safeJSONParse(dataContainer.dataset.formSubmitButton, {}),
                                    fields: safeJSONParse(dataContainer.dataset.fields, {}),
                                    blocks: safeJSONParse(dataContainer.dataset.blocks, {}),
                                    styles: safeJSONParse(dataContainer.dataset.styles, {}),
                                    submitText: dataContainer.dataset.submitText || 'Place Order (COD)',
                                    formType: dataContainer.dataset.formType || 'popup',
                                    modalStyle: dataContainer.dataset.modalStyle || 'glassmorphism',
                                    shellElement: globalRoot.querySelector('[data-foxcod-shell]'),
                                    statusElement: globalRoot.querySelector('[data-foxcod-status]')
                                };
                                openModal('', builtConfig);
                            } else {
                                console.error('[FoxlyCOD] openModal not available; cannot open cart COD form');
                            }
                        }, 150);
                    })
                    .catch(function(err) {
                        console.error('Error fetching cart:', err);
                        codBtn.textContent = dataContainer.dataset.buttonText || 'Buy Now - Cash on Delivery';
                        codBtn.disabled = false;
                    });
              });
              
              wrapper.appendChild(codBtn);
              // Insert ABOVE the checkout button
              btn.parentNode.insertBefore(wrapper, btn);
          });
      }
  }

  function scheduleFoxCodBoot() {
    waitForStableDOM();
    initCartPageFlow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleFoxCodBoot);
  } else {
    scheduleFoxCodBoot();
  }

  if (isShopifyEditor) {
    document.addEventListener('shopify:section:load', scheduleFoxCodBoot);
    document.addEventListener('shopify:section:select', scheduleFoxCodBoot);
    document.addEventListener('shopify:block:select', scheduleFoxCodBoot);
  }

  // Clear checkout state on page load/refresh so form starts fresh
  try { localStorage.removeItem('foxcod_checkout_state'); } catch(e) {}


  /**
   * Helper to decode HTML entities (from Liquid escape filter)
   */
  function decodeHTMLEntities(str) {
    if (!str) return str;
    var txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  /**
   * Helper to parse JSON safely - handles HTML-encoded strings from Liquid
   */
  function safeJSONParse(str, fallback) {
    try {
      if (!str) return fallback;
      // Decode HTML entities that Liquid's escape filter creates
      var decoded = decodeHTMLEntities(str);
      return JSON.parse(decoded);
    } catch (e) {
      console.warn('[COD Form] JSON parse error:', e, 'Original string:', str);
      return fallback;
    }
  }

  /**
   * Normalize config blobs that may arrive as an object, JSON string, or HTML-escaped JSON string.
   */
  function normalizeConfigObject(value, fallback) {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    if (typeof value === 'string') return safeJSONParse(value, fallback);
    return fallback;
  }

  function getButtonIconSvg(buttonStyles) {
    if (!buttonStyles || !buttonStyles.iconType || buttonStyles.iconType === 'none') return null;
    var typ = buttonStyles.iconType;
    if (typ === 'cart') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>';
    if (typ === 'bag') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>';
    if (typ === 'box') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';
    if (typ === 'card') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>';
    if (typ === 'wallet') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path></svg>';
    if (typ === 'checkout') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>';
    if (typ === 'lock') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
    if (typ === 'cart-plus') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path><line x1="11.5" y1="10.5" x2="17.5" y2="10.5"></line><line x1="14.5" y1="7.5" x2="14.5" y2="13.5"></line></svg>';
    if (typ === 'cart-check') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path><path d="M11 11.5l2 2 4-4"></path></svg>';
    if (typ === 'bag-check') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M9 13l2 2 4-4"></path></svg>';
    if (typ === 'basket') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18l-2.4 12.3A2 2 0 0 1 16.65 20H7.35a2 2 0 0 1-1.95-1.7L3 6z"></path><path d="M8 6L12 2l4 4"></path></svg>';
    if (typ === 'cash') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>';
    if (typ === 'truck') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1" ry="1"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>';
    if (typ === 'whatsapp') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>';
    if (typ === 'arrow-right') return '<svg style="width:1.2em;height:1.2em;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
    return null;
  }

  function setButtonContent(buttonEl, label, buttonStyles) {
    var btnIconSvg = getButtonIconSvg(buttonStyles);
    if (btnIconSvg) {
      var iconPos = (buttonStyles && buttonStyles.iconPosition) || 'left';
      var innerContent = '<span style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;">';
      if (iconPos === 'left') innerContent += btnIconSvg;
      innerContent += '<span>' + label + '</span>';
      if (iconPos === 'right') innerContent += btnIconSvg;
      innerContent += '</span>';
      buttonEl.innerHTML = innerContent;
      return;
    }
    buttonEl.textContent = label;
  }


  // ── Embedded SVG background presets (data URIs) ──
  // These are inlined so the storefront never needs to fetch from appUrl
  var BG_PRESET_DATA_URIS = {
    '/bg-presets/1.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiMwMDIyMzMiPjwvcmVjdD48cGF0aCBkPSJNMCA1MjNMMjEuNSA1MDIuOEM0MyA0ODIuNyA4NiA0NDIuMyAxMjguOCA0NDIuM0MxNzEuNyA0NDIuMyAyMTQuMyA0ODIuNyAyNTcuMiA0OTMuN0MzMDAgNTA0LjcgMzQzIDQ4Ni4zIDM4NS44IDQ3My4zQzQyOC43IDQ2MC4zIDQ3MS4zIDQ1Mi43IDUxNC4yIDQzOS44QzU1NyA0MjcgNjAwIDQwOSA2NDIuOCA0MDUuM0M2ODUuNyA0MDEuNyA3MjguMyA0MTIuMyA3NzEuMiA0MzFDODE0IDQ0OS43IDg1NyA0NzYuMyA4NzguNSA0ODkuN0w5MDAgNTAzTDkwMCA2MDFMODc4LjUgNjAxQzg1NyA2MDEgODE0IDYwMSA3NzEuMiA2MDFDNzI4LjMgNjAxIDY4NS43IDYwMSA2NDIuOCA2MDFDNjAwIDYwMSA1NTcgNjAxIDUxNC4yIDYwMUM0NzEuMyA2MDEgNDI4LjcgNjAxIDM4NS44IDYwMUMzNDMgNjAxIDMwMCA2MDEgMjU3LjIgNjAxQzIxNC4zIDYwMSAxNzEuNyA2MDEgMTI4LjggNjAxQzg2IDYwMSA0MyA2MDEgMjEuNSA2MDFMMCA2MDFaIiBmaWxsPSIjMDA2NkZGIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiPjwvcGF0aD48L3N2Zz4=',
    '/bg-presets/2.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHBhdGggZD0iTTAgNjdMMTMuNyA3NkMyNy4zIDg1IDU0LjcgMTAzIDgyIDEwMUMxMDkuMyA5OSAxMzYuNyA3NyAxNjMuOCA4MkMxOTEgODcgMjE4IDExOSAyNDUuMiAxMjBDMjcyLjMgMTIxIDI5OS43IDkxIDMyNyA5MEMzNTQuMyA4OSAzODEuNyAxMTcgNDA5IDEyNkM0MzYuMyAxMzUgNDYzLjcgMTI1IDQ5MSAxMTFDNTE4LjMgOTcgNTQ1LjcgNzkgNTczIDcxQzYwMC4zIDYzIDYyNy43IDY1IDY1NC44IDcwQzY4MiA3NSA3MDkgODMgNzM2LjIgOTFDNzYzLjMgOTkgNzkwLjcgMTA3IDgxOCAxMTJDODQ1LjMgMTE3IDg3Mi43IDExOSA4ODYuMyAxMjBMOTAwIDEyMUw5MDAgMEw4ODYuMyAwQzg3Mi43IDAgODQ1LjMgMCA4MTggMEM3OTAuNyAwIDc2My4zIDAgNzM2LjIgMEM3MDkgMCA2ODIgMCA2NTQuOCAwQzYyNy43IDAgNjAwLjMgMCA1NzMgMEM1NDUuNyAwIDUxOC4zIDAgNDkxIDBDNDYzLjcgMCA0MzYuMyAwIDQwOSAwQzM4MS43IDAgMzU0LjMgMCAzMjcgMEMyOTkuNyAwIDI3Mi4zIDAgMjQ1LjIgMEMyMTggMCAxOTEgMCAxNjMuOCAwQzEzNi43IDAgMTA5LjMgMCA4MiAwQzU0LjcgMCAyNy4zIDAgMTMuNyAwTDAgMFoiIGZpbGw9IiM2MTk4ZmYiPjwvcGF0aD48cGF0aCBkPSJNMCAyODlMMTMuNyAyOTFDMjcuMyAyOTMgNTQuNyAyOTcgODIgMjc5QzEwOS4zIDI2MSAxMzYuNyAyMjEgMTYzLjggMjEyQzE5MSAyMDMgMjE4IDIyNSAyNDUuMiAyNTBDMjcyLjMgMjc1IDI5OS43IDMwMyAzMjcgMzI2QzM1NC4zIDM0OSAzODEuNyAzNjcgNDA5IDM2OUM0MzYuMyAzNzEgNDYzLjcgMzU3IDQ5MSAzNDFDNTE4LjMgMzI1IDU0NS43IDMwNyA1NzMgMjgzQzYwMC4zIDI1OSA2MjcuNyAyMjkgNjU0LjggMjMwQzY4MiAyMzEgNzA5IDI2MyA3MzYuMiAyNjZDNzYzLjMgMjY5IDc5MC43IDI0MyA4MTggMjQxQzg0NS4zIDIzOSA4NzIuNyAyNjEgODg2LjMgMjcyTDkwMCAyODNMOTAwIDExOUw4ODYuMyAxMThDODcyLjcgMTE3IDg0NS4zIDExNSA4MTggMTEwQzc5MC43IDEwNSA3NjMuMyA5NyA3MzYuMiA4OUM3MDkgODEgNjgyIDczIDY1NC44IDY4QzYyNy43IDYzIDYwMC4zIDYxIDU3MyA2OUM1NDUuNyA3NyA1MTguMyA5NSA0OTEgMTA5QzQ2My43IDEyMyA0MzYuMyAxMzMgNDA5IDEyNEMzODEuNyAxMTUgMzU0LjMgODcgMzI3IDg4QzI5OS43IDg5IDI3Mi4zIDExOSAyNDUuMiAxMThDMjE4IDExNyAxOTEgODUgMTYzLjggODBDMTM2LjcgNzUgMTA5LjMgOTcgODIgOTlDNTQuNyAxMDEgMjcuMyA4MyAxMy43IDc0TDAgNjVaIiBmaWxsPSIjM2M4MGZmIj48L3BhdGg+PHBhdGggZD0iTTAgNDMzTDEzLjcgNDQwQzI3LjMgNDQ3IDU0LjcgNDYxIDgyIDQ1NkMxMDkuMyA0NTEgMTM2LjcgNDI3IDE2My44IDQyNkMxOTEgNDI1IDIxOCA0NDcgMjQ1LjIgNDU5QzI3Mi4zIDQ3MSAyOTkuNyA0NzMgMzI3IDQ3NEMzNTQuMyA0NzUgMzgxLjcgNDc1IDQwOSA0NzFDNDM2LjMgNDY3IDQ2My43IDQ1OSA0OTEgNDQ3QzUxOC4zIDQzNSA1NDUuNyA0MTkgNTczIDQwOUM2MDAuMyAzOTkgNjI3LjcgMzk1IDY1NC44IDQwNEM2ODIgNDEzIDcwOSA0MzUgNzM2LjIgNDQwQzc2My4zIDQ0NSA3OTAuNyA0MzMgODE4IDQzMkM4NDUuMyA0MzEgODcyLjcgNDQxIDg4Ni4zIDQ0Nkw5MDAgNDUxTDkwMCAyODFMODg2LjMgMjcwQzg3Mi43IDI1OSA4NDUuMyAyMzcgODE4IDIzOUM3OTAuNyAyNDEgNzYzLjMgMjY3IDczNi4yIDI2NEM3MDkgMjYxIDY4MiAyMjkgNjU0LjggMjI4QzYyNy43IDIyNyA2MDAuMyAyNTcgNTczIDI4MUM1NDUuNyAzMDUgNTE4LjMgMzIzIDQ5MSAzMzlDNDYzLjcgMzU1IDQzNi4zIDM2OSA0MDkgMzY3QzM4MS43IDM2NSAzNTQuMyAzNDcgMzI3IDMyNEMyOTkuNyAzMDEgMjcyLjMgMjczIDI0NS4yIDI0OEMyMTggMjIzIDE5MSAyMDEgMTYzLjggMjEwQzEzNi43IDIxOSAxMDkuMyAyNTkgODIgMjc3QzU0LjcgMjk1IDI3LjMgMjkxIDEzLjcgMjg5TDAgMjg3WiIgZmlsbD0iIzAwNjZmZiI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDU2NUwxMy43IDU2NEMyNy4zIDU2MyA1NC43IDU2MSA4MiA1NTNDMTA5LjMgNTQ1IDEzNi43IDUzMSAxNjMuOCA1MjNDMTkxIDUxNSAyMTggNTEzIDI0NS4yIDUxNUMyNzIuMyA1MTcgMjk5LjcgNTIzIDMyNyA1MjRDMzU0LjMgNTI1IDM4MS43IDUyMSA0MDkgNTI0QzQzNi4zIDUyNyA0NjMuNyA1MzcgNDkxIDUzNkM1MTguMyA1MzUgNTQ1LjcgNTIzIDU3MyA1MTZDNjAwLjMgNTA5IDYyNy43IDUwNyA2NTQuOCA1MDhDNjgyIDUwOSA3MDkgNTEzIDczNi4yIDUxNUM3NjMuMyA1MTcgNzkwLjcgNTE3IDgxOCA1MjFDODQ1LjMgNTI1IDg3Mi43IDUzMyA4ODYuMyA1MzdMOTAwIDU0MUw5MDAgNDQ5TDg4Ni4zIDQ0NEM4NzIuNyA0MzkgODQ1LjMgNDI5IDgxOCA0MzBDNzkwLjcgNDMxIDc2My4zIDQ0MyA3MzYuMiA0MzhDNzA5IDQzMyA2ODIgNDExIDY1NC44IDQwMkM2MjcuNyAzOTMgNjAwLjMgMzk3IDU3MyA0MDdDNTQ1LjcgNDE3IDUxOC4zIDQzMyA0OTEgNDQ1QzQ2My43IDQ1NyA0MzYuMyA0NjUgNDA5IDQ2OUMzODEuNyA0NzMgMzU0LjMgNDczIDMyNyA0NzJDMjk5LjcgNDcxIDI3Mi4zIDQ2OSAyNDUuMiA0NTdDMjE4IDQ0NSAxOTEgNDIzIDE2My44IDQyNEMxMzYuNyA0MjUgMTA5LjMgNDQ5IDgyIDQ1NEM1NC43IDQ1OSAyNy4zIDQ0NSAxMy43IDQzOEwwIDQzMVoiIGZpbGw9IiMwMDU5ZGQiPjwvcGF0aD48cGF0aCBkPSJNMCA2MDFMMTMuNyA2MDFDMjcuMyA2MDEgNTQuNyA2MDEgODIgNjAxQzEwOS4zIDYwMSAxMzYuNyA2MDEgMTYzLjggNjAxQzE5MSA2MDEgMjE4IDYwMSAyNDUuMiA2MDFDMjcyLjMgNjAxIDI5OS43IDYwMSAzMjcgNjAxQzM1NC4zIDYwMSAzODEuNyA2MDEgNDA5IDYwMUM0MzYuMyA2MDEgNDYzLjcgNjAxIDQ5MSA2MDFDNTE4LjMgNjAxIDU0NS43IDYwMSA1NzMgNjAxQzYwMC4zIDYwMSA2MjcuNyA2MDEgNjU0LjggNjAxQzY4MiA2MDEgNzA5IDYwMSA3MzYuMiA2MDFDNzYzLjMgNjAxIDc5MC43IDYwMSA4MTggNjAxQzg0NS4zIDYwMSA4NzIuNyA2MDEgODg2LjMgNjAxTDkwMCA2MDFMOTAwIDUzOUw4ODYuMyA1MzVDODcyLjcgNTMxIDg0NS4zIDUyMyA4MTggNTE5Qzc5MC43IDUxNSA3NjMuMyA1MTUgNzM2LjIgNTEzQzcwOSA1MTEgNjgyIDUwNyA2NTQuOCA1MDZDNjI3LjcgNTA1IDYwMC4zIDUwNyA1NzMgNTE0QzU0NS43IDUyMSA1MTguMyA1MzMgNDkxIDUzNEM0NjMuNyA1MzUgNDM2LjMgNTI1IDQwOSA1MjJDMzgxLjcgNTE5IDM1NC4zIDUyMyAzMjcgNTIyQzI5OS43IDUyMSAyNzIuMyA1MTUgMjQ1LjIgNTEzQzIxOCA1MTEgMTkxIDUxMyAxNjMuOCA1MjFDMTM2LjcgNTI5IDEwOS4zIDU0MyA4MiA1NTFDNTQuNyA1NTkgMjcuMyA1NjEgMTMuNyA1NjJMMCA1NjNaIiBmaWxsPSIjMDA0Y2JiIj48L3BhdGg+PC9zdmc+',
    '/bg-presets/3.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHBhdGggZD0iTTAgNzlMNzUgNzlMNzUgMTE1TDE1MCAxMTVMMTUwIDU1TDIyNSA1NUwyMjUgMTQ1TDMwMCAxNDVMMzAwIDg1TDM3NSA4NUwzNzUgOTdMNDUwIDk3TDQ1MCAxMDNMNTI1IDEwM0w1MjUgMTAzTDYwMCAxMDNMNjAwIDkxTDY3NSA5MUw2NzUgMTAzTDc1MCAxMDNMNzUwIDEzM0w4MjUgMTMzTDgyNSA0OUw5MDAgNDlMOTAwIDExNUw5MDAgMEw5MDAgMEw4MjUgMEw4MjUgMEw3NTAgMEw3NTAgMEw2NzUgMEw2NzUgMEw2MDAgMEw2MDAgMEw1MjUgMEw1MjUgMEw0NTAgMEw0NTAgMEwzNzUgMEwzNzUgMEwzMDAgMEwzMDAgMEwyMjUgMEwyMjUgMEwxNTAgMEwxNTAgMEw3NSAwTDc1IDBMMCAwWiIgZmlsbD0iI2ZhNzI2OCI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDIyM0w3NSAyMjNMNzUgMjQ3TDE1MCAyNDdMMTUwIDI3N0wyMjUgMjc3TDIyNSAzMTNMMzAwIDMxM0wzMDAgMjUzTDM3NSAyNTNMMzc1IDMzMUw0NTAgMzMxTDQ1MCA0MTVMNTI1IDQxNUw1MjUgMzM3TDYwMCAzMzdMNjAwIDMwMUw2NzUgMzAxTDY3NSAyNzdMNzUwIDI3N0w3NTAgMjM1TDgyNSAyMzVMODI1IDMwN0w5MDAgMzA3TDkwMCAzNjFMOTAwIDExM0w5MDAgNDdMODI1IDQ3TDgyNSAxMzFMNzUwIDEzMUw3NTAgMTAxTDY3NSAxMDFMNjc1IDg5TDYwMCA4OUw2MDAgMTAxTDUyNSAxMDFMNTI1IDEwMUw0NTAgMTAxTDQ1MCA5NUwzNzUgOTVMMzc1IDgzTDMwMCA4M0wzMDAgMTQzTDIyNSAxNDNMMjI1IDUzTDE1MCA1M0wxNTAgMTEzTDc1IDExM0w3NSA3N0wwIDc3WiIgZmlsbD0iI2U0NTc2NSI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDQ2M0w3NSA0NjNMNzUgNDUxTDE1MCA0NTFMMTUwIDU0N0wyMjUgNTQ3TDIyNSA1MzVMMzAwIDUzNUwzMDAgNTUzTDM3NSA1NTNMMzc1IDUyM0w0NTAgNTIzTDQ1MCA1MTFMNTI1IDUxMUw1MjUgNDYzTDYwMCA0NjNMNjAwIDU2NUw2NzUgNTY1TDY3NSA1NDFMNzUwIDU0MUw3NTAgNDg3TDgyNSA0ODdMODI1IDQ2OUw5MDAgNDY5TDkwMCA0NjNMOTAwIDM1OUw5MDAgMzA1TDgyNSAzMDVMODI1IDIzM0w3NTAgMjMzTDc1MCAyNzVMNjc1IDI3NUw2NzUgMjk5TDYwMCAyOTlMNjAwIDMzNUw1MjUgMzM1TDUyNSA0MTNMNDUwIDQxM0w0NTAgMzI5TDM3NSAzMjlMMzc1IDI1MUwzMDAgMjUxTDMwMCAzMTFMMjI1IDMxMUwyMjUgMjc1TDE1MCAyNzVMMTUwIDI0NUw3NSAyNDVMNzUgMjIxTDAgMjIxWiIgZmlsbD0iI2NiM2Q2MiI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDYwMUw3NSA2MDFMNzUgNjAxTDE1MCA2MDFMMTUwIDYwMUwyMjUgNjAxTDIyNSA2MDFMMzAwIDYwMUwzMDAgNjAxTDM3NSA2MDFMMzc1IDYwMUw0NTAgNjAxTDQ1MCA2MDFMNTI1IDYwMUw1MjUgNjAxTDYwMCA2MDFMNjAwIDYwMUw2NzUgNjAxTDY3NSA2MDFMNzUwIDYwMUw3NTAgNjAxTDgyNSA2MDFMODI1IDYwMUw5MDAgNjAxTDkwMCA2MDFMOTAwIDQ2MUw5MDAgNDY3TDgyNSA0NjdMODI1IDQ4NUw3NTAgNDg1TDc1MCA1MzlMNjc1IDUzOUw2NzUgNTYzTDYwMCA1NjNMNjAwIDQ2MUw1MjUgNDYxTDUyNSA1MDlMNDUwIDUwOUw0NTAgNTIxTDM3NSA1MjFMMzc1IDU1MUwzMDAgNTUxTDMwMCA1MzNMMjI1IDUzM0wyMjUgNTQ1TDE1MCA1NDVMMTUwIDQ0OUw3NSA0NDlMNzUgNDYxTDAgNDYxWiIgZmlsbD0iI2IwMjM1ZiI+PC9wYXRoPjwvc3ZnPg==',
    '/bg-presets/4.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHBhdGggZD0iTTAgMzdMODIgNzNMMTY0IDkxTDI0NSA2MUwzMjcgNDlMNDA5IDYxTDQ5MSA3M0w1NzMgODVMNjU1IDc5TDczNiA1NUw4MTggMTAzTDkwMCA5MUw5MDAgMEw4MTggMEw3MzYgMEw2NTUgMEw1NzMgMEw0OTEgMEw0MDkgMEwzMjcgMEwyNDUgMEwxNjQgMEw4MiAwTDAgMFoiIGZpbGw9IiMwMGNjOGUiPjwvcGF0aD48cGF0aCBkPSJNMCA4NUw4MiAxNTFMMTY0IDE4MUwyNDUgMTU3TDMyNyAxMDNMNDA5IDEyMUw0OTEgMTU3TDU3MyAxMzNMNjU1IDE5M0w3MzYgMTU3TDgxOCAxNTdMOTAwIDE4N0w5MDAgODlMODE4IDEwMUw3MzYgNTNMNjU1IDc3TDU3MyA4M0w0OTEgNzFMNDA5IDU5TDMyNyA0N0wyNDUgNTlMMTY0IDg5TDgyIDcxTDAgMzVaIiBmaWxsPSIjMDBiOThhIj48L3BhdGg+PHBhdGggZD0iTTAgMzYxTDgyIDMzN0wxNjQgMzc5TDI0NSAzNDlMMzI3IDM2MUw0MDkgMzQzTDQ5MSAzMTlMNTczIDI5NUw2NTUgMzAxTDczNiAzNjdMODE4IDI5NUw5MDAgMzU1TDkwMCAxODVMODE4IDE1NUw3MzYgMTU1TDY1NSAxOTFMNTczIDEzMUw0OTEgMTU1TDQwOSAxMTlMMzI3IDEwMUwyNDUgMTU1TDE2NCAxNzlMODIgMTQ5TDAgODNaIiBmaWxsPSIjMDBhNzg0Ij48L3BhdGg+PHBhdGggZD0iTTAgNDg3TDgyIDUwNUwxNjQgNTExTDI0NSA0NjlMMzI3IDUzNUw0MDkgNTI5TDQ5MSA0NDVMNTczIDUzNUw2NTUgNDY5TDczNiA1NDdMODE4IDUyOUw5MDAgNDY5TDkwMCAzNTNMODE4IDI5M0w3MzYgMzY1TDY1NSAyOTlMNTczIDI5M0w0OTEgMzE3TDQwOSAzNDFMMzI3IDM1OUwyNDUgMzQ3TDE2NCAzNzdMODIgMzM1TDAgMzU5WiIgZmlsbD0iIzAwOTU3YyI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDYwMUw4MiA2MDFMMTY0IDYwMUwyNDUgNjAxTDMyNyA2MDFMNDA5IDYwMUw0OTEgNjAxTDU3MyA2MDFMNjU1IDYwMUw3MzYgNjAxTDgxOCA2MDFMOTAwIDYwMUw5MDAgNDY3TDgxOCA1MjdMNzM2IDU0NUw2NTUgNDY3TDU3MyA1MzNMNDkxIDQ0M0w0MDkgNTI3TDMyNyA1MzNMMjQ1IDQ2N0wxNjQgNTA5TDgyIDUwM0wwIDQ4NVoiIGZpbGw9IiMwMzgzNzMiPjwvcGF0aD48L3N2Zz4=',
    '/bg-presets/5.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiMwMDEyMjAiPjwvcmVjdD48cGF0aCBkPSJNMCAzNTBMMjEuNSAzNjJDNDMgMzc0IDg2IDM5OCAxMjguOCA0MDVDMTcxLjcgNDEyIDIxNC4zIDQwMiAyNTcuMiAzOTRDMzAwIDM4NiAzNDMgMzgwIDM4NS44IDM3Ni41QzQyOC43IDM3MyA0NzEuMyAzNzIgNTE0LjIgMzcwQzU1NyAzNjggNjAwIDM2NSA2NDIuOCAzNzVDNjg1LjcgMzg1IDcyOC4zIDQwOCA3NzEuMiA0MDcuNUM4MTQgNDA3IDg1NyAzODMgODc4LjUgMzcxTDkwMCAzNTlMOTAwIDYwMUw4NzguNSA2MDFDODU3IDYwMSA4MTQgNjAxIDc3MS4yIDYwMUM3MjguMyA2MDEgNjg1LjcgNjAxIDY0Mi44IDYwMUM2MDAgNjAxIDU1NyA2MDEgNTE0LjIgNjAxQzQ3MS4zIDYwMSA0MjguNyA2MDEgMzg1LjggNjAxQzM0MyA2MDEgMzAwIDYwMSAyNTcuMiA2MDFDMjE0LjMgNjAxIDE3MS43IDYwMSAxMjguOCA2MDFDODYgNjAxIDQzIDYwMSAyMS41IDYwMUwwIDYwMVoiIGZpbGw9IiNmYTcyNjgiPjwvcGF0aD48cGF0aCBkPSJNMCA0NTZMMjEuNSA0NDcuM0M0MyA0MzguNyA4NiA0MjEuMyAxMjguOCA0MTIuOEMxNzEuNyA0MDQuMyAyMTQuMyA0MDQuNyAyNTcuMiA0MTMuOEMzMDAgNDIzIDM0MyA0NDEgMzg1LjggNDQwLjJDNDI4LjcgNDM5LjMgNDcxLjMgNDE5LjcgNTE0LjIgNDE5LjhDNTU3IDQyMCA2MDAgNDQwIDY0Mi44IDQ0NS4zQzY4NS43IDQ1MC43IDcyOC4zIDQ0MS4zIDc3MS4yIDQ0NC4zQzgxNCA0NDcuMyA4NTcgNDYyLjcgODc4LjUgNDcwLjNMOTAwIDQ3OEw5MDAgNjAxTDg3OC41IDYwMUM4NTcgNjAxIDgxNCA2MDEgNzcxLjIgNjAxQzcyOC4zIDYwMSA2ODUuNyA2MDEgNjQyLjggNjAxQzYwMCA2MDEgNTU3IDYwMSA1MTQuMiA2MDFDNDcxLjMgNjAxIDQyOC43IDYwMSAzODUuOCA2MDFDMzQzIDYwMSAzMDAgNjAxIDI1Ny4yIDYwMUMyMTQuMyA2MDEgMTcxLjcgNjAxIDEyOC44IDYwMUM4NiA2MDEgNDMgNjAxIDIxLjUgNjAxTDAgNjAxWiIgZmlsbD0iI2VmNWY2NyI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDQ1MUwyMS41IDQ1NUM0MyA0NTkgODYgNDY3IDEyOC44IDQ3My43QzE3MS43IDQ4MC4zIDIxNC4zIDQ4NS43IDI1Ny4yIDQ3OS44QzMwMCA0NzQgMzQzIDQ1NyAzODUuOCA0NTIuMkM0MjguNyA0NDcuMyA0NzEuMyA0NTQuNyA1MTQuMiA0NTVDNTU3IDQ1NS4zIDYwMCA0NDguNyA2NDIuOCA0NDhDNjg1LjcgNDQ3LjMgNzI4LjMgNDUyLjcgNzcxLjIgNDU3QzgxNCA0NjEuMyA4NTcgNDY0LjcgODc4LjUgNDY2LjNMOTAwIDQ2OEw5MDAgNjAxTDg3OC41IDYwMUM4NTcgNjAxIDgxNCA2MDEgNzcxLjIgNjAxQzcyOC4zIDYwMSA2ODUuNyA2MDEgNjQyLjggNjAxQzYwMCA2MDEgNTU3IDYwMSA1MTQuMiA2MDFDNDcxLjMgNjAxIDQyOC43IDYwMSAzODUuOCA2MDFDMzQzIDYwMSAzMDAgNjAxIDI1Ny4yIDYwMUMyMTQuMyA2MDEgMTcxLjcgNjAxIDEyOC44IDYwMUM4NiA2MDEgNDMgNjAxIDIxLjUgNjAxTDAgNjAxWiIgZmlsbD0iI2UzNGM2NyI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDQ4NUwyMS41IDQ4OS41QzQzIDQ5NCA4NiA1MDMgMTI4LjggNTA4LjVDMTcxLjcgNTE0IDIxNC4zIDUxNiAyNTcuMiA1MTQuMkMzMDAgNTEyLjMgMzQzIDUwNi43IDM4NS44IDUwNS44QzQyOC43IDUwNSA0NzEuMyA1MDkgNTE0LjIgNTA2LjdDNTU3IDUwNC4zIDYwMCA0OTUuNyA2NDIuOCA0OTguN0M2ODUuNyA1MDEuNyA3MjguMyA1MTYuMyA3NzEuMiA1MjUuNUM4MTQgNTM0LjcgODU3IDUzOC4zIDg3OC41IDU0MC4yTDkwMCA1NDJMOTAwIDYwMUw4NzguNSA2MDFDODU3IDYwMSA4MTQgNjAxIDc3MS4yIDYwMUM3MjguMyA2MDEgNjg1LjcgNjAxIDY0Mi44IDYwMUM2MDAgNjAxIDU1NyA2MDEgNTE0LjIgNjAxQzQ3MS4zIDYwMSA0MjguNyA2MDEgMzg1LjggNjAxQzM0MyA2MDEgMzAwIDYwMSAyNTcuMiA2MDFDMjE0LjMgNjAxIDE3MS43IDYwMSAxMjguOCA2MDFDODYgNjAxIDQzIDYwMSAyMS41IDYwMUwwIDYwMVoiIGZpbGw9IiNkNTM4NjciPjwvcGF0aD48cGF0aCBkPSJNMCA1NDZMMjEuNSA1NDguM0M0MyA1NTAuNyA4NiA1NTUuMyAxMjguOCA1NTguOEMxNzEuNyA1NjIuMyAyMTQuMyA1NjQuNyAyNTcuMiA1NTguOEMzMDAgNTUzIDM0MyA1MzkgMzg1LjggNTM3LjVDNDI4LjcgNTM2IDQ3MS4zIDU0NyA1MTQuMiA1NDcuN0M1NTcgNTQ4LjMgNjAwIDUzOC43IDY0Mi44IDUzM0M2ODUuNyA1MjcuMyA3MjguMyA1MjUuNyA3NzEuMiA1MjcuOEM4MTQgNTMwIDg1NyA1MzYgODc4LjUgNTM5TDkwMCA1NDJMOTAwIDYwMUw4NzguNSA2MDFDODU3IDYwMSA4MTQgNjAxIDc3MS4yIDYwMUM3MjguMyA2MDEgNjg1LjcgNjAxIDY0Mi44IDYwMUM2MDAgNjAxIDU1NyA2MDEgNTE0LjIgNjAxQzQ3MS4zIDYwMSA0MjguNyA2MDEgMzg1LjggNjAxQzM0MyA2MDEgMzAwIDYwMSAyNTcuMiA2MDFDMjE0LjMgNjAxIDE3MS43IDYwMSAxMjguOCA2MDFDODYgNjAxIDQzIDYwMSAyMS41IDYwMUwwIDYwMVoiIGZpbGw9IiNjNjIzNjgiPjwvcGF0aD48L3N2Zz4=',
    '/bg-presets/6.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiM5MzFDMUMiPjwvcmVjdD48cGF0aCBkPSJNMCAzNTFMMTI5IDM5NEwyNTcgMzk2TDM4NiA0MDVMNTE0IDM1Nkw2NDMgMzUzTDc3MSA0MjdMOTAwIDQwNEw5MDAgNjAxTDc3MSA2MDFMNjQzIDYwMUw1MTQgNjAxTDM4NiA2MDFMMjU3IDYwMUwxMjkgNjAxTDAgNjAxWiIgZmlsbD0iI2Y1NzMwYSI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDQzM0wxMjkgNDQzTDI1NyA0NzlMMzg2IDQyN0w1MTQgNDYyTDY0MyA0MThMNzcxIDQwN0w5MDAgNDAzTDkwMCA2MDFMNzcxIDYwMUw2NDMgNjAxTDUxNCA2MDFMMzg2IDYwMUwyNTcgNjAxTDEyOSA2MDFMMCA2MDFaIiBmaWxsPSIjZGE1YjA5Ij48L3BhdGg+PHBhdGggZD0iTTAgNDQ4TDEyOSA0NTlMMjU3IDUxMEwzODYgNDU1TDUxNCA0NThMNjQzIDUxMEw3NzEgNDg5TDkwMCA0NzBMOTAwIDYwMUw3NzEgNjAxTDY0MyA2MDFMNTE0IDYwMUwzODYgNjAxTDI1NyA2MDFMMTI5IDYwMUwwIDYwMVoiIGZpbGw9IiNiZTQ0MDciPjwvcGF0aD48cGF0aCBkPSJNMCA1MTBMMTI5IDUzOEwyNTcgNTQyTDM4NiA1MjVMNTE0IDQ5OUw2NDMgNTAyTDc3MSA1MDdMOTAwIDUxOUw5MDAgNjAxTDc3MSA2MDFMNjQzIDYwMUw1MTQgNjAxTDM4NiA2MDFMMjU3IDYwMUwxMjkgNjAxTDAgNjAxWiIgZmlsbD0iI2EzMmQwNCI+PC9wYXRoPjxwYXRoIGQ9Ik0wIDU1OEwxMjkgNTY0TDI1NyA1NDZMMzg2IDUyN0w1MTQgNTUyTDY0MyA1MzBMNzcxIDU3Mkw5MDAgNTM4TDkwMCA2MDFMNzcxIDYwMUw2NDMgNjAxTDUxNCA2MDFMMzg2IDYwMUwyNTcgNjAxTDEyOSA2MDFMMCA2MDFaIiBmaWxsPSIjODcxNDAwIj48L3BhdGg+PC9zdmc+',
    '/bg-presets/7.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHJlY3Qgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNjNWU1ZmYiPjwvcmVjdD48Zz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg4MjcgMjM1KSI+PHBhdGggZD0iTTAgLTE0N0wxMjcuMyAtNzMuNUwxMjcuMyA3My41TDAgMTQ3TC0xMjcuMyA3My41TC0xMjcuMyAtNzMuNVoiIGZpbGw9IiM3ZWM2ZTciPjwvcGF0aD48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNzI3IDU1OCkiPjxwYXRoIGQ9Ik0wIC03OUw2OC40IC0zOS41TDY4LjQgMzkuNUwwIDc5TC02OC40IDM5LjVMLTY4LjQgLTM5LjVaIiBmaWxsPSIjN2VjNmU3Ij48L3BhdGg+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKDIzOCA1MDUpIj48cGF0aCBkPSJNMCAtOTlMODUuNyAtNDkuNUw4NS43IDQ5LjVMMCA5OUwtODUuNyA0OS41TC04NS43IC00OS41WiIgZmlsbD0iIzdlYzZlNyI+PC9wYXRoPjwvZz48L2c+PC9zdmc+',
    '/bg-presets/8.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHJlY3Qgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNkM2RlODAiPjwvcmVjdD48Zz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NDEgMjI2KSI+PHBhdGggZD0iTTcwLjYgLTI0LjdDNzggLTAuMiA2MS4yIDMwLjQgMzYuMyA0OEMxMS41IDY1LjUgLTIxLjMgNzAgLTQzLjIgNTUuMUMtNjUuMSA0MC4yIC03Ni4xIDYgLTY3LjEgLTIwLjhDLTU4LjEgLTQ3LjUgLTI5IC02Ni43IDEuMyAtNjcuMUMzMS42IC02Ny41IDYzLjIgLTQ5LjIgNzAuNiAtMjQuN1oiIHN0cm9rZT0iI0Y3NzYwRSIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIyMCI+PC9wYXRoPjwvZz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgxOTQgNTAwKSI+PHBhdGggZD0iTTQ1LjEgLTE1LjNDNTAuNyAyLjcgNDIuMyAyNC43IDI2LjcgMzUuOEMxMS4xIDQ2LjkgLTExLjYgNDcuMSAtMjYuMSAzNi41Qy00MC41IDI1LjkgLTQ2LjYgNC40IC00MC44IC0xMy44Qy0zNS4xIC0zMiAtMTcuNiAtNDYuOSAxLjEgLTQ3LjNDMTkuNyAtNDcuNiAzOS40IC0zMy40IDQ1LjEgLTE1LjNaIiBzdHJva2U9IiNGNzc2MEUiIGZpbGw9Im5vbmUiIHN0cm9rZS13aWR0aD0iMjAiPjwvcGF0aD48L2c+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNzg0IDU2MCkiPjxwYXRoIGQ9Ik00My4yIC0xNC4xQzQ4LjcgMi43IDQwLjcgMjMuOSAyNS45IDM0LjJDMTEuMiA0NC42IC0xMC4zIDQ0LjIgLTI0LjEgMzRDLTM3LjkgMjMuOCAtNDQgMy44IC0zOC42IC0xMi45Qy0zMy4zIC0yOS41IC0xNi43IC00Mi43IDEuMSAtNDMuMUMxOC45IC00My40IDM3LjggLTMwLjkgNDMuMiAtMTQuMVoiIHN0cm9rZT0iI0Y3NzYwRSIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIyMCI+PC9wYXRoPjwvZz48L2c+PC9zdmc+',
    '/bg-presets/9.svg': 'data:image/svg+xml;base64,PHN2ZyBpZD0idmlzdWFsIiB2aWV3Qm94PSIwIDAgOTAwIDYwMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHZlcnNpb249IjEuMSI+PHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjkwMCIgaGVpZ2h0PSI2MDAiIGZpbGw9IiNlMWQ3NDkiPjwvcmVjdD48cGF0aCBkPSJNMCA1MTFMMTI5IDQ4NEwyNTcgNTIwTDM4NiAzOTJMNTE0IDQwN0w2NDMgMzk5TDc3MSA1MjRMOTAwIDQwOCIgZmlsbD0ibm9uZSIgc3Ryb2tlLWxpbmVjYXA9InNxdWFyZSIgc3Ryb2tlLWxpbmVqb2luPSJiZXZlbCIgc3Ryb2tlPSIjMDA2NkZGIiBzdHJva2Utd2lkdGg9IjQwIj48L3BhdGg+PC9zdmc+'
  };

  /** Resolve a bg-preset path to an inline data URI, or fall back to appUrl */
  function resolveBgPreset(path, appUrl) {
    if (!path) return '';
    if (BG_PRESET_DATA_URIS[path]) return BG_PRESET_DATA_URIS[path];
    if (path.startsWith('/') && appUrl) return appUrl + path;
    return path;
  }

  function findFoxCodRoot(element) {
    return element && element.closest ? element.closest('[data-fox-cod-root]') : null;
  }

  function getScopedDomId(prefix, config) {
    return prefix + '-' + ((config && config.blockId) || (config && config.productId) || '');
  }

  function getModalContainer(config) {
    var id = getScopedDomId('cod-form', config);
    var el = document.getElementById(id);
    if (el) return el;
    if (config && config.rootElement) {
      return config.rootElement.querySelector('.cod-form-container.cod-modal');
    }
    return null;
  }

  function getModalOverlay(config) {
    var id = getScopedDomId('cod-modal-overlay', config);
    var el = document.getElementById(id);
    if (el) return el;
    if (config && config.rootElement) {
      return config.rootElement.querySelector('.cod-modal-overlay');
    }
    return null;
  }

  function getOrderFormElement(config) {
    var id = getScopedDomId('cod-order-form', config);
    var el = document.getElementById(id);
    if (el) return el;
    if (config && config.rootElement) {
      return config.rootElement.querySelector('.cod-order-form');
    }
    return document.querySelector('.cod-order-form');
  }

  function setBlockStatus(config, message, tone) {
    if (!config || !config.statusElement) return;
    if (!message) {
      config.statusElement.hidden = true;
      config.statusElement.textContent = '';
      config.statusElement.removeAttribute('data-tone');
      return;
    }
    config.statusElement.hidden = false;
    config.statusElement.textContent = message;
    config.statusElement.setAttribute('data-tone', tone || 'info');
    config.statusElement.style.display = 'block';
  }

  function isElementRenderable(element) {
    if (!element || !element.isConnected) return false;

    var computedStyle = window.getComputedStyle(element);
    if (
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      parseFloat(computedStyle.opacity || '1') === 0
    ) {
      return false;
    }

    return element.getClientRects().length > 0;
  }

  function applyFoxCodButtonState(buttonEl, config, state) {
    if (!buttonEl || !config) return;

    var isLoading = !!(state && state.loading);
    var isDisabled = !!(state && state.disabled);
    var buttonText = (state && state.buttonText) || (isDisabled ? 'Out of Stock' : (config.buttonText || 'Buy Now - Cash on Delivery'));

    if (isDisabled) {
      buttonEl.textContent = buttonText;
    } else {
      setButtonContent(buttonEl, buttonText, config.buttonStyles);
    }

    buttonEl.disabled = isDisabled;
    buttonEl.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    buttonEl.setAttribute('aria-disabled', isDisabled ? 'true' : 'false');

    applySubmitButtonStyles(buttonEl, config, { forceProductButtonStyle: true });

    if (isDisabled) {
      buttonEl.style.setProperty('background', '#9ca3af', 'important');
      buttonEl.style.setProperty('background-color', '#9ca3af', 'important');
      buttonEl.style.setProperty('background-image', 'none', 'important');
      buttonEl.style.setProperty('border', 'none', 'important');
      buttonEl.style.setProperty('color', '#ffffff', 'important');
      buttonEl.style.setProperty('box-shadow', 'none', 'important');
      buttonEl.style.setProperty('opacity', '1', 'important');
      buttonEl.style.setProperty('cursor', 'not-allowed', 'important');
      buttonEl.style.setProperty('pointer-events', 'none', 'important');
      buttonEl.style.setProperty('filter', 'grayscale(1)', 'important');
      return;
    }

    buttonEl.style.setProperty('opacity', '1', 'important');
    buttonEl.style.setProperty('cursor', 'pointer', 'important');
    buttonEl.style.setProperty('pointer-events', 'auto', 'important');
    buttonEl.style.setProperty('filter', 'none', 'important');
  }

  function syncFoxCodButtons(config) {
    if (!config) return;

    var buttonState = {
      loading: false,
      disabled: !!config._isSoldOut,
      buttonText: config._isSoldOut ? 'Out of Stock' : (config.buttonText || 'Buy Now - Cash on Delivery')
    };

    if (config.triggerElement) {
      applyFoxCodButtonState(config.triggerElement, config, buttonState);
    }

    if (config._stickyButton && config._stickyButton.isConnected) {
      config._stickyButton.className = 'foxcod-block-trigger cod-buy-btn sticky-mobile ' + getButtonAnimationClasses(config);
      config._stickyButton.dataset.codOpen = config.productId;
      applyFoxCodButtonState(config._stickyButton, config, buttonState);
    }
  }

  function ensureStickyButton(productId, config) {
    if (!config || !config.rootElement || !config.triggerElement || isShopifyEditor) return;

    if (!config.stickyOnMobile) {
      if (config._stickyButton && config._stickyButton.parentNode) {
        config._stickyButton.parentNode.removeChild(config._stickyButton);
      }
      config._stickyButton = null;
      return;
    }

    var stickyBtn = config._stickyButton;
    if (!stickyBtn || !stickyBtn.isConnected) {
      stickyBtn = config.triggerElement.cloneNode(true);
      stickyBtn.className = 'foxcod-block-trigger cod-buy-btn sticky-mobile ' + getButtonAnimationClasses(config);
      stickyBtn.dataset.codOpen = productId;
      stickyBtn.setAttribute('aria-hidden', 'true');
      stickyBtn.style.setProperty('display', 'none', 'important');
      stickyBtn.addEventListener('click', function(e) {
        if (stickyBtn.disabled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        openModal(productId, config);
      });
      document.body.appendChild(stickyBtn);
      config._stickyButton = stickyBtn;
    }

    function hideStickyButton() {
      stickyBtn.classList.remove('visible');
      stickyBtn.style.setProperty('display', 'none', 'important');
      stickyBtn.setAttribute('aria-hidden', 'true');
    }

    function showStickyButton() {
      stickyBtn.style.removeProperty('display');
      stickyBtn.classList.add('visible');
      stickyBtn.setAttribute('aria-hidden', 'false');
    }

    function updateStickyVisibility() {
      if (!config._stickyButton || !config._stickyButton.isConnected) return;
      if (stickyBtn.getAttribute('data-hidden-by-modal') === 'true') return;

      if (window.innerWidth > 600) {
        hideStickyButton();
        return;
      }

      var isOutOfViewport = false;
      if (!isElementRenderable(config.triggerElement)) {
        isOutOfViewport = false;
      } else {
        var rect = config.triggerElement.getBoundingClientRect();
        // Ensure the element is actually taking up space (not hidden via layout tricks)
        var isHiddenByLayout = rect.width === 0 && rect.height === 0;
        // Only show sticky button if we've scrolled PAST the original button (it's above the viewport)
        isOutOfViewport = !isHiddenByLayout && rect.bottom < 0;
      }

      if (isOutOfViewport) {
        showStickyButton();
      } else {
        hideStickyButton();
      }
    }

    stickyBtn._updateVisibility = updateStickyVisibility;

    syncFoxCodButtons(config);

    if (!config._stickyVisibilityHandler) {
      config._stickyVisibilityHandler = function() {
        if (config._stickyButton && typeof config._stickyButton._updateVisibility === 'function') {
          config._stickyButton._updateVisibility();
        }
      };
      window.addEventListener('scroll', config._stickyVisibilityHandler, { passive: true });
      window.addEventListener('resize', config._stickyVisibilityHandler);
      window.addEventListener('orientationchange', config._stickyVisibilityHandler);
      window.addEventListener('load', config._stickyVisibilityHandler);
    }

    if (!config._stickyIntersectionObserver && typeof IntersectionObserver === 'function') {
      config._stickyIntersectionObserver = new IntersectionObserver(function() {
        config._stickyVisibilityHandler();
      }, {
        threshold: [0, 0.01, 0.99, 1]
      });
      config._stickyIntersectionObserver.observe(config.triggerElement);
    }

    if (!config._stickyResizeObserver && typeof ResizeObserver === 'function') {
      config._stickyResizeObserver = new ResizeObserver(function() {
        config._stickyVisibilityHandler();
      });
      config._stickyResizeObserver.observe(config.triggerElement);
    }

    updateStickyVisibility();
    requestAnimationFrame(updateStickyVisibility);
  }

  function setFormMessage(form, type, message) {
    if (!form) return;
    var successBox = form.querySelector('.cod-message-success');
    var errorBox = form.querySelector('.cod-message-error');
    if (successBox) successBox.style.display = 'none';
    if (errorBox) errorBox.style.display = 'none';

    var target = type === 'success' ? successBox : errorBox;
    if (!target) return;

    var textNode = target.querySelector('.cod-message-text');
    if (textNode) textNode.textContent = message;
    target.style.display = 'flex';
  }

  async function safeFetch(url, options) {
    try {
      var response = await fetch(url, options || {});
      if (!response.ok) {
        var contentType = response.headers.get('content-type') || '';
        var errorMessage = 'Request failed (status ' + response.status + ')';
        if (contentType.indexOf('application/json') !== -1) {
          try {
            var errorBody = await response.json();
            // If the server returned success:true despite HTTP error, treat as success
            if (errorBody && errorBody.success === true) return errorBody;
            errorMessage = (errorBody && (errorBody.error || errorBody.message)) || errorMessage;
          } catch (e) { /* ignore parse error */ }
        } else {
          try {
            var textBody = await response.text();
            if (textBody && textBody.length < 200) errorMessage = textBody;
          } catch (e) { /* ignore */ }
        }
        var serverError = new Error(errorMessage);
        serverError._isServerError = true;
        throw serverError;
      }
      return await response.json();
    } catch (error) {
      if (error && error._isServerError) throw error;
      console.warn('FoxlyCOD fetch failed (network):', error);
      return null;
    }
  }

  function requestProxyJson(config, path, options) {
    return safeFetch((config.proxyUrl || '/apps/fox-cod') + path, options).then(function(data) {
      if (!data) {
        throw new Error('Failed to reach the Foxly COD service. Please try again.');
      }
      return data;
    });
  }

  function ensureValidationStyles() {
    if (!document.getElementById('foxcod-validation-css')) {
      var valStyle = document.createElement('style');
      valStyle.id = 'foxcod-validation-css';
      valStyle.textContent = [
        '.foxcod-error{border:2px solid #d82c0d!important;background-color:#fff5f5!important;transition:border 0.2s ease,background-color 0.2s ease}',
        '@keyframes foxcodShake{0%{transform:translateX(0)}15%{transform:translateX(-6px)}30%{transform:translateX(6px)}45%{transform:translateX(-5px)}60%{transform:translateX(5px)}75%{transform:translateX(-3px)}90%{transform:translateX(3px)}100%{transform:translateX(0)}}',
        '.foxcod-shake{animation:foxcodShake 0.4s ease!important}',
        '.foxcod-error-text{color:#d82c0d;font-size:13px;margin-top:4px;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'
      ].join('');
      document.head.appendChild(valStyle);
    }
  }

  function hideNativeBuyButtons(root, config) {
    if (!root || !root.closest) return;

    // Search broadly — buy buttons may be in a different DOM branch than our root
    var productSection = document.querySelector('product-info') ||
                         root.closest('.shopify-section') ||
                         root.closest('section, product-info, .product, .product__info') ||
                         document;
    if (!productSection) return;

    var showAddToCart = !!(config && config.buttonStyles && config.buttonStyles.showAddToCart);
    var selectors = [
      '.shopify-payment-button',
      '.shopify-payment-button__button'
    ];

    if (!showAddToCart) {
      selectors.push('button[name="add"]', '.product-form__submit');
    }

    selectors.forEach(function(selector) {
      productSection.querySelectorAll(selector).forEach(function(element) {
        if (element.closest('[data-fox-cod-root]')) return;
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('opacity', '0', 'important');
      });
    });
  }

  function restoreStickyButtonsAfterModal(config) {
    if (!config || !config.rootElement) return;

    config.rootElement.querySelectorAll('.cod-buy-btn.sticky-mobile').forEach(function(btn) {
      btn.removeAttribute('data-hidden-by-modal');
      btn.style.removeProperty('display');

      if (typeof btn._updateVisibility === 'function') {
        btn._updateVisibility();
        requestAnimationFrame(function() {
          btn._updateVisibility();
        });
      }
    });
  }

  function hideMainTriggerDuringModal(config) {
    if (!config || !config.rootElement) return;

    config.rootElement.querySelectorAll('.foxcod-block-trigger').forEach(function(btn) {
      if (!btn || !btn.isConnected) return;
      btn.setAttribute('data-hidden-by-modal', 'true');
      btn.style.setProperty('visibility', 'hidden', 'important');
      btn.style.setProperty('opacity', '0', 'important');
      btn.style.setProperty('pointer-events', 'none', 'important');
    });
  }

  function restoreMainTriggerAfterModal(config) {
    if (!config || !config.rootElement) return;

    config.rootElement.querySelectorAll('.foxcod-block-trigger').forEach(function(btn) {
      if (!btn || !btn.isConnected) return;
      btn.removeAttribute('data-hidden-by-modal');
      btn.style.removeProperty('visibility');
      btn.style.removeProperty('opacity');
      btn.style.removeProperty('pointer-events');
    });
  }

  function restoreTriggersAfterModal(config) {
    if (!config) return;
    restoreMainTriggerAfterModal(config);
    restoreStickyButtonsAfterModal(config);
    syncFoxCodButtons(config);
  }

  function hideSuccessModal(config) {
    var modal = getModalContainer(config);
    var overlay = getModalOverlay(config);

    if (modal) {
      modal.classList.remove('visible');
      modal.style.display = 'none';
    }

    if (overlay) {
      overlay.style.display = 'none';
    }

    document.body.style.overflow = '';
  }

  function validateOrderPayload(payload) {
    // For cart page / cart drawer flow, cart_items replaces the single variantId
    var hasCartItems = Array.isArray(payload.cart_items) && payload.cart_items.length > 0;
    if (!hasCartItems && !payload.variantId) throw new Error('Missing variant_id');
    if (!payload.customerPhone || !String(payload.customerPhone).trim()) throw new Error('Phone required');
    if (!payload.customerName || !String(payload.customerName).trim()) throw new Error('Name required');
  }

  function createOrderWithRetry(config, payload, retries) {
    var remainingRetries = typeof retries === 'number' ? retries : 2;

    if (remainingRetries === (typeof retries === 'number' ? retries : 2)) {
      console.log('[FOXCOD FRONTEND ORDER]', {
        price: payload.price,
        totalPrice: payload.finalTotal,
        selectedVariantId: payload.variantId,
        marketCountry: payload.detectedCountry,
        currency: payload.currency,
        codFee: payload.codFeeAmount,
        shippingProtection: payload.shippingProtection
      });
    }

    return requestProxyJson(config, '/api/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(function(err) {
      if (remainingRetries > 0) {
        return createOrderWithRetry(config, payload, remainingRetries - 1);
      }
      throw err;
    });
  }

  function pollForFinalOrderName(config, pollingOrderId, fallbackOrderId, onResolved) {
    var attempts = 0;
    var intervalId = setInterval(function() {
      attempts++;
      if (attempts > 6) {
        clearInterval(intervalId);
        if (typeof onResolved === 'function' && fallbackOrderId) {
          onResolved(fallbackOrderId);
        }
        return;
      }

      requestProxyJson(config, '/api/get-order-status?orderId=' + pollingOrderId)
        .then(function(statusData) {
          if (statusData.success && statusData.order && statusData.order.shopify_order_name) {
            clearInterval(intervalId);
            if (typeof onResolved === 'function') {
              onResolved(statusData.order.shopify_order_name);
            }
          } else if (fallbackOrderId) {
            if (typeof onResolved === 'function') {
              onResolved(fallbackOrderId);
            }
          }
        })
        .catch(function(err) {
          console.warn('[COD Form] Poll error:', err.message);
        });
    }, 300);
  }

  function handleOrderSuccess(config, form, submitBtn, originalBtnText, result) {
    if (!config || config._orderPlaced) return;

    config._orderPlaced = true;
    config._isSubmitting = false;

    try { localStorage.removeItem('foxcod_checkout_state'); } catch (e) {}

    // ── Disable buttons immediately to prevent double-submission ──
    if (config.triggerElement) {
      config.triggerElement.disabled = true;
      config.triggerElement.setAttribute('aria-busy', 'false');
    }
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    // ── Redirect to Shopify native Order Status page ──
    var orderStatusUrl = result && result.orderStatusUrl;

    if (orderStatusUrl) {
      // Primary path: use Shopify-provided order_status_url
      window.location.replace(orderStatusUrl);
      return;
    }

    // ── Fallback: build a Shopify order status URL from available data ──
    var shopifyOrderId = result && (result.shopifyOrderId || result.orderId);
    var shopDomain = (config && config.shop) || (window.Shopify && window.Shopify.shop);

    if (shopifyOrderId && shopDomain) {
      var fallbackUrl = 'https://' + shopDomain + '/account/orders/' + shopifyOrderId;
      console.warn('[COD] No order_status_url from Shopify. Using fallback:', fallbackUrl);
      window.location.replace(fallbackUrl);
      return;
    }

    // ── Last resort fallback: redirect to homepage so customer is never stuck ──
    console.warn('[COD] No order status URL available. Redirecting to homepage.');
    window.location.replace('/');
  }

  function mountBlockRoot(productId, config, state) {
    if (!config || !config.triggerElement) return;

    var trigger = config.triggerElement;
    var isLoading = !!(state && state.loading);
    var buttonText = (state && state.buttonText) || (config._isSoldOut ? 'Out of Stock' : (config.buttonText || 'Buy Now - Cash on Delivery'));
    var isDisabled = !!((state && state.disabled) || config._isSoldOut);

    trigger.type = 'button';
    trigger.className = 'foxcod-block-trigger cod-buy-btn ' + getButtonAnimationClasses(config);
    trigger.dataset.codOpen = productId;
    trigger.style.width = '100%';
    trigger.style.margin = '0';

    if (isShopifyEditor) {
      applyFoxCodButtonState(trigger, config, { loading: isLoading, disabled: isDisabled, buttonText: buttonText });
      return;
    }

    if (!trigger.dataset.foxcodBound) {
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openModal(productId, config);
      });
      trigger.dataset.foxcodBound = 'true';
    }

    applyFoxCodButtonState(trigger, config, { loading: isLoading, disabled: isDisabled, buttonText: buttonText });
    ensureStickyButton(productId, config);
  }

  function hydratePublicSettings(config) {
    if (!config || !config.shop) return;

    requestProxyJson(config, '/api/settings?shop=' + encodeURIComponent(config.shop))
      .then(function(result) {
        var settings = result && result.settings ? result.settings : {};

        if (settings.enabled === false) {
          console.log('[COD Form] COD is disabled globally. Hiding block and restoring original checkout buttons.');
          config.rootElement.style.setProperty('display', 'none', 'important');
          config.rootElement.querySelectorAll('.cod-buy-btn.sticky-mobile').forEach(function(btn) {
            btn.style.setProperty('display', 'none', 'important');
          });
          // Also hide the injected wrapper if button was moved
          if (config.rootElement._foxcodInjectedWrapper) {
            config.rootElement._foxcodInjectedWrapper.style.setProperty('display', 'none', 'important');
          }
          var productSection = document.querySelector('product-info') ||
                               config.rootElement.closest('.shopify-section') ||
                               config.rootElement.closest('section, product-info, .product, .product__info') ||
                               document;
          if (productSection) {
            var selectors = ['.shopify-payment-button', '.shopify-payment-button__button', 'button[name="add"]', '.product-form__submit'];
            selectors.forEach(function(selector) {
              productSection.querySelectorAll(selector).forEach(function(element) {
                element.style.removeProperty('display');
                element.style.removeProperty('visibility');
                element.style.removeProperty('opacity');
              });
            });
          }
          return;
        }

        if (settings.button_text) config.buttonText = settings.button_text;
        var needsButtonStylesHydration = !config.hasLiquidButtonStyles ||
          !config.buttonStyles ||
          (!config.buttonStyles.buttonStyle && !!settings.button_style) ||
          (!config.buttonStyles.buttonSize && !!settings.button_size);
        if (needsButtonStylesHydration && settings.button_styles && typeof settings.button_styles === 'object') {
          config.buttonStyles = Object.assign({}, config.buttonStyles || {}, settings.button_styles);
          if (settings.button_styles.backgroundColor) {
            config.primaryColor = settings.button_styles.backgroundColor;
          }
        }
        if (!config.hasLiquidPrimaryColor && settings.primary_color && !(config.buttonStyles && config.buttonStyles.backgroundColor)) {
          config.primaryColor = settings.primary_color;
        }
        if (((!config.hasLiquidButtonStyle) || !(config.buttonStyles && config.buttonStyles.buttonStyle)) && settings.button_style) {
          config.buttonStyle = settings.button_style;
        }
        if (((!config.hasLiquidButtonSize) || !(config.buttonStyles && config.buttonStyles.buttonSize)) && settings.button_size) {
          config.buttonSize = settings.button_size;
        }
        if (settings.max_quantity) config.maxQuantity = parseInt(settings.max_quantity, 10) || config.maxQuantity;

        // If the modal happens to be open (e.g. fast clicker before settings loaded), force a UI sync
        try {
            var form = getOrderFormElement(config);
            var modal = getModalContainer(config);
            if (modal && modal.style.display !== 'none' && form) {
                renderPaymentMethodOptions(form, config);
                var submitBtn = form.querySelector('.cod-submit-btn');
                if (submitBtn) applySubmitButtonStyles(submitBtn, config);
            }
        } catch(e) {
            console.error('[COD Form] Error syncing UI after settings load:', e);
        }

        mountBlockRoot(config.productId, config, { loading: false, disabled: !!config._isSoldOut });
        setBlockStatus(config, '', 'info');
      })
      .catch(function(error) {
        console.warn('[COD Form] Settings fetch failed, using Liquid fallback:', error.message);
        mountBlockRoot(config.productId, config, { loading: false, disabled: !!config._isSoldOut });
        setBlockStatus(config, 'COD is ready. Live settings could not be refreshed, so fallback settings are being used.', 'warning');
      });
  }

  /**
   * Inject the COD trigger button directly at the buy buttons position.
   * Searches the ENTIRE document (not scoped to a section) because in many
   * Shopify themes (like Horizon), the buy buttons are inside a nested
   * "Details" block group while our COD block is at the section level —
   * completely different DOM branches.
   */
  function injectCodButtonAtBuyPosition(rootElement) {
    if (!rootElement || !rootElement.isConnected) return;
    if (rootElement.dataset.foxcodInjected === 'true') return;
    
    // Do not inject the product page buy button if there's no product context (e.g. global cart block)
    var dataContainer = rootElement.querySelector('.cod-form-data');
    if (!dataContainer || !dataContainer.dataset.productId) return;

    var buyTarget = null;

    // ── Strategy 1: <product-form> custom element (Dawn, Horizon, most OS2 themes) ──
    var productForms = document.querySelectorAll('product-form');
    for (var i = 0; i < productForms.length; i++) {
      if (!productForms[i].closest('[data-fox-cod-root]')) {
        buyTarget = productForms[i];
        break;
      }
    }

    // ── Strategy 2: .product-form__buttons wrapper ──
    if (!buyTarget) {
      var formBtns = document.querySelectorAll('.product-form__buttons');
      for (var i = 0; i < formBtns.length; i++) {
        if (!formBtns[i].closest('[data-fox-cod-root]')) {
          buyTarget = formBtns[i];
          break;
        }
      }
    }

    // ── Strategy 3: form[action="/cart/add"] ──
    if (!buyTarget) {
      var cartForms = document.querySelectorAll('form[action="/cart/add"], form[action*="/cart/add"]');
      for (var i = 0; i < cartForms.length; i++) {
        if (!cartForms[i].closest('[data-fox-cod-root]')) {
          buyTarget = cartForms[i];
          break;
        }
      }
    }

    // ── Strategy 4: button[name="add"] or .product-form__submit — use its parent ──
    if (!buyTarget) {
      var addBtns = document.querySelectorAll('button[name="add"], .product-form__submit');
      for (var i = 0; i < addBtns.length; i++) {
        if (!addBtns[i].closest('[data-fox-cod-root]')) {
          buyTarget = addBtns[i].closest('form') || addBtns[i].closest('.product-form__buttons') || addBtns[i].parentElement;
          break;
        }
      }
    }

    // ── Strategy 5: .shopify-payment-button parent ──
    if (!buyTarget) {
      var payBtns = document.querySelectorAll('.shopify-payment-button');
      for (var i = 0; i < payBtns.length; i++) {
        if (!payBtns[i].closest('[data-fox-cod-root]')) {
          buyTarget = payBtns[i].closest('form') || payBtns[i].parentElement;
          break;
        }
      }
    }

    // ── Strategy 6: Text-based search for any "Add to cart" / "Buy" button ──
    if (!buyTarget) {
      var allBtns = document.querySelectorAll('button, input[type="submit"]');
      for (var i = 0; i < allBtns.length; i++) {
        var txt = (allBtns[i].textContent || allBtns[i].value || '').toLowerCase().trim();
        if ((txt.indexOf('add to cart') !== -1 || txt === 'buy it now' || txt === 'buy now') &&
            !allBtns[i].closest('[data-fox-cod-root]')) {
          buyTarget = allBtns[i].closest('form') || allBtns[i].parentElement;
          break;
        }
      }
    }

    if (!buyTarget) {
      console.warn('[FoxlyCOD] Could not find buy buttons anywhere on the page. COD button stays at block position.');
      return;
    }

    console.log('[FoxlyCOD] Found buy buttons target:', buyTarget.tagName, buyTarget.className || '');

    // Get the shell element (contains trigger button + status text)
    var shell = rootElement.querySelector('[data-foxcod-shell]');
    if (!shell) return;

    // Create wrapper for the injected button
    var wrapper = document.createElement('div');
    wrapper.className = 'foxcod-injected-wrapper';
    wrapper.setAttribute('data-foxcod-injected-for', rootElement.id || 'cod-root');
    wrapper.style.cssText = 'width:100%;margin-top:10px;box-sizing:border-box;';

    // Move the shell into the wrapper
    wrapper.appendChild(shell);

    // Insert right after the buy buttons target
    if (buyTarget.nextSibling) {
      buyTarget.parentNode.insertBefore(wrapper, buyTarget.nextSibling);
    } else {
      buyTarget.parentNode.appendChild(wrapper);
    }

    // Hide the original block root completely
    rootElement.style.cssText += ';display:none!important;height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:none!important;visibility:hidden!important;position:absolute!important;pointer-events:none!important;';

    // Store reference so rest of the code can find the shell/trigger
    rootElement._foxcodInjectedWrapper = wrapper;
    rootElement.dataset.foxcodInjected = 'true';
    console.log('[FoxlyCOD] ✅ COD button injected at buy buttons position successfully.');
  }

  function initFoxCodSafe() {
    ensureValidationStyles();

    var roots = document.querySelectorAll('[data-fox-cod-root]');

    if (!roots.length) {
      console.warn('FoxlyCOD: No roots found');
      return false;
    }

    var hasStableRoot = false;

    roots.forEach(function(rootElement) {
      if (!rootElement.isConnected) {
        console.warn('FoxlyCOD: Root not attached yet');
        return;
      }

      hasStableRoot = true;

      // ALWAYS inject COD button at the buy buttons position
      // This works in both theme editor and live storefront
      injectCodButtonAtBuyPosition(rootElement);

      // Find trigger — check injected wrapper first (shell was moved there)
      var trigger = null;
      if (rootElement._foxcodInjectedWrapper) {
        trigger = rootElement._foxcodInjectedWrapper.querySelector('[data-foxcod-trigger]');
      }
      // Fallback: check original root (in case injection didn't run)
      if (!trigger) {
        trigger = rootElement.querySelector('[data-foxcod-trigger]');
      }
      if (!trigger) return;

      var dataContainer = rootElement.querySelector('.cod-form-data');
      var initialButtonText = (dataContainer && dataContainer.dataset.buttonText) || trigger.textContent || 'Buy Now - Cash on Delivery';
      trigger.textContent = initialButtonText;
      trigger.disabled = false;
      trigger.setAttribute('aria-busy', 'false');
      hideNativeBuyButtons(rootElement, { buttonStyles: safeJSONParse((dataContainer && dataContainer.dataset.buttonStyles) || '{}', {}) });

      if (isShopifyEditor) {
        return;
      }

      initFoxCod(rootElement, trigger);
    });

    return hasStableRoot;
  }

  function waitForStableDOM(retries) {
    var remainingRetries = typeof retries === 'number' ? retries : 10;
    var roots = document.querySelectorAll('[data-fox-cod-root]');

    if (roots.length > 0 && initFoxCodSafe()) {
      return;
    }

    if (remainingRetries > 0) {
      setTimeout(function() {
        waitForStableDOM(remainingRetries - 1);
      }, 300);
      return;
    }

    console.warn('FoxlyCOD: DOM never stabilized');
  }

  /**
   * Initialize a single Foxly COD root after the DOM is stable.
   */
  function initFoxCod(rootElement, trigger) {
      var dataContainer = rootElement.querySelector('.cod-form-data');
      if (!dataContainer) {
        console.warn('[COD Form] Missing cod-form-data inside root');
        return;
      }

      if (dataContainer.dataset.foxcodInitialized === 'true') return;
      dataContainer.dataset.foxcodInitialized = 'true';

      var productId = dataContainer.dataset.productId;
      var shop = dataContainer.dataset.shop;
      
      // Default Fallbacks
      var DEFAULT_FIELDS = [
          { id: 'name', label: 'Full Name', type: 'text', visible: true, required: true, order: 1 },
          { id: 'phone', label: 'Phone Number', type: 'tel', visible: true, required: true, order: 2 },
          { id: 'address', label: 'Address', type: 'text', visible: true, required: true, order: 3 }
      ];

      // Debug: Log raw data attribute
      console.log('[COD Form] Raw data-fields attribute:', dataContainer.dataset.fields ? dataContainer.dataset.fields.substring(0, 200) + '...' : 'EMPTY');
      
      var fields = safeJSONParse(dataContainer.dataset.fields, []);
      console.log('[COD Form] Parsed fields count:', fields.length, 'Using defaults:', fields.length === 0);
      
      if (fields.length === 0) fields = DEFAULT_FIELDS;

      // Get configuration from data container
      var config = {
        productId: productId,
        blockId: dataContainer.dataset.blockId || '',
        variantId: dataContainer.dataset.variantId,
        productTitle: dataContainer.dataset.productTitle,
        productPrice: parseFloat(dataContainer.dataset.productPrice),
        productImage: dataContainer.dataset.productImage || '',
        shop: shop,
        proxyUrl: dataContainer.dataset.proxyBase || '/apps/fox-cod',
        maxQuantity: parseInt(dataContainer.dataset.maxQuantity) || 10,
        buttonText: dataContainer.dataset.buttonText || 'Buy Now - Cash on Delivery',
        primaryColor: dataContainer.dataset.primaryColor || '#667eea',
        accentColor: dataContainer.dataset.accentColor || '#111827',
        priceColor: dataContainer.dataset.priceColor || dataContainer.dataset.accentColor || '#111827',
        formBackground: dataContainer.dataset.formBg || '#ffffff',
        formThemeColor: dataContainer.dataset.formThemeColor || dataContainer.dataset.primaryColor || '#667eea',
        submitText: dataContainer.dataset.submitText || 'Place Order (COD)',
        
        // Advanced Configuration
        formType: dataContainer.dataset.formType || 'popup',
        fields: fields,
        blocks: safeJSONParse(dataContainer.dataset.blocks, {}),
        customFields: safeJSONParse(dataContainer.dataset.customFields, []),
        styles: safeJSONParse(dataContainer.dataset.styles, {}),
        buttonStyles: safeJSONParse(dataContainer.dataset.buttonStyles, {}),
        buttonTextColor: dataContainer.dataset.buttonTextColor || null,
        buttonBorderColor: dataContainer.dataset.buttonBorderColor || null,
        buttonBorderWidth: dataContainer.dataset.buttonBorderWidth != null ? parseInt(dataContainer.dataset.buttonBorderWidth, 10) : null,
        shippingOptions: safeJSONParse(dataContainer.dataset.shippingOptions, {}),
        // New Shipping Rates Configuration - prefer window.FoxCod for reliability
        shippingRates: (window.FoxCod && window.FoxCod.shippingRates) || safeJSONParse(dataContainer.dataset.shippingRates, []),
        shippingRatesEnabled: dataContainer.dataset.shippingRatesEnabled === 'true' || (window.FoxCod && window.FoxCod.shippingRatesEnabled) === true,
        
        // Legacy/Direct props
        modalStyle: dataContainer.dataset.modalStyle === 'modern' ? 'glassmorphism' : (dataContainer.dataset.modalStyle || 'glassmorphism'),
        animStyle: dataContainer.dataset.animStyle || 'fade',
        buttonStyle: dataContainer.dataset.buttonStyle || 'solid',
        buttonSize: dataContainer.dataset.buttonSize || 'large',
        hasLiquidPrimaryColor: !!dataContainer.dataset.primaryColor,
        hasLiquidButtonStyle: !!dataContainer.dataset.buttonStyle,
        hasLiquidButtonSize: !!dataContainer.dataset.buttonSize,
        hasLiquidButtonStyles: !!(dataContainer.dataset.buttonStyles && dataContainer.dataset.buttonStyles !== '{}' && dataContainer.dataset.buttonStyles !== 'null'),
        borderRadius: parseInt(dataContainer.dataset.borderRadius) || 12,
        showImage: dataContainer.dataset.showImage === 'true',
        showPrice: dataContainer.dataset.showPrice === 'true',
        formTitle: dataContainer.dataset.formTitle,
        formSubtitle: dataContainer.dataset.formSubtitle,
        
        // Partial Payment Settings v2 — read from FoxCod.partialPaymentSettings (metafield)
        // Falls back to legacy data-attributes for backward compatibility
        partialCodEnabled: (function() {
            var pp = window.FoxCod && window.FoxCod.partialPaymentSettings;
            if (pp && typeof pp.enabled !== 'undefined') return !!pp.enabled;
            return dataContainer.dataset.partialCodEnabled === 'true';
        })(),
        partialCodAdvance: parseInt(dataContainer.dataset.partialCodAdvance) || 100,
        partialPaymentSettings: (window.FoxCod && window.FoxCod.partialPaymentSettings) || null,
        
        // Button Animation Configuration
        animationPreset: dataContainer.dataset.animationPreset || 'none',
        animationSpeed: dataContainer.dataset.animationSpeed || 'normal',
        borderEffect: dataContainer.dataset.borderEffect || 'static',
        borderIntensity: dataContainer.dataset.borderIntensity || 'medium',
        hoverLift: dataContainer.dataset.hoverLift === 'true',
        hoverGlow: dataContainer.dataset.hoverGlow === 'true',
        clickRipple: dataContainer.dataset.clickRipple === 'true',
        clickPress: dataContainer.dataset.clickPress === 'true',
        stickyOnMobile: dataContainer.dataset.stickyMobile === 'true',
        
        // Product Collection IDs - for collection-based shipping rate matching
        productCollectionIds: (window.FoxCod && window.FoxCod.productCollectionIds) || 
            (dataContainer.dataset.productCollectionIds ? dataContainer.dataset.productCollectionIds.split(',').filter(function(id) { return id.trim() !== ''; }) : []),
        
        // Quantity Offers Configuration - prefer window.FoxCod for reliability
        quantityOffers: (window.FoxCod && window.FoxCod.quantityOffers) || safeJSONParse(dataContainer.dataset.quantityOffers, []),
        
        // Upsell Offers Configuration
        upsellOffers: (window.FoxCod && window.FoxCod.upsellOffers) || safeJSONParse(dataContainer.dataset.upsellOffers, { tick_upsells: [], click_upsells: [], downsells: [] }),
        appUrl: dataContainer.dataset.appUrl || '',
        rootElement: rootElement,
        shellElement: rootElement.querySelector('[data-foxcod-shell]') || (rootElement._foxcodInjectedWrapper ? rootElement._foxcodInjectedWrapper.querySelector('[data-foxcod-shell]') : null),
        triggerElement: trigger,
        statusElement: rootElement.querySelector('[data-foxcod-status]') || (rootElement._foxcodInjectedWrapper ? rootElement._foxcodInjectedWrapper.querySelector('[data-foxcod-status]') : null),
        // Form submit button style overrides
        formSubmitButton: (function() {
          var attrStyles = safeJSONParse(dataContainer.dataset.formSubmitButton, {});
          var globalStyles = normalizeConfigObject(window.FoxCod && window.FoxCod.formSubmitButton, {});
          return Object.assign({}, attrStyles, globalStyles);
        })(),
        // Product button styles — merge data attribute + global injection so storefront keeps icon settings
        buttonStyles: (function() {
          var attrStyles = safeJSONParse(dataContainer.dataset.buttonStyles, {});
          var globalStyles = normalizeConfigObject(window.FoxCod && window.FoxCod.buttonStyles, {});
          return Object.assign({}, attrStyles, globalStyles);
        })()
      };

      // Debug: Log quantity offers data
      console.log('[COD Form] Quantity offers payload:', {
        fromWindow: window.FoxCod && window.FoxCod.quantityOffers ? window.FoxCod.quantityOffers.length + ' groups' : 'NOT AVAILABLE',
        fromDataAttr: dataContainer.dataset.quantityOffers ? dataContainer.dataset.quantityOffers.substring(0, 100) + '...' : 'EMPTY',
        finalCount: config.quantityOffers?.length || 0,
        productId: productId,
        productIdType: typeof productId
      });

      console.log('[COD Form] Initialized for product:', productId, config);
      
      // ── Store config on root so cart-drawer buttons can open the modal directly ──
      // Without this, clicking the cart COD button on a product page would call
      // originalTrigger.click() and re-open the product form instead of the cart form.
      rootElement._foxcodConfig = config;

      // Initialize form after fetching IP geolocation
      if (window.FoxCod.CountryRestrictionEngine && window.FoxCod.CountryRestrictionEngine.initAsync) {
          window.FoxCod.CountryRestrictionEngine.initAsync().then(function() {
              initializeProduct(productId, config);
              hydratePublicSettings(config);
          });
      } else {
          initializeProduct(productId, config);
          hydratePublicSettings(config);
      }
  }

  /**
   * Generate animation CSS classes based on config
   * Mirrors the getButtonAnimationClasses function from app.settings.tsx
   */
  function getButtonAnimationClasses(config) {
    var classes = [];
    
    // Animation preset
    if (config.animationPreset && config.animationPreset !== 'none') {
      classes.push('btn-anim-' + config.animationPreset);
      // Speed modifier
      if (config.animationSpeed === 'slow') classes.push('speed-slow');
      if (config.animationSpeed === 'fast') classes.push('speed-fast');
    }
    
    // Border effects
    if (config.borderEffect && config.borderEffect !== 'static') {
      classes.push('btn-border-' + config.borderEffect);
      // Intensity modifier
      if (config.borderIntensity === 'low') classes.push('intensity-low');
      if (config.borderIntensity === 'high') classes.push('intensity-high');
    }
    
    // Hover effects
    if (config.hoverLift) classes.push('btn-hover-lift');
    
    // Click effects
    if (config.clickRipple) classes.push('btn-click-ripple');
    if (config.clickPress) classes.push('btn-click-press');
    
    return classes.join(' ');
  }

  /**
   * Initialize a specific product
   */
  function initializeProduct(productId, config) {
    // Render the primary CTA directly inside the app block root.
    mountBlockRoot(productId, config, { loading: false });
    
    // Await prices before rendering offers
    window.FoxCod.fetchContextualPricesForOffers(null, config).then(function() {
        mountRootOffers(productId, config);

        // Initialize the form structure and events
        initForm(productId, config);
        setupVariantObserver(config.rootElement, config.triggerElement, config);
        ensureStickyButton(productId, config);
    });
  }

  /**
   * Render offers directly inside the app block root when configured for product-page placement.
   */
  function mountRootOffers(productId, config) {
    if (!config || !config.rootElement || !config.shellElement || !config.triggerElement) return;
    if (config.rootElement.querySelector('.cod-product-page-offers[data-product-id="' + productId + '"]')) return;

    var offersResult = renderQuantityOffersWithPlacement(config.rootElement, config);
    if (!offersResult.element || offersResult.placement !== 'in_product_page') return;

    offersResult.element.classList.add('cod-product-page-offers');
    offersResult.element.setAttribute('data-product-id', productId);
    config.shellElement.insertBefore(offersResult.element, config.triggerElement);
    console.log('[COD Form] Rendered in_product_page offers inside block root');

    var defaultSelectedCard = offersResult.element.querySelector('.cod-offer-card.selected');
    if (defaultSelectedCard) {
      var defaultOffer = {
        quantity: parseInt(defaultSelectedCard.getAttribute('data-quantity'), 10),
        discountPercent: parseFloat(defaultSelectedCard.getAttribute('data-discount')) || 0
      };
      offersResult.element.setAttribute('data-selected-offer', JSON.stringify(defaultOffer));
      if (defaultOffer.quantity > 1) {
        renderBundleVariantSelectors(null, config, defaultOffer.quantity, offersResult.element);
      }
    }

    offersResult.element.querySelectorAll('.cod-offer-card').forEach(function(card) {
      card.addEventListener('click', function() {
        offersResult.element.querySelectorAll('.cod-offer-card').forEach(function(otherCard) {
          otherCard.classList.remove('selected');
        });
        card.classList.add('selected');

        var offer = {
          quantity: parseInt(card.getAttribute('data-quantity'), 10),
          discountPercent: parseFloat(card.getAttribute('data-discount')) || 0
        };
        offersResult.element.setAttribute('data-selected-offer', JSON.stringify(offer));
        renderBundleVariantSelectors(null, config, offer.quantity, offersResult.element);

        var modalContainer = getModalContainer(config);
        if (!modalContainer) return;

        var modalOffers = modalContainer.querySelector('.cod-quantity-offers');
        if (modalOffers) {
          modalOffers.setAttribute('data-selected-offer', JSON.stringify(offer));
          modalOffers.querySelectorAll('.cod-offer-card').forEach(function(modalCard) {
            modalCard.classList.remove('selected');
          });
          var matchCard = modalOffers.querySelector('[data-quantity="' + offer.quantity + '"]');
          if (matchCard) matchCard.classList.add('selected');
        }

        var qtyInput = modalContainer.querySelector('.cod-qty-input');
        if (qtyInput) {
          qtyInput.value = offer.quantity;
          qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }

        var form = modalContainer.querySelector('form');
        if (form) {
          updateOfferPrice(form, config, offer);
          updateOrderSummaryWithOffer(form, config, offer);
        }
      });
    });
  }

  /**
   * Track variant changes to disable/enable the COD button based on stock
   */
  function setupVariantObserver(origBtn, codBtn, config) {
      if (!window.FoxCod || !window.FoxCod.productVariants || window.FoxCod.productVariants.length === 0) return;
      var variants = window.FoxCod.productVariants;
      
      function updateButtonState(variantId) {
          if (!variantId) return;
          var v = variants.find(function(vr) { return String(vr.id) === String(variantId); });
          if (v) {
              config._isSoldOut = !v.available;
              if (v.available) {
                  syncFoxCodButtons(config);
              } else {
                  syncFoxCodButtons(config);
              }
              config.variantId = v.id;
              config.productPrice = v.price;
              if (v.title && v.title !== 'Default Title') {
                  config.productTitle = window.FoxCod.productTitle ? (window.FoxCod.productTitle + ' - ' + v.title) : v.title;
              }
              if (config._stickyButton && typeof config._stickyButton._updateVisibility === 'function') {
                  config._stickyButton._updateVisibility();
              }
          }
      }

      var form = origBtn && origBtn.closest ? origBtn.closest('form[action*="/cart/add"], .product-form, form') : null;
      if (!form && config && config.rootElement) {
          var productSection = config.rootElement.closest('section, product-info, .product, .product__info');
          if (productSection) {
              form = productSection.querySelector('form[action*="/cart/add"], .product-form, form');
          }
      }
      var idInput = form ? form.querySelector('input[name="id"]') : null;

      if (idInput && idInput.value) {
          updateButtonState(idInput.value);
      } else {
          var urlParams = new URLSearchParams(window.location.search);
          var vid = urlParams.get('variant');
          if (vid) updateButtonState(vid);
          else updateButtonState(config.variantId);
      }

      if (idInput) {
          idInput.addEventListener('change', function() {
              updateButtonState(this.value);
          });
      }
      
      if (form) {
          form.addEventListener('change', function() {
              setTimeout(function() {
                  if (idInput) updateButtonState(idInput.value);
                  else {
                      var urlParams = new URLSearchParams(window.location.search);
                      updateButtonState(urlParams.get('variant'));
                  }
              }, 50);
          });
      }

      var handleUrlChange = function() {
          setTimeout(function() {
              var urlParams = new URLSearchParams(window.location.search);
              var vid = urlParams.get('variant');
              if (vid) updateButtonState(vid);
              else if (idInput) updateButtonState(idInput.value);
          }, 50);
      };

      if (!window._foxcodHistoryPatched) {
          window._foxcodHistoryPatched = true;
          var originalPushState = history.pushState;
          var originalReplaceState = history.replaceState;
          
          history.pushState = function() {
              originalPushState.apply(this, arguments);
              window.dispatchEvent(new Event('foxcod-url-change'));
          };
          history.replaceState = function() {
              originalReplaceState.apply(this, arguments);
              window.dispatchEvent(new Event('foxcod-url-change'));
          };
          window.addEventListener('popstate', function() { window.dispatchEvent(new Event('foxcod-url-change')); });
      }
      window.addEventListener('foxcod-url-change', handleUrlChange);
  }

  /**
   * Helper to darken color
   */

  function darkenColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
    var g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
    var b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
    // Pad each component to 2 digits to ensure correct hex color
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  /**
   * Apply button styles for both storefront trigger and modal submit button.
   * For trigger usage, pass { forceProductButtonStyle: true } so submit-only
   * customizations never override the product CTA.
   */
  function applySubmitButtonStyles(btn, config, options) {
    if (!btn) return;
    options = options || {};

    var productBtnStyles = config.buttonStyles || {};
    var fsb = config.formSubmitButton || {};
    var forceProductButtonStyle = !!options.forceProductButtonStyle;
    var useCustom = !forceProductButtonStyle && fsb.useProductButtonStyle === false;

    var src = useCustom ? fsb : productBtnStyles;
    var productBtnColor = productBtnStyles.backgroundColor || config.primaryColor || '#667eea';
    var btnColor = useCustom ? (fsb.backgroundColor || productBtnColor) : productBtnColor;
    var borderCol = src.borderColor || btnColor;
    var borderW = src.borderWidth != null ? Number(src.borderWidth) : 0;
    var btnSize = useCustom
      ? (src.buttonSize || 'medium')
      : (productBtnStyles.buttonSize || config.buttonSize || 'large');
    var btnStyle = useCustom
      ? (src.buttonStyle || 'solid')
      : (productBtnStyles.buttonStyle || config.buttonStyle || 'solid');
    var textColor = src.textColor || '#ffffff';
    var textSize = src.textSize != null ? Number(src.textSize) : 15;
    var fontStyle = src.fontStyle || 'normal';
    var fallbackRadius = useCustom ? 12 : (productBtnStyles.borderRadius != null ? Number(productBtnStyles.borderRadius) : 12);
    var radius = src.borderRadius != null
      ? Number(src.borderRadius)
      : fallbackRadius;

    function setImportant(prop, value) {
      if (value == null || value === '') return;
      btn.style.setProperty(prop, String(value), 'important');
    }

    // Base styles always applied
    setImportant('width', '100%');
    setImportant('cursor', 'pointer');
    var disableTransitionForInitialPaint = !config._foxcodButtonStyleBootstrapped;
    setImportant('transition', disableTransitionForInitialPaint ? 'none' : 'all 0.2s ease');
    setImportant('font-family', 'inherit');
    setImportant('display', 'block');

    // Size
    setImportant('padding', btnSize === 'small' ? '10px 16px' : btnSize === 'large' ? '16px' : '13px 16px');

    // Typography
    setImportant('color', textColor);
    setImportant('font-size', textSize + 'px');
    setImportant('font-weight', fontStyle === 'bold' ? '700' : '400');
    setImportant('font-style', fontStyle === 'italic' ? 'italic' : 'normal');

    // Border radius
    setImportant('border-radius', radius + 'px');

    // Style: solid / outline / gradient
    if (btnStyle === 'outline') {
      setImportant('background-color', 'transparent');
      setImportant('background', 'transparent');
      setImportant('border', (borderW > 0 ? borderW : 2) + 'px solid ' + btnColor);
      var isWhite = textColor.toLowerCase() === '#ffffff' || textColor.toLowerCase() === 'white';
      setImportant('color', isWhite ? btnColor : textColor);
      setImportant('box-shadow', 'none');
    } else if (btnStyle === 'gradient') {
      var darkColor = darkenColor(btnColor, 25);
      setImportant('background', 'linear-gradient(135deg, ' + btnColor + ' 0%, ' + darkColor + ' 100%)');
      setImportant('border', borderW > 0 ? borderW + 'px solid ' + borderCol : 'none');
      setImportant('box-shadow', src.shadow ? '0 6px 12px rgba(0,0,0,0.2)' : 'none');
    } else {
      // Solid
      setImportant('background-color', btnColor);
      setImportant('background', btnColor);
      setImportant('border', borderW > 0 ? borderW + 'px solid ' + borderCol : 'none');
      if (src.shadow) {
        var intensity = src.shadowIntensity || 35;
        var opacity = 0.05 + (intensity / 100) * 0.25;
        setImportant('box-shadow', '0 4px 12px rgba(0,0,0,' + opacity + ')');
      } else {
        setImportant('box-shadow', 'none');
      }
    }

    if (disableTransitionForInitialPaint) {
      config._foxcodButtonStyleBootstrapped = true;
      requestAnimationFrame(function() {
        if (!btn || !btn.isConnected) return;
        btn.style.setProperty('transition', 'all 0.2s ease', 'important');
      });
    }
  }

  /**
   * Render Quantity Offers and return both element and placement
   */
  function renderQuantityOffersWithPlacement(container, config) {
    var offers = config.quantityOffers || [];
    
    console.log('[COD Form] renderQuantityOffersWithPlacement called with', offers.length, 'offer groups');
    console.log('[COD Form] Current product ID:', config.productId, 'type:', typeof config.productId);
    
    // Check if current product has offers
    if (!offers.length) {
      console.log('[COD Form] No quantity offers available');
      return { element: null, placement: 'at_top' };
    }
    
    // Find offers applicable to this product
    var applicableGroup = null;
    // Normalize current product ID (strip GID prefix if present)
    var currentProductId = String(config.productId).replace('gid://shopify/Product/', '');
    
    console.log('[COD Form] Normalized current product ID:', currentProductId);
    
    for (var i = 0; i < offers.length; i++) {
      var group = offers[i];
      // Handle both snake_case (from DB) and camelCase (from JS)
      var productIds = group.product_ids || group.productIds || [];
      // Convert all product IDs to strings and strip GID prefix if present
      var productIdStrings = productIds.map(function(id) { return String(id).replace('gid://shopify/Product/', ''); });
      
      console.log('[COD Form] Checking group:', group.name, 'active:', group.active, 'placement:', group.placement);
      
      if (group.active && productIdStrings.length > 0 && productIdStrings.includes(currentProductId)) {
        console.log('[COD Form] Found matching group:', group.name, 'with placement:', group.placement);
        applicableGroup = group;
        break;
      }
    }

    if (!applicableGroup || !applicableGroup.offers || !applicableGroup.offers.length) {
      console.log('[COD Form] No applicable group found for product:', currentProductId);
      return { element: null, placement: 'at_top' };
    }
    
    // Get placement from the group (default to 'at_top')
    var placement = applicableGroup.placement || 'at_top';
    console.log('[COD Form] Using placement:', placement, 'from group:', applicableGroup.name);
    
    // Render the offers (reuse existing render logic)
    var offersElement = renderQuantityOffersElement(container, config, applicableGroup);
    
    return { element: offersElement, placement: placement };
  }

  /**
   * Render Quantity Offers element (extracted from original function)
   */
  function renderQuantityOffersElement(container, config, applicableGroup) {
    var design = applicableGroup.design || {};
    var template = design.template || 'modern';
    
    console.log('[COD Form] Rendering offers with template:', template);
    
    // Create offers container
    var offersContainer = document.createElement('div');
    offersContainer.className = 'cod-quantity-offers template-' + template;
    offersContainer.setAttribute('data-product-id', config.productId);
    
    // Apply template-specific container styles
    offersContainer.style.display = 'flex';
    offersContainer.style.width = '100%';
    offersContainer.style.boxSizing = 'border-box';
    offersContainer.style.gap = '8px';
    offersContainer.style.overflow = 'visible';
    if (template === 'cards') {
      offersContainer.style.flexDirection = 'row';
      offersContainer.style.flexWrap = 'nowrap';
      offersContainer.style.overflowX = 'auto';
      offersContainer.style.paddingTop = '8px';
      offersContainer.style.paddingBottom = '8px';
      offersContainer.style.paddingLeft = '4px';
      offersContainer.style.paddingRight = '4px';
      // Wrap in a column-flex parent so the variant section renders BELOW the cards row
      var cardsWrapper = document.createElement('div');
      cardsWrapper.className = 'foxcod-cards-wrapper';
      cardsWrapper.style.display = 'flex';
      cardsWrapper.style.flexDirection = 'column';
      cardsWrapper.style.width = '100%';
      cardsWrapper.style.gap = '0';
      cardsWrapper.appendChild(offersContainer);
      // Expose wrapper so renderBundleVariantSelectors can append variant section to it
      offersContainer._cardsWrapper = cardsWrapper;
    } else if (template === 'vertical') {
      offersContainer.style.flexDirection = 'column';
      offersContainer.style.flexWrap = 'nowrap';
    } else {
      // Classic, Modern, Minimal - stack cards vertically
      offersContainer.style.flexDirection = 'column';
    }
    
    // State: selected offer index
    // Priority: 1) offer with preselect=true, 2) best discount offer, 3) first offer
    var selectedIndex = -1;
    // Check for preselected offer
    applicableGroup.offers.forEach(function(offer, idx) {
        if (offer.preselect && selectedIndex === -1) selectedIndex = idx;
    });
    // Default to best discount offer
    if (selectedIndex === -1) {
        selectedIndex = applicableGroup.offers.reduce(function(maxIdx, offer, idx, arr) {
            return (offer.discountPercent || 0) > (arr[maxIdx].discountPercent || 0) ? idx : maxIdx;
        }, 0);
    }
    // Ultimate fallback: first offer
    if (selectedIndex === -1) selectedIndex = 0;
    
    // Render each offer card
    applicableGroup.offers.forEach(function(offer, idx) {
      var card = document.createElement('div');
      card.className = 'cod-offer-card' + (idx === selectedIndex ? ' selected' : '');
      card.setAttribute('data-offer-idx', idx);
      card.setAttribute('data-quantity', offer.quantity);
      card.setAttribute('data-discount', offer.discountPercent || 0);
      
      // Check if this is the "Most Popular" offer (last one with highest discount or last offer)
      var isMostPopular = (offer.label && offer.label.toLowerCase().indexOf('most popular') !== -1);
      var hasLabel = !!offer.label && !isMostPopular;
      var showDiscountTag = ((offer.discountPercent || 0) > 0 || hasLabel) && !isMostPopular;
      
      // Template-specific styles
      var isVertical = template === 'vertical';
      var isCards = template === 'cards';
      var isMinimal = template === 'minimal';
      
      // Force inline styles to ensure they override any CSS
      card.style.border = isMinimal ? '1px solid' : '2px solid';
      card.style.padding = isMinimal ? '8px 12px' : (isCards ? '16px 12px' : '12px');
      card.style.cursor = 'pointer';
      card.style.transition = 'all 0.2s ease';
      card.style.position = 'relative';
      card.style.overflow = 'visible';
      card.style.boxSizing = 'border-box';
      card.style.display = 'flex';
      
      // Cards template - flex layout
      if (isCards) {
        card.style.flex = '0 0 auto';
        card.style.minWidth = (idx === selectedIndex) ? '260px' : '110px';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.textAlign = 'center';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
        card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      } else if (isVertical) {
        // Vertical template - column layout, centered, full width
        card.style.width = '100%';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.textAlign = 'center';
      } else if (isMinimal) {
        // Minimal template - horizontal, compact
        card.style.flexDirection = 'row';
        card.style.flexWrap = 'wrap';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.gap = '6px';
      } else {
        // Classic & Modern - horizontal row, text left, price right
        card.style.flexDirection = 'row';
        card.style.flexWrap = 'wrap';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.gap = '10px';
      }
      
      // Apply design styles
      if (idx === selectedIndex) {
        card.style.background = design.selectedBgColor || 'rgba(99,102,241,0.08)';
        card.style.borderColor = design.selectedBorderColor || config.accentColor;
        card.style.color = design.selectedTextColor || '#1f2937';
      } else {
          card.style.background = design.unselectedBgColor || 'transparent';
          card.style.borderColor = design.unselectedBorderColor || '#e5e7eb';
          card.style.color = '#6b7280';
      }
      card.style.borderRadius = (design.selectedBorderRadius || 10) + 'px';
      
      // Most Popular Ribbon Badge — hanging tab with top fold-back corners
      if (isMostPopular) {
        card.style.marginTop = isCards ? '0' : '16px';
        if (isCards) card.style.paddingTop = '20px';
        var badgeBg = offer.tagBgColor || design.selectedTagBgColor || '#2ec4b6';
        var badgeColor = design.selectedTagTextColor || '#ffffff';
        // Darker shade for fold-back triangles
        var darkerBg = (function(hex) {
          hex = hex.replace('#', '');
          var r = Math.max(0, parseInt(hex.substring(0,2), 16) - 50);
          var g = Math.max(0, parseInt(hex.substring(2,4), 16) - 50);
          var b = Math.max(0, parseInt(hex.substring(4,6), 16) - 50);
          return '#' + r.toString(16).padStart(2,'0') + g.toString(16).padStart(2,'0') + b.toString(16).padStart(2,'0');
        })(badgeBg);

        // Inject ribbon CSS — only the badge shape, no fold pseudo-elements needed
        var existingRibbonCss = document.getElementById('cod-ribbon-css');
        if (existingRibbonCss) existingRibbonCss.remove();
        var ribbonStyle = document.createElement('style');
        ribbonStyle.id = 'cod-ribbon-css';
        // Use smaller ribbon for cards template to fit within narrow card containers
        if (isCards) {
          ribbonStyle.textContent = '.cod-ribbon-wrap{position:absolute!important;top:-6px!important;left:50%!important;transform:translateX(-50%)!important;z-index:10!important;pointer-events:none!important;overflow:visible!important}' +
            '.cod-ribbon-badge{display:inline-block!important;position:relative!important;padding:3px 10px!important;font-size:9px!important;font-weight:700!important;text-align:center!important;text-transform:uppercase!important;letter-spacing:.3px!important;line-height:1.3!important;white-space:nowrap!important;border-radius:0 0 10px 10px!important;box-shadow:0 2px 4px rgba(0,0,0,.12)!important;overflow:visible!important}';
        } else {
          ribbonStyle.textContent = '.cod-ribbon-wrap{position:absolute!important;top:-8px!important;left:50%!important;transform:translateX(-50%)!important;z-index:10!important;pointer-events:none!important;overflow:visible!important}' +
            '.cod-ribbon-badge{display:inline-block!important;position:relative!important;padding:5px 18px!important;font-size:11px!important;font-weight:700!important;text-align:center!important;text-transform:uppercase!important;letter-spacing:.5px!important;line-height:1.3!important;white-space:nowrap!important;border-radius:0 0 14px 14px!important;box-shadow:0 2px 4px rgba(0,0,0,.12)!important;overflow:visible!important}';
        }
        document.head.appendChild(ribbonStyle);

        // Ribbon wrapper — centered at top of card
        var ribbonWrap = document.createElement('div');
        ribbonWrap.className = 'cod-ribbon-wrap';
        // Also set inline for guaranteed override — smaller top offset for cards
        var ribbonTop = isCards ? '-6px' : '-8px';
        ribbonWrap.style.cssText = 'position:absolute!important;top:' + ribbonTop + '!important;left:50%!important;transform:translateX(-50%)!important;z-index:10!important;pointer-events:none!important;overflow:visible!important';

        // Ribbon badge — smaller for cards template
        var badge = document.createElement('span');
        badge.className = 'cod-ribbon-badge';
        if (isCards) {
          badge.style.cssText = 'display:inline-block;position:relative;padding:3px 10px;font-size:9px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.3px;line-height:1.3;white-space:nowrap;border-radius:0 0 10px 10px;box-shadow:0 2px 4px rgba(0,0,0,.12);overflow:visible;background:' + badgeBg + ';color:' + badgeColor + ';';
        } else {
          badge.style.cssText = 'display:inline-block;position:relative;padding:5px 18px;font-size:11px;font-weight:700;text-align:center;text-transform:uppercase;letter-spacing:.5px;line-height:1.3;white-space:nowrap;border-radius:0 0 14px 14px;box-shadow:0 2px 4px rgba(0,0,0,.12);overflow:visible;background:' + badgeBg + ';color:' + badgeColor + ';';
        }
        badge.textContent = offer.label || 'Most Popular';

        // Fold-back triangles — 100% inline styles, no CSS class dependency
        // Left fold: triangle pointing up-right (border-bottom + transparent border-left)
        var foldSize = isCards ? '4px' : '6px';
        var leftFold = document.createElement('span');
        leftFold.style.cssText = 'position:absolute;top:0;left:-' + foldSize + ';width:0;height:0;display:block;line-height:0;font-size:0;border-bottom:' + foldSize + ' solid ' + darkerBg + ';border-left:' + foldSize + ' solid transparent;';
        badge.appendChild(leftFold);

        // Right fold: triangle pointing up-left (border-bottom + transparent border-right)
        var rightFold = document.createElement('span');
        rightFold.style.cssText = 'position:absolute;top:0;right:-' + foldSize + ';width:0;height:0;display:block;line-height:0;font-size:0;border-bottom:' + foldSize + ' solid ' + darkerBg + ';border-right:' + foldSize + ' solid transparent;';
        badge.appendChild(rightFold);

        ribbonWrap.appendChild(badge);
        card.appendChild(ribbonWrap);
        // Ensure the card itself also has overflow:visible so triangles aren't clipped
        card.style.overflow = 'visible';
      }
      
      // For classic, vertical, and cards templates, display product image (not modern or minimal)
      if ((template === 'classic' || template === 'vertical' || template === 'cards') && config.productImage) {
          var img = document.createElement('img');
          img.src = config.productImage;
          img.alt = config.productTitle || 'Product';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '8px';
          img.style.flexShrink = '0';
          if (isVertical || isCards) {
            img.style.width = '60px';
            img.style.height = '60px';
          } else {
            // Classic template - smaller inline image
            img.style.width = '40px';
            img.style.height = '40px';
          }
          card.appendChild(img);
      }
      
      // Create content wrapper for text elements (quantity, badge, discount)
      var contentWrapper = document.createElement('div');
      contentWrapper.style.display = 'flex';
      contentWrapper.style.flexDirection = 'column';
      contentWrapper.style.gap = '2px';
      contentWrapper.style.minWidth = '0';
      if (isVertical || isCards) {
        contentWrapper.style.textAlign = 'center';
        contentWrapper.style.width = '100%';
        contentWrapper.style.alignItems = 'center';
      } else {
        // Classic, Modern, Minimal - text left-aligned, take remaining space
        contentWrapper.style.flex = '1';
        contentWrapper.style.alignItems = 'flex-start';
      }
      
      // Quantity text
      var qtyDiv = document.createElement('div');
      qtyDiv.className = 'cod-offer-quantity';
      qtyDiv.textContent = offer.quantity + (offer.quantity === 1 ? ' Unit' : ' Units');
      contentWrapper.appendChild(qtyDiv);
      
      // Inline discount tag for non-most-popular offers
      if (showDiscountTag) {
        var discountTag = document.createElement('div');
        discountTag.className = 'cod-offer-discount-tag';
        discountTag.style.background = offer.tagBgColor || design.selectedTagBgColor || config.accentColor;
        discountTag.style.color = design.selectedTagTextColor || '#ffffff';
        discountTag.style.fontSize = '10px';
        discountTag.style.fontWeight = '600';
        discountTag.style.padding = '2px 6px';
        discountTag.style.borderRadius = '4px';
        discountTag.style.display = 'inline-block';
        discountTag.style.width = 'fit-content';
        discountTag.style.marginTop = '4px';
        discountTag.textContent = offer.label || ('Save ' + offer.discountPercent + '%');
        contentWrapper.appendChild(discountTag);
      }
      
      // Append content wrapper to card
      card.appendChild(contentWrapper);
      
      // Price calculation
      var unitPrice = config.productPrice;
      if (!unitPrice || isNaN(unitPrice)) {
          unitPrice = 0;
      }
      var discountedPrice = unitPrice * offer.quantity * (1 - (offer.discountPercent || 0) / 100);
      var originalPrice = unitPrice * offer.quantity;
      
      // Create price wrapper
      var priceWrapper = document.createElement('div');
      priceWrapper.className = 'cod-offer-price-wrapper';
      priceWrapper.style.display = 'flex';
      priceWrapper.style.flexDirection = 'column';
      priceWrapper.style.gap = '2px';
      priceWrapper.style.flexShrink = '0';
      if (isVertical || isCards) {
        priceWrapper.style.textAlign = 'center';
        priceWrapper.style.width = '100%';
        priceWrapper.style.alignItems = 'center';
        priceWrapper.style.marginTop = 'auto';
      } else {
        // Classic, Modern, Minimal - price right-aligned
        priceWrapper.style.textAlign = 'right';
        priceWrapper.style.alignItems = 'flex-end';
      }
      
      // Original price (strikethrough) if discount exists
      if (offer.discountPercent) {
        var originalPriceSpan = document.createElement('span');
        originalPriceSpan.className = 'cod-offer-original-price';
        originalPriceSpan.textContent = formatMoney(originalPrice);
        priceWrapper.appendChild(originalPriceSpan);
      }
      
      // Discounted price
      var priceDiv = document.createElement('div');
      priceDiv.className = 'cod-offer-price';
      priceDiv.textContent = formatMoney(discountedPrice);
      priceWrapper.appendChild(priceDiv);
      
      // Append price wrapper to card
      card.appendChild(priceWrapper);
      
      // Click handler with debounce to prevent DOM thrashing on rapid switching
      card.addEventListener('click', function() {
        // Debounce: skip if last switch was < 200ms ago
        var now = Date.now();
        if (offersContainer._lastSwitchTime && (now - offersContainer._lastSwitchTime) < 200) return;
        offersContainer._lastSwitchTime = now;

        // Update selected state
        offersContainer.querySelectorAll('.cod-offer-card').forEach(function(c, i) {
          c.classList.remove('selected');
          c.style.background = design.unselectedBgColor || 'transparent';
          c.style.borderColor = design.unselectedBorderColor || '#e5e7eb';
          c.style.color = '#6b7280';
          if (isCards) c.style.minWidth = '110px';
        });
        card.classList.add('selected');
        card.style.background = design.selectedBgColor || 'rgba(99,102,241,0.08)';
        card.style.borderColor = design.selectedBorderColor || config.accentColor;
        card.style.color = design.selectedTextColor || '#1f2937';
        if (isCards) card.style.minWidth = '260px';
        
        // Update quantity selector
        var form = container.closest('.cod-modal') || container.closest('form');
        var isInsideModal = !!container.closest('.cod-modal');
        if (isInsideModal) {
          var qtyInput = form ? form.querySelector('.cod-qty-input') : null;
          if (qtyInput) {
            qtyInput.value = offer.quantity;
          }
        }
        
        // Store selected offer
        offersContainer.setAttribute('data-selected-offer', JSON.stringify({
          quantity: offer.quantity,
          discountPercent: offer.discountPercent || 0
        }));
        
        // Render bundle variant selectors (works on both product page and modal)
        renderBundleVariantSelectors(form, config, parseInt(offer.quantity) || 1, offersContainer);
        
        // Update price display and order summary
        if (isInsideModal && form) {
            updateOfferPrice(form, config, offer);
            updateOrderSummaryWithOffer(form, config, offer);
        }
      });
      
      offersContainer.appendChild(card);
    });
    
    // Set initial selected offer
    var initialOffer = applicableGroup.offers[selectedIndex];
    offersContainer.setAttribute('data-selected-offer', JSON.stringify({
      quantity: initialOffer.quantity,
      discountPercent: initialOffer.discountPercent || 0
    }));
    
    // Store the selected offer and container reference for variant selector auto-render
    offersContainer._initialSelectedOffer = initialOffer;
    offersContainer._selectedIndex = selectedIndex;
    
    // Return the wrapper (for cards) or the container itself (for other templates)
    return offersContainer._cardsWrapper || offersContainer;
  }

  /**
   * ── Bundle Variant Selector ──
   * When a bundle offer is selected (Buy 2, Buy 3, etc), render per-item variant dropdowns
   */
  function renderBundleVariantSelectors(form, config, quantity, offersContainerOverride) {
      var variants = window.FoxCod && window.FoxCod.productVariants;
      var options = window.FoxCod && window.FoxCod.productOptions;
      if (!variants || variants.length <= 1 || !options || options.length === 0) return;

      // Find or use provided offers container
      var offersContainer = offersContainerOverride || null;
      if (!offersContainer) {
          var modal = form ? (form.closest('.cod-modal') || form.parentElement) : null;
          offersContainer = (modal && modal.querySelector('.cod-quantity-offers')) || 
                            (form && form.querySelector('.cod-quantity-offers')) ||
                            document.querySelector('.cod-product-page-offers');
      }

      // Remove any existing variant sections (from both modal and product page)
      document.querySelectorAll('.foxcod-variant-section').forEach(function(el) { el.remove(); });

      if (quantity <= 1) {
          window.FoxCod._selectedBundleVariants = null;
          return;
      }

      // Find the lowest variant price as the base for price diff display
      var lowestPrice = variants.reduce(function(min, v) {
          return v.available && v.price < min ? v.price : min;
      }, Infinity);
      if (lowestPrice === Infinity) lowestPrice = variants[0].price;

      // Build unique option values
      var optionValues = [];
      options.forEach(function(optName, optIdx) {
          var values = [];
          var key = 'option' + (optIdx + 1);
          variants.forEach(function(v) {
              if (v[key] && values.indexOf(v[key]) === -1) values.push(v[key]);
          });
          optionValues.push({ name: optName, values: values });
      });

      // Create section container
      var section = document.createElement('div');
      section.className = 'foxcod-variant-section';
      section.innerHTML = '<p class="foxcod-variant-section-title">Select variants for each item:</p>';
      
      // Force inline flex layout to guarantee it drops to the next line in the bundle card
      section.style.flexBasis = '100%';
      section.style.width = '100%';
      section.style.order = '99';

      // Reuse existing variants if available to preserve state
      var existingSelectedVariants = window.FoxCod._selectedBundleVariants || [];
      var selectedBundleVariants = [];
      var defaultVariant = variants.find(function(v) { return v.available; }) || variants[0];

      for (var i = 0; i < quantity; i++) {
          (function(itemIndex) {
              var row = document.createElement('div');
              row.className = 'foxcod-variant-row';
              row.setAttribute('data-item-index', itemIndex);

              var label = document.createElement('span');
              label.className = 'foxcod-variant-label';
              label.textContent = 'Item ' + (itemIndex + 1);
              row.appendChild(label);

              var selectsDiv = document.createElement('div');
              selectsDiv.className = 'foxcod-variant-selects';

              var prevVariantState = existingSelectedVariants[itemIndex];
              var initialVariantObj = null;

              if (prevVariantState) {
                  initialVariantObj = variants.find(function(v) { return v.id === prevVariantState.variantId; });
              }
              if (!initialVariantObj) {
                  initialVariantObj = defaultVariant;
              }

              // Create a dropdown for each option dynamically from product.options
              optionValues.forEach(function(opt, optIdx) {
                  var sel = document.createElement('select');
                  sel.className = 'foxcod-variant-select';
                  sel.setAttribute('data-item', itemIndex);
                  sel.setAttribute('data-option-index', optIdx);
                  sel.setAttribute('aria-label', opt.name + ' for Item ' + (itemIndex + 1));

                  // Stop propagation so clicking select doesn't re-select the bundle card
                  sel.addEventListener('click', function(e) {
                      e.stopPropagation();
                  });

                  opt.values.forEach(function(val) {
                      var option = document.createElement('option');
                      option.value = val;

                      // Find variants matching this option value to determine price & availability
                      var matchingVariants = variants.filter(function(v) {
                          return v['option' + (optIdx + 1)] === val;
                      });
                      var anyAvailable = matchingVariants.some(function(v) { return v.available; });
                      // Use the cheapest available matching variant's price for display
                      var displayPrice = matchingVariants.reduce(function(min, v) {
                          return v.price < min ? v.price : min;
                      }, matchingVariants[0] ? matchingVariants[0].price : 0);

                      // Build label with price info
                      var labelText = val;
                      if (displayPrice > 0) {
                          var priceDiff = displayPrice - lowestPrice;
                          if (priceDiff > 0) {
                              labelText += ' — ' + formatMoney(displayPrice) + ' (+' + formatMoney(priceDiff) + ')';
                          } else {
                              labelText += ' — ' + formatMoney(displayPrice);
                          }
                      }

                      if (!anyAvailable) {
                          labelText += ' — Out of stock';
                          option.disabled = true;
                      }
                      option.textContent = labelText;
                      sel.appendChild(option);
                  });

                  // Set default to the previously selected variant's option, or default
                  var optKey = 'option' + (optIdx + 1);
                  if (initialVariantObj[optKey]) {
                      sel.value = initialVariantObj[optKey];
                  }

                  sel.addEventListener('change', function() {
                      updateBundleVariantSelection(form, config, section, quantity);
                  });

                  selectsDiv.appendChild(sel);
              });

              row.appendChild(selectsDiv);
              section.appendChild(row);

              // Initialize this item's variant
              selectedBundleVariants.push({
                  variantId: initialVariantObj.id,
                  title: initialVariantObj.title,
                  price: initialVariantObj.price
              });
          })(i);
      }

      window.FoxCod._selectedBundleVariants = selectedBundleVariants;

      // Cards template: variant section goes in the wrapper (a column-flex div holding the cards row)
      // so it naturally renders below the horizontal cards row without any overflow issues.
      var isCardsTemplate = offersContainer && offersContainer.classList.contains('template-cards');
      // _cardsWrapper is set at creation time; when queried from DOM (e.g. modal re-query),
      // the parent IS the wrapper since we appended offersContainer into it.
      var cardsWrapper = (offersContainer && offersContainer._cardsWrapper) ||
                        (isCardsTemplate && offersContainer && offersContainer.parentNode &&
                         offersContainer.parentNode.classList.contains('foxcod-cards-wrapper')
                           ? offersContainer.parentNode : null);

      function insertAfterEl(newEl, refEl) {
          if (refEl && refEl.parentNode) refEl.parentNode.insertBefore(newEl, refEl.nextSibling);
      }

      if (isCardsTemplate && cardsWrapper) {
          // Clear inline flex styles meant for in-card injection
          section.style.flexBasis = '';
          section.style.order = '';
          section.style.width = '100%';
          section.style.boxSizing = 'border-box';
          cardsWrapper.appendChild(section);
          requestAnimationFrame(function() {
              requestAnimationFrame(function() {
                  section.classList.add('expanded');
              });
          });
      } else if (isCardsTemplate) {
          // Fallback: insert after the cards row (covers modal case without wrapper reference)
          section.style.flexBasis = '';
          section.style.order = '';
          section.style.width = '100%';
          section.style.boxSizing = 'border-box';
          insertAfterEl(section, offersContainer);
          requestAnimationFrame(function() {
              requestAnimationFrame(function() {
                  section.classList.add('expanded');
              });
          });
      } else {
          // All other templates: inject inside the selected card
          var selectedCard = offersContainer ? offersContainer.querySelector('.cod-offer-card.selected') : null;
          if (selectedCard) {
              selectedCard.appendChild(section);
              requestAnimationFrame(function() {
                  requestAnimationFrame(function() {
                      section.classList.add('expanded');
                  });
              });
          } else if (offersContainer && offersContainer.parentNode) {
              insertAfterEl(section, offersContainer);
          } else if (form) {
              form.insertBefore(section, form.firstChild);
          }
      }

      // Initial price update
      updateBundleVariantSelection(form, config, section, quantity);
  }

  function findMatchingVariant(selectedOptions) {
      var variants = window.FoxCod && window.FoxCod.productVariants;
      if (!variants) return null;
      return variants.find(function(v) {
          for (var i = 0; i < selectedOptions.length; i++) {
              if (v['option' + (i + 1)] !== selectedOptions[i]) return false;
          }
          return true;
      }) || null;
  }

  function updateBundleVariantSelection(form, config, section, quantity) {
      var options = window.FoxCod && window.FoxCod.productOptions;
      var variants = window.FoxCod && window.FoxCod.productVariants;
      if (!options || !variants) return;
      var bundleVariants = [];

      for (var i = 0; i < quantity; i++) {
          var selectedOpts = [];
          for (var j = 0; j < options.length; j++) {
              var sel = section.querySelector('select[data-item="' + i + '"][data-option-index="' + j + '"]');
              if (sel) selectedOpts.push(sel.value);
          }
          var matched = findMatchingVariant(selectedOpts);
          if (matched) {
              bundleVariants.push({ variantId: matched.id, title: matched.title, price: matched.price });
          } else {
              // Fallback to current variant
              bundleVariants.push({ variantId: config.variantId, title: config.productTitle, price: parseFloat(config.productPrice) || 0 });
          }

          // Update dropdown labels with resolved prices for this item row
          for (var j2 = 0; j2 < options.length; j2++) {
              var sel2 = section.querySelector('select[data-item="' + i + '"][data-option-index="' + j2 + '"]');
              if (!sel2) continue;
              var optionEls = sel2.querySelectorAll('option');
              optionEls.forEach(function(optEl) {
                  // Build hypothetical selection: replace only this option
                  var hypothetical = selectedOpts.slice();
                  hypothetical[j2] = optEl.value;
                  var hypotheticalVariant = findMatchingVariant(hypothetical);
                  var labelText = optEl.value;
                  if (hypotheticalVariant) {
                      labelText += ' — ' + formatMoney(hypotheticalVariant.price);
                      if (!hypotheticalVariant.available) {
                          labelText += ' — Out of stock';
                      }
                  }
                  optEl.textContent = labelText;
              });
          }
      }

      window.FoxCod._selectedBundleVariants = bundleVariants;

      // Only update pricing/shipping/save when inside a form (modal context)
      if (form) {
          // Use centralized pricing engine
          var state = calculateCheckoutState(form, config);
          renderOrderSummary(form, config, state);

          // Re-render shipping rates inside the modal only
          if (form.closest('.cod-modal')) {
              var fieldsContainer = form.querySelector('.cod-dynamic-fields-container');
              var shippingSection = form.querySelector('.cod-shipping-section');
              var shippingMarker = fieldsContainer ? fieldsContainer.querySelector('.cod-section-marker[data-section="shipping"]') : null;
              if (shippingSection) {
                  shippingSection.remove();
              }
              var hasNewShippingRates = config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0;
              var hasOldShippingOptions = config.shippingRatesEnabled && config.shippingOptions && config.shippingOptions.enabled;
              var shippingFieldVisible = (config.fields || []).some(function(f) { return f.id === 'shipping' && f.visible !== false; });
              var shippingEnabled2 = (config.blocks && config.blocks.shipping_options) || shippingFieldVisible;
              if (shippingEnabled2 && (hasNewShippingRates || hasOldShippingOptions)) {
                  renderShippingOptions(form, config);
                  if (shippingMarker) {
                      var newShippingSection = form.querySelector('.cod-shipping-section');
                      if (newShippingSection) {
                          shippingMarker.appendChild(newShippingSection);
                      }
                  }
              }
          }

          // Auto-save checkout state
          saveFoxCodCheckoutState(form);
      }
  }
  
  /**
   * Hide product header for at_top / above_button placements
   * Hides the entire .cod-product-info section (image, title, price, variant)
   */
  function hideProductHeaderIfOffersActive(container) {
      // Hide the entire product info section
      var productInfo = container.querySelector('.cod-product-info');
      if (productInfo) {
          productInfo.style.display = 'none';
          console.log('[COD Form] Product info section hidden');
      }
      // Also hide the quantity badge if it exists (bundle offers control quantity)
      var qtyBadge = container.querySelector('.cod-qty-badge');
      if (qtyBadge) {
          qtyBadge.style.display = 'none';
      }
      
      console.log('[COD Form] Product header hidden for non-in_product_page placement');
  }
  
  /**
   * Update price display based on selected offer
   */
  function updateOfferPrice(form, config, offer) {
    // Use centralized pricing engine for the price display
    var state = calculateCheckoutState(form, config);
    
    // .cod-product-price is in the modal container, NOT inside the form
    var modal = form.closest('.cod-modal') || form.parentElement;
    var priceElement = modal ? modal.querySelector('.cod-product-price') : form.querySelector('.cod-product-price');
    if (!priceElement) {
        console.log('[COD Form] updateOfferPrice: .cod-product-price not found');
        return;
    }
    
    var total = state.subtotal - state.discount;
    
    priceElement.innerHTML = formatMoney(total);
    if (state.discount > 0) {
      priceElement.innerHTML += ' <span style="text-decoration:line-through;color:#9ca3af;font-size:14px;">' + 
        formatMoney(state.subtotal) + '</span>';
    }
    priceElement.style.display = ''; // Ensure it's visible
    console.log('[COD Form] updateOfferPrice: updated to', total, 'with discount', state.discountPercent + '%');
  }

  /**
   * Initialize form functionality and render fields
   */
  function initForm(productId, config) {
    var container = getModalContainer(config);
    var form = getOrderFormElement(config);
    var fieldsContainer = form ? form.querySelector('.cod-dynamic-fields-container') : null;
    
    if (!form || !container || !fieldsContainer) return;

    // 1. Render Fields
    renderFields(fieldsContainer, config);

    // 1.5 Render Quantity Offers if applicable
    var quantityOffersResult = renderQuantityOffersWithPlacement(container, config);
    var quantityOffersEl = quantityOffersResult.element;
    var placement = quantityOffersResult.placement || 'at_top';
    
    if (quantityOffersEl) {
        console.log('[COD Form] Quantity offers placement:', placement);
        
        if (placement === 'in_product_page') {
            // Skip rendering inside modal when the offer cards are mounted in the block root.
            console.log('[COD Form] Skipping modal offers - in_product_page placement handled in block root');
        } else if (placement === 'above_button') {
            // Insert before submit button (after all other form elements like order summary)
            var submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                form.insertBefore(quantityOffersEl, submitBtn);
            } else {
                // Fallback: append to form
                form.appendChild(quantityOffersEl);
            }
        } else {
            // Default: at_top - insert before the dynamic fields container
            fieldsContainer.parentNode.insertBefore(quantityOffersEl, fieldsContainer);
        }
        
        // Auto-render variant selectors for the preselected offer
        // This ensures variant dropdowns appear immediately without clicking
        if (placement !== 'in_product_page') {
            var initialOffer = quantityOffersEl._initialSelectedOffer;
            if (initialOffer && parseInt(initialOffer.quantity) > 1) {
                renderBundleVariantSelectors(form, config, parseInt(initialOffer.quantity) || 1, quantityOffersEl);
            }
            // Trigger initial price + summary update for the preselected offer
            if (initialOffer) {
                setTimeout(function() {
                    updateOfferPrice(form, config, initialOffer);
                    updateOrderSummaryWithOffer(form, config, initialOffer);
                }, 100);
            }
        }
    }
    
    // Show product header (image + price) ONLY when bundle offers are NOT present
    // Only hide when there are actual bundle offers rendered
    if (quantityOffersEl && placement !== 'in_product_page') {
        hideProductHeaderIfOffersActive(container);
    }

    // Hide quantity selector when bundle offers are active (bundles control quantity)
    var qtySelector = container.querySelector('.cod-product-qty');
    var qtyBadge = container.querySelector('.cod-qty-badge');
    if (qtySelector) {
        // Check for bundle offers in the modal OR on the product page
        var hasProductPageOffers = document.querySelector('.cod-product-page-offers[data-product-id="' + config.productId + '"]');
        if (quantityOffersEl || hasProductPageOffers) {
            // Use setProperty with 'important' to override the CSS `display: flex !important` rule
            qtySelector.style.setProperty('display', 'none', 'important');
            if (qtyBadge) qtyBadge.style.setProperty('display', 'none', 'important');
            console.log('[COD Form] Hiding quantity selector — bundle offers active');
        } else {
            qtySelector.style.setProperty('display', 'flex', 'important');
            if (qtyBadge) qtyBadge.style.display = '';
        }
    }

    // 2. Render section fields (shipping, order_summary, marketing)
    //    The correct order is handled by marker divs created in renderFields.
    //    We render sections normally (they insert before submit), then move them into markers.
    //    First, render the sections:
    var sectionFieldIds = ['shipping', 'order_summary', 'marketing', 'payment_mode'];
    var sortedFields = (config.fields || []).slice().sort(function(a, b) { return a.order - b.order; });
    var hasNewShippingRates = config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0;
    var hasOldShippingOptions = config.shippingRatesEnabled && config.shippingOptions && config.shippingOptions.enabled;

    // Check which section fields exist in the fields array
    var hasSectionInFields = {};
    sortedFields.forEach(function(field) {
        if (sectionFieldIds.indexOf(field.id) !== -1) {
            hasSectionInFields[field.id] = true;
        }
    });

    // Render shipping section — check blocks flag OR fall back to field visibility
    var shippingField = sortedFields.find(function(f) { return f.id === 'shipping'; });
    var shippingEnabled = (config.blocks && config.blocks.shipping_options) || (shippingField && shippingField.visible !== false);
    if (shippingEnabled && (hasNewShippingRates || hasOldShippingOptions)) {
        try { renderShippingOptions(form, config); } catch(e) { console.error('[COD Form] Error rendering shipping:', e); }
    }
    // Render order summary section — check blocks flag OR fall back to field visibility
    var orderSummaryField = sortedFields.find(function(f) { return f.id === 'order_summary'; });
    var orderSummaryEnabled = (config.blocks && config.blocks.order_summary) || (orderSummaryField && orderSummaryField.visible !== false);
    if (orderSummaryEnabled) {
        try { renderRateCard(form, config); } catch(e) { console.error('[COD Form] Error rendering order summary:', e); }
    }
    // Render marketing checkbox — check blocks flag OR fall back to field visibility
    var marketingField = sortedFields.find(function(f) { return f.id === 'marketing'; });
    var marketingEnabled = (config.blocks && config.blocks.buyer_marketing) || (marketingField && marketingField.visible !== false);
    if (marketingEnabled) {
        renderMarketingCheckbox(form, config);
    }

    // 2.5 Render Payment Method Options if Partial COD is enabled AND the payment_mode field is visible
    // Must render BEFORE section move logic so the element exists when we try to move it
    var paymentModeField = (config.fields || []).find(function(f) { return f.id === 'payment_mode'; });
    var paymentModeVisible = paymentModeField ? paymentModeField.visible !== false : true;
    var ppSettings = config.partialPaymentSettings;
    var partialEnabled = (ppSettings && typeof ppSettings.enabled !== 'undefined') ? !!ppSettings.enabled : config.partialCodEnabled;
    var prepaidEnabled = !!(config.styles && config.styles.fullPrepaidEnabled);
    if (paymentModeVisible) {
        try { renderPaymentMethodOptions(form, config); } catch(e) { console.error('[COD Form] Error rendering payment options:', e); }
    }

    // Now move rendered sections into their marker positions in fieldsContainer
    // This ensures they appear at the correct drag-drop position among input fields
    var sectionSelectors = {
        'shipping': '.cod-shipping-section',
        'order_summary': '.cod-order-summary',
        'marketing': 'input[name="marketing_consent"]',
        'payment_mode': '.cod-payment-method-options'
    };
    ['shipping', 'order_summary', 'marketing', 'payment_mode'].forEach(function(sectionId) {
        var marker = fieldsContainer.querySelector('.cod-section-marker[data-section="' + sectionId + '"]');
        if (!marker) return; // no marker = not in fields array or not visible
        
        var sectionEl = null;
        if (sectionId === 'marketing') {
            // Marketing checkbox wrapper is the parent of the checkbox input
            var checkbox = form.querySelector('input[name="marketing_consent"]');
            sectionEl = checkbox ? checkbox.parentElement : null;
        } else {
            sectionEl = form.querySelector(sectionSelectors[sectionId]);
        }
        
        if (sectionEl) {
            marker.appendChild(sectionEl);
            console.log('[COD Form] Moved', sectionId, 'section into marker at correct position');
        }
    });

    // 4.5 Render Tick Upsells if available
    renderTickUpsells(form, config);

    
    // 5. Apply Modal Styles
    applyModalStyles(container, config);

    // Setup modal events
    setupModalEvents(productId, config);
    
    // Setup quantity selector
    setupQuantitySelector(form, config);

    // 6. Setup Smart Auto-fill
    setupAutoFill(form, config);

    // 7. Customer auto-fill is handled by setupAutoFill (phone-based lookup)
    // Form starts blank on every page load — no auto-fill from localStorage

    // 8. Attach auto-save listeners for persistent checkout state
    form.addEventListener('input', function() {
        saveFoxCodCheckoutState(form);
    });
    form.addEventListener('change', function() {
        saveFoxCodCheckoutState(form);
    });

    // Real-time country/phone change listeners to update payment eligibility immediately
    form.addEventListener('change', function(e) {
        var target = e.target;
        if (target) {
            var canonical = (typeof getCanonicalCustomerKeyForInput === 'function') ? getCanonicalCustomerKeyForInput(target) : '';
            if (canonical === 'country' || canonical === 'phone') {
                console.log('[FoxCod] Country/Phone field changed (change event), rechecking payment eligibility...');
                try { renderPaymentMethodOptions(form, config); } catch(err) { console.error('[COD Form] Error updating payment options on country change:', err); }
            }
        }
    });
    form.addEventListener('input', function(e) {
        var target = e.target;
        if (target) {
            var canonical = (typeof getCanonicalCustomerKeyForInput === 'function') ? getCanonicalCustomerKeyForInput(target) : '';
            if (canonical === 'country' || canonical === 'phone') {
                console.log('[FoxCod] Country/Phone field input updated, rechecking payment eligibility...');
                try { renderPaymentMethodOptions(form, config); } catch(err) { console.error('[COD Form] Error updating payment options on phone/country input:', err); }
            }
        }
    });

    // Always apply submit button styles (product button styles or custom override)
    var submitBtnEl = form.querySelector('.cod-submit-btn');
    applySubmitButtonStyles(submitBtnEl, config);

    // Setup Form Submission
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      handleFormSubmit(e, productId, config);
    });
  }

  /**
   * Icon SVGs for form fields
   */
  var FIELD_ICONS = {
    phone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
    name: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    email: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
    address: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
    notes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg>',
    quantity: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>'
  };

  function normalizeCustomerFieldToken(raw) {
      return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function resolveCanonicalCustomerField(raw) {
      var token = normalizeCustomerFieldToken(raw);
      if (!token) return '';

      if (['name', 'fullname', 'customername', 'buyername'].indexOf(token) !== -1) return 'name';
      if (['firstname', 'givenname', 'first'].indexOf(token) !== -1) return 'firstName';
      if (['lastname', 'familyname', 'surname', 'last'].indexOf(token) !== -1) return 'lastName';
      if (['phone', 'mobile', 'phonenumber', 'customerphone', 'tel', 'telephone', 'whatsappnumber'].indexOf(token) !== -1) return 'phone';
      if (['email', 'customeremail', 'mail'].indexOf(token) !== -1) return 'email';
      if (['address', 'customeraddress', 'deliveryaddress', 'streetaddress', 'address1'].indexOf(token) !== -1) return 'address';
      if (['city', 'town'].indexOf(token) !== -1) return 'city';
      if (['state', 'province', 'region'].indexOf(token) !== -1) return 'state';
      if (['zip', 'zipcode', 'postalcode', 'pincode', 'postcode'].indexOf(token) !== -1) return 'zipcode';
      if (['country', 'countrycode'].indexOf(token) !== -1) return 'country';
      return '';
  }

  function getAutocompleteAttr(field) {
      var canonical = resolveCanonicalCustomerField(field && field.label);
      if (!canonical) canonical = resolveCanonicalCustomerField(field && field.id);

      if (canonical === 'name') return 'name';
      if (canonical === 'firstName') return 'given-name';
      if (canonical === 'lastName') return 'family-name';
      if (canonical === 'phone') return 'tel';
      if (canonical === 'email') return 'email';
      if (canonical === 'address') return 'street-address';
      if (canonical === 'city') return 'address-level2';
      if (canonical === 'state') return 'address-level1';
      if (canonical === 'zipcode') return 'postal-code';
      return 'off';
  }

  function getCanonicalCustomerKeyForInput(input) {
      if (!input) return '';
      var candidates = [];
      if (input.name) candidates.push(input.name);
      if (input.id) candidates.push(String(input.id).replace(/^cod-/, ''));
      var dataLabel = input.getAttribute('data-field-label');
      if (dataLabel) candidates.push(dataLabel);
      var wrapper = input.closest('.cod-form-field');
      if (wrapper) {
          var labelEl = wrapper.querySelector('label');
          if (labelEl) candidates.push(labelEl.textContent || '');
      }
      for (var i = 0; i < candidates.length; i++) {
          var canonical = resolveCanonicalCustomerField(candidates[i]);
          if (canonical) return canonical;
      }
      return '';
  }

  function findInputByCanonicalKey(form, key) {
      if (!form || !key) return null;
      var all = form.querySelectorAll('input, textarea, select');
      for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio') continue;
          if (getCanonicalCustomerKeyForInput(el) === key) return el;
      }
      return null;
  }

  function collectNormalizedCustomerFromForm(form) {
      var result = {
          name: '',
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          address: '',
          city: '',
          state: '',
          country: '',
          zipcode: ''
      };
      if (!form) return result;

      var all = form.querySelectorAll('input, textarea, select');
      all.forEach(function(el) {
          if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'submit' || el.type === 'button') return;
          var canonical = getCanonicalCustomerKeyForInput(el);
          if (!canonical) return;
          var val = String(el.value || '').trim();
          if (!val) return;
          if (!result[canonical]) result[canonical] = val;
      });

      if (!result.name) {
          if (result.firstName && result.lastName) result.name = (result.firstName + ' ' + result.lastName).trim();
          else if (result.firstName) result.name = result.firstName;
      }
      if (!result.firstName && result.name) result.firstName = result.name.split(/\s+/)[0] || '';
      if (!result.lastName && result.name) result.lastName = result.name.split(/\s+/).slice(1).join(' ');
      return result;
  }

  function getCouponState(config) {
      if (!config._couponState) {
          config._couponState = {
              applied: false,
              validating: false,
              code: '',
              discount: 0,
              originalTotal: 0,
              finalTotal: 0,
              message: '',
              tone: '',
          };
      }
      return config._couponState;
  }

  function getCouponUi(form) {
      if (!form) {
          return { wrapper: null, input: null, button: null, status: null, badge: null };
      }
      return {
          wrapper: form.querySelector('.cod-coupon-field'),
          input: form.querySelector('input[name="coupon"]'),
          button: form.querySelector('.cod-coupon-apply'),
          status: form.querySelector('.cod-coupon-status'),
          badge: form.querySelector('.cod-coupon-badge')
      };
  }

  function syncCouponUi(form, config) {
      if (!form) return;
      var couponState = getCouponState(config);
      var ui = getCouponUi(form);
      if (!ui.wrapper || !ui.input || !ui.button) return;

      var accentColor = (config.styles && config.styles.borderColor) || config.formThemeColor || config.accentColor || '#111827';
      var softBg = hexToRgba(accentColor, 0.1) || 'rgba(17,24,39,0.08)';
      var deepBg = hexToRgba(accentColor, 0.18) || 'rgba(17,24,39,0.12)';
      var statusTone = couponState.tone || (couponState.applied ? 'success' : '');
      var statusColor = statusTone === 'error' ? '#dc2626' : statusTone === 'warning' ? '#b45309' : statusTone === 'success' ? '#059669' : '#6b7280';

      ui.input.readOnly = !!couponState.applied;
      if (couponState.applied) {
          ui.input.value = couponState.code || ui.input.value;
      }
      ui.button.disabled = couponState.validating || couponState.applied || !String(ui.input.value || '').trim();
      ui.button.textContent = couponState.validating ? 'Applying...' : couponState.applied ? 'Applied' : 'Apply';
      ui.button.style.opacity = ui.button.disabled ? '0.75' : '1';
      ui.button.style.cursor = ui.button.disabled ? 'not-allowed' : 'pointer';
      ui.button.style.background = couponState.applied
          ? 'linear-gradient(135deg, ' + accentColor + ' 0%, ' + ((config.formThemeColor && config.formThemeColor !== accentColor) ? config.formThemeColor : accentColor) + ' 100%)'
          : 'linear-gradient(135deg, ' + deepBg + ' 0%, ' + softBg + ' 100%)';
      ui.button.style.color = couponState.applied ? '#ffffff' : accentColor;
      ui.button.style.borderColor = accentColor;
      ui.button.style.boxShadow = couponState.applied
          ? ('0 12px 26px ' + (hexToRgba(accentColor, 0.28) || 'rgba(17,24,39,0.24)'))
          : 'none';

      if (ui.status) {
          ui.status.textContent = couponState.message || '';
          ui.status.style.display = couponState.message ? 'block' : 'none';
          ui.status.style.color = statusColor;
      }

      if (ui.badge) {
          if (couponState.applied && couponState.discount > 0) {
              ui.badge.textContent = '- ' + formatMoney(couponState.discount);
              ui.badge.style.display = 'inline-flex';
              ui.badge.style.background = softBg;
              ui.badge.style.color = accentColor;
          } else {
              ui.badge.style.display = 'none';
          }
      }
  }

  function resetAppliedCoupon(form, config, options) {
      if (!form) return;
      var couponState = getCouponState(config);
      var preserveCode = options && options.preserveCode;
      var message = options && options.message ? options.message : '';
      var tone = options && options.tone ? options.tone : '';
      var ui = getCouponUi(form);

      couponState.applied = false;
      couponState.validating = false;
      couponState.discount = 0;
      couponState.originalTotal = 0;
      couponState.finalTotal = 0;
      couponState.message = message;
      couponState.tone = tone;

      if (ui.input && !preserveCode) {
          ui.input.value = '';
          couponState.code = '';
      }

      syncCouponUi(form, config);
  }

  function applyCouponCode(form, config) {
      if (!form) return;
      var ui = getCouponUi(form);
      if (!ui.input || !ui.button) return;

      var couponCode = String(ui.input.value || '').trim();
      if (!couponCode) {
          var emptyState = getCouponState(config);
          emptyState.message = 'Enter a coupon code first';
          emptyState.tone = 'error';
          syncCouponUi(form, config);
          return;
      }

      var couponState = getCouponState(config);
      if (couponState.applied || couponState.validating) return;

      var checkoutState = calculateCheckoutState(form, config);
      var normalizedCustomer = collectNormalizedCustomerFromForm(form);
      var preUpsellItems = [];
      try { preUpsellItems = JSON.parse(form.getAttribute('data-pre-upsell-items') || '[]'); } catch (e) {}
      var requestUpsells = getCheckedTickUpsells(form, config).concat(preUpsellItems);
      var requestPrice = parseFloat(config.productPrice) || 0;
      var requestQuantity = checkoutState.quantity;
      var requestDiscountPercent = checkoutState.discountPercent || 0;

      if (checkoutState.downsellItems && checkoutState.downsellItems.length > 0) {
          requestPrice = parseFloat(checkoutState.downsellItems[0].price) || requestPrice;
          requestQuantity = 1;
          requestDiscountPercent = 0;
      }

      var requestBody = {
          shop: config.shop,
          couponCode: couponCode,
          productId: config.productId,
          variantId: config.variantId,
          quantity: requestQuantity,
          price: requestPrice,
          shippingPrice: checkoutState.shipping || 0,
          discountPercent: requestDiscountPercent,
          cartTotal: checkoutState.totalBeforeCoupon || checkoutState.total || 0,
          bundleVariants: window.FoxCod && window.FoxCod._selectedBundleVariants && window.FoxCod._selectedBundleVariants.length > 1
              ? window.FoxCod._selectedBundleVariants.map(function(variant) {
                  return { variantId: variant.variantId, title: variant.title, price: variant.price, quantity: 1 };
              })
              : undefined,
          upsell_items: requestUpsells,
          items: checkoutState.items || [],
          customerName: normalizedCustomer.name || '',
          customerPhone: normalizedCustomer.phone || '',
          customerEmail: normalizedCustomer.email || ''
      };

      couponState.validating = true;
      couponState.message = '';
      couponState.tone = '';
      syncCouponUi(form, config);

      requestProxyJson(config, '/api/validate-coupon', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
      })
      .then(function(result) {
          couponState.validating = false;
          if (result && result.valid) {
              couponState.applied = true;
              couponState.code = couponCode.toUpperCase();
              couponState.discount = parseFloat(result.discount) || 0;
              couponState.originalTotal = parseFloat(result.originalTotal) || requestBody.cartTotal || 0;
              couponState.finalTotal = parseFloat(result.finalTotal) || 0;
              couponState.message = result.message || 'Coupon applied';
              couponState.tone = 'success';
          } else {
              couponState.message = (result && result.message) || 'Invalid or expired coupon';
              couponState.tone = 'error';
          }
          renderOrderSummary(form, config, calculateCheckoutState(form, config));
          syncCouponUi(form, config);
      })
      .catch(function(error) {
          couponState.validating = false;
          couponState.message = error && error.message ? error.message : 'Unable to validate coupon right now';
          couponState.tone = 'error';
          syncCouponUi(form, config);
      });
  }

  /**
   * Render dynamic fields
   */
  function renderFields(container, config) {
    console.log('[COD Form] renderFields called');
    console.log('[COD Form] Container:', container);
    console.log('[COD Form] Config fields:', config.fields);
    console.log('[COD Form] Config.styles:', config.styles);
    
    var styles = config.styles || {};
    var textColor = styles.textColor || '#374151';
    var textSize = styles.textSize ?? 14;
    var fontStyle = styles.fontStyle || 'normal';
    var labelAlignment = styles.labelAlignment || 'left';
    var borderRadius = styles.borderRadius ?? 6;
    var borderColor = styles.borderColor || '#d1d5db';
    var borderWidth = styles.borderWidth ?? 1;
    var backgroundColor = styles.background || styles.backgroundImage || styles.backgroundColor || 'transparent';
    var iconColor = styles.iconColor || '#6b7280';
    var iconBackground = styles.iconBackground || 'transparent';

    // Shadow intensity (0–100) comes from settings; fall back to boolean `shadow`.
    var rawShadowIntensity = typeof styles.shadowIntensity === 'number' ? styles.shadowIntensity : (styles.shadow ? 35 : 0);
    var shadowSlider = Math.max(0, Math.min(100, rawShadowIntensity));
    var shadowOpacity = shadowSlider === 0 ? 0 : 0.05 + (shadowSlider / 100) * 0.25; // 0.05 – 0.30
    var hasShadow = shadowSlider > 0;

    // Focus ring colors — always use accent color for consistency
    var primaryThemeColor = config.accentColor || '#111827';
    var focusGlowColor = hexToRgba(primaryThemeColor, 0.2) || 'rgba(17,24,39,0.2)';
    var currentForm = container.closest('form');
    
    container.innerHTML = '';
    
    // Sort fields by order
    var sortedFields = config.fields.sort(function(a, b) { return a.order - b.order; });
    
    console.log('[COD Form] Sorted fields:', sortedFields);

    sortedFields.forEach(function(field) {
        console.log('[COD Form] Processing field:', field.id, 'visible:', field.visible);
        
        // Skip quantity field — now rendered in cod-product-qty next to product image
        if (field.id === 'quantity') {
            console.log('[COD Form] Skipping quantity field (moved to product info)');
            return;
        }
        
        // Section fields — create a marker div at the correct position so rendered sections can be moved here
        if (field.id === 'shipping' || field.id === 'order_summary' || field.id === 'marketing' || field.id === 'payment_mode') {
            if (!field.visible) {
                console.log('[COD Form] Skipping hidden section field:', field.id);
                return;
            }
            var marker = document.createElement('div');
            marker.className = 'cod-section-marker';
            marker.setAttribute('data-section', field.id);
            container.appendChild(marker);
            console.log('[COD Form] Created marker for section field:', field.id);
            return;
        }
        
        var isDynamicLocationField = (field.id === 'state' || field.id === 'country') && config.blocks && (config.blocks.enable_state_province !== false);

        if (!field.visible && !isDynamicLocationField) {
            console.log('[COD Form] Skipping invisible field:', field.id);
            return;
        }

        if (field.id === 'coupon') {
            var couponWrapper = document.createElement('div');
            couponWrapper.className = 'cod-form-field cod-coupon-field';
            couponWrapper.style.marginBottom = '12px';
            if (isDynamicLocationField && !field.visible) {
                couponWrapper.style.display = 'none'; // Edge case, shouldn't happen for coupon
            }
            couponWrapper.style.padding = '12px';
            couponWrapper.style.borderRadius = Math.max(borderRadius + 3, 15) + 'px';
            couponWrapper.style.background = 'linear-gradient(135deg, ' + (hexToRgba(primaryThemeColor, 0.14) || 'rgba(17,24,39,0.08)') + ' 0%, ' + (styles.fieldBackgroundColor || '#ffffff') + ' 58%, ' + (hexToRgba(config.formThemeColor || primaryThemeColor, 0.08) || 'rgba(17,24,39,0.04)') + ' 100%)';
            couponWrapper.style.border = '1px solid ' + (hexToRgba(primaryThemeColor, 0.22) || 'rgba(17,24,39,0.14)');
            couponWrapper.style.boxShadow = '0 10px 24px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.75)';
            couponWrapper.style.position = 'relative';
            couponWrapper.style.overflow = 'hidden';

            var couponGlow = document.createElement('div');
            couponGlow.style.position = 'absolute';
            couponGlow.style.inset = '0';
            couponGlow.style.background = 'radial-gradient(circle at top right, ' + (hexToRgba(config.formThemeColor || primaryThemeColor, 0.18) || 'rgba(17,24,39,0.12)') + ' 0%, transparent 42%)';
            couponGlow.style.pointerEvents = 'none';
            couponWrapper.appendChild(couponGlow);

            var couponHeader = document.createElement('div');
            couponHeader.style.display = 'flex';
            couponHeader.style.alignItems = 'center';
            couponHeader.style.gap = '10px';
            couponHeader.style.marginBottom = '8px';

            var couponHeaderLeft = document.createElement('div');
            couponHeaderLeft.style.display = 'flex';
            couponHeaderLeft.style.alignItems = 'center';
            couponHeaderLeft.style.gap = '10px';

            var couponIconBadge = document.createElement('div');
            couponIconBadge.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5A2.5 2.5 0 0 1 5.5 7H9l1.2-1.9a1 1 0 0 1 .84-.46H18.5A2.5 2.5 0 0 1 21 7v3a2 2 0 0 0 0 4v3a2.5 2.5 0 0 1-2.5 2.5H11a1 1 0 0 1-.84-.46L9 17H5.5A2.5 2.5 0 0 1 3 14.5v-5Z"></path><path d="M14 7v10"></path><path d="M14 10h.01"></path><path d="M14 14h.01"></path></svg>';
            couponIconBadge.style.width = '40px';
            couponIconBadge.style.height = '40px';
            couponIconBadge.style.display = 'flex';
            couponIconBadge.style.alignItems = 'center';
            couponIconBadge.style.justifyContent = 'center';
            couponIconBadge.style.borderRadius = '12px';
            couponIconBadge.style.color = primaryThemeColor;
            couponIconBadge.style.background = 'linear-gradient(135deg, ' + (hexToRgba(primaryThemeColor, 0.16) || 'rgba(17,24,39,0.12)') + ' 0%, rgba(255,255,255,0.82) 100%)';
            couponIconBadge.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.85)';
            couponHeaderLeft.appendChild(couponIconBadge);

            var couponTitleWrap = document.createElement('div');

            var couponLabel = document.createElement('label');
            couponLabel.style.display = 'block';
            couponLabel.style.fontWeight = fontStyle === 'bold' ? '700' : '500';
            couponLabel.style.fontStyle = fontStyle === 'italic' ? 'italic' : 'normal';
            couponLabel.style.setProperty('margin-bottom', '2px', 'important');
            couponLabel.style.fontSize = Math.max((styles.labelFontSize || textSize), 15) + 'px';
            couponLabel.style.color = styles.labelColor || textColor;
            couponLabel.style.textAlign = labelAlignment;
            couponLabel.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            couponLabel.textContent = field.label || 'Coupon Code';
            couponTitleWrap.appendChild(couponLabel);

            var couponHint = document.createElement('div');
            couponHint.textContent = 'Apply your exclusive offer before placing the order';
            couponHint.style.fontSize = '12px';
            couponHint.style.lineHeight = '1.4';
            couponHint.style.color = '#6b7280';
            couponTitleWrap.appendChild(couponHint);
            couponHeaderLeft.appendChild(couponTitleWrap);
            couponHeader.appendChild(couponHeaderLeft);
            couponWrapper.appendChild(couponHeader);

            var couponRow = document.createElement('div');
            couponRow.style.display = 'grid';
            couponRow.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
            couponRow.style.alignItems = 'stretch';
            couponRow.style.gap = '8px';

            var couponInputWrap = document.createElement('div');
            couponInputWrap.style.position = 'relative';
            couponInputWrap.style.flex = '1';
            couponInputWrap.style.minWidth = '0';

            var couponIcon = document.createElement('div');
            couponIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5A2.5 2.5 0 0 1 5.5 7H9l1.2-1.9a1 1 0 0 1 .84-.46H18.5A2.5 2.5 0 0 1 21 7v3a2 2 0 0 0 0 4v3a2.5 2.5 0 0 1-2.5 2.5H11a1 1 0 0 1-.84-.46L9 17H5.5A2.5 2.5 0 0 1 3 14.5v-5Z"></path><path d="M14 7v10"></path><path d="M14 10h.01"></path><path d="M14 14h.01"></path></svg>';
            couponIcon.style.position = 'absolute';
            couponIcon.style.left = '12px';
            couponIcon.style.top = '50%';
            couponIcon.style.transform = 'translateY(-50%)';
            couponIcon.style.color = iconColor;
            couponIcon.style.backgroundColor = iconBackground !== 'transparent' ? iconBackground : '';
            couponIcon.style.borderRadius = '4px';
            couponIcon.style.padding = '2px';
            couponIcon.style.pointerEvents = 'none';
            couponIcon.style.zIndex = '1';
            couponInputWrap.appendChild(couponIcon);

            var couponInput = document.createElement('input');
            couponInput.type = 'text';
            couponInput.name = 'coupon';
            couponInput.id = 'cod-coupon';
            couponInput.placeholder = field.placeholder || 'Enter Coupon Code';
            couponInput.setAttribute('autocomplete', 'off');
            couponInput.style.width = '100%';
            couponInput.style.padding = '10px 12px 10px 40px';
            couponInput.style.border = '1px solid ' + (hexToRgba(primaryThemeColor, 0.2) || borderColor);
            couponInput.style.borderRadius = Math.max(borderRadius + 1, 13) + 'px';
            var minCouponFontSize = (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ? 16 : 14;
            couponInput.style.fontSize = Math.max(textSize, minCouponFontSize) + 'px';
            couponInput.style.fontWeight = '700';
            couponInput.style.letterSpacing = '0.02em';
            couponInput.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            couponInput.style.color = textColor;
            couponInput.style.background = 'rgba(255,255,255,0.94)';
            couponInput.style.boxSizing = 'border-box';
            couponInput.style.boxShadow = '0 6px 18px rgba(15,23,42,0.05)';
            couponInput.style.transition = 'border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, transform 0.15s ease';
            couponInput.addEventListener('input', function() {
                this.value = String(this.value || '').toUpperCase().replace(/\s+/g, '');
                var couponState = getCouponState(config);
                if (!couponState.applied) {
                    couponState.message = '';
                    couponState.tone = '';
                    syncCouponUi(currentForm, config);
                }
            });
            couponInput.addEventListener('focus', function() {
                this.style.outline = 'none';
                this.style.borderColor = primaryThemeColor;
                this.style.transform = 'translateY(-1px)';
                this.style.boxShadow = '0 0 0 1px ' + primaryThemeColor + ', 0 0 0 4px ' + focusGlowColor + ', 0 12px 22px rgba(15,23,42,0.07)';
            });
            couponInput.addEventListener('blur', function() {
                this.style.transform = 'translateY(0)';
                this.style.border = '1px solid ' + (hexToRgba(primaryThemeColor, 0.2) || borderColor);
                this.style.boxShadow = '0 6px 18px rgba(15,23,42,0.05)';
            });
            couponInput.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyCouponCode(currentForm, config);
                }
            });
            couponInputWrap.appendChild(couponInput);

            var couponButton = document.createElement('button');
            couponButton.type = 'button';
            couponButton.className = 'cod-coupon-apply';
            couponButton.textContent = 'Apply';
            couponButton.style.minWidth = '92px';
            couponButton.style.borderRadius = Math.max(borderRadius + 1, 13) + 'px';
            couponButton.style.border = '1px solid ' + primaryThemeColor;
            couponButton.style.padding = '0 12px';
            couponButton.style.fontSize = '12px';
            couponButton.style.fontWeight = '800';
            couponButton.style.letterSpacing = '0.02em';
            couponButton.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            couponButton.style.transition = 'all 0.18s ease';
            couponButton.style.position = 'relative';
            couponButton.style.overflow = 'hidden';
            couponButton.style.whiteSpace = 'nowrap';
            couponButton.addEventListener('click', function() {
                applyCouponCode(currentForm, config);
            });

            couponRow.appendChild(couponInputWrap);
            couponRow.appendChild(couponButton);
            couponWrapper.appendChild(couponRow);

            var couponMeta = document.createElement('div');
            couponMeta.style.display = 'flex';
            couponMeta.style.alignItems = 'center';
            couponMeta.style.justifyContent = 'space-between';
            couponMeta.style.gap = '10px';
            couponMeta.style.marginTop = '8px';

            var couponStatus = document.createElement('div');
            couponStatus.className = 'cod-coupon-status';
            couponStatus.style.fontSize = '12px';
            couponStatus.style.lineHeight = '1.4';
            couponStatus.style.display = 'none';
            couponStatus.style.maxWidth = '72%';
            couponMeta.appendChild(couponStatus);

            var couponBadge = document.createElement('div');
            couponBadge.className = 'cod-coupon-badge';
            couponBadge.style.display = 'none';
            couponBadge.style.alignItems = 'center';
            couponBadge.style.justifyContent = 'center';
            couponBadge.style.padding = '6px 10px';
            couponBadge.style.borderRadius = '999px';
            couponBadge.style.fontSize = '12px';
            couponBadge.style.fontWeight = '700';
            couponMeta.appendChild(couponBadge);

            couponWrapper.appendChild(couponMeta);
            container.appendChild(couponWrapper);
            setTimeout(function() { syncCouponUi(currentForm, config); }, 0);
            console.log('[COD Form] Added coupon field to container');
            return;
        }

        var isCityVisible = config.fields.some(function(f) { return f.id === 'city' && f.visible !== false; });
        var isZipVisible = config.fields.some(function(f) { return (f.id === 'zip' || f.id === 'zipcode') && f.visible !== false; });
        var isSideBySide = (field.id === 'city' || field.id === 'zip' || field.id === 'zipcode') && isCityVisible && isZipVisible;

        var wrapper = document.createElement('div');
        wrapper.className = 'cod-form-field';
        if (isDynamicLocationField && !field.visible) {
            wrapper.style.display = 'none'; // Initially hidden
        }
        if (isSideBySide) {
            wrapper.style.display = (isDynamicLocationField && !field.visible) ? 'none' : 'inline-block';
            wrapper.style.width = 'calc(50% - 6px)';
            wrapper.style.verticalAlign = 'top';
            wrapper.style.marginRight = field.id === 'city' ? '12px' : '0px';
            wrapper.style.boxSizing = 'border-box';
            wrapper.style.marginBottom = '0px';
        } else {
            wrapper.style.marginBottom = '0px';
            wrapper.style.display = (isDynamicLocationField && !field.visible) ? 'none' : 'block';
            wrapper.style.width = '100%';
        }

        var label = document.createElement('label');
        label.style.display = 'block';
        label.style.fontWeight = fontStyle === 'bold' ? '700' : '500';
        label.style.fontStyle = fontStyle === 'italic' ? 'italic' : 'normal';
        label.style.setProperty('margin-bottom', '2px', 'important');
        label.style.fontSize = (styles.labelFontSize || textSize) + 'px';
        label.style.color = styles.labelColor || textColor;
        label.style.textAlign = labelAlignment;
        label.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        label.innerHTML = field.label + (field.required ? ' <span style="color:#e53935">*</span>' : '');
        wrapper.appendChild(label);

        // Input container with icon
        var inputContainer = document.createElement('div');
        inputContainer.style.position = 'relative';
        
        // Add icon directly based on field type
        var iconSvg = '';
        var svgHash = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';
        var svgUser = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
        var svgText = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>';
        var svgList = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>';
        var svgStar = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>';
        var svgNote = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg>';
        var svgLocation = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';

        if (field.isCustom && field.iconType) {
            if (field.iconType === 'hash') iconSvg = svgHash;
            else if (field.iconType === 'user') iconSvg = svgUser;
            else if (field.iconType === 'text') iconSvg = svgText;
            else if (field.iconType === 'list') iconSvg = svgList;
            else if (field.iconType === 'star') iconSvg = svgStar;
            else if (field.iconType === 'note') iconSvg = svgNote;
            else if (field.iconType === 'location') iconSvg = svgLocation;
            else if (field.iconType === 'phone') iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
            else if (field.iconType === 'email') iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>';
            else iconSvg = svgText;
        } else if (field.id === 'phone') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
        } else if (field.id === 'name') {
            iconSvg = svgUser;
        } else if (field.id === 'email') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>';
        } else if (field.id === 'address') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
        } else if (field.id === 'notes') {
            iconSvg = svgNote;
        } else if (field.id === 'quantity') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>';
        } else if (field.id === 'zip' || field.id === 'zipcode') {
            iconSvg = svgHash;
        } else if (field.id === 'state' || field.id === 'city') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
        } else {
            // Default icon for unknown fields
            iconSvg = svgText;
        }
        
        if (iconSvg) {
            var iconWrapper = document.createElement('div');
            iconWrapper.innerHTML = iconSvg;
            iconWrapper.style.position = 'absolute';
            iconWrapper.style.left = '12px';
            iconWrapper.style.top = field.type === 'textarea' ? '12px' : '50%';
            iconWrapper.style.transform = field.type === 'textarea' ? 'none' : 'translateY(-50%)';
            iconWrapper.style.color = iconColor;
            iconWrapper.style.backgroundColor = iconBackground !== 'transparent' ? iconBackground : '';
            iconWrapper.style.borderRadius = '4px';
            iconWrapper.style.padding = '2px';
            iconWrapper.style.pointerEvents = 'none';
            iconWrapper.style.zIndex = '1';
            iconWrapper.style.display = 'flex';
            iconWrapper.style.alignItems = 'center';
            inputContainer.appendChild(iconWrapper);
        }
        
        // Input
        var input;
        
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = field.id === 'address' ? 3 : 2;
        } else if (field.type === 'dropdown' || isDynamicLocationField) {
            input = document.createElement('select');
            // Add placeholder option
            var placeholderOpt = document.createElement('option');
            placeholderOpt.value = '';
            placeholderOpt.textContent = field.placeholder || ('Select ' + field.label);
            placeholderOpt.disabled = true;
            placeholderOpt.selected = true;
            input.appendChild(placeholderOpt);
            // Add options logic if custom fields have options
            if (field.options && field.type === 'dropdown') {
                field.options.forEach(function(opt) {
                    var option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    input.appendChild(option);
                });
            }
        } else if (field.type === 'checkbox') {
            // Render checkbox as inline checkbox + label (no icon wrapper needed)
            var checkboxWrapper = document.createElement('div');
            checkboxWrapper.style.display = 'flex';
            checkboxWrapper.style.alignItems = 'center';
            checkboxWrapper.style.gap = '8px';
            checkboxWrapper.style.marginBottom = '6px';
            checkboxWrapper.style.padding = '8px 0';

            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.name = field.id;
            cb.id = 'cod-' + field.id;
            cb.style.width = '16px';
            cb.style.height = '16px';
            cb.style.cursor = 'pointer';
            if (field.required) {
                cb.setAttribute('data-required', 'true');
            }

            var cbLabel = document.createElement('span');
            cbLabel.style.fontSize = (styles.labelFontSize || textSize) + 'px';
            cbLabel.style.color = styles.labelColor || textColor;
            cbLabel.textContent = field.label;
            if (field.required) {
                cbLabel.innerHTML = field.label + ' <span style="color:#e53935">*</span>';
            }

            checkboxWrapper.appendChild(cb);
            checkboxWrapper.appendChild(cbLabel);
            wrapper.innerHTML = ''; // remove the label we already added
            wrapper.appendChild(checkboxWrapper);
            container.appendChild(wrapper);
            console.log('[COD Form] Added checkbox field to container:', field.id);
            return; // skip the rest — no inputContainer needed
        } else {
            input = document.createElement('input');
            input.type = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text';
        }

        // Common Input Attributes
        input.name = field.id; // e.g. 'name', 'phone', 'address'
        input.id = 'cod-' + field.id;
        input.setAttribute('data-field-label', field.label || '');
        input.placeholder = field.placeholder || 'Enter ' + field.label.toLowerCase();
        if (field.required) {
          input.required = true;
          input.setAttribute('data-required', 'true');
        }
        
        // Add browser autocomplete attributes for native autofill
        input.setAttribute('autocomplete', getAutocompleteAttr(field));
        
        // Set default value of 1 for quantity field
        if (field.id === 'quantity' && field.type === 'number') {
            input.value = 1;
            input.min = 1;
            input.max = config.maxQuantity || 10;
        }
        
        
        input.style.width = '100%';
        input.style.padding = field.type === 'textarea' ? '10px 12px 10px 40px' : '10px 12px 10px 40px';
        input.style.border = borderWidth + 'px solid ' + borderColor;
        input.style.borderRadius = borderRadius + 'px';
        input.style.fontSize = Math.max(textSize, 16) + 'px'; // minimum 16px to prevent iOS auto-zoom
        input.style.fontWeight = '400';
        input.style.fontStyle = 'normal';
        input.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        input.style.color = textColor; // Input text color
        if (styles.fieldBackgroundColor) {
            input.style.setProperty('background-color', styles.fieldBackgroundColor, 'important');
        } else {
            input.style.backgroundColor = '#ffffff';
        }
        input.style.boxShadow = hasShadow ? ('0 1px 2px rgba(0,0,0,' + shadowOpacity.toFixed(2) + ')') : 'none';
        input.style.boxSizing = 'border-box';
        input.style.marginBottom = '0';

        // Store reference to wrapper (outer div) on the input for validation error placement
        input._foxcodWrapper = wrapper;

        inputContainer.appendChild(input);
        wrapper.appendChild(inputContainer);
        container.appendChild(wrapper);

        // Focus / blur styling — dual ring via accent color
        input.style.transition = 'border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease';

        input.addEventListener('focus', function() {
          this.style.outline = 'none';
          this.style.borderColor = primaryThemeColor;
          this.style.boxShadow = '0 0 0 1px ' + primaryThemeColor + ', 0 0 0 4px ' + focusGlowColor;
        });

        input.addEventListener('blur', function() {
          this.style.border = borderWidth + 'px solid ' + borderColor;
          this.style.boxShadow = hasShadow ? ('0 1px 2px rgba(0,0,0,' + shadowOpacity.toFixed(2) + ')') : 'none';
        });

        // Clear validation error on input
        input.addEventListener('input', function() {
          // Restore original border instead of just removing the property
          this.style.setProperty('border', borderWidth + 'px solid ' + borderColor, 'important');
          // Restore field background color instead of just removing the property
          if (styles.fieldBackgroundColor) {
            this.style.setProperty('background-color', styles.fieldBackgroundColor, 'important');
          } else {
            this.style.removeProperty('background-color');
          }
          // Remove shake class from inputContainer (the positioned parent)
          var inputCont = this.parentNode;
          if (inputCont) {
            inputCont.classList.remove('foxcod-shake');
          }
          // Remove error text from wrapper (outer div, sibling of inputContainer)
          var outerWrapper = inputCont && inputCont.parentNode;
          if (outerWrapper) {
            var errText = outerWrapper.querySelector('.foxcod-error-text');
            if (errText) errText.remove();
          }
        });
        
        console.log('[COD Form] Added field to container:', field.id);
    });
    
    console.log('[COD Form] renderFields completed. Container children count:', container.children.length);
    if (config.blocks && config.blocks.enable_state_province !== false) {
        initializeLocationDropdowns(container, config);
    }
  }

  function initializeLocationDropdowns(container, config) {
      if (!config.blocks || config.blocks.enable_state_province === false) return;
      var currentForm = container.closest('form') || container;
      var countryInput = currentForm.querySelector('select[name="country"]');
      var stateInput = currentForm.querySelector('select[name="state"]');
      
      if (!countryInput && !stateInput) return;

      var countryInfo = window.FoxCod.CountryRestrictionEngine.getCustomerCountry(currentForm);
      var currentCountryCode = countryInfo.country || 'US';

      function updateStateDropdown(countryCode) {
          if (!stateInput) return;
          window.FoxCod.LocationEngine.getStates(config.appUrl, countryCode).then(function(states) {
              var wrapper = stateInput._foxcodWrapper || stateInput.closest('.cod-form-field');
              if (!wrapper) return;
              
              // Only keep the current value if the user manually selected it (data-autofilled is absent)
              // Do NOT restore state from localStorage — state should only fill via phone autofill
              var previousValue = (stateInput.value && !stateInput.hasAttribute('data-autofilled-state-ls')) ? stateInput.value : '';
              
              while (stateInput.options.length > 1) {
                  stateInput.remove(1);
              }
              
              if (states && states.length > 0) {
                  states.sort(function(a, b) { return a.name.localeCompare(b.name); });
                  
                  states.forEach(function(s) {
                      var opt = document.createElement('option');
                      opt.value = s.code;
                      opt.textContent = s.name;
                      if (s.code === previousValue || s.name === previousValue) {
                          opt.selected = true;
                      }
                      stateInput.appendChild(opt);
                  });
                  
                  if (wrapper.style.display === 'none') {
                      var isSideBySide = wrapper.style.width && wrapper.style.width.indexOf('50%') !== -1;
                      wrapper.style.display = isSideBySide ? 'inline-block' : 'block';
                  }
                  
                  stateInput.required = true;
                  stateInput.setAttribute('data-required', 'true');
              } else {
                  wrapper.style.display = 'none';
                  stateInput.required = false;
                  stateInput.removeAttribute('data-required');
                  stateInput.value = '';
              }
          });
      }

      if (countryInput) {
          window.FoxCod.LocationEngine.getCountries(config.appUrl).then(function(countries) {
              // Use geolocation/IP-detected country only — do NOT pull country from localStorage
              var previousCountry = countryInput.value || currentCountryCode;

              countries.forEach(function(c) {
                  var opt = document.createElement('option');
                  opt.value = c.code;
                  opt.textContent = c.name;
                  if (c.code === previousCountry || c.name === previousCountry) {
                      opt.selected = true;
                  }
                  countryInput.appendChild(opt);
              });
              
              if (!countryInput.value && previousCountry) {
                  countryInput.value = previousCountry;
              }
              
              updateStateDropdown(countryInput.value);
          });
          
          countryInput.addEventListener('change', function() {
              updateStateDropdown(this.value);
          });
      } else {
          updateStateDropdown(currentCountryCode);
      }
  }

  /**
   * Save customer data to LocalStorage for future auto-fill
   */
  function saveCustomerToLocalStorage(form) {
    try {
        var customer = collectNormalizedCustomerFromForm(form);
        
        localStorage.setItem('cod_customer', JSON.stringify({
            phone: customer.phone || '',
            name: customer.name || '',
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            address: customer.address || '',
            email: customer.email || '',
            state: customer.state || '',
            country: customer.country || '',
            city: customer.city || '',
            zipcode: customer.zipcode || ''
        }));
        console.log('[COD Form] Customer data saved to LocalStorage');
    } catch (e) {
        console.warn('[COD Form] LocalStorage save error:', e);
    }
  }

  /**
   * Check LocalStorage for existing customer data and autofill
   * Priority 1: LocalStorage
   */
  function checkLocalStorageAndFill(form) {
      try {
          var stored = localStorage.getItem('cod_customer');
          if (stored) {
              var data = JSON.parse(stored);
              // Only fill if we have at least a name or phone
              if (data.name || data.phone) {
                  console.log('[COD Form] Found data in LocalStorage, autofilling...');
                  autoFillFields(form, data);

                  // If phone is present in LS, also set the phone field explicitly if not set
                  if (data.phone) {
                      var phoneInput = findInputByCanonicalKey(form, 'phone') || form.querySelector('input[name="phone"]');
                      if (phoneInput && !phoneInput.value) {
                          phoneInput.value = data.phone;
                      }
                  }
              }
          }
      } catch (e) {
          console.warn('[COD Form] LocalStorage read error:', e);
      }
  }

  /**
   * ─── PERSISTENT CHECKOUT STATE (foxcod_checkout_state) ───
   * Save ALL form data to localStorage so it persists across modal close/reopen
   */
  var _foxcodSaveTimer = null;

  function saveFoxCodCheckoutState(form) {
      // Skip saving if an order was just placed (form is being reset)
      if (window._foxcodOrderComplete) return;
      if (_foxcodSaveTimer) clearTimeout(_foxcodSaveTimer);
      _foxcodSaveTimer = setTimeout(function() {
          try {
              var state = { fields: {}, selections: {} };

              // Capture ALL inputs, textareas, and selects inside the form
              var inputs = form.querySelectorAll('input, textarea, select');
              inputs.forEach(function(el) {
                  var key = el.name || el.id;
                  if (!key) return;
                  // Skip hidden/disabled inputs and buttons
                  if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;

                  if (el.type === 'checkbox') {
                      state.fields[key] = el.checked ? 'checked' : '';
                  } else if (el.type === 'radio') {
                      if (el.checked) {
                          state.fields[key] = el.value;
                      }
                  } else {
                      state.fields[key] = el.value;
                  }
              });

              // Capture bundle offer selection
              var offersContainer = form.querySelector('.cod-quantity-offers') ||
                  (form.closest && form.closest('.cod-modal') && form.closest('.cod-modal').querySelector('.cod-quantity-offers'));
              if (offersContainer) {
                  var selectedOffer = offersContainer.getAttribute('data-selected-offer');
                  if (selectedOffer) {
                      state.selections.selectedBundleOffer = selectedOffer;
                  }
              }

              // Capture quantity from the qty input
              var container = form.closest('.cod-form-container') || form.parentElement;
              var qtyInput = container ? container.querySelector('.cod-qty-input') : null;
              if (qtyInput) {
                  state.selections.selectedQuantity = qtyInput.value;
              }

              // Capture shipping rate
              var selectedShipping = form.querySelector('input[name="shipping_method"]:checked');
              if (selectedShipping) {
                  state.selections.selectedShippingRate = selectedShipping.value;
              }

              // Capture bundle variant selections
              if (window.FoxCod && window.FoxCod._selectedBundleVariants && window.FoxCod._selectedBundleVariants.length > 1) {
                  state.selections.bundleVariants = window.FoxCod._selectedBundleVariants;
              }

              localStorage.setItem('foxcod_checkout_state', JSON.stringify(state));
          } catch (e) {
              console.warn('[COD Form] Checkout state save error:', e);
          }
      }, 300); // Debounce 300ms
  }

  function restoreFoxCodCheckoutState(form, config) {
      try {
          var stored = localStorage.getItem('foxcod_checkout_state');
          if (!stored) return false;

          var state = JSON.parse(stored);
          if (!state || !state.fields) return false;

          var restored = false;

          // Restore field values
          Object.keys(state.fields).forEach(function(fieldName) {
              var val = state.fields[fieldName];
              if (!val && val !== '') return;

              var el = form.querySelector('[name="' + fieldName + '"]') ||
                       form.querySelector('#' + fieldName);
              if (!el) return;

              // Skip hidden/disabled fields
              if (el.disabled || el.type === 'hidden') return;
              if (el.offsetParent === null && el.type !== 'radio' && el.type !== 'checkbox') return;

              if (el.type === 'checkbox') {
                  el.checked = val === 'checked';
              } else if (el.type === 'radio') {
                  // For radio buttons, find the one with matching value
                  var radios = form.querySelectorAll('[name="' + fieldName + '"]');
                  radios.forEach(function(r) {
                      r.checked = r.value === val;
                  });
              } else {
                  // Only restore if localStorage has a value (don't override with empty)
                  if (val) {
                      el.value = val;
                      restored = true;
                  }
              }
          });

          // Restore bundle offer selection (skip if downsell is active — downsell replaces bundle)
          if (state.selections && state.selections.selectedBundleOffer && !form.getAttribute('data-downsell-active')) {
              try {
                  var offer = JSON.parse(state.selections.selectedBundleOffer);
                  var modal = form.closest('.cod-modal') || form.parentElement;
                  var offersContainer = form.querySelector('.cod-quantity-offers') ||
                      (modal && modal.querySelector('.cod-quantity-offers'));
                  if (offersContainer && offer.quantity) {
                      offersContainer.setAttribute('data-selected-offer', state.selections.selectedBundleOffer);
                      // Click the matching card to apply visual selection and pricing
                      var matchCard = offersContainer.querySelector('[data-quantity="' + offer.quantity + '"]');
                      if (matchCard) {
                          // Update visual state
                          offersContainer.querySelectorAll('.cod-offer-card').forEach(function(c) {
                              c.classList.remove('selected');
                          });
                          matchCard.classList.add('selected');
                          matchCard.click();
                      }
                  }
              } catch (e) {
                  console.warn('[COD Form] Failed to restore bundle selection:', e);
              }
          }

          // Restore quantity
          if (state.selections && state.selections.selectedQuantity) {
              var container = form.closest('.cod-form-container') || form.parentElement;
              var qtyInput = container ? container.querySelector('.cod-qty-input') : null;
              if (qtyInput) {
                  qtyInput.value = state.selections.selectedQuantity;
                  // Update quantity badge
                  var qtyBadge = container.querySelector('.cod-qty-badge');
                  if (qtyBadge) qtyBadge.textContent = state.selections.selectedQuantity;
              }
          }

          // Restore shipping rate (after a delay to let the section render)
          if (state.selections && state.selections.selectedShippingRate) {
              setTimeout(function() {
                  var radio = form.querySelector('input[name="shipping_method"][value="' + state.selections.selectedShippingRate + '"]');
                  if (radio) {
                      radio.checked = true;
                      radio.dispatchEvent(new Event('change', { bubbles: true }));
                  }
              }, 200);
          }

          // Restore bundle variant selections (after bundle card click which triggers render)
          if (state.selections && state.selections.bundleVariants) {
              setTimeout(function() {
                  var currentQty = getEffectiveQuantity(form, config);
                  if (currentQty <= 1) {
                      window.FoxCod._selectedBundleVariants = null;
                      return;
                  }
                  window.FoxCod._selectedBundleVariants = state.selections.bundleVariants;
                  // Restore dropdowns if variant section exists
                  var varSection = form.querySelector('.foxcod-variant-section') ||
                      (form.closest && form.closest('.cod-modal') && form.closest('.cod-modal').querySelector('.foxcod-variant-section'));
                  if (varSection) {
                      var options = window.FoxCod.productOptions || [];
                      state.selections.bundleVariants.forEach(function(bv, idx) {
                          var variant = (window.FoxCod.productVariants || []).find(function(v) {
                              return String(v.id) === String(bv.variantId);
                          });
                          if (variant) {
                              options.forEach(function(_, optIdx) {
                                  var sel = varSection.querySelector('select[data-item="' + idx + '"][data-option-index="' + optIdx + '"]');
                                  if (sel && variant['option' + (optIdx + 1)]) {
                                      sel.value = variant['option' + (optIdx + 1)];
                                  }
                              });
                          }
                      });
                  }
              }, 300);
          }

          if (restored) {
              console.log('[COD Form] Checkout state restored from localStorage');
          }
          return restored;
      } catch (e) {
          console.warn('[COD Form] Checkout state restore error:', e);
          return false;
      }
  }

  /**
   * Smart Auto-fill - triggers when 10th digit entered (no delay)
   * Database is the source of truth
   */
  function setupAutoFill(form, config) {
    var phoneInput = findInputByCanonicalKey(form, 'phone') || form.querySelector('input[name="phone"]');
    if (!phoneInput) return;

    form.addEventListener('input', function(e) {
        if (e.isTrusted && e.target && e.target.hasAttribute && e.target.hasAttribute('data-autofilled')) {
            e.target.removeAttribute('data-autofilled');
        }
    });

    function triggerAutoFill() {
        var phone = phoneInput.value.replace(/\D/g, '');
        if (phone.length < 10) return;

        // Priority 1: Check LocalStorage first for this phone number
        try {
            var stored = localStorage.getItem('cod_customer');
            if (stored) {
                var data = JSON.parse(stored);
                // Clean stored phone for comparison
                var storedPhone = data.phone ? data.phone.replace(/\D/g, '') : '';
                
                // If stored phone matches entered phone, use LocalStorage data
                // This avoids an API call if we already have their data locally
                if (storedPhone && (storedPhone === phone || storedPhone.endsWith(phone) || phone.endsWith(storedPhone))) {
                     console.log('[COD Form] Phone matches LocalStorage, using local data');
                     autoFillFields(form, data);
                     return; // Skip API call
                }
            }
        } catch (e) {
            console.warn('[COD Form] LS check failed:', e);
        }

        // Priority 2: Database via API
        console.log('[COD Form] 10 digits entered, fetching customer data from DB...');
        requestProxyJson(config, '/api/customer-by-phone?phone=' + encodeURIComponent(phone) + '&shop=' + encodeURIComponent(config.shop))
            .then(function(data) {
                if (data.found) {
                    var customerData = { 
                        name: data.name, 
                        address: data.address, 
                        email: data.email,
                        state: data.state || '',
                        city: data.city || '',
                        zipcode: data.zipcode || ''
                    };
                    autoFillFields(form, customerData);
                    console.log('[COD Form] Auto-filled from database');
                } else {
                    var matchesLS = false;
                    try {
                        var stored = localStorage.getItem('cod_customer');
                        if (stored) {
                            var lsData = JSON.parse(stored);
                            var storedPhone = lsData.phone ? lsData.phone.replace(/\D/g, '') : '';
                            if (storedPhone && (storedPhone === phone || storedPhone.endsWith(phone) || phone.endsWith(storedPhone))) {
                                matchesLS = true;
                            }
                        }
                    } catch(e) {}

                    if (!matchesLS) {
                        var fieldsToClear = ['name', 'address', 'city', 'state', 'zip', 'zipcode', 'email', 'country'];
                        var clearedAny = false;
                        fieldsToClear.forEach(function(fieldName) {
                            var inputs = form.querySelectorAll('input[name="' + fieldName + '"], select[name="' + fieldName + '"], textarea[name="' + fieldName + '"]');
                            inputs.forEach(function(el) {
                                if (el.value) {
                                    el.value = '';
                                    el.removeAttribute('data-autofilled');
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                    clearedAny = true;
                                }
                            });
                        });
                        
                        // Also check generic custom fields just in case
                        var all = form.querySelectorAll('input, textarea, select');
                        all.forEach(function(el) {
                            if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'submit' || el.type === 'button') return;
                            if (el === phoneInput || el.name === 'phone' || el.name === 'phone_number') return;
                            
                            var canonical = getCanonicalCustomerKeyForInput(el);
                            if (canonical && canonical !== 'phone' && el.value) {
                                el.value = '';
                                el.removeAttribute('data-autofilled');
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                clearedAny = true;
                            }
                        });

                        if (clearedAny) console.log('[COD Form] Force cleared all fields because new phone number has no associated data');
                    }
                }
            })
            .catch(function(err) {
                console.warn('[COD Form] Auto-fill API error:', err);
            });
    }

    var autoFillTimeout;
    phoneInput.addEventListener('input', function() {
        var digits = this.value.replace(/\D/g, '');
        if (digits.length >= 8) {
            clearTimeout(autoFillTimeout);
            autoFillTimeout = setTimeout(triggerAutoFill, 600);
        }
    });
  }

  /**
   * Auto-fill form fields with customer data
   */
  function autoFillFields(form, data) {
    var normalized = {
        name: data.name || '',
        firstName: data.firstName || data.firstname || '',
        lastName: data.lastName || data.lastname || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        country: data.country || '',
        zipcode: data.zipcode || data.zip || ''
    };
    if (!normalized.name && normalized.firstName) {
        normalized.name = normalized.lastName ? (normalized.firstName + ' ' + normalized.lastName).trim() : normalized.firstName;
    }

    function setVal(el, val) {
        if (el && !el.value && val) {
            el.value = val;
            el.setAttribute('data-autofilled', 'true');
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    setVal(form.querySelector('input[name="name"]'), normalized.name);
    setVal(form.querySelector('input[name="phone"]'), normalized.phone);
    setVal(form.querySelector('[name="address"]'), normalized.address);
    setVal(form.querySelector('input[name="email"]'), normalized.email);
    setVal(form.querySelector('input[name="country"], select[name="country"]'), normalized.country);
    setVal(form.querySelector('input[name="state"], select[name="state"]'), normalized.state);
    setVal(form.querySelector('input[name="city"]'), normalized.city);
    setVal(form.querySelector('input[name="zip"], input[name="zipcode"]'), normalized.zipcode);

    // Generic canonical fill for custom-labeled fields
    var all = form.querySelectorAll('input, textarea, select');
    all.forEach(function(el) {
        if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio' || el.type === 'submit' || el.type === 'button') return;
        if (el.value) return;
        var canonical = getCanonicalCustomerKeyForInput(el);
        if (!canonical) return;
        var val = normalized[canonical];
        if (val) {
            el.value = val;
            el.setAttribute('data-autofilled', 'true');
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
  }

  /**
   * Helper: convert hex color to rgba string with alpha.
   * Falls back to null on invalid input.
   */
  function hexToRgba(hex, alpha) {
      if (!hex || typeof hex !== 'string') return null;
      var h = hex.replace('#', '');
      if (h.length === 3) {
          h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      }
      if (h.length !== 6) return null;
      var r = parseInt(h.substring(0, 2), 16);
      var g = parseInt(h.substring(2, 4), 16);
      var b = parseInt(h.substring(4, 6), 16);
      if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
      var a = typeof alpha === 'number' ? Math.max(0, Math.min(1, alpha)) : 1;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /**
   * Render Rate Card / Order Summary
   */
  function renderRateCard(form, config) {
      // Find submission button to insert before
      var totalDiv = form.querySelector('.cod-total');
      if (!totalDiv) return; // Should exist from Liquid template
      
      // We'll replace the simple total with a detailed card
      totalDiv.style.display = 'none'; 

      var card = document.createElement('div');
      card.className = 'cod-order-summary';

      // Use preset / button primary color to theme the order summary,
      // but keep it clearly distinct and easy to identify.
      var styles = config.styles || {};
      var backgroundColor = styles.backgroundColor || 'transparent';
      var themeKey = styles.themeKey || 'custom';
      var isPresetTheme = themeKey && themeKey !== 'custom';

      // Greyish styling baseline - based on form background color
      var customGreyBg = '#f3f4f6';
      var customBorder = '1px solid #e5e7eb';

      // Create a darker premium surface color from form background
function darkenColor(hex, percent) {
    if (!hex) return null;

    hex = hex.replace('#','');

    if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
    }

    var r = parseInt(hex.substring(0,2),16);
    var g = parseInt(hex.substring(2,4),16);
    var b = parseInt(hex.substring(4,6),16);

    r = Math.max(0, Math.floor(r * (1 - percent)));
    g = Math.max(0, Math.floor(g * (1 - percent)));
    b = Math.max(0, Math.floor(b * (1 - percent)));

    return `rgb(${r}, ${g}, ${b})`;
}



      // For presets, use a tinted version of the form's background color
      var presetBg;
      if (themeKey === 'default' || themeKey === 'professional') {
          presetBg = 'rgb(243, 244, 246)';
      } else {
          // Use form background color to create tinted background
          presetBg = darkenColor(backgroundColor, 0.06) || '#f3f4f6';
      }

      if (isPresetTheme) {
          card.style.background = presetBg;
          card.style.border = themeKey === 'default' ? customBorder : 'none';
      } else {
          // For custom themes, use a slightly tinted version of form background or fallback
          var formBgTinted = darkenColor(backgroundColor, 0.08) || customGreyBg;
          card.style.background = formBgTinted;
          card.style.border = customBorder;
      }
      card.style.boxShadow = "0 6px 18px rgba(0,0,0,0.06)";
      card.style.padding = '12px';
      card.style.borderRadius = '14px';
      card.style.marginBottom = '16px';

      // Check for selected quantity offer
      var quantityOffersEl = form.closest('.cod-modal') ? form.closest('.cod-modal').querySelector('.cod-quantity-offers') : null;
      var selectedOffer = null;
      var quantity = 1;
      
      if (quantityOffersEl) {
          try {
              var offerData = quantityOffersEl.getAttribute('data-selected-offer');
              if (offerData) {
                  selectedOffer = JSON.parse(offerData);
                  quantity = selectedOffer.quantity || 1;
              }
          } catch (e) {
              console.warn('[COD Form] Failed to parse selected offer:', e);
          }
      }
      
      // For in_product_page placement, also check the product page offers container
      if (!selectedOffer) {
          var productPageOffers = getProductPageOffersForConfig(config);
          if (productPageOffers) {
              try {
                  var ppOfferData = productPageOffers.getAttribute('data-selected-offer');
                  if (ppOfferData) {
                      selectedOffer = JSON.parse(ppOfferData);
                      quantity = selectedOffer.quantity || 1;
                  }
              } catch (e) {
                  console.warn('[COD Form] Failed to parse product page offer:', e);
              }
          }
      }
      
      // Use centralized pricing engine for initial render
      var state;
      try {
          state = calculateCheckoutState(form, config);
      } catch(e) {
          console.error('[COD Form] Error in calculateCheckoutState during renderRateCard:', e);
          // Fallback state so the card still renders
          state = {
              items: [], quantity: 1, subtotal: parseFloat(config.productPrice) || 0,
              discountPercent: 0, discount: 0, shipping: 0,
              tickUpsellTotal: 0, tickUpsellItems: [],
              preUpsellTotal: 0, preUpsellItems: [],
              downsellTotal: 0, downsellItems: [], downsellSavings: 0,
              displaySubtotal: parseFloat(config.productPrice) || 0,
              total: parseFloat(config.productPrice) || 0
          };
      }
      
      console.log('[COD Form] Order Summary Calculation (initial):', state);

      // Build per-variant / per-cart-item line items
      var lineItemsHtml = '';
      var isCartFlow = !!(window.FoxCod && window.FoxCod._cartItems && window.FoxCod._cartItems.length > 0);
      if (isCartFlow && state.items && state.items.length > 0) {
          state.items.forEach(function(item) {
              lineItemsHtml +=
                '<div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12px; color:#4b5563;">' +
                '   <span>' + item.quantity + ' × ' + item.title + '</span>' +
                '   <span>' + formatMoney(item.price * item.quantity) + '</span>' +
                '</div>';
          });
      } else if (!isCartFlow && state.items && state.items.length > 1) {
          state.items.forEach(function(item) {
              lineItemsHtml +=
                '<div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12px; color:#4b5563;">' +
                '   <span>1 × ' + (config.productTitle || '') + ' — ' + (item.title || '') + '</span>' +
                '   <span>' + formatMoney(item.price) + '</span>' +
                '</div>';
          });
      }

      card.innerHTML =
        '<div style="font-weight:700; font-size:16px; margin-bottom:12px; display:flex; align-items:center; color:#374151;">' +
        '   <div style="display:flex; align-items:center; justify-content:center; background:transparent; border-radius:8px; margin-right:8px; color:#16a34a;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg></div>' +
        '   Order Summary' +
        '</div>' +
        lineItemsHtml +
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
        '   <span>Subtotal (' + state.quantity + ' ' + (state.quantity === 1 ? 'item' : 'items') + ')</span>' +
        '   <span id="cod-summary-subtotal">' + formatMoney(state.subtotal) + '</span>' +
        '</div>' +
        (state.discount > 0 ?
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#10b981;">' +
        '   <span>Bundle Discount (' + state.discountPercent + '%)</span>' +
        '   <span id="cod-summary-discount">-' + formatMoney(state.discount) + '</span>' +
        '</div>' : '') +
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
        '   <span>Shipping</span>' +
        '   <span id="cod-summary-shipping">' + (state.shipping === 0 ? 'FREE' : formatMoney(state.shipping)) + '</span>' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed #d1d5db; font-weight:700; color:#111827;">' +
        '   <span>Total</span>' +
        '   <span id="cod-summary-total" style="color:' + (config.priceColor || config.accentColor) + '">' + formatMoney(state.total) + '</span>' +
        '</div>';

      form.insertBefore(card, form.querySelector('button[type="submit"]'));
      renderOrderSummary(form, config, state);
  }

  /**
   * Render Shipping Options
   */
  function renderShippingOptions(form, config) {
      // Remove any existing shipping section to prevent duplicates
      var existingShipping = form.querySelectorAll('.cod-shipping-section');
      existingShipping.forEach(function(el) { el.remove(); });

      // Check for new shipping rates system first
      if (config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0) {
          renderNewShippingRates(form, config);
          return;
      }
      
      // Fallback to old shipping options
      if (!config.shippingOptions || !config.shippingOptions.options) return;

      var container = document.createElement('div');
      container.className = 'cod-shipping-section';
      container.style.marginBottom = '16px';
      
      var title = document.createElement('div');
      title.textContent = 'Shipping Method';
      title.style.fontWeight = '600';
      title.style.marginBottom = '8px';
      title.style.fontSize = '14px';
      container.appendChild(title);

      config.shippingOptions.options.forEach(opt => {
          var row = document.createElement('div');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.marginBottom = '6px';
          row.style.cursor = 'pointer';
          
          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'shipping_method';
          radio.value = opt.id;
          radio.checked = opt.id === config.shippingOptions.defaultOption;
          radio.setAttribute('data-price', opt.price);
          radio.setAttribute('data-label', opt.label || '');
          radio.style.marginRight = '8px';
          
          // Add change listener to update total
          radio.addEventListener('change', function() {
              updateTotalHelper(form, config, opt.price);
          });

          var label = document.createElement('span');
          label.innerHTML = `${opt.label} (${opt.price === 0 ? 'FREE' : formatMoney(opt.price)})`;
          label.style.fontSize = '14px';

          row.appendChild(radio);
          row.appendChild(label);
          container.appendChild(row);
          
          row.onclick = function() { radio.checked = true; radio.dispatchEvent(new Event('change')); };
      });

      // Insert before the submit button — it is always a direct child of form.
      // NOTE: We cannot use .cod-payment-method-options or .cod-order-summary as reference
      // because after section marker move logic they become nested (not direct children of form),
      // causing form.insertBefore() to throw a DOMException.
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn && submitBtn.parentNode === form) {
          form.insertBefore(container, submitBtn);
      } else {
          form.appendChild(container);
      }
  }

  /**
   * Get the effective quantity considering bundle offers
   * Priority: bundle offer selection > quantity input > default 1
   */
  function getProductPageOffersForConfig(config) {
      var all;
      if (config && config.rootElement) {
          var container = config.rootElement._foxcodInjectedWrapper ? config.rootElement._foxcodInjectedWrapper : config.rootElement;
          all = container.querySelectorAll('.cod-product-page-offers');
      } else {
          all = document.querySelectorAll('.cod-product-page-offers');
      }
      if (!all || !all.length) return null;
      if (!config || !config.productId) return all[0];
      var target = String(config.productId).replace('gid://shopify/Product/', '');
      for (var i = 0; i < all.length; i++) {
          var pid = String(all[i].getAttribute('data-product-id') || '').replace('gid://shopify/Product/', '');
          if (pid === target) return all[i];
      }
      return all[0];
  }

  function getEffectiveQuantity(form, config) {
      // Check for bundle offer selection first
      var modal = form ? form.closest('.cod-modal') : null;
      if (modal) {
          var quantityOffersEl = modal.querySelector('.cod-quantity-offers');
          if (quantityOffersEl) {
              try {
                  var offerData = quantityOffersEl.getAttribute('data-selected-offer');
                  if (offerData) {
                      var selectedOffer = JSON.parse(offerData);
                      if (selectedOffer && selectedOffer.quantity) {
                          return selectedOffer.quantity;
                      }
                  }
              } catch (e) {
                  console.warn('[COD Form] Failed to parse offer for quantity:', e);
              }
          }
      }
      // Also check product page offers (for in_product_page placement)
      var productPageOffers = getProductPageOffersForConfig(config);
      if (productPageOffers) {
          try {
              var ppOfferData = productPageOffers.getAttribute('data-selected-offer');
              if (ppOfferData) {
                  var ppOffer = JSON.parse(ppOfferData);
                  if (ppOffer && ppOffer.quantity) {
                      return ppOffer.quantity;
                  }
              }
          } catch (e) {
              console.warn('[COD Form] Failed to parse product page offer for quantity:', e);
          }
      }
      // Fallback to quantity input (check container first since qty is outside <form>)
      if (form) {
          var container = form.closest('.cod-form-container') || form.parentElement;
          var qtyInput = (container && container.querySelector('.cod-product-qty .cod-qty-input')) || form.querySelector('[name="quantity"]');
          return parseInt(qtyInput ? qtyInput.value : 1) || 1;
      }
      return 1;
  }

  /**
   * Check if a shipping rate's conditions are met
   */
  function isRateApplicable(rate, config, quantity) {
      if (quantity === undefined || quantity === null) {
          quantity = getEffectiveQuantity(null, config);
      }
      var effectiveQty = Math.max(1, quantity);
      var orderPrice = getVariantSubtotal(config, effectiveQty);
      
      // Check if rate is active
      if (!rate.is_active) return false;
      
      // Check conditions
      if (rate.condition_type && rate.condition_type !== 'none') {
          var value;
          switch (rate.condition_type) {
              case 'order_price':
                  value = orderPrice;
                  break;
              case 'order_quantity':
                  value = quantity;
                  break;
              case 'order_weight':
                  // Default product weight is 0.5kg if not specified
                  value = (quantity * 0.5);
                  break;
              default:
                  value = orderPrice;
          }
          
          if (rate.min_value !== undefined && rate.min_value !== null && rate.min_value > 0 && value < rate.min_value) {
              return false;
          }
          if (rate.max_value !== undefined && rate.max_value !== null && rate.max_value > 0 && value > rate.max_value) {
              return false;
          }
      }
      
      // Check product restrictions
      if (rate.applies_to_products && rate.product_ids && rate.product_ids.length > 0) {
          // Convert config.productId to full gid format if needed
          var currentProductId = config.productId;
          var fullProductId = currentProductId.includes('gid://') ? currentProductId : 'gid://shopify/Product/' + currentProductId;
          
          var productMatch = rate.product_ids.some(function(pid) {
              return pid === currentProductId || pid === fullProductId || 
                     pid.includes(currentProductId) || currentProductId.includes(pid);
          });
          
          if (!productMatch) return false;
      }
      
      // Check collection restrictions
      if (rate.applies_to_collections && rate.collection_ids && rate.collection_ids.length > 0) {
          var productCollections = config.productCollectionIds || [];
          
          if (productCollections.length === 0) {
              console.log('[COD Form] Rate "' + rate.name + '" requires collections but product has no collection data');
              return false;
          }
          
          // Match collection IDs - handle both numeric and GID formats
          var collectionMatch = rate.collection_ids.some(function(rateCollId) {
              var rateCollIdStr = String(rateCollId);
              return productCollections.some(function(prodCollId) {
                  var prodCollIdStr = String(prodCollId).trim();
                  // Direct match
                  if (rateCollIdStr === prodCollIdStr) return true;
                  // GID vs numeric match
                  if (rateCollIdStr.includes(prodCollIdStr) || prodCollIdStr.includes(rateCollIdStr)) return true;
                  // Build full GID for comparison
                  var rateFullGid = rateCollIdStr.includes('gid://') ? rateCollIdStr : 'gid://shopify/Collection/' + rateCollIdStr;
                  var prodFullGid = prodCollIdStr.includes('gid://') ? prodCollIdStr : 'gid://shopify/Collection/' + prodCollIdStr;
                  return rateFullGid === prodFullGid;
              });
          });
          
          if (!collectionMatch) {
              console.log('[COD Form] Rate "' + rate.name + '" collection restriction not met. Rate collections:', rate.collection_ids, 'Product collections:', productCollections);
              return false;
          }
          
          console.log('[COD Form] Rate "' + rate.name + '" matched by collection!');
      }
      
      // Country/state restrictions would be checked here if we had location data
      // For now, we assume they pass (customer can select shipping then we validate on server)
      
      return true;
  }

  /**
   * Render New Shipping Rates (from shipping_rates table)
   */
  function renderNewShippingRates(form, config) {
      if (!config.shippingRates || config.shippingRates.length === 0) return;

      // Remove any existing shipping section to prevent duplicates
      var existingShipping = form.querySelectorAll('.cod-shipping-section');
      existingShipping.forEach(function(el) { el.remove(); });

      var styles = config.styles || {};
      // Field background color chosen in the form builder (falls back to a soft grey)
      var fieldBg = styles.fieldBackgroundColor || '#f3f4f6';
      // Icon colors — match the same variables used by form field icons and payment section
      var shippingIconColor = styles.iconColor || '#6b7280';
      var shippingIconBg = styles.iconBackground || 'transparent';
      var shippingAccent = config.accentColor;

      var container = document.createElement('div');
      container.className = 'cod-shipping-section';
      container.style.marginBottom = '16px';
      
      var title = document.createElement('div');
      title.style.cssText = 'font-weight:600;margin-bottom:10px;font-size:14px;color:#374151;display:flex;align-items:center;gap:6px;';
      title.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Shipping Method';
      container.appendChild(title);

      // Get current quantity for condition evaluation (uses bundle offer if available)
      var quantity = getEffectiveQuantity(form, config);

      // Filter active and applicable rates based on conditions
      var applicableRates = config.shippingRates.filter(function(rate) {
          return isRateApplicable(rate, config, quantity);
      });
      
      if (applicableRates.length === 0) {
          console.log('[COD Form] No applicable shipping rates found for current order');
          // Show message when no rates match
          var noRatesMsg = document.createElement('div');
          noRatesMsg.textContent = 'No shipping options available for this order';
          noRatesMsg.style.fontSize = '13px';
          noRatesMsg.style.color = '#6b7280';
          noRatesMsg.style.fontStyle = 'italic';
          container.appendChild(noRatesMsg);
          
          form.insertBefore(container, form.querySelector('button[type="submit"]') || null);
          return;
      }

      applicableRates.forEach(function(rate, index) {
          var card = document.createElement('label');
          card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;cursor:pointer;margin-bottom:8px;background:#fff;transition:all 0.2s ease;position:relative;';

          // Hidden native radio (keeps form value submission working)
          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'shipping_method';
          radio.value = rate.id;
          radio.setAttribute('data-price', rate.price);
          radio.setAttribute('data-label', rate.name || '');
          radio.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none;';

          card.appendChild(radio);

          // ── Left: icon pill (matches payment section icon style) ──
          var shippingIconPill = document.createElement('div');
          shippingIconPill.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>';
          shippingIconPill.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-shrink:0;width:36px;height:36px;border-radius:8px;color:' + shippingIconColor + ';background-color:' + (shippingIconBg !== 'transparent' ? shippingIconBg : (hexToRgba(shippingAccent, 0.08) || '#f3f4f6')) + ';';

          // ── Center: name + description ──
          var textDiv = document.createElement('div');
          textDiv.style.cssText = 'flex:1;min-width:0;';

          var nameEl = document.createElement('div');
          nameEl.style.cssText = 'font-weight:600;font-size:14px;color:#1f2937;margin-bottom:2px;line-height:1.3;';
          nameEl.textContent = rate.name;
          textDiv.appendChild(nameEl);

          if (rate.description) {
              var descEl = document.createElement('div');
              descEl.style.cssText = 'font-size:12px;color:#6b7280;display:flex;align-items:center;gap:4px;line-height:1.4;';
              descEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + rate.description;
              textDiv.appendChild(descEl);
          }

          // ── Right: price badge + native radio pill (same line, matches payment section) ──
          var rightSection = document.createElement('div');
          rightSection.style.cssText = 'display:flex;align-items:center;gap:10px;flex-shrink:0;';

          var priceEl = document.createElement('div');
          priceEl.style.cssText = 'flex-shrink:0;text-align:right;';
          if (rate.price === 0) {
              priceEl.innerHTML = '<span style="background:#10b981;color:white;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;">FREE</span>';
          } else {
              priceEl.innerHTML = '<span style="font-weight:700;font-size:15px;color:#1f2937;">' + formatMoney(rate.price) + '</span>';
          }

          // Native radio pill with accent-color (identical to payment section)
          var radioPill = document.createElement('input');
          radioPill.type = 'radio';
          radioPill.name = 'shipping_method_visual';
          radioPill.tabIndex = -1;
          radioPill.style.cssText = 'accent-color:' + shippingAccent + ';width:18px;height:18px;flex-shrink:0;cursor:pointer;margin:0;pointer-events:none;';
          radioPill.checked = false;

          rightSection.appendChild(priceEl);
          rightSection.appendChild(radioPill);

          card.appendChild(shippingIconPill);
          card.appendChild(textDiv);
          card.appendChild(rightSection);
          container.appendChild(card);

          // Add change listener to update total and card styles
          radio.addEventListener('change', function() {
              updateTotalHelper(form, config, rate.price);
              // Update all card styles + sync visual radio pills
              var allCards = container.querySelectorAll('label');
              allCards.forEach(function(c) {
                  var r = c.querySelector('input[name="shipping_method"]');
                  var rPill = c.querySelector('input[name="shipping_method_visual"]');
                  var isSelected = r && r.checked;
                  if (isSelected) {
                      c.style.borderColor = shippingAccent;
                      c.style.background = fieldBg;
                      c.style.boxShadow = '0 0 0 1px ' + shippingAccent + ', 0 0 0 4px ' + (hexToRgba(shippingAccent, 0.2) || 'transparent');
                  } else {
                      c.style.borderColor = '#e5e7eb';
                      c.style.background = '#fff';
                      c.style.boxShadow = 'none';
                  }
                  if (rPill) rPill.checked = isSelected;
              });
          });

          // Click on card triggers the hidden radio
          card.addEventListener('click', function() {
              radio.checked = true;
              radio.dispatchEvent(new Event('change', { bubbles: true }));
          });

          // Hover effects
          card.addEventListener('mouseenter', function() {
              if (!radio.checked) { card.style.borderColor = '#d1d5db'; card.style.background = fieldBg; }
          });
          card.addEventListener('mouseleave', function() {
              if (!radio.checked) { card.style.borderColor = '#e5e7eb'; card.style.background = '#fff'; }
          });
      });

      // Insert before the submit button — it is always a direct child of form.
      // NOTE: We cannot use .cod-payment-method-options or .cod-order-summary as reference
      // because after section marker move logic they become nested (not direct children of form),
      // causing form.insertBefore() to throw a DOMException.
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn && submitBtn.parentNode === form) {
          form.insertBefore(container, submitBtn);
      } else {
          form.appendChild(container);
      }
      
      // Update total with first rate's price
      // Don't auto-select or auto-update total — let user choose shipping
      
      console.log('[COD Form] Rendered new shipping rates:', applicableRates.length, 'of', config.shippingRates.length);
      
      // Re-render shipping options when quantity changes
      var containerEl = form.closest('.cod-form-container') || form.parentElement;
      var qtyInput = containerEl ? containerEl.querySelector('.cod-product-qty .cod-qty-input') : form.querySelector('[name="quantity"]');
      if (qtyInput) {
          qtyInput.addEventListener('change', function() {
              // Remember the marker (parent of existing section)
              var existingSection = form.querySelector('.cod-shipping-section');
              var markerParent = existingSection ? existingSection.closest('.cod-section-marker[data-section="shipping"]') : null;
              if (existingSection) {
                  existingSection.remove();
              }
              renderNewShippingRates(form, config);
              // Move newly rendered section back into the marker
              if (markerParent) {
                  var newSection = form.querySelector('.cod-shipping-section');
                  if (newSection) {
                      markerParent.appendChild(newSection);
                  }
              }
          });
      }

      // Re-render shipping options when bundle offer selection changes
      var modal = form.closest('.cod-modal');
      if (modal) {
          var quantityOffersEl = modal.querySelector('.cod-quantity-offers');
          if (quantityOffersEl) {
              var observer = new MutationObserver(function(mutations) {
                  mutations.forEach(function(mutation) {
                      if (mutation.type === 'attributes' && mutation.attributeName === 'data-selected-offer') {
                          console.log('[COD Form] Bundle offer changed, re-rendering shipping rates');
                          var existingSection = form.querySelector('.cod-shipping-section');
                          var markerParent = existingSection ? existingSection.closest('.cod-section-marker[data-section="shipping"]') : null;
                          if (existingSection) {
                              existingSection.remove();
                          }
                          renderNewShippingRates(form, config);
                          // Move newly rendered section back into the marker
                          if (markerParent) {
                              var newSection = form.querySelector('.cod-shipping-section');
                              if (newSection) {
                                  markerParent.appendChild(newSection);
                              }
                          }
                      }
                  });
              });
              observer.observe(quantityOffersEl, { attributes: true, attributeFilter: ['data-selected-offer'] });
          }
      }

      // NOTE: Product page offers observer removed — shipping must only render inside the modal.
      // Shipping recalculation for bundle variant changes is handled in updateBundleVariantSelection().
  }

  /**
   * Render Payment Method Selection (Full Prepaid, Partial COD, Full COD)
   */
  function renderPaymentMethodOptions(form, config) {
      var existing = form.querySelector('.cod-payment-method-options');
      var container = existing || document.createElement('div');
      container.className = 'cod-payment-method-options';
      container.style.marginBottom = '20px';
      container.style.marginTop = '16px';

      // Calculate order total
      var orderTotal = config.productPrice || 0;
      var summaryTotalEl = form.querySelector('#cod-summary-total');
      if (summaryTotalEl) {
          var totalText = summaryTotalEl.textContent;
          var parsedTotal = parseFloat(totalText.replace(/[^0-9.]/g, '')) || 0;
          if (parsedTotal > 0) orderTotal = parsedTotal;
      }
      var partialAdvance = config.partialCodAdvance || 0;
      var remainingAmount = Math.max(0, orderTotal - partialAdvance);

      // ── Unified Payment Method Eligibility Helper ────────────────────────────────
      // Mirrors the server-side isPaymentMethodEligible() engine.
      // Both methods share the same min/max, product, and collection logic;
      // only the settings keys differ depending on which method is checked.
      function isPaymentMethodEligible(method, orderTotalAmt) {
          var ppSet = config.partialPaymentSettings;
          if (!ppSet) return false;

          var enabled = method === 'full_prepaid' ? ppSet.full_prepaid_enabled : method === 'pure_cod' ? ppSet.pure_cod_enabled : ppSet.enabled;
          if (!enabled) return false;

          var countryInfo = window.FoxCod.CountryRestrictionEngine.getCustomerCountry(form);
          if (!window.FoxCod.CountryRestrictionEngine.isPaymentMethodCountryAllowed(method, countryInfo.country, ppSet)) {
              return false;
          }

          var min = method === 'full_prepaid' ? parseFloat(ppSet.full_prepaid_minimum_order_total || 0) : method === 'pure_cod' ? parseFloat(ppSet.pure_cod_minimum_order_total || 0) : parseFloat(ppSet.minimum_order_total || 0);
          var max = method === 'full_prepaid' ? parseFloat(ppSet.full_prepaid_maximum_order_total || 0) : method === 'pure_cod' ? parseFloat(ppSet.pure_cod_maximum_order_total || 0) : parseFloat(ppSet.maximum_order_total || 0);
          orderTotalAmt = parseFloat(orderTotalAmt) || 0;
          if (min > 0 && orderTotalAmt < min) return false;
          if (max > 0 && orderTotalAmt > max) return false;

          var methodConfig = ppSet.payment_method_restrictions && ppSet.payment_method_restrictions[method];
          
          var allowedProds = methodConfig && methodConfig.allowed_product_ids ? methodConfig.allowed_product_ids : (method === 'full_prepaid' ? (ppSet.full_prepaid_allowed_product_ids || []) : method === 'pure_cod' ? (ppSet.pure_cod_allowed_product_ids || []) : (ppSet.allowed_product_ids || []));
          var allowedColls = methodConfig && methodConfig.allowed_collection_ids ? methodConfig.allowed_collection_ids : (method === 'full_prepaid' ? (ppSet.full_prepaid_allowed_collection_ids || []) : method === 'pure_cod' ? (ppSet.pure_cod_allowed_collection_ids || []) : (ppSet.allowed_collection_ids || []));
          
          var restrictedProds = methodConfig && methodConfig.restricted_product_ids ? methodConfig.restricted_product_ids : [];
          var restrictedColls = methodConfig && methodConfig.restricted_collection_ids ? methodConfig.restricted_collection_ids : [];

          var pId = String(config.productId || '').replace(/[^0-9]/g, '');
          var cIds = (config.productCollectionIds || []).map(function(cid) { return String(cid).replace(/[^0-9]/g, ''); });

          // Rule 1: Restricted items always win
          if (pId && restrictedProds.some(function(id) { return String(id).replace(/[^0-9]/g, '') === pId; })) return false;
          if (cIds.length > 0 && restrictedColls.some(function(rid) { return cIds.indexOf(String(rid).replace(/[^0-9]/g, '')) > -1; })) return false;

          // Rule 2 & 3: Allowed lists
          var hasProdF = allowedProds.length > 0;
          var hasCollF = allowedColls.length > 0;
          if (hasProdF || hasCollF) {
              var prodOk = false;
              if (hasProdF && pId) {
                  prodOk = allowedProds.some(function(id) { return String(id).replace(/[^0-9]/g, '') === pId; });
              }
              if (!prodOk && hasCollF && cIds.length > 0) {
                  prodOk = cIds.some(function(cid) {
                      return allowedColls.some(function(aid) { return String(aid).replace(/[^0-9]/g, '') === cid; });
                  });
              }
              if (!prodOk) return false;
          }
          return true;
      }

      // ── Determine visibility using unified helper ───────────────────────────
      var ppSettings = config.partialPaymentSettings;
      var showPartial = ppSettings
          ? isPaymentMethodEligible('partial_payment', orderTotal)
          : config.partialCodEnabled; // legacy fallback

      var showFullPrepaid = ppSettings
          ? isPaymentMethodEligible('full_prepaid', orderTotal)
          : !!(config.styles && config.styles.fullPrepaidEnabled); // legacy fallback

      var showFullCod = ppSettings
          ? isPaymentMethodEligible('pure_cod', orderTotal)
          : true;

      var prepaidDiscountAmount = 0;
      var prepaidDiscountText = '';
      var finalPrepaidTotal = orderTotal;
      if (showFullPrepaid && ppSettings && ppSettings.prepaid_discount_enabled && ppSettings.prepaid_discount_value > 0) {
          prepaidDiscountAmount = calculatePaymentMethodDiscount(orderTotal, ppSettings.prepaid_discount_type, ppSettings.prepaid_discount_value);
          finalPrepaidTotal = orderTotal - prepaidDiscountAmount;
          prepaidDiscountText = 'Save ' + formatMoney(prepaidDiscountAmount);
      }

      var partialDiscountAmount = 0;
      var partialDiscountText = '';
      if (showPartial && ppSettings && ppSettings.partial_payment_discount_enabled && ppSettings.partial_payment_discount_value > 0) {
          partialDiscountAmount = calculatePaymentMethodDiscount(orderTotal, ppSettings.partial_payment_discount_type, ppSettings.partial_payment_discount_value);
          partialDiscountText = 'Save ' + formatMoney(partialDiscountAmount);
      }

      var existingSelected = null;
      var existingRadios = form.querySelectorAll('input[name="payment_method"]:checked');
      if (existingRadios && existingRadios.length > 0) {
          existingSelected = existingRadios[0].value;
      }

      var defaultMethod = null;
      if (existingSelected === 'full_cod' && showFullCod) defaultMethod = 'full_cod';
      else if (existingSelected === 'partial_cod' && showPartial) defaultMethod = 'partial_cod';
      else if (existingSelected === 'full_prepaid' && showFullPrepaid) defaultMethod = 'full_prepaid';

      // Do not auto-select any payment method if none is provided.

      var allBlocked = (!showFullCod && !showPartial && !showFullPrepaid);

      var html = '<div style="margin-bottom: 16px;">';
      html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">';
      html += '<div style="font-size: 13px; font-weight: 700; color: #1f2937;">Choose Payment Option</div>';
      html += '<div style="background: #dcfce7; color: #166534; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 12px; display: flex; align-items: center; gap: 4px;">🔥 Save more on prepaid!</div>';
      html += '</div>';

      html += '<div style="display: flex; flex-direction: column; gap: 10px;">';

      if (allBlocked) {
          html += '<div style="background: #fee2e2; color: #991b1b; padding: 16px; border-radius: 12px; border: 1px solid #f87171; font-size: 13px; text-align: center;">';
          html += '<strong>No payment methods are available for your country.</strong><br>Please enter a different shipping address to proceed.';
          html += '<input type="radio" name="payment_method" value="none_available" checked style="display:none;">';
          html += '</div>';
      }

      var renderTag = function(method, defaultColor) {
          var tagsConfig = ppSettings && ppSettings.payment_method_tags;
          // Support backward compatibility where full prepaid tag was always shown by default
          if (!tagsConfig && method === 'full_prepaid') {
              return '<div style="position: absolute; top: -10px; left: 16px; background: ' + defaultColor + '; color: white; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px; text-transform: uppercase;">★ MOST POPULAR</div>';
          }
          var tagSettings = tagsConfig && tagsConfig[method];
          if (tagSettings && tagSettings.enabled && tagSettings.text) {
              return '<div style="position: absolute; top: -10px; left: 16px; background: ' + defaultColor + '; color: white; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 6px; letter-spacing: 0.05em; display: flex; align-items: center; gap: 4px; text-transform: uppercase;">' + tagSettings.text + '</div>';
          }
          return '';
      };

      var hasTag = function(method) {
          var tagsConfig = ppSettings && ppSettings.payment_method_tags;
          if (!tagsConfig && method === 'full_prepaid') return true;
          var tagSettings = tagsConfig && tagsConfig[method];
          return tagSettings && tagSettings.enabled && !!tagSettings.text;
      };

      if (showFullPrepaid) {
          var marginStyle = hasTag('full_prepaid') ? 'margin: 12px 0 0 0 !important;' : 'margin: 0 !important;';
          html += '<label class="pm-row pm-prepaid" style="display: flex; flex-direction: column; background: #f0fdf4; border-radius: 12px; border: 1.5px solid #22c55e; cursor: pointer; position: relative; overflow: visible; padding: 0 !important; ' + marginStyle + ' box-sizing: border-box; opacity: 1;">';
          var isPrepaidChecked = (defaultMethod === 'full_prepaid') ? 'checked' : '';
          html += '<input type="radio" name="payment_method" value="full_prepaid" ' + isPrepaidChecked + ' style="position:absolute; opacity:0; pointer-events:none; margin:0; padding:0;">';
          html += renderTag('full_prepaid', '#22c55e');
          html += '<div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px 12px 12px 12px; box-sizing: border-box; width: 100%; margin: 0;">';
          html += '<div style="display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; color: #16a34a; background-color: #dcfce7;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12c0 1.1.9 2 2 2h14v-4" /><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" /></svg></div>';
          html += '<div style="flex: 1; min-width: 0; padding-top: 2px;">';
          html += '<div style="font-weight: 700; font-size: 14px; color: #166534; line-height: 1.2;">Full Prepaid</div>';
          var showFpSub = !ppSettings || ppSettings.show_full_prepaid_subtitle !== false;
          var fpSub = (ppSettings && ppSettings.full_prepaid_subtitle) || 'Pay now & get fastest delivery';
          if (showFpSub && fpSub) {
              html += '<div style="color: #16a34a; font-size: 11px; margin-top: 4px; line-height: 1.3;">' + fpSub + '</div>';
          }
          html += '</div>';
          html += '<div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">';
          html += '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">';
          if (prepaidDiscountAmount > 0) {
              html += '<div class="pm-prepaid-save-pill" style="background: #dcfce7; color: #166534; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; line-height: 1; white-space: nowrap;">' + prepaidDiscountText + '</div>';
          } else {
              html += '<div class="pm-prepaid-save-pill" style="background: #dcfce7; color: #166534; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; line-height: 1; display: none; white-space: nowrap;"></div>';
          }
          html += '<div style="display: flex; align-items: baseline; gap: 6px;">';
          html += '<span class="pm-amt-prepaid" style="font-weight: 800; font-size: 15px; color: #166534;">' + formatMoney(finalPrepaidTotal) + '</span>';
          html += '</div></div>';
          var isPrepaidChecked = (defaultMethod === 'full_prepaid') ? 'checked' : '';
          html += '<input type="radio" name="payment_method_visual" class="pm-pill" ' + isPrepaidChecked + ' style="width: 18px; height: 18px; accent-color: #22c55e; margin: 0; pointer-events: none;">';
          html += '</div></div>';
          var prepaidDesc = ppSettings && ppSettings.payment_method_descriptions && ppSettings.payment_method_descriptions.full_prepaid ? ppSettings.payment_method_descriptions.full_prepaid : { enabled: true, text: 'Pay now, save more, receive sooner' };
          if (prepaidDesc.enabled) {
              html += '<div style="background: #dcfce7; padding: 10px 12px; font-size: 10px; color: #166534; display: flex; justify-content: center; align-items: center; font-weight: 500; width: 100%; box-sizing: border-box; margin: 0; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">' + prepaidDesc.text + '</div>';
          }
          html += '</label>';
      }

      if (showPartial) {
          var finalPartialTotal = orderTotal - partialDiscountAmount;
          var depositAmount = partialAdvance;
          var codFeeAmount = 0;
          if (ppSettings && ppSettings.payment_options && ppSettings.payment_options.length > 0) {
              var opt = ppSettings.payment_options[0];
              if (opt.type === 'percentage' || opt.type === 'remaining_percentage') {
                  depositAmount = (finalPartialTotal * opt.value) / 100;
              } else {
                  depositAmount = Math.min(opt.value, finalPartialTotal);
              }
              
              if (ppSettings.cod_fee_enabled && ppSettings.cod_fee_amount) {
                  if (ppSettings.cod_fee_type === 'percentage') {
                      codFeeAmount = (depositAmount * ppSettings.cod_fee_amount) / 100;
                  } else {
                      codFeeAmount = ppSettings.cod_fee_amount;
                  }
              }
          }
          var depositText = formatMoney(depositAmount);

          var marginStylePartial = hasTag('partial_payment') ? 'margin: 12px 0 0 0 !important;' : 'margin: 0 !important;';
          html += '<label class="pm-row pm-partial" style="display: flex; flex-direction: column; background: #eff6ff; border-radius: 12px; border: 1.5px solid #2563eb; cursor: pointer; position: relative; overflow: visible; padding: 0 !important; ' + marginStylePartial + ' box-sizing: border-box;">';
          var isPartialChecked = (defaultMethod === 'partial_cod') ? 'checked' : '';
          html += '<input type="radio" name="payment_method" value="partial_cod" ' + isPartialChecked + ' style="position:absolute; opacity:0; pointer-events:none; margin:0; padding:0;">';
          html += renderTag('partial_payment', '#2563eb');
          html += '<div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px 12px 12px 12px; box-sizing: border-box; width: 100%; margin: 0;">';
          html += '<div style="display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; color: #2563eb; background-color: #dbeafe;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg></div>';
          html += '<div style="flex: 1; min-width: 0; padding-top: 2px;">';
          html += '<div style="font-weight: 700; font-size: 14px; color: #1e3a8a; line-height: 1.2; display: flex; align-items: center; gap: 4px;">Partial Payment <svg width="14" height="14" viewBox="0 0 24 24" fill="#2563eb" stroke="#eff6ff" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg></div>';
          var showPpSub = !ppSettings || ppSettings.show_partial_payment_subtitle !== false;
          var ppSub = ppSettings && ppSettings.partial_payment_subtitle;
          if (showPpSub) {
              if (ppSub) {
                  html += '<div class="pm-desc-partial" style="color: #2563eb; font-size: 11px; margin-top: 4px; line-height: 1.3;">' + ppSub + '</div>';
              } else {
                  html += '<div class="pm-desc-partial" style="color: #2563eb; font-size: 11px; margin-top: 4px; line-height: 1.3;">Pay ' + depositText + ' now • Rest on delivery</div>';
              }
          }
          html += '</div>';
          html += '<div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">';
          html += '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">';
          if (ppSettings && ppSettings.cod_fee_enabled && ppSettings.cod_fee_amount) {
              var displayStyle = codFeeAmount > 0 ? 'block' : 'none';
              html += '<div class="pm-cod-fee-pill" style="display: ' + displayStyle + '; background: #dbeafe; color: #1e3a8a; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; line-height: 1; white-space: nowrap;">' + formatMoney(codFeeAmount) + ' ' + (ppSettings.cod_fee_name || 'COD fee') + '</div>';
          }
          if (partialDiscountAmount > 0) {
              html += '<div class="pm-partial-save-pill" style="background: #dbeafe; color: #1e3a8a; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; line-height: 1; white-space: nowrap;">' + partialDiscountText + '</div>';
          } else {
              html += '<div class="pm-partial-save-pill" style="background: #dbeafe; color: #1e3a8a; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; line-height: 1; display: none; white-space: nowrap;"></div>';
          }
          var amtColor = '#1e3a8a';
          html += '<span class="pm-amt-partial" style="font-weight: 800; font-size: 15px; color: ' + amtColor + ';">' + depositText + '</span>';
          html += '</div>';
          var isPartialChecked = (defaultMethod === 'partial_cod') ? 'checked' : '';
          html += '<input type="radio" name="payment_method_visual" class="pm-pill" ' + isPartialChecked + ' style="width: 18px; height: 18px; accent-color: #2563eb; margin: 0; pointer-events: none;">';
          html += '</div></div>';
          var partialDesc = ppSettings && ppSettings.payment_method_descriptions && ppSettings.payment_method_descriptions.partial_payment ? ppSettings.payment_method_descriptions.partial_payment : { enabled: true, text: 'Secure your order • Avoid fake cancellations' };
          if (partialDesc.enabled) {
              html += '<div style="background: #dbeafe; padding: 10px 12px; font-size: 10px; color: #1e40af; display: flex; justify-content: center; align-items: center; font-weight: 500; width: 100%; box-sizing: border-box; margin: 0; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">' + partialDesc.text + '</div>';
          }
          html += '</label>';
      }

      
      if (showFullCod) {
          var pureCodFeeAmount = 0;
          if (ppSettings && ppSettings.pure_cod_fee_enabled && ppSettings.pure_cod_fee_amount) {
              if (ppSettings.pure_cod_fee_type === 'percentage') {
                  pureCodFeeAmount = (orderTotal * ppSettings.pure_cod_fee_amount) / 100;
              } else {
                  pureCodFeeAmount = ppSettings.pure_cod_fee_amount;
              }
          }
          
          var marginStyleCod = hasTag('pure_cod') ? 'margin: 12px 0 0 0 !important;' : 'margin: 0 !important;';
          var isOnlyCodEnabled = !showFullPrepaid && !showPartial && showFullCod;
          var theme = {
              bg: isOnlyCodEnabled ? '#f0fdf4' : '#fff7ed',
              border: isOnlyCodEnabled ? '#22c55e' : '#ea580c',
              iconColor: isOnlyCodEnabled ? '#16a34a' : '#ea580c',
              iconBg: isOnlyCodEnabled ? '#dcfce7' : '#ffedd5',
              titleColor: isOnlyCodEnabled ? '#166534' : '#9a3412',
              pillBg: isOnlyCodEnabled ? '#dcfce7' : '#ffedd5',
              pillColor: isOnlyCodEnabled ? '#166534' : '#9a3412',
              accent: isOnlyCodEnabled ? '#22c55e' : '#ea580c',
              footerBg: isOnlyCodEnabled ? '#dcfce7' : '#ffedd5',
              footerColor: isOnlyCodEnabled ? '#166534' : '#9a3412'
          };

          html += '<label class="pm-row pm-cod" style="display: flex; flex-direction: column; background: ' + theme.bg + '; border-radius: 12px; border: 1.5px solid ' + theme.border + '; cursor: pointer; position: relative; overflow: visible; padding: 0 !important; ' + marginStyleCod + ' box-sizing: border-box;">';
          var isCodChecked = (defaultMethod === 'full_cod') ? 'checked' : '';
          html += '<input type="radio" name="payment_method" value="full_cod" ' + isCodChecked + ' style="position:absolute; opacity:0; pointer-events:none; margin:0; padding:0;">';
          html += renderTag('pure_cod', theme.border);
          html += '<div style="display: flex; align-items: flex-start; gap: 12px; padding: 16px 12px 12px 12px; box-sizing: border-box; width: 100%; margin: 0;">';
          html += '<div style="display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: 8px; color: ' + theme.iconColor + '; background-color: ' + theme.iconBg + ';"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="1" ry="1" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg></div>';
          html += '<div style="flex: 1; min-width: 0; padding-top: 2px;">';
          html += '<div style="font-weight: 700; font-size: 14px; color: ' + theme.titleColor + '; line-height: 1.2;">Cash on Delivery</div>';
          var showCodSub = !ppSettings || ppSettings.show_pure_cod_subtitle !== false;
          var codSub = ppSettings && ppSettings.pure_cod_subtitle;
          if (showCodSub && codSub) {
              html += '<div style="color: ' + theme.iconColor + '; font-size: 11px; margin-top: 4px; line-height: 1.3;">' + codSub + '</div>';
          }

          html += '</div>';
          html += '<div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">';
          html += '<div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">';
          if (ppSettings && ppSettings.pure_cod_fee_enabled && ppSettings.pure_cod_fee_amount) {
              var displayStyle = pureCodFeeAmount > 0 ? 'block' : 'none';
              html += '<div class="pm-cod-fee-pill" style="display: ' + displayStyle + '; background: ' + theme.pillBg + '; color: ' + theme.pillColor + '; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; line-height: 1; white-space: nowrap;">' + formatMoney(pureCodFeeAmount) + ' ' + (ppSettings.pure_cod_fee_name || 'COD fee') + '</div>';
          }
          html += '<span class="pm-amt-cod" style="font-weight: 800; font-size: 15px; color: ' + theme.titleColor + ';">' + formatMoney(parseFloat(orderTotal || 0) + parseFloat(pureCodFeeAmount || 0)) + '</span>';
          html += '</div>';
          var isCodChecked = (defaultMethod === 'full_cod') ? 'checked' : '';
          html += '<input type="radio" name="payment_method_visual" class="pm-pill" ' + isCodChecked + ' style="width: 18px; height: 18px; accent-color: ' + theme.accent + '; margin: 0; pointer-events: none;">';
          html += '</div></div>';
          var codDesc = ppSettings && ppSettings.payment_method_descriptions && ppSettings.payment_method_descriptions.pure_cod ? ppSettings.payment_method_descriptions.pure_cod : { enabled: true, text: 'Higher return risk • Slightly slower processing' };
          if (codDesc.enabled) {
              html += '<div style="background: ' + theme.footerBg + '; padding: 10px 12px; font-size: 10px; color: ' + theme.footerColor + '; display: flex; justify-content: center; align-items: center; font-weight: 500; width: 100%; box-sizing: border-box; margin: 0; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">' + codDesc.text + '</div>';
          }
          html += '</label>';
      }


      html += '</div></div>';
      container.innerHTML = html;

      var submitBtn = form.querySelector('button[type="submit"]');
      var originalButtonText = submitBtn ? submitBtn.textContent : 'Place Order';

      // Attach event listeners
      var allRows = container.querySelectorAll('.pm-row');
      allRows.forEach(function(row) {
          row.addEventListener('click', function(e) {
              if(e.target.tagName === 'INPUT') return;
              var radio = row.querySelector('input[type="radio"][name="payment_method"]');
              if (radio) {
                  // Make it completely static per user request - if Full Prepaid, we can still visually select it
                  // but we want the normal behavior.
                  radio.checked = true;
                  radio.dispatchEvent(new Event('change', { bubbles: true }));
              }
          });
      });

      var radios = container.querySelectorAll('input[name="payment_method"]');
      radios.forEach(function(radio) {
          radio.addEventListener('change', function() {
              // Update visual checked state
              allRows.forEach(function(row) {
                  var rInput = row.querySelector('input[type="radio"][name="payment_method"]');
                  var rPill = row.querySelector('.pm-pill');
                  var isChecked = rInput && rInput.checked;
                  if (rPill) rPill.checked = isChecked;

                  // Update borders based on selection
                  if (row.classList.contains('pm-prepaid')) {
                      row.style.borderColor = isChecked ? '#22c55e' : '#bbf7d0';
                  } else if (row.classList.contains('pm-partial')) {
                      row.style.borderColor = isChecked ? '#2563eb' : '#bfdbfe';
                  } else if (row.classList.contains('pm-cod')) {
                      row.style.borderColor = isChecked ? '#ea580c' : '#fed7aa';
                  }
              });

              if (submitBtn) {
                  applySubmitButtonStyles(submitBtn, config);
                  if (radio.value === 'none_available') {
                      submitBtn.textContent = 'Not Available';
                      submitBtn.disabled = true;
                      submitBtn.style.opacity = '0.5';
                      submitBtn.style.cursor = 'not-allowed';
                  } else {
                      submitBtn.disabled = false;
                      submitBtn.style.opacity = '1';
                      submitBtn.style.cursor = 'pointer';
                      
                      if (radio.value === 'partial_cod') {
                          submitBtn.textContent = typeof depositText !== 'undefined' ? 'Pay ' + depositText + ' now' : 'Continue with Partial Payment';
                      } else if (radio.value === 'full_prepaid') {
                          submitBtn.textContent = 'Proceed to Payment';
                      } else {
                          submitBtn.textContent = originalButtonText;
                      }
                  }
              }

              // Re-render the order summary to reflect the discount (or lack thereof)
              updateTotalHelper(form, config, form.getAttribute('data-shipping-price'));
          });
      });

      // Insert into the form only if not already present
      if (!existing) {
          var marker = form.querySelector('.cod-section-marker[data-section="payment_mode"]');
          if (marker) {
              form.appendChild(container);
          } else {
              if (submitBtn) {
                  form.insertBefore(container, submitBtn);
              } else {
                  form.appendChild(container);
              }
          }
      }
      
      // trigger initial change to set button text
      var initialRadio = container.querySelector('input[name="payment_method"]:checked');
      if(initialRadio) initialRadio.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderMarketingCheckbox(form, config) {
      var div = document.createElement('div');
      div.style.marginBottom = '16px';
      div.style.display = 'flex';
      div.style.alignItems = 'center';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'marketing_consent';
      cb.id = 'marketing_consent';
      cb.style.marginRight = '8px';

      var label = document.createElement('label');
      label.htmlFor = 'marketing_consent';
      label.textContent = 'Keep me updated on news and offers';
      label.style.fontSize = '13px';
      label.style.color = '#6b7280';

      div.appendChild(cb);
      div.appendChild(label);
      
      form.insertBefore(div, form.querySelector('button[type="submit"]'));
  }

  /**
   * Update totals when shipping changes or quantity changes.
   * Delegates to the centralized pricing engine.
   * The shippingPrice is stored as a data attribute so calculateCheckoutState can read it.
   */
  function updateTotalHelper(form, config, shippingPrice) {
      try {
          // Store the explicit shipping price for calculateCheckoutState to pick up
          form.setAttribute('data-shipping-price', parseFloat(shippingPrice) || 0);
          var state = calculateCheckoutState(form, config);
          renderOrderSummary(form, config, state);
      } catch(e) {
          console.error('[COD Form] Error in updateTotalHelper:', e);
      }
  }

  /**
   * Update payment method amounts to match the order summary total
   * Called after order summary is updated so Full COD / Partial COD text stays in sync
   */
  function updatePaymentMethodAmounts(form, config, state) {
      var orderTotal = 0;
      if (state && typeof state.total !== 'undefined') {
          orderTotal = state.total;
      } else {
          var summaryTotalEl = form.querySelector('#cod-summary-total');
          if (!summaryTotalEl) return;
          var rawTotal = summaryTotalEl.getAttribute('data-raw-total');
          if (rawTotal) {
              orderTotal = parseFloat(rawTotal);
          } else {
              var totalText = summaryTotalEl.textContent;
              orderTotal = parseFloat(totalText.replace(/[^0-9.]/g, '')) || 0;
          }
      }
      if (orderTotal <= 0) return;
      
      var partialAdvance = config.partialCodAdvance || 0;
      var remainingAmount = orderTotal - partialAdvance;
      if (remainingAmount < 0) remainingAmount = 0;
      
      // Find the payment method options container
      var paymentContainer = form.querySelector('.cod-payment-method-options');
      if (!paymentContainer) return;

      // Update Full Prepaid
      var pmPrepaid = paymentContainer.querySelector('.pm-prepaid');
      if (pmPrepaid) {
          var ppSettings = config.partialPaymentSettings;
          var prepaidDiscountAmount = 0;
          if (ppSettings && ppSettings.prepaid_discount_enabled && ppSettings.prepaid_discount_value > 0) {
              if (ppSettings.prepaid_discount_type === 'percentage') {
                  prepaidDiscountAmount = (orderTotal * ppSettings.prepaid_discount_value) / 100;
              } else {
                  prepaidDiscountAmount = ppSettings.prepaid_discount_value;
              }
              prepaidDiscountAmount = Math.min(prepaidDiscountAmount, orderTotal);
          }
          var finalPrepaidTotal = orderTotal - prepaidDiscountAmount;

          var amtEl = pmPrepaid.querySelector('.pm-amt-prepaid');
          if (amtEl) amtEl.textContent = formatMoney(finalPrepaidTotal);
          
          var savePill = pmPrepaid.querySelector('.pm-prepaid-save-pill');
          if (savePill) {
              if (prepaidDiscountAmount > 0) {
                  savePill.style.display = 'block';
                  savePill.textContent = 'Save ' + formatMoney(prepaidDiscountAmount);
              } else {
                  savePill.style.display = 'none';
              }
          }
      }

      // Update Partial COD
      var pmPartial = paymentContainer.querySelector('.pm-partial');
      var depositText = '';
      if (pmPartial) {
          var ppSettings = config.partialPaymentSettings;
          var depositAmount = partialAdvance;
          var codFeeAmount = 0;
          if (ppSettings && ppSettings.payment_options && ppSettings.payment_options.length > 0) {
              var opt = ppSettings.payment_options[0];
              if (opt.type === 'percentage' || opt.type === 'remaining_percentage') {
                  depositAmount = (orderTotal * opt.value) / 100;
              } else {
                  depositAmount = Math.min(opt.value, orderTotal);
              }
              
              if (ppSettings.cod_fee_enabled && ppSettings.cod_fee_amount) {
                  if (ppSettings.cod_fee_type === 'percentage') {
                      codFeeAmount = (depositAmount * ppSettings.cod_fee_amount) / 100;
                  } else {
                      codFeeAmount = ppSettings.cod_fee_amount;
                  }
              }
          }
          depositText = formatMoney(depositAmount);

          var descEl = pmPartial.querySelector('.pm-desc-partial');
          var showPpSub = !ppSettings || ppSettings.show_partial_payment_subtitle !== false;
          var ppSub = ppSettings && ppSettings.partial_payment_subtitle;
          if (descEl && showPpSub && !ppSub) {
              descEl.textContent = 'Pay ' + depositText + ' now • Rest on delivery';
          }

          var amtEl = pmPartial.querySelector('.pm-amt-partial');
          if (amtEl) amtEl.textContent = depositText;

          var feePill = pmPartial.querySelector('.pm-cod-fee-pill');
          if (feePill) {
              if (codFeeAmount > 0) {
                  feePill.style.display = 'block';
                  feePill.textContent = formatMoney(codFeeAmount) + ' ' + (ppSettings.cod_fee_name || 'COD fee');
              } else {
                  feePill.style.display = 'none';
              }
          }

          var partialDiscountAmount = 0;
          if (ppSettings && ppSettings.partial_payment_discount_enabled && ppSettings.partial_payment_discount_value > 0) {
              if (ppSettings.partial_payment_discount_type === 'percentage') {
                  partialDiscountAmount = (orderTotal * ppSettings.partial_payment_discount_value) / 100;
              } else {
                  partialDiscountAmount = ppSettings.partial_payment_discount_value;
              }
              partialDiscountAmount = Math.min(partialDiscountAmount, orderTotal);
          }
          var partialSavePill = pmPartial.querySelector('.pm-partial-save-pill');
          if (partialSavePill) {
              if (partialDiscountAmount > 0) {
                  partialSavePill.style.display = 'block';
                  partialSavePill.textContent = 'Save ' + formatMoney(partialDiscountAmount);
              } else {
                  partialSavePill.style.display = 'none';
              }
          }
      }

      // Update Full COD
      var pmCod = paymentContainer.querySelector('.pm-cod');
      if (pmCod) {
          var amtCodEl = pmCod.querySelector('.pm-amt-cod');
          var pureCodFeeAmt = 0;
          var ppS = window.FoxCod && window.FoxCod.partialPaymentSettings;
          if (ppS && ppS.pure_cod_fee_enabled && ppS.pure_cod_fee_amount) {
              pureCodFeeAmt = ppS.pure_cod_fee_type === "percentage" ? (orderTotal * ppS.pure_cod_fee_amount) / 100 : ppS.pure_cod_fee_amount;
          }
          if (amtCodEl) amtCodEl.textContent = formatMoney(parseFloat(orderTotal || 0) + parseFloat(pureCodFeeAmt || 0));

          var codFeePill = pmCod.querySelector('.pm-cod-fee-pill');
          if (codFeePill) {
              if (pureCodFeeAmt > 0) {
                  codFeePill.style.display = 'block';
                  codFeePill.textContent = formatMoney(pureCodFeeAmt) + ' ' + (ppS.pure_cod_fee_name || 'COD fee');
              } else {
                  codFeePill.style.display = 'none';
              }
          }
      }

      // Update submit button text if selected
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
          var selectedRadio = paymentContainer.querySelector('input[name="payment_method"]:checked');
          if (selectedRadio) {
              if (!submitBtn.getAttribute('data-original-text')) {
                  submitBtn.setAttribute('data-original-text', submitBtn.textContent || 'Place Order');
              }
              var originalText = submitBtn.getAttribute('data-original-text');

              if (selectedRadio.value === 'partial_cod') {
                  submitBtn.textContent = depositText ? 'Pay ' + depositText + ' now' : 'Continue with Partial Payment';
              } else if (selectedRadio.value === 'full_prepaid') {
                  submitBtn.textContent = 'Proceed to Payment';
              } else {
                  submitBtn.textContent = originalText;
              }
          }
      }
  }

  // =============================================
  // CENTRALIZED PRICING ENGINE
  // =============================================

  function calculatePaymentMethodDiscount(total, type, value) {
      var discount = type === 'percentage' ? (total * value) / 100 : value;
      return Math.min(discount, total);
  }

  function formatMoney(amount) {
      var num = parseFloat(amount) || 0;
      var code = (FoxCod.currencyConfig && FoxCod.currencyConfig.code) || 'USD';
      try {
          return new Intl.NumberFormat(undefined, {
              style: 'currency', currency: code, currencyDisplay: 'narrowSymbol'
          }).format(num);
      } catch(e) {
          return code + ' ' + num.toFixed(2);
      }
  }

  /**
   * Helper: get the subtotal from bundle variants or single product price
   */
  function getVariantSubtotal(config, quantity) {
      var bundleVariants = window.FoxCod && window.FoxCod._selectedBundleVariants;
      var qty = parseInt(quantity || 1, 10) || 1;
      if (bundleVariants && bundleVariants.length > 1 && qty > 1) {
          return bundleVariants.reduce(function(s, v) { return s + (v.price || 0); }, 0);
      }
      return parseFloat(config.productPrice) || 0;
  }

  /**
   * SINGLE SOURCE OF TRUTH for all pricing calculations.
   * Every function that needs price data must call this instead of computing locally.
   */
  function calculateCheckoutState(form, config) {
      var state = {
          items: [],
          quantity: 1,
          subtotal: 0,
          discountPercent: 0,
          discount: 0,
          shipping: 0,
          tickUpsellTotal: 0,
          tickUpsellItems: [],
          preUpsellTotal: 0,
          preUpsellItems: [],
          downsellTotal: 0,
          downsellItems: [],
          downsellSavings: 0,
          total: 0
      };
      var hasBundleOfferSelection = false;

      // ── 1. Read offer quantity & discount ──
      var modal = form ? (form.closest('.cod-modal') || form) : null;
      var quantityOffersEl = modal ? modal.querySelector('.cod-quantity-offers') : null;
      
      var cartItems = window.FoxCod && window.FoxCod._cartItems;
      var isCartFlow = cartItems && cartItems.length > 0;
      
      if (quantityOffersEl && !isCartFlow) {
          try {
              var offerData = quantityOffersEl.getAttribute('data-selected-offer');
              if (offerData) {
                  var selectedOffer = JSON.parse(offerData);
                  state.quantity = selectedOffer.quantity || 1;
                  state.discountPercent = selectedOffer.discountPercent || 0;
                  hasBundleOfferSelection = true;
              }
          } catch (e) {}
      }
      // Also check product page offers (for in_product_page placement)
      if (!isCartFlow && state.quantity === 1 && state.discountPercent === 0) {
          var productPageOffers = getProductPageOffersForConfig(config);
          if (productPageOffers) {
              try {
                  var ppOfferData = productPageOffers.getAttribute('data-selected-offer');
                  if (ppOfferData) {
                      var ppOffer = JSON.parse(ppOfferData);
                      state.quantity = ppOffer.quantity || 1;
                      state.discountPercent = ppOffer.discountPercent || 0;
                      hasBundleOfferSelection = true;
                  }
              } catch (e) {}
          }
      }
      // Fallback: quantity input (outside form in .cod-product-qty)
      // Important: do NOT override if a bundle offer is selected and it happens to be 1 unit.
      if (!hasBundleOfferSelection && state.quantity === 1 && !quantityOffersEl) {
          var container = form ? (form.closest('.cod-form-container') || form.closest('.cod-modal') || form.parentElement) : null;
          var qtyInput = form ? form.querySelector('[name="quantity"]') : null;
          if (!qtyInput && container) {
              qtyInput = container.querySelector('.cod-product-qty .cod-qty-input');
          }
          state.quantity = parseInt(qtyInput ? qtyInput.value : 1) || 1;
      }

      // ── 2. Calculate subtotal from variant prices (never config.productPrice for bundles) ──
      var cartItems = window.FoxCod && window.FoxCod._cartItems;
      var bundleVariants = window.FoxCod && window.FoxCod._selectedBundleVariants;
      
      if (cartItems && cartItems.length > 0) {
          // Cart page flow: compute totals from all cart items
          var totalCartQty = 0;
          cartItems.forEach(function(item) {
              var q = parseInt(item.quantity) || 1;
              var p = parseFloat(item.price) || 0;
              state.items.push({
                  title: item.title || '',
                  price: p,
                  variantId: item.variantId,
                  productId: item.productId,
                  quantity: q
              });
              state.subtotal += (p * q);
              totalCartQty += q;
          });
          // Override quantity so 'Subtotal (N items)' shows total cart qty
          state.quantity = totalCartQty;
      } else if (bundleVariants && bundleVariants.length > 1 && state.quantity > 1) {
          bundleVariants.forEach(function(v) {
              state.items.push({
                  title: (config.productTitle || '') + ' — ' + (v.title || ''),
                  price: v.price || 0,
                  variantId: v.variantId,
                  quantity: 1
              });
              state.subtotal += (v.price || 0);
          });
      } else {
          if (state.quantity <= 1 && window.FoxCod) {
              window.FoxCod._selectedBundleVariants = null;
          }
          var unitPrice = parseFloat(config.productPrice) || 0;
          state.subtotal = unitPrice * state.quantity;
          state.items.push({
              title: config.productTitle || '',
              price: unitPrice,
              variantId: config.variantId,
              quantity: state.quantity
          });
      }

      // ── 3. Bundle discount ──
      state.discount = state.subtotal * (state.discountPercent / 100);

      // ── 4. Shipping — read from explicit data attr first, then from selected radio ──
      var explicitShipping = form ? form.getAttribute('data-shipping-price') : null;
      if (explicitShipping !== null && explicitShipping !== '') {
          state.shipping = parseFloat(explicitShipping) || 0;
      } else if (form) {
          var selectedShipping = form.querySelector('input[name="shipping_method"]:checked');
          if (selectedShipping) {
              state.shipping = parseFloat(selectedShipping.getAttribute('data-price')) || 0;
          }
      }

      // ── 5. Tick upsells ──
      if (form) {
          var tickRows = form.querySelectorAll('.cod-tick-upsell-row');
          tickRows.forEach(function(row) {
              var cb = row.querySelector('input[type="checkbox"]');
              if (cb && cb.checked) {
                  var price = parseFloat(row.getAttribute('data-offer-price')) || 0;
                  var titleText = row.getAttribute('data-offer-title') || 'Upsell';
                  state.tickUpsellTotal += price;
                  state.tickUpsellItems.push({ title: titleText, price: price });
              }
          });
      }

      // ── 6. Pre-purchase upsells ──
      if (form) {
          var preItemsAttr = form.getAttribute('data-pre-upsell-items');
          if (preItemsAttr) {
              try {
                  var preArr = JSON.parse(preItemsAttr);
                  preArr.forEach(function(pi) {
                      var pPrice = parseFloat(pi.price) || 0;
                      state.preUpsellTotal += pPrice;
                      state.preUpsellItems.push({ title: pi.title || 'Upsell item', price: pPrice });
                  });
              } catch(e) {}
          }
      }

      // ── 7. Downsell ──
      if (form) {
          var dsItemsAttr = form.getAttribute('data-downsell-items');
          if (dsItemsAttr) {
              try {
                  var dsArr = JSON.parse(dsItemsAttr);
                  dsArr.forEach(function(di) {
                      state.downsellTotal += (di.price || 0);
                      state.downsellItems.push({ title: di.title || 'Downsell item', price: di.price || 0 });
                  });
              } catch(e) {}
          }
      }

      // ── 8. Final total ──
      // When downsell is active, downsell price REPLACES the original subtotal
      var displaySubtotal = state.subtotal;
      if (state.downsellItems.length > 0) {
          displaySubtotal = state.downsellTotal;
          state.downsellSavings = state.subtotal - state.downsellTotal;
      }
      state.displaySubtotal = displaySubtotal;

      state.totalBeforeCoupon = displaySubtotal - state.discount + state.shipping + state.tickUpsellTotal + state.preUpsellTotal;
      var appliedCoupon = getCouponState(config);
      var couponStillApplicable = appliedCoupon.applied && Math.abs((appliedCoupon.originalTotal || 0) - state.totalBeforeCoupon) < 0.01;
      state.couponDiscount = couponStillApplicable ? Math.min(appliedCoupon.discount || 0, state.totalBeforeCoupon) : 0;
      state.total = Math.max(0, state.totalBeforeCoupon - state.couponDiscount);

      console.log('[COD Form] calculateCheckoutState:', {
          quantity: state.quantity,
          subtotal: state.subtotal,
          displaySubtotal: state.displaySubtotal,
          discountPercent: state.discountPercent,
          discount: state.discount,
          shipping: state.shipping,
          tickUpsellTotal: state.tickUpsellTotal,
          preUpsellTotal: state.preUpsellTotal,
          downsellTotal: state.downsellTotal,
          downsellSavings: state.downsellSavings,
          couponDiscount: state.couponDiscount,
          total: state.total,
          bundleVariants: bundleVariants ? bundleVariants.length : 0
      });

      return state;
  }

  /**
   * SINGLE RENDERER for the order summary UI.
   * All UI updates to the order summary must go through this function.
   */
  function renderOrderSummary(form, config, state) {
      var summaryEl = form ? form.querySelector('.cod-order-summary') : null;
      if (!summaryEl) {
          var modal = form ? (form.closest('.cod-modal') || form.parentElement) : null;
          if (modal) summaryEl = modal.querySelector('.cod-order-summary');
      }
      if (!summaryEl) {
          console.log('[COD Form] No order summary element found');
          return;
      }

      var couponState = getCouponState(config);
      if (couponState.applied && (!state.couponDiscount || Math.abs((couponState.originalTotal || 0) - (state.totalBeforeCoupon || 0)) >= 0.01)) {
          resetAppliedCoupon(form, config, {
              preserveCode: true,
              message: 'Cart updated. Apply coupon again.',
              tone: 'warning'
          });
          state = calculateCheckoutState(form, config);
      }

      var html = '<div style="font-weight:700; font-size:16px; margin-bottom:12px; display:flex; align-items:center; color:#374151;">' +
          '   <div style="display:flex; align-items:center; justify-content:center; background:transparent; border-radius:8px; margin-right:8px; color:#16a34a;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg></div>' +
          '   Order Summary' +
          '</div>';

      // Per-variant line items for bundles OR cart items
      var cartItems = window.FoxCod && window.FoxCod._cartItems;
      var bundleVariants = window.FoxCod && window.FoxCod._selectedBundleVariants;
      
      if (cartItems && cartItems.length > 0) {
          cartItems.forEach(function(item) {
              html += '<div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12px; color:#4b5563;">' +
                  '   <span>' + item.quantity + ' × ' + item.title + '</span>' +
                  '   <span>' + formatMoney(item.price * item.quantity) + '</span>' +
                  '</div>';
          });
      } else if (bundleVariants && bundleVariants.length > 1 && state.quantity > 1) {
          bundleVariants.forEach(function(bv) {
              html += '<div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12px; color:#4b5563;">' +
                  '   <span>1 × ' + (config.productTitle || '') + ' — ' + (bv.title || '') + '</span>' +
                  '   <span>' + formatMoney(bv.price) + '</span>' +
                  '</div>';
          });
      }

      // Subtotal
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#6b7280;">' +
          '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#4b5563;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></div>' +
          '   <span>Subtotal (' + state.quantity + ' ' + (state.quantity === 1 ? 'item' : 'items') + ')</span></div>' +
          '   <span id="cod-summary-subtotal">' + formatMoney(state.subtotal) + '</span>' +
          '</div>';

      // Downsell savings
      if (state.downsellSavings > 0) {
          html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#10b981;">' +
              '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#16a34a;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></div>' +
              '   <span>Downsell discount</span></div>' +
              '   <span>-' + formatMoney(state.downsellSavings) + '</span>' +
              '</div>';
      }

      // Bundle discount
      if (state.discount > 0) {
          html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#10b981;">' +
              '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#16a34a;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></div>' +
              '   <span>Bundle Discount (' + state.discountPercent + '%)</span></div>' +
              '   <span id="cod-summary-discount">-' + formatMoney(state.discount) + '</span>' +
              '</div>';
      }

      // Tick upsell line items
      state.tickUpsellItems.forEach(function(item) {
          html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#059669;">' +
              '   <span>' + item.title + '</span>' +
              '   <span>' + formatMoney(item.price) + '</span>' +
              '</div>';
      });

      // Pre-purchase upsell line items
      state.preUpsellItems.forEach(function(item) {
          html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#059669;">' +
              '   <span>✓ ' + item.title + '</span>' +
              '   <span>' + formatMoney(item.price) + '</span>' +
              '</div>';
      });

      // Shipping
      html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#6b7280;">' +
          '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#4b5563;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg></div>' +
          '   <span>Shipping</span></div>' +
          '   <span id="cod-summary-shipping">' + (state.shipping === 0 ? 'FREE' : formatMoney(state.shipping)) + '</span>' +
          '</div>';

      if (state.couponDiscount > 0) {
          html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#059669;">' +
              '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#16a34a;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></div>' +
              '   <span>Coupon (' + couponState.code + ')</span></div>' +
              '   <span id="cod-summary-coupon">-' + formatMoney(state.couponDiscount) + '</span>' +
              '</div>';
      }

      var selectedRadio = form.querySelector('input[name="payment_method"]:checked');
      var isFullPrepaidSelected = selectedRadio && selectedRadio.value === 'full_prepaid';
      var isPartialSelected = selectedRadio && selectedRadio.value === 'partial_cod';
      var isPureCodSelected = selectedRadio && selectedRadio.value === 'full_cod';

      var ppSettings = config.partialPaymentSettings;
      var prepaidDiscountAmount = 0;
      if (isFullPrepaidSelected && ppSettings && ppSettings.prepaid_discount_enabled && ppSettings.prepaid_discount_value > 0) {
          prepaidDiscountAmount = calculatePaymentMethodDiscount(state.total, ppSettings.prepaid_discount_type, ppSettings.prepaid_discount_value);
      }

      var partialDiscountAmount = 0;
      if (isPartialSelected && ppSettings && ppSettings.partial_payment_discount_enabled && ppSettings.partial_payment_discount_value > 0) {
          partialDiscountAmount = calculatePaymentMethodDiscount(state.total, ppSettings.partial_payment_discount_type, ppSettings.partial_payment_discount_value);
      }

      var depositAmount = config.partialCodAdvance || 0;
      var finalPartialTotal = state.total - partialDiscountAmount;
      if (isPartialSelected && ppSettings && ppSettings.payment_options && ppSettings.payment_options.length > 0) {
          var opt = ppSettings.payment_options[0];
          if (opt.type === 'percentage' || opt.type === 'remaining_percentage') {
              depositAmount = (finalPartialTotal * opt.value) / 100;
          } else {
              depositAmount = Math.min(opt.value, finalPartialTotal);
          }
      }

      var codFeeDisplayAmount = 0;
      var codFeeDisplayName = '';
      
      if (isPartialSelected && ppSettings && ppSettings.cod_fee_enabled && ppSettings.cod_fee_amount) {
          if (ppSettings.cod_fee_type === 'percentage') {
              codFeeDisplayAmount = (depositAmount * ppSettings.cod_fee_amount) / 100;
          } else {
              codFeeDisplayAmount = ppSettings.cod_fee_amount;
          }
          codFeeDisplayName = ppSettings.cod_fee_name || 'Partial COD Fee';
      } else if (isPureCodSelected && ppSettings && ppSettings.pure_cod_fee_enabled && ppSettings.pure_cod_fee_amount) {
          if (ppSettings.pure_cod_fee_type === 'percentage') {
              codFeeDisplayAmount = (state.total * ppSettings.pure_cod_fee_amount) / 100;
          } else {
              codFeeDisplayAmount = ppSettings.pure_cod_fee_amount;
          }
          codFeeDisplayName = ppSettings.pure_cod_fee_name || 'COD Fee';
      }

      if (codFeeDisplayAmount > 0) {
          html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#ea580c;">' +
              '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#ea580c;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg></div>' +
              '   <span>' + codFeeDisplayName + '</span></div>' +
              '   <span id="cod-summary-fee">+' + formatMoney(codFeeDisplayAmount) + '</span>' +
              '</div>';
      }

      var finalSummaryTotal = parseFloat(state.total || 0) + parseFloat(codFeeDisplayAmount || 0);
      var dueOnDelivery = 0;

      if (isFullPrepaidSelected && prepaidDiscountAmount > 0) {
          finalSummaryTotal -= prepaidDiscountAmount;
          html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#10b981;">' +
              '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#16a34a;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></div>' +
              '   <span>Prepaid Discount</span></div>' +
              '   <span>-' + formatMoney(prepaidDiscountAmount) + '</span>' +
              '</div>';
      } else if (isPartialSelected) {
          if (partialDiscountAmount > 0) {
              html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:13px; color:#10b981;">' +
                  '   <div style="display:flex; align-items:center;"><div style="display:flex; align-items:center; justify-content:center; width:24px; height:24px; background:transparent; border-radius:6px; margin-right:8px; color:#16a34a;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg></div>' +
                  '   <span>Partial Payment Discount</span></div>' +
                  '   <span>-' + formatMoney(partialDiscountAmount) + '</span>' +
                  '</div>';
          }
          finalSummaryTotal = depositAmount;
          dueOnDelivery = parseFloat(finalPartialTotal || 0) + parseFloat(codFeeDisplayAmount || 0) - parseFloat(depositAmount || 0);
      }

      // Total
      html += '<div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed #d1d5db; font-weight:700; color:#111827;">' +
          '   <span>Total' + (isPartialSelected ? ' (Due Now)' : '') + '</span>' +
          '   <span id="cod-summary-total" data-raw-total="' + state.total + '" style="color:' + (config.priceColor || config.accentColor) + '">' + formatMoney(finalSummaryTotal) + '</span>' +
          '</div>';

      if (isPartialSelected && dueOnDelivery > 0) {
          html += '<div style="display:flex; justify-content:space-between; margin-top:4px; font-weight:600; font-size:13px; color:#4b5563;">' +
              '   <span>Due on Delivery</span>' +
              '   <span>' + formatMoney(dueOnDelivery) + '</span>' +
              '</div>';
      }

      summaryEl.innerHTML = html;

      // Also update the Liquid-rendered total price if it exists
      var codTotalPrice = form ? form.querySelector('.cod-total-price') : null;
      if (codTotalPrice) {
          codTotalPrice.textContent = formatMoney(finalSummaryTotal);
      }

      // Sync payment method amounts with updated total
      updatePaymentMethodAmounts(form, config, state);
      syncCouponUi(form, config);
  }

  // =============================================
  // WRAPPER FUNCTIONS (delegate to pricing engine)
  // =============================================

  /**
   * Update order summary after tick upsell changes.
   * Delegates to the centralized pricing engine.
   */
  function updateOrderSummaryWithTickUpsells(form, config) {
      try {
          var state = calculateCheckoutState(form, config);
          renderOrderSummary(form, config, state);
      } catch(e) {
          console.error('[COD Form] Error in updateOrderSummaryWithTickUpsells:', e);
      }
  }

  /**
   * Update order summary when a bundle offer is selected.
   * Delegates to the centralized pricing engine.
   */
  function updateOrderSummaryWithOffer(form, config, offer) {
      try {
          var state = calculateCheckoutState(form, config);
          renderOrderSummary(form, config, state);
      } catch(e) {
          console.error('[COD Form] Error in updateOrderSummaryWithOffer:', e);
      }
  }

  /**
   * Apply Modal Styles
   */
  function applyModalStyles(container, config) {
      var styles = config.styles || {};
      
      // Apply modal style preset (glassmorphism, minimal, modern)
      var userBgColor = styles.background || styles.backgroundImage || styles.backgroundColor || 'transparent';
      console.log('[COD Form] Modal style:', config.modalStyle, 'Background color:', userBgColor);
      
      if (config.modalStyle === 'glassmorphism') {
          container.style.setProperty('background', userBgColor, 'important');
          container.style.backdropFilter = 'blur(10px)';
          container.style.boxShadow = '0 8px 32px 0 rgba(31, 38, 135, 0.37)';
          container.style.border = '1px solid rgba(255, 255, 255, 0.18)';
      } else if (config.modalStyle === 'minimal') {
          container.style.background = userBgColor;
          container.style.border = '1px solid #e5e7eb';
          container.style.boxShadow = 'none';
      } else {
          // Modern style or default - apply custom styles from seller settings
          
          // Background for the entire form container
          if (styles.background || styles.backgroundImage || styles.backgroundColor) {
              container.style.background = styles.background || styles.backgroundImage || styles.backgroundColor;
          }
          
          // Shadow
          if (styles.shadow) {
              container.style.boxShadow = '0 10px 25px rgba(0,0,0,0.1)';
          } else {
              container.style.boxShadow = 'none';
          }
          
          // Border width and color
          var borderWidth = styles.borderWidth ?? 0;
          var borderColor = styles.borderColor || '#e5e7eb';
          if (borderWidth > 0) {
              container.style.border = borderWidth + 'px solid ' + borderColor;
          }
      }
      
      // Border radius - always apply from styles or config
      var borderRadius = styles.borderRadius ?? config.borderRadius ?? 12;
      container.style.borderRadius = borderRadius + 'px';
      
      // Padding for the form container
      container.style.padding = '20px';
      container.style.boxSizing = 'border-box';
  }

  /**
   * Modal Event Listeners
   */
  function setupModalEvents(productId, config) {
    var closeButtons = (config && config.rootElement)
      ? config.rootElement.querySelectorAll('[data-cod-close="' + config.blockId + '"]')
      : document.querySelectorAll('[data-cod-close="' + productId + '"]');
    closeButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        closeModal(productId, config);
      });
    });

    var overlay = getModalOverlay(config);
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeModal(productId, config);
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal(productId, config);
    });
  }

  /**
   * Quantity Selector Logic
   */
  function setupQuantitySelector(form, config) {
    // Look for the quantity selector in the product info area (parent container)
    var container = form.closest('.cod-form-container') || form.parentElement;
    var input = container.querySelector('.cod-product-qty .cod-qty-input') || form.querySelector('input[name="quantity"]');
    var minus = container.querySelector('.cod-product-qty .cod-qty-minus') || form.querySelector('.cod-qty-minus');
    var plus = container.querySelector('.cod-product-qty .cod-qty-plus') || form.querySelector('.cod-qty-plus');
    
    if (!input || !minus || !plus) {
        console.log('[COD Form] Quantity selector not found');
        return;
    }

    console.log('[COD Form] Quantity selector wired up');

    minus.addEventListener('click', function() {
        var val = parseInt(input.value) || 1;
        if (val > 1) {
            input.value = val - 1;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            triggerUpdate();
        }
    });

    plus.addEventListener('click', function() {
        var val = parseInt(input.value) || 1;
        var max = parseInt(input.max) || config.maxQuantity || 10;
        if (val < max) {
            input.value = val + 1;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            triggerUpdate();
        }
    });

    function triggerUpdate() {
        // Update quantity badge on product image
        var qtyBadge = container.querySelector('.cod-qty-badge');
        if (qtyBadge) {
            qtyBadge.textContent = input.value;
        }
        // Read shipping price directly from the selected radio's data-price attribute
        var shippingPrice = 0;
        var selectedShipping = form.querySelector('input[name="shipping_method"]:checked');
        if (selectedShipping) {
            shippingPrice = parseFloat(selectedShipping.getAttribute('data-price')) || 0;
        }
        updateTotalHelper(form, config, shippingPrice);
    }
  }

  function openModal(productId, config) {
    console.log('[COD Form] openModal called for product:', productId);

    if (config && config._orderPlaced) {
        return;
    }

    // ── Guard: if this is a product-page form (has productId), clear any stale
    // cart flow state left over from a previous cart COD order. Without this,
    // _cartItems from the last cart order would corrupt the product-page pricing,
    // payment methods, and button styling. ──
    var modal = getModalContainer(config);
    var overlay = getModalOverlay(config);
    var form = getOrderFormElement(config);
    var hasBundleOffersActive = !!getProductPageOffersForConfig(config);

    if (config && config.productId) {
        // Clear cart items ONLY IF this is a genuine product-page click.
        // If it's a cart_drawer click on a product page, DO NOT clear the cart items!
        if (window.FoxCod && !window.FoxCod._pendingCartFlow) {
            window.FoxCod._cartItems = null;
            window.FoxCod._orderSource = 'product_page';
        } else if (window.FoxCod) {
            // Consume the flag so subsequent manual clicks on the product page COD button
            // correctly reset back to product_page flow.
            window.FoxCod._pendingCartFlow = false;
        }

        // ── Restore the original product state from the data container ──
        // If the user previously opened the modal via the cart drawer, the DOM and config
        // were patched for the cart. We must restore them if this is a product page click.
        var dataContainerEl = config.rootElement && config.rootElement.querySelector('.cod-form-data');
        if (dataContainerEl) {
            var isCartPageFlow = !!(window.FoxCod && window.FoxCod._cartItems && window.FoxCod._cartItems.length > 0);
            if (!isCartPageFlow) {
                var originalPrice = parseFloat(dataContainerEl.dataset.productPrice);
                if (!isNaN(originalPrice)) config.productPrice = originalPrice;
                if (dataContainerEl.dataset.productTitle) config.productTitle = dataContainerEl.dataset.productTitle;
                config.quantity = 1;

                var scopeEl = modal || form;
                if (scopeEl) {
                    var headerPriceEl = scopeEl.querySelector('.cod-product-price');
                    if (headerPriceEl && !isNaN(originalPrice)) {
                        headerPriceEl.textContent = formatMoney(originalPrice);
                        headerPriceEl.style.display = '';
                    }
                    var headerTitleEl = scopeEl.querySelector('.cod-product-title');
                    if (headerTitleEl && dataContainerEl.dataset.productTitle) {
                        headerTitleEl.textContent = dataContainerEl.dataset.productTitle;
                    }
                    var headerImgEl = scopeEl.querySelector('.cod-product-image');
                    if (headerImgEl && dataContainerEl.dataset.productImage) {
                        headerImgEl.src = dataContainerEl.dataset.productImage;
                    }
                    // Restore product-specific UI elements hidden by cart flow
                    scopeEl.querySelectorAll('.cod-tick-upsell-row').forEach(function(el) { el.style.removeProperty('display'); });
                    scopeEl.querySelectorAll('.cod-quantity-offers').forEach(function(el) { el.style.removeProperty('display'); });
                    scopeEl.querySelectorAll('.cod-qty-badge, .cod-product-qty').forEach(function(el) { el.style.removeProperty('display'); });
                }
                document.querySelectorAll('.cod-product-page-offers').forEach(function(el) { el.style.removeProperty('display'); });
                
                // Force re-render of order summary and payment options with the restored product state
                setTimeout(function() {
                    if (form) {
                        try { restoreFoxCodCheckoutState(form, config); } catch(e) {}
                        updateOrderSummaryWithTickUpsells(form, config);
                        try { renderPaymentMethodOptions(form, config); } catch(e) { console.error('[COD Form] Error re-rendering payment options for product flow:', e); }
                    }
                }, 50);
            }
        }
    }
    
    if (overlay) {
        console.log('[COD Form] Found overlay element:', overlay);
        if (overlay.parentNode !== document.body) {
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }
    if (modal) {
        console.log('[COD Form] Found modal element:', modal);
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('visible'), 10);
    }
    document.body.style.overflow = 'hidden';

    if (config && !config._foxcodModalPopHandler) {
        config._foxcodModalPopHandler = function() {
            var modalEl = getModalContainer(config);
            var overlayEl = getModalOverlay(config);
            var modalVisible = !!(modalEl && modalEl.style.display !== 'none');
            var overlayVisible = !!(overlayEl && overlayEl.style.display !== 'none');

            if (config._foxcodIgnoreNextPopstate) {
                config._foxcodIgnoreNextPopstate = false;
                return;
            }

            if (config._foxcodModalHistoryActive && (modalVisible || overlayVisible)) {
                config._foxcodModalHistoryActive = false;
                closeModal(productId, config, { fromHistory: true });
            }
        };
        window.addEventListener('popstate', config._foxcodModalPopHandler);
    }

    if (config && !config._foxcodModalHistoryActive) {
        history.pushState({ foxcodModalOpen: true }, document.title, window.location.href);
        config._foxcodModalHistoryActive = true;
    }

    hideMainTriggerDuringModal(config);

    // Hide sticky mobile button IMMEDIATELY while form is open
    // Must use display:none because sticky z-index (10000) is above modal z-index (9999)
    if (config && config.rootElement) {
        config.rootElement.querySelectorAll('.cod-buy-btn.sticky-mobile').forEach(function(btn) {
            btn.classList.remove('visible');
            btn.style.setProperty('display', 'none', 'important');
            btn.setAttribute('data-hidden-by-modal', 'true');
        });
    }

    // ── Pixel Tracking: InitiateCheckout ──
    foxCodTrackEvent('InitiateCheckout', { currency: (FoxCod.currencyConfig && FoxCod.currencyConfig.code) || 'USD' });

    // ── Pixel Tracking: AddPaymentInfo on first input ──
    if (form && !form._pixelInputTracked) {
        form._pixelInputTracked = false;
        form.addEventListener('input', function _onFirstInput() {
            if (!form._pixelInputTracked) {
                form._pixelInputTracked = true;
                foxCodTrackEvent('AddPaymentInfo', {});
            }
        });
    }
    
    // Restore saved checkout state instead of resetting the form
    // This preserves user-entered data across modal close/reopen
    if (form) {
        // If an order was just completed, reset the form completely
        var orderJustCompleted = false;
        try { orderJustCompleted = localStorage.getItem('foxcod_order_just_completed') === 'true'; } catch(e) {}
        
        if (orderJustCompleted) {
            form.reset();
            try { localStorage.removeItem('foxcod_order_just_completed'); } catch(e) {}
            console.log('[COD Form] Form reset after completed order');
        } else {
            // Restore in-session checkout state (saved during this page session)
            restoreFoxCodCheckoutState(form, config);
        }

        // Re-apply visual styling for default-checked tick upsells
        var tickRows = form.querySelectorAll('.cod-tick-upsell-row');
        tickRows.forEach(function(row) {
            var cb = row.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) {
                row.style.borderColor = '';
                row.style.background = '';
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        // Always re-apply submit button styles on modal open
        var submitBtn = form.querySelector('.cod-submit-btn');
        applySubmitButtonStyles(submitBtn, config);

        // Always re-render payment method options on modal open so the correct
        // seller-configured methods (Full Prepaid, Partial, COD) appear immediately
        // without the customer needing to interact with the form first.
        // Uses a short delay so the order summary DOM (#cod-summary-total) is
        // already populated before the eligibility check runs.
        setTimeout(function() {
            if (form && form.isConnected) {
                try { renderPaymentMethodOptions(form, config); } catch(e) {
                    console.error('[COD Form] Error re-rendering payment options on open:', e);
                }
                // Re-apply submit button styles again after payment options render
                // (in case the payment option card click listener overwrites it)
                var sbtn = form.querySelector('.cod-submit-btn');
                if (sbtn) {
                    try { applySubmitButtonStyles(sbtn, config); } catch(e) {}
                }
            }
        }, 80);

        // Keep quantity controls/badge hidden when bundle offers are active.
        var container = form.closest('.cod-form-container') || form.closest('.cod-modal') || form.parentElement;
        if (container) {
            var qtySelector = container.querySelector('.cod-product-qty');
            var qtyBadge = container.querySelector('.cod-qty-badge');
            if (hasBundleOffersActive) {
                if (qtySelector) qtySelector.style.setProperty('display', 'none', 'important');
                if (qtyBadge) qtyBadge.style.setProperty('display', 'none', 'important');
            }
        }
    }

    // ── Pre-purchase click upsells: show BEFORE customer fills the form ──
    if (config && config.upsellOffers && config.upsellOffers.click_upsells && config.upsellOffers.click_upsells.length > 0) {
        var prePurchaseCampaigns = config.upsellOffers.click_upsells.filter(function(c) {
            return c.upsell_mode === 'pre_purchase' && shouldShowUpsell(c, config);
        });
        if (prePurchaseCampaigns.length > 0) {
            // Small delay so the form modal is visible first
            setTimeout(function() {
                var preCampaign = prePurchaseCampaigns[0];
                var preOffers = preCampaign.offers || [];
                if (preOffers.length > 0) {
                    var preAccepted = [];
                    showOfferSequence(form, config, productId, preCampaign, preOffers, 0, preAccepted, function(acceptedItems) {
                        if (acceptedItems.length > 0) {
                            // Store pre-purchase accepted items on the form for later inclusion in order
                            var existing = [];
                            try { existing = JSON.parse(form.getAttribute('data-pre-upsell-items') || '[]'); } catch(e) {}
                            var merged = existing.concat(acceptedItems);
                            form.setAttribute('data-pre-upsell-items', JSON.stringify(merged));
                            console.log('[COD Form] Pre-purchase upsell accepted:', acceptedItems.length, 'items');

                            // Render accepted items in the form with image & price
                            var submitBtn = form.querySelector('.cod-submit-btn');
                            var container = form.querySelector('.cod-pre-upsell-items');
                            if (!container) {
                                container = document.createElement('div');
                                container.className = 'cod-pre-upsell-items';
                                container.style.cssText = 'margin:12px 0;display:flex;flex-direction:column;gap:8px;';
                                if (submitBtn) submitBtn.parentNode.insertBefore(container, submitBtn);
                                else form.appendChild(container);
                            }

                            acceptedItems.forEach(function(item) {
                                var row = document.createElement('div');
                                row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#f9fafb;';
                                var imgHtml = item.image ? '<img src="' + item.image + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:8px;flex-shrink:0;">' : '';
                                var price = parseFloat(item.price || 0);
                                row.innerHTML = imgHtml +
                                    '<div style="flex:1;min-width:0;">' +
                                        '<div style="font-size:13px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (item.title || 'Upsell Product') + '</div>' +
                                        '<div style="font-size:11px;color:#10b981;font-weight:500;">✓ Pre-purchase upsell added</div>' +
                                    '</div>' +
                                    '<div style="font-size:14px;font-weight:700;color:#1f2937;flex-shrink:0;">' + formatMoney(price) + '</div>' +
                                    '<button style="background:none;border:none;font-size:16px;color:#9ca3af;cursor:pointer;padding:2px 6px;" data-remove-pre-upsell="' + (item.variant_id || item.product_id) + '">×</button>';

                                // Remove button handler
                                var removeBtn = row.querySelector('[data-remove-pre-upsell]');
                                if (removeBtn) {
                                    removeBtn.addEventListener('click', function() {
                                        var idToRemove = this.getAttribute('data-remove-pre-upsell');
                                        row.remove();
                                        // Update stored pre-upsell items
                                        var items = [];
                                        try { items = JSON.parse(form.getAttribute('data-pre-upsell-items') || '[]'); } catch(e) {}
                                        items = items.filter(function(i) { return (i.variant_id || i.product_id) !== idToRemove; });
                                        form.setAttribute('data-pre-upsell-items', JSON.stringify(items));
                                        updateOrderSummaryWithTickUpsells(form, config);
                                    });
                                }

                                container.appendChild(row);
                            });

                            // Update order summary to include pre-purchase upsells
                            updateOrderSummaryWithTickUpsells(form, config);
                        }
                    });
                }
            }, 400);
        }
    }

    // ── If downsell is active, hide bundle offers and skip offer syncing ──
    var isDownsellActive = form && form.getAttribute('data-downsell-active') === 'true';
    if (isDownsellActive && modal) {
        // Hide bundle offers IMMEDIATELY (synchronously) so they never flash
        var bundleOffers = modal.querySelector('.cod-quantity-offers');
        if (bundleOffers) {
            bundleOffers.style.setProperty('display', 'none', 'important');
            bundleOffers.removeAttribute('data-selected-offer');
        }
        // Also hide ALL cod-quantity-offers in the document (in case of multiple)
        document.querySelectorAll('.cod-quantity-offers').forEach(function(el) {
            el.style.setProperty('display', 'none', 'important');
        });
        // Also hide product page offers container
        var ppOffers = document.querySelector('.cod-product-page-offers');
        if (ppOffers) {
            ppOffers.style.setProperty('display', 'none', 'important');
            ppOffers.removeAttribute('data-selected-offer');
        }
        // Ensure product info section is visible
        var productInfo = modal.querySelector('.cod-product-info');
        if (productInfo) productInfo.style.display = 'flex';
        // Update order summary with downsell price (needs slight delay for DOM)
        setTimeout(function() {
            // Re-hide bundle offers again in case anything restored them
            var bo = modal.querySelector('.cod-quantity-offers');
            if (bo) bo.style.setProperty('display', 'none', 'important');
            document.querySelectorAll('.cod-quantity-offers').forEach(function(el) {
                el.style.setProperty('display', 'none', 'important');
            });
            updateOrderSummaryWithTickUpsells(form, config);
            try { renderPaymentMethodOptions(form, config); } catch(e) { console.error('[COD Form] Error re-rendering payment options for downsell flow:', e); }
        }, 50);
        return; // Skip offer syncing below
    }
    
    // ── Cart page flow: skip product-page offer sync, just refresh the order summary ──
    var isCartPageFlow = !!(window.FoxCod && window.FoxCod._cartItems && window.FoxCod._cartItems.length > 0);
    if (isCartPageFlow) {
        // Patch config so payment option cards that read config.productPrice get the right number
        var cartSubtotal = window.FoxCod._cartItems.reduce(function(sum, item) {
            return sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
        }, 0);
        var cartTotalQty = window.FoxCod._cartItems.reduce(function(sum, item) { return sum + (parseInt(item.quantity) || 1); }, 0);
        config.productPrice = cartSubtotal;
        config.quantity = cartTotalQty;
        config.productTitle = 'Cart Order (' + cartTotalQty + ' item' + (cartTotalQty !== 1 ? 's' : '') + ')';

        // ── Immediately update the modal header price element ──
        // The stored config had the product page price baked in; we must overwrite the DOM
        // before the user sees it, otherwise the wrong price flashes in the header.
        if (modal) {
            var headerPriceEl = modal.querySelector('.cod-product-price');
            if (headerPriceEl) {
                headerPriceEl.textContent = formatMoney(cartSubtotal);
                headerPriceEl.style.display = '';
            }
            var headerTitleEl = modal.querySelector('.cod-product-title');
            if (headerTitleEl) {
                headerTitleEl.textContent = config.productTitle;
            }
        }

        // ── Hide product-specific elements that don't belong in a cart checkout ──
        // The stored config belongs to the product page, so the rendered modal may
        // already contain tick-upsells and bundle/quantity offer cards for that
        // specific product. These must NOT appear in a cart-based order.
        var scopeEl = modal || form;
        if (scopeEl) {
            // 1. Tick upsells (e.g. "Add Shipping Protection")
            scopeEl.querySelectorAll('.cod-tick-upsell-row').forEach(function(el) {
                el.style.setProperty('display', 'none', 'important');
            });
            // 2. Bundle / quantity offer cards
            scopeEl.querySelectorAll('.cod-quantity-offers').forEach(function(el) {
                el.style.setProperty('display', 'none', 'important');
            });
            // 3. Qty badge (shows "2x" for bundle offers) and qty stepper controls
            scopeEl.querySelectorAll('.cod-qty-badge, .cod-product-qty').forEach(function(el) {
                el.style.setProperty('display', 'none', 'important');
            });
        }
        // Also hide product-page offer cards rendered outside the modal (in the block root)
        document.querySelectorAll('.cod-product-page-offers').forEach(function(el) {
            el.style.setProperty('display', 'none', 'important');
        });

        // Force re-render of order summary AND payment options with correct cart totals
        setTimeout(function() {
            if (form) {
                // Restore any saved customer fields (name/phone/address etc.)
                try { restoreFoxCodCheckoutState(form, config); } catch(e) {}
                updateOrderSummaryWithTickUpsells(form, config);
                try { renderPaymentMethodOptions(form, config); } catch(e) { console.error('[COD Form] Error re-rendering payment options for cart flow:', e); }
                // Re-apply seller-configured submit button styling
                var submitBtnCart = form.querySelector('.cod-submit-btn');
                if (submitBtnCart) {
                    try { applySubmitButtonStyles(submitBtnCart, config); } catch(e) {}
                }
            }
        }, 50);
        return;
    }

    // Sync pre-selected offer from product page to the modal
    if (config && form) {
        setTimeout(function() {
            var productPageOffers = getProductPageOffersForConfig(config);
            var selectedOfferData = productPageOffers ? productPageOffers.getAttribute('data-selected-offer') : null;
            
            if (selectedOfferData) {
                try {
                    var offer = JSON.parse(selectedOfferData);
                    console.log('[COD Form] Syncing product page offer to modal:', offer);
                    
                    // Update quantity input
                    var qtyInput = form.querySelector('[name="quantity"]');
                    if (qtyInput) {
                        qtyInput.value = offer.quantity;
                    }
                    
                    // Also set data-selected-offer on modal offers container (for getEffectiveQuantity)
                    var modalOffers = modal.querySelector('.cod-quantity-offers');
                    if (modalOffers) {
                        modalOffers.setAttribute('data-selected-offer', selectedOfferData);
                        // Update visual selection in modal
                        modalOffers.querySelectorAll('.cod-offer-card').forEach(function(mc) {
                            mc.classList.remove('selected');
                        });
                        var matchCard = modalOffers.querySelector('[data-quantity="' + offer.quantity + '"]');
                        if (matchCard) matchCard.classList.add('selected');
                    }

                    // Always sync variant selectors to the latest offer quantity.
                    // This clears stale multi-item bundle variant state when quantity goes back to 1.
                    renderBundleVariantSelectors(form, config, parseInt(offer.quantity, 10) || 1, modalOffers);

                    // Update the price in the product header
                    updateOfferPrice(form, config, offer);
                    
                    // Update order summary with the selected offer
                    updateOrderSummaryWithOffer(form, config, offer);
                    
                    // Re-render shipping rates with new quantity so conditions are re-evaluated
                    var fieldsContainer2 = form.querySelector('.cod-dynamic-fields-container');
                    var shippingSection = form.querySelector('.cod-shipping-section');
                    var shippingMarker = fieldsContainer2 ? fieldsContainer2.querySelector('.cod-section-marker[data-section="shipping"]') : null;
                    if (shippingSection) {
                        shippingSection.remove();
                    }
                    var hasNewShippingRates = config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0;
                    var hasOldShippingOptions = config.shippingRatesEnabled && config.shippingOptions && config.shippingOptions.enabled;
                    var shippingFieldVisible = (config.fields || []).some(function(f) { return f.id === 'shipping' && f.visible !== false; });
                    var shippingEnabled3 = (config.blocks && config.blocks.shipping_options) || shippingFieldVisible;
                    if (shippingEnabled3 && (hasNewShippingRates || hasOldShippingOptions)) {
                        renderShippingOptions(form, config);
                        // Move newly rendered section back into the marker
                        if (shippingMarker) {
                            var newShippingSection = form.querySelector('.cod-shipping-section');
                            if (newShippingSection) {
                                shippingMarker.appendChild(newShippingSection);
                            }
                        }
                    }
                    
                    // Update order summary again after shipping re-render
                    setTimeout(function() {
                        updateOrderSummaryWithOffer(form, config, offer);
                    }, 50);
                } catch (e) {
                    console.warn('[COD Form] Failed to sync product page offer to modal:', e);
                }
            }
        }, 100); // Small delay to let form.reset() and DOM settle
    }
  }

  function closeModal(productId, config, options) {
    try {
      options = options || {};
      var modal = getModalContainer(config);
    var overlay = getModalOverlay(config);

    // Check for downsell campaigns before closing
    if (config && config.upsellOffers && config.upsellOffers.downsells && config.upsellOffers.downsells.length > 0) {
        var matchingDs = config.upsellOffers.downsells.filter(function(ds) {
            return shouldShowUpsell(ds, config);
        });

        if (matchingDs.length > 0) {
            var ds = matchingDs[0];
            var formCloseCount = ds.form_close_count || 1;
            var closeKey = 'foxcod_ds_formclose_' + productId + '_' + (ds.id || 'default');
            var currentCloses = parseInt(localStorage.getItem(closeKey) || '0') + 1;

            if (currentCloses >= formCloseCount) {
                // Threshold reached — show downsell and reset counter
                localStorage.removeItem(closeKey);

                if (config && config._foxcodModalHistoryActive && !options.fromHistory) {
                    config._foxcodModalHistoryActive = false;
                    config._foxcodIgnoreNextPopstate = true;
                    history.back();
                }

                // Close the COD form first
                if (modal) {
                    modal.classList.remove('visible');
                    setTimeout(function() { modal.style.display = 'none'; }, 300);
                }
                if (overlay) overlay.style.display = 'none';
                document.body.style.overflow = '';

                // Show downsell modal after a brief delay
                var form = getOrderFormElement(config);
                setTimeout(function() {
                    showDownsellModal(form, config, productId, ds, [], function(acceptedItems) {
                        if (acceptedItems.length > 0) {
                            console.log('[COD Form] Downsell accepted from form close:', acceptedItems);
                            // Store accepted downsell items on the form for inclusion in order
                            var existingDs = [];
                            try { existingDs = JSON.parse(form.getAttribute('data-downsell-items') || '[]'); } catch(e) {}
                            var merged = existingDs.concat(acceptedItems);
                            form.setAttribute('data-downsell-items', JSON.stringify(merged));
                            // Mark downsell as active BEFORE reopening form
                            form.setAttribute('data-downsell-active', 'true');
                            
                            // Pre-hide bundle offers BEFORE openModal to prevent any flash
                            document.querySelectorAll('.cod-quantity-offers').forEach(function(el) {
                                el.style.setProperty('display', 'none', 'important');
                            });
                            var ppOffersPreHide = document.querySelector('.cod-product-page-offers');
                            if (ppOffersPreHide) ppOffersPreHide.style.setProperty('display', 'none', 'important');
                            
                            // Re-open the form
                            console.log('[COD Form] Re-opening modal from downsell accept...');
                            openModal(productId, config);
                            // Modify the existing .cod-product-info section to show downsell pricing
                            setTimeout(function() {
                                var container = form.closest('.cod-modal') || form.parentElement;
                                console.log('[COD Form] Downsell DOM manipulation container:', container);

                                // ── Hide bundle offers (only one offer at a time) ──
                                var bundleOffers = container.querySelector('.cod-quantity-offers');
                                if (bundleOffers) {
                                    bundleOffers.style.setProperty('display', 'none', 'important');
                                    // Clear any selected bundle offer to prevent double-discount
                                    bundleOffers.removeAttribute('data-selected-offer');
                                }
                                // Hide ALL quantity offers in the document
                                document.querySelectorAll('.cod-quantity-offers').forEach(function(el) {
                                    el.style.setProperty('display', 'none', 'important');
                                });
                                // Also clear product page offers
                                var ppOffers = document.querySelector('.cod-product-page-offers');
                                if (ppOffers) {
                                    ppOffers.style.setProperty('display', 'none', 'important');
                                    ppOffers.removeAttribute('data-selected-offer');
                                }

                                // ── Show product info at top ──
                                var productInfoSection = container.querySelector('.cod-product-info');
                                if (!productInfoSection) {
                                    // If it was hidden by bundle offers, we need to check for it
                                    // It might have display:none from hideProductHeaderIfOffersActive
                                    var allProductInfo = container.querySelectorAll('.cod-product-info');
                                    allProductInfo.forEach(function(el) {
                                        if (el.style.display === 'none') {
                                            productInfoSection = el;
                                        }
                                    });
                                }

                                if (productInfoSection) {
                                    // Ensure product info is visible
                                    productInfoSection.style.display = 'flex';

                                    // Get the price element and modify it
                                    var priceEl = productInfoSection.querySelector('.cod-product-price');
                                    var dsItem = merged[0];
                                    var originalPrice = parseFloat(config.productPrice) || 0;

                                    if (priceEl) {
                                        // Remove any previous downsell markup
                                        var prevDs = productInfoSection.querySelector('.cod-ds-price-wrapper');
                                        if (prevDs) prevDs.remove();

                                        // Hide original price element
                                        priceEl.style.display = 'none';

                                        // Create new price wrapper with strikeout + discounted price
                                        var priceWrapper = document.createElement('div');
                                        var dsPriceColor = config.priceColor || config.accentColor;
                                        priceWrapper.className = 'cod-ds-price-wrapper';
                                        priceWrapper.innerHTML =
                                            '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                                            '  <span style="text-decoration: line-through; color: #9ca3af; font-size: 14px;">' + formatMoney(originalPrice) + '</span>' +
                                            '  <span style="font-size: 18px; font-weight: 700; color: ' + dsPriceColor + ';">' + formatMoney(dsItem.price) + '</span>' +
                                            '</div>' +
                                            '<div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">' +
                                            '  <span style="font-size: 11px; color: #10b981; font-weight: 600;">✓ Downsell offer applied</span>' +
                                            '  <button type="button" class="cod-ds-remove" style="padding: 2px 8px; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; font-size: 10px; color: #ef4444; background: #fff;">Remove</button>' +
                                            '</div>';
                                        priceEl.parentNode.insertBefore(priceWrapper, priceEl.nextSibling);

                                        priceWrapper.querySelector('.cod-ds-remove').addEventListener('click', function() {
                                            form.removeAttribute('data-downsell-items');
                                            form.removeAttribute('data-downsell-active');
                                            priceWrapper.remove();
                                            priceEl.style.display = '';
                                            // ── Restore bundle offers ──
                                            var bOffers = container.querySelector('.cod-quantity-offers');
                                            if (bOffers) {
                                                bOffers.style.display = '';
                                                // Re-hide product info if bundle offers are present
                                                productInfoSection.style.display = 'none';
                                            }
                                            // Restore product page offers if they exist
                                            var ppOffers = document.querySelector('.cod-product-page-offers');
                                            if (ppOffers) ppOffers.style.display = '';
                                            // Update order summary to remove downsell
                                            updateOrderSummaryWithTickUpsells(form, config);
                                        });
                                    }
                                }
                                // Update order summary to include downsell price
                                updateOrderSummaryWithTickUpsells(form, config);
                            }, 200);
                        } else {
                            // Downsell was dismissed; make sure the trigger is restored.
                            restoreTriggersAfterModal(config);
                        }
                    });
                }, 350);
                return; // Don't close normally — downsell is being shown
            } else {
                // Not enough closes yet — increment and close normally
                localStorage.setItem(closeKey, String(currentCloses));
            }
        }
    }

    // Normal close (no downsell or threshold not reached)
    // Save form state BEFORE closing so it persists across reopen
    var form = getOrderFormElement(config);
    if (form) {
        saveFoxCodCheckoutState(form);
    }

    // ── Clear cart flow state so a subsequent product-page modal open
    //    doesn't inherit stale cart items / pricing from this session ──
    if (window.FoxCod && window.FoxCod._cartItems) {
        window.FoxCod._cartItems = null;
        window.FoxCod._orderSource = null;
    }

    if (modal) {
        modal.classList.remove('visible');
        setTimeout(function() { modal.style.display = 'none'; }, 300);
    }
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';

    if (config && config._foxcodModalHistoryActive && !options.fromHistory) {
        config._foxcodModalHistoryActive = false;
        config._foxcodIgnoreNextPopstate = true;
        history.back();
    }

    // Re-evaluate sticky button visibility after closing the modal.
    restoreTriggersAfterModal(config);
    } catch(e) {
        console.error('[COD Form] Error in closeModal:', e);
        // Fallback: force close all modals just in case
        document.querySelectorAll('.cod-modal.visible, .cod-form-container.cod-modal').forEach(function(el) {
            el.classList.remove('visible');
            el.style.display = 'none';
        });
        document.querySelectorAll('.cod-modal-overlay').forEach(function(el) {
            el.style.display = 'none';
        });
        document.body.style.overflow = '';
    }
  }

  // =============================================
  // UPSELL RENDERING FUNCTIONS
  // =============================================

  /**
   * Check if an upsell should show for the current product
   */
  function shouldShowUpsell(campaign, config) {
      // Disable upsells on the Cart page checkout since the user is already checking out a full cart
      if (!config.productId) return false;

      // Disable upsells globally if we are currently checking out via a Cart flow
      if (window.FoxCod && window.FoxCod._cartItems && window.FoxCod._cartItems.length > 0) {
          return false;
      }
      
      if (campaign.show_condition_type === 'always') return true;
      if (campaign.show_condition_type === 'specific_products') {
          var currentId = String(config.productId);
          return (campaign.trigger_product_ids || []).some(function(tid) {
              var tidStr = String(tid);
              return tidStr === currentId || tidStr.includes(currentId) || currentId.includes(tidStr);
          });
      }
      if (campaign.show_condition_type === 'order_value') {
          var orderTotal = parseFloat(config.productPrice || 0) * parseInt(config.quantity || 1);
          var min = parseFloat(campaign.min_order_value) || 0;
          var max = parseFloat(campaign.max_order_value) || 0;
          if (min > 0 && orderTotal < min) return false;
          if (max > 0 && orderTotal > max) return false;
          return true;
      }
      return true;
  }

  function getMarketAwareOfferData(offer, campaignType) {
      if (!offer) return { originalPrice: 0, discountedPrice: 0, savings: 0, currencyCode: '', formattedOriginalPrice: '', formattedDiscountedPrice: '', formattedSavings: '' };
      
      var variantId = String(offer.upsell_variant_id || offer.variant_id || '');
      var contextualData = window.FoxCod.contextualPrices.prices[variantId];
      
      var originalPrice = contextualData ? contextualData.amount : (offer.original_price || 0);
      var currencyCode = (contextualData && contextualData.currencyCode) || window.FoxCod.contextualPrices.currencyCode || (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'USD';
      
      var discountedPrice = originalPrice;
      if (campaignType === 'tick_upsell') {
          discountedPrice = originalPrice;
      } else if (offer.discount_type === 'percentage') {
          discountedPrice = Math.round((originalPrice - originalPrice * (offer.discount_value || 0) / 100) * 100) / 100;
      } else {
          discountedPrice = Math.max(0, originalPrice - (offer.discount_value || 0));
      }
      
      var savings = Math.max(0, originalPrice - discountedPrice);
      
      var activeMarket = window.FoxCod.resolveActiveMarket ? window.FoxCod.resolveActiveMarket(null) : { country: 'UNKNOWN' };

      console.log('[FOXCOD OFFER PRICE TRACE]', JSON.stringify({
          offerId: offer.id,
          variantId: variantId,
          offerType: offer.upsell_variant_id ? 'UPSELL_OR_DOWNSELL' : 'QUANTITY_OR_OTHER',
          staticOriginalPrice: offer.original_price || 0,
          contextualPrice: contextualData ? contextualData.amount : null,
          selectedPriceSource: contextualData ? 'contextualPrices_cache' : 'fallback_static',
          currencyCode: currencyCode,
          marketCountry: activeMarket.country
      }, null, 2));
      
      function fmtAmt(amt) {
          try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amt); }
          catch (e) { return formatMoney(amt); }
      }
      
      return {
          originalPrice: originalPrice,
          discountedPrice: discountedPrice,
          savings: savings,
          currencyCode: currencyCode,
          formattedOriginalPrice: fmtAmt(originalPrice),
          formattedDiscountedPrice: fmtAmt(discountedPrice),
          formattedSavings: fmtAmt(savings)
      };
  }

  function renderTickUpsells(form, config) {
      var data = config.upsellOffers;
      if (!data || !data.tick_upsells || data.tick_upsells.length === 0) return;
      var campaigns = data.tick_upsells.filter(function(c) { return shouldShowUpsell(c, config); });
      if (campaigns.length === 0) return;

      var container = document.createElement('div');
      container.className = 'cod-tick-upsells';
      container.style.cssText = 'margin: 16px 0; display: flex; flex-direction: column; gap: 10px;';

      // Inject marching ants animation CSS once
      if (!document.getElementById('cod-tick-anim-css')) {
          var animStyle = document.createElement('style');
          animStyle.id = 'cod-tick-anim-css';
          animStyle.textContent = '@keyframes cod-marching-ants{to{stroke-dashoffset:-20}}';
          document.head.appendChild(animStyle);
      }

      campaigns.forEach(function(campaign) {
          var design = campaign.design || {};
          var acceptBtn = design.acceptButton || {};
          (campaign.offers || []).forEach(function(offer) {
              console.log('[FOXCOD OFFER PRICING DEBUG]', { OFFER_TYPE: 'TICK_UPSELL', VARIANT_ID: offer.variant_id });
              var offerData = getMarketAwareOfferData(offer, 'tick_upsell');
              var offerPrice = offerData.discountedPrice;
              var borderStyle = acceptBtn.borderStyle || 'dashed';
              var borderColor = acceptBtn.borderColor || acceptBtn.bgColor || '#10b981';
              var borderWidth = acceptBtn.borderWidth || 2;
              var borderRadius = acceptBtn.borderRadius || 10;

              var row = document.createElement('label');
              row.className = 'cod-tick-upsell-row';
              row.setAttribute('data-campaign-id', campaign.id);
              row.setAttribute('data-offer-id', offer.id);
              row.setAttribute('data-offer-price', String(offerPrice));
              row.setAttribute('data-offer-title', offer.upsell_product_title || 'Upsell');

              var baseCss = 'display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: ' + borderRadius + 'px; background: ' + (design.bgColor || '#f0fdf4') + '; cursor: pointer; transition: all 0.2s; position: relative;';

              if (borderStyle === 'none') {
                  baseCss += ' border: none;';
              } else if (borderStyle === 'dashed_animation') {
                  baseCss += ' border: none; overflow: hidden;';
              } else {
                  baseCss += ' border: ' + borderWidth + 'px ' + borderStyle + ' ' + borderColor + ';';
              }

              row.style.cssText = baseCss;

              // Add SVG overlay for dashed animation
              if (borderStyle === 'dashed_animation') {
                  var svgNS = 'http://www.w3.org/2000/svg';
                  var svg = document.createElementNS(svgNS, 'svg');
                  svg.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;';
                  var rect = document.createElementNS(svgNS, 'rect');
                  rect.setAttribute('x', '1');
                  rect.setAttribute('y', '1');
                  rect.setAttribute('width', 'calc(100% - 2px)');
                  rect.setAttribute('height', 'calc(100% - 2px)');
                  rect.setAttribute('rx', String(borderRadius));
                  rect.setAttribute('ry', String(borderRadius));
                  rect.setAttribute('fill', 'none');
                  rect.setAttribute('stroke', borderColor);
                  rect.setAttribute('stroke-width', String(borderWidth));
                  rect.setAttribute('stroke-dasharray', '8 4');
                  rect.style.animation = 'cod-marching-ants 0.4s linear infinite';
                  svg.appendChild(rect);
                  row.appendChild(svg);
              }

              var cb = document.createElement('input');
              cb.type = 'checkbox'; cb.name = 'tick_upsell_' + campaign.id + '_' + offer.id;
              var isDefaultChecked = campaign.checkbox_default_checked === true || campaign.checkbox_default_checked === 'true';
              cb.checked = isDefaultChecked;
              cb.defaultChecked = isDefaultChecked; // Set HTML attribute so form.reset() preserves the default state
              var tickColor = acceptBtn.bgColor || '#10b981';
              cb.style.cssText = 'width: 20px; height: 20px; accent-color: ' + tickColor + '; flex-shrink: 0; -webkit-appearance: checkbox; appearance: checkbox;';
              row.appendChild(cb);

              // Apply initial styling if default checked
              if (isDefaultChecked) {
                  row.style.borderColor = borderColor;
                  row.style.background = design.bgColor || '#f0fdf4';
              } else {
                  row.style.borderColor = borderColor + '30';
                  row.style.background = '#fafafa';
              }

              if (offer.upsell_product_image) {
                  var img = document.createElement('img');
                  img.src = offer.upsell_product_image;
                  img.style.cssText = 'width: 44px; height: 44px; border-radius: 8px; object-fit: cover; flex-shrink: 0;';
                  row.appendChild(img);
              }

              var info = document.createElement('div');
              info.style.cssText = 'flex: 1; color: ' + (design.headerTextColor || '#1f2937') + ';';
              var title = document.createElement('div');
              title.style.cssText = 'font-weight: 600; font-size: ' + (design.headerTextSize || 14) + 'px; margin-bottom: 2px;';
              // Resolve {{title}} and {{price}} placeholders
              var headerText = design.headerText || ('Add ' + (offer.upsell_product_title || 'this product') + ' for ' + offerData.formattedDiscountedPrice);
              headerText = headerText.replace('{{title}}', offer.upsell_product_title || 'this product');
              headerText = headerText.replace('{{price}}', offerData.formattedDiscountedPrice);
              title.textContent = headerText;
              info.appendChild(title);

              var priceDiv = document.createElement('div');
              priceDiv.style.cssText = 'font-size: 13px;';
              priceDiv.innerHTML = '<strong style="color: #059669;">' + offerData.formattedDiscountedPrice + '</strong>';
              if (offerData.savings > 0) {
                  priceDiv.innerHTML += ' <span style="text-decoration: line-through; opacity: 0.6; margin-left: 4px;">' + offerData.formattedOriginalPrice + '</span>';
              }
              info.appendChild(priceDiv);
              row.appendChild(info);

              cb.addEventListener('change', function() {
                  row.style.borderColor = cb.checked ? (borderColor) : (borderColor) + '30';
                  row.style.background = cb.checked ? (design.bgColor || '#f0fdf4') : '#fafafa';
                  // Update order summary including tick upsells
                  updateOrderSummaryWithTickUpsells(form, config);
              });
              container.appendChild(row);

              // If default checked, trigger initial order summary update after rendering
               if (campaign.checkbox_default_checked === true || campaign.checkbox_default_checked === 'true') {
                  setTimeout(function() { updateOrderSummaryWithTickUpsells(form, config); }, 200);
              }
          });
      });

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.parentNode.insertBefore(container, submitBtn);
      else form.appendChild(container);
      console.log('[COD Form] Rendered tick upsells');
  }

  function getCheckedTickUpsells(form, config) {
      var items = [];
      var data = config.upsellOffers;
      if (!data || !data.tick_upsells) return items;
      data.tick_upsells.forEach(function(campaign) {
          (campaign.offers || []).forEach(function(offer) {
              var cb = form.querySelector('input[name="tick_upsell_' + campaign.id + '_' + offer.id + '"]');
              if (cb && cb.checked) {
                  var offerData = getMarketAwareOfferData(offer, 'tick_upsell');
                  
                  var activeMarket = window.FoxCod.resolveActiveMarket ? window.FoxCod.resolveActiveMarket(null) : { country: 'UNKNOWN' };
                  console.log('[FOXCOD OFFER ACCEPT TRACE]', JSON.stringify({
                      offerId: offer.id,
                      variantId: offer.upsell_variant_id,
                      displayedPrice: offerData.discountedPrice,
                      submittedPrice: offerData.discountedPrice,
                      currencyCode: offerData.currencyCode,
                      marketCountry: activeMarket.country
                  }, null, 2));

                  items.push({ product_id: offer.upsell_product_id, variant_id: offer.upsell_variant_id, title: offer.upsell_product_title, price: offerData.discountedPrice, quantity: 1, type: 'tick_upsell' });
              }
          });
      });
      return items;
  }

  function buildUpsellModalHTML(campaign, offer, offerIndex, config) {
      console.log('[FOXCOD OFFER PRICING DEBUG]', { OFFER_TYPE: 'UPSELL_MODAL', VARIANT_ID: offer.variant_id });
      var offerData = getMarketAwareOfferData(offer, campaign.type || 'click_upsell');
      
      var design = campaign.design || {};
      var timer = design.timer || {};
      var discountTag = design.discountTag || {};
      var acceptBtn = design.acceptButton || {};
      var rejectBtn = design.rejectButton || {};
      
      var offerPrice = offerData.discountedPrice;
      var hasDiscount = offerData.savings > 0;
      var discountLabel = offer.discount_type === 'percentage' ? offer.discount_value + '%' : offerData.formattedSavings;

      var rawBgImage = design.bgImage || '';
      var resolvedBgImage = resolveBgPreset(rawBgImage, config.appUrl);
      var bgStyle = resolvedBgImage
          ? 'background-image: url(' + resolvedBgImage + '); background-size: cover; background-position: center;'
          : 'background: ' + (design.bgColor || '#fff') + ';';
      var html = '<div style="padding: 24px; text-align: center; ' + bgStyle + '">';
      html += '<h2 style="font-size: ' + (design.headerTextSize || 20) + 'px; color: ' + (design.headerTextColor || '#000') + '; font-weight: ' + (design.headerBold ? '700' : '400') + '; margin: 0 0 4px;">' + (design.headerText || "You've unlocked a special deal") + '</h2>';
      html += '<p style="font-size: 14px; color: #6b7280; margin: 0 0 12px;">' + (design.subheaderText || 'Only for a limited time!') + '</p>';

      if (timer.enabled) {
          html += '<div class="cod-upsell-timer" style="background: ' + (timer.bgColor || '#fdf6f6') + '; color: ' + (timer.textColor || '#ef4444') + '; padding: 10px 20px; border-radius: 8px; margin: 0 0 16px; font-weight: 600; white-space: pre-line;" data-minutes="' + (timer.minutes || 10) + '">';
          html += (timer.text || 'Hurry! sale ends in\n{time}').replace('{time}', '<span class="cod-timer-value">' + String(timer.minutes || 10).padStart(2, '0') + ':00</span>');
          html += '</div>';
      }

      if (offer.upsell_product_image) {
          html += '<div style="position: relative; margin: 0 0 12px; text-align: center; display: flex; justify-content: center;"><img src="' + offer.upsell_product_image + '" style="max-width: 200px; max-height: 200px; object-fit: contain; margin: 0 auto;" /></div>';
      }
      html += '<div style="font-size: 14px; margin-bottom: 8px;">' + (offer.upsell_product_title || 'Product') + '</div>';

      if (hasDiscount) {
          html += '<div style="margin-bottom: 8px;"><span style="display: inline-block; padding: 4px 16px; border-radius: ' + (discountTag.borderRadius || 20) + 'px; background: ' + (discountTag.bgColor || '#ec4899') + '; color: ' + (discountTag.textColor || '#fff') + '; font-size: ' + (discountTag.textSize || 14) + 'px; font-weight: 700;">' + (discountTag.text || '- {discount}').replace('{discount}', discountLabel) + '</span></div>';
      }

      html += '<div style="margin-bottom: 20px;">';
      if (hasDiscount) html += '<s style="color: #9ca3af; font-size: 14px; margin-right: 8px;">' + offerData.formattedOriginalPrice + '</s>';
      html += '<strong style="font-size: 20px; color: #1f2937;">' + offerData.formattedDiscountedPrice + '</strong></div>';

      // Determine animation class for accept button
      var animClass = '';
      if (acceptBtn.animation && acceptBtn.animation !== 'none') {
          animClass = ' cod-upsell-anim-' + acceptBtn.animation;
      }

      // Inject animation keyframes CSS if needed
      if (animClass) {
          html += '<style>';
          html += '@keyframes cod-up-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}';
          html += '@keyframes cod-up-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}';
          html += '@keyframes cod-up-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}';
          html += '.cod-upsell-anim-pulse{animation:cod-up-pulse 1.5s ease-in-out infinite}';
          html += '.cod-upsell-anim-bounce{animation:cod-up-bounce 1s ease-in-out infinite}';
          html += '.cod-upsell-anim-shake{animation:cod-up-shake .5s ease-in-out infinite}';
          html += '</style>';
      }

      html += '<button class="cod-upsell-accept' + animClass + '" style="display: block; width: 100%; padding: 14px; margin-bottom: 8px; background: ' + (acceptBtn.bgColor || '#000') + '; color: ' + (acceptBtn.textColor || '#fff') + '; font-size: ' + (acceptBtn.textSize || 16) + 'px; font-weight: ' + (acceptBtn.bold ? '700' : '400') + '; border: ' + (acceptBtn.borderWidth || 0) + 'px solid ' + (acceptBtn.borderColor || '#000') + '; border-radius: ' + (acceptBtn.borderRadius || 8) + 'px; cursor: pointer; box-shadow: ' + (acceptBtn.shadow ? '0 4px 12px rgba(0,0,0,.15)' : 'none') + ';">' + (acceptBtn.text || 'Yes, add to my order') + '</button>';
      html += '<button class="cod-upsell-decline" style="display: block; width: 100%; padding: 12px; background: ' + (rejectBtn.bgColor || '#fff') + '; color: ' + (rejectBtn.textColor || '#000') + '; font-size: ' + (rejectBtn.textSize || 16) + 'px; border: ' + (rejectBtn.borderWidth || 1) + 'px solid ' + (rejectBtn.borderColor || '#000') + '; border-radius: ' + (rejectBtn.borderRadius || 8) + 'px; cursor: pointer; box-shadow: ' + (rejectBtn.shadow ? '0 4px 12px rgba(0,0,0,.15)' : 'none') + ';">' + (rejectBtn.text || 'No thanks') + '</button>';
      html += '</div>';
      return html;
  }

  function startUpsellTimer(overlay) {
      var timerEl = overlay.querySelector('.cod-upsell-timer');
      if (!timerEl) return;
      var minutes = parseInt(timerEl.getAttribute('data-minutes')) || 10;
      var totalSeconds = minutes * 60;
      var valueEl = timerEl.querySelector('.cod-timer-value');
      if (!valueEl) return;
      var interval = setInterval(function() {
          totalSeconds--;
          if (totalSeconds <= 0) {
              clearInterval(interval);
              valueEl.textContent = '00:00';
              timerEl.innerHTML = '<strong>⏰ Offer expired! Decide now before it\'s gone.</strong>';
              return;
          }
          var m = Math.floor(totalSeconds / 60); var s = totalSeconds % 60;
          valueEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      }, 1000);
      overlay._timerInterval = interval;
  }

  function showClickUpsellModal(form, config, productId, onComplete) {
      var data = config.upsellOffers;
      if (!data || !data.click_upsells || data.click_upsells.length === 0) { onComplete([]); return false; }
      var campaigns = data.click_upsells.filter(function(c) { return shouldShowUpsell(c, config); });
      if (campaigns.length === 0) { onComplete([]); return false; }

      var campaign = campaigns[0];
      var offers = campaign.offers || [];
      if (offers.length === 0) { onComplete([]); return false; }

      var acceptedItems = [];
      showOfferSequence(form, config, productId, campaign, offers, 0, acceptedItems, onComplete);
      return true;
  }

  function showOfferSequence(form, config, productId, campaign, offers, offerIndex, acceptedItems, onComplete) {
      if (offerIndex >= offers.length) {
          // All offers shown, check for linked downsell if last was declined
          onComplete(acceptedItems);
          return;
      }
      var offer = offers[offerIndex];

      // Show popup instantly — bg images use embedded data URIs
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 16px;';
      var modal = document.createElement('div');
      var isMobileUpsell = window.innerWidth <= 480;
      modal.style.cssText = 'background: #fff; border-radius: 24px; max-width: ' + (isMobileUpsell ? '340px' : '420px') + '; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-height: ' + (isMobileUpsell ? '85vh' : '90vh') + '; overflow-y: auto;';
      modal.innerHTML = buildUpsellModalHTML(campaign, offer, offerIndex, config);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      startUpsellTimer(overlay);

      modal.querySelector('.cod-upsell-accept').addEventListener('click', function() {
          if (overlay._timerInterval) clearInterval(overlay._timerInterval);
          console.log('[COD Form] Upsell offer accepted:', offer.upsell_product_title);
          var offerData = getMarketAwareOfferData(offer, campaign.type || 'click_upsell');
          
          var activeMarket = window.FoxCod.resolveActiveMarket ? window.FoxCod.resolveActiveMarket(null) : { country: 'UNKNOWN' };
          console.log('[FOXCOD OFFER ACCEPT TRACE]', JSON.stringify({
              offerId: offer.id,
              variantId: offer.upsell_variant_id,
              displayedPrice: offerData.discountedPrice,
              submittedPrice: offerData.discountedPrice,
              currencyCode: offerData.currencyCode,
              marketCountry: activeMarket.country
          }, null, 2));

          acceptedItems.push({ product_id: offer.upsell_product_id, variant_id: offer.upsell_variant_id, title: offer.upsell_product_title, price: offerData.discountedPrice, quantity: 1, type: 'click_upsell' });
          overlay.remove();
          if (offerIndex + 1 < offers.length) {
              showOfferSequence(form, config, productId, campaign, offers, offerIndex + 1, acceptedItems, onComplete);
          } else {
              onComplete(acceptedItems);
          }
      });

      modal.querySelector('.cod-upsell-decline').addEventListener('click', function() {
          if (overlay._timerInterval) clearInterval(overlay._timerInterval);
          overlay.remove();
          if (offerIndex + 1 < offers.length) {
              showOfferSequence(form, config, productId, campaign, offers, offerIndex + 1, acceptedItems, onComplete);
          } else if (campaign.linked_downsell_id && config.upsellOffers.downsells) {
              var ds = config.upsellOffers.downsells.find(function(d) { return d.id === campaign.linked_downsell_id; });
              if (ds) {
                  showDownsellModal(form, config, productId, ds, acceptedItems, onComplete);
              } else {
                  onComplete(acceptedItems);
              }
          } else {
              onComplete(acceptedItems);
          }
      });
  }

  function buildDownsellModalHTML(dsCampaign, offer, config) {
      console.log('[FOXCOD OFFER PRICING DEBUG]', { OFFER_TYPE: 'DOWNSELL_MODAL', VARIANT_ID: offer.variant_id });
      var offerData = getMarketAwareOfferData(offer, dsCampaign.type || 'downsell');

      var design = dsCampaign.design || {};
      var acceptBtn = design.acceptButton || {};
      var rejectBtn = design.rejectButton || {};
      
      var origPrice = offerData.originalPrice;
      var offerPrice = offerData.discountedPrice;
      var hasDiscount = offerData.savings > 0;
      var discountLabel = offer.discount_type === 'percentage' ? offer.discount_value + '%' : offerData.formattedSavings;

      // Icon helper
      var iconMap = { cart: '🛒', check: '✓', star: '⭐', gift: '🎁', heart: '❤️' };
      var acceptIcon = acceptBtn.changeIcon && acceptBtn.changeIcon !== 'none' ? iconMap[acceptBtn.changeIcon] + ' ' : '';
      var rejectIcon = rejectBtn.changeIcon && rejectBtn.changeIcon !== 'none' ? iconMap[rejectBtn.changeIcon] + ' ' : '';

      // Resolve {discount} placeholder in button text
      var acceptText = (acceptBtn.text || 'Complete order with {discount} OFF').replace('{discount}', discountLabel);
      var rejectText = rejectBtn.text || 'No thanks';

      var html = '';

      // Animation keyframes
      html += '<style>';
      html += '@keyframes cod-up-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}';
      html += '@keyframes cod-up-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}';
      html += '@keyframes cod-up-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}';
      html += '.cod-upsell-anim-pulse{animation:cod-up-pulse 1.5s ease-in-out infinite}';
      html += '.cod-upsell-anim-bounce{animation:cod-up-bounce 1s ease-in-out infinite}';
      html += '.cod-upsell-anim-shake{animation:cod-up-shake .5s ease-in-out infinite}';
      html += '</style>';

      // Background: image takes priority, then gradient/color
      var rawBgImg = design.bgImage || '';
      var resolvedBgImg = resolveBgPreset(rawBgImg, config.appUrl);
      var bgCss = resolvedBgImg
          ? 'background-image: url(' + resolvedBgImg + '); background-size: cover; background-position: center;'
          : 'background: ' + (design.bgColor || '#fff') + ';';

      // Main container
      html += '<div style="padding: 32px 24px; text-align: center; ' + bgCss + ' border-radius: 12px;">';

      // Title
      if (design.titleText) {
          html += '<div style="font-size: ' + (design.titleTextSize || 24) + 'px; color: ' + (design.titleTextColor || '#000') + '; font-weight: ' + (design.titleBold ? '700' : '400') + '; font-style: ' + (design.titleItalic ? 'italic' : 'normal') + '; margin: 0 0 4px;">' + design.titleText + '</div>';
      }

      // Subtitle
      if (design.subtitleText) {
          html += '<div style="font-size: ' + (design.subtitleTextSize || 16) + 'px; color: ' + (design.subtitleTextColor || '#000') + '; font-weight: ' + (design.subtitleBold ? '700' : '400') + '; font-style: ' + (design.subtitleItalic ? 'italic' : 'normal') + '; margin: 0 0 8px;">' + design.subtitleText + '</div>';
      }

      // Description
      if (design.descriptionText) {
          html += '<div style="font-size: ' + (design.descriptionTextSize || 20) + 'px; color: ' + (design.descriptionTextColor || '#000') + '; font-weight: ' + (design.descriptionBold ? '700' : '400') + '; font-style: ' + (design.descriptionItalic ? 'italic' : 'normal') + '; margin: 0 0 12px;">' + design.descriptionText + '</div>';
      }

      // Discount badge
      if (hasDiscount) {
          var badgeSize = (design.discountBadgeSize || 50) + 20;
          var badgeTextSize = design.discountBadgeTextSize || 20;
          var badgeBg = design.discountBadgeBgColor || 'linear-gradient(135deg, #ff4500, #ff8c00)';
          var badgeColor = design.discountBadgeDiscountColor || '#fff';
          html += '<div style="margin: 8px 0 12px; display: flex; justify-content: center;">';
          html += '<div style="display: inline-flex; align-items: center; justify-content: center; width: ' + badgeSize + 'px; height: ' + badgeSize + 'px; border-radius: 50%; background: ' + badgeBg + '; box-shadow: 0 4px 20px rgba(255,69,0,0.3);">';
          html += '<span style="color: ' + badgeColor + '; font-size: ' + badgeTextSize + 'px; font-weight: 700;">' + discountLabel + '</span>';
          html += '</div></div>';
      }

      // Content text
      if (design.contentText) {
          html += '<div style="font-size: ' + (design.contentTextSize || 16) + 'px; color: ' + (design.contentTextColor || '#000') + '; font-weight: ' + (design.contentBold ? '700' : '400') + '; font-style: ' + (design.contentItalic ? 'italic' : 'normal') + '; margin: 0 0 12px;">' + design.contentText + '</div>';
      }

      // Product image removed — downsell shows no image by design

      // Product title
      if (offer.upsell_product_title) {
          html += '<div style="font-size: 14px; margin-bottom: 6px; color: #374151;">' + offer.upsell_product_title + '</div>';
      }

      // Price display - only show when product has a price
      if (origPrice > 0) {
          html += '<div style="margin-bottom: 20px;">';
          if (hasDiscount) html += '<s style="color: #9ca3af; font-size: 14px; margin-right: 8px;">' + offerData.formattedOriginalPrice + '</s>';
          html += '<strong style="font-size: 20px; color: #1f2937;">' + offerData.formattedDiscountedPrice + '</strong></div>';
      }

      // Accept button animation class
      var acceptAnimClass = acceptBtn.animation && acceptBtn.animation !== 'none' ? ' cod-upsell-anim-' + acceptBtn.animation : '';
      var rejectAnimClass = rejectBtn.animation && rejectBtn.animation !== 'none' ? ' cod-upsell-anim-' + rejectBtn.animation : '';

      // Accept button
      html += '<button class="cod-upsell-accept' + acceptAnimClass + '" style="display: block; width: 100%; padding: 14px; margin-bottom: 8px; background: ' + (acceptBtn.bgColor || '#000') + '; color: ' + (acceptBtn.textColor || '#fff') + '; font-size: ' + (acceptBtn.textSize || 16) + 'px; font-weight: ' + (acceptBtn.bold ? '700' : '400') + '; font-style: ' + (acceptBtn.italic ? 'italic' : 'normal') + '; border: ' + (acceptBtn.borderWidth || 0) + 'px solid ' + (acceptBtn.borderColor || '#000') + '; border-radius: ' + (acceptBtn.borderRadius || 8) + 'px; cursor: pointer; box-shadow: ' + (acceptBtn.shadow ? '0 4px 12px rgba(0,0,0,.15)' : 'none') + ';">' + acceptIcon + acceptText + '</button>';

      // Reject button
      html += '<button class="cod-upsell-decline' + rejectAnimClass + '" style="display: block; width: 100%; padding: 12px; background: ' + (rejectBtn.bgColor || '#fff') + '; color: ' + (rejectBtn.textColor || '#000') + '; font-size: ' + (rejectBtn.textSize || 16) + 'px; font-weight: ' + (rejectBtn.bold ? '700' : '400') + '; font-style: ' + (rejectBtn.italic ? 'italic' : 'normal') + '; border: ' + (rejectBtn.borderWidth || 1) + 'px solid ' + (rejectBtn.borderColor || '#000') + '; border-radius: ' + (rejectBtn.borderRadius || 8) + 'px; cursor: pointer; box-shadow: ' + (rejectBtn.shadow ? '0 4px 12px rgba(0,0,0,.15)' : 'none') + ';">' + rejectIcon + rejectText + '</button>';

      html += '</div>';
      return html;
  }

  function showDownsellModal(form, config, productId, dsCampaign, acceptedItems, onComplete) {
      var offers = dsCampaign.offers || [];
      if (offers.length === 0) { onComplete(acceptedItems); return; }
      var offer = offers[0];

      // Show popup instantly — bg images use embedded data URIs
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 16px;';
      var modal = document.createElement('div');
      var isMobileDs = window.innerWidth <= 480;
      modal.style.cssText = 'background: #fff; border-radius: 24px; max-width: ' + (isMobileDs ? '360px' : '460px') + '; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-height: ' + (isMobileDs ? '85vh' : '90vh') + '; overflow-y: auto;';

      // Use dedicated downsell builder if design has downsell-specific fields, else fallback to upsell builder
      var hasDownsellDesign = dsCampaign.design && (dsCampaign.design.titleText || dsCampaign.design.subtitleText || dsCampaign.design.descriptionText);
      modal.innerHTML = hasDownsellDesign ? buildDownsellModalHTML(dsCampaign, offer, config) : buildUpsellModalHTML(dsCampaign, offer, 0, config);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      startUpsellTimer(overlay);

      modal.querySelector('.cod-upsell-accept').addEventListener('click', function() {
          if (overlay._timerInterval) clearInterval(overlay._timerInterval);
          console.log('[COD Form] Downsell accepted:', offer.upsell_product_title);
          
          var offerData = getMarketAwareOfferData(offer, dsCampaign.type || 'downsell');
          var activeMarket = window.FoxCod.resolveActiveMarket ? window.FoxCod.resolveActiveMarket(null) : { country: 'UNKNOWN' };
          console.log('[FOXCOD OFFER ACCEPT TRACE]', JSON.stringify({
              offerId: offer.id,
              variantId: offer.upsell_variant_id,
              displayedPrice: offerData.discountedPrice,
              submittedPrice: offerData.discountedPrice,
              currencyCode: offerData.currencyCode,
              marketCountry: activeMarket.country
          }, null, 2));

          acceptedItems.push({ product_id: offer.upsell_product_id, variant_id: offer.upsell_variant_id, title: offer.upsell_product_title, image: offer.upsell_product_image || '', price: offerData.discountedPrice, quantity: 1, type: 'downsell' });
          overlay.remove();
          onComplete(acceptedItems);
      });

      modal.querySelector('.cod-upsell-decline').addEventListener('click', function() {
          if (overlay._timerInterval) clearInterval(overlay._timerInterval);
          overlay.remove();
          onComplete(acceptedItems);
      });
  }

  function submitUpsellItem(config, item, originalOrder) {
      console.log('[COD Form] Recording upsell item for order:', originalOrder.orderId, item);
  }


  /**
   * Show a styled fraud-block popup instead of browser alert()
   */
  function showFraudBlockPopup(message) {
      // Remove any existing popup
      var existing = document.getElementById('cod-fraud-popup-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'cod-fraud-popup-overlay';
      overlay.style.cssText = 'position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: codFraudFadeIn 0.25s ease;';

      var popup = document.createElement('div');
      popup.style.cssText = 'background: #fff; border-radius: 20px; max-width: 400px; width: 100%; padding: 36px 28px 28px; text-align: center; box-shadow: 0 25px 60px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05); animation: codFraudSlideUp 0.3s ease; font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

      // Shield icon
      var icon = document.createElement('div');
      icon.style.cssText = 'width: 64px; height: 64px; margin: 0 auto 20px; background: linear-gradient(145deg, #fee2e2 0%, #fecaca 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;';
      icon.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
      popup.appendChild(icon);

      // Title
      var title = document.createElement('h3');
      title.style.cssText = 'margin: 0 0 10px; font-size: 20px; font-weight: 700; color: #1f2937; letter-spacing: -0.01em;';
      title.textContent = 'Order Blocked';
      popup.appendChild(title);

      // Message
      var msg = document.createElement('p');
      msg.style.cssText = 'margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #6b7280;';
      msg.textContent = message || 'Sorry, you are not allowed to place orders.';
      popup.appendChild(msg);

      // OK button
      var btn = document.createElement('button');
      btn.textContent = 'OK';
      btn.style.cssText = 'display: inline-block; padding: 12px 48px; background: #1f2937; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(31,41,55,0.2);';
      btn.onmouseover = function() { btn.style.background = '#374151'; btn.style.transform = 'translateY(-1px)'; btn.style.boxShadow = '0 6px 16px rgba(31,41,55,0.3)'; };
      btn.onmouseout = function() { btn.style.background = '#1f2937'; btn.style.transform = ''; btn.style.boxShadow = '0 4px 12px rgba(31,41,55,0.2)'; };
      btn.onclick = function() { overlay.remove(); };
      popup.appendChild(btn);

      overlay.appendChild(popup);

      // Click backdrop to close
      overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

      // Inject animation CSS once
      if (!document.getElementById('cod-fraud-popup-css')) {
          var css = document.createElement('style');
          css.id = 'cod-fraud-popup-css';
          css.textContent = '@keyframes codFraudFadeIn{from{opacity:0}to{opacity:1}}@keyframes codFraudSlideUp{from{opacity:0;transform:translateY(20px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}';
          document.head.appendChild(css);
      }

      document.body.appendChild(overlay);

      // Auto-dismiss after 8 seconds
      setTimeout(function() { if (document.getElementById('cod-fraud-popup-overlay')) overlay.remove(); }, 8000);
  }

  /**
   * Client-side Fraud Protection Validation
   * Checks phone, email, postal code, and quantity against fraud rules
   * IP and order frequency are enforced server-side only
   */
  function validateFraudProtection(payload) {
      var fp = window.FoxCod && window.FoxCod.fraudProtection;
      if (!fp || Object.keys(fp).length === 0) return { allowed: true, message: '' };

      var msg = fp.blocked_message || 'Sorry, you are not allowed to place orders.';

      // Normalize helpers
      function normPhone(p) { return (p || '').replace(/[\s\-\(\)]/g, ''); }
      function normEmail(e) { return (e || '').trim().toLowerCase(); }

      // 1. Check blocked phone numbers
      if (payload.customerPhone && fp.blocked_phone_numbers && fp.blocked_phone_numbers.length > 0) {
          var np = normPhone(payload.customerPhone);
          for (var i = 0; i < fp.blocked_phone_numbers.length; i++) {
              if (normPhone(fp.blocked_phone_numbers[i]) === np) {
                  return { allowed: false, message: msg };
              }
          }
      }

      // 2. Check blocked emails
      if (payload.customerEmail && fp.blocked_emails && fp.blocked_emails.length > 0) {
          var ne = normEmail(payload.customerEmail);
          for (var j = 0; j < fp.blocked_emails.length; j++) {
              var blocked = fp.blocked_emails[j].trim().toLowerCase();
              if (blocked === ne || ne.endsWith('@' + blocked)) {
                  return { allowed: false, message: msg };
              }
          }
      }

      // 3. Check postal code restrictions
      if (payload.customerZipcode && fp.postal_code_mode && fp.postal_code_mode !== 'none' && fp.postal_codes && fp.postal_codes.length > 0) {
          var nz = payload.customerZipcode.trim().toUpperCase();
          var found = false;
          for (var k = 0; k < fp.postal_codes.length; k++) {
              if (fp.postal_codes[k].trim().toUpperCase() === nz) { found = true; break; }
          }
          if (fp.postal_code_mode === 'allow_only' && !found) {
              return { allowed: false, message: msg };
          }
          if (fp.postal_code_mode === 'block_only' && found) {
              return { allowed: false, message: msg };
          }
      }

      // 4. Check quantity limit
      if (fp.limit_quantity_enabled && fp.max_quantity && payload.quantity) {
          if (payload.quantity > fp.max_quantity) {
              return { allowed: false, message: 'Maximum ' + fp.max_quantity + ' items allowed per order.' };
          }
      }

      return { allowed: true, message: '' };
  }

  /**
   * Handle Form Submission
   */
  function handleFormSubmit(e, productId, config) {
      e.preventDefault();
      var form = e.target;

      if (config && config._orderPlaced) {
          return;
      }

      if (config && config._isSubmitting) {
          return;
      }

      // ── Field Validation ──
      var requiredFields = form.querySelectorAll('[data-required="true"]');
      var firstInvalid = null;

      console.log('[COD Form] Validation: found', requiredFields.length, 'required fields');

      requiredFields.forEach(function(field) {
        // Skip hidden/invisible fields
        if (field.offsetParent === null) {
          console.log('[COD Form] Skipping hidden field:', field.name);
          return;
        }

        var value = (field.value || '').trim();
        // For checkboxes, check .checked instead of value
        if (field.type === 'checkbox') {
          console.log('[COD Form] Validating checkbox:', field.name, 'checked:', field.checked);
          if (!field.checked) {
            if (!firstInvalid) firstInvalid = field;
            var cbWrapper = field.closest('.cod-form-field') || field.parentNode;
            if (cbWrapper) {
              cbWrapper.style.setProperty('outline', '2px solid #d82c0d', 'important');
              cbWrapper.style.setProperty('outline-offset', '2px');
              cbWrapper.style.setProperty('border-radius', '4px');
              setTimeout(function(el) { el.style.removeProperty('outline'); el.style.removeProperty('outline-offset'); }.bind(null, cbWrapper), 3000);
            }
          }
          return; // skip normal value check
        }
        console.log('[COD Form] Validating field:', field.name, 'value:', JSON.stringify(value), 'empty:', !value);
        if (!value) {
          if (!firstInvalid) firstInvalid = field;

          // Apply error border directly on input via inline style (bypasses any class specificity issues)
          field.style.setProperty('border', '2px solid #d82c0d', 'important');
          field.style.setProperty('background-color', '#fff5f5', 'important');

          // Apply shake to inputContainer (parent) so icon stays in place during shake
          // Force re-trigger the animation by removing class, forcing reflow, then re-adding
          var inputCont = field.parentNode;
          if (inputCont) {
            inputCont.classList.remove('foxcod-shake');
            void inputCont.offsetWidth; // Force reflow to restart animation
            inputCont.classList.add('foxcod-shake');
            setTimeout(function(el) { el.classList.remove('foxcod-shake'); }.bind(null, inputCont), 400);

            // Add inline error message to the outer wrapper (parent of inputCont)
            // so it doesn't affect the icon's top:50% positioning inside inputCont
            var outerWrapper = inputCont.parentNode;
            if (outerWrapper && !outerWrapper.querySelector('.foxcod-error-text')) {
              var errorText = document.createElement('div');
              errorText.className = 'foxcod-error-text';
              errorText.textContent = 'This field is required';
              outerWrapper.appendChild(errorText);
            }
          }
        }
      });

      if (firstInvalid) {
        console.log('[COD Form] Validation failed — scrolling to:', firstInvalid.name);
        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function() { firstInvalid.focus(); }, 400);
        return; // stop submission
      }

      // ── Custom Options Validation ──
      var hasErrors = false;

      // 1. Shipping Options Check
      var shippingContainer = form.querySelector('.cod-shipping-section');
      if (shippingContainer) {
          var shippingRadios = shippingContainer.querySelectorAll('input[name="shipping_method"]');
          if (shippingRadios.length > 0) {
              var checkedShipping = shippingContainer.querySelector('input[name="shipping_method"]:checked');
              if (!checkedShipping) {
                  hasErrors = true;
                  shippingContainer.style.setProperty('outline', '2px solid #d82c0d', 'important');
                  shippingContainer.style.setProperty('border-radius', '8px', 'important');
                  setTimeout(function(el) { el.style.removeProperty('outline'); el.style.removeProperty('border-radius'); }.bind(null, shippingContainer), 4000);
                  if (!firstInvalid) firstInvalid = shippingContainer;
              }
          }
      }

      // 2. Payment Options Check
      var paymentContainer = form.querySelector('.cod-payment-method-options');
      if (paymentContainer) {
          var paymentRadios = paymentContainer.querySelectorAll('input[name="payment_method"]');
          if (paymentRadios.length > 0) {
              var checkedPayment = paymentContainer.querySelector('input[name="payment_method"]:checked');
              if (!checkedPayment) {
                  hasErrors = true;
                  paymentContainer.style.setProperty('outline', '2px solid #d82c0d', 'important');
                  paymentContainer.style.setProperty('border-radius', '8px', 'important');
                  setTimeout(function(el) { el.style.removeProperty('outline'); el.style.removeProperty('border-radius'); }.bind(null, paymentContainer), 4000);
                  if (!firstInvalid) firstInvalid = paymentContainer;
              }
          }
      }

      if (hasErrors) {
          console.log('[COD Form] Custom options validation failed — scrolling to block');
          if (firstInvalid && firstInvalid.scrollIntoView) {
              firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return; // stop submission
      }

      var selectedPaymentInput = form.querySelector('input[name="payment_method"]:checked');
      if (selectedPaymentInput && selectedPaymentInput.value === 'full_prepaid') {
          // Full Prepaid is handled in the upsell/submission flow below — no early return
          console.log('[COD Form] Full Prepaid selected — proceeding to checkout flow.');
      }

      console.log('[COD Form] Validation passed');

      var submitBtn = form.querySelector('button[type="submit"]');
      var originalBtnText = submitBtn.textContent;
      config._isSubmitting = true;
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Placing Order...';
      submitBtn.style.setProperty('opacity', '0.85', 'important');
      
      // Collect form data
      var formData = new FormData(form);
      var normalizedCustomer = collectNormalizedCustomerFromForm(form);
      
      // Build payload with proper field mapping
      var countryInfo = window.FoxCod.CountryRestrictionEngine.getCustomerCountry(form);
      
      var activeMarket = window.FoxCod.resolveActiveMarket(form);
      
      var stateInput = form.querySelector('[name="state"]');
      var stateName = '';
      if (stateInput && stateInput.tagName.toLowerCase() === 'select' && stateInput.options[stateInput.selectedIndex]) {
          stateName = stateInput.options[stateInput.selectedIndex].text;
      }
      
      var countryInput = form.querySelector('[name="country"]');
      var countryName = '';
      if (countryInput && countryInput.tagName.toLowerCase() === 'select' && countryInput.options[countryInput.selectedIndex]) {
          countryName = countryInput.options[countryInput.selectedIndex].text;
      }

      var payload = {
          shop: config.shop,
          customerName: normalizedCustomer.name || formData.get('name') || '',
          customerPhone: normalizedCustomer.phone || formData.get('phone') || '',
          customerAddress: normalizedCustomer.address || formData.get('address') || '',
          customerEmail: normalizedCustomer.email || formData.get('email') || '',
          customerState: normalizedCustomer.state || formData.get('state') || '',
          customerStateName: stateName || normalizedCustomer.state || formData.get('state') || '',
          customerCity: normalizedCustomer.city || formData.get('city') || '',
          customerZipcode: normalizedCustomer.zipcode || formData.get('zip') || formData.get('zipcode') || '',
          notes: formData.get('notes') || '',
          productId: config.productId,
          variantId: config.variantId || ((config.rootElement && config.rootElement.querySelector('.cod-form-data')) || {}).dataset?.variantId || '',
          quantity: parseInt(formData.get('quantity') || ((form.closest('.cod-form-container') || form.parentElement).querySelector('.cod-product-qty .cod-qty-input') || {}).value || '1'),
          price: parseFloat(config.productPrice),
          productTitle: config.productTitle,
          currency: activeMarket.currency || 'USD',
          shippingLabel: '',
          shippingPrice: 0,
          discountPercent: 0,
          finalTotal: 0,
          upsell_items: getCheckedTickUpsells(form, config),
          detectedCountry: activeMarket.country || countryInfo.country,
          countryName: countryName || activeMarket.country || countryInfo.country,
          countryDetectionSource: 'shopify_active_market'
      };
      
      console.log('[FOXCOD MARKET DEBUG]', {
          activeMarketCountry: window.Shopify && window.Shopify.country,
          activeMarketCurrency: window.Shopify && window.Shopify.currency && window.Shopify.currency.active,
          localizationCountry: window.Shopify && window.Shopify.routes && window.Shopify.routes.root,
          detectedCountry: window.FOXCOD_IP_COUNTRY || (countryInfo && countryInfo.country),
          payloadCountry: payload.detectedCountry,
          payloadCurrency: payload.currency,
          widgetPrice: payload.price
      });

      // Bundle variant items — when customer selected different variants per item
      if (window.FoxCod && window.FoxCod._selectedBundleVariants && window.FoxCod._selectedBundleVariants.length > 1) {
          var bvList = window.FoxCod._selectedBundleVariants;
          payload.bundleVariants = bvList.map(function(v) {
              return { variantId: v.variantId, title: v.title, price: v.price, quantity: 1 };
          });
          // Also expose as variants_selected for backend compatibility
          payload.variants_selected = bvList.map(function(v) {
              return { variantId: v.variantId, title: v.title, price: v.price, quantity: 1 };
          });
          // Override price with sum of variant prices for correct total calculation
          payload.price = bvList.reduce(function(sum, v) { return sum + v.price; }, 0);
          // Use the first variant's ID as the primary variant (Shopify needs at least one)
          payload.variantId = bvList[0].variantId;
          
          // Append bundle variant details to notes for order display
          var variantNotes = 'BUNDLE VARIANTS:';
          bvList.forEach(function(v, idx) {
              variantNotes += '\n- Item ' + (idx + 1) + ': ' + v.title + ' (' + formatMoney(v.price) + ')';
          });
          payload.notes = (payload.notes ? payload.notes + '\n' : '') + variantNotes;
      }
      
      // Cart items payload
      if (window.FoxCod && window.FoxCod._cartItems) {
          payload.cart_items = window.FoxCod._cartItems;
          payload.order_source = window.FoxCod._orderSource || 'cart_page';
      } else {
          payload.order_source = 'product_page';
      }

      // Collect custom field values
      var customFieldData = [];
      var knownFieldIds = ['name', 'phone', 'address', 'email', 'state', 'city', 'zip', 'zipcode', 'notes', 'quantity', 'shipping', 'order_summary', 'marketing', 'payment_mode', 'coupon'];
      (config.fields || []).forEach(function(field) {
          if (knownFieldIds.indexOf(field.id) !== -1) return; // skip known fields
          if (!field.visible) return;
          if (field.type === 'checkbox') {
              var cb = form.querySelector('input[name="' + field.id + '"]');
              customFieldData.push({ label: field.label, value: cb && cb.checked ? 'Yes' : 'No' });
          } else {
              var val = formData.get(field.id);
              if (val) {
                  customFieldData.push({ label: field.label, value: val });
              }
          }
      });
      if (customFieldData.length > 0) {
          payload.customFieldData = customFieldData;
      }

      try {
          validateOrderPayload(payload);
      } catch (validationError) {
          config._isSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          setFormMessage(form, 'error', validationError.message || 'Please complete the required fields.');
          setBlockStatus(config, validationError.message || 'Please complete the required fields.', 'warning');
          return;
      }

      // ── Fraud Protection: client-side validation ──
      var fraudResult = validateFraudProtection(payload);
      if (!fraudResult.allowed) {
          console.warn('[COD Form] Blocked by fraud protection:', fraudResult.message);
          showFraudBlockPopup(fraudResult.message);
          config._isSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          return;
      }

      // ── Use centralized pricing engine for all payload values ──
      var checkoutState = calculateCheckoutState(form, config);
      payload.quantity = checkoutState.quantity;
      payload.discountPercent = checkoutState.discountPercent;
      payload.finalTotal = checkoutState.total;
      payload.shippingPrice = checkoutState.shipping;
      payload.couponCode = checkoutState.couponDiscount > 0 ? getCouponState(config).code : '';

      // Use engine-computed subtotal for price (respects bundle variants)
      if (window.FoxCod && window.FoxCod._selectedBundleVariants && window.FoxCod._selectedBundleVariants.length > 1) {
          payload.price = checkoutState.subtotal;
      }

      // If downsell is active, it replaces the product price (not added on top)
      if (checkoutState.downsellItems.length > 0) {
          payload.price = checkoutState.downsellItems[0].price;
          payload.notes = (payload.notes ? payload.notes + '\n' : '') + 'DOWNSELL APPLIED: ' + checkoutState.downsellItems[0].title + ' (' + formatMoney(checkoutState.downsellItems[0].price) + ')';
      }

      console.log('[COD Form] Payload from pricing engine — qty:', payload.quantity, 'discount:', payload.discountPercent + '%', 'finalTotal:', payload.finalTotal);

      // Get selected shipping option
      var shippingRadio = form.querySelector('input[name="shipping_method"]:checked');
      if (shippingRadio) {
          var selectedShippingLabel = shippingRadio.getAttribute('data-label') || '';
          var selectedShippingPrice = parseFloat(shippingRadio.getAttribute('data-price')) || payload.shippingPrice || 0;

          // Legacy fallback for older DOM where data-label may be missing
          if (!selectedShippingLabel && config.shippingOptions && config.shippingOptions.options) {
              var selectedOpt = config.shippingOptions.options.find(function(o) { return o.id === shippingRadio.value; });
              if (selectedOpt) {
                  selectedShippingLabel = selectedOpt.label || '';
                  selectedShippingPrice = selectedOpt.price;
              }
          }

          // Final fallback from visible row text
          if (!selectedShippingLabel) {
              var shippingRow = shippingRadio.closest('label') || shippingRadio.parentElement;
              if (shippingRow) {
                  var textNode = shippingRow.querySelector('div');
                  if (textNode && textNode.textContent) {
                      selectedShippingLabel = textNode.textContent.trim();
                  }
              }
          }

          payload.shippingLabel = selectedShippingLabel;
          payload.shippingPrice = selectedShippingPrice;
      }

      // Detect selected payment method
      var paymentMethodRadio = form.querySelector('input[name="payment_method"]:checked');
      var selectedPaymentMethod = paymentMethodRadio ? paymentMethodRadio.value : 'full_cod';
      var isPartialCod = selectedPaymentMethod === 'partial_cod';

      if (selectedPaymentMethod === "full_cod") {
          var ppS = window.FoxCod && window.FoxCod.partialPaymentSettings;
          if (ppS && ppS.pure_cod_fee_enabled && ppS.pure_cod_fee_amount) {
              payload.codFeeAmount = ppS.pure_cod_fee_type === "percentage" ? (payload.finalTotal * ppS.pure_cod_fee_amount) / 100 : ppS.pure_cod_fee_amount;
              payload.codFeeName = ppS.pure_cod_fee_name || "COD Fee";
              payload.finalTotal = parseFloat(payload.finalTotal || 0) + parseFloat(payload.codFeeAmount || 0);
          }
      }

      console.log('[COD Form] Preparing order:', payload, 'Payment method:', selectedPaymentMethod);

      // Include any pre-purchase upsell items that were accepted when the form opened
      var preUpsellItems = [];
      try { preUpsellItems = JSON.parse(form.getAttribute('data-pre-upsell-items') || '[]'); } catch(e) {}
      if (preUpsellItems.length > 0) {
          payload.upsell_items = (payload.upsell_items || []).concat(preUpsellItems);
          console.log('[COD Form] Including pre-purchase upsell items:', preUpsellItems.length);
      }

      // Check for post-purchase 1-click upsells BEFORE placing the order
      var hasClickUpsells = config.upsellOffers && config.upsellOffers.click_upsells && config.upsellOffers.click_upsells.length > 0;
      var applicableUpsells = hasClickUpsells ? config.upsellOffers.click_upsells.filter(function(c) {
          // Only show post-purchase campaigns here (pre-purchase already shown at modal open)
          return (c.upsell_mode !== 'pre_purchase') && shouldShowUpsell(c, config);
      }) : [];

      if (applicableUpsells.length > 0) {
          // Show upsell modal FIRST (for both full COD and partial COD),
          // then proceed to the appropriate order flow with accepted items.
          showClickUpsellModal(form, config, productId, function(acceptedUpsellItems) {
              payload.upsell_items = (payload.upsell_items || []).concat(acceptedUpsellItems);
              console.log('[COD Form] Upsell flow complete. Accepted items:', acceptedUpsellItems.length);

              // Re-read payment method (user could have changed their mind)
              var pmRadioAfter = form.querySelector('input[name="payment_method"]:checked');
              var pmAfter = pmRadioAfter ? pmRadioAfter.value : 'full_cod';

              if (pmAfter === 'partial_cod' && config.partialCodEnabled) {
                  showPartialCodModal(form, config, payload, submitBtn, originalBtnText);
              } else if (pmAfter === 'full_prepaid') {
                  submitFullPrepaidCheckout(form, config, payload, submitBtn, originalBtnText);
              } else {
                  submitFullCodOrder(form, config, productId, payload, submitBtn, originalBtnText);
              }
          });
          return; // STOP HERE — do NOT fall through
      } else if (isPartialCod && config.partialCodEnabled) {
          // No upsells to show — go straight to partial COD modal
          showPartialCodModal(form, config, payload, submitBtn, originalBtnText);
          return; // Exit — partial COD handling complete
      } else if (selectedPaymentMethod === 'full_prepaid') {
          // No upsells to show — go straight to Full Prepaid checkout
          submitFullPrepaidCheckout(form, config, payload, submitBtn, originalBtnText);
          return; // Exit — Full Prepaid handling complete
      }

      // Full COD with no upsells: Submit directly
      submitFullCodOrder(form, config, productId, payload, submitBtn, originalBtnText);
  }

  function showPartialCodModal(form, config, payload, submitBtn, originalBtnText) {
      var finalTotal = payload.finalTotal || 0;
      var ppSettings = config.partialPaymentSettings;

      var partialDiscountAmount = 0;
      if (ppSettings && ppSettings.partial_payment_discount_enabled && ppSettings.partial_payment_discount_value > 0) {
          partialDiscountAmount = ppSettings.partial_payment_discount_type === 'percentage'
              ? (finalTotal * ppSettings.partial_payment_discount_value) / 100
              : ppSettings.partial_payment_discount_value;
          partialDiscountAmount = Math.min(partialDiscountAmount, finalTotal);
      }

      var discountedTotal = finalTotal - partialDiscountAmount;

      function calcDeposit(opt) {
          var d = 0;
          if (opt.type === 'percentage' || opt.type === 'remaining_percentage') {
              d = (discountedTotal * opt.value) / 100;
          } else {
              d = Math.min(opt.value, discountedTotal);
          }
          return Math.round(d * 100) / 100;
      }

      function calcCodFee(depositAmt) {
          if (!ppSettings || !ppSettings.cod_fee_enabled || !ppSettings.cod_fee_amount) return 0;
          var fee = 0;
          if (ppSettings.cod_fee_type === 'percentage') {
              fee = (depositAmt * ppSettings.cod_fee_amount) / 100;
          } else {
              fee = ppSettings.cod_fee_amount;
          }
          return Math.round(fee * 100) / 100;
      }

      var paymentOptions = (ppSettings && ppSettings.payment_options && ppSettings.payment_options.length > 0)
          ? ppSettings.payment_options
          : [{ id: 'legacy', label: 'Partial Payment', type: 'fixed', value: config.partialCodAdvance || 100 }];

      // Always pick the first option directly
      var selOpt = paymentOptions[0];
      var advanceAmount = calcDeposit(selOpt);
      var codFeeAmount = calcCodFee(advanceAmount);
      var payNow = advanceAmount;
      var remainingAmount = Math.max(discountedTotal - advanceAmount, 0) + codFeeAmount;

      submitPartialCodCheckout(form, config, payload, submitBtn, originalBtnText, payNow, remainingAmount, {
          optionLabel: selOpt.label,
          depositAmount: advanceAmount,
          codFeeAmount: codFeeAmount,
          discountAmount: partialDiscountAmount,
          discountType: ppSettings ? ppSettings.partial_payment_discount_type : null,
          discountValue: ppSettings ? ppSettings.partial_payment_discount_value : 0,
          discountSource: 'partial_payment',
      });
  }

  /**
   * Show fullscreen loader while Shopify checkout is being created.
   * Respects merchant branding (window.FoxCod.branding.checkout_redirect).
   * Returns the overlay element so it can be hidden on error.
   */
  function showPartialCodLoader() {
      if (!document.getElementById('foxcod-partial-loader-css')) {
          var css = document.createElement('style');
          css.id = 'foxcod-partial-loader-css';
          css.textContent = '@keyframes foxcodPartialFadeIn{from{opacity:0}to{opacity:1}} @keyframes foxcodBouncingDots{0%,80%,100%{transform:scale(0);opacity:0.3}40%{transform:scale(1);opacity:1}} @keyframes foxcodLogoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}} .foxcod-dot{width:8px;height:8px;background-color:#2563eb;border-radius:50%;animation:foxcodBouncingDots 1.4s infinite ease-in-out both} .foxcod-dot:nth-child(1){animation-delay:-0.32s} .foxcod-dot:nth-child(2){animation-delay:-0.16s} .foxcod-dot:nth-child(3){animation-delay:0s}';
          document.head.appendChild(css);
      }

      var existing = document.getElementById('foxcod-partial-loader');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'foxcod-partial-loader';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:foxcodPartialFadeIn 0.2s ease;';

      // ── Read branding config ──────────────────────────────────────────────
      var branding = (window.FoxCod && window.FoxCod.branding && window.FoxCod.branding.checkout_redirect) || null;
      var useCustomLogo = branding && branding.display_mode === 'custom_logo' && branding.logo_url;
      var logoSize = (branding && branding.logo_size) ? parseInt(branding.logo_size) : 72;

      // ── Center icon: custom logo OR lock SVG ─────────────────────────────
      var centerIcon;
      if (useCustomLogo) {
          var shapeRadius = branding.logo_shape === 'circle' ? '50%' : branding.logo_shape === 'rounded' ? '24px' : '0px';
          var zoomScale = branding.logo_zoom ? branding.logo_zoom / 100 : 1;
          var imgSize = Math.round(logoSize * zoomScale);
          
          var bgPadding = branding.show_background ? 16 : 0;
          var containerSize = imgSize + (bgPadding * 2);
          var bgStyle = branding.show_background 
              ? 'background:linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);' 
              : 'background:transparent;';
          var animStyle = branding.animate_logo ? 'animation:foxcodLogoFloat 2s ease-in-out infinite;' : '';

          centerIcon = '<div style="' + bgStyle + animStyle + 'padding:' + bgPadding + 'px;border-radius:' + shapeRadius + ';overflow:hidden;display:flex;align-items:center;justify-content:center;width:' + containerSize + 'px;height:' + containerSize + 'px;box-sizing:border-box;margin:0 auto;">'
              + '<img id="foxcod-brand-logo" src="' + branding.logo_url + '" '
              + 'style="display:block;width:100%;height:100%;object-fit:' + (branding.logo_shape === 'circle' ? 'cover' : 'contain') + ';border-radius:' + shapeRadius + ';" '
              + 'loading="lazy" '
              + 'onerror="this.style.display=\'none\';var fb=document.getElementById(\'foxcod-lock-fallback\');if(fb)fb.style.display=\'flex\';" />'
              + '<div id="foxcod-lock-fallback" style="display:none;align-items:center;justify-content:center;">'
              + '<svg width="' + Math.round(logoSize * 0.5) + '" height="' + Math.round(logoSize * 0.5) + '" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
              + '</div>'
              + '</div>';
      } else {
          // Default Shopify lock icon
          centerIcon = '<div style="background:linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);padding:24px;border-radius:24px;display:flex;align-items:center;justify-content:center;width:80px;height:80px;box-sizing:border-box;margin:0 auto;">'
              + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
              + '</div>';
      }

      overlay.innerHTML = [
          centerIcon,

          // Text (unchanged)
          '<div style="text-align:center;">',
              '<div style="font-size:20px;font-weight:700;color:#111827;margin-bottom:6px;">Redirecting to secure checkout</div>',
              '<div style="font-size:14px;color:#6b7280;line-height:1.6;">Please wait while we prepare your Shopify checkout...<br>Do not close or refresh this page.</div>',
              '<div style="display:flex;justify-content:center;align-items:center;gap:6px;margin-top:24px;">',
                  '<div class="foxcod-dot"></div><div class="foxcod-dot"></div><div class="foxcod-dot"></div>',
              '</div>',
          '</div>',

          // Bottom Badges Container (Side by side)
          '<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px;">',
              // 100% Secured Badge
              '<div style="display:flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:999px;padding:6px 14px;white-space:nowrap;">',
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 11 2 2 4-4"/></svg>',
                  '<span style="font-size:12px;font-weight:600;color:#166534;">100% Secured</span>',
              '</div>',

              // Powered by Foxly COD (Pill Design - Blue)
              '<div style="display:flex;align-items:center;gap:8px;background:#eff6ff;padding:4px 14px 4px 6px;border-radius:999px;border:1px solid #bfdbfe;box-shadow:0 1px 2px rgba(0,0,0,0.02);white-space:nowrap;">',
                  '<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#ffffff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">',
                      (window.FoxCod && window.FoxCod.appLogoUrl 
                          ? '<img src="' + window.FoxCod.appLogoUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />'
                          : ''),
                  '</div>',
                  '<div style="display:flex;flex-direction:column;justify-content:center;line-height:1;text-align:left;">',
                      '<span style="font-size:8px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Powered by</span>',
                      '<span style="font-size:13px;font-weight:800;color:#1d4ed8;letter-spacing:-0.3px;">Foxly COD</span>',
                  '</div>',
              '</div>',
          '</div>',
      ].join('');

      document.body.appendChild(overlay);
      return overlay;
  }

  /**
   * Remove the partial COD loader overlay.
   */
  function hidePartialCodLoader() {
      var overlay = document.getElementById('foxcod-partial-loader');
      if (overlay) overlay.remove();
  }

  // ── COD Loader Flow ────────────────────────────────────────────────────────
  var _codLoaderState = { progressTimer: null };

  function showCodOrderLoader() {
      if (!document.getElementById('foxcod-loader-css')) {
          var css = document.createElement('style');
          css.id = 'foxcod-loader-css';
          css.textContent = '@keyframes foxcodPartialFadeIn{from{opacity:0}to{opacity:1}} @keyframes foxcodBouncingDots{0%,80%,100%{transform:scale(0);opacity:0.3}40%{transform:scale(1);opacity:1}} @keyframes foxcodLogoFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}} .foxcod-dot{width:8px;height:8px;background-color:#2563eb;border-radius:50%;animation:foxcodBouncingDots 1.4s infinite ease-in-out both} .foxcod-dot:nth-child(1){animation-delay:-0.32s} .foxcod-dot:nth-child(2){animation-delay:-0.16s} .foxcod-dot:nth-child(3){animation-delay:0s}';
          document.head.appendChild(css);
      }

      var existing = document.getElementById('foxcod-order-loader');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'foxcod-order-loader';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(255,255,255,0.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:foxcodPartialFadeIn 0.2s ease;';

      var branding = (window.FoxCod && window.FoxCod.branding && window.FoxCod.branding.checkout_redirect) || null;
      var useCustomLogo = branding && branding.display_mode === 'custom_logo' && branding.logo_url;
      var logoSize = (branding && branding.logo_size) ? parseInt(branding.logo_size) : 72;

      var centerIcon;
      if (useCustomLogo) {
          var shapeRadius = branding.logo_shape === 'circle' ? '50%' : branding.logo_shape === 'rounded' ? '24px' : '0px';
          var zoomScale = branding.logo_zoom ? branding.logo_zoom / 100 : 1;
          var imgSize = Math.round(logoSize * zoomScale);
          
          var bgPadding = branding.show_background ? 16 : 0;
          var containerSize = imgSize + (bgPadding * 2);
          var bgStyle = branding.show_background 
              ? 'background:linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);' 
              : 'background:transparent;';
          var animStyle = branding.animate_logo ? 'animation:foxcodLogoFloat 2s ease-in-out infinite;' : '';
              
          centerIcon = '<div style="' + bgStyle + animStyle + 'padding:' + bgPadding + 'px;border-radius:' + shapeRadius + ';overflow:hidden;display:flex;align-items:center;justify-content:center;width:' + containerSize + 'px;height:' + containerSize + 'px;box-sizing:border-box;margin:0 auto;">'
              + '<img src="' + branding.logo_url + '" style="display:block;width:100%;height:100%;object-fit:' + (branding.logo_shape === 'circle' ? 'cover' : 'contain') + ';border-radius:' + shapeRadius + ';" loading="lazy" />'
              + '</div>';
      } else {
          centerIcon = '<div style="background:linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);padding:24px;border-radius:24px;display:flex;align-items:center;justify-content:center;width:80px;height:80px;box-sizing:border-box;margin:0 auto;">'
              + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
              + '</div>';
      }

      overlay.innerHTML = [
          centerIcon,
          '<div style="text-align:center;width:100%;max-width:300px;">',
              '<div id="foxcod-cod-title" style="font-size:20px;font-weight:700;color:#111827;margin-bottom:6px;">Preparing your order...</div>',
              '<div id="foxcod-cod-subtitle" style="font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:20px;">We’re securely processing your details.</div>',
              '<div id="foxcod-cod-dots-container" style="display:flex;justify-content:center;align-items:center;gap:6px;margin-bottom:12px;">',
                  '<div class="foxcod-dot"></div><div class="foxcod-dot"></div><div class="foxcod-dot"></div>',
              '</div>',
              '<div id="foxcod-cod-error-actions" style="display:none;margin-top:20px;gap:10px;justify-content:center;">',
                  '<button id="foxcod-cod-btn-back" style="padding:10px 16px;border:1px solid #d1d5db;border-radius:8px;background:white;color:#374151;font-weight:600;cursor:pointer;">Back</button>',
                  '<button id="foxcod-cod-btn-retry" style="padding:10px 16px;border:none;border-radius:8px;background:#2563eb;color:white;font-weight:600;cursor:pointer;">Retry</button>',
              '</div>',
          '</div>',
          '<div style="display:flex;align-items:center;gap:8px;background:#eff6ff;padding:4px 14px 4px 6px;border-radius:999px;border:1px solid #bfdbfe;box-shadow:0 1px 2px rgba(0,0,0,0.02);margin-top:10px;white-space:nowrap;">',
              '<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#ffffff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">',
                  (window.FoxCod && window.FoxCod.appLogoUrl ? '<img src="' + window.FoxCod.appLogoUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" />' : ''),
              '</div>',
              '<div style="display:flex;flex-direction:column;justify-content:center;line-height:1;text-align:left;">',
                  '<span style="font-size:8px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">Powered by</span>',
                  '<span style="font-size:13px;font-weight:800;color:#1d4ed8;letter-spacing:-0.3px;">Foxly COD</span>',
              '</div>',
          '</div>',
      ].join('');

      document.body.appendChild(overlay);

      document.getElementById('foxcod-cod-btn-back').onclick = function() { hideCodOrderLoader(); };

      updateCodOrderLoader(0, 'Preparing your order...', 'We’re securely processing your details.');
      
      // Auto progress simulation
      setTimeout(function() { updateCodOrderLoader(20, 'Preparing your order...', 'We’re securely processing your details.'); }, 50);
      
      _codLoaderState.progressTimer = setTimeout(function() {
          updateCodOrderLoader(35, 'Creating your Cash on Delivery order...', 'Reserving your items and generating your order number.');
          _codLoaderState.progressTimer = setTimeout(function() {
              updateCodOrderLoader(50, 'Creating your Cash on Delivery order...', 'Reserving your items and generating your order number.');
              _codLoaderState.progressTimer = setTimeout(function() {
                  updateCodOrderLoader(65, 'Almost there...', 'Finalizing your order.');
                  _codLoaderState.progressTimer = setTimeout(function() {
                      updateCodOrderLoader(75, 'Almost there...', 'Finalizing your order.');
                      _codLoaderState.progressTimer = setTimeout(function() {
                          updateCodOrderLoader(80, 'Almost there...', 'Finalizing your order.');
                      }, 1000);
                  }, 1000);
              }, 1000);
          }, 1000);
      }, 1000);

      return overlay;
  }

  function updateCodOrderLoader(progress, title, subtitle) {
      if (title) {
          var titleEl = document.getElementById('foxcod-cod-title');
          if (titleEl && titleEl.innerHTML !== title) titleEl.innerHTML = title;
      }
      if (subtitle) {
          var subtitleEl = document.getElementById('foxcod-cod-subtitle');
          if (subtitleEl && subtitleEl.innerHTML !== subtitle) subtitleEl.innerHTML = subtitle;
      }
  }

  function hideCodOrderLoader() {
      var overlay = document.getElementById('foxcod-order-loader');
      if (overlay) overlay.remove();
      clearTimeout(_codLoaderState.progressTimer);
  }

  function showCodOrderError(retryCallback) {
      clearTimeout(_codLoaderState.progressTimer);

      updateCodOrderLoader(0, 'We couldn’t create your order.', 'Your information is safe. Please try again.');
      
      var dotsContainer = document.getElementById('foxcod-cod-dots-container');
      if (dotsContainer) dotsContainer.style.display = 'none';

      var actionsEl = document.getElementById('foxcod-cod-error-actions');
      if (actionsEl) {
          actionsEl.style.display = 'flex';
          var retryBtn = document.getElementById('foxcod-cod-btn-retry');
          if (retryBtn) {
              retryBtn.onclick = function() {
                  hideCodOrderLoader();
                  if (retryCallback) retryCallback();
              };
          }
      }
  }

  /**
   * Submit Partial COD Checkout to backend, show loader, then redirect.
   * Called after the confirmation modal is accepted.
   * optionMeta: { optionLabel, depositAmount, codFeeAmount } from the v2 modal
   */
  function submitPartialCodCheckout(form, config, payload, submitBtn, originalBtnText, advanceAmount, remainingAmount, optionMeta) {
      var partialCodPayload = Object.assign({}, payload, {
          paymentMethod: 'partial_cod',
          advanceAmount: advanceAmount,
          remainingAmount: remainingAmount,
          // v2 metadata
          partialOptionLabel: (optionMeta && optionMeta.optionLabel) || 'Partial Payment',
          partialDepositAmount: (optionMeta && optionMeta.depositAmount) || advanceAmount,
          partialCodFeeAmount: (optionMeta && optionMeta.codFeeAmount) || 0,
          discount_amount: (optionMeta && optionMeta.discountAmount) || 0,
          discount_type: (optionMeta && optionMeta.discountType) || null,
          discount_value: (optionMeta && optionMeta.discountValue) || 0,
          discount_source: (optionMeta && optionMeta.discountSource) || null,
      });

      console.log('[COD Form] Partial COD v2 checkout payload:', partialCodPayload);

      // Show fullscreen loader immediately
      showPartialCodLoader();

      requestProxyJson(config, '/api/partial-cod/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partialCodPayload)
      })
      .then(function(result) {
          console.log('[COD Form] Partial COD v2 response:', result);

          if (result && result.success && result.checkoutUrl) {
              // Keep loader visible during redirect
              window.location.href = result.checkoutUrl;
          } else {
              // Error — hide loader and restore form
              hidePartialCodLoader();
              config._isSubmitting = false;
              submitBtn.disabled = false;
              submitBtn.textContent = originalBtnText;
              submitBtn.style.removeProperty('opacity');
              var errMsg = (result && result.error) || 'Unable to start checkout. Please try again.';
              setFormMessage(form, 'error', errMsg);
              setBlockStatus(config, 'Checkout could not be started. Please try again.', 'warning');
          }
      })
      .catch(function(err) {
          console.error('[COD Form] Partial COD v2 error:', err);
          hidePartialCodLoader();
          config._isSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          submitBtn.style.removeProperty('opacity');
          setFormMessage(form, 'error', err.message || 'Network error. Please try again.');
          setBlockStatus(config, 'Checkout request failed. The form is still available to try again.', 'warning');
      });
  }

  /**
   * Submit Full Prepaid Checkout
   * Posts to the same endpoint as Partial COD — routed server-side by paymentMethod='full_prepaid'.
   * The server's decision engine (createFullPrepaidCheckout) automatically selects:
   *   - Cart Permalink: for standard products with native pricing (fastest)
   *   - Draft Order:    when bundle/upsell/downsell/coupon/custom pricing is present
   *     (so Shopify Checkout always shows the correct Foxly COD price — no trust issue)
   */
  function submitFullPrepaidCheckout(form, config, payload, submitBtn, originalBtnText) {
      var ppSettings = config.partialPaymentSettings;
      var prepaidDiscountAmount = 0;
      if (ppSettings && ppSettings.prepaid_discount_enabled && ppSettings.prepaid_discount_value > 0) {
          prepaidDiscountAmount = ppSettings.prepaid_discount_type === 'percentage'
              ? ((payload.finalTotal || 0) * ppSettings.prepaid_discount_value) / 100
              : ppSettings.prepaid_discount_value;
          prepaidDiscountAmount = Math.min(prepaidDiscountAmount, payload.finalTotal || 0);
      }

      var fpPayload = Object.assign({}, payload, {
          paymentMethod: 'full_prepaid',
          discount_amount: prepaidDiscountAmount,
          discount_type: ppSettings ? ppSettings.prepaid_discount_type : null,
          discount_value: ppSettings ? ppSettings.prepaid_discount_value : 0,
          discount_source: 'full_prepaid',
      });

      console.log('[COD Form] Full Prepaid checkout payload:', fpPayload);
      showPartialCodLoader(); // reuse existing loader for consistent UX

      requestProxyJson(config, '/api/partial-cod/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fpPayload)
      })
      .then(function(result) {
          if (result && result.success && result.checkoutUrl) {
              window.location.href = result.checkoutUrl;
          } else {
              hidePartialCodLoader();
              config._isSubmitting = false;
              submitBtn.disabled = false;
              submitBtn.textContent = originalBtnText;
              submitBtn.style.removeProperty('opacity');
              setFormMessage(form, 'error', (result && result.error) || 'Unable to start checkout. Please try again.');
              setBlockStatus(config, 'Checkout could not be started. Please try again.', 'warning');
          }
      })
      .catch(function(err) {
          hidePartialCodLoader();
          config._isSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          submitBtn.style.removeProperty('opacity');
          setFormMessage(form, 'error', err.message || 'Network error. Please try again.');
          setBlockStatus(config, 'Checkout request failed. The form is still available to try again.', 'warning');
      });
  }

  /**
   * Submit Native COD Checkout
   * Creates a standard Shopify Checkout with all details prefilled,
   * without applying any prepaid discounts, allowing the user to select
   * Cash on Delivery natively on the checkout page.
   */
  function submitNativeCodCheckout(form, config, payload, submitBtn, originalBtnText) {
      var nativeCodPayload = Object.assign({}, payload, {
          paymentMethod: 'native_cod'
      });

      console.log('[COD Form] Native COD checkout payload:', nativeCodPayload);
      
      // Reuse existing loader for consistent UX
      showCodOrderLoader();
      updateCodOrderLoader(50, 'Creating your secure checkout...', 'Preparing your Cash on Delivery order.');

      requestProxyJson(config, '/api/partial-cod/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nativeCodPayload)
      })
      .then(function(result) {
          if (result && result.success && result.checkoutUrl) {
              updateCodOrderLoader(100, 'Redirecting...', 'Opening Shopify’s secure checkout.');
              window.location.href = result.checkoutUrl;
          } else {
              hideCodOrderLoader();
              config._isSubmitting = false;
              submitBtn.disabled = false;
              submitBtn.textContent = originalBtnText;
              submitBtn.style.removeProperty('opacity');
              setFormMessage(form, 'error', (result && result.error) || 'Unable to start checkout. Please try again.');
              setBlockStatus(config, 'Checkout could not be started. Please try again.', 'warning');
          }
      })
      .catch(function(err) {
          hideCodOrderLoader();
          config._isSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          submitBtn.style.removeProperty('opacity');
          setFormMessage(form, 'error', err.message || 'Network error. Please try again.');
          setBlockStatus(config, 'Checkout request failed. The form is still available to try again.', 'warning');
      });
  }

  /**
   * Submit Full COD Order (called after upsell flow completes)
   */
  function submitFullCodOrder(form, config, productId, payload, submitBtn, originalBtnText) {
      console.log('[COD Form] Submitting full COD order with upsell_items:', payload.upsell_items);

      // Recalculate finalTotal to include any upsell items accepted after the DOM snapshot
      if (payload.upsell_items && payload.upsell_items.length > 0) {
          var upsellTotal = payload.upsell_items.reduce(function(sum, item) {
              // Tick upsells are already included in finalTotal from calculateCheckoutState
              if (item.type === 'tick_upsell') return sum;
              return sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
          }, 0);

          if (payload.finalTotal && payload.finalTotal > 0) {
              // finalTotal was set from DOM before upsells — add upsell prices to it
              payload.finalTotal = payload.finalTotal + upsellTotal;
          } else {
              // No finalTotal yet — compute from scratch
              var subtotal = (parseFloat(payload.price) || 0) * (parseInt(payload.quantity) || 1);
              var discount = subtotal * ((parseFloat(payload.discountPercent) || 0) / 100);
              payload.finalTotal = subtotal - discount + (parseFloat(payload.shippingPrice) || 0) + upsellTotal;
          }
          console.log('[COD Form] Recalculated finalTotal with upsells:', payload.finalTotal, 'upsellTotal:', upsellTotal);
      }

      if (typeof USE_NATIVE_COD_CHECKOUT !== 'undefined' && USE_NATIVE_COD_CHECKOUT) {
          submitNativeCodCheckout(form, config, payload, submitBtn, originalBtnText);
          return;
      }

      /*
      ========================================================
      LEGACY DIRECT COD ORDER FLOW
      Temporarily disabled for Shopify App Review compliance.
      Flow:
      COD Form
      → Validate Form
      → Create Pending Order
      → Create Shopify Order
      → Redirect to Order Status Page
      DO NOT DELETE.
      May be restored in future releases.
      ========================================================
      
      // Full COD: Send to regular backend
      showCodOrderLoader();
      var retryFn = function() {
          submitFullCodOrder(form, config, productId, payload, submitBtn, originalBtnText);
      };

      createOrderWithRetry(config, payload, 2)
      .then(function(result) {
          console.log('[COD Form] Order response:', result);
          
          if (result.success) {
              updateCodOrderLoader(100, 'Order confirmed!', 'Redirecting you to your order page...');
              
              // ── Immediately show redirect feedback on the button ──
              submitBtn.textContent = 'Redirecting...';
              submitBtn.style.setProperty('opacity', '1', 'important');

              // ── Pixel Tracking: Purchase ──
              // Use payload.finalTotal which includes upsells, or read from DOM, or compute fallback
              var purchaseValue = payload.finalTotal || 0;
              if (!purchaseValue) {
                  var summaryTotalEl = form.querySelector('#cod-summary-total');
                  if (summaryTotalEl) {
                      purchaseValue = parseFloat(summaryTotalEl.textContent.replace(/[^0-9.]/g, '')) || 0;
                  }
              }
              // Fallback: compute from payload if still no value
              if (!purchaseValue) {
                  purchaseValue = ((payload.price || 0) * (payload.quantity || 1)) + (payload.shippingPrice || 0);
              }
              console.log('[FoxCod Pixels] Correct Purchase total:', purchaseValue);
              foxCodTrackEvent('Purchase', { value: purchaseValue, currency: (FoxCod.currencyConfig && FoxCod.currencyConfig.code) || 'USD' });

              setTimeout(function() {
                  // ── Save customer data + redirect ──
                  saveCustomerToLocalStorage(form);
                  localStorage.removeItem('foxcod_checkout_state');
                  handleOrderSuccess(config, form, submitBtn, originalBtnText, result);
              }, 600);
          } else {
              showCodOrderError(retryFn);
              config._isSubmitting = false;
              submitBtn.disabled = false;
              submitBtn.textContent = originalBtnText;
          }
      })
      .catch(function(err) {
          console.error('[COD Form] Error:', err);
          showCodOrderError(retryFn);
          config._isSubmitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          setFormMessage(form, 'error', err.message || 'Something went wrong. Please try again.');
          setBlockStatus(config, 'Order submission failed, but the checkout block is still active for another attempt.', 'warning');
      });
      */
  }



  // Global Event Delegation for Close Buttons (Fail-safe against DOM cloning)
  document.addEventListener('click', function(e) {
      var btn = e.target.closest('.cod-close-btn');
      if (btn) {
          e.preventDefault();
          var id = btn.getAttribute('data-cod-close');
          var config = _activeConfigs[id];
          if (config) {
              closeModal(config.productId, config);
          } else {
              var modal = btn.closest('.cod-form-container.cod-modal');
              if (modal) {
                  modal.classList.remove('visible');
                  setTimeout(function() { modal.style.display = 'none'; }, 300);
                  var overlayId = modal.id.replace('cod-form-', 'cod-modal-overlay-');
                  var overlay = document.getElementById(overlayId);
                  if (overlay) overlay.style.display = 'none';
                  document.body.style.overflow = '';
              }
          }
      }
  });
})();
