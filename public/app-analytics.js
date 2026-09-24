/* =============================================================================
   EMPYREAN INTERNATIONAL — ANALYTICS MODULE
   app-analytics.js  |  Load near the end, after app-admin.js and app-nav.js
   (both already loaded well before this point in index.html) — this file
   only READS globals/events those two already provide (window.fbDb,
   window._firebaseLoaded, the `empyrean-init-done` and
   `empyrean-section-change` events); it does not need to run before or
   immediately after either of them.

   TASK: "Build an analytical system to track engagement and display
   visitor statistics." — page visits, session duration, user activity,
   via a dedicated reporting module with Firestore (the app's existing
   API layer) integration and a visualization dashboard. Kept fully
   isolated in this one file, additive only: no existing file is edited,
   no existing collection is touched, no existing global is overwritten.

   ═══════════════════════════════════════════════════════════════════════
   WHY THIS MODULE, NOT A NEW SERVICE
   ═══════════════════════════════════════════════════════════════════════
   This app already has one integration layer for reads/writes — Firestore
   via window.fbDb, the same one every other module here uses (users,
   posts, presence, etc). Reusing it means: no new backend, no new auth,
   and admin-only reads can lean on the same Firestore rules the rest of
   the admin panel already relies on. "Integrate with existing APIs" is
   satisfied by writing analytics data through that same client, in two
   collections scoped only to this feature:

     • analytics_sessions/{sessionId}  — one doc per browser session
       (session = one page load until close/reload), tracking pageViews
       and durationSeconds for that session, updated on a heartbeat.
     • analytics_daily/{YYYY-MM-DD}    — one aggregate doc per calendar
       day, updated via FieldValue.increment() from every client, so the
       dashboard can read a handful of small daily docs instead of
       scanning every raw event to build a chart.

   Matches this codebase's existing presence heartbeat pattern
   (app-fix-final.js §11 fixOnlineStatus/_heartbeat) — same idea, same
   best-effort try/catch style, same "gate on _isGuest()" convention so
   an unauthenticated visitor's session never attempts a Firestore write
   that this app's existing rules likely wouldn't allow anyway (that
   convention already exists for the presence collection, and analytics
   follows it rather than guessing at different behavior).

   ═══════════════════════════════════════════════════════════════════════
   WHAT COUNTS AS SCALABLE / MODULAR HERE
   ═══════════════════════════════════════════════════════════════════════
   - Writes are aggregated client-side via FieldValue.increment(), so
     traffic growth adds more small increment writes, not more data the
     dashboard has to read — the dashboard always reads at most ~15 small
     docs (14 days + today) regardless of how many sessions occurred.
   - §1 (tracking) and §2 (dashboard) do not call each other and do not
     share any function — §1 can be reused by any future page/app shell
     that wants the same tracking without pulling in the admin dashboard
     renderer, and §2 could be pointed at a different data source later
     without touching §1. Both only agree on the two collection names.
   - Every Firestore call on both sides is wrapped and best-effort:
     a failed analytics write never surfaces to the visitor, and a failed
     analytics read never blocks the rest of the admin panel.
   ============================================================================= */

