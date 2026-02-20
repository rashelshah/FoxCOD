/**
 * COD Form JavaScript Handler
 * Replaces Buy buttons with COD buttons and handles form submission
 * Uses Shopify App Proxy for stable API URLs
 * Supports dynamic fields, custom styles, and advanced configuration
 */

(function() {
  'use strict';

  // Ensure FoxCod.pixelTracking always exists
  window.FoxCod = window.FoxCod || {};
  window.FoxCod.pixelTracking = window.FoxCod.pixelTracking || {};
  console.log('[FoxCod] Pixel Tracking init:', window.FoxCod.pixelTracking);

  // =============================================
  // PIXEL TRACKING — Script Loader & Event Dispatcher
  // =============================================
  var _pixelsLoaded = false;

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
                      currency: data.currency || 'INR'
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
  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadPixelScripts);
  } else {
      loadPixelScripts();
  }

  // =============================================
  // Track ViewContent on page load
  // =============================================
  setTimeout(function() {
      var pixels = (window.FoxCod && window.FoxCod.pixelTracking) || {};
      if (pixels.facebook && pixels.facebook.track_view_content ||
          pixels.google && pixels.google.track_view_content ||
          pixels.kwai && pixels.kwai.track_view_content ||
          (pixels.snapchat || pixels.snap || {}).track_view_content) {
          foxCodTrackEvent('ViewContent', {});
      }
  }, 1000);

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCODForms);
  } else {
    initCODForms();
  }

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
   * Initialize all COD forms on the page
   */
  function initCODForms() {
    // Find all COD form data containers
    var dataContainers = document.querySelectorAll('.cod-form-data');
    
    if (dataContainers.length === 0) {
      console.log('[COD Form] No COD form data found on page');
      return;
    }

    dataContainers.forEach(function(dataContainer) {
      var productId = dataContainer.dataset.productId;
      var shop = dataContainer.dataset.shop;
      
      // Default Fallbacks
      var DEFAULT_FIELDS = [
          { id: 'name', label: 'Full Name', type: 'text', visible: true, required: true, order: 1 },
          { id: 'phone', label: 'Phone Number', type: 'tel', visible: true, required: true, order: 2 },
          { id: 'address', label: 'Address', type: 'textarea', visible: true, required: true, order: 3 },
          { id: 'quantity', label: 'Quantity', type: 'number', visible: true, required: false, order: 9 }
      ];

      // Debug: Log raw data attribute
      console.log('[COD Form] Raw data-fields attribute:', dataContainer.dataset.fields ? dataContainer.dataset.fields.substring(0, 200) + '...' : 'EMPTY');
      
      var fields = safeJSONParse(dataContainer.dataset.fields, []);
      console.log('[COD Form] Parsed fields count:', fields.length, 'Using defaults:', fields.length === 0);
      
      if (fields.length === 0) fields = DEFAULT_FIELDS;

      // Get configuration from data container
      var config = {
        productId: productId,
        variantId: dataContainer.dataset.variantId,
        productTitle: dataContainer.dataset.productTitle,
        productPrice: parseFloat(dataContainer.dataset.productPrice),
        productImage: dataContainer.dataset.productImage || '',
        shop: shop,
        proxyUrl: '/apps/fox-cod',
        maxQuantity: parseInt(dataContainer.dataset.maxQuantity) || 10,
        buttonText: dataContainer.dataset.buttonText || 'Buy with COD',
        primaryColor: dataContainer.dataset.primaryColor || '#667eea',
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
        modalStyle: dataContainer.dataset.modalStyle || 'modern',
        animStyle: dataContainer.dataset.animStyle || 'fade',
        borderRadius: parseInt(dataContainer.dataset.borderRadius) || 12,
        showImage: dataContainer.dataset.showImage === 'true',
        showPrice: dataContainer.dataset.showPrice === 'true',
        formTitle: dataContainer.dataset.formTitle,
        formSubtitle: dataContainer.dataset.formSubtitle,
        
        // Partial COD Configuration
        partialCodEnabled: dataContainer.dataset.partialCodEnabled === 'true',
        partialCodAdvance: parseInt(dataContainer.dataset.partialCodAdvance) || 100,
        
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
        upsellOffers: (window.FoxCod && window.FoxCod.upsellOffers) || safeJSONParse(dataContainer.dataset.upsellOffers, { tick_upsells: [], click_upsells: [], downsells: [] })
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
      
      // Initialize form immediately
      initializeProduct(productId, config);
    });
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
    if (config.hoverGlow) classes.push('btn-hover-glow');
    
    // Click effects
    if (config.clickRipple) classes.push('btn-click-ripple');
    if (config.clickPress) classes.push('btn-click-press');
    
    return classes.join(' ');
  }

  /**
   * Initialize a specific product
   */
  function initializeProduct(productId, config) {
    // Replace buy buttons with COD button
    replaceBuyButtons(productId, config);

    // Initialize the form structure and events
    initForm(productId, config);
  }

  /**
   * Find and replace the Buy Now / Add to Cart buttons with COD button
   */
  function replaceBuyButtons(productId, config) {
    // Common selectors for Buy/Add to Cart buttons
    var buttonSelectors = [
      'form[action*="/cart/add"] button[name="add"]',
      '.product-form__submit',
      'button.product-form__cart-submit',
      '#AddToCart',
      '[data-add-to-cart]',
      '.shopify-payment-button button',
      '.shopify-payment-button__button',
      '[data-shopify="payment-button"] button',
      '.product-form button[type="submit"]',
      '.product-form__buttons button',
      '.product-form__submit-button'
    ];

    var buttonsFound = false;

    buttonSelectors.forEach(function(selector) {
      var buttons = document.querySelectorAll(selector);
      buttons.forEach(function(btn) {
        if (btn.dataset.codReplaced || btn.classList.contains('cod-buy-btn')) return;
        
        buttonsFound = true;
        
        // Calculate Button Styles - use button_styles JSON as single source of truth
        var btnStyles = config.buttonStyles || {};
        // Use button_styles as the ONLY source for customizations
        var textColor = btnStyles.textColor || '#ffffff';
        var borderColor = btnStyles.borderColor || config.primaryColor;
        var borderWidth = btnStyles.borderWidth ?? 0;
        
        // Check if animations are enabled - don't set boxShadow inline if so (CSS handles it)
        var hasGlowAnim = config.animationPreset === 'glow';
        var hasBorderGlow = config.borderEffect === 'glowing';
        var hasHoverGlow = config.hoverGlow;
        var animationsNeedBoxShadow = hasGlowAnim || hasBorderGlow || hasHoverGlow;
        
        // Determine button style type from CSS variable (set by Liquid)
        var computedStyle = getComputedStyle(document.documentElement);
        var codBtnBg = computedStyle.getPropertyValue('--cod-btn-bg').trim();
        var isOutlineStyle = codBtnBg === 'transparent';
        
        // For outline buttons, use primary color for text (like preview does)
        var finalTextColor = textColor;
        // Always use primaryColor as background - this is the seller's main button color
        var finalBgColor = config.primaryColor;
        if (isOutlineStyle) {
          finalBgColor = 'transparent';
          // If text color is white (default), use primary color instead for visibility
          if (textColor.toLowerCase() === '#ffffff' || textColor.toLowerCase() === 'white') {
            finalTextColor = config.primaryColor;
          }
          // Ensure border for outline
          if (!borderWidth || borderWidth === 0) {
            borderWidth = 2;
          }
        }
        
        var baseStyles = {
          width: '100%',
          padding: (config.buttonStyles && config.buttonStyles.buttonSize === 'small') ? '10px' : (config.buttonStyles && config.buttonStyles.buttonSize === 'large') ? '16px' : '14px',
          borderRadius: (btnStyles.borderRadius ?? config.borderRadius) + 'px',
          fontWeight: btnStyles.fontStyle === 'bold' ? 700 : 400,
          fontStyle: btnStyles.fontStyle === 'italic' ? 'italic' : 'normal',
          fontSize: (btnStyles.textSize ?? 15) + 'px',
          border: borderWidth + 'px solid ' + (isOutlineStyle ? config.primaryColor : borderColor),
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          textAlign: 'center',
          display: 'block',
          boxSizing: 'border-box',
          color: finalTextColor,
          backgroundColor: finalBgColor
        };
        
        // Only add boxShadow if no CSS animations need to control it
        if (!animationsNeedBoxShadow) {
          baseStyles.boxShadow = btnStyles.shadow ? '0 4px 6px rgba(0,0,0,0.1)' : 'none';
        }

        // Apply styles to string
        var styleString = Object.keys(baseStyles).map(function(key) {
           // specific overrides for gradient
           return key.replace(/([A-Z])/g, '-$1').toLowerCase() + ':' + baseStyles[key];
        }).join(';');

        // Create COD button
        var codBtn = document.createElement('button');
        codBtn.type = 'button';
        codBtn.className = 'cod-buy-btn ' + getButtonAnimationClasses(config);
        codBtn.textContent = config.buttonText;
        codBtn.style.cssText = styleString;
        codBtn.dataset.codOpen = productId;

        // Only apply default hover if no custom effects defined
        var hasCustomHover = config.hoverLift || config.hoverGlow;
        var hasCustomClick = config.clickPress || config.clickRipple;
        var hasAnimation = config.animationPreset && config.animationPreset !== 'none';
        var hasBorderEffect = config.borderEffect && config.borderEffect !== 'static';
        
        if (!hasCustomHover && !hasAnimation && !hasBorderEffect) {
          codBtn.addEventListener('mouseenter', function() {
            this.style.opacity = '0.9';
            this.style.transform = 'translateY(-1px)';
          });
          codBtn.addEventListener('mouseleave', function() {
            this.style.opacity = '1';
            this.style.transform = 'translateY(0)';
          });
        }

        // Click handler
        codBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          openModal(productId, config);
        });

        // Insert COD button BEFORE the original button, then hide original
        btn.parentNode.insertBefore(codBtn, btn);
        btn.style.display = 'none';
        btn.dataset.codReplaced = 'true';
        
        // In Product Page placement: render offers above the COD button on the product page
        if (!document.querySelector('.cod-product-page-offers[data-product-id="' + productId + '"]')) {
          var offersResult = renderQuantityOffersWithPlacement(codBtn.parentNode, config);
          if (offersResult.element && offersResult.placement === 'in_product_page') {
            offersResult.element.classList.add('cod-product-page-offers');
            offersResult.element.setAttribute('data-product-id', productId);
            codBtn.parentNode.insertBefore(offersResult.element, codBtn);
            console.log('[COD Form] Rendered in_product_page offers above COD button');
            
            // Set default selected offer data so modal can read it on open
            var defaultSelectedCard = offersResult.element.querySelector('.cod-offer-card.selected');
            if (defaultSelectedCard) {
              var defaultOffer = {
                quantity: parseInt(defaultSelectedCard.getAttribute('data-quantity')),
                discountPercent: parseFloat(defaultSelectedCard.getAttribute('data-discount')) || 0
              };
              offersResult.element.setAttribute('data-selected-offer', JSON.stringify(defaultOffer));
            }
            
            // Wire up click handlers to sync with modal
            offersResult.element.querySelectorAll('.cod-offer-card').forEach(function(card) {
              card.addEventListener('click', function() {
                // Update visual selection on product page cards
                offersResult.element.querySelectorAll('.cod-offer-card').forEach(function(c) {
                  c.classList.remove('selected');
                });
                card.classList.add('selected');
                
                // Store selected offer on the product page offers container
                var offer = {
                  quantity: parseInt(card.getAttribute('data-quantity')),
                  discountPercent: parseFloat(card.getAttribute('data-discount')) || 0
                };
                offersResult.element.setAttribute('data-selected-offer', JSON.stringify(offer));
                
                // Also sync to any modal offers container
                var modalContainer = document.getElementById('cod-form-' + productId);
                if (modalContainer) {
                  var modalOffers = modalContainer.querySelector('.cod-quantity-offers');
                  if (modalOffers) {
                    modalOffers.setAttribute('data-selected-offer', JSON.stringify(offer));
                    // Update visual selection in modal too
                    modalOffers.querySelectorAll('.cod-offer-card').forEach(function(mc) {
                      mc.classList.remove('selected');
                    });
                    var matchCard = modalOffers.querySelector('[data-quantity="' + offer.quantity + '"]');
                    if (matchCard) matchCard.classList.add('selected');
                  }
                  // Update quantity input
                  var qtyInput = modalContainer.querySelector('.cod-qty-input');
                  if (qtyInput) {
                    qtyInput.value = offer.quantity;
                    qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                  // Update order summary
                  var form = modalContainer.querySelector('form');
                  if (form) {
                    updateOfferPrice(form, config, offer);
                    updateOrderSummaryWithOffer(form, config, offer);
                  }
                }
              });
            });
          }
        }
        
        // Create sticky button clone for mobile (separate button)
        if (config.stickyOnMobile && window.innerWidth <= 600) {
          var stickyBtn = codBtn.cloneNode(true);
          stickyBtn.classList.add('sticky-mobile');
          stickyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openModal(productId, config);
          });
          
          // Append to body
          document.body.appendChild(stickyBtn);
          
          // Track original button position with IntersectionObserver
          // Only show sticky when user has scrolled DOWN past the button
          var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
              // Check if button is above viewport (user scrolled down past it)
              var rect = entry.boundingClientRect;
              
              if (entry.isIntersecting) {
                // Original button is visible in viewport - always hide sticky
                stickyBtn.classList.remove('visible');
              } else if (rect.bottom < 0) {
                // Button is above viewport (user scrolled down past it) - show sticky
                stickyBtn.classList.add('visible');
              } else {
                // Button is below viewport (hasn't reached it yet) - hide sticky
                stickyBtn.classList.remove('visible');
              }
            });
          }, { 
            threshold: 0,
            rootMargin: '0px'
          });
          
          observer.observe(codBtn);
        }
      });
    });

    // Hide Shopify payment buttons container
    var paymentContainers = document.querySelectorAll('.shopify-payment-button, [data-shopify="payment-button"]');
    paymentContainers.forEach(function(container) {
      container.style.display = 'none';
    });
  }

  /**
   * Helper to darken color
   */
  function darkenColor(hex, percent) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
    var g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
    var b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
    return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
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
    if (template === 'cards') {
      offersContainer.style.flexDirection = 'row';
      offersContainer.style.flexWrap = 'wrap';
    } else if (template === 'vertical') {
      offersContainer.style.flexDirection = 'row';
      offersContainer.style.flexWrap = 'wrap';
    } else {
      // Classic, Modern, Minimal - stack cards vertically
      offersContainer.style.flexDirection = 'column';
    }
    
    // State: selected offer index
    var selectedIndex = design.autoSelectBestValue ? 
      applicableGroup.offers.reduce(function(maxIdx, offer, idx, arr) {
        return (offer.discountPercent || 0) > (arr[maxIdx].discountPercent || 0) ? idx : maxIdx;
      }, 0) : 0;
    
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
        card.style.flex = '1';
        card.style.minWidth = '100px';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.textAlign = 'center';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
      } else if (isVertical) {
        // Vertical template - column layout, centered
        card.style.flex = '1';
        card.style.minWidth = '120px';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.textAlign = 'center';
      } else if (isMinimal) {
        // Minimal template - horizontal, compact
        card.style.flexDirection = 'row';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.gap = '6px';
      } else {
        // Classic & Modern - horizontal row, text left, price right
        card.style.flexDirection = 'row';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.gap = '10px';
      }
      
      // Apply design styles
      if (idx === selectedIndex) {
        card.style.background = design.selectedBgColor || 'rgba(99,102,241,0.08)';
        card.style.borderColor = design.selectedBorderColor || config.primaryColor;
        card.style.color = design.selectedTextColor || '#1f2937';
      } else {
          card.style.background = design.unselectedBgColor || '#ffffff';
          card.style.borderColor = design.unselectedBorderColor || '#e5e7eb';
          card.style.color = '#6b7280';
      }
      card.style.borderRadius = (design.selectedBorderRadius || 10) + 'px';
      
      // Most Popular Ribbon Tag - positioned at top-right
      if (isMostPopular) {
        var ribbon = document.createElement('div');
        ribbon.className = 'cod-offer-ribbon';
        ribbon.style.position = 'absolute';
        ribbon.style.top = '-10px';
        ribbon.style.right = '-6px';
        ribbon.style.background = offer.tagBgColor || design.selectedTagBgColor || '#1f2937';
        ribbon.style.color = design.selectedTagTextColor || '#ffffff';
        ribbon.style.fontSize = '10px';
        ribbon.style.fontWeight = '700';
        ribbon.style.padding = '4px 10px';
        ribbon.style.borderRadius = '4px';
        ribbon.style.zIndex = '10';
        ribbon.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
        ribbon.style.whiteSpace = 'nowrap';
        ribbon.textContent = offer.label || 'Most Popular';
        card.appendChild(ribbon);
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
        discountTag.style.background = offer.tagBgColor || design.selectedTagBgColor || config.primaryColor;
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
      } else {
        // Classic, Modern, Minimal - price right-aligned
        priceWrapper.style.textAlign = 'right';
        priceWrapper.style.alignItems = 'flex-end';
      }
      
      // Original price (strikethrough) if discount exists
      if (offer.discountPercent) {
        var originalPriceSpan = document.createElement('span');
        originalPriceSpan.className = 'cod-offer-original-price';
        originalPriceSpan.textContent = (design.currencySymbol || '₹') + originalPrice.toFixed(0);
        priceWrapper.appendChild(originalPriceSpan);
      }
      
      // Discounted price
      var priceDiv = document.createElement('div');
      priceDiv.className = 'cod-offer-price';
      priceDiv.textContent = (design.currencySymbol || '₹') + discountedPrice.toFixed(0);
      priceWrapper.appendChild(priceDiv);
      
      // Append price wrapper to card
      card.appendChild(priceWrapper);
      
      // Click handler
      card.addEventListener('click', function() {
        // Update selected state
        offersContainer.querySelectorAll('.cod-offer-card').forEach(function(c, i) {
          c.classList.remove('selected');
          c.style.background = design.unselectedBgColor || '#ffffff';
          c.style.borderColor = design.unselectedBorderColor || '#e5e7eb';
        });
        card.classList.add('selected');
        card.style.background = design.selectedBgColor || 'rgba(99,102,241,0.08)';
        card.style.borderColor = design.selectedBorderColor || config.primaryColor;
        
        // Update quantity selector
        var form = container.closest('.cod-modal') || container.closest('form');
        var qtyInput = form.querySelector('.cod-qty-input');
        if (qtyInput) {
          qtyInput.value = offer.quantity;
          qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Store selected offer for price calculation
        offersContainer.setAttribute('data-selected-offer', JSON.stringify({
          quantity: offer.quantity,
          discountPercent: offer.discountPercent || 0
        }));
        
        // Update price display
        updateOfferPrice(form, config, offer);
        
        // Update order summary with new discount - pass offer directly
        updateOrderSummaryWithOffer(form, config, offer);
      });
      
      offersContainer.appendChild(card);
    });
    
    // Set initial selected offer
    offersContainer.setAttribute('data-selected-offer', JSON.stringify({
      quantity: applicableGroup.offers[selectedIndex].quantity,
      discountPercent: applicableGroup.offers[selectedIndex].discountPercent || 0
    }));
    
    return offersContainer;
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
      
      console.log('[COD Form] Product header hidden for non-in_product_page placement');
  }
  
  /**
   * Update price display based on selected offer
   */
  function updateOfferPrice(form, config, offer) {
    // .cod-product-price is in the modal container, NOT inside the form
    var modal = form.closest('.cod-modal') || form.parentElement;
    var priceElement = modal ? modal.querySelector('.cod-product-price') : form.querySelector('.cod-product-price');
    if (!priceElement) {
        console.log('[COD Form] updateOfferPrice: .cod-product-price not found');
        return;
    }
    
    var unitPrice = config.productPrice;
    var total = unitPrice * offer.quantity * (1 - (offer.discountPercent || 0) / 100);
    
    priceElement.innerHTML = formatMoney(total);
    if (offer.discountPercent) {
      priceElement.innerHTML += ' <span style="text-decoration:line-through;color:#9ca3af;font-size:14px;">' + 
        formatMoney(unitPrice * offer.quantity) + '</span>';
    }
    priceElement.style.display = ''; // Ensure it's visible
    console.log('[COD Form] updateOfferPrice: updated to', total, 'with discount', offer.discountPercent + '%');
  }

  /**
   * Initialize form functionality and render fields
   */
  function initForm(productId, config) {
    var container = document.getElementById('cod-form-' + productId);
    var form = document.getElementById('cod-order-form-' + productId);
    var fieldsContainer = form.querySelector('.cod-dynamic-fields-container');
    
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
            // Skip rendering inside modal - already rendered on product page via replaceBuyButtons
            console.log('[COD Form] Skipping modal offers - in_product_page placement handled on product page');
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
    }
    
    // Show product header (image + price) ONLY when bundle offers are NOT present
    // Only hide when there are actual bundle offers rendered
    if (quantityOffersEl && placement !== 'in_product_page') {
        hideProductHeaderIfOffersActive(container);
    }

    // 2. Render Rate Card (Order Summary) if enabled
    console.log('[COD Form] Checking order summary - blocks:', config.blocks, 'order_summary:', config.blocks?.order_summary);
    if (config.blocks && config.blocks.order_summary) {
        console.log('[COD Form] Rendering order summary');
        renderRateCard(form, config);
    } else {
        console.log('[COD Form] Order summary not rendered - blocks config:', config.blocks);
    }

    // 3. Render Shipping Options if enabled (new rates system OR old options system)
    var hasNewShippingRates = config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0;
    var hasOldShippingOptions = config.shippingOptions && config.shippingOptions.enabled;
    if (config.blocks && config.blocks.shipping_options && (hasNewShippingRates || hasOldShippingOptions)) {
        renderShippingOptions(form, config);
    }

    // 3.5 Render Payment Method Options if Partial COD is enabled
    if (config.partialCodEnabled) {
        renderPaymentMethodOptions(form, config);
    }

    // 4. Render Marketing Consent if enabled
    if (config.blocks && config.blocks.buyer_marketing) {
        renderMarketingCheckbox(form, config);
    }
    
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

    // 7. Check LocalStorage for existing data (Returning User)
    checkLocalStorageAndFill(form);

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
    var backgroundColor = styles.backgroundColor || '#ffffff';
    var iconColor = styles.iconColor || '#6b7280';
    var iconBackground = styles.iconBackground || 'transparent';
    var hasShadow = styles.shadow !== false;
    
    container.innerHTML = '';
    
    // Sort fields by order
    var sortedFields = config.fields.sort(function(a, b) { return a.order - b.order; });
    
    console.log('[COD Form] Sorted fields:', sortedFields);

    sortedFields.forEach(function(field) {
        console.log('[COD Form] Processing field:', field.id, 'visible:', field.visible);
        
        if (!field.visible) {
            console.log('[COD Form] Skipping invisible field:', field.id);
            return;
        }

        var wrapper = document.createElement('div');
        wrapper.className = 'cod-form-field';
        wrapper.style.marginBottom = '6px';

        var label = document.createElement('label');
        label.style.display = 'block';
        label.style.fontWeight = fontStyle === 'bold' ? '700' : '500';
        label.style.fontStyle = fontStyle === 'italic' ? 'italic' : 'normal';
        label.style.marginBottom = '2px';
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
        if (field.id === 'phone') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>';
        } else if (field.id === 'name') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
        } else if (field.id === 'email') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>';
        } else if (field.id === 'address') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
        } else if (field.id === 'notes') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14,2 14,8 20,8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10,9 9,9 8,9"></polyline></svg>';
        } else if (field.id === 'quantity') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg>';
        } else {
            // Default icon for unknown fields
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
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
        } else if (field.type === 'dropdown') {
            input = document.createElement('select');
            // Add options logic if custom fields have options
            if (field.options) {
                field.options.forEach(function(opt) {
                    var option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    input.appendChild(option);
                });
            }
        } else {
            input = document.createElement('input');
            input.type = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text';
        }

        // Common Input Attributes
        input.name = field.id; // e.g. 'name', 'phone', 'address'
        input.id = 'cod-' + field.id;
        input.placeholder = field.placeholder || 'Enter ' + field.label.toLowerCase();
        if (field.required) input.required = true;
        
        // Add browser autocomplete attributes for native autofill
        var autocompleteMap = {
            'name': 'name',
            'phone': 'tel',
            'address': 'street-address',
            'city': 'address-level2',
            'state': 'address-level1',
            'zip': 'postal-code',
            'zipcode': 'postal-code',
            'email': 'email'
        };
        if (autocompleteMap[field.id]) {
            input.setAttribute('autocomplete', autocompleteMap[field.id]);
        }
        
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
        input.style.fontWeight = fontStyle === 'bold' ? '700' : '400';
        input.style.fontStyle = fontStyle === 'italic' ? 'italic' : 'normal';
        input.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        input.style.color = textColor; // Input text color
        if (styles.fieldBackgroundColor) {
            input.style.setProperty('background-color', styles.fieldBackgroundColor, 'important');
        } else {
            input.style.backgroundColor = '#ffffff';
        }
        input.style.boxShadow = hasShadow ? '0 1px 2px rgba(0,0,0,0.05)' : 'none';
        input.style.boxSizing = 'border-box';
        input.style.marginBottom = '4px';

        inputContainer.appendChild(input);
        wrapper.appendChild(inputContainer);
        container.appendChild(wrapper);
        
        console.log('[COD Form] Added field to container:', field.id);
    });
    
    console.log('[COD Form] renderFields completed. Container children count:', container.children.length);
  }


  /**
   * Save customer data to LocalStorage for future auto-fill
   */
  function saveCustomerToLocalStorage(form) {
    try {
        var phone = form.querySelector('[name="phone"]');
        var name = form.querySelector('[name="name"]');
        var address = form.querySelector('[name="address"]');
        var email = form.querySelector('[name="email"]');
        var state = form.querySelector('[name="state"]');
        var city = form.querySelector('[name="city"]');
        var zip = form.querySelector('[name="zip"], [name="zipcode"]');
        
        localStorage.setItem('cod_customer', JSON.stringify({
            phone: phone ? phone.value : '',
            name: name ? name.value : '',
            address: address ? address.value : '',
            email: email ? email.value : '',
            state: state ? state.value : '',
            city: city ? city.value : '',
            zipcode: zip ? zip.value : ''
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
                      var phoneInput = form.querySelector('input[name="phone"]');
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
   * Smart Auto-fill - triggers when 10th digit entered (no delay)
   * Database is the source of truth
   */
  function setupAutoFill(form, config) {
    var phoneInput = form.querySelector('input[name="phone"]');
    if (!phoneInput) return;

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
        fetch(config.proxyUrl + '/api/customer-by-phone?phone=' + encodeURIComponent(phone) + '&shop=' + encodeURIComponent(config.shop))
            .then(function(res) { return res.json(); })
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
                }
            })
            .catch(function(err) {
                console.warn('[COD Form] Auto-fill API error:', err);
            });
    }

    phoneInput.addEventListener('input', function() {
        var digits = this.value.replace(/\D/g, '');
        if (digits.length === 10) triggerAutoFill();
    });
  }

  /**
   * Auto-fill form fields with customer data
   */
  function autoFillFields(form, data) {
    if (data.name) {
        var nameInput = form.querySelector('input[name="name"]');
        if (nameInput && !nameInput.value) nameInput.value = data.name;
    }
    if (data.address) {
        var addrInput = form.querySelector('[name="address"]');
        if (addrInput && !addrInput.value) addrInput.value = data.address;
    }
    if (data.email) {
        var emailInput = form.querySelector('input[name="email"]');
        if (emailInput && !emailInput.value) emailInput.value = data.email;
    }
    if (data.state) {
        var stateInput = form.querySelector('input[name="state"], select[name="state"]');
        if (stateInput && !stateInput.value) stateInput.value = data.state;
    }
    if (data.city) {
        var cityInput = form.querySelector('input[name="city"]');
        if (cityInput && !cityInput.value) cityInput.value = data.city;
    }
    if (data.zipcode) {
        var zipInput = form.querySelector('input[name="zip"], input[name="zipcode"]');
        if (zipInput && !zipInput.value) zipInput.value = data.zipcode;
    }
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
      card.style.background = '#f9fafb';
      card.style.padding = '12px';
      card.style.borderRadius = '8px';
      card.style.marginBottom = '16px';
      card.style.border = '1px solid #e5e7eb';

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
          var productPageOffers = document.querySelector('.cod-product-page-offers');
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
      
      // Calculate subtotal with quantity and discount
      var unitPrice = parseFloat(config.productPrice) || 0;
      var subtotal = unitPrice * quantity;
      
      var discount = 0;
      var discountPercent = 0;
      if (selectedOffer && selectedOffer.discountPercent) {
          discountPercent = selectedOffer.discountPercent;
          discount = subtotal * (discountPercent / 100);
      }
      
      // Calculate Shipping using new shipping rates system
      var shippingCost = 0;
      if (config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0) {
          // Find first applicable active rate using condition matching
          var currentQty = getEffectiveQuantity(form);
          var applicableRate = config.shippingRates.find(function(rate) { 
              return isRateApplicable(rate, config, currentQty); 
          });
          if (applicableRate) {
              shippingCost = parseFloat(applicableRate.price) || 0;
          }
      } else if (config.shippingOptions && config.shippingOptions.enabled) {
          // Fallback to old shipping options
          var defaultOpt = config.shippingOptions.options.find(function(o) { 
              return o.id === config.shippingOptions.defaultOption; 
          });
          if (defaultOpt) shippingCost = parseFloat(defaultOpt.price) || 0;
      }

      var total = subtotal - discount + shippingCost;
      
      console.log('[COD Form] Order Summary Calculation:', {
          unitPrice: unitPrice,
          quantity: quantity,
          subtotal: subtotal,
          discount: discount,
          shipping: shippingCost,
          total: total
      });

      card.innerHTML = `
        <div style="font-weight:600; margin-bottom:8px; display:flex; align-items:center;">
           🧾 Order Summary
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">
           <span>Subtotal (${quantity} ${quantity === 1 ? 'item' : 'items'})</span>
           <span id="cod-summary-subtotal">${formatMoney(subtotal)}</span>
        </div>
        ${discount > 0 ? `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#10b981;">
           <span>Bundle Discount (${discountPercent}%)</span>
           <span id="cod-summary-discount">-${formatMoney(discount)}</span>
        </div>` : ''}
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">
           <span>Shipping</span>
           <span id="cod-summary-shipping">${shippingCost === 0 ? 'FREE' : formatMoney(shippingCost)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed #d1d5db; font-weight:700; color:#111827;">
           <span>Total</span>
           <span id="cod-summary-total" style="color:${config.primaryColor}">${formatMoney(total)}</span>
        </div>
      `;

      form.insertBefore(card, form.querySelector('button[type="submit"]'));
  }

  /**
   * Render Shipping Options
   */
  function renderShippingOptions(form, config) {
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

      // Insert before submit button (or Order Summary if present)
      var summary = form.querySelector('.cod-order-summary');
      if (summary) {
          form.insertBefore(container, summary);
      } else {
         form.insertBefore(container, form.querySelector('button[type="submit"]'));
      }
  }

  /**
   * Get the effective quantity considering bundle offers
   * Priority: bundle offer selection > quantity input > default 1
   */
  function getEffectiveQuantity(form) {
      // Check for bundle offer selection first
      var modal = form.closest('.cod-modal');
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
      var productPageOffers = document.querySelector('.cod-product-page-offers');
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
      // Fallback to quantity input
      var qtyInput = form.querySelector('[name="quantity"]');
      return parseInt(qtyInput ? qtyInput.value : 1) || 1;
  }

  /**
   * Check if a shipping rate's conditions are met
   */
  function isRateApplicable(rate, config, quantity) {
      var orderPrice = (config.productPrice || 0) * quantity;
      
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

      var container = document.createElement('div');
      container.className = 'cod-shipping-section';
      container.style.marginBottom = '16px';
      
      var title = document.createElement('div');
      title.style.cssText = 'font-weight:600;margin-bottom:10px;font-size:14px;color:#374151;display:flex;align-items:center;gap:6px;';
      title.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> Shipping Method';
      container.appendChild(title);

      // Get current quantity for condition evaluation (uses bundle offer if available)
      var quantity = getEffectiveQuantity(form);

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
          
          form.insertBefore(container, form.querySelector('.cod-order-summary') || form.querySelector('button[type="submit"]'));
          return;
      }

      applicableRates.forEach(function(rate, index) {
          var card = document.createElement('label');
          card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid ' + (index === 0 ? (config.primaryColor || '#6366f1') : '#e5e7eb') + ';border-radius:10px;cursor:pointer;margin-bottom:8px;background:' + (index === 0 ? 'rgba(99,102,241,0.04)' : '#fff') + ';transition:all 0.2s ease;';
          
          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'shipping_method';
          radio.value = rate.id;
          radio.checked = index === 0;
          radio.style.cssText = 'accent-color:' + (config.primaryColor || '#6366f1') + ';width:18px;height:18px;flex-shrink:0;cursor:pointer;margin:0;';
          
          // Add change listener to update total and card styles
          radio.addEventListener('change', function() {
              updateTotalHelper(form, config, rate.price);
              // Update all card styles
              var allCards = container.querySelectorAll('label');
              allCards.forEach(function(c) {
                  var r = c.querySelector('input[type="radio"]');
                  if (r && r.checked) {
                      c.style.borderColor = config.primaryColor || '#6366f1';
                      c.style.background = 'rgba(99,102,241,0.04)';
                  } else {
                      c.style.borderColor = '#e5e7eb';
                      c.style.background = '#fff';
                  }
              });
          });

          // Text content area
          var textDiv = document.createElement('div');
          textDiv.style.cssText = 'flex:1;min-width:0;';
          
          var nameEl = document.createElement('div');
          nameEl.style.cssText = 'font-weight:600;font-size:14px;color:#1f2937;margin-bottom:2px;';
          nameEl.textContent = rate.name;
          textDiv.appendChild(nameEl);
          
          // Show description as delivery info with icon
          if (rate.description) {
              var descEl = document.createElement('div');
              descEl.style.cssText = 'font-size:12px;color:#6b7280;display:flex;align-items:center;gap:4px;';
              descEl.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + rate.description;
              textDiv.appendChild(descEl);
          }
          
          // Price badge on the right
          var priceEl = document.createElement('div');
          priceEl.style.cssText = 'flex-shrink:0;text-align:right;';
          if (rate.price === 0) {
              priceEl.innerHTML = '<span style="background:#10b981;color:white;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;">FREE</span>';
          } else {
              priceEl.innerHTML = '<span style="font-weight:700;font-size:15px;color:#1f2937;">' + formatMoney(rate.price) + '</span>';
          }

          card.appendChild(radio);
          card.appendChild(textDiv);
          card.appendChild(priceEl);
          container.appendChild(card);
          
          // Hover effects
          card.addEventListener('mouseenter', function() {
              if (!radio.checked) { card.style.borderColor = '#c7d2fe'; card.style.background = '#fafaff'; }
          });
          card.addEventListener('mouseleave', function() {
              if (!radio.checked) { card.style.borderColor = '#e5e7eb'; card.style.background = '#fff'; }
          });
      });

      // Insert before submit button (or Order Summary if present)
      var summary = form.querySelector('.cod-order-summary');
      if (summary) {
          form.insertBefore(container, summary);
      } else {
         form.insertBefore(container, form.querySelector('button[type="submit"]'));
      }
      
      // Update total with first rate's price
      if (applicableRates.length > 0) {
          updateTotalHelper(form, config, applicableRates[0].price);
      }
      
      console.log('[COD Form] Rendered new shipping rates:', applicableRates.length, 'of', config.shippingRates.length);
      
      // Re-render shipping options when quantity changes
      var qtyInput = form.querySelector('[name="quantity"]');
      if (qtyInput) {
          qtyInput.addEventListener('change', function() {
              // Remove existing shipping section and re-render
              var existingSection = form.querySelector('.cod-shipping-section');
              if (existingSection) {
                  existingSection.remove();
              }
              renderNewShippingRates(form, config);
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
                          if (existingSection) {
                              existingSection.remove();
                          }
                          renderNewShippingRates(form, config);
                      }
                  });
              });
              observer.observe(quantityOffersEl, { attributes: true, attributeFilter: ['data-selected-offer'] });
          }
      }
  }

  /**
   * Render Payment Method Selection (Full COD vs Partial COD)
   */
  function renderPaymentMethodOptions(form, config) {
      var container = document.createElement('div');
      container.className = 'cod-payment-method-options';
      container.style.marginBottom = '20px';
      container.style.padding = '16px';
      container.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%)';
      container.style.borderRadius = '12px';
      container.style.border = '1px solid rgba(99, 102, 241, 0.2)';

      var title = document.createElement('div');
      title.textContent = 'Payment Method';
      title.style.fontWeight = '600';
      title.style.marginBottom = '12px';
      title.style.color = '#1f2937';
      title.style.fontSize = '14px';
      container.appendChild(title);

      var optionsWrapper = document.createElement('div');
      optionsWrapper.style.display = 'flex';
      optionsWrapper.style.flexDirection = 'column';
      optionsWrapper.style.gap = '10px';

      // Calculate order total for display
      var orderTotal = config.productPrice || 0;
      var remainingAmount = orderTotal - config.partialCodAdvance;
      if (remainingAmount < 0) remainingAmount = 0;

      var paymentOptions = [
          {
              id: 'full_cod',
              label: 'Full COD',
              description: 'Pay ₹' + orderTotal.toFixed(0) + ' on delivery',
              checked: true
          },
          {
              id: 'partial_cod',
              label: 'Partial COD',
              description: 'Pay ₹' + config.partialCodAdvance + ' now, ₹' + remainingAmount.toFixed(0) + ' on delivery',
              checked: false
          }
      ];

      var submitBtn = form.querySelector('button[type="submit"]');
      var originalButtonText = submitBtn ? submitBtn.textContent : 'Place Order';

      paymentOptions.forEach(function(opt) {
          var row = document.createElement('label');
          row.style.display = 'flex';
          row.style.alignItems = 'flex-start';
          row.style.gap = '12px';
          row.style.padding = '14px';
          row.style.background = opt.checked ? 'rgba(99, 102, 241, 0.1)' : '#fff';
          row.style.borderRadius = '10px';
          row.style.border = '2px solid ' + (opt.checked ? config.primaryColor : '#e5e7eb');
          row.style.cursor = 'pointer';
          row.style.transition = 'all 0.2s ease';

          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'payment_method';
          radio.value = opt.id;
          radio.checked = opt.checked;
          radio.style.marginTop = '2px';
          radio.style.accentColor = config.primaryColor;

          var textContainer = document.createElement('div');
          textContainer.style.flex = '1';
          
          var labelText = document.createElement('div');
          labelText.textContent = opt.label;
          labelText.style.fontWeight = '600';
          labelText.style.color = '#1f2937';
          labelText.style.fontSize = '14px';

          var descText = document.createElement('div');
          descText.textContent = opt.description;
          descText.style.color = '#6b7280';
          descText.style.fontSize = '13px';
          descText.style.marginTop = '2px';

          textContainer.appendChild(labelText);
          textContainer.appendChild(descText);

          row.appendChild(radio);
          row.appendChild(textContainer);
          optionsWrapper.appendChild(row);

          // Mouse events for hover
          row.addEventListener('mouseenter', function() {
              if (!radio.checked) {
                  row.style.borderColor = '#c7d2fe';
                  row.style.background = 'rgba(99, 102, 241, 0.05)';
              }
          });
          row.addEventListener('mouseleave', function() {
              if (!radio.checked) {
                  row.style.borderColor = '#e5e7eb';
                  row.style.background = '#fff';
              }
          });

          // Change event to update UI and button text
          radio.addEventListener('change', function() {
              // Update all row styles
              var allRows = optionsWrapper.querySelectorAll('label');
              allRows.forEach(function(r, idx) {
                  var isSelected = r.querySelector('input[type="radio"]').checked;
                  r.style.borderColor = isSelected ? config.primaryColor : '#e5e7eb';
                  r.style.background = isSelected ? 'rgba(99, 102, 241, 0.1)' : '#fff';
              });

              // Update submit button text
              if (submitBtn) {
                  if (opt.id === 'partial_cod') {
                      submitBtn.textContent = 'Pay ₹' + config.partialCodAdvance + ' Now';
                      submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                  } else {
                      submitBtn.textContent = originalButtonText;
                      submitBtn.style.background = config.primaryColor;
                  }
              }
          });
      });

      container.appendChild(optionsWrapper);

      // Insert before order summary or submit button
      var summary = form.querySelector('.cod-order-summary');
      if (summary) {
          form.insertBefore(container, summary);
      } else {
          form.insertBefore(container, form.querySelector('button[type="submit"]'));
      }
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

  function updateTotalHelper(form, config, shippingPrice) {
      // Read quantity and discount from bundle offer if available
      var quantity = 1;
      var discountPercent = 0;
      
      var modal = form.closest('.cod-modal') || form;
      var quantityOffersEl = modal.querySelector('.cod-quantity-offers');
      if (quantityOffersEl) {
          try {
              var offerData = quantityOffersEl.getAttribute('data-selected-offer');
              if (offerData) {
                  var selectedOffer = JSON.parse(offerData);
                  quantity = selectedOffer.quantity || 1;
                  discountPercent = selectedOffer.discountPercent || 0;
              }
          } catch (e) {
              // Fallback to quantity input
          }
      }
      
      // Also check product page offers (for in_product_page placement)
      if (quantity === 1 && discountPercent === 0) {
          var productPageOffers = document.querySelector('.cod-product-page-offers');
          if (productPageOffers) {
              try {
                  var ppOfferData = productPageOffers.getAttribute('data-selected-offer');
                  if (ppOfferData) {
                      var ppOffer = JSON.parse(ppOfferData);
                      quantity = ppOffer.quantity || 1;
                      discountPercent = ppOffer.discountPercent || 0;
                  }
              } catch (e) {
                  // Fallback
              }
          }
      }
      
      // Fallback: also check qty input if no offer found
      if (quantity === 1 && !quantityOffersEl) {
          var qtyInput = form.querySelector('[name="quantity"]');
          quantity = parseInt(qtyInput ? qtyInput.value : 1) || 1;
      }
      
      var productPrice = parseFloat(config.productPrice) || 0;
      var shipping = parseFloat(shippingPrice) || 0;
      var subtotal = productPrice * quantity;
      var discount = subtotal * (discountPercent / 100);

      // Calculate tick upsell total
      var tickUpsellTotal = 0;
      var tickUpsellItems = [];
      var tickRows = form.querySelectorAll('.cod-tick-upsell-row');
      tickRows.forEach(function(row) {
          var cb = row.querySelector('input[type="checkbox"]');
          if (cb && cb.checked) {
              var price = parseFloat(row.getAttribute('data-offer-price')) || 0;
              tickUpsellTotal += price;
              // Get title from data attribute (avoids duplicate ₹ from DOM text)
              var titleText = row.getAttribute('data-offer-title') || 'Upsell';
              tickUpsellItems.push({ title: titleText, price: price });
          }
      });

      // Calculate downsell total
      var downsellTotal = 0;
      var downsellItems = [];
      var dsItemsAttr = form.getAttribute('data-downsell-items');
      if (dsItemsAttr) {
          try {
              var dsArr = JSON.parse(dsItemsAttr);
              dsArr.forEach(function(di) {
                  downsellTotal += di.price;
                  downsellItems.push({ title: di.title || 'Downsell item', price: di.price });
              });
          } catch(e) {}
      }

      // When downsell is active, the downsell price REPLACES the original subtotal
      var displaySubtotal = subtotal;
      var downsellSavings = 0;
      if (downsellItems.length > 0) {
          displaySubtotal = downsellTotal;
          downsellSavings = subtotal - downsellTotal;
      }

      var total = displaySubtotal - discount + shipping + tickUpsellTotal;
      
      var summaryEl = form.querySelector('.cod-order-summary') || modal.querySelector('.cod-order-summary');
      if (summaryEl) {
          // Re-render the full summary HTML to keep everything in sync
          var html = 
            '<div style="font-weight:600; margin-bottom:8px; display:flex; align-items:center;">' +
            '   🧾 Order Summary' +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
            '   <span>Subtotal (' + quantity + ' ' + (quantity === 1 ? 'item' : 'items') + ')</span>' +
            '   <span id="cod-summary-subtotal">' + formatMoney(displaySubtotal) + '</span>' +
            '</div>';
          
          if (downsellSavings > 0) {
            html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#10b981;">' +
            '   <span>Downsell discount</span>' +
            '   <span>-' + formatMoney(downsellSavings) + '</span>' +
            '</div>';
          }

          if (discount > 0) {
            html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#10b981;">' +
            '   <span>Bundle Discount (' + discountPercent + '%)</span>' +
            '   <span id="cod-summary-discount">-' + formatMoney(discount) + '</span>' +
            '</div>';
          }

          // Add tick upsell line items
          tickUpsellItems.forEach(function(item) {
            html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#059669;">' +
            '   <span>' + item.title + '</span>' +
            '   <span>' + formatMoney(item.price) + '</span>' +
            '</div>';
          });

          html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
            '   <span>Shipping</span>' +
            '   <span id="cod-summary-shipping">' + (shipping === 0 ? 'FREE' : formatMoney(shipping)) + '</span>' +
            '</div>' +
            '<div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed #d1d5db; font-weight:700; color:#111827;">' +
            '   <span>Total</span>' +
            '   <span id="cod-summary-total" style="color:' + config.primaryColor + '">' + formatMoney(total) + '</span>' +
            '</div>';
          
          summaryEl.innerHTML = html;
      } else {
          // Fallback: update individual elements if summary container not found
          var shipEl = form.querySelector('#cod-summary-shipping');
          var totalEl = form.querySelector('#cod-summary-total');
          var subEl = form.querySelector('#cod-summary-subtotal');
          
          if (shipEl) shipEl.textContent = shipping === 0 ? 'FREE' : formatMoney(shipping);
          if (totalEl) totalEl.textContent = formatMoney(total);
          if (subEl) subEl.textContent = formatMoney(subtotal);
      }
  }

  // Separate function to update order summary with tick upsells (called from tick upsell change handlers)
  function updateOrderSummaryWithTickUpsells(form, config) {
      var sp = 0;
      var sel = form.querySelector('input[name="shipping_method"]:checked');
      if (sel && config.shippingOptions && config.shippingOptions.options) {
          var o = config.shippingOptions.options.find(function(x) { return x.id === sel.value; });
          if (o) sp = o.price;
      }
      updateTotalHelper(form, config, sp);
  }

  function formatMoney(amount) {
      var num = parseFloat(amount) || 0;
      return '₹' + num.toFixed(2);
  }

  function updateOrderSummaryWithOffer(form, config, offer) {
      var summaryEl = form.querySelector('.cod-order-summary');
      if (!summaryEl) {
          // Also try looking up from the modal container
          var modal = form.closest('.cod-modal');
          if (modal) {
              summaryEl = modal.querySelector('.cod-order-summary');
          }
          if (!summaryEl) {
              console.log('[COD Form] No order summary to update');
              return;
          }
      }
      
      // Use the offer directly if provided, otherwise try to read from DOM
      var quantity = 1;
      var discountPercent = 0;
      
      if (offer) {
          quantity = offer.quantity || 1;
          discountPercent = offer.discountPercent || 0;
      } else {
          // Fallback: read from data attribute
          var modal = form.closest('.cod-modal') || form;
          var quantityOffersEl = modal.querySelector('.cod-quantity-offers');
          if (quantityOffersEl) {
              try {
                  var offerData = quantityOffersEl.getAttribute('data-selected-offer');
                  if (offerData) {
                      var selectedOffer = JSON.parse(offerData);
                      quantity = selectedOffer.quantity || 1;
                      discountPercent = selectedOffer.discountPercent || 0;
                  }
              } catch (e) {
                  console.warn('[COD Form] Failed to parse selected offer:', e);
              }
          }
          // Also check product page offers (for in_product_page placement)
          if (quantity === 1 && discountPercent === 0) {
              var productPageOffers = document.querySelector('.cod-product-page-offers');
              if (productPageOffers) {
                  try {
                      var ppOfferData = productPageOffers.getAttribute('data-selected-offer');
                      if (ppOfferData) {
                          var ppOffer = JSON.parse(ppOfferData);
                          quantity = ppOffer.quantity || 1;
                          discountPercent = ppOffer.discountPercent || 0;
                      }
                  } catch (e) {
                      console.warn('[COD Form] Failed to parse product page offer:', e);
                  }
              }
          }
      }
      
      // Recalculate values
      var unitPrice = parseFloat(config.productPrice) || 0;
      var subtotal = unitPrice * quantity;
      var discount = subtotal * (discountPercent / 100);
      
      // Get current shipping cost
      var shippingCost = 0;
      var shippingEl = summaryEl.querySelector('#cod-summary-shipping');
      if (shippingEl) {
          var shippingText = shippingEl.textContent;
          if (shippingText !== 'FREE') {
              shippingCost = parseFloat(shippingText.replace(/[^0-9.]/g, '')) || 0;
          }
      }
      
      var total = subtotal - discount + shippingCost;

      // Include tick upsell prices in total
      var tickUpsellTotal = 0;
      var tickItems = getCheckedTickUpsells(form, config);
      tickItems.forEach(function(tu) { tickUpsellTotal += tu.price; });

      // Include downsell items in total
      var downsellTotal = 0;
      var dsItemsAttr = form.getAttribute('data-downsell-items');
      var dsItems = [];
      if (dsItemsAttr) { try { dsItems = JSON.parse(dsItemsAttr); } catch(e) {} }
      dsItems.forEach(function(di) { downsellTotal += di.price; });

      total += tickUpsellTotal + downsellTotal;
      
      console.log('[COD Form] Updating order summary:', {
          quantity: quantity,
          unitPrice: unitPrice,
          subtotal: subtotal,
          discountPercent: discountPercent,
          discount: discount,
          shipping: shippingCost,
          total: total
      });
      
      // Re-render the full order summary HTML for reliability
      summaryEl.innerHTML = 
        '<div style="font-weight:600; margin-bottom:8px; display:flex; align-items:center;">' +
        '   🧾 Order Summary' +
        '</div>' +
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
        '   <span>Subtotal (' + quantity + ' ' + (quantity === 1 ? 'item' : 'items') + ')</span>' +
        '   <span id="cod-summary-subtotal">' + formatMoney(subtotal) + '</span>' +
        '</div>' +
        (discount > 0 ? 
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#10b981;">' +
        '   <span>Bundle Discount (' + discountPercent + '%)</span>' +
        '   <span id="cod-summary-discount">-' + formatMoney(discount) + '</span>' +
        '</div>' : '') +
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
        '   <span>Shipping</span>' +
        '   <span id="cod-summary-shipping">' + (shippingCost === 0 ? 'FREE' : formatMoney(shippingCost)) + '</span>' +
        '</div>' +
        (tickUpsellTotal > 0 ?
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#059669;">' +
        '   <span>Tick Upsells</span>' +
        '   <span>+' + formatMoney(tickUpsellTotal) + '</span>' +
        '</div>' : '') +
        (downsellTotal > 0 ?
        '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#047857;">' +
        '   <span>Downsell</span>' +
        '   <span>+' + formatMoney(downsellTotal) + '</span>' +
        '</div>' : '') +
        '<div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed #d1d5db; font-weight:700; color:#111827;">' +
        '   <span>Total</span>' +
        '   <span id="cod-summary-total" style="color:' + config.primaryColor + '">' + formatMoney(total) + '</span>' +
        '</div>';

      // Also update the Liquid-rendered total price if it exists
      var codTotalPrice = form.querySelector('.cod-total-price');
      if (codTotalPrice) {
          codTotalPrice.textContent = formatMoney(total);
      }
  }

  /**
   * Apply Modal Styles
   */
  function applyModalStyles(container, config) {
      var styles = config.styles || {};
      
      // Apply modal style preset (glassmorphism, minimal, modern)
      var userBgColor = styles.backgroundColor || '#ffffff';
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
          
          // Background color for the entire form container
          if (styles.backgroundColor) {
              container.style.backgroundColor = styles.backgroundColor;
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
    var closeButtons = document.querySelectorAll('[data-cod-close="' + productId + '"]');
    closeButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        closeModal(productId, config);
      });
    });

    var overlay = document.getElementById('cod-modal-overlay-' + productId);
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
    var input = form.querySelector('input[name="quantity"]');
    var minus = form.querySelector('.cod-qty-minus');
    var plus = form.querySelector('.cod-qty-plus');
    
    if (!input || !minus || !plus) return;

    minus.addEventListener('click', function() {
        var val = parseInt(input.value);
        if (val > 1) {
            input.value = val - 1;
            triggerUpdate();
        }
    });

    plus.addEventListener('click', function() {
        var val = parseInt(input.value);
        if (val < config.maxQuantity) {
            input.value = val + 1;
            triggerUpdate();
        }
    });

    function triggerUpdate() {
        // Find selected shipping if exists
        var shippingPrice = 0;
        if (config.shippingOptions && config.shippingOptions.enabled) {
            var selected = form.querySelector('input[name="shipping_method"]:checked');
            if (selected) {
                 var opt = config.shippingOptions.options.find(o => o.id === selected.value);
                 if (opt) shippingPrice = opt.price;
            } else {
                 // default
                 var def = config.shippingOptions.options.find(o => o.id === config.shippingOptions.defaultOption);
                 if (def) shippingPrice = def.price;
            }
        }
        updateTotalHelper(form, config, shippingPrice);
    }
  }

  function openModal(productId, config) {
    var modal = document.getElementById('cod-form-' + productId);
    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    var form = document.getElementById('cod-order-form-' + productId);
    
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('visible'), 10);
    }
    if (overlay) overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // ── Pixel Tracking: InitiateCheckout ──
    foxCodTrackEvent('InitiateCheckout', { currency: 'INR' });

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
    
    // Clear form on open so fields are empty on every modal open / page refresh
    if (form) form.reset();

    // After form.reset(), re-apply visual styling for default-checked tick upsells
    // (form.reset() restores checkbox checked state via defaultChecked, but row styles are inline)
    if (form) {
        var tickRows = form.querySelectorAll('.cod-tick-upsell-row');
        tickRows.forEach(function(row) {
            var cb = row.querySelector('input[type="checkbox"]');
            if (cb && cb.checked) {
                // Re-apply "checked" styling to the row
                row.style.borderColor = '';    // will be overridden by next line if needed
                row.style.background = '';
                // Trigger change event to re-apply styling
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
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
        }, 50);
        return; // Skip offer syncing below
    }
    
    // Sync pre-selected offer from product page to the modal
    if (config && form) {
        setTimeout(function() {
            var productPageOffers = document.querySelector('.cod-product-page-offers[data-product-id="' + productId + '"]');
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
                    
                    // Update the price in the product header
                    updateOfferPrice(form, config, offer);
                    
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
                    
                    // Update order summary with the selected offer
                    updateOrderSummaryWithOffer(form, config, offer);
                    
                    // Re-render shipping rates with new quantity so conditions are re-evaluated
                    var shippingSection = form.querySelector('.cod-shipping-section');
                    if (shippingSection) {
                        shippingSection.remove();
                    }
                    var hasNewShippingRates = config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0;
                    var hasOldShippingOptions = config.shippingOptions && config.shippingOptions.enabled;
                    if (config.blocks && config.blocks.shipping_options && (hasNewShippingRates || hasOldShippingOptions)) {
                        renderShippingOptions(form, config);
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

  function closeModal(productId, config) {
    var modal = document.getElementById('cod-form-' + productId);
    var overlay = document.getElementById('cod-modal-overlay-' + productId);

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

                // Close the COD form first
                if (modal) {
                    modal.classList.remove('visible');
                    setTimeout(function() { modal.style.display = 'none'; }, 300);
                }
                if (overlay) overlay.style.display = 'none';
                document.body.style.overflow = '';

                // Show downsell modal after a brief delay
                var form = document.getElementById('cod-order-form-' + productId);
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
                            openModal(productId, config);
                            // Modify the existing .cod-product-info section to show downsell pricing
                            setTimeout(function() {
                                var container = form.closest('.cod-modal') || form.parentElement;

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
                                        priceWrapper.className = 'cod-ds-price-wrapper';
                                        priceWrapper.innerHTML =
                                            '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                                            '  <span style="text-decoration: line-through; color: #9ca3af; font-size: 14px;">₹' + originalPrice.toFixed(2) + '</span>' +
                                            '  <span style="font-size: 18px; font-weight: 700; color: ' + (config.primaryColor || '#10b981') + ';">₹' + dsItem.price.toFixed(2) + '</span>' +
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
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(function() { modal.style.display = 'none'; }, 300);
    }
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  // =============================================
  // UPSELL RENDERING FUNCTIONS
  // =============================================

  /**
   * Check if an upsell should show for the current product
   */
  function shouldShowUpsell(campaign, config) {
      if (campaign.show_condition_type === 'always') return true;
      if (campaign.show_condition_type === 'specific_products') {
          var currentId = String(config.productId);
          return (campaign.trigger_product_ids || []).some(function(tid) {
              var tidStr = String(tid);
              return tidStr === currentId || tidStr.includes(currentId) || currentId.includes(tidStr);
          });
      }
      return true;
  }

  function getOfferPrice(offer) {
      if (!offer) return 0;
      var orig = offer.original_price || 0;
      if (offer.discount_type === 'percentage') return Math.round((orig - orig * (offer.discount_value || 0) / 100) * 100) / 100;
      return Math.max(0, orig - (offer.discount_value || 0));
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
              var offerPrice = offer.original_price || 0;
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
              var headerText = design.headerText || ('Add ' + (offer.upsell_product_title || 'this product') + ' for ₹' + offerPrice);
              headerText = headerText.replace('{{title}}', offer.upsell_product_title || 'this product');
              headerText = headerText.replace('{{price}}', '₹' + offerPrice);
              title.textContent = headerText;
              info.appendChild(title);

              var priceDiv = document.createElement('div');
              priceDiv.style.cssText = 'font-size: 13px;';
              priceDiv.innerHTML = '<strong style="color: #059669;">₹' + offerPrice + '</strong>';
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
                  items.push({ product_id: offer.upsell_product_id, variant_id: offer.upsell_variant_id, title: offer.upsell_product_title, price: offer.original_price || 0, quantity: 1, type: 'tick_upsell' });
              }
          });
      });
      return items;
  }

  function buildUpsellModalHTML(campaign, offer, offerIndex) {
      var design = campaign.design || {};
      var timer = design.timer || {};
      var discountTag = design.discountTag || {};
      var acceptBtn = design.acceptButton || {};
      var rejectBtn = design.rejectButton || {};
      var offerPrice = getOfferPrice(offer);
      var hasDiscount = offer.discount_value > 0;
      var discountLabel = offer.discount_type === 'percentage' ? offer.discount_value + '%' : '₹' + offer.discount_value;

      var html = '<div style="padding: 24px; text-align: center; background: ' + (design.bgColor || '#fff') + ';">';
      html += '<h2 style="font-size: ' + (design.headerTextSize || 20) + 'px; color: ' + (design.headerTextColor || '#000') + '; font-weight: ' + (design.headerBold ? '700' : '400') + '; margin: 0 0 4px;">' + (design.headerText || "You've unlocked a special deal") + '</h2>';
      html += '<p style="font-size: 14px; color: #6b7280; margin: 0 0 12px;">' + (design.subheaderText || 'Only for a limited time!') + '</p>';

      if (timer.enabled) {
          html += '<div class="cod-upsell-timer" style="background: ' + (timer.bgColor || '#fdf6f6') + '; color: ' + (timer.textColor || '#ef4444') + '; padding: 10px 20px; border-radius: 8px; margin: 0 0 16px; font-weight: 600; white-space: pre-line;" data-minutes="' + (timer.minutes || 10) + '">';
          html += (timer.text || 'Hurry! sale ends in\n{time}').replace('{time}', '<span class="cod-timer-value">' + String(timer.minutes || 10).padStart(2, '0') + ':00</span>');
          html += '</div>';
      }

      if (offer.upsell_product_image) {
          html += '<div style="position: relative; margin: 0 0 12px;"><img src="' + offer.upsell_product_image + '" style="max-width: 200px; max-height: 200px; object-fit: contain;" /></div>';
      }
      html += '<div style="font-size: 14px; margin-bottom: 8px;">' + (offer.upsell_product_title || 'Product') + '</div>';

      if (hasDiscount) {
          html += '<div style="margin-bottom: 8px;"><span style="display: inline-block; padding: 4px 16px; border-radius: ' + (discountTag.borderRadius || 20) + 'px; background: ' + (discountTag.bgColor || '#ec4899') + '; color: ' + (discountTag.textColor || '#fff') + '; font-size: ' + (discountTag.textSize || 14) + 'px; font-weight: 700;">' + (discountTag.text || '- {discount}').replace('{discount}', discountLabel) + '</span></div>';
      }

      html += '<div style="margin-bottom: 20px;">';
      if (hasDiscount) html += '<s style="color: #9ca3af; font-size: 14px; margin-right: 8px;">₹' + offer.original_price.toFixed(2) + '</s>';
      html += '<strong style="font-size: 20px; color: #1f2937;">₹' + offerPrice.toFixed(2) + '</strong></div>';

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

      var overlay = document.createElement('div');
      overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 20px;';
      var modal = document.createElement('div');
      modal.style.cssText = 'background: #fff; border-radius: 12px; max-width: 420px; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2);';
      modal.innerHTML = buildUpsellModalHTML(campaign, offer, offerIndex);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      startUpsellTimer(overlay);

      modal.querySelector('.cod-upsell-accept').addEventListener('click', function() {
          if (overlay._timerInterval) clearInterval(overlay._timerInterval);
          console.log('[COD Form] Upsell offer accepted:', offer.upsell_product_title);
          acceptedItems.push({ product_id: offer.upsell_product_id, variant_id: offer.upsell_variant_id, title: offer.upsell_product_title, price: getOfferPrice(offer), quantity: 1, type: 'click_upsell' });
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

  function buildDownsellModalHTML(dsCampaign, offer) {
      var design = dsCampaign.design || {};
      var acceptBtn = design.acceptButton || {};
      var rejectBtn = design.rejectButton || {};
      var origPrice = offer.original_price || 0;
      var offerPrice = getOfferPrice(offer);
      var hasDiscount = offer.discount_value > 0;
      var discountLabel = offer.discount_type === 'percentage' ? offer.discount_value + '%' : '₹' + offer.discount_value;

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
      var bgCss = design.bgImage
          ? 'background-image: url(' + design.bgImage + '); background-size: cover; background-position: center;'
          : 'background: ' + (design.bgColor || '#fff') + ';';

      // Main container
      html += '<div style="padding: 24px; text-align: center; ' + bgCss + ' border-radius: 12px;">';

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

      // Product image
      if (offer.upsell_product_image) {
          html += '<div style="margin: 0 0 8px;"><img src="' + offer.upsell_product_image + '" style="max-width: 180px; max-height: 180px; object-fit: contain; border-radius: 10px;" /></div>';
      }

      // Product title
      if (offer.upsell_product_title) {
          html += '<div style="font-size: 14px; margin-bottom: 6px; color: #374151;">' + offer.upsell_product_title + '</div>';
      }

      // Price display - only show when product has a price
      if (origPrice > 0) {
          html += '<div style="margin-bottom: 20px;">';
          if (hasDiscount) html += '<s style="color: #9ca3af; font-size: 14px; margin-right: 8px;">₹' + origPrice.toFixed(2) + '</s>';
          html += '<strong style="font-size: 20px; color: #1f2937;">₹' + offerPrice.toFixed(2) + '</strong></div>';
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

      var overlay = document.createElement('div');
      overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 20px;';
      var modal = document.createElement('div');
      modal.style.cssText = 'background: #fff; border-radius: 12px; max-width: 420px; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2);';

      // Use dedicated downsell builder if design has downsell-specific fields, else fallback to upsell builder
      var hasDownsellDesign = dsCampaign.design && (dsCampaign.design.titleText || dsCampaign.design.subtitleText || dsCampaign.design.descriptionText);
      modal.innerHTML = hasDownsellDesign ? buildDownsellModalHTML(dsCampaign, offer) : buildUpsellModalHTML(dsCampaign, offer, 0);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      startUpsellTimer(overlay);

      modal.querySelector('.cod-upsell-accept').addEventListener('click', function() {
          if (overlay._timerInterval) clearInterval(overlay._timerInterval);
          console.log('[COD Form] Downsell accepted:', offer.upsell_product_title);
          acceptedItems.push({ product_id: offer.upsell_product_id, variant_id: offer.upsell_variant_id, title: offer.upsell_product_title, image: offer.upsell_product_image || '', price: getOfferPrice(offer), quantity: 1, type: 'downsell' });
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
   * Handle Form Submission
   */
  function handleFormSubmit(e, productId, config) {
      e.preventDefault();
      var form = e.target;
      var submitBtn = form.querySelector('button[type="submit"]');
      var originalBtnText = submitBtn.textContent;
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
      
      // Collect form data
      var formData = new FormData(form);
      
      // Build payload with proper field mapping
      var payload = {
          shop: config.shop,
          customerName: formData.get('name') || '',
          customerPhone: formData.get('phone') || '',
          customerAddress: formData.get('address') || '',
          customerEmail: formData.get('email') || '',
          customerState: formData.get('state') || '',
          customerCity: formData.get('city') || '',
          customerZipcode: formData.get('zip') || formData.get('zipcode') || '',
          notes: formData.get('notes') || '',
          productId: config.productId,
          variantId: config.variantId,
          quantity: parseInt(formData.get('quantity') || '1'),
          price: parseFloat(config.productPrice),
          productTitle: config.productTitle,
          shippingLabel: '',
          shippingPrice: 0,
          discountPercent: 0,
          finalTotal: 0,
          upsell_items: getCheckedTickUpsells(form, config)
      };

      // ── Read bundle offer selection (quantity + discount) ──
      var _modal = form.closest('.cod-modal') || form;
      var _qOffers = _modal.querySelector('.cod-quantity-offers');
      if (_qOffers) {
          try {
              var _od = _qOffers.getAttribute('data-selected-offer');
              if (_od) {
                  var _so = JSON.parse(_od);
                  payload.quantity = _so.quantity || payload.quantity;
                  payload.discountPercent = _so.discountPercent || 0;
              }
          } catch(e) {}
      }
      // Also check product-page offers (for in_product_page placement)
      if (payload.discountPercent === 0) {
          var _ppOffers = document.querySelector('.cod-product-page-offers');
          if (_ppOffers) {
              try {
                  var _ppd = _ppOffers.getAttribute('data-selected-offer');
                  if (_ppd) {
                      var _ppo = JSON.parse(_ppd);
                      payload.quantity = _ppo.quantity || payload.quantity;
                      payload.discountPercent = _ppo.discountPercent || 0;
                  }
              } catch(e) {}
          }
      }

      // ── Read final total from order summary DOM (includes qty, discounts, shipping, upsells) ──
      var _summaryTotalEl = form.querySelector('#cod-summary-total');
      if (_summaryTotalEl) {
          payload.finalTotal = parseFloat(_summaryTotalEl.textContent.replace(/[^0-9.]/g, '')) || 0;
      }

      console.log('[COD Form] Bundle offer applied — qty:', payload.quantity, 'discount:', payload.discountPercent + '%', 'finalTotal:', payload.finalTotal);

      // If downsell is active, it replaces the product price (not added on top)
      var dsItemsAttr = form.getAttribute('data-downsell-items');
      if (dsItemsAttr) {
          try {
              var dsItems = JSON.parse(dsItemsAttr);
              if (dsItems.length > 0) {
                  payload.price = dsItems[0].price;
                  payload.notes = (payload.notes ? payload.notes + '\n' : '') + 'DOWNSELL APPLIED: ' + dsItems[0].title + ' (₹' + dsItems[0].price.toFixed(2) + ')';
              }
          } catch(e) {}
      }

      // Get selected shipping option
      var shippingRadio = form.querySelector('input[name="shipping_method"]:checked');
      if (shippingRadio && config.shippingOptions && config.shippingOptions.options) {
          var selectedOpt = config.shippingOptions.options.find(function(o) { return o.id === shippingRadio.value; });
          if (selectedOpt) {
              payload.shippingLabel = selectedOpt.label;
              payload.shippingPrice = selectedOpt.price;
          }
      }

      // Detect selected payment method
      var paymentMethodRadio = form.querySelector('input[name="payment_method"]:checked');
      var selectedPaymentMethod = paymentMethodRadio ? paymentMethodRadio.value : 'full_cod';
      var isPartialCod = selectedPaymentMethod === 'partial_cod';

      console.log('[COD Form] Preparing order:', payload, 'Payment method:', selectedPaymentMethod);

      // Check for 1-click upsells BEFORE placing the order
      var hasClickUpsells = config.upsellOffers && config.upsellOffers.click_upsells && config.upsellOffers.click_upsells.length > 0;
      var applicableUpsells = hasClickUpsells ? config.upsellOffers.click_upsells.filter(function(c) { return shouldShowUpsell(c, config); }) : [];

      if (applicableUpsells.length > 0 && !isPartialCod) {
          // Show upsell modal FIRST, then submit the order with accepted items
          showClickUpsellModal(form, config, productId, function(acceptedUpsellItems) {
              // Merge accepted click upsell items into the payload
              payload.upsell_items = (payload.upsell_items || []).concat(acceptedUpsellItems);
              console.log('[COD Form] Upsell flow complete. Accepted items:', acceptedUpsellItems.length, 'Submitting order...');
              submitFullCodOrder(form, config, productId, payload, submitBtn, originalBtnText);
          });
          return; // STOP HERE - do NOT fall through to submitFullCodOrder
      } else if (isPartialCod && config.partialCodEnabled) {
          // Partial COD: Call create-checkout endpoint and redirect to Shopify checkout  
          var partialCodPayload = {
              ...payload,
              paymentMethod: 'partial_cod',
              advanceAmount: config.partialCodAdvance,
              remainingAmount: (payload.price * payload.quantity) + (payload.shippingPrice || 0) - config.partialCodAdvance
          };

          console.log('[COD Form] Partial COD checkout:', partialCodPayload);

          fetch(config.proxyUrl + '/api/partial-cod/create-checkout', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(partialCodPayload)
          })
          .then(function(res) {
              var ct = res.headers.get('content-type');
              if (!res.ok) {
                  if (ct && ct.indexOf('application/json') !== -1) return res.json().then(function(j) { throw new Error(j.error || j.message || 'Request failed'); });
                  throw new Error('Server error ' + res.status);
              }
              if (ct && ct.indexOf('application/json') !== -1) return res.json();
              return res.text().then(function() { throw new Error('Invalid response'); });
          })
          .then(function(result) {
              console.log('[COD Form] Partial COD response:', result);
              
              if (result.success && result.checkoutUrl) {
                  // Redirect to Shopify checkout
                  window.location.href = result.checkoutUrl;
              } else {
                  // Show error
                  alert('Unable to create checkout: ' + (result.error || 'Unknown error'));
                  submitBtn.disabled = false;
                  submitBtn.textContent = originalBtnText;
              }
          })
          .catch(function(err) {
              console.error('[COD Form] Partial COD error:', err);
              alert('Network error. Please try again.');
              submitBtn.disabled = false;
              submitBtn.textContent = originalBtnText;
          });

          return; // Exit - partial COD handling complete
      }

      // Full COD with no upsells: Submit directly
      submitFullCodOrder(form, config, productId, payload, submitBtn, originalBtnText);
  }

  /**
   * Submit Full COD Order (called after upsell flow completes)
   */
  function submitFullCodOrder(form, config, productId, payload, submitBtn, originalBtnText) {
      console.log('[COD Form] Submitting full COD order with upsell_items:', payload.upsell_items);

      // Full COD: Send to regular backend
      fetch(config.proxyUrl + '/api/orders/', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      })
      .then(function(res) {
          var ct = res.headers.get('content-type');
          if (!res.ok) {
              if (ct && ct.indexOf('application/json') !== -1) {
                  return res.json().then(function(j) { throw new Error(j.error || j.message || 'Order failed'); });
              }
              throw new Error('Server error ' + res.status + '. Please try again.');
          }
          if (ct && ct.indexOf('application/json') !== -1) return res.json();
          return res.text().then(function(t) { throw new Error('Invalid server response'); });
      })
      .then(function(result) {
          console.log('[COD Form] Order response:', result);
          
          if (result.success) {
              // Save customer data to LocalStorage for future auto-fill
              saveCustomerToLocalStorage(form);

              // ── Pixel Tracking: Purchase ──
              // Read the final displayed total from order summary (includes qty, discounts, shipping, upsells)
              var purchaseValue = 0;
              var summaryTotalEl = form.querySelector('#cod-summary-total');
              if (summaryTotalEl) {
                  purchaseValue = parseFloat(summaryTotalEl.textContent.replace(/[^0-9.]/g, '')) || 0;
              }
              // Fallback: compute from payload if DOM element not found
              if (!purchaseValue) {
                  purchaseValue = ((payload.price || 0) * (payload.quantity || 1)) + (payload.shippingPrice || 0);
              }
              console.log('[FoxCod Pixels] Correct Purchase total:', purchaseValue);
              foxCodTrackEvent('Purchase', { value: purchaseValue, currency: 'INR' });
              
              // Show success message with order ID
              var successDiv = form.querySelector('.cod-message-success');
              var successText = successDiv ? successDiv.querySelector('.cod-message-text') : null;
              
              if (successDiv && successText) {
                  // Premium success popup - larger text, refined design, no horizontal swipe
                  successText.innerHTML = 
                      '<div class="cod-success-popup" style="width: 440px; max-width: 92vw; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; text-align: center; touch-action: pan-y; overflow: hidden; overscroll-behavior: contain;">' +
                      '<div style="background: linear-gradient(160deg, #ffffff 0%, #f0fdf4 100%); border-radius: 20px; padding: 40px 36px; box-shadow: 0 32px 64px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.12);">' +
                      '<div style="width: 72px; height: 72px; margin: 0 auto 24px; background: linear-gradient(145deg, #10b981 0%, #059669 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 28px rgba(16,185,129,0.35);">' +
                      '<svg style="width: 36px; height: 36px; color: white;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>' +
                      '</div>' +
                      '<h2 style="margin: 0 0 16px; font-size: 1.75rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">Order Confirmed</h2>' +
                      '<p style="margin: 0 0 24px; font-size: 1.125rem; line-height: 1.7; color: #334155; font-weight: 500;">' + (config.successMessage || 'Your order has been placed successfully! We will contact you shortly.') + '</p>' +
                      '<div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 14px; padding: 20px 24px; margin-bottom: 28px; border: 1px solid rgba(16,185,129,0.2);">' +
                      '<span style="font-size: 1rem; color: #047857; font-weight: 600; display: block; margin-bottom: 6px;">Order ID</span>' +
                      '<div style="font-size: 1.5rem; font-weight: 800; color: #0f172a; letter-spacing: 0.05em;">' + (result.orderName || result.orderId) + '</div>' +
                      '</div>' +
                      '<div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">' +
                      '<button onclick="window.location.reload()" style="cursor: pointer; padding: 16px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; font-size: 1.0625rem; font-weight: 700; border-radius: 12px; border: none; box-shadow: 0 6px 20px rgba(16,185,129,0.45);" onmouseover="this.style.transform=\'translateY(-2px)\'; this.style.boxShadow=\'0 10px 28px rgba(16,185,129,0.5)\'" onmouseout="this.style.transform=\'\'; this.style.boxShadow=\'0 6px 20px rgba(16,185,129,0.45)\'">Continue Shopping</button>' +
                      '<button onclick="var f=document.getElementById(\'cod-form-' + config.productId + '\').querySelector(\'form\'); f.reset(); var sd=document.querySelector(\'.cod-message-success\'); if(sd) sd.style.display=\'none\'; f.querySelectorAll(\'.cod-dynamic-fields-container, button[type=submit], .cod-total, .cod-order-summary, .cod-product-info, .cod-form-headers, .cod-shipping-section\').forEach(function(e){e.style.display=e.classList.contains(\'cod-product-info\')||e.classList.contains(\'cod-total\')?\'flex\':\'\';});" style="cursor: pointer; padding: 16px 32px; background: white; color: #475569; font-size: 1.0625rem; font-weight: 700; border-radius: 12px; border: 2px solid #e2e8f0;" onmouseover="this.style.background=\'#f8fafc\'; this.style.borderColor=\'#cbd5e1\'" onmouseout="this.style.background=\'white\'; this.style.borderColor=\'#e2e8f0\'">Place Another</button>' +
                      '</div>' +
                      '</div>' +
                      '</div>';
                  
                  // Hide ALL form elements so only success popup is visible
                  var toHide = form.querySelectorAll('.cod-dynamic-fields-container, button[type="submit"], .cod-total, .cod-order-summary, .cod-product-info, .cod-form-headers, .cod-shipping-section');
                  toHide.forEach(function(el) { el.style.display = 'none'; });
                  
                  successDiv.style.display = 'flex';
                  successDiv.style.justifyContent = 'center';
                  successDiv.style.alignItems = 'center';
                  successDiv.style.minHeight = '320px';
                  successDiv.style.padding = '24px';
                  successDiv.style.background = 'transparent';
                  successDiv.style.border = 'none';
                  
                  // Close modal after 3.5 seconds and reset
                  setTimeout(function() {
                      closeModal(productId);
                      form.reset();
                      form.querySelectorAll('.cod-dynamic-fields-container, button[type="submit"], .cod-total, .cod-order-summary, .cod-product-info, .cod-form-headers, .cod-shipping-section').forEach(function(el) {
                          el.style.display = el.classList.contains('cod-product-info') || el.classList.contains('cod-total') ? 'flex' : '';
                      });
                      successDiv.style.display = 'none';
                      successDiv.style.justifyContent = '';
                      successDiv.style.alignItems = '';
                      successDiv.style.minHeight = '';
                      successDiv.style.padding = '';
                      successDiv.style.background = '';
                  }, 3500);
              } else {
                  console.error('[COD Form] Success message elements not found');
                  closeModal(productId);
              }
          } else {
              throw new Error(result.error || result.message || 'Order failed');
          }
      })
      .catch(err => {
          console.error('[COD Form] Error:', err);
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          
          var errDiv = form.parentElement.querySelector('.cod-message-error');
          if (errDiv) {
              var errText = errDiv.querySelector('.cod-message-text');
              if (errText) {
                  errText.textContent = err.message || 'Something went wrong. Please try again.';
              }
              errDiv.style.display = 'block';
              
              // Hide error after 5 seconds
              setTimeout(() => {
                  errDiv.style.display = 'none';
              }, 5000);
          }
      });
  }

})();
