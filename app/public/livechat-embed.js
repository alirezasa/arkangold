/*
 * چت آنلاین آرکان گلد — اسکریپت جاسازی برای سایت‌های دیگر (arkan.gold، مجله‌ی وردپرس، ...)
 *
 *   <script src="https://app.arkan.gold/livechat-embed.js" defer></script>
 *
 * ویجت چت در یک iframe شفاف از app.arkan.gold بارگذاری می‌شود؛ این اسکریپت فقط جا و اندازه‌ی
 * iframe را تعیین و نشانی صفحه‌ی فعلی را به چت اعلام می‌کند. همه‌ی ظاهر و رفتار چت از پنل
 * مدیریت ← چت آنلاین تنظیم می‌شود.
 *
 * باز/بسته کردن از دکمه‌های خود سایت:
 *   ArkanChat.open()  ArkanChat.close()   یا   <a href="#" data-arkan-chat-open>گفتگو با پشتیبانی</a>
 */
(function () {
  "use strict";
  if (window.ArkanChat) return;

  var script = document.currentScript;
  var appOrigin;
  try {
    appOrigin = new URL(script && script.src ? script.src : "https://app.arkan.gold/").origin;
  } catch {
    appOrigin = "https://app.arkan.gold";
  }

  var MOBILE = 640;
  var OPEN_W = 380;
  var OPEN_H = 640;
  var iframe = null;
  var layout = { state: "hidden" };
  var queued = [];
  var ready = false;

  function hostInfo() {
    return { url: location.href, title: document.title, referrer: document.referrer };
  }

  function send(type, data) {
    var msg = { source: "arkan-chat-host", type: type };
    if (data) for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) msg[k] = data[k];
    if (!ready || !iframe || !iframe.contentWindow) {
      queued.push(msg);
      return;
    }
    iframe.contentWindow.postMessage(msg, appOrigin);
  }

  function px(n) {
    return Math.max(0, Math.round(n)) + "px";
  }

  function apply() {
    if (!iframe) return;
    var s = iframe.style;
    var mobile = window.innerWidth < MOBILE;
    if (layout.state === "hidden" || (mobile && layout.showOnMobile === false && layout.state !== "open")) {
      s.display = "none";
      return;
    }
    s.display = "block";
    var side = layout.side === "right" ? "right" : "left";
    var other = side === "left" ? "right" : "left";
    var pad = layout.pad || 0;
    s[other] = "auto";
    s.top = "auto";
    if (layout.state === "open") {
      if (mobile) {
        s.top = "env(safe-area-inset-top, 0px)";
        s.bottom = "env(safe-area-inset-bottom, 0px)";
        s.left = "0px";
        s.right = "0px";
        s.width = "100%";
        // ارتفاع iframe باید صریح باشد (عنصر جایگزین با height:auto فقط ۱۵۰ پیکسل می‌شود)
        s.height = "100vh";
        s.height = "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))";
        s.borderRadius = "0";
        s.boxShadow = "none";
      } else {
        s.bottom = "calc(" + px(layout.offsetBottom || 0) + " + env(safe-area-inset-bottom, 0px))";
        s[side] = px(layout.offsetX || 0);
        s.width = OPEN_W + "px";
        s.height = Math.min(OPEN_H, window.innerHeight - 40) + "px";
        s.borderRadius = "24px";
        s.boxShadow = "0 25px 50px -12px rgba(0,0,0,.25)";
      }
      return;
    }
    // دکمه‌ی بسته (و حباب پیام خودکار): iframe دقیقاً هم‌اندازه‌ی محتوا تا روی سایت را نپوشاند
    s.bottom = "calc(" + px((layout.offsetBottom || 0) - pad) + " + env(safe-area-inset-bottom, 0px))";
    s[side] = px((layout.offsetX || 0) - pad);
    s.width = px(layout.width || 72);
    s.height = px(layout.height || 72);
    s.borderRadius = "0";
    s.boxShadow = "none";
  }

  function onMessage(e) {
    if (!iframe || e.source !== iframe.contentWindow || e.origin !== appOrigin) return;
    var d = e.data;
    if (!d || d.source !== "arkan-chat") return;
    if (d.type === "ready") {
      ready = true;
      send("host", hostInfo());
      var q = queued;
      queued = [];
      for (var i = 0; i < q.length; i++) iframe.contentWindow.postMessage(q[i], appOrigin);
    } else if (d.type === "layout") {
      layout = d;
      apply();
    }
  }

  // تغییر صفحه بدون بارگذاری مجدد (Astro View Transitions، تم‌های AJAX وردپرس)
  var lastUrl = location.href;
  function pageChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    send("host", hostInfo());
  }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== "function") return;
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(pageChanged, 0);
      return r;
    };
  });
  window.addEventListener("popstate", pageChanged);
  document.addEventListener("astro:page-load", pageChanged);

  function mount() {
    if (iframe) return;
    iframe = document.createElement("iframe");
    iframe.src = appOrigin + "/embed/livechat";
    iframe.title = "چت آنلاین پشتیبانی آرکان گلد";
    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("data-arkan-chat", "");
    iframe.style.cssText =
      "position:fixed;display:none;border:0;margin:0;padding:0;background:transparent;" +
      "color-scheme:normal;z-index:2147483000;overflow:hidden;max-width:100vw;max-height:100vh;";
    document.body.appendChild(iframe);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", apply);
    // دکمه‌های «گفتگو با پشتیبانی» خود سایت
    document.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-arkan-chat-open]") : null;
      if (!el) return;
      e.preventDefault();
      window.ArkanChat.open();
    });
  }

  window.ArkanChat = {
    open: function () {
      send("open");
    },
    close: function () {
      send("close");
    },
  };

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
