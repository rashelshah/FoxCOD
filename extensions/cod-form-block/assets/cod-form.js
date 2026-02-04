/**
 * COD Form JavaScript Handler
 * Replaces Buy buttons with COD buttons and handles form submission
 * Uses Shopify App Proxy for stable API URLs
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
      
      // Get configuration from data container
      var config = {
        productId: productId,
        variantId: dataContainer.dataset.variantId,
        productTitle: dataContainer.dataset.productTitle,
        productPrice: parseFloat(dataContainer.dataset.productPrice),
        shop: shop,
        // Use App Proxy URL - this is a store-relative path that never changes!
        proxyUrl: '/apps/fox-cod',
        maxQuantity: parseInt(dataContainer.dataset.maxQuantity) || 10,
        requireName: dataContainer.dataset.requireName === 'true',
        requirePhone: dataContainer.dataset.requirePhone === 'true',
        requireAddress: dataContainer.dataset.requireAddress === 'true',
        buttonText: dataContainer.dataset.buttonText || 'Buy with COD',
        primaryColor: dataContainer.dataset.primaryColor || '#667eea',
        submitText: dataContainer.dataset.submitText || 'Place Order (COD)'
      };

      console.log('[COD Form] Initialized for product:', productId, 'using proxy:', config.proxyUrl);
      
      // Initialize form immediately - no need to fetch config!
      initializeProduct(productId, config);
    });
  }

  /**
   * Initialize a specific product
   */
  function initializeProduct(productId, config) {
    // Replace buy buttons with COD button
    replaceBuyButtons(productId, config);

    // Initialize the form
    initForm(productId, config);
  }

  /**
   * Try to find app URL from script tags
   */
  function findAppUrlFromScripts() {
    var scripts = document.querySelectorAll('script[src*="cod-form"]');
    // The script is loaded from Shopify CDN, not our app, so this won't work
    return null;
  }

  /**
   * Get script origin (won't work for CDN scripts)
   */
  function getScriptOrigin() {
    return null;
  }

  /**
   * Initialize a specific product
   */
  function initializeProduct(productId, config) {
    // Replace buy buttons with COD button
    replaceBuyButtons(productId, config);

    // Initialize the form
    initForm(productId, config);
  }

  /**
   * Find and replace the Buy Now / Add to Cart buttons with COD button
   */
  function replaceBuyButtons(productId, config) {
    // Common selectors for Buy/Add to Cart buttons
    var buttonSelectors = [
      // Add to Cart buttons
      'form[action*="/cart/add"] button[name="add"]',
      '.product-form__submit',
      'button.product-form__cart-submit',
      '#AddToCart',
      '[data-add-to-cart]',
      // Buy Now / Dynamic checkout buttons
      '.shopify-payment-button button',
      '.shopify-payment-button__button',
      '[data-shopify="payment-button"] button',
      // Generic submit buttons in product forms
      '.product-form button[type="submit"]',
      '.product-form__buttons button',
      // Dawn theme
      '.product-form__submit-button',
      'product-form button[type="submit"]'
    ];

    var buttonsFound = false;

    buttonSelectors.forEach(function(selector) {
      var buttons = document.querySelectorAll(selector);
      buttons.forEach(function(btn) {
        // Skip if already processed
        if (btn.dataset.codReplaced || btn.classList.contains('cod-buy-btn')) return;
        
        buttonsFound = true;
        
        // Create COD button
        var codBtn = document.createElement('button');
        codBtn.type = 'button';
        codBtn.className = 'cod-buy-btn';
        codBtn.textContent = config.buttonText;
        codBtn.style.cssText = 'background-color:' + config.primaryColor + ';color:#fff;width:100%;padding:14px 20px;border:none;border-radius:6px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.2s ease;text-align:center;display:block;box-sizing:border-box;';
        codBtn.dataset.codOpen = productId;

        // Add hover effects
        codBtn.addEventListener('mouseenter', function() {
          this.style.opacity = '0.9';
          this.style.transform = 'translateY(-1px)';
        });
        codBtn.addEventListener('mouseleave', function() {
          this.style.opacity = '1';
          this.style.transform = 'translateY(0)';
        });

        // Add click handler
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

    // Also hide Shopify payment buttons container
    var paymentContainers = document.querySelectorAll('.shopify-payment-button, [data-shopify="payment-button"]');
    paymentContainers.forEach(function(container) {
      container.style.display = 'none';
    });

    if (!buttonsFound) {
      console.log('[COD Form] No buy buttons found to replace for product ' + productId);
    }
  }

  /**
   * Initialize form functionality
   */
  function initForm(productId, config) {
    var container = document.getElementById('cod-form-' + productId);
    var form = document.getElementById('cod-order-form-' + productId);
    
    if (!form || !container) return;

    // Setup modal close buttons
    var closeButtons = document.querySelectorAll('[data-cod-close="' + productId + '"]');
    closeButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        closeModal(productId);
      });
    });

    // Close on overlay click
    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          closeModal(productId);
        }
      });
    }

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var openOverlay = document.querySelector('.cod-modal-overlay[style*="flex"]');
        if (openOverlay) {
          closeModal(productId);
        }
      }
    });

    // Setup quantity controls
    setupQuantityControls(container, config);

    // Setup form submission
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      handleSubmit(form, container, config);
    });
  }

  /**
   * Open modal
   */
  function openModal(productId) {
    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    var container = document.getElementById('cod-form-' + productId);
    
    if (overlay && container) {
      overlay.style.display = 'flex';
      container.style.display = 'block';
      document.body.classList.add('cod-modal-open');
      
      // Focus first input
      setTimeout(function() {
        var firstInput = container.querySelector('input[type="text"]');
        if (firstInput) firstInput.focus();
      }, 100);
    }
  }

  /**
   * Close modal
   */
  function closeModal(productId) {
    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    var container = document.getElementById('cod-form-' + productId);
    
    if (overlay && container) {
      overlay.style.display = 'none';
      container.style.display = 'none';
      document.body.classList.remove('cod-modal-open');
    }
  }

  /**
   * Setup quantity increment/decrement buttons
   */
  function setupQuantityControls(container, config) {
    var minusBtn = container.querySelector('.cod-qty-minus');
    var plusBtn = container.querySelector('.cod-qty-plus');
    var quantityInput = container.querySelector('input[name="quantity"]');
    var totalPriceEl = container.querySelector('.cod-total-price');

    if (!quantityInput) return;

    // Update total price display
    function updateTotal() {
      var qty = parseInt(quantityInput.value) || 1;
      var total = config.productPrice * qty;
      
      if (totalPriceEl) {
        totalPriceEl.textContent = formatCurrency(total);
      }
    }

    // Minus button
    if (minusBtn) {
      minusBtn.addEventListener('click', function() {
        var current = parseInt(quantityInput.value) || 1;
        if (current > 1) {
          quantityInput.value = current - 1;
          updateTotal();
        }
      });
    }

    // Plus button
    if (plusBtn) {
      plusBtn.addEventListener('click', function() {
        var current = parseInt(quantityInput.value) || 1;
        if (current < config.maxQuantity) {
          quantityInput.value = current + 1;
          updateTotal();
        }
      });
    }

    // Direct input change
    quantityInput.addEventListener('change', function() {
      var value = parseInt(this.value) || 1;
      value = Math.max(1, Math.min(config.maxQuantity, value));
      this.value = value;
      updateTotal();
    });

    // Initial total
    updateTotal();
  }

  /**
   * Handle form submission
   */
  function handleSubmit(form, container, config) {
    var submitBtn = form.querySelector('.cod-submit-btn');
    var successMsg = container.querySelector('.cod-message-success');
    var errorMsg = container.querySelector('.cod-message-error');

    // Get form data
    var formData = new FormData(form);
    var data = {
      shop: config.shop,
      customerName: formData.get('customerName') || '',
      customerPhone: formData.get('customerPhone') || '',
      customerAddress: formData.get('customerAddress') || '',
      customerEmail: formData.get('email') || '',
      customerNotes: formData.get('notes') || '',
      productId: config.productId,
      variantId: config.variantId,
      quantity: parseInt(formData.get('quantity')) || 1,
      price: config.productPrice,
      productTitle: config.productTitle,
    };

    // Validate
    var validationError = validateForm(data, config);
    if (validationError) {
      showError(errorMsg, validationError);
      return;
    }

    // Show loading state
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    hideMessages(successMsg, errorMsg);

    // Use App Proxy URL - this goes through the store's domain!
    // Example: /apps/fox-cod/create-order
    var apiUrl = config.proxyUrl + '/create-order';

    console.log('[COD Form] Submitting order via proxy:', apiUrl);

    // Make API call via App Proxy
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    .then(function(response) {
      if (!response.ok) {
        return response.text().then(function(text) {
          try {
            var errData = JSON.parse(text);
            throw new Error(errData.error || 'Server error: ' + response.status);
          } catch (e) {
            throw new Error('Server error: ' + response.status);
          }
        });
      }
      return response.json();
    })
    .then(function(result) {
      console.log('[COD Form] Response:', result);
      
      if (result.success) {
        // Show success popup with order ID
        showOrderSuccessPopup(result.orderName || result.orderId, config);
        
        // Reset form completely
        form.reset();
        
        // Reset quantity input
        var qtyInput = form.querySelector('input[name="quantity"]');
        if (qtyInput) qtyInput.value = '1';
        
        // Update total
        var totalEl = container.querySelector('.cod-total-price');
        if (totalEl) totalEl.textContent = formatCurrency(config.productPrice);

        // Close the form modal after showing popup
        setTimeout(function() {
          closeModal(config.productId);
          hideMessages(successMsg, errorMsg);
        }, 500);
      } else {
        showError(errorMsg, result.error || 'Failed to place order. Please try again.');
      }
    })
    .catch(function(err) {
      console.error('[COD Form] Error:', err);
      var message = err.message || 'Unable to connect to the server. Please try again.';
      
      // Handle common fetch errors and check for stale app URL
      if (message.includes('Failed to fetch') || message.includes('Load failed') || message.includes('NetworkError')) {
        console.warn('[COD Form] Network error detected. Current App URL:', config.appUrl);
        message = 'Network error. The app connection might be outdated. Please ask the store owner to go to the Fox COD App Dashboard and click "Save Settings" to refresh the connection.';
      }
      showError(errorMsg, message);
    })
    .finally(function() {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    });
  }

  /**
   * Validate form data
   */
  function validateForm(data, config) {
    if (config.requireName && (!data.customerName || !data.customerName.trim())) {
      return 'Please enter your name';
    }
    if (config.requirePhone && (!data.customerPhone || !data.customerPhone.trim())) {
      return 'Please enter your phone number';
    }
    if (config.requireAddress && (!data.customerAddress || !data.customerAddress.trim())) {
      return 'Please enter your delivery address';
    }
    
    // Validate phone format (relaxed)
    if (data.customerPhone && data.customerPhone.trim() && !/^[\d\s\+\-\(\)]{8,15}$/.test(data.customerPhone.trim())) {
      return 'Please enter a valid phone number (8-15 digits)';
    }

    // Validate quantity
    if (data.quantity < 1 || data.quantity > config.maxQuantity) {
      return 'Quantity must be between 1 and ' + config.maxQuantity;
    }

    return null;
  }

  /**
   * Show success message
   */
  function showSuccess(el, message) {
    if (!el) return;
    var textEl = el.querySelector('.cod-message-text');
    if (textEl) textEl.textContent = message;
    el.style.display = 'flex';
  }

  /**
   * Show error message
   */
  function showError(el, message) {
    if (!el) return;
    var textEl = el.querySelector('.cod-message-text');
    if (textEl) textEl.textContent = message;
    el.style.display = 'flex';
  }

  /**
   * Hide all messages
   */
  function hideMessages(successEl, errorEl) {
    if (successEl) successEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';
  }

  /**
   * Show success popup with order ID
   */
  function showOrderSuccessPopup(orderName, config) {
    // Remove any existing popup
    var existingPopup = document.getElementById('cod-success-popup');
    if (existingPopup) existingPopup.remove();

    // Create popup overlay
    var popupOverlay = document.createElement('div');
    popupOverlay.id = 'cod-success-popup';
    popupOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;animation:codFadeIn 0.3s ease;backdrop-filter:blur(4px);';

    // Create popup content
    var popupContent = document.createElement('div');
    popupContent.style.cssText = 'background:white;border-radius:20px;padding:40px 50px;text-align:center;max-width:400px;margin:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:codSlideUp 0.4s ease;';

    // Success icon
    var successIcon = document.createElement('div');
    successIcon.style.cssText = 'width:80px;height:80px;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:40px;animation:codPulse 0.6s ease;';
    successIcon.innerHTML = '✓';
    successIcon.style.color = 'white';

    // Title
    var title = document.createElement('h2');
    title.style.cssText = 'font-size:24px;font-weight:700;color:#111;margin:0 0 8px 0;';
    title.textContent = 'Order Placed Successfully!';

    // Order ID box
    var orderIdBox = document.createElement('div');
    orderIdBox.style.cssText = 'background:linear-gradient(135deg,' + config.primaryColor + ',#8b5cf6);color:white;padding:16px 32px;border-radius:12px;margin:20px 0;display:inline-block;';
    
    var orderLabel = document.createElement('div');
    orderLabel.style.cssText = 'font-size:12px;opacity:0.9;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;';
    orderLabel.textContent = 'Your Order ID';
    
    var orderId = document.createElement('div');
    orderId.style.cssText = 'font-size:28px;font-weight:800;letter-spacing:1px;';
    orderId.textContent = orderName;

    orderIdBox.appendChild(orderLabel);
    orderIdBox.appendChild(orderId);

    // Message
    var message = document.createElement('p');
    message.style.cssText = 'color:#6b7280;font-size:15px;margin:16px 0 0 0;line-height:1.6;';
    message.textContent = 'We will contact you shortly to confirm your order. Thank you for shopping with us!';

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:#f3f4f6;color:#374151;border:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;margin-top:24px;transition:all 0.2s ease;';
    closeBtn.textContent = 'Close';
    closeBtn.onmouseover = function() { this.style.background = '#e5e7eb'; };
    closeBtn.onmouseout = function() { this.style.background = '#f3f4f6'; };
    closeBtn.onclick = function() { popupOverlay.remove(); };

    // Assemble popup
    popupContent.appendChild(successIcon);
    popupContent.appendChild(title);
    popupContent.appendChild(orderIdBox);
    popupContent.appendChild(message);
    popupContent.appendChild(closeBtn);
    popupOverlay.appendChild(popupContent);

    // Add animations CSS if not already added
    if (!document.getElementById('cod-popup-styles')) {
      var styles = document.createElement('style');
      styles.id = 'cod-popup-styles';
      styles.textContent = '@keyframes codFadeIn{from{opacity:0}to{opacity:1}}@keyframes codSlideUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}@keyframes codPulse{0%{transform:scale(0)}50%{transform:scale(1.1)}100%{transform:scale(1)}}';
      document.head.appendChild(styles);
    }

    // Add to page
    document.body.appendChild(popupOverlay);

    // Auto-close after 5 seconds
    setTimeout(function() {
      if (popupOverlay.parentNode) {
        popupOverlay.style.animation = 'codFadeIn 0.3s ease reverse';
        setTimeout(function() { popupOverlay.remove(); }, 300);
      }
    }, 5000);

    // Close on overlay click
    popupOverlay.addEventListener('click', function(e) {
      if (e.target === popupOverlay) {
        popupOverlay.remove();
      }
    });
  }

  /**
   * Format currency (Indian Rupees)
   */
  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }

})();
