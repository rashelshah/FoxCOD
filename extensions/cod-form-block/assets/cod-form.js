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
   * Render dynamic fields
   */
  function renderFields(container, config) {
    container.innerHTML = '';
    
    // Sort fields by order
    var sortedFields = config.fields.sort((a, b) => a.order - b.order);

    sortedFields.forEach(function(field) {
        if (!field.visible) return;

        var wrapper = document.createElement('div');
        wrapper.className = 'cod-form-field';
        wrapper.style.marginBottom = '12px';

        // Label
        var label = document.createElement('label');
        label.style.display = 'block';
        label.style.fontWeight = '600';
        label.style.marginBottom = '6px';
        label.style.fontSize = '14px';
        label.style.color = config.styles.textColor || '#374151';
        label.style.textAlign = config.styles.labelAlignment || 'left';
        label.innerHTML = field.label + (field.required ? ' <span style="color:red">*</span>' : '');
        wrapper.appendChild(label);

        // Input
        var input;
        
        if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = field.id === 'address' ? 3 : 2;
        } else if (field.type === 'dropdown') {
            input = document.createElement('select');
            // Add options logic if custom fields have options
            if (field.options) {
                field.options.forEach(opt => {
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
        
        // Input Styles
        input.style.width = '100%';
        input.style.padding = '10px 12px';
        input.style.border = '1px solid #d1d5db';
        input.style.borderRadius = (config.styles.borderRadius || 6) + 'px';
        input.style.fontSize = '14px';
        input.style.boxSizing = 'border-box';
        input.style.marginBottom = '4px';

        wrapper.appendChild(input);
        container.appendChild(wrapper);
    });
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

        // Check LocalStorage first
        try {
            var cached = JSON.parse(localStorage.getItem('cod_customer') || '{}');
            if (cached.phone === phone) {
                autoFillFields(form, cached);
                console.log('[COD Form] Auto-filled from LocalStorage');
                return;
            }
        } catch (e) {
            console.warn('[COD Form] LocalStorage read error:', e);
        }

        // Fetch from API
        fetch(config.proxyUrl + '/api/customer-by-phone?phone=' + encodeURIComponent(phone) + '&shop=' + encodeURIComponent(config.shop))
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.found) {
                    autoFillFields(form, { name: data.name, address: data.address, email: data.email });
                    console.log('[COD Form] Auto-filled from API');
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
        
        localStorage.setItem('cod_customer', JSON.stringify({
            phone: phone ? phone.value : '',
            name: name ? name.value : '',
            address: address ? address.value : '',
            email: email ? email.value : ''
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
      return currency_symbol + amount.toFixed(2);
  }
  var currency_symbol = '₹'; // Default fallback, could try to detect from page

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
              var successDiv = form.parentElement.querySelector('.cod-message-success');
              var successText = successDiv.querySelector('.cod-message-text');
              
              if (successText) {
                  successText.innerHTML = 
                      '<div style="text-align: center;">' +
                      '<div style="font-size: 48px; margin-bottom: 12px;">✅</div>' +
                      '<strong style="font-size: 18px; color: #10b981;">Order Placed Successfully!</strong><br><br>' +
                      '<div style="background: #f0fdf4; padding: 12px; border-radius: 8px; margin: 16px 0;">' +
                      '<div style="font-size: 13px; color: #6b7280; margin-bottom: 4px;">Order ID</div>' +
                      '<div style="font-size: 20px; font-weight: 700; color: #059669;">' + (result.orderName || result.orderId) + '</div>' +
                      '</div>' +
                      '<p style="color: #6b7280; font-size: 14px; margin-top: 12px;">' + (result.message || 'Thank you for your order!') + '</p>' +
                      '</div>';
              }
              
              form.style.display = 'none';
              successDiv.style.display = 'block';
              
              // Close modal after 3.5 seconds
              setTimeout(() => {
                  closeModal(productId);
                  // Reset form for next use
                  form.reset();
                  form.style.display = 'block';
                  successDiv.style.display = 'none';
              }, 3500);
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
