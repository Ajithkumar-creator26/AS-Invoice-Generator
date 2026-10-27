/* ===================================================================
   AS INVOICE GENERATOR — "Recently Deleted"
   trash.js

   Put this file next to as_bridal_invoice.html in the repo, then add
   ONE line to that file, immediately before the closing </body> tag:

       <script src="trash.js"></script>

   It must sit AFTER the app's own </script>, not inside it.

   Requires feature_invoice_trash.sql to have been run in Supabase.

   Depends on nothing in the app — its own network calls, styling and
   toast — so it works wherever it is loaded and in any script order.
   =================================================================== */

(function(){
  'use strict';

  /* ---------- config ----------
     Uses the app's own values when they are reachable, otherwise falls
     back to these. If you ever rotate the anon key, update it here too. */
  var HOST = (typeof window.SB_HOST === 'string' && window.SB_HOST) ||
             'https://tgvuoesnzolpjppyrage.supabase.co';
  var ANON = (typeof window.SB_ANON === 'string' && window.SB_ANON) ||
             'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndnVvZXNuem9scGpwcHlyYWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MzA4NTEsImV4cCI6MjEwMjMwNjg1MX0.X5xtjuyR17ySI8AqcZ4XI-bImNpuRVoqt92zi2w1P38';
  var RPC  = HOST.replace(/\/+$/, '') + '/rest/v1/rpc/';

  var MODAL = 'asigTrashModal';
  var busy = false;

  /* ---------- the app's session, read straight from storage ---------- */
  function token(){
    if (window.session && window.session.access_token) return window.session.access_token;
    try {
      var raw = localStorage.getItem('asig_session');
      if (raw) { var s = JSON.parse(raw); if (s && s.access_token) return s.access_token; }
    } catch (e) {}
    return null;
  }

  async function rpc(fn, args){
    var tok = token();
    if (!tok) throw new Error('NOT_SIGNED_IN');
    var r = await fetch(RPC + fn, {
      method: 'POST',
      headers: {
        'apikey': ANON,
        'Authorization': 'Bearer ' + tok,
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public'
      },
      body: JSON.stringify(args || {})
    });
    var txt = await r.text();
    var data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!r.ok) {
      var msg = (data && (data.message || data.msg || data.hint)) || ('HTTP ' + r.status);
      var err = new Error(msg); err.status = r.status; throw err;
    }
    return data;
  }

  /* ---------- small helpers, no app dependency ---------- */
  function esc(s){
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function dmy(s){
    if (!s) return '—';
    var d = new Date(String(s).length <= 10 ? s + 'T00:00:00' : s);
    if (isNaN(d)) return esc(s);
    return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  }
  function money(v){
    if (v === null || v === undefined || v === '') return '—';
    var n = parseFloat(v);
    return isNaN(n) ? esc(v) : '₹ ' + n.toFixed(2);
  }
  function say(msg, bad){
    if (typeof window.toast === 'function') { try { window.toast(msg, bad); return; } catch (e) {} }
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:10001;' +
      'background:' + (bad ? '#C0392B' : '#2E7D32') + ';color:#fff;padding:11px 18px;' +
      "border-radius:8px;font-size:13px;font-family:'Open Sans',sans-serif;" +
      'box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:88vw';
    document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3600);
  }

  /* ---------- the button ---------- */
  function addNavItem(){
    if (document.getElementById('tabTrash')) return true;

    var nav = document.querySelector('.sb-nav');
    if (nav) {
      var b = document.createElement('button');
      b.className = 'snav';
      b.id = 'tabTrash';
      b.type = 'button';
      b.addEventListener('click', openTrash);
      b.innerHTML = '<span class="snav-ico">\u{1F5D1}</span>' +
                    '<span class="snav-lbl">Recently Deleted</span>';
      var sep = nav.querySelector('.sb-sep');
      if (sep) nav.insertBefore(b, sep); else nav.appendChild(b);
      return true;
    }

    var f = document.createElement('button');
    f.id = 'tabTrash';
    f.type = 'button';
    f.textContent = '\u{1F5D1} Recently Deleted';
    f.addEventListener('click', openTrash);
    f.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9997;' +
      'background:#5C0F28;color:#C9A844;border:none;border-radius:8px;' +
      'padding:10px 15px;font-size:12px;font-weight:700;cursor:pointer;' +
      "font-family:'Open Sans',sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)";
    document.body.appendChild(f);
    return true;
  }

  /* ---------- modal ---------- */
  function shell(){
    var m = document.getElementById(MODAL);
    if (m) return m;
    m = document.createElement('div');
    m.id = MODAL;
    m.style.cssText = 'position:fixed;inset:0;background:rgba(40,6,18,.55);' +
      'display:none;align-items:center;justify-content:center;z-index:9998;padding:20px';
    m.addEventListener('click', function(e){ if (e.target === m) closeTrash(); });
    document.body.appendChild(m);
    return m;
  }

  function show(html){
    var m = shell();
    m.innerHTML =
      '<div style="background:#fff;border-radius:12px;max-width:820px;width:100%;' +
      'max-height:86vh;overflow:auto;box-shadow:0 18px 50px rgba(40,6,18,.3);' +
      "font-family:'Open Sans',sans-serif;color:#3A2A24\">" +
        '<div style="display:flex;align-items:center;justify-content:space-between;' +
        'padding:18px 22px;border-bottom:1px solid #F0E8E0;position:sticky;top:0;background:#fff">' +
          '<h2 style="font-family:\'Playfair Display\',serif;font-size:19px;color:#5C0F28;margin:0">' +
          '\u{1F5D1} Recently Deleted</h2>' +
          '<button type="button" data-asig="close" style="background:0;border:none;font-size:22px;' +
          'color:#A08878;cursor:pointer;line-height:1;padding:0 4px">×</button>' +
        '</div>' +
        '<div style="padding:18px 22px">' + html + '</div>' +
      '</div>';
    m.style.display = 'flex';
    wire(m);
  }

  /* delegated handlers — no inline onclick, so nothing depends on globals */
  function wire(m){
    m.querySelectorAll('[data-asig]').forEach(function(el){
      el.onclick = function(){
        var a = el.getAttribute('data-asig');
        if (a === 'close')   return closeTrash();
        if (a === 'restore') return restore(el.getAttribute('data-id'));
        if (a === 'purge')   return purge(el.getAttribute('data-id'), el.getAttribute('data-no'));
        if (a === 'recent')  return restoreRecent();
      };
    });
  }

  function note(txt, colour){
    return '<div style="padding:30px 10px;text-align:center;color:' + (colour || '#BBB') +
           ';font-size:12.5px;line-height:1.8">' + txt + '</div>';
  }

  function openTrash(){ show(note('⏳ Loading…')); load(); }

  async function load(){
    try {
      draw((await rpc('trash_invoices', {})) || []);
    } catch (e) {
      var msg = (e && e.message) || '';
      if (msg === 'NOT_SIGNED_IN' || e.status === 401) {
        show(note('Sign in to the app first, then reopen this.', '#96660F'));
      } else if (/trash_invoices|PGRST202|could not find|does not exist/i.test(msg) || e.status === 404) {
        show(note('This needs the database part first.<br><br>' +
                  'Run <b>feature_invoice_trash.sql</b> in Supabase, then reopen this.', '#96660F'));
      } else {
        show(note('Could not load deleted invoices.<br>' +
                  '<span style="font-size:11px">' + esc(msg) + '</span>', '#C0392B'));
      }
    }
  }

  function draw(rows){
    if (!rows.length) {
      show(note('Nothing deleted.<br>Invoices you delete will wait here until you ' +
                'restore them or remove them for good.'));
      return;
    }
    var body = rows.map(function(r){
      var d = r.days_in_trash;
      var when = (d === 0) ? 'today' : (d === 1) ? 'yesterday' : d + ' days ago';
      return '<tr style="border-bottom:1px solid #F7F1EC">' +
        '<td style="padding:11px 10px;white-space:nowrap"><b style="color:#7A1535">' +
          esc(r.invoice_no || '—') + '</b>' +
          '<div style="font-size:9.5px;color:#AAA">deleted ' + when + '</div></td>' +
        '<td style="padding:11px 10px">' + esc(r.customer_name || '—') + '</td>' +
        '<td style="padding:11px 10px;font-size:11.5px;color:#777;white-space:nowrap">' +
          dmy(r.invoice_date) + '</td>' +
        '<td style="padding:11px 10px;font-weight:700;white-space:nowrap">' + money(r.total) + '</td>' +
        '<td style="padding:11px 10px;text-align:right;white-space:nowrap">' +
          '<button type="button" data-asig="restore" data-id="' + esc(r.id) + '" ' +
            'style="background:#E8F5E9;color:#2E7D32;border:1.5px solid #CFE6D2;border-radius:6px;' +
            'padding:6px 13px;font-size:11.5px;font-weight:800;cursor:pointer;' +
            "font-family:'Open Sans',sans-serif\">Restore</button> " +
          '<button type="button" data-asig="purge" data-id="' + esc(r.id) + '" ' +
            'data-no="' + esc(r.invoice_no || '') + '" ' +
            'style="background:#fff;color:#C0392B;border:1.5px solid #F0CFCB;border-radius:6px;' +
            'padding:6px 11px;font-size:11.5px;font-weight:700;cursor:pointer;' +
            "font-family:'Open Sans',sans-serif\">Delete forever</button>" +
        '</td></tr>';
    }).join('');

    show(
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;' +
      'flex-wrap:wrap;margin-bottom:12px">' +
        '<span style="font-size:12px;color:#777">' + rows.length + ' deleted invoice' +
        (rows.length === 1 ? '' : 's') +
        '. Restoring one brings its refunds and shipment back with it.</span>' +
        '<button type="button" data-asig="recent" style="background:#C9A844;color:#5C0F28;' +
        'border:none;border-radius:7px;padding:8px 14px;font-size:11.5px;font-weight:800;' +
        "cursor:pointer;font-family:'Open Sans',sans-serif\">Restore everything from today</button>" +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
      '<thead><tr style="border-bottom:2px solid #F5EDE8">' +
      ['Invoice','Customer','Date','Amount',''].map(function(h){
        return '<th style="text-align:left;padding:8px 10px;font-size:9.5px;letter-spacing:1px;' +
               'text-transform:uppercase;color:#BBB;font-weight:700">' + h + '</th>';
      }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>'
    );
  }

  async function restore(id){
    if (busy) return; busy = true;
    try {
      var res = String(await rpc('restore_invoice', { p_id: id }) || 'restored');
      var bad = /not yours|not found|not deleted/i.test(res);
      say(bad ? res : '✓ ' + res, bad);
      if (!bad) await refreshApp();
      await load();
    } catch (e) { say('Could not restore: ' + ((e && e.message) || ''), true); }
    finally { busy = false; }
  }

  async function purge(id, no){
    if (busy) return;
    if (!confirm('Permanently delete ' + (no || 'this invoice') + '?\n\n' +
                 'This also removes its refunds and shipment record, and cannot be undone.')) return;
    busy = true;
    try {
      var res = String(await rpc('purge_invoice', { p_id: id }) || 'deleted');
      var bad = /refusing|not yours|not found/i.test(res);
      say(bad ? res : '✓ ' + res, bad);
      await load();
    } catch (e) { say('Could not delete: ' + ((e && e.message) || ''), true); }
    finally { busy = false; }
  }

  async function restoreRecent(){
    if (busy) return; busy = true;
    try {
      var rows = await rpc('restore_recent', { p_hours: 24 });
      var n = (rows && rows.length) || 0;
      say(n ? ('✓ Restored ' + n + ' invoice' + (n === 1 ? '' : 's'))
            : 'Nothing was deleted in the last 24 hours', !n);
      if (n) await refreshApp();
      await load();
    } catch (e) { say('Could not restore: ' + ((e && e.message) || ''), true); }
    finally { busy = false; }
  }

  /* bring the dashboard back in step. Never reload the page by itself —
     that would throw away whatever the person was in the middle of. */
  var needsRefresh = false;
  async function refreshApp(){
    if (typeof window.loadDash === 'function') {
      try { await window.loadDash(); needsRefresh = false; return; } catch (e) {}
    }
    needsRefresh = true;
  }

  function closeTrash(){
    var m = document.getElementById(MODAL);
    if (m) m.style.display = 'none';
    if (needsRefresh) { needsRefresh = false; say('Refresh the page to see the restored invoice'); }
  }

  window.asigOpenTrash = openTrash;

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') closeTrash();
  });

  /* The sidebar may not exist yet. Try now, on DOM ready, on load, and then
     a few times after, so placement never depends on script order. */
  function tryAdd(){ try { addNavItem(); } catch (e) {} }
  tryAdd();
  document.addEventListener('DOMContentLoaded', tryAdd);
  window.addEventListener('load', tryAdd);
  var tries = 0;
  var iv = setInterval(function(){
    tryAdd();
    if (++tries > 10 || document.querySelector('.sb-nav #tabTrash')) clearInterval(iv);
  }, 500);

  console.log('Recently Deleted: ready. Open it from the sidebar, or run asigOpenTrash() here.');
})();
