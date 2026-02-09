/**
 * COD Form JavaScript Handler
 * Replaces Buy buttons with COD buttons and handles form submission
 * Uses Shopify App Proxy for stable API URLs
 * Supports dynamic fields, custom styles, and advanced configuration
 */

(function() {
  'use strict';

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
        
        // Quantity Offers Configuration
        quantityOffers: safeJSONParse(dataContainer.dataset.quantityOffers, [])
      };

      // Debug: Log quantity offers data
      console.log('[COD Form] Quantity Offers raw:', dataContainer.dataset.quantityOffers ? dataContainer.dataset.quantityOffers.substring(0, 200) + '...' : 'EMPTY');
      console.log('[COD Form] Quantity Offers parsed:', config.quantityOffers);

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
        
        // Calculate Button Styles - prefer explicit data attrs for text color, border (synced from Liquid)
        var btnStyles = config.buttonStyles || {};
        var textColor = config.buttonTextColor || btnStyles.textColor || '#ffffff';
        var borderColor = config.buttonBorderColor || btnStyles.borderColor || config.primaryColor;
        var borderWidth = config.buttonBorderWidth != null && !isNaN(config.buttonBorderWidth) ? config.buttonBorderWidth : (btnStyles.borderWidth ?? 0);
        
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
        var finalBgColor = btnStyles.backgroundColor || config.primaryColor;
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
          openModal(productId);
        });

        // Insert COD button BEFORE the original button, then hide original
        btn.parentNode.insertBefore(codBtn, btn);
        btn.style.display = 'none';
        btn.dataset.codReplaced = 'true';
        
        // Create sticky button clone for mobile (separate button)
        if (config.stickyOnMobile && window.innerWidth <= 600) {
          var stickyBtn = codBtn.cloneNode(true);
          stickyBtn.classList.add('sticky-mobile');
          stickyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openModal(productId);
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
   * Render Quantity Offers (Bundle/Volume Discounts)
   */
  function renderQuantityOffers(container, config) {
    var offers = config.quantityOffers || [];
    
    console.log('[COD Form] renderQuantityOffers called with', offers.length, 'offer groups');
    console.log('[COD Form] Current product ID:', config.productId, 'type:', typeof config.productId);
    
    // Check if current product has offers
    if (!offers.length) {
      console.log('[COD Form] No quantity offers available');
      return null;
    }
    
    // Find offers applicable to this product
    var applicableGroup = null;
    var currentProductId = String(config.productId); // Convert to string for comparison
    
    for (var i = 0; i < offers.length; i++) {
      var group = offers[i];
      // Handle both snake_case (from DB) and camelCase (from JS)
      var productIds = group.product_ids || group.productIds || [];
      // Convert all product IDs to strings for comparison
      var productIdStrings = productIds.map(function(id) { return String(id); });
      
      console.log('[COD Form] Checking group:', group.name, 'active:', group.active, 'productIds:', productIdStrings);
      
      if (group.active && productIdStrings.length > 0 && productIdStrings.includes(currentProductId)) {
        console.log('[COD Form] Found matching group:', group.name);
        applicableGroup = group;
        break;
      }
    }

    
    if (!applicableGroup || !applicableGroup.offers || !applicableGroup.offers.length) {
      console.log('[COD Form] No applicable group found for product:', currentProductId);
      return null;
    }
    
    var design = applicableGroup.design || {};
    var template = design.template || 'modern';
    
    // Create offers container
    var offersContainer = document.createElement('div');
    offersContainer.className = 'cod-quantity-offers' + (template === 'vertical' ? ' vertical' : '');
    offersContainer.setAttribute('data-product-id', config.productId);
    
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
      
      // Apply design styles
      if (idx === selectedIndex) {
        card.style.background = design.selectedBgColor || 'rgba(99,102,241,0.08)';
        card.style.borderColor = design.selectedBorderColor || config.primaryColor;
        card.style.color = design.selectedTextColor || '#1f2937';
      } else {
        card.style.background = design.unselectedBgColor || '#ffffff';
        card.style.borderColor = design.unselectedBorderColor || '#e5e7eb';
      }
      card.style.borderRadius = (design.selectedBorderRadius || 10) + 'px';
      
      // Badge (label)
      if (offer.label && (design.showMostPopularBadge !== false || offer.label !== 'Most Popular')) {
        var badge = document.createElement('div');
        badge.className = 'cod-offer-badge';
        badge.style.background = design.selectedTagBgColor || config.primaryColor;
        badge.style.color = design.selectedTagTextColor || '#ffffff';
        badge.textContent = offer.label;
        card.appendChild(badge);
      }
      
      // Quantity text
      var qtyDiv = document.createElement('div');
      qtyDiv.className = 'cod-offer-quantity';
      qtyDiv.textContent = offer.quantity + (offer.quantity === 1 ? ' Unit' : ' Units');
      card.appendChild(qtyDiv);
      
      // Discount text
      if (offer.discountPercent) {
        var discountDiv = document.createElement('div');
        discountDiv.className = 'cod-offer-discount';
        discountDiv.textContent = 'Save ' + offer.discountPercent + '%';
        card.appendChild(discountDiv);
      }
      
      // Price calculation
      var unitPrice = config.productPrice;
      var discountedPrice = unitPrice * offer.quantity * (1 - (offer.discountPercent || 0) / 100);
      var originalPrice = unitPrice * offer.quantity;
      
      var priceDiv = document.createElement('div');
      priceDiv.className = 'cod-offer-price';
      priceDiv.textContent = (design.currencySymbol || '₹') + discountedPrice.toFixed(0);
      if (offer.discountPercent) {
        priceDiv.innerHTML += '<span class="cod-offer-original-price">' + 
          (design.currencySymbol || '₹') + originalPrice.toFixed(0) + '</span>';
      }
      card.appendChild(priceDiv);
      
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
          // Trigger change event for price update
          qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Store selected offer for price calculation
        offersContainer.setAttribute('data-selected-offer', JSON.stringify({
          quantity: offer.quantity,
          discountPercent: offer.discountPercent || 0
        }));
        
        // Update price display
        updateOfferPrice(form, config, offer);
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
   * Update price display based on selected offer
   */
  function updateOfferPrice(form, config, offer) {
    var priceElement = form.querySelector('.cod-product-price');
    if (!priceElement) return;
    
    var unitPrice = config.productPrice;
    var total = unitPrice * offer.quantity * (1 - (offer.discountPercent || 0) / 100);
    
    priceElement.innerHTML = '₹' + total.toFixed(0);
    if (offer.discountPercent) {
      priceElement.innerHTML += ' <span style="text-decoration:line-through;color:#9ca3af;font-size:14px;">₹' + 
        (unitPrice * offer.quantity).toFixed(0) + '</span>';
    }
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
    var quantityOffersEl = renderQuantityOffers(container, config);
    if (quantityOffersEl) {
        // Insert before the dynamic fields
        fieldsContainer.parentNode.insertBefore(quantityOffersEl, fieldsContainer);
    }

    // 2. Render Rate Card (Order Summary) if enabled
    if (config.blocks && config.blocks.order_summary) {
        renderRateCard(form, config);
    }

    // 3. Render Shipping Options if enabled
    if (config.blocks && config.blocks.shipping_options && config.shippingOptions && config.shippingOptions.enabled) {
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
    
    // 5. Apply Modal Styles
    applyModalStyles(container, config);

    // Setup modal events
    setupModalEvents(productId);
    
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
        input.style.fontSize = textSize + 'px';
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

      // Start with base price - handle undefined/null
      var subtotal = parseFloat(config.productPrice) || 0;
      
      // Calculate Shipping
      var shippingCost = 0;
      if (config.shippingOptions && config.shippingOptions.enabled) {
          // Find default
          var defaultOpt = config.shippingOptions.options.find(o => o.id === config.shippingOptions.defaultOption);
          if (defaultOpt) shippingCost = parseFloat(defaultOpt.price) || 0;
      }

      var total = subtotal + shippingCost;

      card.innerHTML = `
        <div style="font-weight:600; margin-bottom:8px; display:flex; align-items:center;">
           🧾 Order Summary
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">
           <span>Subtotal</span>
           <span id="cod-summary-subtotal">${formatMoney(subtotal)}</span>
        </div>
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
      var qtyInput = form.querySelector('[name="quantity"]');
      var qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
      var productPrice = parseFloat(config.productPrice) || 0;
      var shipping = parseFloat(shippingPrice) || 0;
      var subtotal = productPrice * qty;
      var total = subtotal + shipping;
      
      var shipEl = form.querySelector('#cod-summary-shipping');
      var totalEl = form.querySelector('#cod-summary-total');
      var subEl = form.querySelector('#cod-summary-subtotal');
      
      if (shipEl) shipEl.textContent = shipping === 0 ? 'FREE' : formatMoney(shipping);
      if (totalEl) totalEl.textContent = formatMoney(total);
      if (subEl) subEl.textContent = formatMoney(subtotal);
  }

  function formatMoney(amount) {
      var num = parseFloat(amount) || 0;
      return '₹' + num.toFixed(2);
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
  function setupModalEvents(productId) {
    var closeButtons = document.querySelectorAll('[data-cod-close="' + productId + '"]');
    closeButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        closeModal(productId);
      });
    });

    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) closeModal(productId);
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal(productId);
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

  function openModal(productId) {
    var modal = document.getElementById('cod-form-' + productId);
    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    var form = document.getElementById('cod-order-form-' + productId);
    
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('visible'), 10);
    }
    if (overlay) overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    // Clear form on open so fields are empty on every modal open / page refresh
    if (form) form.reset();
  }

  function closeModal(productId) {
    var modal = document.getElementById('cod-form-' + productId);
    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 300);
    }
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
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
          shippingPrice: 0
      };
      
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

      console.log('[COD Form] Submitting order:', payload, 'Payment method:', selectedPaymentMethod);

      // Route based on payment method
      if (isPartialCod && config.partialCodEnabled) {
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
