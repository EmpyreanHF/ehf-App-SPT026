/* =============================================================================
   EMPYREAN INTERNATIONAL — INTERACTIVE INSIGHTS (STATISTICAL GRAPHICS)
   app-analytics-charts.js  |  Load directly after app-analytics.js.

   TASK: "Implement support for statistical graphics in the analytical
   system — bar chart projections, pie charts, and graphs, with
   interactivity, customization, and real-time data updates,
   comparable to FB/X insights panels."

   ═══════════════════════════════════════════════════════════════════════
   WHY A SEPARATE FILE, NOT AN EDIT TO app-analytics.js
   ═══════════════════════════════════════════════════════════════════════
   app-analytics.js's own header already documents §1 (tracking) and §2
   (dashboard) as intentionally decoupled, agreeing only on the two
   collection names (analytics_daily, analytics_sessions) so a future
   module can render from that same data without touching either half.
   This file is exactly that future module: it duplicates the same tiny
   set of local helpers (_fbOk/_esc/_todayKey/date-key math) rather than
   reaching into app-analytics.js's closure, so both files can keep
   shipping independently. It reads analytics_daily only — never writes
   to it, never touches analytics_sessions, never edits the existing
   #an-* dashboard elements.

   ═══════════════════════════════════════════════════════════════════════
   WHAT THIS ADDS
   ═══════════════════════════════════════════════════════════════════════
   • Trend chart (bar ⇄ line/area toggle) for Page Views / Sessions /
     Avg. Session Duration, over a customizable 7 / 14 / 30 day range.
     Hover shows an exact-value tooltip; clicking a bar/point "pins" that
     day and drives the pie chart below into it.
   • Section-distribution donut/pie chart + linked legend (hover either
     side to highlight the other), built from the same `sections` map
     analytics_daily already stores per day — no new collection.
   • "Live" toggle: subscribes to today's analytics_daily doc via
     onSnapshot so the trend chart's last bar and the pie chart update
     as visits come in, no manual refresh. Unsubscribes on tab-away/
     hidden to avoid a dangling listener, matching this app's existing
     "best-effort, never leak a listener" convention (see the group-call
     presence heartbeat teardown for the same idea).
   • CSV export of the currently-viewed range for offline reporting.

   All rendering is hand-built SVG (no charting library dependency to
   pull in) so it matches this codebase's existing pattern of generating
   its own inline bar chart in app-analytics.js §2b.
   ============================================================================= */

