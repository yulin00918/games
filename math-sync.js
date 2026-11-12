/* 數學練習：雲端進度同步（Google 試算表）
 * 網址是《我的100分挑戰》的 Apps Script（同一組名單和密碼）。留空 = 只存在這台裝置。 */
var MATH_SYNC_URL = "var MATH_SYNC_URL = "";";

(function () {
  "use strict";
  var KEYS = { "gcdlcm50.v1": 50, "frac-add.v1": 50, "frac-md.v1": 50, "frac-four.v1": 50, "frac-dec.v1": 50,
               "frac-ratio.v1": 50, "frac-circle.v1": 50, "frac-prism.v1": 50, "pm100.v1": 100, "pmMD100.v1": 100 };
  var LOGIN = "mathLogin", OWNER = "mathOwner";
  var ls = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var enabled = !!MATH_SYNC_URL;
  var user = null, badge = null, timers = {}, pending = {};

  function call(req) {
    // text/plain 是「簡單請求」，不會觸發 CORS 預檢，Apps Script 可以直接收
    return fetch(MATH_SYNC_URL, { method: "POST", body: JSON.stringify(req), redirect: "follow" })
      .then(function (r) { return r.json(); });
  }
  function cred() { return { cls: user.cls, seat: user.seat, pin: user.pin }; }

  /* ---------- 介面 ---------- */
  var CSS = ".ms-badge{position:fixed;left:max(10px,env(safe-area-inset-left,0px));bottom:max(10px,env(safe-area-inset-bottom,0px));z-index:40;display:flex;align-items:center;gap:8px;" +
    "background:var(--card,#fff);color:var(--ink,#1b2729);border:1px solid var(--line,#d3ddda);border-radius:999px;padding:5px 6px 5px 12px;font:600 13px/1.3 var(--f-body,system-ui);box-shadow:0 6px 16px -10px rgba(0,0,0,.4)}" +
    ".ms-badge .st{font-weight:500;color:var(--ink-2,#56666a)}.ms-badge .st.bad{color:var(--neg,#cc3a26)}" +
    ".ms-badge button{font:inherit;border:1px solid var(--line,#d3ddda);background:var(--card-2,#f5f8f7);color:inherit;border-radius:999px;padding:2px 10px;cursor:pointer}" +
    ".ms-mask{position:fixed;inset:0;z-index:60;background:rgba(10,20,22,.55);display:grid;place-items:center;padding:16px}" +
    ".ms-box{background:var(--card,#fff);color:var(--ink,#1b2729);border-radius:16px;padding:22px;width:min(380px,100%);box-shadow:0 20px 50px -10px rgba(0,0,0,.5);font-family:var(--f-body,system-ui)}" +
    ".ms-box h2{font-family:var(--f-display,serif);font-size:1.6em;margin:0 0 4px}.ms-box p{margin:0 0 12px;color:var(--ink-2,#56666a);font-size:.92em}" +
    ".ms-box label{display:block;font-size:.85em;font-weight:700;color:var(--ink-2,#56666a);margin-top:10px}" +
    ".ms-box input{display:block;width:100%;font:600 1.3em var(--f-num,monospace);padding:.35em .5em;margin-top:4px;border:2px solid var(--line,#d3ddda);border-radius:10px;background:var(--card-2,#f5f8f7);color:inherit;box-sizing:border-box}" +
    ".ms-box .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ms-err{color:var(--neg,#cc3a26);min-height:1.4em;font-size:.9em;margin-top:8px;font-weight:700}" +
    ".ms-go{margin-top:10px;width:100%;font:700 1.05em var(--f-body,system-ui);background:var(--ink,#1b2729);color:var(--card,#fff);border:0;border-radius:10px;padding:.7em;cursor:pointer}" +
    ".ms-skip{margin-top:8px;width:100%;font:500 .9em var(--f-body,system-ui);background:none;color:var(--ink-2,#56666a);border:0;cursor:pointer;text-decoration:underline}";
  function css() { if (document.getElementById("ms-css")) return; var s = document.createElement("style"); s.id = "ms-css"; s.textContent = CSS; document.head.appendChild(s); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function setBadge(text, bad) {
    if (!badge) {
      badge = document.createElement("div"); badge.className = "ms-badge"; document.body.appendChild(badge); document.body.style.paddingBottom = "72px";
    }
    badge.innerHTML = '<span>' + esc(user.name || (user.cls + "-" + user.seat)) + '</span><span class="st' + (bad ? ' bad' : '') + '">' + esc(text) + '</span><button type="button">換人</button>';
    badge.querySelector("button").onclick = logout;
  }
  function form(msg) {
    return new Promise(function (resolve) {
      var last = ls.get(LOGIN) || {};
      var m = document.createElement("div"); m.className = "ms-mask";
      m.innerHTML = '<form class="ms-box" autocomplete="off"><h2>登入</h2><p>用老師給的密碼登入，換裝置也能接著做。</p>' +
        '<div class="row"><label>班級<input name="cls" inputmode="numeric" maxlength="6" placeholder="例如 701" value="' + esc(last.cls || "") + '"></label>' +
        '<label>座號<input name="seat" inputmode="numeric" maxlength="3" value=""></label></div>' +
        '<label>密碼（4 位數）<input name="pin" inputmode="numeric" maxlength="4" type="password"></label>' +
        '<div class="ms-err">' + esc(msg || "") + '</div><button class="ms-go" type="submit">登入</button>' +
        '<button class="ms-skip" type="button">先不登入（進度只存在這台裝置）</button></form>';
      document.body.appendChild(m);
      var f = m.querySelector("form"), err = m.querySelector(".ms-err");
      setTimeout(function () { try { f[last.cls ? "seat" : "cls"].focus(); } catch (e) {} }, 50);
      m.querySelector(".ms-skip").onclick = function () { m.remove(); resolve(null); };
      f.onsubmit = function (e) {
        e.preventDefault();
        var c = { cls: f.cls.value.trim(), seat: f.seat.value.trim(), pin: f.pin.value.trim() };
        if (!c.cls || !c.seat || !c.pin) { err.textContent = "班級、座號、密碼都要填。"; return; }
        err.textContent = "登入中…"; f.querySelector(".ms-go").disabled = true;
        call({ action: "login", cls: c.cls, seat: c.seat, pin: c.pin }).then(function (r) {
          if (!r.ok) { err.textContent = r.err || "登入失敗"; f.querySelector(".ms-go").disabled = false; return; }
          m.remove(); resolve({ c: c, r: r });
        }).catch(function () { err.textContent = "連不上網路，請稍後再試。"; f.querySelector(".ms-go").disabled = false; });
      };
    });
  }

  /* ---------- 合併本機與雲端 ---------- */
  function merge(serverData) {
    var me = user.cls + "-" + user.seat;
    if (ls.get(OWNER) !== me) { Object.keys(KEYS).forEach(function (k) { ls.del(k); }); ls.set(OWNER, me); }
    Object.keys(KEYS).forEach(function (k) {
      var n = KEYS[k], local = ls.get(k), srv = serverData[k] || null;
      var lres = local && Array.isArray(local.res) && local.res.length === n ? local.res : null;
      if (!lres && !srv) return;
      var merged = [], changed = false;
      for (var i = 0; i < n; i++) {
        var a = lres ? lres[i] : null, b = srv ? srv[i] : null;
        merged.push(a || b || null);
        if ((a || null) !== (b || null) && a) changed = true;
      }
      var obj = local && typeof local === "object" ? local : { lv: 1 };
      obj.res = merged; obj.name = user.name || obj.name || "";
      ls.set(k, obj);
      if (changed) push(k);
    });
  }
  function push(key) {
    if (!enabled || !user || !KEYS[key]) return;
    pending[key] = true;
    clearTimeout(timers[key]);
    timers[key] = setTimeout(function () {
      var obj = ls.get(key); if (!obj || !Array.isArray(obj.res)) return;
      setBadge("存檔中…");
      call({ action: "save", cls: user.cls, seat: user.seat, pin: user.pin, key: key, res: obj.res }).then(function (r) {
        if (r.ok) { delete pending[key]; setBadge(Object.keys(pending).length ? "存檔中…" : "已存到雲端 ✓"); }
        else if (r.auth) { setBadge("登入過期", true); }
        else setBadge("存檔失敗，下一題會再試", true);
      }).catch(function () { setBadge("沒有網路，先存在這台裝置", true); });
    }, 700);
  }
  function logout() {
    Object.keys(KEYS).forEach(function (k) { ls.del(k); });
    ls.del(LOGIN); ls.del(OWNER);
    location.reload();
  }

  /* ---------- 頁面呼叫 ---------- */
  function start(onReady) {
    if (!enabled) { onReady(null); return; }
    css();
    var saved = ls.get(LOGIN);
    function done(c, r) {
      user = { cls: r.cls || c.cls, seat: r.seat || c.seat, pin: c.pin, name: r.name || "" };
      ls.set(LOGIN, { cls: user.cls, seat: user.seat, pin: user.pin, name: user.name });
      merge(r.data || {});
      setBadge("已同步 ✓");
      onReady(user);
    }
    function ask(msg) {
      form(msg).then(function (x) {
        if (!x) { enabled = false; onReady(null); return; }
        done(x.c, x.r);
      });
    }
    if (saved && saved.pin) {
      call({ action: "login", cls: saved.cls, seat: saved.seat, pin: saved.pin }).then(function (r) {
        if (r.ok) done(saved, r); else ask(r.err);
      }).catch(function () {
        // 離線：先用本機進度，有網路時再存
        user = saved; setBadge("沒有網路，先存在這台裝置", true); onReady(user);
      });
    } else ask("");
  }
  window.MathSync = { enabled: enabled, start: start, push: push, logout: logout };
})();
