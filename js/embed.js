(() => {
  // Stores that must not have ANY storage written — and must not even load the
  // tracking bundle — before the visitor has consented. Merchant-requested
  // (ePrivacy / GDPR). Every other store keeps loading immediately, unchanged.
  // Hardcoded on purpose: looking the list up over the network would itself be
  // a request made before consent.
  var CONSENT_GATED_SHOPS = ["futurekind.myshopify.com", "futurekind.com"];

  // Held in memory only; written to localStorage once we are allowed to.
  var viewedItem = window.item;

  function loadBundle() {
    var s = document.createElement("script");
    s.src = "https://cdn.aimerce.ai/a.browser.shopify.umd.js";
    s.async = true;
    document.head.appendChild(s);
  }

  function rememberViewedItem() {
    if (!viewedItem) return;
    localStorage.setItem("__aim_viewed", JSON.stringify(viewedItem));
    try {
      const existing = localStorage.getItem("__aim_vi") || "[]";
      const viewed = JSON.parse(existing);
      const index = viewed.findIndex((v) => v.ProductID === viewedItem.ProductID);
      if (index === -1) {
        viewed.push(viewedItem);
        localStorage.setItem("__aim_vi", JSON.stringify(viewed));
      }
    } catch (e) {
      console.warn(e);
    }
  }

  function start() {
    loadBundle();
    rememberViewedItem();
  }

  function isConsentGated() {
    var shop = (window.Shopify && window.Shopify.shop) || "";
    var host = window.location.hostname || "";
    return CONSENT_GATED_SHOPS.some(function (domain) {
      return shop === domain || host === domain || host.endsWith("." + domain);
    });
  }

  if (!isConsentGated()) {
    start();
    return;
  }

  // --- consent-gated path ---------------------------------------------------
  // Nothing above has touched storage yet. Wait for Shopify's Customer Privacy
  // API to report a granted consent, then start. `null` means "not known yet"
  // and must NOT be treated as granted.
  function consentGranted() {
    try {
      var cp = window.Shopify && window.Shopify.customerPrivacy;
      if (!cp || typeof cp.analyticsProcessingAllowed !== "function") return null;
      return !!(cp.analyticsProcessingAllowed() || cp.marketingAllowed());
    } catch (e) {
      return null;
    }
  }

  var started = false;
  var poll;

  function startIfAllowed() {
    if (started || consentGranted() !== true) return;
    started = true;
    clearInterval(poll);
    document.removeEventListener("visitorConsentCollected", startIfAllowed);
    start();
  }

  // The bundle normally loads the Customer Privacy API for us; it is not here
  // yet, so ask for it directly.
  try {
    if (window.Shopify && window.Shopify.loadFeatures) {
      window.Shopify.loadFeatures(
        [{ name: "consent-tracking-api", version: "0.1" }],
        function () {},
      );
    }
  } catch (e) {}

  document.addEventListener("visitorConsentCollected", startIfAllowed);
  // Poll for the first 30s to cover consent already granted on a return visit
  // and CMPs that update consent without firing the event; the listener stays
  // on afterwards so a later opt-in still starts us.
  poll = setInterval(startIfAllowed, 300);
  setTimeout(function () {
    clearInterval(poll);
  }, 30000);
  startIfAllowed();
})();
