/* Telepski · steuer-sparmodelle.ch · Klick-Marke für Meta + LinkedIn
   Sammelt beim Klick auf "Jetzt bestellen" Browser-Signale (fbp/fbc, li_fat_id, UTM)
   ein, schickt sie an Make und hängt eine Sitzungs-ID als client_reference_id an
   den Stripe-Link. Stand: 21.08.2026. */
(function () {
  "use strict";

  var CAPTURE_WEBHOOK_URL = "https://hook.eu1.make.com/zgn3u3tcrvp2lojdol8vo5vxq5h9rec6";
  var STRIPE_LINK_MATCH = "buy.stripe.com/5kQdRacYxbwqcQh2Vv2wU01";
  var STORAGE_KEY = "sp_klick_marke_v1";

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function genSessionId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return "sp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 12);
  }

  function captureOnLoad() {
    var params = new URLSearchParams(window.location.search);
    var existing = {};
    try {
      existing = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    } catch (e) {
      existing = {};
    }
    var fields = ["li_fat_id", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    fields.forEach(function (key) {
      var val = params.get(key);
      if (val) {
        existing[key] = val;
      }
    });
    if (!existing.landing_url) {
      existing.landing_url = window.location.href.split("?")[0];
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  }

  function buildPayload(sessionId) {
    var stored = {};
    try {
      stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    } catch (e) {
      stored = {};
    }
    return {
      session_id: sessionId,
      fbp: readCookie("_fbp"),
      fbc: readCookie("_fbc"),
      li_fat_id: stored.li_fat_id || "",
      utm_source: stored.utm_source || "",
      utm_medium: stored.utm_medium || "",
      utm_campaign: stored.utm_campaign || "",
      utm_content: stored.utm_content || "",
      utm_term: stored.utm_term || "",
      landing_url: stored.landing_url || window.location.href.split("?")[0]
    };
  }

  function sendBeacon(payload) {
    var body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(CAPTURE_WEBHOOK_URL, blob);
    } else {
      fetch(CAPTURE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        keepalive: true
      }).catch(function () {});
    }
  }

  function onBuyClick(evt) {
    var link = evt.currentTarget;
    var href = link.getAttribute("href") || "";
    if (href.indexOf(STRIPE_LINK_MATCH) === -1) {
      return;
    }
    evt.preventDefault();

    var sessionId = genSessionId();
    var payload = buildPayload(sessionId);
    sendBeacon(payload);

    var separator = href.indexOf("?") === -1 ? "?" : "&";
    var target = href + separator + "client_reference_id=" + encodeURIComponent(sessionId);
    window.location.href = target;
  }

  function wireButtons() {
    var links = document.querySelectorAll('a[href*="' + STRIPE_LINK_MATCH + '"]');
    links.forEach(function (link) {
      link.addEventListener("click", onBuyClick);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      captureOnLoad();
      wireButtons();
    });
  } else {
    captureOnLoad();
    wireButtons();
  }
})();