(function empyreanAnalytics() {
    'use strict';

    if (window._empAnalyticsLoaded) {
        console.warn('[Analytics] Already loaded — skipping duplicate.');
        return;
    }
    window._empAnalyticsLoaded = true;

    function log(msg) { console.log('[Analytics] ' + msg); }

    // ── Shared helpers — same shape as the equivalents already used
    //    throughout app-fix-final.js / app-admin.js, duplicated locally
    //    (not exposed on window) so this file has zero dependency on
    //    those files' internal closures, matching how every other patch
    //    file here defines its own copies of these same three helpers. ──
    function _fbOk() { return !!(window._firebaseLoaded && window.fbDb && typeof window.fbDb.collection === 'function'); }
    function _us() { return (window.EmpState && window.EmpState.userState) || window.userState || {}; }
    function _isGuest() {
        var s = window.EmpState || {};
        if (s.isGuest != null) return !!s.isGuest;
        if (window.isGuest != null) return !!window.isGuest;
        var u = _us();
        if (u && u.id && u.id !== 'guest' && !String(u.id).startsWith('guest-')) return false;
        return true;
    }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _fv() { return firebase.firestore.FieldValue; }
    function _todayKey(d) { d = d || new Date(); return d.toISOString().slice(0, 10); } // YYYY-MM-DD, lexicographically sortable

    /* =========================================================================
       §1 — TRACKING (runs for every real page load, not just inside admin)
       ========================================================================= */
    var _sessionId = null;
    var _dateKey = null;
    var _lastHeartbeatAt = 0;
    var _heartbeatTimer = null;
    var _readyForSectionEvents = false; // guards against double-counting the boot-restore section change (see app-patch-v40.js's own note on the same event for why that first firing isn't a real user-visible navigation)

    function _sessionDocRef() { return window.fbDb.collection('analytics_sessions').doc(_sessionId); }
    function _dailyDocRef(key) { return window.fbDb.collection('analytics_daily').doc(key); }

    function _incrementDaily(fields) {
        if (!_fbOk()) return;
        try { _dailyDocRef(_dateKey).set(fields, { merge: true }); } catch (e) {}
    }

    function _startSession() {
        if (_isGuest() || !_fbOk()) { log('tracking skipped (guest or Firestore not ready).'); return; }
        if (_sessionId) return; // already started this page load

        _sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        _dateKey = _todayKey();
        _lastHeartbeatAt = Date.now();

        var u = _us();
        var initialSection = (document.querySelector('.content-section.active') || {}).id || 'dashboard';

        try {
            _sessionDocRef().set({
                uid: u.id || null,
                dateKey: _dateKey,
                startedAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                durationSeconds: 0,
                pageViews: 1,
                userAgent: navigator.userAgent || null
            });
        } catch (e) {}

        var sectionInc = {};
        sectionInc['sections.' + initialSection] = _fv().increment(1);
        _incrementDaily(Object.assign({ pageViews: _fv().increment(1), sessions: _fv().increment(1) }, sectionInc));

        _readyForSectionEvents = true;
        _heartbeatTimer = setInterval(_heartbeat, 20000); // same 20s cadence app-patch-group-call.js already uses for its own presence heartbeat — established interval for "cheap, frequent enough" liveness pings in this codebase
        log('session started (' + _sessionId + ').');
    }

    function _heartbeat() {
        if (!_sessionId || !_fbOk()) return;
        var now = Date.now();
        var deltaSeconds = Math.max(0, Math.round((now - _lastHeartbeatAt) / 1000));
        _lastHeartbeatAt = now;
        if (deltaSeconds <= 0) return;
        try {
            _sessionDocRef().set({ lastSeen: new Date().toISOString(), durationSeconds: _fv().increment(deltaSeconds) }, { merge: true });
        } catch (e) {}
        _incrementDaily({ sessionSeconds: _fv().increment(deltaSeconds) });
    }

    function _recordPageview(sectionId) {
        if (!_sessionId || !_fbOk() || !sectionId) return;
        try {
            _sessionDocRef().set({ pageViews: _fv().increment(1), lastSeen: new Date().toISOString() }, { merge: true });
        } catch (e) {}
        var sectionInc = {};
        sectionInc['sections.' + sectionId] = _fv().increment(1);
        _incrementDaily(Object.assign({ pageViews: _fv().increment(1) }, sectionInc));
    }

    document.addEventListener('empyrean-init-done', function () { _startSession(); });

    document.addEventListener('empyrean-section-change', function (e) {
        if (!_readyForSectionEvents) return; // boot-restore nav, already counted as the session's initial view in _startSession()
        var id = e && e.detail && e.detail.section;
        if (id) _recordPageview(id);
    });

    // Best-effort final flush. A killed tab/process can still skip this —
    // same inherent limitation app-fix-final.js's own presence _markOffline
    // already documents for the exact same reason (no server-side
    // onDisconnect() in Firestore) — the periodic heartbeat above is what
    // keeps the data close to accurate even when this never fires.
    window.addEventListener('pagehide', function () { _heartbeat(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') _heartbeat(); });

    /* =========================================================================
       §2 — ADMIN DASHBOARD (reporting + visualization)
       Wholly separate from §1 above — reads the same two collections but
       shares no function/state with the tracker.
       ========================================================================= */
    var DAYS_BACK = 14;
    var _chartCache = null;

    function _fmtDuration(totalSeconds) {
        totalSeconds = Math.max(0, Math.round(totalSeconds || 0));
        var m = Math.floor(totalSeconds / 60), s = totalSeconds % 60;
        return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
    }

    function _lastNDateKeys(n) {
        var out = [];
        for (var i = n - 1; i >= 0; i--) {
            var d = new Date();
            d.setDate(d.getDate() - i);
            out.push(_todayKey(d));
        }
        return out;
    }

    function _fetchDailyDocs(keys) {
        return Promise.all(keys.map(function (k) {
            return _dailyDocRef(k).get().then(function (doc) {
                var d = doc.exists ? doc.data() : {};
                return {
                    key: k,
                    pageViews: d.pageViews || 0,
                    sessions: d.sessions || 0,
                    sessionSeconds: d.sessionSeconds || 0,
                    sections: d.sections || {}
                };
            }).catch(function () {
                return { key: k, pageViews: 0, sessions: 0, sessionSeconds: 0, sections: {} };
            });
        }));
    }

    function _fetchTotalUsers() {
        if (!_fbOk()) return Promise.resolve(null);
        // Bounded read, same cap convention app-admin.js's own
        // _loadAllUsers() already uses for the User Management tab —
        // consistent with how this codebase already trades exactness
        // for a bounded read cost elsewhere in the admin panel.
        return window.fbDb.collection('users').limit(500).get().then(function (snap) {
            return { count: snap.size, truncated: snap.size >= 500 };
        }).catch(function () { return null; });
    }

    /* ── §2a — inject CSS once, scoped to this module's own ids/classes only ── */
    (function injectCSS() {
        if (document.getElementById('emp-analytics-css')) return;
        var css = document.createElement('style');
        css.id = 'emp-analytics-css';
        css.textContent =
            '.emp-an-bars{display:flex;align-items:flex-end;gap:6px;height:150px;padding:10px 4px 0;}' +
            '.emp-an-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0;}' +
            '.emp-an-bar{width:100%;max-width:26px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,var(--g-gold,#C9A66B),var(--g-navy,#1B2B8B));transition:height .3s ease;min-height:2px;}' +
            '.emp-an-bar-label{font-size:0.62rem;color:var(--text-muted,#9CA3AF);margin-top:6px;white-space:nowrap;transform:rotate(0deg);}' +
            '.emp-an-bar-count{font-size:0.62rem;color:var(--text-muted,#9CA3AF);margin-bottom:2px;}' +
            '.emp-an-section-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(10,14,39,0.06);}' +
            '.emp-an-section-row:last-child{border-bottom:none;}' +
            '.emp-an-section-name{width:130px;flex-shrink:0;font-size:0.8rem;font-weight:600;color:#0A0E27;text-transform:capitalize;}' +
            '.emp-an-section-track{flex:1;height:10px;border-radius:6px;background:rgba(10,14,39,0.06);overflow:hidden;}' +
            '.emp-an-section-fill{height:100%;border-radius:6px;background:linear-gradient(90deg,var(--g-navy,#1B2B8B),var(--g-teal,#0EA5A5));}' +
            '.emp-an-section-count{width:36px;text-align:right;flex-shrink:0;font-size:0.78rem;font-weight:700;color:#374151;}' +
            '.emp-an-refresh-btn{padding:8px 16px;border-radius:10px;border:1.5px solid rgba(10,14,39,0.12);background:white;color:var(--secondary,#1B2B8B);font-weight:700;font-size:0.8rem;cursor:pointer;}' +
            '.emp-an-refresh-btn:disabled{opacity:0.5;cursor:default;}' +
            '.emp-an-empty{text-align:center;color:#9CA3AF;padding:20px;font-size:0.85rem;}';
        document.head.appendChild(css);
    })();

    /* ── §2b — render into the static skeleton index.html provides ── */
    function _renderStats(daily, todayKey, usersInfo) {
        var today = daily.filter(function (d) { return d.key === todayKey; })[0] || { pageViews: 0, sessions: 0, sessionSeconds: 0 };
        var avgDuration = today.sessions > 0 ? today.sessionSeconds / today.sessions : 0;

        var pv = document.getElementById('an-stat-pageviews');
        var ss = document.getElementById('an-stat-sessions');
        var ad = document.getElementById('an-stat-avgduration');
        var tu = document.getElementById('an-stat-totalusers');
        if (pv) pv.textContent = today.pageViews.toLocaleString();
        if (ss) ss.textContent = today.sessions.toLocaleString();
        if (ad) ad.textContent = _fmtDuration(avgDuration);
        if (tu) tu.textContent = usersInfo ? (usersInfo.count.toLocaleString() + (usersInfo.truncated ? '+' : '')) : '—';
    }

    function _renderChart(daily) {
        var container = document.getElementById('an-daily-chart');
        if (!container) return;
        var max = Math.max(1, Math.max.apply(null, daily.map(function (d) { return d.pageViews; })));
        var html = '<div class="emp-an-bars">' + daily.map(function (d) {
            var h = Math.round((d.pageViews / max) * 120);
            var label = d.key.slice(5).replace('-', '/'); // MM/DD
            return '<div class="emp-an-bar-col">' +
                '<div class="emp-an-bar-count">' + (d.pageViews || '') + '</div>' +
                '<div class="emp-an-bar" style="height:' + Math.max(h, 2) + 'px;" title="' + _esc(d.key) + ': ' + d.pageViews + ' page views"></div>' +
                '<div class="emp-an-bar-label">' + _esc(label) + '</div>' +
                '</div>';
        }).join('') + '</div>';
        container.innerHTML = html;
    }

    function _renderTopSections(daily, todayKey) {
        var container = document.getElementById('an-top-sections');
        if (!container) return;
        var today = daily.filter(function (d) { return d.key === todayKey; })[0];
        var sections = (today && today.sections) || {};
        var rows = Object.keys(sections).map(function (k) { return { name: k, count: sections[k] || 0 }; })
            .sort(function (a, b) { return b.count - a.count; })
            .slice(0, 8);

        if (!rows.length) {
            container.innerHTML = '<div class="emp-an-empty">No section visits recorded yet today.</div>';
            return;
        }
        var max = Math.max.apply(null, rows.map(function (r) { return r.count; }));
        container.innerHTML = rows.map(function (r) {
            var pct = Math.max(4, Math.round((r.count / max) * 100));
            return '<div class="emp-an-section-row">' +
                '<div class="emp-an-section-name">' + _esc(r.name.replace(/-/g, ' ')) + '</div>' +
                '<div class="emp-an-section-track"><div class="emp-an-section-fill" style="width:' + pct + '%;"></div></div>' +
                '<div class="emp-an-section-count">' + r.count + '</div>' +
                '</div>';
        }).join('');
    }

    function loadAnalyticsDashboard() {
        var btn = document.getElementById('an-refresh-btn');
        var errBox = document.getElementById('an-error-box');
        if (errBox) errBox.style.display = 'none';

        if (!_fbOk()) {
            if (errBox) { errBox.textContent = 'Firestore isn\u2019t ready yet — try again in a moment.'; errBox.style.display = 'block'; }
            return;
        }
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading…'; }

        var keys = _lastNDateKeys(DAYS_BACK);
        var todayKey = keys[keys.length - 1];

        Promise.all([_fetchDailyDocs(keys), _fetchTotalUsers()]).then(function (results) {
            var daily = results[0];
            var usersInfo = results[1];
            _chartCache = daily;
            _renderStats(daily, todayKey, usersInfo);
            _renderChart(daily);
            _renderTopSections(daily, todayKey);
        }).catch(function (err) {
            console.warn('[Analytics] dashboard load failed:', err && err.message);
            if (errBox) { errBox.textContent = 'Could not load analytics: ' + _esc(err && err.message); errBox.style.display = 'block'; }
        }).finally(function () {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh'; }
        });
    }

    // Load whenever the Analytics admin tab is opened (delegated so it
    // works whether the button exists at script-load time or is added
    // later — same delegation approach app-admin.js's own tab wiring and
    // v37/v39/v40 all already use for exactly this reason).
    document.addEventListener('click', function (e) {
        if (!e.target.closest) return;
        if (e.target.closest('[data-tab="admin-analytics-tab"]')) loadAnalyticsDashboard();
        if (e.target.closest('#an-refresh-btn')) loadAnalyticsDashboard();
    });

    window._empLoadAnalyticsDashboard = loadAnalyticsDashboard; // exposed for debugging/console use only, nothing else in this app calls it

    console.log('[EmpyreanAnalytics] \u2705 Engagement tracking armed (page views + session duration \u2014 authenticated users only, matching this codebase\u2019s existing presence-write convention) and the admin Analytics tab wired to render from analytics_daily/analytics_sessions on open.');

})();