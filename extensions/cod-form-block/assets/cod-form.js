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
        shippingOptions: safeJSONParse(dataContainer.dataset.shippingOptions, {}),
        
        // Legacy/Direct props
        modalStyle: dataContainer.dataset.modalStyle || 'modern',
        animStyle: dataContainer.dataset.animStyle || 'fade',
        borderRadius: parseInt(dataContainer.dataset.borderRadius) || 12,
        showImage: dataContainer.dataset.showImage === 'true',
        showPrice: dataContainer.dataset.showPrice === 'true',
        formTitle: dataContainer.dataset.formTitle,
        formSubtitle: dataContainer.dataset.formSubtitle
      };

      console.log('[COD Form] Initialized for product:', productId, config);
      
      // Initialize form immediately
      initializeProduct(productId, config);
    });
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
        
        // Calculate Button Styles
        var btnStyles = config.buttonStyles || {};
        var baseStyles = {
          width: '100%',
          padding: config.buttonStyles.buttonSize === 'small' ? '10px' : config.buttonStyles.buttonSize === 'large' ? '16px' : '14px',
          borderRadius: (btnStyles.borderRadius || config.borderRadius) + 'px',
          fontWeight: 600,
          fontSize: config.buttonStyles.buttonSize === 'small' ? '13px' : config.buttonStyles.buttonSize === 'large' ? '16px' : '14px',
          border: btnStyles.borderWidth ? btnStyles.borderWidth + 'px solid ' + (btnStyles.borderColor || config.primaryColor) : 'none',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          textAlign: 'center',
          display: 'block',
          boxSizing: 'border-box',
          color: btnStyles.textColor || '#ffffff',
          backgroundColor: btnStyles.backgroundColor || config.primaryColor,
          boxShadow: btnStyles.shadow ? '0 4px 6px rgba(0,0,0,0.1)' : 'none'
        };

        // Apply styles to string
        var styleString = Object.keys(baseStyles).map(function(key) {
           // specific overrides for gradient
           return key.replace(/([A-Z])/g, '-$1').toLowerCase() + ':' + baseStyles[key];
        }).join(';');

        // Create COD button
        var codBtn = document.createElement('button');
        codBtn.type = 'button';
        codBtn.className = 'cod-buy-btn';
        codBtn.textContent = config.buttonText;
        codBtn.style.cssText = styleString;
        codBtn.dataset.codOpen = productId;

        // Hover effects
        codBtn.addEventListener('mouseenter', function() {
          this.style.opacity = '0.9';
          this.style.transform = 'translateY(-1px)';
        });
        codBtn.addEventListener('mouseleave', function() {
          this.style.opacity = '1';
          this.style.transform = 'translateY(0)';
        });

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
   * Initialize form functionality and render fields
   */
  function initForm(productId, config) {
    var container = document.getElementById('cod-form-' + productId);
    var form = document.getElementById('cod-order-form-' + productId);
    var fieldsContainer = form.querySelector('.cod-dynamic-fields-container');
    
    if (!form || !container || !fieldsContainer) return;

    // 1. Render Fields
    renderFields(fieldsContainer, config);

    // 2. Render Rate Card (Order Summary) if enabled
    if (config.blocks && config.blocks.order_summary) {
        renderRateCard(form, config);
    }

    // 3. Render Shipping Options if enabled
    if (config.blocks && config.blocks.shipping_options && config.shippingOptions && config.shippingOptions.enabled) {
        renderShippingOptions(form, config);
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
    
    // Ensure styles object exists with defaults
    var styles = config.styles || {};
    var textColor = styles.textColor || '#374151';
    var labelAlignment = styles.labelAlignment || 'left';
    var borderRadius = styles.borderRadius || 6;
    
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
        wrapper.style.marginBottom = '12px';

        // Label
        var label = document.createElement('label');
        label.style.display = 'block';
        label.style.fontWeight = '600';
        label.style.marginBottom = '6px';
        label.style.fontSize = '14px';
        label.style.color = textColor;
        label.style.textAlign = labelAlignment;
        label.innerHTML = field.label + (field.required ? ' <span style="color:red">*</span>' : '');
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
            iconWrapper.style.color = '#6b7280';
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
        
        // Set default value of 1 for quantity field
        if (field.id === 'quantity' && field.type === 'number') {
            input.value = 1;
            input.min = 1;
            input.max = config.maxQuantity || 10;
        }
        
        // Input Styles with padding for icon on left
        input.style.width = '100%';
        input.style.padding = field.type === 'textarea' ? '10px 12px 10px 40px' : '10px 12px 10px 40px';
        input.style.border = '1px solid #d1d5db';
        input.style.borderRadius = borderRadius + 'px';
        input.style.fontSize = '14px';
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
   * Smart Auto-fill on phone blur
   * Checks LocalStorage first, then API fallback
   */
  function setupAutoFill(form, config) {
    var phoneInput = form.querySelector('input[name="phone"]');
    if (!phoneInput) return;

    phoneInput.addEventListener('blur', function() {
        var phone = this.value.trim();
        if (phone.length < 8) return;

        console.log('[COD Form] Phone entered, fetching customer data from database...');

        // Always fetch from API for cross-browser compatibility
        // Database is the source of truth, not localStorage
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
                } else {
                    console.log('[COD Form] No previous customer data found');
                }
            })
            .catch(function(err) {
                // Silently fail - do not block checkout
                console.warn('[COD Form] Auto-fill API error:', err);
            });
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
      var qty = parseInt(qtyInput ? qtyInput.value : 1);
      var subtotal = config.productPrice * qty;
      var total = subtotal + shippingPrice;
      
      var shipEl = form.querySelector('#cod-summary-shipping');
      var totalEl = form.querySelector('#cod-summary-total');
      var subEl = form.querySelector('#cod-summary-subtotal');
      
      if (shipEl) shipEl.textContent = shippingPrice === 0 ? 'FREE' : formatMoney(shippingPrice);
      if (totalEl) totalEl.textContent = formatMoney(total);
      if (subEl) subEl.textContent = formatMoney(subtotal);
  }

  function formatMoney(amount) {
      return '$' + amount.toFixed(2);
  }

  /**
   * Apply Modal Styles
   */
  function applyModalStyles(container, config) {
     if (config.modalStyle === 'glassmorphism') {
         container.style.background = 'rgba(255, 255, 255, 0.8)';
         container.style.backdropFilter = 'blur(10px)';
         container.style.boxShadow = '0 8px 32px 0 rgba(31, 38, 135, 0.37)';
         container.style.border = '1px solid rgba(255, 255, 255, 0.18)';
     }
     if (config.styles.borderRadius) {
        container.style.borderRadius = config.styles.borderRadius + 'px';
     }
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
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('visible'), 10);
    }
    if (overlay) overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
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
          productTitle: config.productTitle
      };

      console.log('[COD Form] Submitting order:', payload);

      // Send to backend via Shopify App Proxy
      fetch(config.proxyUrl + '/api/orders', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(result => {
          console.log('[COD Form] Order response:', result);
          
          if (result.success) {
              // Save customer data to LocalStorage for future auto-fill
              saveCustomerToLocalStorage(form);
              
              // Show success message with order ID
              var successDiv = form.querySelector('.cod-message-success');
              var successText = successDiv ? successDiv.querySelector('.cod-message-text') : null;
              
              if (successDiv && successText) {
                  // New green card success design
                  successText.innerHTML = 
                      '<div style="width: 480px; max-width: 95vw; font-size: 1rem; line-height: 1.5rem; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif;">' +
                      '<div style="padding: 1.5rem; border-radius: 0.5rem; background-color: rgb(240 253 244);">' +
                      '<div style="display: flex;">' +
                      '<div style="flex-shrink: 0;">' +
                      '<svg style="color: rgb(74 222 128); width: 1.75rem; height: 1.75rem;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">' +
                      '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 0 00-1.414 1.414l2 2a1 0 001.414 0l4-4z" clip-rule="evenodd" />' +
                      '</svg>' +
                      '</div>' +
                      '<div style="margin-left: 0.75rem;">' +
                      '<p style="font-weight: bold; color: rgb(22 101 52); margin: 0 0 0.75rem 0; font-size: 1.125rem;">Order Completed</p>' +
                      '<div style="color: rgb(21 128 61);">' +
                      '<p style="margin: 0 0 0.5rem 0;">' + (config.successMessage || 'Your order has been placed successfully! We will contact you shortly.') + '</p>' +
                      '<p style="margin: 0; font-weight: 600;">Order ID: ' + (result.orderName || result.orderId) + '</p>' +
                      '</div>' +
                      '<div style="display: flex; margin-top: 0.875rem; margin-bottom: -0.375rem; margin-left: -0.5rem; margin-right: -0.5rem; gap: 0.75rem;">' +
                      '<button onclick="window.location.reload()" style="cursor: pointer; padding-top: 0.375rem; padding-bottom: 0.375rem; padding-left: 0.5rem; padding-right: 0.5rem; background-color: #ECFDF5; color: rgb(22 101 52); font-size: 0.875rem; line-height: 1.25rem; font-weight: bold; border-radius: 0.375rem; border: none;" onmouseover="this.style.backgroundColor=\'#D1FAE5\'" onmouseout="this.style.backgroundColor=\'#ECFDF5\'">Continue Shopping</button>' +
                      '<button onclick="document.getElementById(\'cod-form-' + config.productId + '\').querySelector(\'form\').reset(); var successDiv = document.querySelector(\'.cod-message-success\'); if(successDiv) successDiv.style.display = \'none\'; document.querySelectorAll(\'.cod-dynamic-fields-container, button[type=submit], .cod-total, .cod-product-info, .cod-form-headers\').forEach(el => el.style.display = \'\');" style="cursor: pointer; padding-top: 0.375rem; padding-bottom: 0.375rem; padding-left: 0.5rem; padding-right: 0.5rem; background-color: #ECFDF5; color: #065F46; font-size: 0.875rem; line-height: 1.25rem; border-radius: 0.375rem; border: none;">Dismiss</button>' +
                      '</div>' +
                      '</div>' +
                      '</div>' +
                      '</div>' +
                      '</div>';
                  
                  // Hide all form fields completely
                  var fieldsContainer = form.querySelector('.cod-dynamic-fields-container');
                  var submitBtn = form.querySelector('button[type="submit"]');
                  var totalDiv = form.querySelector('.cod-total');
                  var orderSummary = form.querySelector('.cod-order-summary');
                  var productInfo = form.querySelector('.cod-product-info');
                  var formHeaders = form.querySelector('.cod-form-headers');
                  
                  if (fieldsContainer) fieldsContainer.style.display = 'none';
                  if (submitBtn) submitBtn.style.display = 'none';
                  if (totalDiv) totalDiv.style.display = 'none';
                  if (orderSummary) orderSummary.style.display = 'none';
                  if (productInfo) productInfo.style.display = 'none';
                  if (formHeaders) formHeaders.style.display = 'none';
                  
                  // Style success div for perfect centering
                  successDiv.style.display = 'flex';
                  successDiv.style.justifyContent = 'center';
                  successDiv.style.alignItems = 'center';
                  successDiv.style.minHeight = '360px';
                  successDiv.style.padding = '28px';
                  successDiv.style.background = 'transparent';
                  successDiv.style.border = 'none';
                  
                  // Close modal after 3.5 seconds and reset
                  setTimeout(() => {
                      closeModal(productId);
                      // Reset form for next use
                      form.reset();
                      if (fieldsContainer) fieldsContainer.style.display = 'block';
                      if (submitBtn) submitBtn.style.display = 'block';
                      if (totalDiv) totalDiv.style.display = 'flex';
                      if (orderSummary) orderSummary.style.display = 'block';
                      if (productInfo) productInfo.style.display = 'flex';
                      if (formHeaders) formHeaders.style.display = 'block';
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