(function empyreanAnalyticsCharts() {
    'use strict';

    if (window._empAnalyticsChartsLoaded) {
        console.warn('[Insights] Already loaded — skipping duplicate.');
        return;
    }
    window._empAnalyticsChartsLoaded = true;

    function log(msg) { console.log('[Insights] ' + msg); }

    // ── Same-shape local helpers, deliberately duplicated (see header) ──
    function _fbOk() { return !!(window._firebaseLoaded && window.fbDb && typeof window.fbDb.collection === 'function'); }
    function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _todayKey(d) { d = d || new Date(); return d.toISOString().slice(0, 10); }
    function _dailyRef(key) { return window.fbDb.collection('analytics_daily').doc(key); }
    function _fmtDuration(totalSeconds) {
        totalSeconds = Math.max(0, Math.round(totalSeconds || 0));
        var m = Math.floor(totalSeconds / 60), s = totalSeconds % 60;
        return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
    }
    function _dateKeysRange(n) {
        var out = [];
        for (var i = n - 1; i >= 0; i--) {
            var d = new Date();
            d.setDate(d.getDate() - i);
            out.push(_todayKey(d));
        }
        return out;
    }

    var PALETTE = ['#1B2B8B', '#C9A66B', '#0EA5A5', '#7C3AED', '#F59E0B', '#EF4444', '#10B981', '#3B82F6'];
    var METRIC_LABELS = { pageViews: 'Page Views', sessions: 'Sessions', sessionSeconds: 'Avg. Duration' };

    var state = {
        range: 14,
        metric: 'pageViews',
        chartType: 'bar',
        live: false,
        selectedDayKey: null,  // null = "today" for the pie chart
        cache: {}              // dateKey -> {pageViews, sessions, sessionSeconds, sections}
    };
    var _unsubLive = null;
    var _lastPieRows = [];
    var _lastPieTotal = 0;

    function _metricValue(day, metric) {
        if (!day) return 0;
        if (metric === 'sessionSeconds') return day.sessions > 0 ? day.sessionSeconds / day.sessions : 0;
        return day[metric] || 0;
    }
    function _fmtMetric(metric, v) { return metric === 'sessionSeconds' ? _fmtDuration(v) : Math.round(v).toLocaleString(); }

    function _fetchMissing(keys) {
        var missing = keys.filter(function (k) { return !state.cache[k]; });
        if (!missing.length || !_fbOk()) return Promise.resolve();
        return Promise.all(missing.map(function (k) {
            return _dailyRef(k).get().then(function (doc) {
                var d = doc.exists ? doc.data() : {};
                state.cache[k] = { pageViews: d.pageViews || 0, sessions: d.sessions || 0, sessionSeconds: d.sessionSeconds || 0, sections: d.sections || {} };
            }).catch(function () {
                state.cache[k] = { pageViews: 0, sessions: 0, sessionSeconds: 0, sections: {} };
            });
        }));
    }

    function _currentSeries() {
        return _dateKeysRange(state.range).map(function (k) {
            return Object.assign({ key: k }, state.cache[k] || { pageViews: 0, sessions: 0, sessionSeconds: 0, sections: {} });
        });
    }

    /* ══════════════════════ CSS (scoped to ic-* only) ══════════════════════ */
    (function injectCSS() {
        if (document.getElementById('ic-css')) return;
        var css = document.createElement('style');
        css.id = 'ic-css';
        css.textContent =
            '.ic-toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:14px;}' +
            '.ic-seg-group{display:inline-flex;background:rgba(10,14,39,0.04);border-radius:10px;padding:3px;gap:2px;}' +
            '.ic-seg-btn{border:none;background:transparent;padding:6px 12px;font-size:0.76rem;font-weight:600;color:var(--text-muted,#9CA3AF);border-radius:8px;cursor:pointer;transition:all .15s;white-space:nowrap;}' +
            '.ic-seg-btn:hover{color:var(--secondary-color,#1B2B8B);}' +
            '.ic-seg-btn.ic-seg-active{background:#fff;color:var(--secondary-color,#1B2B8B);box-shadow:0 1px 4px rgba(10,14,39,0.15);}' +
            '.ic-toggle-btn{padding:7px 14px;border-radius:10px;border:1.5px solid rgba(10,14,39,0.12);background:#fff;color:var(--secondary-color,#1B2B8B);font-weight:700;font-size:0.78rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}' +
            '.ic-toggle-btn.ic-live-on{background:var(--g-teal,#0EA5A5);color:#fff;border-color:transparent;}' +
            '.ic-live-dot{width:8px;height:8px;border-radius:50%;background:#EF4444;display:inline-block;animation:icPulse 1.2s infinite;}' +
            '@keyframes icPulse{0%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(1.4);}100%{opacity:1;transform:scale(1);}}' +
            '.ic-link-btn{border:none;background:none;color:var(--secondary-color,#1B2B8B);font-size:0.76rem;font-weight:700;cursor:pointer;text-decoration:underline;padding:0;}' +
            '.ic-chart-wrap{width:100%;}' +
            '.ic-svg{width:100%;height:220px;display:block;overflow:visible;}' +
            '.ic-bar-rect{fill:var(--g-navy,#1B2B8B);transition:fill .15s;cursor:pointer;}' +
            '.ic-bar:hover .ic-bar-rect{fill:var(--g-teal,#0EA5A5);}' +
            '.ic-bar-rect.ic-bar-selected{fill:var(--g-gold,#C9A66B);}' +
            '.ic-bar{cursor:pointer;}' +
            '.ic-line-dot{fill:var(--g-navy,#1B2B8B);stroke:#fff;stroke-width:1.5;cursor:pointer;transition:r .15s;}' +
            '.ic-bar:hover .ic-line-dot{fill:var(--g-teal,#0EA5A5);}' +
            '.ic-line-dot.ic-bar-selected{fill:var(--g-gold,#C9A66B);}' +
            '.ic-axis-label{font-size:8px;fill:var(--text-muted,#9CA3AF);}' +
            '.ic-pie-row{display:flex;align-items:center;gap:24px;flex-wrap:wrap;}' +
            '.ic-pie-svg-wrap{flex-shrink:0;width:180px;}' +
            '.ic-pie-svg{width:180px;height:180px;display:block;}' +
            '.ic-pie-slice{transition:opacity .15s,stroke-width .15s;cursor:pointer;}' +
            '.ic-pie-slice.ic-pie-dim{opacity:0.25;}' +
            '.ic-pie-total{font-size:22px;font-weight:800;fill:#0A0E27;}' +
            '.ic-pie-total-label{font-size:9px;fill:var(--text-muted,#9CA3AF);}' +
            '.ic-pie-legend{flex:1;min-width:200px;}' +
            '.ic-legend-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;cursor:pointer;transition:background .15s;}' +
            '.ic-legend-row.ic-legend-active{background:rgba(10,14,39,0.05);}' +
            '.ic-legend-swatch{width:10px;height:10px;border-radius:3px;flex-shrink:0;}' +
            '.ic-legend-name{flex:1;font-size:0.8rem;font-weight:600;color:#0A0E27;text-transform:capitalize;}' +
            '.ic-legend-pct{font-size:0.78rem;font-weight:700;color:var(--secondary-color,#1B2B8B);width:36px;text-align:right;}' +
            '.ic-legend-count{font-size:0.72rem;color:var(--text-muted,#9CA3AF);width:50px;text-align:right;}' +
            '.ic-tooltip{position:fixed;z-index:9999;background:#0A0E27;color:#fff;padding:6px 10px;border-radius:8px;font-size:0.74rem;line-height:1.4;pointer-events:none;opacity:0;transition:opacity .1s;box-shadow:0 4px 14px rgba(0,0,0,0.25);white-space:nowrap;}' +
            '@media (max-width:520px){.ic-toolbar{gap:6px;}.ic-seg-btn{padding:6px 8px;font-size:0.7rem;}}';
        document.head.appendChild(css);
    })();

    /* ══════════════════════ Tooltip ══════════════════════ */
    var _tip;
    function _ensureTip() { if (_tip) return _tip; _tip = document.createElement('div'); _tip.id = 'ic-tooltip'; _tip.className = 'ic-tooltip'; document.body.appendChild(_tip); return _tip; }
    function _showTip(html, x, y) { var t = _ensureTip(); t.innerHTML = html; t.style.left = (x + 14) + 'px'; t.style.top = (y + 14) + 'px'; t.style.opacity = '1'; }
    function _hideTip() { if (_tip) _tip.style.opacity = '0'; }

    /* ══════════════════════ Trend chart (bar ⇄ line) ══════════════════════ */
    function _renderTrendChart() {
        var container = document.getElementById('ic-trend-chart');
        if (!container) return;
        var series = _currentSeries();
        var values = series.map(function (d) { return _metricValue(d, state.metric); });
        var max = Math.max.apply(null, values.concat([1]));
        var W = 700, H = 220, padL = 6, padR = 6, padT = 10, padB = 26;
        var innerW = W - padL - padR, innerH = H - padT - padB;
        var n = series.length;
        var slotW = innerW / n;
        var svg = '';

        if (state.chartType === 'bar') {
            var barW = Math.min(30, slotW * 0.55);
            svg += series.map(function (d, i) {
                var v = values[i];
                var h = Math.max(2, Math.round((v / max) * innerH));
                var x = padL + i * slotW + (slotW - barW) / 2;
                var y = padT + innerH - h;
                var isSel = state.selectedDayKey === d.key;
                var label = d.key.slice(5).replace('-', '/');
                return '<g class="ic-bar" data-key="' + _esc(d.key) + '" data-val="' + v + '">' +
                    '<rect x="' + x.toFixed(1) + '" y="' + padT + '" width="' + barW.toFixed(1) + '" height="' + innerH + '" fill="transparent"/>' +
                    '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + barW.toFixed(1) + '" height="' + h + '" rx="4" class="ic-bar-rect' + (isSel ? ' ic-bar-selected' : '') + '"/>' +
                    '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 8) + '" class="ic-axis-label" text-anchor="middle">' + _esc(label) + '</text>' +
                    '</g>';
            }).join('');
        } else {
            var pts = series.map(function (d, i) {
                var v = values[i];
                var x = padL + i * slotW + slotW / 2;
                var y = padT + innerH - Math.round((v / max) * innerH);
                return { x: x, y: y, v: v, key: d.key };
            });
            var pathD = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
            var areaD = pathD + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (padT + innerH) + ' L' + pts[0].x.toFixed(1) + ',' + (padT + innerH) + ' Z';
            svg += '<defs><linearGradient id="icAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
                '<stop offset="0%" stop-color="var(--g-teal,#0EA5A5)" stop-opacity="0.35"/>' +
                '<stop offset="100%" stop-color="var(--g-teal,#0EA5A5)" stop-opacity="0"/></linearGradient></defs>';
            svg += '<path d="' + areaD + '" fill="url(#icAreaGrad)" stroke="none"/>';
            svg += '<path d="' + pathD + '" fill="none" stroke="var(--g-navy,#1B2B8B)" stroke-width="2.5"/>';
            svg += pts.map(function (p, i) {
                var label = p.key.slice(5).replace('-', '/');
                var isSel = state.selectedDayKey === p.key;
                return '<g class="ic-bar" data-key="' + _esc(p.key) + '" data-val="' + p.v + '">' +
                    '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="13" fill="transparent"/>' +
                    '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (isSel ? 5 : 3.5) + '" class="ic-line-dot' + (isSel ? ' ic-bar-selected' : '') + '"/>' +
                    '<text x="' + p.x.toFixed(1) + '" y="' + (H - 8) + '" class="ic-axis-label" text-anchor="middle">' + _esc(label) + '</text>' +
                    '</g>';
            }).join('');
        }
        container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="ic-svg" preserveAspectRatio="none">' + svg + '</svg>';
    }

    /* ══════════════════════ Pie / donut chart + legend ══════════════════════ */
    function _renderPie() {
        var chartEl = document.getElementById('ic-pie-chart');
        var legendEl = document.getElementById('ic-pie-legend');
        var dayLabelEl = document.getElementById('ic-pie-daylabel');
        var resetBtn = document.getElementById('ic-pie-reset');
        if (!chartEl || !legendEl) return;

        var key = state.selectedDayKey || _todayKey();
        if (dayLabelEl) dayLabelEl.textContent = state.selectedDayKey ? key : 'Today';
        if (resetBtn) resetBtn.style.display = state.selectedDayKey ? 'inline-block' : 'none';

        var day = state.cache[key] || {};
        var sections = day.sections || {};
        var rows = Object.keys(sections).map(function (k) { return { name: k, count: sections[k] || 0 }; })
            .filter(function (r) { return r.count > 0; })
            .sort(function (a, b) { return b.count - a.count; })
            .slice(0, 8);
        var total = rows.reduce(function (s, r) { return s + r.count; }, 0);
        _lastPieRows = rows; _lastPieTotal = total;

        if (!rows.length || !total) {
            chartEl.innerHTML = '<div class="emp-an-empty">No section data for this day.</div>';
            legendEl.innerHTML = '';
            return;
        }

        var R = 70, CX = 90, CY = 90, STROKE = 34;
        var circumference = 2 * Math.PI * R;
        var offsetAcc = 0;
        var circles = rows.map(function (r, i) {
            var frac = r.count / total;
            var dash = frac * circumference;
            var gap = circumference - dash;
            var rotate = (offsetAcc / circumference) * 360 - 90;
            offsetAcc += dash;
            var color = PALETTE[i % PALETTE.length];
            return '<circle class="ic-pie-slice" data-idx="' + i + '" cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="' + STROKE + '" stroke-dasharray="' + dash.toFixed(1) + ' ' + gap.toFixed(1) + '" transform="rotate(' + rotate.toFixed(2) + ' ' + CX + ' ' + CY + ')"/>';
        }).join('');

        chartEl.innerHTML = '<svg viewBox="0 0 180 180" class="ic-pie-svg">' + circles +
            '<circle cx="' + CX + '" cy="' + CY + '" r="' + (R - STROKE / 2 - 2) + '" fill="var(--color-surface,#fff)"/>' +
            '<text x="' + CX + '" y="' + (CY - 4) + '" text-anchor="middle" class="ic-pie-total">' + total.toLocaleString() + '</text>' +
            '<text x="' + CX + '" y="' + (CY + 14) + '" text-anchor="middle" class="ic-pie-total-label">visits</text>' +
            '</svg>';

        legendEl.innerHTML = rows.map(function (r, i) {
            var pct = Math.round((r.count / total) * 100);
            var color = PALETTE[i % PALETTE.length];
            return '<div class="ic-legend-row" data-idx="' + i + '">' +
                '<span class="ic-legend-swatch" style="background:' + color + ';"></span>' +
                '<span class="ic-legend-name">' + _esc(r.name.replace(/-/g, ' ')) + '</span>' +
                '<span class="ic-legend-pct">' + pct + '%</span>' +
                '<span class="ic-legend-count">' + r.count.toLocaleString() + '</span>' +
                '</div>';
        }).join('');
    }

    function _highlightPieIdx(idx) {
        document.querySelectorAll('.ic-pie-slice').forEach(function (s) { s.classList.toggle('ic-pie-dim', parseInt(s.getAttribute('data-idx'), 10) !== idx); });
        document.querySelectorAll('.ic-legend-row').forEach(function (r) { r.classList.toggle('ic-legend-active', parseInt(r.getAttribute('data-idx'), 10) === idx); });
    }
    function _clearPieHighlight() {
        document.querySelectorAll('.ic-pie-slice').forEach(function (s) { s.classList.remove('ic-pie-dim'); });
        document.querySelectorAll('.ic-legend-row').forEach(function (r) { r.classList.remove('ic-legend-active'); });
    }

    /* ══════════════════════ Real-time (Live) mode ══════════════════════ */
    function _startLive() {
        if (_unsubLive || !_fbOk()) return;
        var key = _todayKey();
        try {
            _unsubLive = _dailyRef(key).onSnapshot(function (doc) {
                var d = doc.exists ? doc.data() : {};
                state.cache[key] = { pageViews: d.pageViews || 0, sessions: d.sessions || 0, sessionSeconds: d.sessionSeconds || 0, sections: d.sections || {} };
                _renderTrendChart();
                if (!state.selectedDayKey || state.selectedDayKey === key) _renderPie();
            }, function (err) {
                console.warn('[Insights] live listener error:', err && err.message);
                _stopLive();
                _reflectLiveUI();
            });
            log('live mode started (' + key + ').');
        } catch (e) {}
    }
    function _stopLive() {
        if (_unsubLive) { try { _unsubLive(); } catch (e) {} _unsubLive = null; log('live mode stopped.'); }
    }
    function _reflectLiveUI() {
        var btn = document.getElementById('ic-live-toggle');
        var dot = document.getElementById('ic-live-dot');
        if (btn) btn.classList.toggle('ic-live-on', !!state.live);
        if (dot) dot.style.display = state.live ? 'inline-block' : 'none';
    }

    // Don't leave a listener running when the tab/window isn't visible.
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') _stopLive();
        else if (state.live) _startLive();
    });

    /* ══════════════════════ CSV export ══════════════════════ */
    function _exportCSV() {
        var series = _currentSeries();
        var header = 'date,pageViews,sessions,sessionSeconds,avgSessionSeconds\n';
        var rows = series.map(function (d) {
            var avg = d.sessions > 0 ? (d.sessionSeconds / d.sessions).toFixed(1) : '0';
            return [d.key, d.pageViews || 0, d.sessions || 0, d.sessionSeconds || 0, avg].join(',');
        }).join('\n');
        var blob = new Blob([header + rows], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'empyrean-analytics-' + state.range + 'd.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    /* ══════════════════════ Load / toolbar wiring ══════════════════════ */
    function _loadInsights() {
        if (!_fbOk()) {
            var c = document.getElementById('ic-trend-chart'); if (c) c.innerHTML = '<div class="emp-an-empty">Firestore isn\u2019t ready yet \u2014 try again in a moment.</div>';
            var p = document.getElementById('ic-pie-chart'); if (p) p.innerHTML = '';
            var l = document.getElementById('ic-pie-legend'); if (l) l.innerHTML = '';
            return;
        }
        _fetchMissing(_dateKeysRange(state.range)).then(function () {
            _renderTrendChart();
            _renderPie();
        });
    }

    function _setActive(el, sel) {
        var group = el.closest('.ic-seg-group');
        if (!group) return;
        group.querySelectorAll(sel).forEach(function (b) { b.classList.remove('ic-seg-active'); });
        el.classList.add('ic-seg-active');
    }

    document.addEventListener('click', function (e) {
        var t = e.target;
        if (!t.closest) return;

        var rangeBtn = t.closest('[data-range]');
        if (rangeBtn && rangeBtn.closest('#ic-insights-card')) {
            state.range = parseInt(rangeBtn.getAttribute('data-range'), 10);
            _setActive(rangeBtn, '[data-range]');
            _loadInsights();
            return;
        }
        var metricBtn = t.closest('[data-metric]');
        if (metricBtn && metricBtn.closest('#ic-insights-card')) {
            state.metric = metricBtn.getAttribute('data-metric');
            _setActive(metricBtn, '[data-metric]');
            _renderTrendChart();
            return;
        }
        var typeBtn = t.closest('[data-charttype]');
        if (typeBtn && typeBtn.closest('#ic-insights-card')) {
            state.chartType = typeBtn.getAttribute('data-charttype');
            _setActive(typeBtn, '[data-charttype]');
            _renderTrendChart();
            return;
        }
        if (t.closest('#ic-live-toggle')) {
            state.live = !state.live;
            _reflectLiveUI();
            if (state.live) _startLive(); else _stopLive();
            return;
        }
        if (t.closest('#ic-csv-btn')) { _exportCSV(); return; }
        if (t.closest('#ic-pie-reset')) { state.selectedDayKey = null; _renderTrendChart(); _renderPie(); return; }

        var bar = t.closest('.ic-bar');
        if (bar && bar.closest('#ic-trend-chart')) {
            var key = bar.getAttribute('data-key');
            state.selectedDayKey = (state.selectedDayKey === key) ? null : key;
            _renderTrendChart();
            _renderPie();
            return;
        }

        var otherTab = t.closest('.admin-nav-tab');
        if (otherTab && otherTab.getAttribute('data-tab') !== 'admin-analytics-tab') { _stopLive(); _reflectLiveUI(); return; }

        if (t.closest('[data-tab="admin-analytics-tab"]') || t.closest('#an-refresh-btn')) {
            _loadInsights();
            if (state.live) _startLive();
        }
    });

    document.addEventListener('mouseover', function (e) {
        var t = e.target;
        if (!t.closest) return;
        var row = t.closest('.ic-legend-row');
        if (row) { _highlightPieIdx(parseInt(row.getAttribute('data-idx'), 10)); return; }
        var slice = t.closest('.ic-pie-slice');
        if (slice) { _highlightPieIdx(parseInt(slice.getAttribute('data-idx'), 10)); return; }
    });
    document.addEventListener('mouseout', function (e) {
        var t = e.target, related = e.relatedTarget;
        if (!t.closest) return;
        if (t.closest('.ic-legend-row') || t.closest('.ic-pie-slice')) {
            if (!related || !related.closest || !(related.closest('.ic-legend-row') || related.closest('.ic-pie-slice'))) _clearPieHighlight();
        }
    });

    document.addEventListener('mousemove', function (e) {
        var t = e.target;
        if (!t.closest) { _hideTip(); return; }
        var g = t.closest('.ic-bar');
        if (g) {
            var key = g.getAttribute('data-key'), val = g.getAttribute('data-val');
            _showTip('<strong>' + _esc(key) + '</strong><br>' + _esc(METRIC_LABELS[state.metric] || state.metric) + ': ' + _esc(_fmtMetric(state.metric, parseFloat(val))), e.clientX, e.clientY);
            return;
        }
        var slice = t.closest('.ic-pie-slice');
        if (slice) {
            var idx = parseInt(slice.getAttribute('data-idx'), 10);
            var r = _lastPieRows[idx];
            if (r) {
                var pct = _lastPieTotal ? Math.round((r.count / _lastPieTotal) * 100) : 0;
                _showTip('<strong>' + _esc(r.name.replace(/-/g, ' ')) + '</strong><br>' + pct + '% \u2022 ' + r.count.toLocaleString() + ' visits', e.clientX, e.clientY);
                return;
            }
        }
        _hideTip();
    });

    window._empLoadInsights = _loadInsights; // debugging/console use only

    console.log('[EmpyreanInsights] \u2705 Interactive statistical graphics armed \u2014 bar\u2194line trend chart, section donut + legend, live mode, CSV export, all reading analytics_daily only.');

})();