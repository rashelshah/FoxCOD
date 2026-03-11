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

  /**
   * Initialize all COD forms on the page
   */
  function initCODForms() {
    // Inject form validation CSS once
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
          { id: 'address', label: 'Address', type: 'textarea', visible: true, required: true, order: 3 }
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
        upsellOffers: (window.FoxCod && window.FoxCod.upsellOffers) || safeJSONParse(dataContainer.dataset.upsellOffers, { tick_upsells: [], click_upsells: [], downsells: [] }),
        appUrl: dataContainer.dataset.appUrl || ''
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
        
        // Determine if transform-based animations are active
        var hasTransformAnim = config.animationPreset && config.animationPreset !== 'none' && config.animationPreset !== 'glow' && config.animationPreset !== 'gradient-flow';
        
        var baseStyles = {
          width: '100%',
          padding: (config.buttonStyles && config.buttonStyles.buttonSize === 'small') ? '10px' : (config.buttonStyles && config.buttonStyles.buttonSize === 'large') ? '16px' : '14px',
          borderRadius: (btnStyles.borderRadius ?? config.borderRadius) + 'px',
          fontWeight: btnStyles.fontStyle === 'bold' ? 700 : 400,
          fontStyle: btnStyles.fontStyle === 'italic' ? 'italic' : 'normal',
          fontSize: (btnStyles.textSize ?? 15) + 'px',
          border: borderWidth + 'px solid ' + (isOutlineStyle ? config.primaryColor : borderColor),
          cursor: 'pointer',
          transition: hasTransformAnim ? 'opacity 0.2s ease, background-color 0.2s ease' : 'all 0.2s ease',
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

        // Inject marching-ants SVG if dashed-moving border effect is active
        if (config.borderEffect === 'dashed-moving') {
            codBtn.style.position = 'relative';
            var svgNS = 'http://www.w3.org/2000/svg';
            var svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('class', 'marching-ants-svg');
            svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
            svg.setAttribute('preserveAspectRatio', 'none');
            var rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', '1'); rect.setAttribute('y', '1');
            // SVG attributes don't support calc(), use style for percentage sizing
            rect.style.width = 'calc(100% - 2px)';
            rect.style.height = 'calc(100% - 2px)';
            var radius = config.borderRadius || 12;
            rect.setAttribute('rx', String(radius)); rect.setAttribute('ry', String(radius));
            svg.appendChild(rect);
            codBtn.appendChild(svg);
        }

        // Only apply default hover if no custom effects defined
        var hasCustomHover = config.hoverLift;
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
              
              // Auto-render variant selectors for preselected bundle offer on product page
              if (defaultOffer.quantity > 1) {
                renderBundleVariantSelectors(null, config, defaultOffer.quantity, offersResult.element);
              }
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
                
                // Render variant selectors on the product page
                renderBundleVariantSelectors(null, config, offer.quantity, offersResult.element);
                
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
          // Store reference to original button so closeModal can check its position
          stickyBtn._originalCodBtn = codBtn;
          stickyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openModal(productId, config);
          });
          
          // Append to body
          document.body.appendChild(stickyBtn);
          
          // Helper: check if original button is visible and toggle sticky
          function updateStickyVisibility() {
            // Don't update if hidden by modal
            if (stickyBtn.getAttribute('data-hidden-by-modal') === 'true') return;
            var rect = codBtn.getBoundingClientRect();
            var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            if (rect.bottom < 0) {
              // Original button is above viewport (user scrolled past it) - show sticky
              stickyBtn.classList.add('visible');
            } else if (rect.top < viewportHeight && rect.bottom > 0) {
              // Original button is visible in viewport - hide sticky
              stickyBtn.classList.remove('visible');
            } else {
              // Original button is below viewport (hasn't reached it yet) - hide sticky
              stickyBtn.classList.remove('visible');
            }
          }
          
          // Use scroll listener for reliable visibility checks
          window.addEventListener('scroll', updateStickyVisibility, { passive: true });
          // Also store the update function on the sticky btn for closeModal to call
          stickyBtn._updateVisibility = updateStickyVisibility;
          // Initial check
          updateStickyVisibility();
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
    offersContainer.style.overflow = 'visible';
    if (template === 'cards') {
      offersContainer.style.flexDirection = 'row';
      offersContainer.style.flexWrap = 'nowrap';
      offersContainer.style.overflowX = 'auto';
      offersContainer.style.paddingTop = '8px';
      offersContainer.style.paddingBottom = '8px';
      // Ensure padding handles ribbon overflow on sides cleanly
      offersContainer.style.paddingLeft = '4px';
      offersContainer.style.paddingRight = '4px';
      // Prevent scrollbar overlapping by adding a little extra offset
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
        card.style.minWidth = '110px';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'center';
        card.style.textAlign = 'center';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
      } else if (isVertical) {
        // Vertical template - column layout, centered, full width
        card.style.width = '100%';
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
          c.style.background = design.unselectedBgColor || '#ffffff';
          c.style.borderColor = design.unselectedBorderColor || '#e5e7eb';
        });
        card.classList.add('selected');
        card.style.background = design.selectedBgColor || 'rgba(99,102,241,0.08)';
        card.style.borderColor = design.selectedBorderColor || config.primaryColor;
        
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
    
    return offersContainer;
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

      // Initialize selected variants array
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

              // Create a dropdown for each option dynamically from product.options
              optionValues.forEach(function(opt, optIdx) {
                  var sel = document.createElement('select');
                  sel.className = 'foxcod-variant-select';
                  sel.setAttribute('data-item', itemIndex);
                  sel.setAttribute('data-option-index', optIdx);
                  sel.setAttribute('aria-label', opt.name + ' for Item ' + (itemIndex + 1));

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

                  // Set default to the default variant's option
                  var defaultKey = 'option' + (optIdx + 1);
                  if (defaultVariant[defaultKey]) sel.value = defaultVariant[defaultKey];

                  sel.addEventListener('change', function() {
                      updateBundleVariantSelection(form, config, section, quantity);
                  });

                  selectsDiv.appendChild(sel);
              });

              row.appendChild(selectsDiv);
              section.appendChild(row);

              // Initialize this item's variant
              selectedBundleVariants.push({
                  variantId: defaultVariant.id,
                  title: defaultVariant.title,
                  price: defaultVariant.price
              });
          })(i);
      }

      window.FoxCod._selectedBundleVariants = selectedBundleVariants;

      // Insert after offers container
      if (offersContainer && offersContainer.parentNode) {
          offersContainer.parentNode.insertBefore(section, offersContainer.nextSibling);
      } else if (form) {
          form.insertBefore(section, form.firstChild);
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
              var hasOldShippingOptions = config.shippingOptions && config.shippingOptions.enabled;
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
    if (qtySelector) {
        // Check for bundle offers in the modal OR on the product page
        var hasProductPageOffers = document.querySelector('.cod-product-page-offers[data-product-id="' + config.productId + '"]');
        if (quantityOffersEl || hasProductPageOffers) {
            // Use setProperty with 'important' to override the CSS `display: flex !important` rule
            qtySelector.style.setProperty('display', 'none', 'important');
            console.log('[COD Form] Hiding quantity selector — bundle offers active');
        } else {
            qtySelector.style.setProperty('display', 'flex', 'important');
        }
    }

    // 2. Render section fields (shipping, order_summary, marketing)
    //    The correct order is handled by marker divs created in renderFields.
    //    We render sections normally (they insert before submit), then move them into markers.
    //    First, render the sections:
    var sectionFieldIds = ['shipping', 'order_summary', 'marketing', 'payment_mode'];
    var sortedFields = (config.fields || []).slice().sort(function(a, b) { return a.order - b.order; });
    var hasNewShippingRates = config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0;
    var hasOldShippingOptions = config.shippingOptions && config.shippingOptions.enabled;

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
    if (config.partialCodEnabled && paymentModeVisible) {
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

    // Shadow intensity (0–100) comes from settings; fall back to boolean `shadow`.
    var rawShadowIntensity = typeof styles.shadowIntensity === 'number' ? styles.shadowIntensity : (styles.shadow ? 35 : 0);
    var shadowSlider = Math.max(0, Math.min(100, rawShadowIntensity));
    var shadowOpacity = shadowSlider === 0 ? 0 : 0.05 + (shadowSlider / 100) * 0.25; // 0.05 – 0.30
    var hasShadow = shadowSlider > 0;

    // Theme awareness for focus styles
    var themeKey = styles.themeKey || 'custom';
    var isPresetTheme = themeKey && themeKey !== 'custom';
    var primaryThemeColor = config.primaryColor || (config.buttonStyles && config.buttonStyles.backgroundColor) || '#111827';
    var focusRingColor = isPresetTheme
        ? (hexToRgba(primaryThemeColor, 0.45) || 'rgba(15,23,42,0.35)')
        : 'rgba(148,163,184,0.8)'; // greyish for custom styling
    
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
        label.style.marginBottom = '0px';
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
        } else if (field.id === 'state' || field.id === 'city' || field.id === 'zip' || field.id === 'zipcode') {
            iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>';
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
            // Add placeholder option
            var placeholderOpt = document.createElement('option');
            placeholderOpt.value = '';
            placeholderOpt.textContent = field.placeholder || ('Select ' + field.label.toLowerCase());
            placeholderOpt.disabled = true;
            placeholderOpt.selected = true;
            input.appendChild(placeholderOpt);
            // Add options logic if custom fields have options
            if (field.options) {
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
        input.placeholder = field.placeholder || 'Enter ' + field.label.toLowerCase();
        if (field.required) {
          input.required = true;
          input.setAttribute('data-required', 'true');
        }
        
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
        input.style.padding = field.type === 'textarea' ? '14px 12px 14px 40px' : '14px 12px 14px 40px';
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

        // Focus / blur styling — lift + colored shadow per theme
        input.addEventListener('focus', function() {
          this.style.outline = 'none';
          this.style.borderColor = primaryThemeColor || borderColor;
          this.style.boxShadow = '0 0 0 1px ' + focusRingColor + ', 0 10px 24px rgba(15,23,42,0.16)';
          this.style.transform = 'translateY(-1px)';
        });

        input.addEventListener('blur', function() {
          this.style.border = borderWidth + 'px solid ' + borderColor;
          this.style.boxShadow = hasShadow ? ('0 1px 2px rgba(0,0,0,' + shadowOpacity.toFixed(2) + ')') : 'none';
          this.style.transform = 'translateY(0)';
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
      var primaryTheme = config.primaryColor || (config.buttonStyles && config.buttonStyles.backgroundColor) || '#111827';
      var themeKey = styles.themeKey || 'custom';
      var isPresetTheme = themeKey && themeKey !== 'custom';

      // Greyish styling baseline
      var customGreyBg = '#f3f4f6';
      var customBorder = '1px solid #e5e7eb';

      // For presets, use a stronger tinted background and no border
      var presetBg = hexToRgba(primaryTheme, 0.16) || '#e5f5ff';

      if (isPresetTheme) {
          card.style.background = presetBg;
          card.style.border = 'none';
      } else {
          card.style.background = customGreyBg;
          card.style.border = customBorder;
      }
      card.style.padding = '12px';
      card.style.borderRadius = '8px';
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

      // Build per-variant line items
      var lineItemsHtml = '';
      if (state.items && state.items.length > 1) {
          state.items.forEach(function(item) {
              lineItemsHtml +=
                '<div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12px; color:#4b5563;">' +
                '   <span>1 × ' + (config.productTitle || '') + ' — ' + (item.title || '') + '</span>' +
                '   <span>' + formatMoney(item.price) + '</span>' +
                '</div>';
          });
      }

      card.innerHTML =
        '<div style="font-weight:600; margin-bottom:8px; display:flex; align-items:center;">' +
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
        '   <span id="cod-summary-total" style="color:' + config.primaryColor + '">' + formatMoney(state.total) + '</span>' +
        '</div>';

      form.insertBefore(card, form.querySelector('button[type="submit"]'));
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
  function getEffectiveQuantity(form) {
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
      var orderPrice = getVariantSubtotal(config) * quantity / Math.max(1, getEffectiveQuantity(null));
      
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
          
          form.insertBefore(container, form.querySelector('button[type="submit"]') || null);
          return;
      }

      applicableRates.forEach(function(rate, index) {
          var card = document.createElement('label');
          card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;cursor:pointer;margin-bottom:8px;background:#fff;transition:all 0.2s ease;';
          
          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'shipping_method';
          radio.value = rate.id;
          radio.setAttribute('data-price', rate.price);
          radio.style.cssText = 'accent-color:' + (config.primaryColor || '#111827') + ';width:18px;height:18px;flex-shrink:0;cursor:pointer;margin:0;';
          
          // Add change listener to update total and card styles
          radio.addEventListener('change', function() {
              updateTotalHelper(form, config, rate.price);
              // Update all card styles
              var allCards = container.querySelectorAll('label');
              allCards.forEach(function(c) {
                  var r = c.querySelector('input[type="radio"]');
                  if (r && r.checked) {
                      c.style.borderColor = config.primaryColor || '#111827';
                      c.style.background = fieldBg;
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
          
          // Neutral hover effects (no blue tint) – lightly hint the field background
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
      var qtyInput = form.querySelector('[name="quantity"]');
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
   * Render Payment Method Selection (Full COD vs Partial COD)
   */
  function renderPaymentMethodOptions(form, config) {
      var container = document.createElement('div');
      container.className = 'cod-payment-method-options';
      container.style.marginBottom = '20px';
      container.style.padding = '16px';

      // Neutral / theme-aware background – no fixed blue gradient
      var styles = config.styles || {};
      var primaryTheme = config.primaryColor || (config.buttonStyles && config.buttonStyles.backgroundColor) || '#111827';
      var isPlainWhiteBg = !styles.backgroundColor || styles.backgroundColor === '#ffffff' || styles.backgroundColor === '#fff';
      var baseBg = isPlainWhiteBg ? '#f9fafb' : (hexToRgba(primaryTheme, 0.03) || '#f9fafb');
      var borderColor = hexToRgba(primaryTheme, 0.35) || '#e5e7eb';
      // Field background from form styling (used when a payment option is selected)
      var fieldBg = styles.fieldBackgroundColor || '#f3f4f6';

      container.style.background = baseBg;
      container.style.borderRadius = '12px';
      container.style.border = '1px solid ' + borderColor;

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

      // Calculate order total for display — read from the order summary total if available
      var orderTotal = config.productPrice || 0;
      var summaryTotalEl = form.querySelector('#cod-summary-total');
      if (summaryTotalEl) {
          // Parse the total from the rendered order summary (which includes discounts, shipping, upsells, downsells)
          var totalText = summaryTotalEl.textContent;
          var parsedTotal = parseFloat(totalText.replace(/[^0-9.]/g, '')) || 0;
          if (parsedTotal > 0) {
              orderTotal = parsedTotal;
          }
      }
      var remainingAmount = orderTotal - config.partialCodAdvance;
      if (remainingAmount < 0) remainingAmount = 0;

      var paymentOptions = [
          {
              id: 'full_cod',
              label: 'Full COD',
              description: 'Pay ' + formatMoney(orderTotal) + ' on delivery',
              checked: false
          },
          {
              id: 'partial_cod',
              label: 'Partial COD',
              description: 'Pay ' + formatMoney(config.partialCodAdvance) + ' now, ' + formatMoney(remainingAmount) + ' on delivery',
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
          row.style.background = '#fff';
          row.style.borderRadius = '10px';
          row.style.border = '2px solid #e5e7eb';
          row.style.cursor = 'pointer';
          row.style.transition = 'all 0.2s ease';

          var radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'payment_method';
          radio.value = opt.id;
          radio.checked = opt.checked;
          var row_isChecked = opt.checked;
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
          descText.setAttribute('data-payment-desc', opt.id);
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
                  row.style.borderColor = borderColor;
                  row.style.background = '#f3f4f6';
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
                  // Selected option uses the same background color as form fields
                  r.style.background = isSelected ? fieldBg : '#fff';
              });

              // Update submit button text
              if (submitBtn) {
                  if (opt.id === 'partial_cod') {
                      submitBtn.textContent = 'Pay ' + formatMoney(config.partialCodAdvance) + ' Now';
                      submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                  } else {
                      submitBtn.textContent = originalButtonText;
                      submitBtn.style.background = config.primaryColor;
                  }
              }
          });
      });

      container.appendChild(optionsWrapper);

      // Insert into the form — the section marker/move logic in initForm will
      // reposition this element into the correct drag-drop position.
      // If no marker exists, fall back to inserting before the submit button.
      var marker = form.querySelector('.cod-section-marker[data-section="payment_mode"]');
      if (marker) {
          // Will be moved by the marker logic — just append to form for now
          form.appendChild(container);
      } else {
          var submitBtn2 = form.querySelector('button[type="submit"]');
          if (submitBtn2) {
              form.insertBefore(container, submitBtn2);
          } else {
              form.appendChild(container);
          }
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
  function updatePaymentMethodAmounts(form, config) {
      var summaryTotalEl = form.querySelector('#cod-summary-total');
      if (!summaryTotalEl) return;
      
      var totalText = summaryTotalEl.textContent;
      var orderTotal = parseFloat(totalText.replace(/[^0-9.]/g, '')) || 0;
      if (orderTotal <= 0) return;
      
      var partialAdvance = config.partialCodAdvance || 0;
      var remainingAmount = orderTotal - partialAdvance;
      if (remainingAmount < 0) remainingAmount = 0;
      
      // Find the payment method options container
      var paymentContainer = form.querySelector('.cod-payment-method-options');
      if (!paymentContainer) return;
      
      // Update Full COD description
      var fullCodRadio = paymentContainer.querySelector('input[name="payment_method"][value="full_cod"]');
      if (fullCodRadio) {
          var fullCodRow = fullCodRadio.closest('label');
          if (fullCodRow) {
              var descEl = fullCodRow.querySelector('[data-payment-desc]');
              if (descEl) {
                  descEl.textContent = 'Pay ' + formatMoney(orderTotal) + ' on delivery';
              }
          }
      }
      
      // Update Partial COD description
      var partialCodRadio = paymentContainer.querySelector('input[name="payment_method"][value="partial_cod"]');
      if (partialCodRadio) {
          var partialRow = partialCodRadio.closest('label');
          if (partialRow) {
              var descEl = partialRow.querySelector('[data-payment-desc]');
              if (descEl) {
                  descEl.textContent = 'Pay ' + formatMoney(partialAdvance) + ' now, ' + formatMoney(remainingAmount) + ' on delivery';
              }
          }
      }
  }

  // =============================================
  // CENTRALIZED PRICING ENGINE
  // =============================================

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
  function getVariantSubtotal(config) {
      var bundleVariants = window.FoxCod && window.FoxCod._selectedBundleVariants;
      if (bundleVariants && bundleVariants.length > 1) {
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

      // ── 1. Read offer quantity & discount ──
      var modal = form ? (form.closest('.cod-modal') || form) : null;
      var quantityOffersEl = modal ? modal.querySelector('.cod-quantity-offers') : null;
      if (quantityOffersEl) {
          try {
              var offerData = quantityOffersEl.getAttribute('data-selected-offer');
              if (offerData) {
                  var selectedOffer = JSON.parse(offerData);
                  state.quantity = selectedOffer.quantity || 1;
                  state.discountPercent = selectedOffer.discountPercent || 0;
              }
          } catch (e) {}
      }
      // Also check product page offers (for in_product_page placement)
      if (state.quantity === 1 && state.discountPercent === 0) {
          var productPageOffers = document.querySelector('.cod-product-page-offers');
          if (productPageOffers) {
              try {
                  var ppOfferData = productPageOffers.getAttribute('data-selected-offer');
                  if (ppOfferData) {
                      var ppOffer = JSON.parse(ppOfferData);
                      state.quantity = ppOffer.quantity || 1;
                      state.discountPercent = ppOffer.discountPercent || 0;
                  }
              } catch (e) {}
          }
      }
      // Fallback: quantity input (outside form in .cod-product-qty)
      if (state.quantity === 1 && !quantityOffersEl) {
          var container = form ? (form.closest('.cod-form-container') || form.closest('.cod-modal') || form.parentElement) : null;
          var qtyInput = form ? form.querySelector('[name="quantity"]') : null;
          if (!qtyInput && container) {
              qtyInput = container.querySelector('.cod-product-qty .cod-qty-input');
          }
          state.quantity = parseInt(qtyInput ? qtyInput.value : 1) || 1;
      }

      // ── 2. Calculate subtotal from variant prices (never config.productPrice for bundles) ──
      var bundleVariants = window.FoxCod && window.FoxCod._selectedBundleVariants;
      if (bundleVariants && bundleVariants.length > 1) {
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

      state.total = displaySubtotal - state.discount + state.shipping + state.tickUpsellTotal + state.preUpsellTotal;

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

      var html = '<div style="font-weight:600; margin-bottom:8px; display:flex; align-items:center;">' +
          '   Order Summary' +
          '</div>';

      // Per-variant line items for bundles
      var bundleVariants = window.FoxCod && window.FoxCod._selectedBundleVariants;
      if (bundleVariants && bundleVariants.length > 1) {
          bundleVariants.forEach(function(bv) {
              html += '<div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:12px; color:#4b5563;">' +
                  '   <span>1 × ' + (config.productTitle || '') + ' — ' + (bv.title || '') + '</span>' +
                  '   <span>' + formatMoney(bv.price) + '</span>' +
                  '</div>';
          });
      }

      // Subtotal
      html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
          '   <span>Subtotal (' + state.quantity + ' ' + (state.quantity === 1 ? 'item' : 'items') + ')</span>' +
          '   <span id="cod-summary-subtotal">' + formatMoney(state.displaySubtotal) + '</span>' +
          '</div>';

      // Downsell savings
      if (state.downsellSavings > 0) {
          html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#10b981;">' +
              '   <span>Downsell discount</span>' +
              '   <span>-' + formatMoney(state.downsellSavings) + '</span>' +
              '</div>';
      }

      // Bundle discount
      if (state.discount > 0) {
          html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#10b981;">' +
              '   <span>Bundle Discount (' + state.discountPercent + '%)</span>' +
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
      html += '<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:13px; color:#6b7280;">' +
          '   <span>Shipping</span>' +
          '   <span id="cod-summary-shipping">' + (state.shipping === 0 ? 'FREE' : formatMoney(state.shipping)) + '</span>' +
          '</div>';

      // Total
      html += '<div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed #d1d5db; font-weight:700; color:#111827;">' +
          '   <span>Total</span>' +
          '   <span id="cod-summary-total" style="color:' + config.primaryColor + '">' + formatMoney(state.total) + '</span>' +
          '</div>';

      summaryEl.innerHTML = html;

      // Also update the Liquid-rendered total price if it exists
      var codTotalPrice = form ? form.querySelector('.cod-total-price') : null;
      if (codTotalPrice) {
          codTotalPrice.textContent = formatMoney(state.total);
      }

      // Sync payment method amounts with updated total
      updatePaymentMethodAmounts(form, config);
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
            triggerUpdate();
        }
    });

    plus.addEventListener('click', function() {
        var val = parseInt(input.value) || 1;
        var max = parseInt(input.max) || config.maxQuantity || 10;
        if (val < max) {
            input.value = val + 1;
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
    var modal = document.getElementById('cod-form-' + productId);
    var overlay = document.getElementById('cod-modal-overlay-' + productId);
    var form = document.getElementById('cod-order-form-' + productId);
    
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('visible'), 10);
    }
    if (overlay) overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Hide sticky mobile button IMMEDIATELY while form is open
    // Must use display:none because sticky z-index (10000) is above modal z-index (9999)
    document.querySelectorAll('.cod-buy-btn.sticky-mobile').forEach(function(btn) {
        btn.classList.remove('visible');
        btn.style.setProperty('display', 'none', 'important');
        btn.setAttribute('data-hidden-by-modal', 'true');
    });

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
                    var fieldsContainer2 = form.querySelector('.cod-dynamic-fields-container');
                    var shippingSection = form.querySelector('.cod-shipping-section');
                    var shippingMarker = fieldsContainer2 ? fieldsContainer2.querySelector('.cod-section-marker[data-section="shipping"]') : null;
                    if (shippingSection) {
                        shippingSection.remove();
                    }
                    var hasNewShippingRates = config.shippingRatesEnabled && config.shippingRates && config.shippingRates.length > 0;
                    var hasOldShippingOptions = config.shippingOptions && config.shippingOptions.enabled;
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
                                            '  <span style="text-decoration: line-through; color: #9ca3af; font-size: 14px;">' + formatMoney(originalPrice) + '</span>' +
                                            '  <span style="font-size: 18px; font-weight: 700; color: ' + (config.primaryColor || '#10b981') + ';">' + formatMoney(dsItem.price) + '</span>' +
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
    // Save form state BEFORE closing so it persists across reopen
    var form = document.getElementById('cod-order-form-' + productId);
    if (form) {
        saveFoxCodCheckoutState(form);
    }

    if (modal) {
        modal.classList.remove('visible');
        setTimeout(function() { modal.style.display = 'none'; }, 300);
    }
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';

    // Re-show sticky mobile button that was hidden when modal opened
    // But ONLY if the original COD button is NOT visible in the viewport
    document.querySelectorAll('.cod-buy-btn.sticky-mobile[data-hidden-by-modal="true"]').forEach(function(btn) {
        btn.removeAttribute('data-hidden-by-modal');
        btn.style.removeProperty('display');
        // Use the stored updateVisibility function to properly re-evaluate position
        if (typeof btn._updateVisibility === 'function') {
            // Small delay to let scroll position settle after body overflow restore
            setTimeout(function() {
                btn._updateVisibility();
            }, 50);
        }
    });
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
              var headerText = design.headerText || ('Add ' + (offer.upsell_product_title || 'this product') + ' for ' + formatMoney(offerPrice));
              headerText = headerText.replace('{{title}}', offer.upsell_product_title || 'this product');
              headerText = headerText.replace('{{price}}', formatMoney(offerPrice));
              title.textContent = headerText;
              info.appendChild(title);

              var priceDiv = document.createElement('div');
              priceDiv.style.cssText = 'font-size: 13px;';
              priceDiv.innerHTML = '<strong style="color: #059669;">' + formatMoney(offerPrice) + '</strong>';
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

  function buildUpsellModalHTML(campaign, offer, offerIndex, config) {
      var design = campaign.design || {};
      var timer = design.timer || {};
      var discountTag = design.discountTag || {};
      var acceptBtn = design.acceptButton || {};
      var rejectBtn = design.rejectButton || {};
      var offerPrice = getOfferPrice(offer);
      var hasDiscount = offer.discount_value > 0;
      var discountLabel = offer.discount_type === 'percentage' ? offer.discount_value + '%' : formatMoney(offer.discount_value);

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
          html += '<div style="position: relative; margin: 0 0 12px;"><img src="' + offer.upsell_product_image + '" style="max-width: 200px; max-height: 200px; object-fit: contain;" /></div>';
      }
      html += '<div style="font-size: 14px; margin-bottom: 8px;">' + (offer.upsell_product_title || 'Product') + '</div>';

      if (hasDiscount) {
          html += '<div style="margin-bottom: 8px;"><span style="display: inline-block; padding: 4px 16px; border-radius: ' + (discountTag.borderRadius || 20) + 'px; background: ' + (discountTag.bgColor || '#ec4899') + '; color: ' + (discountTag.textColor || '#fff') + '; font-size: ' + (discountTag.textSize || 14) + 'px; font-weight: 700;">' + (discountTag.text || '- {discount}').replace('{discount}', discountLabel) + '</span></div>';
      }

      html += '<div style="margin-bottom: 20px;">';
      if (hasDiscount) html += '<s style="color: #9ca3af; font-size: 14px; margin-right: 8px;">' + formatMoney(offer.original_price) + '</s>';
      html += '<strong style="font-size: 20px; color: #1f2937;">' + formatMoney(offerPrice) + '</strong></div>';

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
      overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px;';
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

  function buildDownsellModalHTML(dsCampaign, offer, config) {
      var design = dsCampaign.design || {};
      var acceptBtn = design.acceptButton || {};
      var rejectBtn = design.rejectButton || {};
      var origPrice = offer.original_price || 0;
      var offerPrice = getOfferPrice(offer);
      var hasDiscount = offer.discount_value > 0;
      var discountLabel = offer.discount_type === 'percentage' ? offer.discount_value + '%' : formatMoney(offer.discount_value);

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

      // Product image removed — downsell shows no image by design

      // Product title
      if (offer.upsell_product_title) {
          html += '<div style="font-size: 14px; margin-bottom: 6px; color: #374151;">' + offer.upsell_product_title + '</div>';
      }

      // Price display - only show when product has a price
      if (origPrice > 0) {
          html += '<div style="margin-bottom: 20px;">';
          if (hasDiscount) html += '<s style="color: #9ca3af; font-size: 14px; margin-right: 8px;">' + formatMoney(origPrice) + '</s>';
          html += '<strong style="font-size: 20px; color: #1f2937;">' + formatMoney(offerPrice) + '</strong></div>';
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
      overlay.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px;';
      var modal = document.createElement('div');
      var isMobileDs = window.innerWidth <= 480;
      modal.style.cssText = 'background: #fff; border-radius: 24px; max-width: ' + (isMobileDs ? '340px' : '420px') + '; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-height: ' + (isMobileDs ? '85vh' : '90vh') + '; overflow-y: auto;';

      // Use dedicated downsell builder if design has downsell-specific fields, else fallback to upsell builder
      var hasDownsellDesign = dsCampaign.design && (dsCampaign.design.titleText || dsCampaign.design.subtitleText || dsCampaign.design.descriptionText);
      modal.innerHTML = hasDownsellDesign ? buildDownsellModalHTML(dsCampaign, offer, config) : buildUpsellModalHTML(dsCampaign, offer, 0, config);

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
   * Show a styled fraud-block popup instead of browser alert()
   */
  function showFraudBlockPopup(message) {
      // Remove any existing popup
      var existing = document.getElementById('cod-fraud-popup-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.id = 'cod-fraud-popup-overlay';
      overlay.style.cssText = 'position: fixed; inset: 0; z-index: 999999; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); animation: codFraudFadeIn 0.25s ease;';

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

      console.log('[COD Form] Validation passed');

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
          quantity: parseInt(formData.get('quantity') || ((form.closest('.cod-form-container') || form.parentElement).querySelector('.cod-product-qty .cod-qty-input') || {}).value || '1'),
          price: parseFloat(config.productPrice),
          productTitle: config.productTitle,
          currency: (FoxCod.currencyConfig && FoxCod.currencyConfig.code) || 'USD',
          shippingLabel: '',
          shippingPrice: 0,
          discountPercent: 0,
          finalTotal: 0,
          upsell_items: getCheckedTickUpsells(form, config)
      };

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

      // Collect custom field values
      var customFieldData = [];
      var knownFieldIds = ['name', 'phone', 'address', 'email', 'state', 'city', 'zip', 'zipcode', 'notes', 'quantity', 'shipping', 'order_summary', 'marketing', 'payment_mode'];
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

      // ── Fraud Protection: client-side validation ──
      var fraudResult = validateFraudProtection(payload);
      if (!fraudResult.allowed) {
          console.warn('[COD Form] Blocked by fraud protection:', fraudResult.message);
          showFraudBlockPopup(fraudResult.message);
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

      // Recalculate finalTotal to include any upsell items accepted after the DOM snapshot
      if (payload.upsell_items && payload.upsell_items.length > 0) {
          var upsellTotal = payload.upsell_items.reduce(function(sum, item) {
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
              // Clear persistent checkout state after successful order
              // Set flag to prevent auto-save from re-writing during reset
              window._foxcodOrderComplete = true;
              localStorage.removeItem('foxcod_checkout_state');

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
              
              // Close the main checkout modal immediately
              closeModal(productId);
              
              // Reset the form
              var f = document.getElementById('cod-form-' + productId).querySelector('form');
              if (f) {
                  f.reset();
                  // Reset dynamic displays if any form fields were hidden
                  f.querySelectorAll('.cod-dynamic-fields-container, button[type=submit], .cod-total, .cod-order-summary, .cod-product-info, .cod-form-headers, .cod-shipping-section').forEach(function(e){
                      e.style.display = e.classList.contains('cod-product-info') || e.classList.contains('cod-total') ? 'flex' : '';
                  });
              }
              // Clear checkout state again after reset (form.reset may trigger auto-save)
              localStorage.removeItem('foxcod_checkout_state');
              // Set flag so the next openModal knows to reset the form
              localStorage.setItem('foxcod_order_just_completed', 'true');
              // Allow auto-save to resume after a delay
              setTimeout(function() { window._foxcodOrderComplete = false; }, 1000);

              // Create and show premium global success modal
              var overlay = document.createElement('div');
              overlay.className = 'fox-cod-success-overlay';
              
              var successMessage = config.successMessage || 'Your order has been placed successfully!';
              var orderIdDisplay = result.orderName || result.orderId || 'Pending';
              
              overlay.innerHTML = `
                <style>
                  .fox-cod-success-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100vw;
                    height: 100vh;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2147483647;
                    opacity: 0;
                    animation: foxCodFadeIn 0.3s ease forwards;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    padding: 20px;
                    box-sizing: border-box;
                  }
                  .fox-cod-success-modal {
                    background: #ffffff;
                    width: 100%;
                    max-width: 420px;
                    border-radius: 24px;
                    padding: 40px 32px;
                    text-align: center;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    transform: translateY(20px) scale(0.95);
                    opacity: 0;
                    animation: foxCodSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards 0.1s;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    box-sizing: border-box;
                  }
                  .fox-cod-success-icon {
                    width: 72px;
                    height: 72px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 24px;
                    box-shadow: 0 12px 24px rgba(16, 185, 129, 0.3);
                  }
                  .fox-cod-success-icon svg {
                    width: 36px;
                    height: 36px;
                    color: white;
                  }
                  .fox-cod-success-modal h2 {
                    font-size: 24px !important;
                    font-weight: 800 !important;
                    color: #111827 !important;
                    margin: 0 0 12px 0 !important;
                    line-height: 1.2 !important;
                    letter-spacing: -0.02em !important;
                  }
                  .fox-cod-success-modal p {
                    font-size: 15px !important;
                    color: #4b5563 !important;
                    margin: 0 0 24px 0 !important;
                    line-height: 1.5 !important;
                  }
                  .fox-cod-order-box {
                    background: #f9fafb;
                    border: 1px dashed #d1d5db;
                    border-radius: 12px;
                    padding: 16px;
                    width: 100%;
                    box-sizing: border-box;
                  }
                  .fox-cod-order-label {
                    display: block;
                    font-size: 12px !important;
                    color: #6b7280 !important;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    font-weight: 600 !important;
                    margin-bottom: 6px !important;
                  }
                  .fox-cod-order-id {
                    font-size: 22px !important;
                    color: #111827 !important;
                    font-weight: 800 !important;
                    letter-spacing: 0.02em;
                    margin: 0 !important;
                  }
                  @keyframes foxCodFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                  }
                  @keyframes foxCodSlideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                  }
                  @keyframes foxCodFadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                  }
                  @keyframes foxCodSlideDown {
                    from { opacity: 1; transform: translateY(0) scale(1); }
                    to { opacity: 0; transform: translateY(20px) scale(0.95); }
                  }
                </style>
                <div class="fox-cod-success-modal">
                  <div class="fox-cod-success-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
                    </svg>
                  </div>
                  <h2>Order Confirmed!</h2>
                  <p>${successMessage}</p>
                  <div class="fox-cod-order-box">
                    <span class="fox-cod-order-label">Order ID</span>
                    <p class="fox-cod-order-id">${orderIdDisplay}</p>
                  </div>
                </div>
              `;
              
              document.body.appendChild(overlay);

              // Auto-close after 2.5 seconds
              setTimeout(function() {
                  if (overlay.parentNode) {
                      overlay.style.animation = 'foxCodFadeOut 0.3s ease forwards';
                      var modalContent = overlay.querySelector('.fox-cod-success-modal');
                      if (modalContent) modalContent.style.animation = 'foxCodSlideDown 0.3s ease forwards';
                      setTimeout(function() {
                          if (overlay.parentNode) {
                              overlay.remove();
                          }
                      }, 300);
                  }
              }, 2500);
          } else {
              throw new Error(result.error || result.message || 'Order failed');
          }
      })
      .catch(err => {
          console.error('[COD Form] Error:', err);
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
          
          // Use the custom fraud popup for all order errors (covers server-side fraud blocks)
          showFraudBlockPopup(err.message || 'Something went wrong. Please try again.');
      });
  }

})();
