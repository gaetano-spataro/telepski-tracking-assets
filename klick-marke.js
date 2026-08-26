/* Telepski · steuer-sparmodelle.ch · Klick-Marke für Meta + LinkedIn
   Sammelt beim Klick auf "Jetzt bestellen" Browser-Signale (fbp/fbc, li_fat_id, UTM,
   IP, User-Agent) ein, schickt sie an Make und hängt eine Sitzungs-ID als
   client_reference_id an den Stripe-Link. Stand: 25.08.2026 (v4, Beacon-Fix:
   form-urlencoded-fetch statt sendBeacon/JSON, weil der Beacon-Body bei Make leer
   ankam; dazu Express-Modus ?express=1 für klicklosen Direkt-Traffic). */
(function () {
  "use strict";

  var CAPTURE_WEBHOOK_URL = "https://hook.eu1.make.com/zgn3u3tcrvp2lojdol8vo5vxq5h9rec6";
  var STRIPE_LINK_MATCH = "buy.stripe.com/5kQdRacYxbwqcQh2Vv2wU01";
  var STRIPE_BASE_URL = "https://buy.stripe.com/5kQdRacYxbwqcQh2Vv2wU01";
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

  function buildPayload(sessionId, clientIp) {
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
      landing_url: stored.landing_url || window.location.href.split("?")[0],
      client_ip: clientIp || "",
      client_user_agent: navigator.userAgent || ""
    };
  }

  function fetchClientIp(timeoutMs) {
    if (!window.fetch || !window.AbortController) {
      return Promise.resolve("");
    }
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
    return fetch("https://api.ipify.org?format=json", { signal: controller.signal })
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        return json && json.ip ? json.ip : "";
      })
      .catch(function () {
        return "";
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  /* Sendet den Payload als application/x-www-form-urlencoded — bewusst NICHT als
     JSON und NICHT via navigator.sendBeacon: sendBeacon mit Blob(application/json)
     kam beim Make-Custom-Webhook als ungeparster/leerer Body an (nur der Zeitstempel
     landete im Datastore, alle Felder leer). form-urlencoded ist ein CORS-"simple"
     Content-Type (kein Preflight) und Make zerlegt es zuverlässig in {{1.feldname}}.
     keepalive:true hält den Request über die anschliessende Weiterleitung hinweg. */
  function sendData(payload) {
    var params = new URLSearchParams();
    Object.keys(payload).forEach(function (k) {
      params.append(k, payload[k] == null ? "" : String(payload[k]));
    });
    return fetch(CAPTURE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: params.toString(),
      keepalive: true
    }).catch(function () {});
  }

  function captureAndRedirect(href) {
    var sessionId = genSessionId();
    var separator = href.indexOf("?") === -1 ? "?" : "&";
    var target = href + separator + "client_reference_id=" + encodeURIComponent(sessionId);

    var navigated = false;
    function go() {
      if (navigated) {
        return;
      }
      navigated = true;
      window.location.href = target;
    }

    fetchClientIp(400).then(function (clientIp) {
      var payload = buildPayload(sessionId, clientIp);
      sendData(payload).then(go, go);
      setTimeout(go, 800);
    });
  }

  function onBuyClick(evt) {
    var link = evt.currentTarget;
    var href = link.getAttribute("href") || "";
    if (href.indexOf(STRIPE_LINK_MATCH) === -1) {
      return;
    }
    evt.preventDefault();
    captureAndRedirect(href);
  }

  function wireButtons() {
    var links = document.querySelectorAll('a[href*="' + STRIPE_LINK_MATCH + '"]');
    links.forEach(function (link) {
      link.addEventListener("click", onBuyClick);
    });
  }

  function maybeRunExpressMode() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("express") !== "1") {
      return false;
    }
    captureAndRedirect(STRIPE_BASE_URL);
    return true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      captureOnLoad();
      if (!maybeRunExpressMode()) {
        wireButtons();
      }
    });
  } else {
    captureOnLoad();
    if (!maybeRunExpressMode()) {
      wireButtons();
    }
  }
})();
