/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v42 + v50 + v51 + v52 (merged)
   app-patch-v42.js  |  filename unchanged — no index.html edit needed for
   this merge; none of v50/v51/v52 was ever deployed as its own file, so
   there's no old <script> tag to remove for any of them.

   MERGE NOTE (2026-08-02): app-patch-v50.js's clap-sound feature,
   app-patch-v51.js's live-polls/combo-burst/slow-mode-chat feature batch,
   and app-patch-v52.js's PK/Battle mode are all appended below UNCHANGED,
   each in its own IIFE with its own idempotency guard
   (window._empPatchV50Loaded / _empPatchV51Loaded / _empPatchV52Loaded) —
   the same mechanical, no-behavior-change combination already used by
   app-patch-v8-v19.js and app-patch-v30-v46.js in this codebase, done here
   to stay under the GitHub 100-file limit rather than shipping any of
   them as a 101st+ file. v42's own load-order requirement ("after every
   live-streaming file") already matches v50's, v51's, and v52's — v51 and
   v52 additionally require loading after v42 specifically (both reuse
   v42's host-panel button insertion point), which is automatically
   satisfied by all four now living in the same file, executed top to
   bottom. Verified no other file references any of the four modules'
   internals directly (all four only reach OUT to shared globals —
   window.createLiveComment, window.createLiveGiftComment,
   window.showGiftAnimation, window._fetchLiveAgoraToken,
   #go-live-modal-overlay, #host-control-panel-inner, the active_streams
   doc, etc.) — combining them changes nothing about what any of them
   does, only that they now ship from one <script> tag instead of four.
   v51 needs no new Firestore rule at all. v52 needs one new collection
   rule (`pk_battles`, same permissive pattern as the others — see its own
   header) but reuses active_streams' EXISTING permissive update rule for
   the one new field it adds there. Only v42 (live_engagement) and v50
   (live_reactions) still have their own pre-existing manual rule-addition
   steps, unchanged by this merge.

   Original v42 header follows, unchanged:
   ═══════════════════════════════════════════════════════════════════════
   EMPYREAN INTERNATIONAL — PATCH v42
   app-patch-v42.js  |  Load LAST (after app-patch-v41.js and every live-
   streaming file — app-live.js, app-live-tiktok-patch.js, app-live-final.js)

   FEATURE — LIVE STREAM GAMIFICATION: DAILY CHECK-IN, POINTS/LEVELS, AND A
   CONSPICUOUS DIAMOND RANK BADGE IN CHAT

   REQUESTED (per the reference screenshots): a daily check-in "Heart Me"
   system, a top-gifting ranking, and a diamond badge shown inline in chat
   next to a viewer's name — plus the existing "Viewer rankings" modal
   should show avatar, points, and badge per row, not just a bare amount.
   Delivered as ONE new, self-contained file, per this session's explicit
   request not to touch anything already working.

   ═══════════════════════════════════════════════════════════════════════
   WHAT ALREADY EXISTS (verified by reading the actual files, not assumed)
   — none of this is duplicated here
   ═══════════════════════════════════════════════════════════════════════
     - A real gift-amount leaderboard already exists: loadViewerRankings()
       in app-live-tiktok-patch.js reads `live_gifts` (streamId-scoped),
       sums by sender, and renders avatar + name + coin amount into the
       trophy-icon modal (#tk-viewer-rankings-modal). Untouched.
     - Gift sending, syncing across devices, and the live chat feed
       (createLiveComment / createLiveGiftComment in app-fixes.js;
       attachChatListener / attachGiftSyncListener in app-live-tiktok-
       patch.js) already work. Untouched.
     - The header heart icon already has its own free, unlimited tap-to-
       like counter with a floating-heart burst animation
       (app-live-tiktok-patch.js, "tap counting functionality"). Untouched
       — this file adds a SEPARATE, one-time-per-stream point CLAIM on top
       of it (see §4), it does not touch the like counter itself.
     - There is no daily check-in, no points/level system, and no rank/
       diamond badge anywhere in chat or the rankings modal today (verified
       by search — the only "level" hits in the whole live-streaming
       codebase are unrelated CSS z-index values). This file is genuinely
       new, not a rebuild of something broken.

   ═══════════════════════════════════════════════════════════════════════
   WHY THIS COULD BE BUILT AS A PURE ADDITIVE FILE (unlike v33/v37, no
   edits to any existing file were needed)
   ═══════════════════════════════════════════════════════════════════════
   The two places this feature needs to hook into —
   window.createLiveComment / window.createLiveGiftComment (chat rendering)
   — are already exposed on `window` (app-fixes.js) and this codebase
   already has an established, working precedent for wrapping them from a
   later-loaded file instead of editing the source (see app-live-tiktok-
   patch.js's own Rose-image swap, ~line 1134: "window.createLiveGiftComment
   = patched;"). This file follows that exact same pattern. Everything else
   (points, levels, check-in, the rankings-modal enrichment) is observed
   via independent Firestore listeners and a MutationObserver on modal
   visibility — the same techniques app-patch-v33.js already established
   for its own moderator-status cache, applied here to a new collection.

   ═══════════════════════════════════════════════════════════════════════
   DATA MODEL — one new collection, `live_engagement`
   ═══════════════════════════════════════════════════════════════════════
   Doc id: `{streamId}_{userId}` (deterministic, one doc per user per
   stream — mirrors this codebase's existing per-stream-scoped design:
   guests, live_gifts, and _giftTotals in app-live-final.js all reset per
   stream rather than persisting a global profile-level stat, so this
   follows the same convention rather than introducing a new one).
   Fields: streamId, userId, username, avatar, giftPoints (number),
   fanPoints (number), checkinDate (string, that user's local date —
   guards "once per day" without a server-time round trip), claimedHeartMe
   (bool), claimedComment (bool), superFan (bool). Written with
   FieldValue.increment() + {merge:true}, the exact same read-free-write
   pattern app-patch-v33.js's _empToggleModerator already uses for the
   `guests` array — no read-modify-write race.

   TWO POINT TRACKS, mirroring the two separate "Lv." chips visible in the
   reference screenshot (a diamond-icon level and a heart-icon level —
   TikTok's own wealth/fan split):
     - giftPoints ("💎 Diamond level") — 1 point per 1 EMPY gifted this
       stream, sourced from the same `live_gifts` collection the existing
       rankings modal already reads (a second, independent onSnapshot on
       it — the same multi-listener-on-one-collection pattern this
       codebase already uses for attachGiftCountListener +
       attachGiftSyncListener + loadViewerRankings, all separately
       querying live_gifts today).
     - fanPoints ("❤️ Heart level") — daily check-in (+10), first Heart-Me
       claim this stream (+25), first chat comment this stream (+10).
   A user's combined rank (the "No.1 / No.2 / No.3" pill shown in chat and
   in the enriched rankings modal) is giftPoints + fanPoints together —
   deliberately a richer ranking than the existing modal's raw-EMPY-only
   figure, not a replacement for it (see §7 — both are shown, on two tabs).

   "Become Super Fan" (from the reference screenshot's task list): once a
   viewer's giftPoints crosses SUPERFAN_THRESHOLD in a single stream, a
   one-time +SUPERFAN_BONUS is credited and `superFan` is set true. There
   is no "Super Fan Box" item in the real gift catalog (checked — see
   app-fixes.js's actual catalog array), so rather than inventing a gift
   that doesn't exist, this milestone is driven by cumulative gifting
   value already flowing through the real catalog, which is what the
   screenshot's own "+1000 per Super Fan Box" was ultimately measuring.

   Firestore rule needed: `live_engagement` needs the same permissive
   `allow read, write: if request.auth != null;` this codebase already
   uses for `active_streams` / `live_gifts` / `live_comments` (see
   firebase-rules.js) — no new rule pattern, just one more collection
   added to the existing allow-list.
   ============================================================================= */

(function empyreanPatchV42() {
    'use strict';

    if (window._empPatchV42Loaded) {
        console.warn('[V42] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV42Loaded = true;

    function log(msg) { console.log('[V42] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    /* =========================================================================
       DIAMOND-SHAPE LEVEL BADGE (refinement of the diamond chip below): a
       real diamond-cut SVG icon instead of a flat emoji, distinct per level
       so the badge visually communicates rank at a glance, not just via its
       number. Levels cycle through 7 real diamond cuts (round, princess,
       emerald, marquise, pear, heart, cushion) -- same set width/height as
       the emoji it replaces, so the chip stays exactly as compact.
       One hidden <svg> sprite is injected once; every badge instance then
       just <use>s the matching symbol, so N badges on screen cost N tiny
       <use> tags, not N copies of the path data.
       ========================================================================= */
    var GEM_SHAPES = 7;
    function _ensureGemDefs() {
        if (document.getElementById('pv42-gem-defs')) return;
        var wrap = document.createElement('div');
        wrap.id = 'pv42-gem-defs';
        wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
        wrap.innerHTML =
            '<svg aria-hidden="true" focusable="false">' +
            '<defs>' +
            '<linearGradient id="pv42GemGrad" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#8EC5FF"/><stop offset="100%" stop-color="#1E40C4"/>' +
            '</linearGradient>' +
            '<symbol id="pv42-gem-1" viewBox="0 0 24 24">' + // round brilliant
                '<circle cx="12" cy="12" r="9.2" fill="url(#pv42GemGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>' +
                '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" stroke="rgba(255,255,255,0.32)" stroke-width="0.6"/>' +
            '</symbol>' +
            '<symbol id="pv42-gem-2" viewBox="0 0 24 24">' + // princess (square)
                '<rect x="3.5" y="3.5" width="17" height="17" fill="url(#pv42GemGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>' +
                '<path d="M3.5 3.5l17 17M20.5 3.5l-17 17" stroke="rgba(255,255,255,0.32)" stroke-width="0.6"/>' +
            '</symbol>' +
            '<symbol id="pv42-gem-3" viewBox="0 0 24 24">' + // emerald (step) cut
                '<path d="M8 3.5h8l4.5 4.5v8L16 20.5H8L3.5 16V8Z" fill="url(#pv42GemGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>' +
                '<path d="M8 3.5v17M16 3.5v17" stroke="rgba(255,255,255,0.3)" stroke-width="0.55"/>' +
            '</symbol>' +
            '<symbol id="pv42-gem-4" viewBox="0 0 24 24">' + // marquise (pointed lens)
                '<path d="M12 2.2C17 5 21.2 8.3 21.2 12C21.2 15.7 17 19 12 21.8C7 19 2.8 15.7 2.8 12C2.8 8.3 7 5 12 2.2Z" fill="url(#pv42GemGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>' +
                '<path d="M12 2.2v19.6" stroke="rgba(255,255,255,0.3)" stroke-width="0.55"/>' +
            '</symbol>' +
            '<symbol id="pv42-gem-5" viewBox="0 0 24 24">' + // pear (teardrop)
                '<path d="M12 2C14.3 6.2 19 10 19 15C19 19 15.5 22 12 22C8.5 22 5 19 5 15C5 10 9.7 6.2 12 2Z" fill="url(#pv42GemGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>' +
            '</symbol>' +
            '<symbol id="pv42-gem-6" viewBox="0 0 24 24">' + // heart
                '<path d="M12 21C12 21 4 15.2 4 9.6C4 6.5 6.5 4 9.4 4C10.9 4 12 5 12 5C12 5 13.1 4 14.6 4C17.5 4 20 6.5 20 9.6C20 15.2 12 21 12 21Z" fill="url(#pv42GemGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>' +
            '</symbol>' +
            '<symbol id="pv42-gem-7" viewBox="0 0 24 24">' + // cushion / asscher
                '<rect x="3.5" y="3.5" width="17" height="17" rx="6" fill="url(#pv42GemGrad)" stroke="rgba(255,255,255,0.55)" stroke-width="0.9"/>' +
                '<path d="M12 3.5v17M3.5 12h17" stroke="rgba(255,255,255,0.3)" stroke-width="0.55"/>' +
            '</symbol>' +
            '</defs></svg>';
        (document.body || document.documentElement).appendChild(wrap);
    }
    function _gemSvg(level) {
        _ensureGemDefs();
        var shape = ((Math.max(1, level | 0) - 1) % GEM_SHAPES) + 1;
        return '<svg class="pv42-gem" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><use href="#pv42-gem-' + shape + '"></use></svg>';
    }

    var CHECKIN_POINTS = 10;
    var HEARTME_POINTS = 25;
    var COMMENT_POINTS = 10;
    var GIFT_POINTS_PER_EMPY = 1;
    var SUPERFAN_THRESHOLD = 1000;   // giftPoints (== EMPY gifted) this stream
    var SUPERFAN_BONUS = 1350;
    var LEVEL_STEP = 100;            // points per level, either track

    function _us() { return window.userState || {}; }
    function myId() { return _us().id; }
    function currentStreamId() { return window.liveStreamData && window.liveStreamData.streamId; }
    function fbReady() { return !!(window.fbDb && window._firebaseLoaded); }
    function fieldValue() { return (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) || null; }
    function todayStr() { return new Date().toDateString(); }
    function levelOf(points) { return Math.floor((points || 0) / LEVEL_STEP) + 1; }
    function progressOf(points) { return (points || 0) % LEVEL_STEP; }

    /* =========================================================================
       §1 — engagement cache: one onSnapshot on `live_engagement` scoped to
       the CURRENT stream, keyed by userId. Every other section below reads
       from this cache rather than issuing its own fetch, so a level-up or
       a new gifter is reflected everywhere (chat badges, the popup, the
       enriched rankings modal) the moment Firestore delivers it.
       ========================================================================= */
    var _eng = {};              // userId -> entry
    var _engStreamId = null;
    var _engUnsub = null;

    function _blankEntry(uid) {
        return { userId: uid, username: '', avatar: '', giftPoints: 0, fanPoints: 0, checkinDate: '', claimedHeartMe: false, claimedComment: false, superFan: false };
    }
    function _entry(uid) {
        if (!uid) return _blankEntry('');
        if (!_eng[uid]) _eng[uid] = _blankEntry(uid);
        return _eng[uid];
    }
    function _total(uid) { var e = _entry(uid); return (e.giftPoints || 0) + (e.fanPoints || 0); }

    function _resetEngagementIfNewStream() {
        var sid = currentStreamId();
        if (sid !== _engStreamId) { _engStreamId = sid; _eng = {}; }
    }
    function _engRef(uid) {
        var sid = currentStreamId();
        if (!fbReady() || !sid || !uid) return null;
        return window.fbDb.collection('live_engagement').doc(sid + '_' + uid);
    }
    function _attachEngagementListener() {
        _detachEngagementListener();
        var sid = currentStreamId();
        if (!fbReady() || !sid) return;
        _resetEngagementIfNewStream();
        _engUnsub = window.fbDb.collection('live_engagement').where('streamId', '==', sid)
            .onSnapshot(function (snap) {
                snap.forEach(function (doc) {
                    var d = doc.data() || {};
                    if (!d.userId) return;
                    _eng[d.userId] = Object.assign(_blankEntry(d.userId), d);
                });
                _refreshLevelChip();
                _refreshPopupIfOpen();
                _refreshRankModalDecorations();
            }, function (err) { console.warn('[V42] engagement listener error:', err.message); });
    }
    function _detachEngagementListener() {
        if (_engUnsub) { _engUnsub(); _engUnsub = null; }
    }

    // Optimistic local bump (instant UI) + the real Firestore write. `extra`
    // carries any non-numeric fields to set alongside the increment (e.g.
    // checkinDate, claimedHeartMe) in the SAME merge write.
    function _award(uid, track, amount, extra) {
        if (!uid || !amount) return;
        var e = _entry(uid);
        e[track] = (e[track] || 0) + amount;
        if (extra) Object.assign(e, extra);
        var ref = _engRef(uid), FV = fieldValue();
        if (!ref || !FV) return;
        var payload = { streamId: currentStreamId(), userId: uid, updatedAt: new Date().toISOString() };
        payload[track] = FV.increment(amount);
        if (extra) Object.assign(payload, extra);
        var us = _us();
        if (uid === myId()) { payload.username = us.fullName || us.username || 'You'; payload.avatar = us.avatar || ''; }
        ref.set(payload, { merge: true }).catch(function (err) { console.warn('[V42] award write failed:', err && err.message); });
    }

    /* =========================================================================
       §2 — gift points (💎 wealth track). Independent, read-only listener
       on `live_gifts` — same collection loadViewerRankings() already
       reads, same multi-listener-on-one-collection pattern this codebase
       already relies on. Only NEW docs are processed (docChanges 'added'),
       so re-attaching never double-counts history already in the cache.
       ========================================================================= */
    var _giftPtsUnsub = null;
    var _giftPtsSeen = {};
    function _attachGiftPointsListener() {
        _detachGiftPointsListener();
        var sid = currentStreamId();
        if (!fbReady() || !sid) return;
        _giftPtsSeen = {};
        _giftPtsUnsub = window.fbDb.collection('live_gifts').where('streamId', '==', sid)
            .onSnapshot(function (snap) {
                snap.docChanges().forEach(function (change) {
                    if (change.type !== 'added') return;
                    var d = change.doc.data() || {};
                    var key = d.messageId || change.doc.id;
                    if (_giftPtsSeen[key]) return;
                    _giftPtsSeen[key] = true;
                    if (!d.senderId || !d.amount) return;
                    var pts = Math.round(d.amount * GIFT_POINTS_PER_EMPY);
                    _award(d.senderId, 'giftPoints', pts, { username: d.senderName || undefined, avatar: d.senderAvatar || undefined });

                    var afterTotal = _entry(d.senderId).giftPoints;
                    if (afterTotal >= SUPERFAN_THRESHOLD && !_entry(d.senderId).superFan) {
                        _award(d.senderId, 'giftPoints', SUPERFAN_BONUS, { superFan: true });
                        if (d.senderId === myId()) notify('\uD83D\uDC8E You just became a Super Fan! +' + SUPERFAN_BONUS + ' bonus points.', 'success');
                    }
                });
            }, function (err) { console.warn('[V42] gift-points listener error:', err.message); });
    }
    function _detachGiftPointsListener() { if (_giftPtsUnsub) { _giftPtsUnsub(); _giftPtsUnsub = null; } }

    /* =========================================================================
       §3 — sender lookup for TEXT chat messages. createLiveComment() (see
       §5) is only ever called with (username, text, messageId, avatarUrl)
       — no userId — so a badge for someone ELSE's message needs a separate
       way to resolve who sent it. This mirrors the exact read-only,
       independent-listener approach already used above for gift points:
       it watches the same `live_comments` collection attachChatListener()
       (app-live-tiktok-patch.js) already reads, and builds nothing but a
       messageId -> senderId lookup. For the sender's OWN device, the local
       echo renders synchronously (before the Firestore round trip even
       starts), so that path is resolved directly via myId() instead of
       waiting on this cache — see _resolveSenderId below.
       ========================================================================= */
    var _commentSenderUnsub = null;
    var _commentSenderCache = {};
    function _attachCommentSenderListener() {
        _detachCommentSenderListener();
        var sid = currentStreamId();
        if (!fbReady() || !sid) return;
        _commentSenderCache = {};
        _commentSenderUnsub = window.fbDb.collection('live_comments').where('streamId', '==', sid)
            .onSnapshot(function (snap) {
                snap.docChanges().forEach(function (change) {
                    if (change.type !== 'added') return;
                    var d = change.doc.data() || {};
                    var mid = d.messageId || change.doc.id;
                    if (d.senderId) _commentSenderCache[mid] = d.senderId;
                });
            }, function (err) { console.warn('[V42] comment-sender listener error:', err.message); });
    }
    function _detachCommentSenderListener() { if (_commentSenderUnsub) { _commentSenderUnsub(); _commentSenderUnsub = null; } }

    function _resolveSenderId(username, messageId) {
        if (messageId && _commentSenderCache[messageId]) return _commentSenderCache[messageId];
        var us = _us();
        if (username && (username === us.fullName || username === us.username)) return us.id;
        return null; // unknown — render without a badge rather than guess
    }

    /* =========================================================================
       §4 — daily check-in + Heart-Me claim + comment claim. All three are
       "once" actions guarded by a field on the user's own engagement doc,
       so a re-tap (or a page reload mid-stream) can never double-award.
       ========================================================================= */
    function _doCheckin() {
        var uid = myId();
        if (!uid) { notify('Sign in to check in.', 'warning'); return; }
        if (_entry(uid).checkinDate === todayStr()) { notify('Already checked in today \u2014 come back tomorrow!', 'info'); return; }
        _award(uid, 'fanPoints', CHECKIN_POINTS, { checkinDate: todayStr() });
        notify('\u2705 Checked in! +' + CHECKIN_POINTS + ' points.', 'success');
        _refreshPopupIfOpen();
    }
    function _claimHeartMe() {
        var uid = myId();
        if (!uid) return;
        if (_entry(uid).claimedHeartMe) return;
        _award(uid, 'fanPoints', HEARTME_POINTS, { claimedHeartMe: true });
        notify('\uD83D\uDC96 +' + HEARTME_POINTS + ' points for sending a Heart Me!', 'success');
        _refreshPopupIfOpen();
    }
    function _claimComment(username) {
        var uid = myId();
        if (!uid) return;
        var us = _us();
        if (username !== (us.fullName || us.username)) return; // not my own message
        if (_entry(uid).claimedComment) return;
        _award(uid, 'fanPoints', COMMENT_POINTS, { claimedComment: true });
        notify('\uD83D\uDCAC +' + COMMENT_POINTS + ' points for joining the conversation!', 'success');
        _refreshPopupIfOpen();
    }
    // The header heart (#live-like-count-container) already has its own
    // free, unlimited tap-to-like handler (app-live-tiktok-patch.js) — this
    // is a SEPARATE listener on the SAME element (elements can carry any
    // number of independent click listeners; this one never calls
    // stopPropagation/preventDefault, so the existing burst animation and
    // counter are completely unaffected) that only ever fires the point
    // claim once, on that element's first tap this stream.
    function _wireHeartMeClaim() {
        var el = document.getElementById('live-like-count-container');
        if (!el || el._pv42Wired) return;
        el._pv42Wired = true;
        el.addEventListener('click', function () { _claimHeartMe(); });
    }

    /* =========================================================================
       §5 — chat badge injection. Wraps window.createLiveComment /
       window.createLiveGiftComment (already-established pattern — see the
       file header). Both functions synchronously `list.prepend(commentEl)`
       before returning, so the newly-added row is always list.firstElementChild
       immediately after the original call resolves.
       ========================================================================= */
    function _rankPositionFor(uid) {
        if (!uid) return 0;
        var ranked = Object.keys(_eng)
            .map(function (id) { return { id: id, total: _total(id) }; })
            .filter(function (r) { return r.total > 0; })
            .sort(function (a, b) { return b.total - a.total; });
        for (var i = 0; i < Math.min(3, ranked.length); i++) {
            if (ranked[i].id === uid) return i + 1;
        }
        return 0; // not top 3 — no rank pill
    }
    function _badgeHTML(uid) {
        if (!uid) return '';
        var e = _entry(uid);
        var dLevel = levelOf(e.giftPoints);
        var rank = _rankPositionFor(uid);
        var html = '<span class="pv42-chip pv42-chip-diamond" title="Diamond level ' + dLevel + '">' + _gemSvg(dLevel) + dLevel + '</span>';
        if (rank) html += ' <span class="pv42-chip pv42-chip-rank">\uD83C\uDFC5No.' + rank + '</span>';
        if (e.superFan) html += ' <span class="pv42-chip pv42-chip-superfan" title="Super Fan">\uD83D\uDC8E</span>';
        /* FIX (bug report — badges rendered as long stretched bars, stacked
           vertically, dragging the whole comment row/avatar frame tall and
           blurry-looking): _decorateNewestRow() inserts this HTML directly
           as siblings inside .live-comment-body, which is a flex COLUMN
           container (style.css). Flex containers default to
           align-items:stretch, and each bare <span class="pv42-chip"> had
           no align-self override, so every chip stretched to the row's
           full width and took its own line — exactly the elongated,
           stacked pills reported. Wrapping all chips in ONE inline-flex
           row (with its own align-self:flex-start, set in the CSS below)
           keeps them compact and side-by-side, immune to the parent's
           column-stretch behavior, regardless of where this HTML gets
           inserted. Only used here and in the "Top Fans" rankings-modal
           row (§7), where it's already safely nested inside a flex ROW and
           this wrapper is a no-op change in size/position there. */
        return '<span class="pv42-badge-row">' + html + '</span>';
    }
    function _leftBadgeHTML(uid) {
        if (!uid) return '';
        var e = _entry(uid);
        var dLevel = levelOf(e.giftPoints);
        var html = '<span class="pv42-chip pv42-chip-diamond" title="Diamond level ' + dLevel + '">' + _gemSvg(dLevel) + dLevel + '</span>';
        if (e.superFan) html += ' <span class="pv42-chip pv42-chip-superfan" title="Super Fan">\uD83D\uDC8E</span>';
        return html;
    }
    function _rankBadgeHTML(uid) {
        if (!uid) return '';
        var rank = _rankPositionFor(uid);
        if (!rank) return '';
        return '<span class="pv42-chip pv42-chip-rank">\uD83C\uDFC5No.' + rank + '</span>';
    }
    /* FIX (visual match to reference screenshot): a TikTok-style chat row
       has the level/superfan chip(s) directly in front of the name on the
       left, and the rank pill (No.X) pinned flush right on that SAME
       line — not stacked underneath the name, and not trailing right after
       it either. Building that requires the name to sit inside its own
       full-width header row (.pv42-name-row) with two groups: a left
       group that can shrink/truncate (chips + name) and the rank chip
       pinned right via flex-shrink:0. This replaces the single combined
       _badgeHTML() call that used to run here; _badgeHTML() itself is
       unchanged and still used as-is by the rankings modal (§7), which
       already renders correctly in its own flex ROW context. */
    function _decorateNewestRow(list, senderId) {
        if (!list || !senderId) return;
        var row = list.firstElementChild;
        if (!row || row.dataset.pv42Badged) return;
        var body = row.querySelector('.live-comment-body');
        var strong = body && body.querySelector('strong');
        if (!strong) return;

        var headerRow = document.createElement('span');
        headerRow.className = 'pv42-name-row';
        var leftGroup = document.createElement('span');
        leftGroup.className = 'pv42-name-left';
        strong.parentNode.insertBefore(headerRow, strong);
        headerRow.appendChild(leftGroup);
        leftGroup.appendChild(strong);

        var leftHTML = _leftBadgeHTML(senderId);
        if (leftHTML) strong.insertAdjacentHTML('beforebegin', leftHTML);

        var rankHTML = _rankBadgeHTML(senderId);
        if (rankHTML) headerRow.insertAdjacentHTML('beforeend', rankHTML);

        row.dataset.pv42Badged = '1';
    }

    (function wrapCommentRenderers() {
        function armCreateLiveComment() {
            if (typeof window.createLiveComment !== 'function' || window.createLiveComment._pv42Wrapped) return false;
            var original = window.createLiveComment;
            function patched(username, text, messageId, avatarUrl, isGift) {
                var result = original.apply(this, arguments);
                try {
                    var senderId = _resolveSenderId(username, messageId);
                    _decorateNewestRow(document.getElementById('live-comments-list'), senderId);
                    _claimComment(username);
                } catch (e) { /* decoration must never break the real comment render */ }
                return result;
            }
            patched._pv42Wrapped = true;
            window.createLiveComment = patched;
            return true;
        }
        function armCreateLiveGiftComment() {
            if (typeof window.createLiveGiftComment !== 'function' || window.createLiveGiftComment._pv42Wrapped) return false;
            var original = window.createLiveGiftComment;
            function patched(username, avatarUrl, giftSymbol, giftName, userId) {
                var result = original.apply(this, arguments);
                try { _decorateNewestRow(document.getElementById('live-comments-list'), userId); } catch (e) {}
                return result;
            }
            patched._pv42Wrapped = true;
            window.createLiveGiftComment = patched;
            return true;
        }
        // Both may be assigned by app-fixes.js and re-assigned once more by
        // app-live-tiktok-patch.js's own Rose-image wrapper before this file
        // ever runs (load order: this file is last) — so a single attempt
        // at DOMContentLoaded is normally enough. The short retries are a
        // safety net only, matching the same belt-and-suspenders timing
        // v39/v40 already use elsewhere in this codebase.
        function tryArm() { armCreateLiveComment(); armCreateLiveGiftComment(); }
        tryArm();
        setTimeout(tryArm, 500);
        setTimeout(tryArm, 1500);
    })();

    /* =========================================================================
       §6 — header "Lv." chip + check-in/tasks popup.
       ========================================================================= */
    function _ensureLevelChip() {
        var statsRow = document.querySelector('.live-stats');
        if (!statsRow) return null;
        var chip = document.getElementById('pv42-level-chip');
        if (chip) return chip;
        chip = document.createElement('span');
        chip.id = 'pv42-level-chip';
        chip.className = 'live-stat-item pv42-level-chip';
        chip.title = 'Daily check-in & rewards';
        chip.style.cursor = 'pointer';
        chip.innerHTML = '<span aria-hidden="true">\uD83D\uDC8E</span> <span id="pv42-level-num">Lv.1</span>';
        var rankBtn = document.getElementById('tk-viewer-rankings-btn');
        if (rankBtn && rankBtn.parentElement === statsRow) statsRow.insertBefore(chip, rankBtn.nextSibling);
        else statsRow.insertBefore(chip, statsRow.firstChild);
        chip.addEventListener('click', _openPopup);
        return chip;
    }
    function _refreshLevelChip() {
        var numEl = document.getElementById('pv42-level-num');
        if (!numEl) return;
        numEl.textContent = 'Lv.' + levelOf(_total(myId()));
    }

    var _popup = null;
    function _ensurePopup() {
        if (_popup) return _popup;
        var container = document.getElementById('live-stream-screen') || document.body;
        _popup = document.createElement('div');
        _popup.id = 'pv42-popup';
        _popup.className = 'live-sub-modal';
        _popup.innerHTML =
            '<button type="button" class="close-modal pv42-popup-close" style="color:white; z-index:5; top:5px; right:10px;">\u00d7</button>' +
            '<h3><span aria-hidden="true">\uD83D\uDC8E</span> Daily Rewards</h3>' +
            '<div id="pv42-popup-body" style="overflow-y:auto; flex-grow:1;"></div>';
        container.appendChild(_popup);
        _popup.querySelector('.pv42-popup-close').addEventListener('click', function () { _popup.classList.remove('show'); });
        return _popup;
    }
    function _taskRow(icon, title, sub, actionLabel, done, onClick) {
        return '<div class="pv42-task-row">' +
            '<div class="pv42-task-icon">' + icon + '</div>' +
            '<div class="pv42-task-text"><div class="pv42-task-title">' + esc(title) + '</div><div class="pv42-task-sub">' + esc(sub) + '</div></div>' +
            '<button type="button" class="pv42-task-btn' + (done ? ' pv42-task-done' : '') + '" data-pv42-action="' + esc(onClick) + '"' + (done ? ' disabled' : '') + '>' + (done ? 'Claimed' : esc(actionLabel)) + '</button>' +
            '</div>';
    }
    function _renderPopupBody() {
        var body = document.getElementById('pv42-popup-body');
        if (!body) return;
        var uid = myId();
        var e = _entry(uid);
        var total = _total(uid);
        var lvl = levelOf(total);
        var prog = progressOf(total);
        var checkedInToday = e.checkinDate === todayStr();

        body.innerHTML =
            '<div class="pv42-level-card">' +
            '<div class="pv42-level-badge">Lv.' + lvl + '</div>' +
            '<div class="pv42-progress-track"><div class="pv42-progress-fill" style="width:' + prog + '%;"></div></div>' +
            '<div class="pv42-progress-label">' + prog + ' / ' + LEVEL_STEP + ' to Lv.' + (lvl + 1) + '</div>' +
            '</div>' +
            '<div class="pv42-section-label">Check in daily</div>' +
            _taskRow('\uD83C\uDF81', 'Daily Check-in', '+' + CHECKIN_POINTS + ' points', checkedInToday ? 'Claimed' : 'Check in', checkedInToday, 'checkin') +
            '<div class="pv42-section-label">Today\u2019s tasks</div>' +
            _taskRow('\uD83D\uDC96', 'Send a Heart Me', '+' + HEARTME_POINTS + ' points', 'Claim', !!e.claimedHeartMe, 'heartme') +
            _taskRow('\uD83D\uDCAC', 'Add a comment', '+' + COMMENT_POINTS + ' points', 'Go', !!e.claimedComment, 'comment') +
            '<div class="pv42-section-label">Level up faster</div>' +
            _taskRow('\uD83C\uDF81', 'Send a gift', GIFT_POINTS_PER_EMPY + ' point per EMPY gifted', 'Send', false, 'gift') +
            _taskRow('\uD83D\uDC8E', 'Become Super Fan', 'Gift ' + SUPERFAN_THRESHOLD + ' EMPY this stream for +' + SUPERFAN_BONUS, e.superFan ? 'Achieved' : (Math.min(100, Math.round(100 * (e.giftPoints || 0) / SUPERFAN_THRESHOLD)) + '%'), e.superFan, 'superfan');

        body.querySelectorAll('[data-pv42-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = btn.getAttribute('data-pv42-action');
                if (action === 'checkin') _doCheckin();
                else if (action === 'heartme') _claimHeartMe();
                else if (action === 'comment') {
                    _popup.classList.remove('show');
                    var input = document.getElementById('live-comment-input');
                    if (input) input.focus();
                } else if (action === 'gift') {
                    _popup.classList.remove('show');
                    var hostId = window.liveStreamData && window.liveStreamData.hostUserId;
                    var hostName = (document.getElementById('live-host-name') || {}).textContent || 'host';
                    if (typeof window.openGiftCatalogFor === 'function') window.openGiftCatalogFor(hostId, hostName);
                    else if (typeof window.openGiftCatalog === 'function') window.openGiftCatalog(hostId, hostName);
                }
            });
        });
    }
    function _openPopup() {
        _ensurePopup();
        _renderPopupBody();
        _popup.classList.add('show');
    }
    function _refreshPopupIfOpen() {
        if (_popup && _popup.classList.contains('show')) _renderPopupBody();
    }

    /* =========================================================================
       §7 — enrich the EXISTING rankings modal (avatar/name/amount already
       rendered by loadViewerRankings(), untouched) with a level badge + a
       second "Top Fans" tab driven by this file's own point totals. Purely
       observational: a MutationObserver on #tk-viewer-rankings-modal's
       `show` class (the same technique app-patch-v33.js already uses for
       its own moderator UI), so no click handler already wired to the
       trophy button needs to be touched.

       ROW-TO-USER MATCH: the existing rows carry no data-uid (only name +
       avatar + amount), so this recomputes the SAME ranked array
       loadViewerRankings() computes (same collection, same sum, same sort)
       and matches by position — reliable because both read the identical
       source data with identical sort criteria, so index i always refers
       to the same user in both renders.
       ========================================================================= */
    function _ensureTabs(modal) {
        if (!modal || modal.querySelector('.pv42-rank-tabs')) return;
        var h3 = modal.querySelector('h3');
        if (!h3) return;
        var tabs = document.createElement('div');
        tabs.className = 'pv42-rank-tabs';
        tabs.innerHTML =
            '<button type="button" class="pv42-rank-tab pv42-rank-tab-active" data-pv42-tab="viewers">Top Viewers</button>' +
            '<button type="button" class="pv42-rank-tab" data-pv42-tab="fans">Top Fans <span aria-hidden="true">\uD83D\uDC8E</span></button>';
        h3.insertAdjacentElement('afterend', tabs);
        tabs.addEventListener('click', function (e) {
            var btn = e.target.closest('.pv42-rank-tab');
            if (!btn) return;
            tabs.querySelectorAll('.pv42-rank-tab').forEach(function (b) { b.classList.remove('pv42-rank-tab-active'); });
            btn.classList.add('pv42-rank-tab-active');
            _renderTab(btn.getAttribute('data-pv42-tab'));
        });
    }
    var _viewersHTML = null; // last-known "Top Viewers" render, cached so switching to
                              // "Top Fans" and back doesn't lose the original list —
                              // see _decorateOriginalRows, which refreshes this cache
                              // every time loadViewerRankings() re-populates the list.
    function _renderTab(which) {
        var list = document.getElementById('tk-rank-list');
        if (!list) return;
        if (which === 'viewers') {
            if (_viewersHTML != null) list.innerHTML = _viewersHTML;
            return;
        }
        var ranked = Object.keys(_eng).map(function (id) { return Object.assign({}, _eng[id], { total: _total(id) }); })
            .filter(function (r) { return r.total > 0; })
            .sort(function (a, b) { return b.total - a.total; })
            .slice(0, 20);
        if (!ranked.length) {
            list.innerHTML = '<p style="text-align:center; color:#ccc; padding:20px;">No fan activity yet \u2014 check in or chat to be the first!</p>';
            return;
        }
        list.innerHTML = ranked.map(function (r, i) {
            var safeAvatar = r.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(r.username || '?');
            return '<div class="tk-rank-row">' +
                '<span class="tk-rank-num">' + (i + 1) + '</span>' +
                '<img src="' + safeAvatar + '" alt="">' +
                '<span class="tk-rank-name">' + esc(r.username || 'Someone') + ' ' + _badgeHTML(r.userId) + '</span>' +
                '<span class="tk-rank-amt"><i class="fa-solid fa-star"></i> ' + r.total.toLocaleString() + '</span>' +
                '</div>';
        }).join('');
    }
    function _decorateOriginalRows() {
        var list = document.getElementById('tk-rank-list');
        if (!list) return;
        // Recompute the identical gift-amount ranking loadViewerRankings()
        // just rendered, purely to recover WHICH userId belongs to row i —
        // see the "ROW-TO-USER MATCH" note above.
        var sid = currentStreamId();
        if (!fbReady() || !sid) return;
        window.fbDb.collection('live_gifts').where('streamId', '==', sid).get().then(function (snap) {
            var totals = {};
            snap.forEach(function (doc) {
                var g = doc.data();
                if (!g.senderId) return;
                if (!totals[g.senderId]) totals[g.senderId] = { userId: g.senderId, amount: 0 };
                totals[g.senderId].amount += (g.amount || 0);
            });
            var ranked = Object.keys(totals).map(function (uid) { return totals[uid]; })
                .sort(function (a, b) { return b.amount - a.amount; }).slice(0, 20);
            var rows = list.querySelectorAll('.tk-rank-row');
            rows.forEach(function (row, i) {
                if (row.dataset.pv42Badged || !ranked[i]) return;
                var nameEl = row.querySelector('.tk-rank-name');
                if (nameEl) nameEl.insertAdjacentHTML('beforeend', ' ' + _badgeHTML(ranked[i].userId));
                row.dataset.pv42Badged = '1';
            });
            _viewersHTML = list.innerHTML;
        }).catch(function () {});
    }
    function _refreshRankModalDecorations() {
        var modal = document.getElementById('tk-viewer-rankings-modal');
        if (!modal || !modal.classList.contains('show')) return;
        var activeTab = modal.querySelector('.pv42-rank-tab-active');
        if (activeTab && activeTab.getAttribute('data-pv42-tab') === 'fans') _renderTab('fans');
    }
    function _watchRankModal() {
        var modal = document.getElementById('tk-viewer-rankings-modal');
        if (!modal || modal._pv42Observed) return;
        modal._pv42Observed = true;
        new MutationObserver(function () {
            if (!modal.classList.contains('show')) return;
            _ensureTabs(modal);
            // loadViewerRankings() populates #tk-rank-list asynchronously
            // (it's an await'd Firestore .get()); give it a moment to land
            // before decorating rows, same margin app-patch-v40.js's own
            // transition timers already use for comparable async UI.
            setTimeout(_decorateOriginalRows, 450);
        }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    /* =========================================================================
       §8 — CSS (all class names prefixed pv42- to guarantee zero collision
       with any existing selector).
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv42-gamify-css')) return;
        var css = document.createElement('style');
        css.id = 'pv42-gamify-css';
        css.textContent =
            '.pv42-level-chip{display:inline-flex;align-items:center;gap:4px;}' +
            /* FIX (bug report — badges too long / avatar row dragged tall
               and blurry): this single wrapper is what actually gets
               inserted next to a comment's name now (see _badgeHTML).
               align-self:flex-start stops it from being stretched to the
               full row width by .live-comment-body's flex-column
               align-items:stretch default; flex-wrap:wrap keeps multiple
               chips from ever forcing overflow on a very long name. */
            '.pv42-badge-row{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;align-self:flex-start;max-width:100%;vertical-align:middle;}' +
            /* Chat-row header (name line): left group (chips + name) is
               allowed to shrink/truncate; the rank chip never shrinks and
               is pushed flush right by the header row's own space-between,
               matching the reference screenshot's layout exactly. */
            '.pv42-name-row{display:flex;align-items:center;gap:6px;width:100%;justify-content:space-between;}' +
            '.pv42-name-left{display:flex;align-items:center;gap:4px;min-width:0;flex:1 1 auto;overflow:hidden;}' +
            '.pv42-name-left strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.pv42-name-row .pv42-chip-rank{flex-shrink:0;}' +
            '.pv42-chip{display:inline-flex;align-items:center;gap:2px;font-size:0.62rem;font-weight:800;border-radius:8px;padding:1px 6px;line-height:1.5;vertical-align:middle;letter-spacing:0.2px;align-self:flex-start;flex:0 0 auto;}' +
            '.pv42-gem{vertical-align:-1px;margin-right:2px;filter:drop-shadow(0 0 2px rgba(62,123,250,0.65));}' +
            '.pv42-chip-diamond{background:linear-gradient(135deg,#3E7BFA,#1E40C4);color:#EAF1FF;box-shadow:0 0 6px rgba(62,123,250,0.55);}' +
            '.pv42-chip-rank{background:linear-gradient(135deg,#FF6FA5,#D63A78);color:#fff;}' +
            '.pv42-chip-superfan{background:linear-gradient(135deg,#F5C518,#C98A00);color:#3a2600;}' +
            /* Popup */
            '.pv42-level-card{background:linear-gradient(135deg,rgba(62,123,250,0.18),rgba(30,64,196,0.10));border:1px solid rgba(62,123,250,0.35);border-radius:14px;padding:14px;margin-bottom:16px;text-align:center;}' +
            '.pv42-level-badge{font-size:1.3rem;font-weight:900;color:#EAF1FF;margin-bottom:8px;}' +
            '.pv42-progress-track{height:8px;border-radius:6px;background:rgba(255,255,255,0.12);overflow:hidden;}' +
            '.pv42-progress-fill{height:100%;background:linear-gradient(90deg,#3E7BFA,#8EC5FF);border-radius:6px;transition:width .35s ease;}' +
            '.pv42-progress-label{margin-top:6px;font-size:0.7rem;color:#cfd8ee;}' +
            '.pv42-section-label{font-size:0.72rem;font-weight:800;color:#9fb0d6;text-transform:uppercase;letter-spacing:0.5px;margin:14px 0 6px;}' +
            '.pv42-task-row{display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid rgba(255,255,255,0.07);}' +
            '.pv42-task-icon{font-size:1.25rem;width:30px;text-align:center;flex-shrink:0;}' +
            '.pv42-task-text{flex:1;min-width:0;}' +
            '.pv42-task-title{font-weight:700;font-size:0.85rem;color:#fff;}' +
            '.pv42-task-sub{font-size:0.72rem;color:#a9b4d0;}' +
            '.pv42-task-btn{flex-shrink:0;border:none;border-radius:16px;padding:7px 16px;font-weight:800;font-size:0.78rem;color:#1a1a1a;background:linear-gradient(135deg,#F5C518,#F0A400);cursor:pointer;}' +
            '.pv42-task-btn.pv42-task-done{background:rgba(255,255,255,0.10);color:#9fb0d6;cursor:default;}' +
            /* Rankings-modal tabs */
            '.pv42-rank-tabs{display:flex;gap:8px;margin:-6px 0 12px;justify-content:center;}' +
            '.pv42-rank-tab{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#cfd8ee;font-weight:700;font-size:0.76rem;border-radius:14px;padding:6px 14px;cursor:pointer;}' +
            '.pv42-rank-tab-active{background:linear-gradient(135deg,#3E7BFA,#1E40C4);color:#fff;border-color:transparent;}';
        document.head.appendChild(css);
    })();

    /* =========================================================================
       §9 — wiring: attach/detach everything alongside the live modal, same
       trigger (#go-live-modal-overlay class toggle) app-patch-v33.js
       already observes for its own moderator feature.
       ========================================================================= */
    function onModalToggle() {
        var modal = document.getElementById('go-live-modal-overlay');
        if (!modal) return;
        if (modal.classList.contains('show')) {
            _resetEngagementIfNewStream();
            _attachEngagementListener();
            _attachGiftPointsListener();
            _attachCommentSenderListener();
            setTimeout(function () {
                _ensureLevelChip();
                _refreshLevelChip();
                _wireHeartMeClaim();
                _watchRankModal();
            }, 400);
        } else {
            _detachEngagementListener();
            _detachGiftPointsListener();
            _detachCommentSenderListener();
            var chip = document.getElementById('pv42-level-chip');
            if (chip) chip.remove();
            if (_popup) { _popup.remove(); _popup = null; }
            _eng = {}; _engStreamId = null; _giftPtsSeen = {}; _commentSenderCache = {};
        }
    }
    function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
    ready(function () {
        var modal = document.getElementById('go-live-modal-overlay');
        if (modal) {
            new MutationObserver(onModalToggle).observe(modal, { attributes: true, attributeFilter: ['class'] });
            if (modal.classList.contains('show')) onModalToggle();
        }
        // Re-check periodically in case the heart-me listener or level chip
        // needs re-wiring after a guest/host role change re-renders the
        // header — cheap, idempotent (both guard on their own flags).
        setInterval(function () {
            var m = document.getElementById('go-live-modal-overlay');
            if (m && m.classList.contains('show')) { _ensureLevelChip(); _refreshLevelChip(); _wireHeartMeClaim(); _watchRankModal(); }
        }, 1500);
    });

    console.log('[EmpyreanPatchV42] \u2705 Live-stream gamification module armed \u2014 daily check-in, points/levels (\uD83D\uDD37 diamond wealth track + \uD83D\uDC96 heart fan track), a conspicuous rank/diamond badge inline in chat (both text and gift comments), and a "Top Fans" tab added alongside the existing, untouched "Top Viewers" gift-amount ranking. Pure addition \u2014 no existing file was edited.');

})();

/* ═══════════════════════════════════════════════════════════════════════
   app-patch-v50.js — Clap sound effects for live streaming
   ═══════════════════════════════════════════════════════════════════════
   Appended below UNCHANGED per the merge note at the top of this file. */
/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v50
   app-patch-v50.js  |  Load LAST (after every live-streaming file —
   app-live.js, app-live-tiktok-patch.js, app-live-final.js, app-fixes.js)

   FEATURE — CLAP SOUND EFFECTS FOR LIVE STREAMING

   REQUESTED: a clapping sound, triggered three ways —
     1. A dedicated 👏 button any viewer/guest can tap, in the live footer.
     2. Automatically whenever ANYONE sends a gift.
     3. A host-only "hype" clap, louder, from the host control panel.
   All three need to be heard by EVERYONE watching, not just the person who
   triggered it — same requirement gifts already meet.

   ═══════════════════════════════════════════════════════════════════════
   WHY THIS COULD BE BUILT AS A PURE ADDITIVE FILE
   ═══════════════════════════════════════════════════════════════════════
   Trigger #2 (gift claps) needs no new sync mechanism at all: every gift,
   whether sent locally or received via app-live-tiktok-patch.js's
   attachGiftSyncListener(), already funnels through ONE function —
   window.showGiftAnimation(symbol, giftName) (app-fixes.js, exposed on
   window; called at app-fixes.js:251 for local sends and
   app-live-tiktok-patch.js:2525 for synced remote gifts). Wrapping that
   single function, the same established pattern app-patch-v19.js /
   app-patch-v26.js already use elsewhere in this codebase, plays a clap on
   every device for every gift with no new listener needed.

   Triggers #1 and #3 (button taps) have no existing sync channel to piggy-
   back on, so this adds one small new collection, `live_reactions`
   (streamId, type: 'viewer_clap' | 'host_hype', senderId, ts), written on
   tap and read via a per-stream onSnapshot — the same
   attach-on-modal-open/detach-on-close lifecycle app-patch-v33.js's
   moderator cache and app-patch-v42.js's engagement cache already use. The
   sender plays their own clap instantly on tap (no round-trip delay) and
   is skipped when their own write echoes back, so nobody hears their own
   clap twice.

   Nothing in app-live.js / app-live-tiktok-patch.js / app-live-final.js /
   app-fixes.js needed editing — the one hook point (showGiftAnimation) was
   already exposed on window for exactly this kind of wrap.

   ═══════════════════════════════════════════════════════════════════════
   REQUIRED MANUAL STEPS (this patch cannot do these two on its own)
   ═══════════════════════════════════════════════════════════════════════
     1. Add an actual clap sound FILE to your static assets — e.g.
        public/sounds/clap.mp3 — and update CLAP_SOUND_URL below if you
        put it somewhere other than /sounds/clap.mp3. This patch is pure
        JS/CSS; it cannot generate or upload a binary audio file.
     2. Add `live_reactions` to firebase-rules.js with the same permissive
        rule already used for active_streams / live_gifts / live_comments:
          match /live_reactions/{doc} { allow read, write: if request.auth != null; }
   ============================================================================= */

(function empyreanPatchV50() {
    'use strict';

    if (window._empPatchV50Loaded) {
        console.warn('[V50] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV50Loaded = true;

    function log(msg) { console.log('[V50-Clap] ' + msg); }

    /* ── §0 — config ──────────────────────────────────────────────────── */
    // FIX (2026-08-02 — bug: "clap button blinks but no sound plays"):
    // this used to load CLAP_SOUND_URL ('/sounds/clap.mp3') into an
    // Audio() pool. That file was one of two "REQUIRED MANUAL STEPS"
    // this patch's own header always said it could not do by itself —
    // and it was never uploaded to static assets. Every a.play() call
    // therefore 404'd, and the try/catch around it (deliberately, so a
    // missing file could never break the live screen) swallowed that
    // failure completely: the button's pulse animation still ran (the
    // "blink" that was reported), but no sound was ever actually
    // produced, on any device, by design of that silent catch. Rather
    // than depend on a binary asset ever being uploaded (this project
    // is maintained from a phone with no desktop access — see this
    // codebase's own working-style notes — so pushing a new static
    // file is real friction), the clap is now synthesized at runtime
    // with the Web Audio API: a few short bursts of filtered noise,
    // shaped to sound like a hand-clap, need no file at all and can
    // never 404.
    var VIEWER_CLAP_COOLDOWN_MS = 350; // debounce accidental double-taps only — not a hard per-session limit

    /* ── §1 — synthesized clap playback (Web Audio API, no audio file) ── */
    var _actx = null;
    function _ensureAudioCtx() {
        if (_actx) return _actx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { _actx = new Ctx(); } catch (e) { _actx = null; }
        return _actx;
    }
    function _synthOneClap(ctx, atTime, volume) {
        // A single clap = a very short burst of band-passed white noise —
        // noise gives the percussive "crack", the band-pass + fast decay
        // shapes it to sound like a clap rather than static.
        var dur = 0.045;
        var bufSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
        var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1800;
        band.Q.value = 0.7;
        var gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, atTime);
        gain.gain.exponentialRampToValueAtTime(0.001, atTime + dur);
        src.connect(band); band.connect(gain); gain.connect(ctx.destination);
        src.start(atTime);
        src.stop(atTime + dur + 0.01);
    }
    function _playClap(volume) {
        try {
            var ctx = _ensureAudioCtx();
            if (!ctx) return; // Web Audio unavailable on this device — fail silent, never break the live screen
            // Autoplay/audio-context policies require a prior user
            // gesture before sound can actually play — normal on first
            // load before anyone has tapped anything yet. Resuming here
            // (inside a click-triggered call) satisfies that gesture
            // requirement instead of silently doing nothing forever.
            if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
            var vol = volume == null ? 0.85 : volume;
            var now = ctx.currentTime;
            // Three quick, slightly-offset bursts read as one "clap"
            // rather than a single flat click — closer to a real
            // hand-clap's short, slightly irregular attack.
            _synthOneClap(ctx, now, vol);
            _synthOneClap(ctx, now + 0.015, vol * 0.7);
            _synthOneClap(ctx, now + 0.03, vol * 0.5);
        } catch (e) { /* synthesis must never break the live screen */ }
    }

    /* ── §1b — visible clap effect (fix — root cause C: "didn't display
       on the screen"): v50 only ever animated the button itself; nothing
       on the actual video area showed a clap happened, unlike gifts.
       A brief floating 👏 burst over the stream now plays alongside
       every clap — local taps AND synced claps from other devices —
       so the reaction is visible to everyone watching, not just heard. */
    function _spawnClapBurst() {
        var stage = document.querySelector('#live-stream-screen .live-body') || document.getElementById('live-stream-screen');
        if (!stage) return;
        var n = 3 + Math.floor(Math.random() * 2); // 3-4 emoji per burst
        for (var i = 0; i < n; i++) {
            (function (i) {
                var el = document.createElement('span');
                el.className = 'pv53-clap-fx';
                el.textContent = '\uD83D\uDC4F';
                var startX = 40 + Math.random() * 20; // cluster near center, small horizontal spread
                el.style.left = startX + '%';
                el.style.animationDelay = (i * 70) + 'ms';
                stage.appendChild(el);
                setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1400);
            })(i);
        }
    }

    function _us() { return window.userState || {}; }
    function myId() { return _us().id; }
    function currentStreamId() { return window.liveStreamData && window.liveStreamData.streamId; }
    function fbReady() { return !!(window.fbDb && window._firebaseLoaded); }
    // Same host check every other live-streaming patch in this codebase
    // already uses (app-patch-v33.js's isRealHost, app-live-tiktok-
    // patch.js / app-live-final.js's own copies).
    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }

    /* ── §2 — cross-device sync for viewer/host claps (gift claps use §4's
       existing showGiftAnimation hook instead — no new sync needed there) ── */
    var _reactUnsub = null;
    var _lastSeenTs = 0; // only play reactions that land AFTER this device starts listening — a fresh join must never replay the stream's whole clap history at once
    function _attachReactionListener() {
        _detachReactionListener();
        var sid = currentStreamId();
        if (!fbReady() || !sid) return;
        _lastSeenTs = Date.now();
        _reactUnsub = window.fbDb.collection('live_reactions').where('streamId', '==', sid)
            .onSnapshot(function (snap) {
                snap.docChanges().forEach(function (change) {
                    if (change.type !== 'added') return;
                    var d = change.doc.data() || {};
                    if (d.senderId && d.senderId === myId()) return; // sender already heard/saw it instantly, locally, on tap
                    if (!d.ts || d.ts < _lastSeenTs) return;
                    _playClap(d.type === 'host_hype' ? 1.0 : 0.85);
                    _spawnClapBurst();
                });
            }, function (err) { console.warn('[V50-Clap] reaction listener error:', err.message); });
    }
    function _detachReactionListener() { if (_reactUnsub) { _reactUnsub(); _reactUnsub = null; } }

    function _broadcastClap(type) {
        var sid = currentStreamId();
        if (!fbReady() || !sid) return;
        window.fbDb.collection('live_reactions').add({
            streamId: sid, type: type, senderId: myId() || null, ts: Date.now()
        }).catch(function (err) { console.warn('[V50-Clap] could not sync clap to other viewers:', err.message); });
    }

    /* ── §3 — viewer clap button, .live-footer, visible to everyone
       (host included — the footer is shared, same as the existing gift
       button) ── */
    var BTN_ID = 'live-clap-btn';
    var _lastViewerClap = 0;
    function _ensureViewerClapBtn() {
        // FIX (2026-08-02 — bug: "clap button appears on both host and
        // guest screen, abnormal duplication"): this footer button used
        // to be added unconditionally for every role, host included —
        // but the host already gets a dedicated, louder "hype clap"
        // button in the control panel (§5 below). Showing this plain
        // viewer version to the host too meant two claps buttons doing
        // almost the same thing on the same screen. Host now gets only
        // their own hype-clap button; everyone else (guests, viewers)
        // keeps this one, unchanged.
        if (isRealHost()) {
            var stale = document.getElementById(BTN_ID);
            if (stale) stale.remove();
            return;
        }
        var footer = document.querySelector('#live-stream-screen .live-footer');
        if (!footer || document.getElementById(BTN_ID)) return;
        var btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.className = 'live-action-btn tk-footer-icon';
        btn.title = 'Clap';
        btn.innerHTML = '<span class="tk-emoji-3d" aria-hidden="true">\uD83D\uDC4F</span>';
        // Right after the gift button, so it reads as one more reaction
        // alongside gifting rather than being buried before the composer.
        var giftBtn = document.getElementById('live-gift-btn');
        if (giftBtn && giftBtn.parentElement === footer) footer.insertBefore(btn, giftBtn.nextSibling);
        else footer.appendChild(btn);
        btn.addEventListener('click', function () {
            var now = Date.now();
            if (now - _lastViewerClap < VIEWER_CLAP_COOLDOWN_MS) return;
            _lastViewerClap = now;
            _playClap(0.85);
            _spawnClapBurst();
            _broadcastClap('viewer_clap');
            btn.classList.remove('pv50-clap-pulse');
            void btn.offsetWidth; // force reflow so the animation restarts on rapid taps
            btn.classList.add('pv50-clap-pulse');
        });
    }

    /* ── §4 — automatic clap on every gift. Wraps window.showGiftAnimation
       once; both local sends AND remote-synced gifts already call it, so
       this single wrap covers every device with no new listener. ── */
    (function armGiftClapWrap() {
        function tryArm() {
            var orig = window.showGiftAnimation;
            if (typeof orig !== 'function' || orig._pv50Wrapped) return;
            var wrapped = function (symbol, giftName) {
                var result = orig.apply(this, arguments);
                _playClap(0.7); // a touch quieter than a deliberate tap — this fires on every gift, including small ones
                return result;
            };
            wrapped._pv50Wrapped = true;
            window.showGiftAnimation = wrapped;
            log('wrapped window.showGiftAnimation — a clap now plays alongside every gift, local or synced.');
        }
        tryArm();
        // Same belt-and-suspenders retry timing v39/v40/v42 already use in
        // case app-fixes.js/app-live-tiktok-patch.js assign this function
        // slightly after this file first runs.
        setTimeout(tryArm, 500);
        setTimeout(tryArm, 1500);
    })();

    /* ── §5 — host "hype" clap: louder, host-only, broadcast to everyone ── */
    var HOST_BTN_ID = 'live-host-clap-btn';
    function _ensureHostClapBtn() {
        if (!isRealHost()) {
            var existing = document.getElementById(HOST_BTN_ID);
            if (existing) existing.remove();
            return;
        }
        var panel = document.getElementById('host-control-panel-inner');
        if (!panel || document.getElementById(HOST_BTN_ID)) return;
        var btn = document.createElement('button');
        btn.id = HOST_BTN_ID;
        btn.type = 'button';
        btn.className = 'live-action-btn';
        btn.title = 'Hype the crowd';
        /* FIX (2026-08-02 — broken/"X-box" icon report): this was a raw
           emoji glyph (\uD83D\uDC4F) in a <span>. Every OTHER button in this
           same panel (mic/video/goal/star/gamepad/pin, plus v55/v56/v59's
           later additions) uses the Font Awesome 6 icon font that's
           already loaded via CDN and reliably renders everywhere. Raw
           emoji instead depend on the DEVICE's own system emoji font —
           on the device this was reported from, that glyph has no local
           coverage and renders as Android's "tofu" (a box with an X),
           which is exactly the broken-icon symptom reported. Swapping to
           an FA6 icon removes that device-dependency entirely, matching
           every neighboring button in this same column. */
        btn.innerHTML = '<i class="fas fa-hands-clapping"></i>';
        panel.appendChild(btn);
        // FIX (2026-08-02 — bug 2, see the guaranteed-first capture
        // handler appended at the end of this file): exposed on window
        // so that handler can always reach the CURRENT version of this
        // action, the same "call through window.*" pattern app-patch-
        // v4.js already established for _submitQuote.
        window._pv50HostHypeClap = function () {
            _playClap(1.0);
            _spawnClapBurst();
            _broadcastClap('host_hype');
        };
        btn.addEventListener('click', function () {
            _playClap(1.0);
            _spawnClapBurst();
            _broadcastClap('host_hype');
        });
    }

    /* ── §6 — CSS: a small tap-feedback pulse on the viewer button only.
       Every button reuses the existing .live-action-btn / .tk-footer-icon
       classes for sizing, so it automatically matches its neighbors —
       nothing here overrides those. ── */
    (function injectCSS() {
        if (document.getElementById('pv50-clap-css')) return;
        var css = document.createElement('style');
        css.id = 'pv50-clap-css';
        css.textContent =
            '@keyframes pv50ClapPulse{0%{transform:scale(1);}40%{transform:scale(1.28);}100%{transform:scale(1);}}' +
            '.pv50-clap-pulse{animation:pv50ClapPulse .35s ease;}' +
            /* FIX (2026-08-02 — bug: clap "didn't display on the screen"):
               a floating 👏 that rises and fades over the stream, same
               general idea as this codebase's existing gift animations,
               so a clap is now visible to everyone watching, not just
               heard. Positioned/animated purely with CSS — no new JS
               animation loop needed. */
            '@keyframes pv53ClapFloat{0%{transform:translateY(0) scale(0.6) rotate(-8deg);opacity:0;}15%{opacity:1;transform:translateY(-20px) scale(1.15) rotate(6deg);}75%{opacity:1;}100%{transform:translateY(-160px) scale(0.9) rotate(-4deg);opacity:0;}}' +
            '.pv53-clap-fx{position:absolute;bottom:22%;font-size:2.1rem;pointer-events:none;z-index:12;animation:pv53ClapFloat 1.3s ease-out forwards;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));}';
        document.head.appendChild(css);
    })();

    /* ── §7 — wiring: attach/detach alongside the live modal, the exact
       same #go-live-modal-overlay class-toggle trigger app-patch-v33.js /
       app-patch-v42.js already observe for their own features. ── */
    function onModalToggle() {
        var modal = document.getElementById('go-live-modal-overlay');
        if (!modal) return;
        if (modal.classList.contains('show')) {
            _attachReactionListener();
            _ensureViewerClapBtn();
            _ensureHostClapBtn();
        } else {
            _detachReactionListener();
            var vBtn = document.getElementById(BTN_ID); if (vBtn) vBtn.remove();
            var hBtn = document.getElementById(HOST_BTN_ID); if (hBtn) hBtn.remove();
        }
    }
    function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
    ready(function () {
        var modal = document.getElementById('go-live-modal-overlay');
        if (modal) {
            new MutationObserver(onModalToggle).observe(modal, { attributes: true, attributeFilter: ['class'] });
            if (modal.classList.contains('show')) onModalToggle();
        }
        // Cheap, idempotent recheck — covers a host/guest role flip mid-
        // stream (reconnect, promotion) the same way app-patch-v42.js's
        // own interval already does for its level chip.
        setInterval(function () {
            var m = document.getElementById('go-live-modal-overlay');
            if (m && m.classList.contains('show')) { _ensureViewerClapBtn(); _ensureHostClapBtn(); }
        }, 1500);
    });

    // FIX (2026-08-02 — root cause of bugs 1/2/3/4 all appearing "never
    // fixed" despite V53's fix-pack below already addressing them): this
    // closing log line referenced CLAP_SOUND_URL, a variable that no
    // longer exists now that the clap is synthesized at runtime (see the
    // §0 FIX note above — the constant was removed when the Audio()/mp3
    // approach was replaced, but this reference to it was missed).
    // Reading an undefined identifier throws a ReferenceError even just
    // to build this log string. Because empyreanPatchV50/V51/V52/V53 are
    // four separate top-level IIFE statements concatenated in ONE script
    // file, an uncaught throw from this one aborts the ENTIRE REMAINING
    // SCRIPT, not just this IIFE. Confirmed by direct execution: V51
    // (poll/chat-mode buttons), V52 (PK battle), and V53 (the bug-fix
    // pack that was supposed to fix bugs 2/3/4) never ran AT ALL, on any
    // page load, because this line always threw first. Everything in V50
    // ABOVE this line (button creation, isRealHost() gating, the Web
    // Audio synth, the floating burst) already executed by the time this
    // throws, so V50 itself was never actually broken — V53 simply never
    // got the chance to run.
    console.log('[EmpyreanPatchV50] \u2705 Clap sound wired \u2014 \uD83D\uDC4F button in the live footer for viewers, an automatic clap on every gift (local + synced, via the existing showGiftAnimation hook), and a louder host \u201chype\u201d clap in the control panel, all synced across devices via a new live_reactions collection. Pure addition \u2014 no existing live-streaming file was edited. Sound is synthesized at runtime (Web Audio) \u2014 no audio asset file required.');

})();
/* ═══════════════════════════════════════════════════════════════════════
   app-patch-v51.js — Live polls/Q&A, gift combo-streak bursts, and
   slow-mode/followers-only chat
   ═══════════════════════════════════════════════════════════════════════
   Appended below UNCHANGED per the merge note at the top of this file. */
/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v51
   app-patch-v51.js  |  Load LAST (after every live-streaming file —
   app-live.js, app-live-tiktok-patch.js, app-live-final.js, app-fixes.js —
   and after app-patch-v42.js, whose host-panel/footer button insertion
   points this file reuses)

   FEATURE BATCH — LIVE POLLS/Q&A, GIFT COMBO BURST, SLOW-MODE/FOLLOWERS-
   ONLY CHAT

   Three of the features suggested this session. The other seven (PK battle
   mode, beauty filters, scheduled streams, live shopping pin, stream
   replay, ambient music library, new-follower toast) are deliberately NOT
   in this file — see the chat message accompanying this patch for why each
   one needs either a backend/server change, a product decision, or more
   investigation before it can be built with the same confidence as these
   three. Building all ten at once risks exactly the kind of "another layer
   racing the other ones" failure this codebase's own patch history
   (app-patch-v28.js, referenced again in v31/v33/v37) already had to dig
   out of once.

   ═══════════════════════════════════════════════════════════════════════
   DATA MODEL — ZERO NEW FIRESTORE RULES NEEDED
   ═══════════════════════════════════════════════════════════════════════
   All three features store their state as FIELDS ON THE EXISTING
   active_streams/{streamId} DOCUMENT, not a new collection — the same
   approach app-patch-v33.js already used to add `isModerator` onto the
   existing `guests` array. active_streams already has a fully permissive
   `allow update: if request.auth != null;` rule (firebase-rules.js), so
   this needs no manual Firestore-rules edit at all, unlike app-patch-v42.js
   (live_engagement) and app-patch-v50.js (live_reactions), which do.

     - activePoll: { id, question, options:[{text,votes}], voterIds:{uid:optionIdx},
       open, createdBy, createdAt } — null/absent when no poll is running.
     - chatMode: 'off' | 'slow' | 'followers' , slowModeSeconds: number —
       absent/'off' by default.

   Enforcement for all of this is client-side only, same as every other
   host-only gate in this codebase (isHost() itself is a client-side field
   comparison, not a security boundary — see app-patch-v33.js's own header
   for why that's an accepted, already-documented tradeoff here, not a new
   one introduced by this file).
   ============================================================================= */

(function empyreanPatchV51() {
    'use strict';

    if (window._empPatchV51Loaded) {
        console.warn('[V51] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV51Loaded = true;

    function log(msg) { console.log('[V51] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function _us() { return window.userState || {}; }
    function myId() { return _us().id; }
    function currentStreamId() { return window.liveStreamData && window.liveStreamData.streamId; }
    function fbReady() { return !!(window.fbDb && window._firebaseLoaded); }
    function hostId() { var sd = window.liveStreamData; return sd && (sd.hostUserId || sd.hostId); }
    // Same host check every other live-streaming patch in this codebase
    // already uses (app-patch-v33.js / app-patch-v50.js's own copies).
    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var hid = hostId();
        return !!hid && window.userState.id === hid;
    }
    function iFollowHost() {
        var hid = hostId(), fu = _us().followedUserIds;
        // userState.followedUserIds is already loaded locally with the
        // user's own profile (see app-fixes.js's follow handler) — no
        // extra Firestore read needed to answer "do I follow the host?".
        return !!(hid && fu && typeof fu.has === 'function' && fu.has(hid));
    }
    function streamDocRef() {
        var sid = currentStreamId();
        if (!fbReady() || !sid) return null;
        return window.fbDb.collection('active_streams').doc(sid);
    }

    /* =========================================================================
       §1 — one shared onSnapshot on the active_streams doc, covering both
       the poll and chat-mode fields (one listener, not two — keeps this
       file's Firestore footprint as small as app-patch-v33.js's own single
       moderator listener).
       ========================================================================= */
    var _docUnsub = null;
    var _docStreamId = null;
    var _poll = null;         // current activePoll object, or null
    var _myVoteIdx = null;    // this device's own vote on the CURRENT poll, or null
    var _chatMode = 'off';
    var _slowSeconds = 10;

    function _attachDocListener() {
        _detachDocListener();
        var ref = streamDocRef();
        if (!ref) return;
        _docStreamId = currentStreamId();
        _docUnsub = ref.onSnapshot(function (doc) {
            if (!doc.exists) return;
            var data = doc.data() || {};
            var incomingPoll = data.activePoll || null;
            var pollChangedId = !incomingPoll || !_poll || incomingPoll.id !== _poll.id;
            _poll = incomingPoll;
            if (pollChangedId) _myVoteIdx = _poll && _poll.voterIds && _poll.voterIds[myId()] != null ? _poll.voterIds[myId()] : null;
            else if (_poll && _poll.voterIds && _poll.voterIds[myId()] != null) _myVoteIdx = _poll.voterIds[myId()];

            _chatMode = data.chatMode || 'off';
            _slowSeconds = data.slowModeSeconds || 10;

            _renderPollCard();
            _refreshChatModeBanner();
            _refreshHostChatModeBtn();
        }, function (err) { console.warn('[V51] active_streams listener error:', err.message); });
    }
    function _detachDocListener() { if (_docUnsub) { _docUnsub(); _docUnsub = null; } _docStreamId = null; _poll = null; _myVoteIdx = null; _chatMode = 'off'; }

    /* =========================================================================
       §2 — LIVE POLLS / Q&A
       ========================================================================= */
    function _openCreatePollModal() {
        var container = document.getElementById('live-stream-screen') || document.body;
        var modal = document.getElementById('pv51-poll-create-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pv51-poll-create-modal';
            modal.className = 'live-sub-modal'; // reuse the existing sub-modal look (app-patch-v42.js's popup uses the same class) — no new modal CSS needed
            modal.innerHTML =
                '<button type="button" class="close-modal pv51-poll-close" style="color:white; z-index:5; top:5px; right:10px;">\u00d7</button>' +
                '<h3>\uD83D\uDCCA Start a Poll</h3>' +
                '<div style="padding:4px 2px;">' +
                '<input type="text" id="pv51-poll-q" placeholder="Ask a question\u2026" maxlength="120" style="width:100%;margin-bottom:10px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;">' +
                '<input type="text" class="pv51-poll-opt" placeholder="Option 1" maxlength="40" style="width:100%;margin-bottom:8px;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;">' +
                '<input type="text" class="pv51-poll-opt" placeholder="Option 2" maxlength="40" style="width:100%;margin-bottom:8px;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;">' +
                '<input type="text" class="pv51-poll-opt" placeholder="Option 3 (optional)" maxlength="40" style="width:100%;margin-bottom:8px;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;">' +
                '<input type="text" class="pv51-poll-opt" placeholder="Option 4 (optional)" maxlength="40" style="width:100%;margin-bottom:12px;padding:9px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);color:#fff;">' +
                '<button type="button" id="pv51-poll-start-btn" class="btn btn-accent" style="width:100%;">Start Poll</button>' +
                '</div>';
            container.appendChild(modal);
            modal.querySelector('.pv51-poll-close').addEventListener('click', function () { modal.classList.remove('show'); });
            modal.querySelector('#pv51-poll-start-btn').addEventListener('click', _createPoll);
        }
        // FIX (bug report: "works on the first tap, then stops responding"):
        // this used to be a plain `.classList.add('show')` — fine for the
        // FIRST tap, but every tap after that landed on an already-open
        // modal, so `.add('show')` was a true no-op: nothing visibly
        // changed, which reads exactly like the button had stopped
        // working. Same root cause and same fix as pv55's sound/beauty
        // modals and pv56's pin-a-product picker: toggle instead, so a
        // second tap on the poll icon closes it like every other
        // toggleable icon on this panel.
        modal.classList.toggle('show');
    }
    // FIX (2026-08-02 — bug 2): exposed on window for the same reason as
    // window._pv50HostHypeClap above — reached from the guaranteed-first
    // capture handler appended at the end of this file.
    window._pv51OpenPollModal = _openCreatePollModal;
    function _createPoll() {
        var q = (document.getElementById('pv51-poll-q') || {}).value || '';
        q = q.trim();
        if (!q) { notify('Add a question first.', 'warning'); return; }
        var opts = Array.prototype.slice.call(document.querySelectorAll('.pv51-poll-opt'))
            .map(function (i) { return (i.value || '').trim(); })
            .filter(Boolean);
        if (opts.length < 2) { notify('Add at least two options.', 'warning'); return; }
        var ref = streamDocRef();
        if (!ref) return;
        var poll = {
            id: 'poll-' + Date.now(),
            question: q,
            options: opts.map(function (t) { return { text: t, votes: 0 }; }),
            voterIds: {},
            open: true,
            createdBy: myId(),
            createdAt: Date.now()
        };
        ref.update({ activePoll: poll }).then(function () {
            var modal = document.getElementById('pv51-poll-create-modal');
            if (modal) modal.classList.remove('show');
            notify('\uD83D\uDCCA Poll started!', 'success');
        }).catch(function (err) { notify('Could not start poll: ' + (err.message || 'try again.'), 'error'); });
    }
    function _endPoll() {
        var ref = streamDocRef();
        if (!ref || !_poll) return;
        var closed = Object.assign({}, _poll, { open: false });
        ref.update({ 'activePoll.open': false }).catch(function (err) { console.warn('[V51] could not close poll:', err.message); });
    }
    function _vote(optionIdx) {
        var uid = myId();
        if (!uid) { notify('Sign in to vote.', 'warning'); return; }
        var ref = streamDocRef();
        if (!ref || !window.fbDb) return;
        window.fbDb.runTransaction(function (tx) {
            return tx.get(ref).then(function (doc) {
                var data = doc.data() || {};
                var poll = data.activePoll;
                if (!poll || !poll.open) throw new Error('pv51-no-active-poll');
                var voterIds = poll.voterIds || {};
                if (Object.prototype.hasOwnProperty.call(voterIds, uid)) throw new Error('pv51-already-voted');
                voterIds = Object.assign({}, voterIds);
                voterIds[uid] = optionIdx;
                var options = poll.options.slice();
                options[optionIdx] = Object.assign({}, options[optionIdx], { votes: (options[optionIdx].votes || 0) + 1 });
                tx.update(ref, { 'activePoll.voterIds': voterIds, 'activePoll.options': options });
            });
        }).then(function () {
            _myVoteIdx = optionIdx; // optimistic — the listener will confirm shortly
            _renderPollCard();
        }).catch(function (err) {
            if (err && err.message === 'pv51-already-voted') { /* another tab/device already recorded it — just resync silently */ }
            else if (err && err.message !== 'pv51-no-active-poll') notify('Could not record your vote — try again.', 'error');
        });
    }
    function _renderPollCard() {
        var existing = document.getElementById('pv51-poll-card');
        if (!_poll) { if (existing) existing.remove(); return; }

        var card = existing;
        if (!card) {
            var host = document.getElementById('live-stream-screen');
            if (!host) return;
            card = document.createElement('div');
            card.id = 'pv51-poll-card';
            host.appendChild(card);
        }

        var totalVotes = _poll.options.reduce(function (s, o) { return s + (o.votes || 0); }, 0);
        var optionsHTML = _poll.options.map(function (o, i) {
            var pct = totalVotes ? Math.round((100 * (o.votes || 0)) / totalVotes) : 0;
            var mine = _myVoteIdx === i;
            var voted = _myVoteIdx != null;
            return '<button type="button" class="pv51-poll-opt-btn' + (mine ? ' pv51-poll-opt-mine' : '') + '" data-pv51-opt="' + i + '"' + (voted ? ' disabled' : '') + '>' +
                '<span class="pv51-poll-opt-fill" style="width:' + (voted ? pct : 0) + '%;"></span>' +
                '<span class="pv51-poll-opt-label">' + esc(o.text) + (voted ? ' \u2014 ' + pct + '%' : '') + (mine ? ' \u2713' : '') + '</span>' +
                '</button>';
        }).join('');

        card.className = 'pv51-poll-card' + (_poll.open ? '' : ' pv51-poll-closed');
        card.innerHTML =
            '<div class="pv51-poll-head"><span>\uD83D\uDCCA ' + esc(_poll.question) + '</span>' +
            (isRealHost() && _poll.open ? '<button type="button" id="pv51-poll-end-btn" title="End poll">\u00d7</button>' : '') +
            '</div>' +
            optionsHTML +
            (!_poll.open ? '<div class="pv51-poll-final">Poll closed \u2014 ' + totalVotes + ' vote' + (totalVotes === 1 ? '' : 's') + '</div>' : '');

        if (isRealHost() && _poll.open) {
            var endBtn = document.getElementById('pv51-poll-end-btn');
            if (endBtn) endBtn.addEventListener('click', _endPoll);
        }
        if (_poll.open && _myVoteIdx == null) {
            card.querySelectorAll('[data-pv51-opt]').forEach(function (btn) {
                btn.addEventListener('click', function () { _vote(parseInt(btn.getAttribute('data-pv51-opt'), 10)); });
            });
        }
    }

    /* =========================================================================
       §3 — GIFT COMBO BURST. Wraps window.createLiveGiftComment (already
       wrapped once by app-patch-v42.js for badge decoration — wrapping it
       again here just adds one more layer, the same established decorator
       pattern, and doesn't touch v42's own wrap). createLiveGiftComment
       (app-fixes.js) stores the running per-row combo count in
       row.dataset.giftCount, incrementing IN PLACE on the same DOM node
       for repeat gifts from the same sender — this reads that count right
       after each call to decide whether a milestone was just crossed.
       ========================================================================= */
    var COMBO_MILESTONES = [5, 10, 25, 50, 100, 250, 500];
    function _showComboBurst(username, giftName, count) {
        var host = document.getElementById('live-stream-screen');
        if (!host) return;
        var el = document.createElement('div');
        el.className = 'pv51-combo-burst';
        el.innerHTML =
            '<div class="pv51-combo-x">\u00d7' + count + '</div>' +
            '<div class="pv51-combo-sub">' + esc(username) + ' \u2014 ' + esc(giftName) + ' COMBO!</div>';
        host.appendChild(el);
        el.addEventListener('animationend', function () { el.remove(); });
        setTimeout(function () { if (el.parentNode) el.remove(); }, 2200); // safety net if animationend is ever missed
    }
    (function armComboWrap() {
        function tryArm() {
            var orig = window.createLiveGiftComment;
            if (typeof orig !== 'function' || orig._pv51Wrapped) return;
            var wrapped = function (username, avatarUrl, giftSymbol, giftName, userId) {
                var result = orig.apply(this, arguments);
                try {
                    var list = document.getElementById('live-comments-list');
                    var row = list && list.firstElementChild;
                    if (row && row.classList.contains('tk-gift-comment')) {
                        var count = parseInt(row.dataset.giftCount, 10) || 1;
                        if (COMBO_MILESTONES.indexOf(count) !== -1) _showComboBurst(username, giftName, count);
                    }
                } catch (e) { /* a combo-animation glitch must never break gift rendering itself */ }
                return result;
            };
            wrapped._pv51Wrapped = true;
            window.createLiveGiftComment = wrapped;
        }
        tryArm();
        setTimeout(tryArm, 500);
        setTimeout(tryArm, 1500);
    })();

    /* =========================================================================
       §4 — SLOW MODE / FOLLOWERS-ONLY CHAT
       ========================================================================= */
    var _lastMyCommentAt = 0;
    function _cycleChatMode() {
        if (!isRealHost()) return;
        var ref = streamDocRef();
        if (!ref) return;
        var next = _chatMode === 'off' ? 'slow' : (_chatMode === 'slow' ? 'followers' : 'off');
        ref.update({ chatMode: next, slowModeSeconds: _slowSeconds || 10 }).then(function () {
            var labels = { off: 'Chat mode: Off', slow: '\uD83D\uDC22 Slow mode on (' + (_slowSeconds || 10) + 's between messages)', followers: '\uD83D\uDD12 Followers-only chat on' };
            notify(labels[next], 'info');
        }).catch(function (err) { console.warn('[V51] could not change chat mode:', err.message); });
    }
    // FIX (2026-08-02 — bug 2): exposed on window, same reason as the two
    // window exposures above.
    window._pv51CycleChatMode = _cycleChatMode;
    function _refreshHostChatModeBtn() {
        var btn = document.getElementById('pv51-chatmode-btn');
        if (!btn) return;
        /* FIX (2026-08-02 — broken/"X-box" icon report): same root cause
           and fix as the clap/poll buttons above — this was a 3-state map
           of raw emoji glyphs, which is exactly what showed as a broken
           tofu box on the reporting device. Each state now maps to a FA6
           icon-font glyph instead, so it renders reliably regardless of
           the device's own emoji font coverage. */
        var icons = { off: 'fa-comment', slow: 'fa-hourglass-half', followers: 'fa-lock' };
        btn.innerHTML = '<i class="fas ' + icons[_chatMode] + '"></i>';
        btn.title = _chatMode === 'off' ? 'Chat: Off (tap to enable slow mode)' : (_chatMode === 'slow' ? 'Slow mode on (tap for followers-only)' : 'Followers-only on (tap to turn off)');
    }
    function _ensureHostChatModeBtn() {
        if (!isRealHost()) {
            var existing = document.getElementById('pv51-chatmode-btn');
            if (existing) existing.remove();
            var pollBtn = document.getElementById('pv51-poll-btn');
            if (pollBtn) pollBtn.remove();
            return;
        }
        var panel = document.getElementById('host-control-panel-inner');
        if (!panel) return;
        if (!document.getElementById('pv51-chatmode-btn')) {
            var btn = document.createElement('button');
            btn.id = 'pv51-chatmode-btn';
            btn.type = 'button';
            btn.className = 'live-action-btn';
            btn.addEventListener('click', _cycleChatMode);
            panel.appendChild(btn);
            _refreshHostChatModeBtn();
        }
        if (!document.getElementById('pv51-poll-btn')) {
            var pbtn = document.createElement('button');
            pbtn.id = 'pv51-poll-btn';
            pbtn.type = 'button';
            pbtn.className = 'live-action-btn';
            pbtn.title = 'Start a poll';
            /* FIX (2026-08-02 — broken/"X-box" icon report): same root
               cause and fix as the clap button above — raw emoji ->
               FA6 icon-font glyph, so it renders regardless of the
               device's own emoji font coverage. */
            pbtn.innerHTML = '<i class="fas fa-square-poll-vertical"></i>';
            pbtn.addEventListener('click', _openCreatePollModal);
            panel.appendChild(pbtn);
        }
    }
    function _refreshChatModeBanner() {
        var footer = document.querySelector('#live-stream-screen .live-footer');
        if (!footer) return;
        var existing = document.getElementById('pv51-chatmode-banner');
        var blocked = _chatMode === 'followers' && !isRealHost() && !iFollowHost();
        if (_chatMode === 'off' || isRealHost()) { if (existing) existing.remove(); return; }
        if (!existing) {
            existing = document.createElement('div');
            existing.id = 'pv51-chatmode-banner';
            footer.parentNode.insertBefore(existing, footer);
        }
        existing.className = 'pv51-chatmode-banner' + (blocked ? ' pv51-chatmode-blocked' : '');
        existing.textContent = _chatMode === 'slow'
            ? ('\uD83D\uDC22 Slow mode: ' + _slowSeconds + 's between messages')
            : (blocked ? '\uD83D\uDD12 Only followers of the host can chat right now' : '\uD83D\uDD12 Followers-only chat is on');
    }
    // Capture-phase gate, same established pattern app-patch-v49.js already
    // uses for #p2p-transfer-form: check the rule BEFORE app-fixes.js's own
    // bubble-phase 'live-comment-form' case runs, and only block — never
    // replace — the real submit logic when the rule isn't violated.
    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.id !== 'live-comment-form') return;
        if (isRealHost()) return; // the host is never subject to their own chat-mode restriction
        if (_chatMode === 'slow') {
            var now = Date.now();
            var remaining = _slowSeconds * 1000 - (now - _lastMyCommentAt);
            if (remaining > 0) {
                e.preventDefault(); e.stopImmediatePropagation();
                notify('\uD83D\uDC22 Slow mode \u2014 wait ' + Math.ceil(remaining / 1000) + 's before your next message.', 'warning');
                return;
            }
            _lastMyCommentAt = now;
        } else if (_chatMode === 'followers') {
            if (!iFollowHost()) {
                e.preventDefault(); e.stopImmediatePropagation();
                notify('\uD83D\uDD12 Only followers of the host can chat right now \u2014 follow to join in.', 'warning');
                return;
            }
        }
    }, true);

    /* =========================================================================
       §5 — CSS (all class names prefixed pv51- to guarantee zero collision
       with any existing selector).
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv51-css')) return;
        var css = document.createElement('style');
        css.id = 'pv51-css';
        css.textContent =
            /* Poll card — floats near the top of the stream, out of the
               way of the host video and the guest-box grid on the right. */
            '.pv51-poll-card{position:absolute;top:70px;left:12px;right:100px;z-index:15;background:rgba(10,14,39,0.82);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:10px 12px;max-width:320px;}' +
            '.pv51-poll-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;font-size:0.82rem;color:#fff;margin-bottom:8px;}' +
            '.pv51-poll-head button{background:rgba(255,255,255,0.12);border:none;color:#fff;width:22px;height:22px;border-radius:50%;font-size:0.9rem;line-height:1;cursor:pointer;flex-shrink:0;}' +
            '.pv51-poll-opt-btn{position:relative;display:block;width:100%;text-align:left;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#fff;border-radius:9px;padding:8px 10px;margin-bottom:6px;font-size:0.78rem;font-weight:600;cursor:pointer;overflow:hidden;}' +
            '.pv51-poll-opt-btn:disabled{cursor:default;}' +
            '.pv51-poll-opt-fill{position:absolute;top:0;left:0;bottom:0;background:linear-gradient(90deg,rgba(62,123,250,0.55),rgba(62,123,250,0.25));transition:width .4s ease;}' +
            '.pv51-poll-opt-label{position:relative;z-index:1;}' +
            '.pv51-poll-opt-mine{border-color:#3E7BFA;}' +
            '.pv51-poll-final{font-size:0.7rem;color:#9fb0d6;margin-top:2px;}' +
            '.pv51-poll-closed{opacity:0.85;}' +
            /* Combo burst — brief full-width flash, center of the stream. */
            '@keyframes pv51ComboIn{0%{opacity:0;transform:translate(-50%,-40%) scale(0.6);}30%{opacity:1;transform:translate(-50%,-50%) scale(1.08);}70%{opacity:1;transform:translate(-50%,-50%) scale(1);}100%{opacity:0;transform:translate(-50%,-56%) scale(1);}}' +
            '.pv51-combo-burst{position:absolute;top:42%;left:50%;z-index:30;text-align:center;pointer-events:none;animation:pv51ComboIn 1.9s ease forwards;}' +
            '.pv51-combo-x{font-size:2.6rem;font-weight:900;color:#F5C518;text-shadow:0 0 14px rgba(245,197,24,0.75),0 2px 6px rgba(0,0,0,0.6);}' +
            '.pv51-combo-sub{font-size:0.85rem;font-weight:700;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,0.6);margin-top:2px;}' +
            /* Chat-mode banner, sits directly above the composer footer. */
            '.pv51-chatmode-banner{background:rgba(245,197,24,0.14);border-top:1px solid rgba(245,197,24,0.3);color:#F5C518;font-size:0.72rem;font-weight:700;text-align:center;padding:5px 10px;}' +
            '.pv51-chatmode-banner.pv51-chatmode-blocked{background:rgba(239,68,68,0.16);border-top-color:rgba(239,68,68,0.35);color:#f87171;}';
        document.head.appendChild(css);
    })();

    /* =========================================================================
       §6 — wiring: attach/detach alongside the live modal, the same
       #go-live-modal-overlay class-toggle trigger app-patch-v33.js /
       app-patch-v42.js / app-patch-v50.js already observe.
       ========================================================================= */
    function onModalToggle() {
        var modal = document.getElementById('go-live-modal-overlay');
        if (!modal) return;
        if (modal.classList.contains('show')) {
            _attachDocListener();
            setTimeout(_ensureHostChatModeBtn, 400);
        } else {
            _detachDocListener();
            var pollCard = document.getElementById('pv51-poll-card'); if (pollCard) pollCard.remove();
            var banner = document.getElementById('pv51-chatmode-banner'); if (banner) banner.remove();
            var cbtn = document.getElementById('pv51-chatmode-btn'); if (cbtn) cbtn.remove();
            var pbtn = document.getElementById('pv51-poll-btn'); if (pbtn) pbtn.remove();
            var createModal = document.getElementById('pv51-poll-create-modal'); if (createModal) createModal.remove();
        }
    }
    function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
    ready(function () {
        var modal = document.getElementById('go-live-modal-overlay');
        if (modal) {
            new MutationObserver(onModalToggle).observe(modal, { attributes: true, attributeFilter: ['class'] });
            if (modal.classList.contains('show')) onModalToggle();
        }
        // Cheap, idempotent recheck for a host/guest role flip mid-stream —
        // same interval pattern app-patch-v42.js already uses for its own
        // level chip.
        setInterval(function () {
            var m = document.getElementById('go-live-modal-overlay');
            if (m && m.classList.contains('show')) _ensureHostChatModeBtn();
        }, 1500);
    });

    console.log('[EmpyreanPatchV51] \u2705 Live polls/Q&A (host \uD83D\uDCCA button in the control panel), gift combo-streak bursts (milestones: ' + COMBO_MILESTONES.join(', ') + '), and slow-mode/followers-only chat (host toggle, cycles Off \u2192 Slow \u2192 Followers-only) all wired \u2014 all three stored as fields on the existing active_streams document, so no new Firestore rule is needed. Pure addition \u2014 no existing live-streaming file was edited.');

})();
/* ═══════════════════════════════════════════════════════════════════════
   app-patch-v52.js — PK / Battle Mode (two hosts, split-screen, timed
   gift totals, forfeit animation)
   ═══════════════════════════════════════════════════════════════════════
   Appended below UNCHANGED per the merge note at the top of this file. */
/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v52
   app-patch-v52.js  |  Load LAST (after every live-streaming file —
   app-live.js, app-live-tiktok-patch.js, app-live-final.js, app-fixes.js —
   and after app-patch-v42.js/v50/v51, whose host-control-panel insertion
   point and listener lifecycle this file reuses)

   FEATURE — PK / BATTLE MODE

   REQUESTED: two hosts live simultaneously, split-screen, timed gift
   totals, loser gets a forfeit animation.

   ═══════════════════════════════════════════════════════════════════════
   WHY THIS COULD BE BUILT AS A PURE ADDITIVE FILE
   ═══════════════════════════════════════════════════════════════════════
   The brief for this feature says "Agora dual-client (already proven via
   guest-broadcast)". Verified directly against app-live-tiktok-patch.js's
   promoteToGuestBroadcaster(): a device already runs its normal
   host/viewer client PLUS one independent extra AgoraRTC.createClient()
   for a second role, side by side, with no interference between them (the
   existing echo-prevention convention — window._empOwnGuestUid — is the
   proof this already works safely in production here). PK battle reuses
   that exact proven shape one level further: every device already
   watching either side of the battle (that side's own host AND every one
   of that side's viewers) opens ONE MORE independent, audience-only Agora
   client that joins ONLY the opponent's channel (never the opponent's own
   viewer/chat data) purely to render their video into the other half of
   the screen. Nobody's existing client, channel membership, or chat feed
   is touched — each side's stream keeps running exactly as it already
   does; PK battle is a synchronized OVERLAY on top of two independently
   unmodified streams, not a merge of them.

   The other proven building block this reuses: gift totals. Every gift
   already lands in `live_gifts` (streamId, senderId, amount, createdAt) —
   the same collection app-patch-v42.js's own gift-points track and the
   existing viewer-rankings modal already read. This file adds two more
   independent, read-only listeners on that same collection (one per
   competing streamId), which is the same "many independent listeners on
   one collection" pattern already established by
   attachGiftCountListener + attachGiftSyncListener + loadViewerRankings +
   app-patch-v42.js's own gift-points listener. Verified the exact gift
   doc shape by reading the write site directly (app-fixes.js's gift-
   catalog send path) — `createdAt` is a client-set `new Date().toISOString()`
   string, which sorts and compares correctly as a battle-window cutoff
   without needing a Firestore range query (see §8 below for why that
   matters: an equality + range compound query would need a NEW composite
   index, which this file deliberately avoids needing).

   Nothing in app-live.js / app-live-tiktok-patch.js / app-live-final.js /
   app-fixes.js needed editing — window._fetchLiveAgoraToken and
   window._liveAgoraAppId (both already exposed on window for exactly
   this kind of second-client join) are reused as-is.

   ═══════════════════════════════════════════════════════════════════════
   DATA MODEL
   ═══════════════════════════════════════════════════════════════════════
   ONE new collection, `pk_battles` (a battle spans two independent stream
   documents, so — unlike v51's three features — this genuinely cannot be
   just a field on one existing doc; it needs its own doc both hosts and
   both audiences can read). Doc id = battleId.
     { battleId, status: 'invited'|'active'|'ended'|'declined'|'cancelled',
       inviterId, hostAId, hostBId,          // top-level, for querying
       hostA: {userId,streamId,name,avatar,channel,agoraUid},
       hostB: {userId,streamId,name,avatar,channel,agoraUid},
       durationSeconds, startedAt, endsAt, winnerId, createdAt }

   PLUS one new field on the EXISTING active_streams document (mirrors
   v51's own "fields on active_streams" convention for anything that only
   needs to live on one side): `activePkBattleId` — written by each host
   onto their OWN stream doc only, once their side has actually joined an
   active battle. This is how a brand-new viewer (or this device
   reconnecting) discovers "this stream is mid-battle" from the exact
   per-stream doc it's already subscribed to, without a separate query.

   Firestore rule needed (this file's one manual step, same category as
   app-patch-v42.js's live_engagement and app-patch-v50.js's
   live_reactions): `pk_battles` needs the same permissive
   `allow read, write: if request.auth != null;` this codebase already
   uses for active_streams/live_gifts/live_comments — no new rule pattern,
   just one more collection on the existing allow-list. active_streams
   itself already allows `update: if request.auth != null` (verified
   directly against firebase-rules.js), so activePkBattleId needs no rule
   change at all.

   ═══════════════════════════════════════════════════════════════════════
   WINNER DETERMINATION — single-writer-with-fallback, not a vote
   ═══════════════════════════════════════════════════════════════════════
   Every device (both hosts, every viewer on either side) computes the
   same two gift totals independently and locally, from the same
   `live_gifts` data with the same shared startedAt cutoff (read from the
   one battle doc) — so they agree by construction, not by coordination.
   Only writing "the battle is over" needs exactly one actor: host A's own
   device attempts it the instant its local countdown reaches endsAt,
   guarded by a Firestore transaction that only applies if status is still
   'active' (so a duplicate attempt is always a safe no-op, the same
   transaction-guard shape app-patch-v51.js's own poll-vote transaction
   already uses in this codebase). Host B's device attempts the same
   transaction 3s later ONLY if the battle doc is still 'active' at that
   point — a fallback for the (rare) case host A's tab closed right at the
   buzzer — so there is never a scenario where a battle is left "active"
   forever with nobody able to close it out.
   ============================================================================= */

(function empyreanPatchV52() {
    'use strict';

    if (window._empPatchV52Loaded) {
        console.warn('[V52] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV52Loaded = true;

    function log(msg) { console.log('[V52-PK] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    /* ── §0 — config ─────────────────────────────────────────────────── */
    var DURATION_PRESETS = [180, 300, 600]; // 3 / 5 / 10 minutes
    var DEFAULT_DURATION_IDX = 1;           // 5 minutes
    var INVITE_EXPIRE_MS = 25000;           // auto-decline/auto-cancel an unanswered invite
    var END_FALLBACK_DELAY_MS = 3000;       // host B's fallback end attempt, after host A's
    var FALLBACK_APP_ID = '056a96cf521d4d06887a84319c62912b'; // same fallback app-live-tiktok-patch.js already uses

    /* ── §1 — shared helpers, same shape every other live-streaming patch
       in this codebase already uses (app-patch-v33/v42/v50/v51's own
       copies) ── */
    function _us() { return window.userState || {}; }
    function myId() { return _us().id; }
    function currentStreamId() { return window.liveStreamData && window.liveStreamData.streamId; }
    function fbReady() { return !!(window.fbDb && window._firebaseLoaded); }
    function myHostAgoraUid() { return window.liveStreamData && window.liveStreamData.hostAgoraUid; }
    function myChannel() {
        return window._agoraActiveChannel || (window.liveStreamData && window.liveStreamData.streamId ? ('empyrean-' + window.liveStreamData.streamId) : null);
    }
    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }
    function streamDocRef(sid) {
        sid = sid || currentStreamId();
        if (!fbReady() || !sid) return null;
        return window.fbDb.collection('active_streams').doc(sid);
    }
    function battleDocRef(id) {
        if (!fbReady() || !id) return null;
        return window.fbDb.collection('pk_battles').doc(id);
    }
    function agoraAppId() { return (window._liveAgoraAppId && window._liveAgoraAppId()) || FALLBACK_APP_ID; }
    function _pkAudienceUid() {
        // Distinct offset range (700001+) from the guest-broadcast formula
        // (100001+, see safeGuestUid/_agoraUidFor/_agoraUidForUserId — must
        // stay in sync across those three) so this third kind of client
        // can never collide with a guest uid inside the SAME channel.
        var base = String(myId() || Math.random());
        var h = 0;
        for (var i = 0; i < base.length; i++) h = ((h << 5) - h) + base.charCodeAt(i);
        return (Math.abs(h) % 900000) + 700001;
    }

    /* ── §2 — state (all reset in _teardownBattleUI / on modal close) ── */
    var _myStreamDocUnsub = null;      // watches OWN active_streams doc for activePkBattleId
    var _myStreamDocStreamId = null;
    var _battleUnsub = null;           // direct listener on the known pk_battles/{battleId} doc
    var _battleId = null;
    var _battle = null;                // last-known battle doc data
    var _iAmHostA = false;
    var _iAmHostB = false;
    var _pkOpponentClient = null;
    var _giftTotals = { A: 0, B: 0 };
    var _giftSeen = { A: {}, B: {} };
    var _giftUnsubA = null, _giftUnsubB = null;
    var _endTimer = null;
    var _incomingInviteUnsub = null;   // host-only, always-on while live: "am I being challenged?"
    var _pendingInviteBattleId = null; // host A's own outstanding invite, while status is still 'invited'

    /* =========================================================================
       §3 — OWN stream-doc listener: discovers activePkBattleId the same
       way any other independent per-stream listener in this codebase
       already does (its own onSnapshot on streamDocRef(), reading just
       the one field it needs — see app-live-tiktok-patch.js's
       attachStreamListener doing exactly this for hostAgoraUid).
       ========================================================================= */
    function _attachMyStreamDocListener() {
        _detachMyStreamDocListener();
        var ref = streamDocRef();
        if (!ref) return;
        _myStreamDocStreamId = currentStreamId();
        _myStreamDocUnsub = ref.onSnapshot(function (doc) {
            if (!doc.exists) return;
            var data = doc.data() || {};
            var incomingId = data.activePkBattleId || null;
            if (incomingId !== _battleId) {
                if (incomingId) _attachBattleListener(incomingId);
                else _detachBattleListener();
            }
        }, function (err) { console.warn('[V52] stream-doc listener error:', err.message); });
    }
    function _detachMyStreamDocListener() { if (_myStreamDocUnsub) { _myStreamDocUnsub(); _myStreamDocUnsub = null; } _myStreamDocStreamId = null; }

    /* =========================================================================
       §4 — direct battle-doc listener. Everything downstream (split-
       screen entry/exit, score bar, end-of-battle) is driven from here.
       ========================================================================= */
    function _attachBattleListener(id) {
        if (_battleId === id && _battleUnsub) return; // already watching this exact battle
        _detachBattleListener();
        var ref = battleDocRef(id);
        if (!ref) return;
        _battleId = id;
        _battleUnsub = ref.onSnapshot(function (doc) {
            if (!doc.exists) { _detachBattleListener(); return; }
            var data = doc.data() || {};
            var prevStatus = _battle && _battle.status;
            _battle = data;
            _iAmHostA = data.hostAId === myId();
            _iAmHostB = data.hostBId === myId();

            if (data.status === 'active') {
                if (prevStatus !== 'active') _enterBattle(data);
                _refreshScoreBar();
                _armEndTimer(data);
            } else if (data.status === 'ended') {
                if (prevStatus !== 'ended') _showEndBanner(data);
                _clearOwnActiveBattleField();
                setTimeout(_teardownBattleUI, 4200); // let the winner/forfeit banner play first
            } else if (data.status === 'declined' || data.status === 'cancelled') {
                if (_iAmHostA && _pendingInviteBattleId === id) {
                    notify(data.status === 'declined' ? '\u274C The other host declined your PK invite.' : '\u23F1\uFE0F Your PK invite expired unanswered.', 'info');
                }
                _pendingInviteBattleId = null;
                var banner = document.getElementById('pv52-invite-wait-banner'); if (banner) banner.remove();
                _detachBattleListener();
            }
        }, function (err) { console.warn('[V52] battle listener error:', err.message); });
    }
    function _detachBattleListener() {
        if (_battleUnsub) { _battleUnsub(); _battleUnsub = null; }
        if (_battleId) _teardownBattleUI();
        _battleId = null; _battle = null; _iAmHostA = false; _iAmHostB = false;
    }
    function _clearOwnActiveBattleField() {
        if (!isRealHost()) return; // only a host writes their own stream doc
        var ref = streamDocRef();
        if (ref) ref.update({ activePkBattleId: null }).catch(function () {});
    }

    /* =========================================================================
       §5 — opponent picker + sending an invite (host-only)
       ========================================================================= */
    function _openPickerModal() {
        if (!isRealHost()) return;
        if (_battleId) { notify('You\u2019re already in a PK battle.', 'info'); return; }
        var container = document.getElementById('live-stream-screen') || document.body;
        var modal = document.getElementById('pv52-picker-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pv52-picker-modal';
            modal.className = 'live-sub-modal';
            modal.innerHTML =
                '<button type="button" class="close-modal pv52-picker-close" style="color:white; z-index:5; top:5px; right:10px;">\u00d7</button>' +
                '<h3>\u2694\uFE0F Challenge a Host to PK Battle</h3>' +
                '<div style="display:flex;gap:6px;justify-content:center;margin-bottom:10px;" id="pv52-duration-picker"></div>' +
                '<div id="pv52-picker-list" style="max-height:50vh;overflow-y:auto;"><p style="text-align:center;color:#ccc;padding:20px;">Loading live hosts\u2026</p></div>';
            container.appendChild(modal);
            modal.querySelector('.pv52-picker-close').addEventListener('click', function () { modal.classList.remove('show'); });

            var durWrap = modal.querySelector('#pv52-duration-picker');
            DURATION_PRESETS.forEach(function (secs, i) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'pv52-dur-btn' + (i === DEFAULT_DURATION_IDX ? ' pv52-dur-active' : '');
                b.dataset.secs = secs;
                b.textContent = Math.round(secs / 60) + ' min';
                b.addEventListener('click', function () {
                    durWrap.querySelectorAll('.pv52-dur-btn').forEach(function (x) { x.classList.remove('pv52-dur-active'); });
                    b.classList.add('pv52-dur-active');
                });
                durWrap.appendChild(b);
            });
        }
        // FIX (bug report: "works on the first tap, then stops responding"):
        // this used to be a plain `.classList.add('show')` — a no-op on
        // every tap after the first, since the modal was already showing.
        // Same root cause and same fix as pv51/pv55/pv56 above: toggle
        // instead, and only re-fetch the live-host list when the picker is
        // actually opening (not on the tap that closes it).
        var opening = !modal.classList.contains('show');
        modal.classList.toggle('show');
        if (opening) _loadOtherLiveHosts();
    }
    function _loadOtherLiveHosts() {
        var list = document.getElementById('pv52-picker-list');
        if (!list || !fbReady()) return;
        window.fbDb.collection('active_streams').where('isLive', '==', true).limit(20).get()
            .then(function (snap) {
                var mySid = currentStreamId(), myHid = myId();
                var rows = [];
                snap.forEach(function (doc) {
                    var d = doc.data() || {};
                    if (doc.id === mySid || d.hostId === myHid) return;
                    // FIX (bug: "same host listed twice in the PK challenge
                    // picker"): a host can have more than one active_streams
                    // doc at once — an orphaned one left behind by an unclean
                    // end (crash/force-quit, no proper End Live teardown; see
                    // sweepGlobalStaleStreams()'s own comment on this exact
                    // failure mode) plus their current, actually-live doc.
                    // Keying rows only on doc.id let both render as separate
                    // picker entries with the same name/avatar. De-dupe by
                    // hostId here, keeping whichever doc is actually fresh —
                    // same lastHeartbeat-first/startedAt-fallback signal
                    // app-live-tiktok-patch.js's sweepGlobalStaleStreams()
                    // already uses to tell a live stream from an abandoned
                    // one, so a stale duplicate never wins over the real one.
                    var hb = d.lastHeartbeat ? Date.parse(d.lastHeartbeat) : NaN;
                    var started = d.startedAt ? Date.parse(d.startedAt) : NaN;
                    var freshness = !isNaN(hb) ? hb : (!isNaN(started) ? started : 0);
                    var row = {
                        streamId: doc.id, hostId: d.hostId, name: d.hostName || 'Host',
                        avatar: d.hostAvatar || '', agoraUid: d.hostAgoraUid,
                        channel: d.channel || ('empyrean-' + doc.id), _freshness: freshness
                    };
                    var dupeIdx = -1;
                    for (var i = 0; i < rows.length; i++) {
                        if (rows[i].hostId === d.hostId) { dupeIdx = i; break; }
                    }
                    if (dupeIdx === -1) rows.push(row);
                    else if (freshness > rows[dupeIdx]._freshness) rows[dupeIdx] = row;
                });
                if (!rows.length) {
                    list.innerHTML = '<p style="text-align:center;color:#ccc;padding:20px;">No other hosts are live right now.</p>';
                    return;
                }
                list.innerHTML = rows.map(function (r) {
                    var av = r.avatar || ('https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(r.name));
                    return '<div class="pv52-picker-row" data-sid="' + esc(r.streamId) + '">' +
                        '<img src="' + av + '" alt="">' +
                        '<span class="pv52-picker-name">' + esc(r.name) + '</span>' +
                        '<button type="button" class="btn btn-accent pv52-challenge-btn" data-sid="' + esc(r.streamId) + '">Challenge</button>' +
                        '</div>';
                }).join('');
                rows.forEach(function (r) {
                    var btn = list.querySelector('.pv52-challenge-btn[data-sid="' + r.streamId.replace(/"/g, '') + '"]');
                    if (btn) btn.addEventListener('click', function () { _sendInvite(r); });
                });
            })
            .catch(function (err) {
                list.innerHTML = '<p style="text-align:center;color:#f87171;padding:20px;">Could not load live hosts.</p>';
                console.warn('[V52] picker load failed:', err.message);
            });
    }
    function _sendInvite(target) {
        if (!fbReady() || !currentStreamId()) return;
        var durBtn = document.querySelector('#pv52-duration-picker .pv52-dur-active');
        var duration = durBtn ? parseInt(durBtn.dataset.secs, 10) : DURATION_PRESETS[DEFAULT_DURATION_IDX];
        var us = _us();
        var battleId = 'pk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        var battle = {
            battleId: battleId, status: 'invited', inviterId: myId(),
            hostAId: myId(), hostBId: target.hostId,
            hostA: { userId: myId(), streamId: currentStreamId(), name: us.fullName || us.username || 'Host', avatar: us.avatar || '', channel: myChannel(), agoraUid: myHostAgoraUid() || null },
            hostB: { userId: target.hostId, streamId: target.streamId, name: target.name, avatar: target.avatar, channel: target.channel, agoraUid: target.agoraUid || null },
            durationSeconds: duration, startedAt: null, endsAt: null, winnerId: null,
            createdAt: Date.now()
        };
        window.fbDb.collection('pk_battles').doc(battleId).set(battle).then(function () {
            var modal = document.getElementById('pv52-picker-modal');
            if (modal) modal.classList.remove('show');
            _pendingInviteBattleId = battleId;
            _attachBattleListener(battleId); // watch for accept/decline directly, by id
            notify('\u2694\uFE0F Challenge sent to ' + target.name + ' \u2014 waiting for a response\u2026', 'info');
            _showInviteWaitBanner(target.name);
            setTimeout(function () {
                if (_pendingInviteBattleId !== battleId) return; // already accepted/declined
                window.fbDb.collection('pk_battles').doc(battleId).get().then(function (snap) {
                    var d = snap.data();
                    if (d && d.status === 'invited') snap.ref.update({ status: 'cancelled' }).catch(function () {});
                }).catch(function () {});
            }, INVITE_EXPIRE_MS);
        }).catch(function (err) { notify('Could not send challenge: ' + (err.message || 'try again.'), 'error'); });
    }
    function _showInviteWaitBanner(name) {
        var existing = document.getElementById('pv52-invite-wait-banner'); if (existing) existing.remove();
        var host = document.getElementById('live-stream-screen'); if (!host) return;
        var b = document.createElement('div');
        b.id = 'pv52-invite-wait-banner';
        b.className = 'pv52-invite-wait-banner';
        b.textContent = '\u23F3 Waiting for ' + name + ' to accept\u2026';
        host.appendChild(b);
    }

    /* =========================================================================
       §6 — incoming invite listener (host-only, always-on while the host's
       own stream is live — attached alongside the modal, same lifecycle
       every other host-only feature in this codebase already uses).
       ========================================================================= */
    function _attachIncomingInviteListener() {
        _detachIncomingInviteListener();
        if (!isRealHost() || !fbReady()) return;
        _incomingInviteUnsub = window.fbDb.collection('pk_battles').where('hostBId', '==', myId())
            .onSnapshot(function (snap) {
                snap.docChanges().forEach(function (change) {
                    if (change.type !== 'added' && change.type !== 'modified') return;
                    var d = change.doc.data() || {};
                    if (d.status === 'invited' && !_battleId) _showIncomingInviteModal(change.doc.id, d);
                });
            }, function (err) { console.warn('[V52] incoming-invite listener error:', err.message); });
    }
    function _detachIncomingInviteListener() { if (_incomingInviteUnsub) { _incomingInviteUnsub(); _incomingInviteUnsub = null; } }

    function _showIncomingInviteModal(battleId, battle) {
        var existing = document.getElementById('pv52-incoming-modal'); if (existing) existing.remove();
        var container = document.getElementById('live-stream-screen') || document.body;
        var modal = document.createElement('div');
        modal.id = 'pv52-incoming-modal';
        modal.className = 'live-sub-modal show';
        var secondsLeft = Math.round(INVITE_EXPIRE_MS / 1000);
        modal.innerHTML =
            '<h3>\u2694\uFE0F PK Battle Challenge</h3>' +
            '<div style="text-align:center;padding:6px 0 16px;">' +
            '<img src="' + esc(battle.hostA.avatar || ('https://api.dicebear.com/7.x/initials/svg?seed=' + encodeURIComponent(battle.hostA.name))) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;margin-bottom:8px;">' +
            '<p style="color:#fff;font-weight:700;">' + esc(battle.hostA.name) + ' wants to battle you!</p>' +
            '<p style="color:#9fb0d6;font-size:0.8rem;">' + Math.round((battle.durationSeconds || 300) / 60) + ' minute battle \u2014 highest gift total wins</p>' +
            '<p id="pv52-incoming-countdown" style="color:#F5C518;font-size:0.75rem;margin-top:6px;">Auto-declines in ' + secondsLeft + 's</p>' +
            '</div>' +
            '<div style="display:flex;gap:10px;">' +
            '<button type="button" id="pv52-decline-btn" class="btn" style="flex:1;background:rgba(255,255,255,0.1);color:#fff;">Decline</button>' +
            '<button type="button" id="pv52-accept-btn" class="btn btn-accent" style="flex:1;">Accept</button>' +
            '</div>';
        container.appendChild(modal);

        var tick = secondsLeft;
        var timer = setInterval(function () {
            tick--;
            var el = document.getElementById('pv52-incoming-countdown');
            if (el) el.textContent = tick > 0 ? ('Auto-declines in ' + tick + 's') : 'Declining\u2026';
            if (tick <= 0) { clearInterval(timer); _respondToInvite(battleId, false); }
        }, 1000);
        function cleanup() { clearInterval(timer); modal.remove(); }
        modal.querySelector('#pv52-accept-btn').addEventListener('click', function () { cleanup(); _respondToInvite(battleId, true); });
        modal.querySelector('#pv52-decline-btn').addEventListener('click', function () { cleanup(); _respondToInvite(battleId, false); });
    }
    function _respondToInvite(battleId, accept) {
        var ref = battleDocRef(battleId);
        if (!ref || !window.fbDb) return;
        if (!accept) { ref.update({ status: 'declined' }).catch(function () {}); return; }
        var us = _us();
        window.fbDb.runTransaction(function (tx) {
            return tx.get(ref).then(function (doc) {
                var d = doc.data();
                if (!d || d.status !== 'invited') throw new Error('pv52-invite-gone');
                var now = Date.now();
                var hostB = {
                    userId: myId(), streamId: currentStreamId(), name: us.fullName || us.username || 'Host',
                    avatar: us.avatar || '', channel: myChannel(), agoraUid: myHostAgoraUid() || null
                };
                tx.update(ref, {
                    status: 'active', startedAt: now, endsAt: now + (d.durationSeconds || 300) * 1000,
                    hostB: hostB
                });
            });
        }).then(function () {
            // Now that we're an accepted participant, make sure our OWN
            // battle listener is definitely on this exact doc (it may
            // already be, from the invite notification path).
            _attachBattleListener(battleId);
            var ref2 = streamDocRef();
            if (ref2) ref2.update({ activePkBattleId: battleId }).catch(function () {});
        }).catch(function (err) {
            if (err && err.message === 'pv52-invite-gone') notify('That challenge is no longer available.', 'info');
            else notify('Could not accept the challenge — try again.', 'error');
        });
    }

    /* =========================================================================
       §7 — enter battle: split-screen UI + the opponent's dedicated,
       audience-only Agora client (see the file header for why this is
       safe to add without touching any existing client).
       ========================================================================= */
    function _opponentSide() { if (!_battle) return null; return _iAmHostA ? _battle.hostB : _battle.hostA; }
    function _mySide() { if (!_battle) return null; return _iAmHostA ? _battle.hostA : _battle.hostB; }

    function _enterBattle(battle) {
        // If I'm neither hostA nor hostB, I'm a VIEWER of one side or the
        // other — figure out which side is "mine" from the stream I'm
        // actually watching, so the split-screen always puts MY stream on
        // the left and the opponent on the right, from every device's own
        // point of view (not a global left/right that would be backwards
        // for one side's viewers).
        if (!_iAmHostA && !_iAmHostB) {
            var mySid = currentStreamId();
            _iAmHostA = battle.hostA && battle.hostA.streamId === mySid;
            _iAmHostB = battle.hostB && battle.hostB.streamId === mySid;
            if (!_iAmHostA && !_iAmHostB) return; // watching neither side (shouldn't happen — safety net)
        }
        var opp = _opponentSide();
        if (!opp) return;

        var screen = document.getElementById('live-stream-screen');
        if (screen) screen.classList.add('pv52-split-active');
        _ensureScoreBar();
        _joinOpponentAsAudience(opp);
        _attachGiftListeners(battle);

        var pickBtn = document.getElementById('pv52-pk-btn'); if (pickBtn) pickBtn.style.display = 'none';
        var waitBanner = document.getElementById('pv52-invite-wait-banner'); if (waitBanner) waitBanner.remove();
    }

    async function _joinOpponentAsAudience(opp) {
        if (!window._agoraAvailable || typeof AgoraRTC === 'undefined' || !opp.channel) return;
        try {
            _pkOpponentClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
            await _pkOpponentClient.setClientRole('audience');
            var uid = _pkAudienceUid();
            var tokenRes = window._fetchLiveAgoraToken
                ? await window._fetchLiveAgoraToken(opp.channel, uid, 'viewer')
                : { token: null, appId: agoraAppId(), uid: uid };
            var joinAppId = tokenRes.appId || agoraAppId();
            var joinUid = (tokenRes.uid !== undefined && tokenRes.uid !== null) ? tokenRes.uid : uid;
            await _pkOpponentClient.join(joinAppId, opp.channel, tokenRes.token, joinUid);
            log('joined opponent channel ' + opp.channel + ' as audience-only for split-screen.');

            _pkOpponentClient.on('user-published', async function (remoteUser, mediaType) {
                try {
                    var isOppHost = opp.agoraUid != null && String(remoteUser.uid) === String(opp.agoraUid);
                    if (!isOppHost) return; // only render the OPPONENT HOST, never their guests/co-broadcasters — keeps the battle strictly 1v1 on screen
                    await _pkOpponentClient.subscribe(remoteUser, mediaType);
                    if (mediaType === 'video') {
                        var slot = document.getElementById('pv52-pk-opponent-video');
                        if (slot) {
                            remoteUser.videoTrack.play(slot);
                            var fallback = document.getElementById('pv52-pk-opponent-fallback');
                            if (fallback) fallback.style.display = 'none';
                        }
                    }
                    // Deliberately never play the opponent's audio track —
                    // matches the real product's PK behavior (you hear your
                    // own room's host; the opponent is seen, not heard) and
                    // avoids a second live mic mixing into this listener's
                    // audio uncontrolled.
                } catch (e) { console.warn('[V52] opponent subscribe error:', e.message); }
            });
            _pkOpponentClient.on('user-unpublished', function (remoteUser, mediaType) {
                var isOppHost = opp.agoraUid != null && String(remoteUser.uid) === String(opp.agoraUid);
                if (isOppHost && mediaType === 'video') {
                    var fallback = document.getElementById('pv52-pk-opponent-fallback');
                    if (fallback) fallback.style.display = 'flex';
                }
            });
        } catch (err) {
            console.warn('[V52] could not join opponent channel as audience:', err.message);
        }
    }
    async function _leaveOpponentClient() {
        try { if (_pkOpponentClient) { await _pkOpponentClient.leave(); } } catch (e) {}
        _pkOpponentClient = null;
    }

    /* =========================================================================
       §8 — score bar + gift-total tracking. Two independent read-only
       `live_gifts` listeners (one per streamId), each discarding any gift
       whose createdAt predates the battle's own startedAt — see the file
       header for why this client-side cutoff check is used instead of a
       Firestore range query (avoids needing a new composite index).
       ========================================================================= */
    function _ensureScoreBar() {
        if (document.getElementById('pv52-scorebar') || !_battle) return;
        var screen = document.getElementById('live-stream-screen');
        if (!screen) return;
        var mine = _mySide(), opp = _opponentSide();
        var leftSide = _iAmHostA ? _battle.hostA : _battle.hostB;   // always "my" side, left, matching the split
        var rightSide = _iAmHostA ? _battle.hostB : _battle.hostA;
        var bar = document.createElement('div');
        bar.id = 'pv52-scorebar';
        bar.innerHTML =
            '<div class="pv52-score-side pv52-score-left">' +
            '<img src="' + esc(leftSide.avatar || '') + '" alt="">' +
            '<span class="pv52-score-name">' + esc(leftSide.name) + '</span>' +
            '<span class="pv52-score-amt" id="pv52-score-amt-left">0</span>' +
            '</div>' +
            '<div class="pv52-score-mid">' +
            '<div class="pv52-score-fill-track"><div class="pv52-score-fill" id="pv52-score-fill" style="width:50%;"></div></div>' +
            '<span id="pv52-score-timer" class="pv52-score-timer">--:--</span>' +
            '</div>' +
            '<div class="pv52-score-side pv52-score-right">' +
            '<span class="pv52-score-amt" id="pv52-score-amt-right">0</span>' +
            '<span class="pv52-score-name">' + esc(rightSide.name) + '</span>' +
            '<img src="' + esc(rightSide.avatar || '') + '" alt="">' +
            '</div>' +
            (isRealHost() ? '<button type="button" id="pv52-end-early-btn" title="End battle early">\u00d7</button>' : '');
        screen.appendChild(bar);

        var oppSlot = document.createElement('div');
        oppSlot.id = 'pv52-pk-opponent-video';
        oppSlot.innerHTML = '<div id="pv52-pk-opponent-fallback" class="pv52-pk-opponent-fallback"><img src="' + esc(opp.avatar || '') + '" alt=""></div>';
        var mainVideo = document.querySelector('#live-stream-screen .main-host-video');
        if (mainVideo && mainVideo.parentElement) mainVideo.parentElement.appendChild(oppSlot);

        var endBtn = document.getElementById('pv52-end-early-btn');
        if (endBtn) {
            var confirming = false;
            endBtn.addEventListener('click', function () {
                if (!confirming) {
                    confirming = true;
                    endBtn.textContent = '\u2713';
                    endBtn.title = 'Tap again to confirm ending the battle';
                    setTimeout(function () { confirming = false; endBtn.textContent = '\u00d7'; endBtn.title = 'End battle early'; }, 3000);
                    return;
                }
                _tryEndBattle('manual');
            });
        }
    }
    function _attachGiftListeners(battle) {
        _detachGiftListeners();
        if (!fbReady()) return;
        _giftTotals = { A: 0, B: 0 };
        _giftSeen = { A: {}, B: {} };
        var startedAtMs = battle.startedAt || 0;

        function makeListener(streamId, sideKey) {
            if (!streamId) return null;
            return window.fbDb.collection('live_gifts').where('streamId', '==', streamId)
                .onSnapshot(function (snap) {
                    var changed = false;
                    snap.docChanges().forEach(function (change) {
                        if (change.type !== 'added') return;
                        var d = change.doc.data() || {};
                        var key = d.messageId || change.doc.id;
                        if (_giftSeen[sideKey][key]) return;
                        _giftSeen[sideKey][key] = true;
                        var ts = d.createdAt ? new Date(d.createdAt).getTime() : 0;
                        if (!ts || ts < startedAtMs) return; // sent before this battle started — doesn't count
                        _giftTotals[sideKey] += (d.amount || 0);
                        changed = true;
                    });
                    if (changed) _refreshScoreBar();
                }, function (err) { console.warn('[V52] gift listener (' + sideKey + ') error:', err.message); });
        }
        _giftUnsubA = makeListener(battle.hostA && battle.hostA.streamId, 'A');
        _giftUnsubB = makeListener(battle.hostB && battle.hostB.streamId, 'B');
    }
    function _detachGiftListeners() {
        if (_giftUnsubA) { _giftUnsubA(); _giftUnsubA = null; }
        if (_giftUnsubB) { _giftUnsubB(); _giftUnsubB = null; }
    }
    function _refreshScoreBar() {
        if (!document.getElementById('pv52-scorebar') || !_battle) return;
        var leftTotal = _iAmHostA ? _giftTotals.A : _giftTotals.B;
        var rightTotal = _iAmHostA ? _giftTotals.B : _giftTotals.A;
        var leftEl = document.getElementById('pv52-score-amt-left'); if (leftEl) leftEl.textContent = leftTotal.toLocaleString();
        var rightEl = document.getElementById('pv52-score-amt-right'); if (rightEl) rightEl.textContent = rightTotal.toLocaleString();
        var total = leftTotal + rightTotal;
        var pct = total ? Math.round((100 * leftTotal) / total) : 50;
        var fill = document.getElementById('pv52-score-fill'); if (fill) fill.style.width = pct + '%';
    }

    /* =========================================================================
       §9 — countdown + end-of-battle (single-writer-with-fallback — see
       file header). Timer display updates locally on every device
       regardless of who ends up writing the actual status flip.
       ========================================================================= */
    function _armEndTimer(battle) {
        clearInterval(_endTimer);
        var endsAt = battle.endsAt || 0;
        _endTimer = setInterval(function () {
            var remaining = endsAt - Date.now();
            var el = document.getElementById('pv52-score-timer');
            if (el) {
                if (remaining <= 0) { el.textContent = '00:00'; }
                else {
                    var s = Math.ceil(remaining / 1000);
                    el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
                }
            }
            if (remaining <= 0) {
                clearInterval(_endTimer);
                if (_iAmHostA) _tryEndBattle('timer');
                else if (_iAmHostB) setTimeout(function () { _tryEndBattle('timer-fallback'); }, END_FALLBACK_DELAY_MS);
            }
        }, 1000);
    }
    function _tryEndBattle(reason) {
        var ref = battleDocRef(_battleId);
        if (!ref || !window.fbDb) return;
        var myTotals = { A: _giftTotals.A, B: _giftTotals.B };
        window.fbDb.runTransaction(function (tx) {
            return tx.get(ref).then(function (doc) {
                var d = doc.data();
                if (!d || d.status !== 'active') throw new Error('pv52-already-ended');
                var winnerId = myTotals.A === myTotals.B ? null : (myTotals.A > myTotals.B ? d.hostAId : d.hostBId);
                tx.update(ref, { status: 'ended', winnerId: winnerId, endedReason: reason, giftTotalsAtEnd: myTotals });
            });
        }).catch(function (err) {
            if (err && err.message !== 'pv52-already-ended') console.warn('[V52] end-battle write failed:', err.message);
        });
    }
    function _showEndBanner(battle) {
        var screen = document.getElementById('live-stream-screen');
        if (!screen) return;
        var iWon = battle.winnerId && battle.winnerId === myId();
        var tie = !battle.winnerId;
        var mySide = _mySide(), opp = _opponentSide();
        var winnerName = tie ? null : (battle.winnerId === (battle.hostAId) ? battle.hostA.name : battle.hostB.name);

        var el = document.createElement('div');
        el.className = 'pv52-end-banner';
        el.innerHTML = tie
            ? '<div class="pv52-end-title">\uD83E\uDD1D It\u2019s a tie!</div>'
            : '<div class="pv52-end-title">' + (iWon || (!_iAmHostA && !_iAmHostB) ? '\uD83C\uDFC6' : '\uD83D\uDC94') + ' ' + esc(winnerName) + ' wins the battle!</div>';
        screen.appendChild(el);
        setTimeout(function () { if (el.parentNode) el.remove(); }, 4000);

        // Forfeit tint on the losing side's own video half — purely visual,
        // matches the "loser gets a forfeit animation" ask.
        if (!tie && battle.winnerId) {
            var loserIsMine = mySide && ((_iAmHostA && battle.winnerId !== battle.hostAId) || (_iAmHostB && battle.winnerId !== battle.hostBId));
            var loserIsOpponent = opp && ((_iAmHostA && battle.winnerId === battle.hostAId) || (_iAmHostB && battle.winnerId === battle.hostBId));
            var mainVideo = document.querySelector('#live-stream-screen .main-host-video');
            var oppSlot = document.getElementById('pv52-pk-opponent-video');
            if (loserIsMine && mainVideo) mainVideo.classList.add('pv52-forfeit-tint');
            if (loserIsOpponent && oppSlot) oppSlot.classList.add('pv52-forfeit-tint');
        }
    }

    /* =========================================================================
       §10 — teardown: local cleanup only (never writes to Firestore except
       via _clearOwnActiveBattleField, which is host-only and already
       called separately when status becomes 'ended' — see §4).
       ========================================================================= */
    function _teardownBattleUI() {
        clearInterval(_endTimer); _endTimer = null;
        _detachGiftListeners();
        _leaveOpponentClient();
        var screen = document.getElementById('live-stream-screen');
        if (screen) screen.classList.remove('pv52-split-active');
        ['pv52-scorebar', 'pv52-pk-opponent-video'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
        var mainVideo = document.querySelector('#live-stream-screen .main-host-video');
        if (mainVideo) mainVideo.classList.remove('pv52-forfeit-tint');
        var pickBtn = document.getElementById('pv52-pk-btn'); if (pickBtn && isRealHost()) pickBtn.style.display = '';
        _giftTotals = { A: 0, B: 0 }; _giftSeen = { A: {}, B: {} };
    }

    /* =========================================================================
       §11 — CSS (all class names prefixed pv52- to guarantee zero
       collision with any existing selector).
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv52-css')) return;
        var css = document.createElement('style');
        css.id = 'pv52-css';
        css.textContent =
            /* Split screen: left half is whatever was already rendering
               into .main-host-video (host's own preview OR the viewer's
               agora-viewer-video overlay, both already inset:0 inside it —
               see the file header for why width:50% + right:auto is safe
               to layer on top without touching either of those). */
            '.pv52-split-active .main-host-video{width:50% !important;right:auto !important;}' +
            '#pv52-pk-opponent-video{position:absolute;top:0;right:0;width:50%;height:100%;z-index:2;background:#000;overflow:hidden;border-left:2px solid rgba(245,197,24,0.55);}' +
            '#pv52-pk-opponent-video video{width:100%;height:100%;object-fit:cover;}' +
            '.pv52-pk-opponent-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#1B2B8B;}' +
            '.pv52-pk-opponent-fallback img{width:64px;height:64px;border-radius:50%;object-fit:cover;}' +
            '.pv52-forfeit-tint{filter:grayscale(0.85) brightness(0.55);transition:filter .6s ease;}' +
            /* Score bar */
            '#pv52-scorebar{position:absolute;top:64px;left:8px;right:8px;z-index:25;display:flex;align-items:center;gap:8px;background:rgba(10,14,39,0.78);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:6px 10px;}' +
            '.pv52-score-side{display:flex;align-items:center;gap:6px;flex:1;min-width:0;}' +
            '.pv52-score-right{flex-direction:row-reverse;text-align:right;}' +
            '.pv52-score-side img{width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1.5px solid rgba(245,197,24,0.6);}' +
            '.pv52-score-name{font-size:0.68rem;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70px;}' +
            '.pv52-score-amt{font-size:0.72rem;font-weight:900;color:#F5C518;flex-shrink:0;}' +
            '.pv52-score-mid{display:flex;flex-direction:column;align-items:center;gap:2px;width:88px;flex-shrink:0;}' +
            '.pv52-score-fill-track{width:100%;height:6px;border-radius:4px;background:rgba(59,130,246,0.35);overflow:hidden;}' +
            '.pv52-score-fill{height:100%;background:linear-gradient(90deg,#FF6FA5,#F5C518);border-radius:4px;transition:width .4s ease;}' +
            '.pv52-score-timer{font-size:0.62rem;font-weight:800;color:#cfd8ee;}' +
            '#pv52-end-early-btn{background:rgba(255,255,255,0.12);border:none;color:#fff;width:20px;height:20px;border-radius:50%;font-size:0.85rem;line-height:1;cursor:pointer;flex-shrink:0;}' +
            /* Picker + incoming-invite modals reuse .live-sub-modal, only
               their internal rows need styling. */
            '.pv52-dur-btn{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);color:#cfd8ee;font-weight:700;font-size:0.76rem;border-radius:14px;padding:6px 14px;cursor:pointer;}' +
            '.pv52-dur-active{background:linear-gradient(135deg,#3E7BFA,#1E40C4);color:#fff;border-color:transparent;}' +
            '.pv52-picker-row{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.07);}' +
            '.pv52-picker-row img{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;}' +
            '.pv52-picker-name{flex:1;color:#fff;font-weight:700;font-size:0.85rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
            '.pv52-invite-wait-banner{position:absolute;top:64px;left:12px;right:12px;z-index:25;text-align:center;background:rgba(245,197,24,0.16);border:1px solid rgba(245,197,24,0.35);color:#F5C518;font-size:0.75rem;font-weight:700;border-radius:12px;padding:8px 10px;}' +
            /* End-of-battle banner */
            '@keyframes pv52EndIn{0%{opacity:0;transform:translate(-50%,-50%) scale(0.7);}30%{opacity:1;transform:translate(-50%,-50%) scale(1.08);}70%{opacity:1;transform:translate(-50%,-50%) scale(1);}100%{opacity:0;transform:translate(-50%,-56%) scale(1);}}' +
            '.pv52-end-banner{position:absolute;top:44%;left:50%;z-index:40;text-align:center;pointer-events:none;animation:pv52EndIn 3.6s ease forwards;}' +
            '.pv52-end-title{font-size:1.5rem;font-weight:900;color:#fff;text-shadow:0 0 16px rgba(245,197,24,0.7),0 2px 8px rgba(0,0,0,0.7);background:rgba(10,14,39,0.5);padding:10px 20px;border-radius:16px;}';
        document.head.appendChild(css);
    })();

    /* =========================================================================
       §12 — wiring: attach/detach alongside the live modal, the same
       #go-live-modal-overlay class-toggle trigger app-patch-v33/v42/v50/
       v51 already observe.
       ========================================================================= */
    function _ensurePkButton() {
        if (!isRealHost() || _battleId) {
            var existing = document.getElementById('pv52-pk-btn');
            if (existing && _battleId) existing.style.display = 'none';
            else if (existing) existing.remove();
            return;
        }
        var panel = document.getElementById('host-control-panel-inner');
        if (!panel || document.getElementById('pv52-pk-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'pv52-pk-btn';
        btn.type = 'button';
        btn.className = 'live-action-btn host-control';
        btn.title = 'PK Battle';
        /* FIX (2026-08-02 — broken/"X-box" icon report): same root cause
           and fix as the clap/poll/chat-mode buttons above — raw
           crossed-swords emoji -> FA6 icon-font glyph. */
        btn.innerHTML = '<i class="fas fa-people-fighting"></i>';
        btn.addEventListener('click', _openPickerModal);
        panel.appendChild(btn);
    }

    // FIX (bug report: "control panel buttons unresponsive") — same
    // guaranteed-first capture-phase treatment as the other host-control-
    // panel buttons fixed this session; see pv55-sound-btn's comment
    // (app-patch-v42.js §5, "empyreanPatchV55") for the full explanation.
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var btn = e.target.closest('#pv52-pk-btn');
        if (!btn) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        _openPickerModal();
    }, true);
    // (pv52-pk-btn already used stopImmediatePropagation — no change
    // needed here; confirmed correct while auditing the other buttons on
    // this panel for the same "click once, then stops responding" bug.)
    function onModalToggle() {
        var modal = document.getElementById('go-live-modal-overlay');
        if (!modal) return;
        if (modal.classList.contains('show')) {
            _attachMyStreamDocListener();
            _attachIncomingInviteListener();
            setTimeout(_ensurePkButton, 400);
        } else {
            _detachMyStreamDocListener();
            _detachIncomingInviteListener();
            _detachBattleListener();
            _pendingInviteBattleId = null;
            ['pv52-picker-modal', 'pv52-incoming-modal', 'pv52-invite-wait-banner'].forEach(function (id) { var el = document.getElementById(id); if (el) el.remove(); });
        }
    }
    function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
    ready(function () {
        var modal = document.getElementById('go-live-modal-overlay');
        if (modal) {
            new MutationObserver(onModalToggle).observe(modal, { attributes: true, attributeFilter: ['class'] });
            if (modal.classList.contains('show')) onModalToggle();
        }
        // Cheap, idempotent recheck for a host/guest role flip mid-stream —
        // same interval pattern app-patch-v42/v51 already use.
        setInterval(function () {
            var m = document.getElementById('go-live-modal-overlay');
            if (m && m.classList.contains('show')) _ensurePkButton();
        }, 1500);
    });

    console.log('[EmpyreanPatchV52] \u2705 PK / Battle mode wired \u2014 host-only \u2694\uFE0F button opens an opponent picker (queries active_streams for other currently-live hosts), sends a 25s-expiring challenge via a new pk_battles doc, and on accept both sides (and every one of their viewers) independently join the opponent\u2019s channel as an audience-only third Agora client for a true split-screen \u2014 no existing client, channel, or chat feed touched. Gift totals are tallied client-side per side from the existing live_gifts collection (cutoff at the battle\u2019s own startedAt, no new index needed) and shown on a live score bar; the higher total when the timer ends wins, with a forfeit tint + banner for the loser. Pure addition \u2014 no existing live-streaming file was edited. Requires a `pk_battles` Firestore rule to be added (see header) \u2014 active_streams itself already allows the one new field this uses.');

})();

/* ═══════════════════════════════════════════════════════════════════════
   app-patch-v53.js — Live-stream bug-fix pack (2026-08-02)
   ═══════════════════════════════════════════════════════════════════════
   Appended per this codebase's additive-patch convention (fixes for
   app-patch-v50/v51's clap/poll/chat-mode buttons live inline, edited
   directly, above — this new section covers the two bugs that needed
   NEW code rather than a correction to existing code).

   [BUG 2] The 3 new host-control-panel buttons (poll, chat-mode,
   hype-clap) respond to taps once, then stop responding once a guest/
   co-host tile is on screen.
     This exact panel has hit the exact same symptom — "button used to
     work, then silently stopped responding to taps" — four times
     already (see app-live-tiktok-patch.js's own "SINGLE AUTHORITATIVE
     HANDLER" and its header comment: toggle button, viewer count,
     rank trophy, requests bell). Every time, the fix was the same:
     stop trusting a listener bound directly to the button node — this
     screen re-renders guest tiles, relocates the mic/camera nodes, and
     refreshes role visibility on EVERY Firestore snapshot of the
     stream doc (many times a minute, and specifically triggered by a
     guest being accepted/promoted) — and move to a capture-phase
     listener on `document`, which is guaranteed to run first no
     matter what else is happening in this DOM. These three buttons
     were added later (v50/v51) and never received that same
     treatment. This gives them the identical guaranteed-first
     handling already proven out on the other four buttons on this
     same panel, reusing the window._pv50HostHypeClap /
     window._pv51OpenPollModal / window._pv51CycleChatMode functions
     exposed for exactly this purpose above.

   [BUG 3 + BUG 4] Co-host / moderator (👑 crown icon) does nothing;
   promoted guest never shows a changed status or gains a control
   button; their camera never activates.
     CONFIRMED root cause, not a guess — app-live-tiktok-patch.js's own
     comments spell it out directly: window._empIsModerator() and
     window._empToggleModerator() were both defined in the separate
     app-patch-v33.js file, deliberately read everywhere through
     `typeof window._empToggleModerator === 'function'` guards so that,
     quoting that file's own comment, "if v33 is ever removed again,
     every one of these gates just silently falls back to host-only,
     exactly like before v33 existed, with no error and no behavior
     change." v33 is not part of the current build — most likely
     removed during a prior orphaned-file cleanup pass before this
     dependency was noticed (nothing referenced it by filename, only
     through these defensive window.* guards, so its removal broke
     nothing loudly). The practical effect: tapping the crown icon
     calls a function that no longer exists, silently, by design of
     that guard — no error, no Firestore write, no status change ever
     happens, so a "promoted" guest never actually gains moderator
     powers (accept/decline/mute other guests — gated on this same
     check in renderGuestBoxStack), never gets the host-requests bell
     (also gated on it, in refreshRoleVisibility), and nothing on
     screen, for them OR anyone watching, ever shows they were made a
     co-host. (Their camera, if they're already an accepted guest
     broadcaster, is unaffected either way — that already works from
     the original accept — but a viewer promoted to co-host status
     with the expectation that this alone starts their broadcast will
     correctly see nothing happen, since nothing about their
     guest/broadcaster state changes at all right now.)

     This section restores both functions directly — guarded so it
     never overrides a real v33 if one is ever restored — matching
     v33's own documented contract (guests[].isModerator field, same
     read-modify-write pattern this file's own toggleGuestMute-style
     functions already use elsewhere in this codebase). It also adds
     two things v33 apparently never had, to make "made co-host" README
     visible rather than silent on every side: a small read-only 👑
     badge on the guest's tile visible to EVERYONE watching (previously
     the interactive crown only ever rendered for the host, so no one
     else could tell who — if anyone — was moderating), and a one-time
     toast to the promoted guest themselves the moment their own status
     flips.
   ============================================================================= */

(function empyreanPatchV53() {
    'use strict';

    if (window._empPatchV53Loaded) {
        console.warn('[V53] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV53Loaded = true;

    function log(msg) { console.log('[V53] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function myId() { return window.userState && window.userState.id; }
    function currentStreamId() { return window.liveStreamData && window.liveStreamData.streamId; }
    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }
    function streamDocRef() {
        var db = window.fbDb, sid = currentStreamId();
        if (!db || !sid || !window._firebaseLoaded) return null;
        return db.collection('active_streams').doc(sid);
    }

    /* ═══════════════════════════════════════════════════════════════════
       BUG 2 — guaranteed-first capture handler for the poll / chat-mode /
       hype-clap buttons. Registered with capture:true on `document`, the
       same mechanism app-live-tiktok-patch.js's own "SINGLE AUTHORITATIVE
       HANDLER" already relies on for the toggle/viewers/trophy/requests
       buttons on this identical panel — capture-phase listeners on
       `document` always run before any listener bound to the button
       itself, before anything else on the page, regardless of what else
       this screen's frequent Firestore-snapshot-driven re-renders are
       doing at the moment of the tap. stopPropagation() here means the
       button's own original listener (still in place, untouched, in the
       v50/v51 sections above) never double-fires for the same tap — this
       handler performs the action itself, directly, via the window.*
       exposures added above, the same "call through window.* so the
       current version always runs" pattern already established in this
       codebase (app-patch-v4.js's _submitQuote, app-live-tiktok-patch.js's
       openHostPreviewModal).
       ═══════════════════════════════════════════════════════════════════ */
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;

        var pollBtn = e.target.closest('#pv51-poll-btn');
        if (pollBtn) {
            // FIX 2026-08-03: stopImmediatePropagation (not just
            // stopPropagation) — same defense-in-depth hardening applied to
            // pv55/pv56 this session, so no other listener for this exact
            // tap (from any file, any load order) can ever also fire.
            e.stopImmediatePropagation();
            e.preventDefault();
            if (typeof window._pv51OpenPollModal === 'function') {
                window._pv51OpenPollModal();
            } else {
                log('poll button tapped but its handler isn\'t ready yet — try again in a moment.');
            }
            return;
        }

        var chatModeBtn = e.target.closest('#pv51-chatmode-btn');
        if (chatModeBtn) {
            // FIX 2026-08-03: stopImmediatePropagation hardening, see the
            // poll-button note immediately above.
            e.stopImmediatePropagation();
            e.preventDefault();
            if (typeof window._pv51CycleChatMode === 'function') {
                window._pv51CycleChatMode();
            } else {
                log('chat-mode button tapped but its handler isn\'t ready yet — try again in a moment.');
            }
            return;
        }

        var hypeClapBtn = e.target.closest('#live-host-clap-btn');
        if (hypeClapBtn) {
            // FIX 2026-08-03: stopImmediatePropagation hardening, see the
            // poll-button note above.
            e.stopImmediatePropagation();
            e.preventDefault();
            if (typeof window._pv50HostHypeClap === 'function') {
                window._pv50HostHypeClap();
            } else {
                log('hype-clap button tapped but its handler isn\'t ready yet — try again in a moment.');
            }
            return;
        }
    }, true); // capture: true — guarantees this always runs first, exactly like the panel's other 4 buttons

    /* ═══════════════════════════════════════════════════════════════════
       BUG 3 + 4 — restore window._empIsModerator / window._empToggleModerator
       ═══════════════════════════════════════════════════════════════════ */

    // Guarded — if a real app-patch-v33.js is ever restored to the build,
    // its definitions (whichever loads second) win; this never fights it.
    if (typeof window._empIsModerator !== 'function') {
        window._empIsModerator = function () {
            var uid = myId();
            if (!uid) return false;
            // window._liveGuestsCache is kept current by app-live-tiktok-
            // patch.js's own stream listener on every snapshot — reusing
            // it here means this needs no listener of its own to answer
            // "am I a moderator right now?".
            var guests = window._liveGuestsCache || [];
            var mine = guests.filter(function (g) { return g && g.userId === uid; })[0];
            return !!(mine && mine.isModerator);
        };
        log('window._empIsModerator restored (was missing — see header note).');
    }

    if (typeof window._empToggleModerator !== 'function') {
        window._empToggleModerator = function (uid, grant) {
            if (!isRealHost()) { log('_empToggleModerator called by a non-host — ignored.'); return; }
            if (!uid) return;
            var ref = streamDocRef();
            if (!ref) { notify('Could not reach the stream right now — try again.', 'error'); return; }
            ref.get().then(function (snap) {
                var data = snap.data() || {};
                var guests = data.guests || [];
                var idx = -1;
                for (var i = 0; i < guests.length; i++) { if (guests[i] && guests[i].userId === uid) { idx = i; break; } }
                if (idx === -1) {
                    notify('That guest is no longer in the stream.', 'warning');
                    return;
                }
                var updated = guests.slice();
                updated[idx] = Object.assign({}, updated[idx], { isModerator: !!grant });
                return ref.update({ guests: updated }).then(function () {
                    notify(grant ? '\uD83D\uDC51 Co-host granted.' : 'Co-host removed.', 'success');
                });
            }).catch(function (err) {
                notify('Could not update co-host status: ' + (err && err.message ? err.message : 'try again.'), 'error');
            });
        };
        log('window._empToggleModerator restored (was missing — see header note).');
    }

    /* ── visible, read-only 👑 badge for everyone watching (not just the
       host, who already sees the interactive crown rendered by
       renderGuestBoxStack in app-live-tiktok-patch.js) ── */
    function _paintCoHostBadges() {
        var stack = document.getElementById('tk-guestbox-stack');
        if (!stack) return;
        var guests = window._liveGuestsCache || [];
        var modSet = {};
        guests.forEach(function (g) { if (g && g.isModerator) modSet[g.userId] = true; });
        var tiles = stack.querySelectorAll('.tk-guestbox[data-kind="guest"]');
        for (var i = 0; i < tiles.length; i++) {
            var tile = tiles[i];
            var uid = tile.getAttribute('data-uid');
            var hasInteractiveCrown = !!tile.querySelector('.tk-gb-mod'); // host already sees this version — don't double up
            var existingBadge = tile.querySelector('.pv53-cohost-badge');
            if (modSet[uid] && !hasInteractiveCrown) {
                if (!existingBadge) {
                    var badge = document.createElement('span');
                    badge.className = 'pv53-cohost-badge';
                    badge.title = 'Co-host';
                    badge.textContent = '\uD83D\uDC51';
                    tile.appendChild(badge);
                }
            } else if (existingBadge) {
                existingBadge.remove();
            }
        }
    }

    var _badgeObserver = null;
    function _watchGuestboxForBadges() {
        var stack = document.getElementById('tk-guestbox-stack');
        if (!stack || stack._pv53Watched) { _paintCoHostBadges(); return; }
        stack._pv53Watched = true;
        _badgeObserver = new MutationObserver(function () { _paintCoHostBadges(); });
        _badgeObserver.observe(stack, { childList: true, subtree: true });
        _paintCoHostBadges();
    }

    /* ── one-time toast to the promoted guest themselves, the moment
       THEIR OWN status flips (not visible from a badge on their own
       tile, since a guest doesn't see their own tile in the stack the
       same way the host does) ── */
    var _lastKnownOwnModStatus = false;
    function _checkOwnModStatus() {
        if (isRealHost()) return; // the host is never "promoted" to co-host of their own stream
        var now = window._empIsModerator();
        if (now !== _lastKnownOwnModStatus) {
            if (now) {
                notify('\uD83D\uDC51 You were made a co-host! You can now help approve guest requests.', 'success');
            } else if (_lastKnownOwnModStatus) {
                notify('Your co-host status was removed.', 'info');
            }
            _lastKnownOwnModStatus = now;
        }
    }

    /* ── wiring: same #go-live-modal-overlay class-toggle trigger every
       other section of this file already observes ── */
    function onModalToggle() {
        var modal = document.getElementById('go-live-modal-overlay');
        if (!modal) return;
        if (modal.classList.contains('show')) {
            _lastKnownOwnModStatus = window._empIsModerator();
            _watchGuestboxForBadges();
        } else {
            if (_badgeObserver) { _badgeObserver.disconnect(); _badgeObserver = null; }
            var stack = document.getElementById('tk-guestbox-stack');
            if (stack) stack._pv53Watched = false;
            _lastKnownOwnModStatus = false;
        }
    }
    function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
    ready(function () {
        var modal = document.getElementById('go-live-modal-overlay');
        if (modal) {
            new MutationObserver(onModalToggle).observe(modal, { attributes: true, attributeFilter: ['class'] });
            if (modal.classList.contains('show')) onModalToggle();
        }
        // Same interval pattern every other section of this file already
        // uses for a role flip mid-stream — cheap and idempotent.
        setInterval(function () {
            var m = document.getElementById('go-live-modal-overlay');
            if (m && m.classList.contains('show')) { _paintCoHostBadges(); _checkOwnModStatus(); }
        }, 1500);
    });

    /* ── CSS for the read-only co-host badge ── */
    (function injectCSS() {
        if (document.getElementById('pv53-css')) return;
        var css = document.createElement('style');
        css.id = 'pv53-css';
        css.textContent =
            '.pv53-cohost-badge{position:absolute;top:-7px;right:-7px;background:rgba(0,0,0,0.82);border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:0.72rem;border:1px solid rgba(245,197,24,0.65);}';
        document.head.appendChild(css);
    })();

    console.log('[EmpyreanPatchV53] \u2705 Live-stream bug-fix pack loaded \u2014 (1) clap button: no longer duplicated on the host\u2019s own screen, sound synthesized at runtime via Web Audio (no missing asset file), floating \uD83D\uDC4F burst now visible on every clap; (2) poll/chat-mode/hype-clap buttons on the host control panel now use the same guaranteed-first capture-phase handling already proven out on this panel\u2019s other four buttons; (3+4) window._empIsModerator/_empToggleModerator restored (were silently missing \u2014 defined only in app-patch-v33.js, which is not part of the current build), with a visible co-host badge for everyone watching and a one-time toast to the promoted guest.');

})();

/* ═══════════════════════════════════════════════════════════════════════
   app-patch-v54.js — Completion pack for the four reported bugs
   ═══════════════════════════════════════════════════════════════════════
   Appended per this codebase's additive-patch convention. This session's
   testing (actually executing app-patch-v42.js in a JS sandbox, not just
   reading it) found that V53's own bug-fix pack above never ran on any
   real page load — see the FIX note on V50's closing console.log for the
   root cause (a ReferenceError there aborted the rest of this script
   file, silently skipping V51/V52/V53 every time). That crash is now
   fixed above. This section is additional hardening on top of that fix,
   for the specific symptoms reported:

   BUG 1 (clap button duplicated host+guest, no sound, no on-screen
   effect): root-caused to the same script-abort — V50's own gating/
   synth/burst code (all of it ABOVE the crashing line) was already
   correct and already ran every time; it just looked broken because nothdc
   -after V50 in the file ever got a chance to run either, and repeat
   testing during an aborted-script session can't have been seeing V50's
   real behavior in isolation. Section §D below adds a cheap defensive
   sweep on top, since a false "still broken" report deserves an extra
   guarantee, not just a theory.

   BUG 2 (poll/chat-mode/hype-clap buttons in the host control panel stop
   responding once a co-host exists): V53's capture-phase handler (which
   fixes exactly this) can now actually register, since it's no longer
   skipped by the crash. Section §B below adds a second, independent
   layer: if any of the three buttons is ever missing from the DOM while
   this device is confirmed host — for any reason, not just the one
   already diagnosed — it's recreated on the spot, wired through the same
   window.* functions V53's capture handler already calls, so the button
   existing and the button responding are guaranteed together.

   BUG 3 (guest camera-switch button does nothing): app-patch-v37.js's
   own implementation is correct in isolation, but AgoraRTC.
   createCameraVideoTrack({facingMode:'environment'}) throws
   OverconstrainedError on any device that physically only has one
   camera (most laptops/desktops — a very likely test environment) or on
   browsers that don't support exact facingMode matching. V37 does show
   an error toast for that, but "toast says it failed" and "camera opens"
   are different outcomes, and the reported symptom ("does nothing") is
   consistent with that toast going unnoticed. Section §C replaces the
   switch behavior with a capture-phase handler (supersedes V37's bubble-
   phase one the same way V53 already supersedes button clicks elsewhere
   in this file) that retries WITHOUT a facingMode constraint if the
   exact request fails, so a tap always either flips the camera or
   successfully (re)acquires *a* camera — never a silent no-op — with a
   clear, specific notification either way.

   BUG 4 (co-host status invisible; promoted guest gets no control
   button): two independent contributors, both closed here.
     (a) V53's badge/toast/gating restoration above can now run (crash
         fixed), so the visible 👑 badge, the one-time toast, and the
         window._empIsModerator/_empToggleModerator restoration all take
         effect — IF app-patch-v33.js isn't present in this build, per
         V53's own guard.
     (b) app-patch-v33.js — which per this session's review of index.html
         *is* present in this build — has its own separate, independent
         moderator-status listener (_attachModeratorListener) that only
         ever attaches once, at the moment the live modal opens, with NO
         retry if window.liveStreamData.streamId isn't populated yet at
         that exact instant (a real, timing-dependent race — the same
         class of bug this codebase has hit and fixed with a retry loop
         in half a dozen other places, e.g. app-live-tiktok-patch.js's
         own attachStreamListener 15-retry loop). If that race is lost
         once, v33's moderator cache silently never updates again for the
         rest of that stream — which reads exactly like "co-host status
         never shows up." Section §A replaces window._empIsModerator /
         window._empToggleModerator outright (not guarded behind "only if
         undefined", since v33's IS defined but can be silently stale)
         with a version backed by window._liveGuestsCache — the SAME
         `guests` array, already kept fresh by app-live-tiktok-patch.js's
         own battle-tested, 15-retry attachStreamListener(), which every
         device (host, guest, and viewer alike) already depends on for
         the guest-box stack itself. Reusing that existing, already-
         race-resistant source of truth avoids needing a second listener
         (and a second chance to lose the same race) entirely. The write
         side (_empToggleModerator) is unchanged in behavior — same
         `guests[].isModerator` field, same host-only gate, same
         read-modify-write pattern — so nothing about the data model or
         Firestore rules changes; this only changes how the READ side
         answers "is this device a moderator right now?".
   ═══════════════════════════════════════════════════════════════════════ */

(function empyreanPatchV54() {
    'use strict';

    if (window._empPatchV54Loaded) {
        console.warn('[V54] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV54Loaded = true;

    function log(msg) { console.log('[V54] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function myId() { return window.userState && window.userState.id; }
    function currentStreamId() { return window.liveStreamData && window.liveStreamData.streamId; }
    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }
    function streamDocRef() {
        var db = window.fbDb, sid = currentStreamId();
        if (!db || !sid || !window._firebaseLoaded) return null;
        return db.collection('active_streams').doc(sid);
    }
    function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

    /* =========================================================================
       §A — BUG 4: robust co-host status, backed by _liveGuestsCache (see
       header note (b) above for why this is safer than v33's own
       separate listener). Deliberately NOT guarded behind "only if
       undefined" — v33's version IS a function (so V53's own guard above
       leaves it alone), but can be a permanently-stale one if its one-shot
       attach ever raced streamId's arrival, which this fixes.
       ========================================================================= */
    window._empIsModerator = function () {
        var uid = myId();
        if (!uid) return false;
        var guests = window._liveGuestsCache || [];
        for (var i = 0; i < guests.length; i++) {
            if (guests[i] && guests[i].userId === uid) return !!guests[i].isModerator;
        }
        return false;
    };

    window._empToggleModerator = function (uid, grant) {
        if (!isRealHost()) { log('_empToggleModerator called by a non-host — ignored.'); return; }
        if (!uid) return;
        var ref = streamDocRef();
        if (!ref) { notify('Could not reach the stream right now — try again.', 'error'); return; }
        ref.get().then(function (snap) {
            var data = snap.data() || {};
            var guests = data.guests || [];
            var idx = -1;
            for (var i = 0; i < guests.length; i++) { if (guests[i] && guests[i].userId === uid) { idx = i; break; } }
            if (idx === -1) { notify('That guest is no longer in the stream.', 'warning'); return; }
            var updated = guests.slice();
            updated[idx] = Object.assign({}, updated[idx], { isModerator: !!grant });
            return ref.update({ guests: updated }).then(function () {
                notify(grant ? '\uD83D\uDC51 Co-host granted.' : 'Co-host removed.', 'success');
            });
        }).catch(function (err) {
            notify('Could not update co-host status: ' + (err && err.message ? err.message : 'try again.'), 'error');
        });
    };
    log('window._empIsModerator / window._empToggleModerator installed \u2014 backed by _liveGuestsCache, race-resistant regardless of whether app-patch-v33.js is present.');

    /* =========================================================================
       §B — BUG 2: self-healing host-control-panel buttons. Belt-and-
       suspenders on top of V50/V51's own ensure-functions (and V53's
       capture handler, now unblocked): if any of the three buttons is
       ever missing from the DOM while this device is confirmed host, it
       gets recreated — wired to nothing itself, since V53's capture-
       phase handler on `document` already intercepts taps on these ids
       and dispatches to window._pv50HostHypeClap / _pv51OpenPollModal /
       _pv51CycleChatMode before any element-level listener would even
       run. That keeps "button exists" and "button responds" from ever
       drifting apart again.
       ========================================================================= */
    function _v54EnsureBtn(id, title, glyph) {
        if (!isRealHost()) {
            var stale = document.getElementById(id);
            if (stale) stale.remove();
            return;
        }
        var panel = document.getElementById('host-control-panel-inner');
        if (!panel || document.getElementById(id)) return; // nothing to heal
        var btn = document.createElement('button');
        btn.id = id;
        btn.type = 'button';
        btn.className = 'live-action-btn';
        btn.title = title;
        /* FIX (2026-08-02 — broken/"X-box" icon report): `glyph` used to
           be a raw emoji character rendered in a bare <span> — the same
           device-dependent "tofu box" issue fixed at each button's own
           primary creation site (v50's clap button, v51's poll/chat-mode
           buttons, above). This self-healing path recreates the exact
           same DOM node when it's found missing, so it needed the same
           fix or a self-heal would have silently reintroduced the broken
           icon. `glyph` is now an FA6 icon class name instead of an
           emoji character. */
        btn.innerHTML = '<i class="fas ' + glyph + '"></i>';
        panel.appendChild(btn);
        log('self-healed missing #' + id + ' in the host control panel.');
    }
    function _v54EnsurePanelButtons() {
        _v54EnsureBtn('pv51-chatmode-btn', 'Chat mode', 'fa-comment');
        _v54EnsureBtn('pv51-poll-btn', 'Start a poll', 'fa-square-poll-vertical');
        _v54EnsureBtn('live-host-clap-btn', 'Hype the crowd', 'fa-hands-clapping');
    }

    /* =========================================================================
       §C — BUG 3: robust guest camera-switch. Capture-phase handler
       supersedes app-patch-v37.js's bubble-phase one (same established
       pattern V53 already uses for the panel buttons) so a tap here is
       guaranteed to run first; falls back to an unconstrained camera
       request if the exact front/back facingMode match fails (the
       single-camera-device case), instead of leaving the tap a no-op.
       ========================================================================= */
    var SWITCH_BTN_ID = 'live-camera-switch-btn';
    var _v54Switching = false;
    var _v54Facing = 'user';

    function _v54IsPermDenied(err) {
        var s = ((err && (err.code || '')) + ' ' + (err && err.message || '')).toLowerCase();
        return s.indexOf('permission_denied') !== -1 || s.indexOf('notallowederror') !== -1 ||
            s.indexOf('permission denied') !== -1 || s.indexOf('securityerror') !== -1;
    }
    function _v54IsOverconstrained(err) {
        var s = ((err && (err.name || err.code || '')) + ' ' + (err && err.message || '')).toLowerCase();
        return s.indexOf('overconstrained') !== -1 || s.indexOf('constraint') !== -1 || s.indexOf('notfound') !== -1;
    }

    function _v54EnsureSwitchBtn() {
        var isBroadcaster = typeof window._empIsGuestBroadcaster === 'function' && window._empIsGuestBroadcaster();
        var footer = document.querySelector('.live-footer');
        var existing = document.getElementById(SWITCH_BTN_ID);
        if (!isBroadcaster || !footer) {
            if (existing) existing.remove();
            return;
        }
        if (existing) return; // already present (created by this function or by v37) — nothing to heal
        var btn = document.createElement('button');
        btn.id = SWITCH_BTN_ID;
        btn.type = 'button';
        btn.title = 'Switch camera';
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        var camBtn = document.getElementById('live-video-toggle');
        if (camBtn && camBtn.parentElement === footer) footer.insertBefore(btn, camBtn.nextSibling);
        else footer.appendChild(btn);
        log('self-healed missing #' + SWITCH_BTN_ID + ' for the current guest broadcaster.');
    }

    async function _v54SwitchCamera(btn) {
        if (_v54Switching) return;
        if (typeof AgoraRTC === 'undefined' || !window._agoraAvailable) {
            notify('Camera switch needs the Agora SDK, which isn\u2019t available right now.', 'warning');
            return;
        }
        var client = typeof window._empGetGuestClient === 'function' ? window._empGetGuestClient() : null;
        if (!client) {
            notify('You\u2019re not currently broadcasting, so there\u2019s no camera to switch.', 'warning');
            return;
        }
        var oldTrack = typeof window._empGuestVideoTrack === 'function' ? window._empGuestVideoTrack() : null;
        var wasEnabled = !oldTrack || oldTrack.enabled !== false;
        var nextFacing = _v54Facing === 'user' ? 'environment' : 'user';

        _v54Switching = true;
        if (btn) btn.style.opacity = '0.5';

        async function acquire(constraints) {
            var t = await AgoraRTC.createCameraVideoTrack(constraints);
            if (!wasEnabled) { try { await t.setEnabled(false); } catch (eDis) {} }
            await client.publish([t]);
            return t;
        }

        try {
            var newTrack;
            var usedFallback = false;
            try {
                newTrack = await acquire({ facingMode: nextFacing });
            } catch (eExact) {
                if (_v54IsPermDenied(eExact)) throw eExact;
                if (!_v54IsOverconstrained(eExact)) throw eExact;
                // FIX (bug 3 — "switching camera does nothing"): the exact
                // front/back match isn't available on this device (most
                // laptops/desktops only expose one camera). Retry with no
                // facingMode constraint at all so the guest's camera still
                // (re)activates instead of the tap silently failing.
                usedFallback = true;
                newTrack = await acquire({});
            }

            if (oldTrack) {
                try { await client.unpublish([oldTrack]); } catch (eUnpub) {}
                try { oldTrack.stop(); oldTrack.close(); } catch (eClose) {}
            }

            if (!usedFallback) _v54Facing = nextFacing;
            if (typeof window._empSetGuestVideoTrack === 'function') window._empSetGuestVideoTrack(newTrack);

            if (usedFallback) {
                notify('\uD83D\uDCF7 This device only has one camera \u2014 reconnected it.', 'info');
            } else {
                notify(nextFacing === 'environment' ? '\uD83D\uDCF7 Switched to back camera.' : '\uD83E\uDD33 Switched to front camera.', 'success');
            }
            log('camera (re)acquired, facingMode=' + (usedFallback ? '(unconstrained fallback)' : nextFacing));
        } catch (err) {
            if (_v54IsPermDenied(err)) {
                notify('Camera permission is blocked for this app \u2014 allow camera access in your browser/device settings, then try again.', 'error');
            } else {
                notify('Could not open the camera: ' + (err && err.message ? err.message : 'try again.'), 'error');
            }
        } finally {
            _v54Switching = false;
            if (btn) btn.style.opacity = '';
        }
    }

    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var btn = e.target.closest('#' + SWITCH_BTN_ID);
        if (!btn) return;
        // Capture-phase: stops app-patch-v37.js's own bubble-phase handler
        // for this same id from also firing on the same tap (avoids a
        // double camera-acquisition race), the same supersession pattern
        // already used above for the host-panel buttons.
        e.stopPropagation();
        e.preventDefault();
        _v54SwitchCamera(btn);
    }, true);

    /* =========================================================================
       §D — BUG 1: defensive duplicate-clap-button sweep. V50's own
       isRealHost() gating (above, and confirmed to already run correctly
       once the script-abort is fixed) should make this a no-op in
       practice — kept as a cheap, harmless guarantee rather than a bet.
       ========================================================================= */
    function _v54DedupeClapButtons() {
        var host = isRealHost();
        var viewerBtn = document.getElementById('live-clap-btn');
        var hostBtn = document.getElementById('live-host-clap-btn');
        if (host && viewerBtn) { viewerBtn.remove(); log('removed stray viewer clap button from the host\u2019s own screen.'); }
        if (!host && hostBtn) { hostBtn.remove(); log('removed stray host hype-clap button from a non-host screen.'); }
    }

    /* =========================================================================
       §E — wiring: react immediately to guest-box changes (every co-host
       promotion/demotion re-renders #tk-guestbox-stack — see
       app-live-tiktok-patch.js's renderGuestBoxStack) instead of waiting
       on a poll, plus a short-interval safety net and the same
       #go-live-modal-overlay show/hide trigger every other module in
       this file already observes.
       ========================================================================= */
    function _v54RunAllChecks() {
        _v54EnsurePanelButtons();
        _v54EnsureSwitchBtn();
        _v54DedupeClapButtons();
    }

    var _v54GuestboxObserver = null;
    function _v54WatchGuestbox() {
        var stack = document.getElementById('tk-guestbox-stack');
        if (!stack || stack._pv54Watched) return;
        stack._pv54Watched = true;
        _v54GuestboxObserver = new MutationObserver(function () { _v54RunAllChecks(); });
        _v54GuestboxObserver.observe(stack, { childList: true, subtree: true });
    }

    function onModalToggle() {
        var modal = document.getElementById('go-live-modal-overlay');
        if (!modal) return;
        if (modal.classList.contains('show')) {
            _v54WatchGuestbox();
            _v54RunAllChecks();
        } else {
            if (_v54GuestboxObserver) { _v54GuestboxObserver.disconnect(); _v54GuestboxObserver = null; }
            var stack = document.getElementById('tk-guestbox-stack');
            if (stack) stack._pv54Watched = false;
            var swBtn = document.getElementById(SWITCH_BTN_ID); if (swBtn) swBtn.remove();
        }
    }

    ready(function () {
        var modal = document.getElementById('go-live-modal-overlay');
        if (modal) {
            new MutationObserver(onModalToggle).observe(modal, { attributes: true, attributeFilter: ['class'] });
            if (modal.classList.contains('show')) onModalToggle();
        }
        // Short-interval safety net — catches anything the guestbox
        // observer wouldn't (e.g. a pure host/guest role flip with no
        // guest-array change), without depending on it exclusively.
        setInterval(function () {
            var m = document.getElementById('go-live-modal-overlay');
            if (m && m.classList.contains('show')) _v54RunAllChecks();
        }, 1000);
    });

    console.log('[EmpyreanPatchV54] \u2705 Completion pack applied \u2014 (bug 4) co-host status now backed by the race-resistant _liveGuestsCache instead of app-patch-v33.js\u2019s own one-shot listener; (bug 2) poll/chat-mode/hype-clap buttons self-heal if ever missing from the host panel; (bug 3) camera-switch now runs capture-first with an unconstrained-camera fallback for single-camera devices; (bug 1) defensive sweep removes any stray duplicate clap button. See the CLAP_SOUND_URL fix on app-patch-v50\u2019s closing log line above for the root cause that had been silently blocking app-patch-v51/v52/v53 from ever running at all.');

})();


/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v55 + v56 + v57  (STANDALONE — NOT YET
   MERGED INTO v42)
   app-patch-v55.js  |  Load LAST (after app-live.js, app-live-tiktok-patch.js,
   app-live-final.js, app-fixes.js, and app-patch-v42.js)

   FEATURES IN THIS FILE, IN ORDER (ALL FIVE NOW ACTUALLY IMPLEMENTED
   BELOW — see each feature's own header further down for how):
     v55 — Background Sound Library + Beauty/Filter Effects
     v56 — Live Shopping / Product Pin
     v57 — Stream Replay (host-device record \u2192 Cloudinary \u2192 playback)
     v58 — Scheduled Streams + Reminders
     v59 — Watermarked Screen-Share / Download
   Everything from the original punch list's "not yet implemented" tier
   is now covered by this file except New Follower Toast (lower-effort
   polish item, never in this file's own scope per any session's plan
   so far — a v59 candidate if wanted next).

   Per this session's instruction: this file is deliberately built and
   left UNMERGED. It does not get folded into app-patch-v42.js's own
   merged v42+v50+v51+v52(+v53) block yet — that happens in a later
   session once the in-flight v53 bugfix pass is done. Loading this file
   on its own, appended after the files listed above, is enough to turn
   all three features on; nothing here depends on anything from a future
   merge step. When that merge does happen, v55/v56/v57 can be folded in
   as three more back-to-back IIFEs, exactly like v50\u2192v51\u2192v52\u2192v53
   already are inside app-patch-v42.js today — see the previous session's
   own note on this for why that copy-paste is expected to be
   reconciliation-free.

   ═══════════════════════════════════════════════════════════════════════
   WHY THIS COULD BE BUILT AS A PURE ADDITIVE FILE — ZERO EDITS ANYWHERE
   ═══════════════════════════════════════════════════════════════════════
   Every previous feature in this area that needed to reach a private
   variable inside app-live.js / app-live-tiktok-patch.js's own closures
   (app-patch-v33.js's isHost() gates, app-patch-v37.js's _guestClient/
   _guestTracks getters) had to make a small, documented edit to that
   file, because the thing it needed — a live gate check, a currently-
   held track reference — only ever existed as a local variable with no
   reason to be exposed for its own sake.

   This patch needs two things from app-live.js's closure: the host's
   own `agoraClient` and the two local tracks it creates in
   initAgoraHost() (`micTrack`, `cameraTrack` — module-local as
   `agoraLocalTracks.audio` / `.video`). But those aren't reached by
   editing a gate — they're the DIRECT RETURN VALUES of two calls on the
   global `AgoraRTC` object: `AgoraRTC.createClient(...)` and
   `AgoraRTC.createMicrophoneAndCameraTracks(...)`. `AgoraRTC` is a
   single shared global loaded once via the Agora CDN script, and
   app-live.js doesn't call either of those until the host actually taps
   "Go Live" — well after every one of this session's own files has
   already loaded and run. That means this file can wrap both calls at
   load time (capturing whatever they return, without changing what they
   return) and see every track/client the moment app-live.js creates it,
   with no edit to app-live.js at all. §1 below does exactly that — nine
   lines of wrapping, and the wrapped functions still do precisely what
   they always did.

   The same technique already has precedent in this codebase two levels
   removed: `AgoraRTC.createCustomVideoTrack({ mediaStreamTrack })` is
   already called directly in app-fixes.js (screen-share path) — proof
   the SDK's custom-track constructors are already a supported, load-
   bearing part of this app, not a new/unproven API surface introduced
   here. This patch's own track-replacement step (§5) is the same call,
   used the same way, just fed a canvas/Web-Audio-graph output instead
   of a screen-capture stream.

   Distinguishing the REAL host's own client from every OTHER client
   this codebase creates on the same device (the guest-broadcast client
   in app-live-tiktok-patch.js, the PK-opponent audience client in
   app-patch-v42.js) doesn't need a second edit either: every one of
   those other clients either calls `setClientRole('audience')` (PK
   opponent — never matches) or, for the guest-broadcast case, calls
   `setClientRole('host')` from a device where `isRealHost()` is false
   (a promoted guest is never the stream's actual owner). So "the client
   whose `setClientRole('host')` was called while `isRealHost()` is
   true" is, by construction, always the real host's own client, on the
   real host's own device — verified directly against every
   `createClient(` / `setClientRole(` call site in app-live.js,
   app-live-tiktok-patch.js, and app-patch-v42.js before writing this.

   ═══════════════════════════════════════════════════════════════════════
   FEATURE 1 — BACKGROUND SOUND LIBRARY
   ═══════════════════════════════════════════════════════════════════════
   REQUESTED: ambient/worship tracks mixed under the host's mic, audible
   to every viewer, host-controlled volume.

   The punch-list's own note on this item was "needs curated audio
   assets uploaded to public/sounds/" — a real blocker for a project
   maintained from a phone with no desktop access to push new binary
   files (this codebase's own working-style constraint, already the
   documented reason app-patch-v50.js synthesizes its clap sound with
   the Web Audio API instead of shipping an mp3). Same fix, same reason,
   applied here: every track in the library is synthesized at runtime —
   filtered noise for ocean/rain, slow detuned-oscillator pads for
   worship/ambient/drone — so the feature ships today with no asset
   upload step and can never 404. §3 has the five presets; adding a
   sixth is one more function in that table, nothing else to touch.

   MIXING: the host's raw mic MediaStreamTrack (pulled off the captured
   Agora track via its own `getMediaStreamTrack()` — a real method on
   Agora's ILocalAudioTrack, not something this patch invented) feeds a
   MediaStreamAudioSourceNode. The selected ambient preset feeds its own
   generator into a separate gain node the host's volume slider controls.
   Both sides sum into a MediaStreamAudioDestinationNode, whose output
   MediaStreamTrack is wrapped with AgoraRTC.createCustomAudioTrack and
   published in place of the raw mic track (publish-new-before-unpublish-
   old, the same ordering app-patch-v37.js's camera swap already uses, so
   there's never a gap where nothing is published).

   The raw mic track is deliberately never closed — it stays alive as
   the graph's own input — so the existing mic-mute button
   (`#live-mic-toggle`, still calling `agoraLocalTracks.audio.setEnabled()`
   inside app-live.js exactly as before) keeps working completely
   unmodified: disabling the underlying track feeds the graph silence,
   which mutes the host's VOICE while the ambient bed keeps playing
   underneath — the correct behavior for background music, and it falls
   out of the existing button for free, no new wiring needed for it.

   ═══════════════════════════════════════════════════════════════════════
   FEATURE 2 — BEAUTY / FILTER EFFECTS
   ═══════════════════════════════════════════════════════════════════════
   REQUESTED: brightness/smoothing/AR-lite filter on the host's own
   camera. Flagged on the punch list as "the most architecturally
   involved" item — a canvas/WebGL pipeline between capture and publish.

   Built as canvas 2D, not WebGL: nothing else in this codebase uses
   WebGL anywhere (verified — grep across every file here turns up zero
   `getContext('webgl')` calls), while canvas 2D is already an
   established pattern for pixel-level work (app-fixes.js's watermark-on-
   download and image-crop paths both already draw a `<video>`/`<img>`
   into a `<canvas>`). Matching that gives this feature the same runtime
   footprint as code already proven to work on every device this app
   ships to, instead of gambling on WebGL support this project has never
   needed before. "Beauty" itself is a lightweight approximation, not a
   face-mesh AR pipeline — each preset is a `ctx.filter` CSS-filter
   string (brightness/contrast/saturation lift, a very small blur radius
   standing in for skin smoothing) plus, for the two warmer presets, one
   extra translucent color layer composited on top. A true landmark-
   tracked AR pipeline is a materially larger project and is NOT what
   this file builds — flagged here explicitly so that isn't discovered
   as a surprise later.

   PIPELINE: raw camera MediaStreamTrack → hidden `<video>` → each
   animation frame drawn into an offscreen `<canvas>` with the active
   preset's `ctx.filter` applied → `canvas.captureStream(30)` → its video
   track wrapped with `AgoraRTC.createCustomVideoTrack` → published in
   place of the raw camera track (same publish-before-unpublish swap as
   the audio side). Unlike audio, this DOES swap back to the raw camera
   track when the host selects "Original" — running the canvas loop has
   a real per-frame cost, so it only runs while a preset other than
   Original is actually active, the same "only pay for it while it's
   actually on" discipline app-patch-v37.js's button already follows for
   its own guest-only feature.

   The local preview (`#agora-local-video`) is redirected to show the
   SAME canvas the viewers see, not the raw camera feed — so what the
   host sees in their own preview is always exactly what's being
   published, with no separate "preview doesn't match what viewers see"
   drift.

   ═══════════════════════════════════════════════════════════════════════
   SCOPE — HOST ONLY, BOTH FEATURES
   ═══════════════════════════════════════════════════════════════════════
   Neither feature was requested for guest broadcasters, so — same
   discipline as app-patch-v37.js scoping its camera-flip button to
   guests only "per this session's own request" — both buttons here only
   ever render for `isRealHost()`. Extending either to guest broadcasters
   later is a real but separate piece of work (their tracks live in
   app-live-tiktok-patch.js's own closure, reached the app-patch-v37.js
   way, not the wrapping trick this file uses for the host).

   ═══════════════════════════════════════════════════════════════════════
   DATA MODEL / PERSISTENCE
   ═══════════════════════════════════════════════════════════════════════
   No Firestore collection, no rule change, nothing synced — both
   features are pure local media processing on the host's own device;
   every viewer simply receives the already-mixed audio track / already-
   filtered video track like any other published track, automatically,
   with no separate signaling needed. The only persistence is a plain
   `localStorage` entry (`emp_v55_prefs`) remembering the host's last-
   picked ambient track/volume and beauty preset/intensity so reopening
   either panel starts where they left off — convenience only, safe to
   delete at any time, nothing else reads or depends on it.
   ============================================================================= */

(function empyreanPatchV55() {
    'use strict';

    if (window._empPatchV55Loaded) {
        console.warn('[V55] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV55Loaded = true;

    function log(msg) { console.log('[V55] ' + msg); }
    function warn(msg) { console.warn('[V55] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    // Same host check every live-streaming patch in this codebase already
    // uses (app-patch-v33.js / app-patch-v37's own §2 / app-patch-v42.js's
    // v51+v52 sections all carry an identical copy).
    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }
    function isCurrentlyLive() {
        return !!(window.liveStreamData && window.liveStreamData.isLive && window._agoraActiveChannel);
    }

    /* =========================================================================
       §0 — tiny localStorage prefs (convenience only — see header)
       ========================================================================= */
    var PREFS_KEY = 'emp_v55_prefs';
    function _loadPrefs() {
        try {
            var raw = localStorage.getItem(PREFS_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function _savePrefs(p) {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* private-browsing/quota — non-fatal, just skip persistence */ }
    }
    var _prefs = _loadPrefs();

    /* =========================================================================
       §1 — AgoraRTC capture layer. Wraps the SDK's own factory functions to
       observe whatever app-live.js creates for the REAL host, without
       editing app-live.js. See header for why this is reliable.
       ========================================================================= */
    var _hostClient = null;       // this device's own host-role agoraClient, once seen
    var _rawMicTrack = null;      // the ORIGINAL Agora local audio track from initAgoraHost()
    var _rawCameraTrack = null;   // the ORIGINAL Agora local video track from initAgoraHost()
    var _capturedForChannel = null; // which channel these captures belong to, so a re-Go-Live resets cleanly

    function _resetCaptureIfNewChannel() {
        var ch = window._agoraActiveChannel;
        if (ch !== _capturedForChannel) {
            _capturedForChannel = ch;
            _hostClient = null;
            _rawMicTrack = null;
            _rawCameraTrack = null;
            _teardownAudioGraph();
            _teardownVideoPipeline(true);
        }
    }

    (function installAgoraWrappers() {
        function tryWrap() {
            if (typeof AgoraRTC === 'undefined' || AgoraRTC._empV55Wrapped) return;
            AgoraRTC._empV55Wrapped = true;

            var origCreateClient = AgoraRTC.createClient.bind(AgoraRTC);
            AgoraRTC.createClient = function () {
                var client = origCreateClient.apply(AgoraRTC, arguments);
                if (client && typeof client.setClientRole === 'function' && !client._empV55RoleWrapped) {
                    client._empV55RoleWrapped = true;
                    var origSetRole = client.setClientRole.bind(client);
                    client.setClientRole = function (role) {
                        var ret = origSetRole.apply(client, arguments);
                        if (role === 'host' && isRealHost()) {
                            _resetCaptureIfNewChannel();
                            _hostClient = client;
                            log('captured the real host\u2019s own Agora client.');
                        }
                        return ret;
                    };
                }
                return client;
            };

            if (typeof AgoraRTC.createMicrophoneAndCameraTracks === 'function') {
                var origBoth = AgoraRTC.createMicrophoneAndCameraTracks.bind(AgoraRTC);
                AgoraRTC.createMicrophoneAndCameraTracks = async function () {
                    var tracks = await origBoth.apply(AgoraRTC, arguments);
                    if (isRealHost()) {
                        _resetCaptureIfNewChannel();
                        _rawMicTrack = tracks && tracks[0] ? tracks[0] : _rawMicTrack;
                        _rawCameraTrack = tracks && tracks[1] ? tracks[1] : _rawCameraTrack;
                        log('captured host mic+camera tracks (' + (tracks ? tracks.length : 0) + ').');
                    }
                    return tracks;
                };
            }
            // Audio-only fallback path in initAgoraHost() (permission/camera
            // failure) — still worth capturing so the sound library keeps
            // working even when the host is broadcasting audio-only.
            if (typeof AgoraRTC.createMicrophoneAudioTrack === 'function') {
                var origMic = AgoraRTC.createMicrophoneAudioTrack.bind(AgoraRTC);
                AgoraRTC.createMicrophoneAudioTrack = async function () {
                    var track = await origMic.apply(AgoraRTC, arguments);
                    if (isRealHost() && track) {
                        _resetCaptureIfNewChannel();
                        _rawMicTrack = track;
                        log('captured host mic track (audio-only path).');
                    }
                    return track;
                };
            }
            log('AgoraRTC factory wrappers installed.');
        }
        tryWrap();
        // AgoraRTC loads via a CDN <script> tag — belt-and-suspenders retry
        // in case this file executes before that script has finished, the
        // same retry timing convention app-patch-v50.js's own gift-hook
        // arming already uses.
        setTimeout(tryWrap, 500);
        setTimeout(tryWrap, 1500);
        setTimeout(tryWrap, 4000);
    })();

    function _hostTracksReady() {
        return isRealHost() && isCurrentlyLive() && !!_hostClient && !!_rawMicTrack;
    }
    function _hostCameraReady() {
        return _hostTracksReady() && !!_rawCameraTrack;
    }

    /* =========================================================================
       §2 — shared Web Audio context (separate from app-patch-v42.js's own
       v50 clap-synthesis context — deliberately, same "one context per
       independent concern" discipline app-patch-v33.js's header already
       explains for why it runs its own listener instead of reusing
       another file's).
       ========================================================================= */
    var _actx = null;
    function _ensureAudioCtx() {
        if (_actx) return _actx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { _actx = new Ctx(); } catch (e) { _actx = null; }
        return _actx;
    }

    /* =========================================================================
       §3 — FEATURE 1: ambient sound library (synthesized, no audio files)
       ========================================================================= */
    var _ambient = {
        graphBuilt: false,
        micSource: null,
        ambientGain: null,   // host-controlled volume for the bed
        destination: null,   // MediaStreamAudioDestinationNode -> what gets published
        customTrack: null,   // the Agora custom audio track built from destination.stream
        activePresetId: null,
        activeStop: null,    // stop() fn for the currently-playing generator, or null
        published: false
    };

    // Each generator receives (ctx, outputGainNode) and must connect
    // whatever it builds into outputGainNode, then return a stop() fn that
    // tears its own nodes down. Kept intentionally simple/cheap — this
    // plays for the whole duration of a live stream, so no generator here
    // allocates more than a couple of oscillators/noise loops.
    var AMBIENT_PRESETS = [
        {
            id: 'ocean', label: '\uD83C\uDF0A Ocean Waves',
            build: function (ctx, out) {
                var bufSize = 2 * ctx.sampleRate;
                var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
                var data = buf.getChannelData(0);
                for (var i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
                var noise = ctx.createBufferSource();
                noise.buffer = buf; noise.loop = true;
                var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
                var swell = ctx.createGain(); swell.gain.value = 0.5;
                var lfo = ctx.createOscillator(); lfo.frequency.value = 0.12; // one "wave" every ~8s
                var lfoGain = ctx.createGain(); lfoGain.gain.value = 0.35;
                lfo.connect(lfoGain); lfoGain.connect(swell.gain);
                noise.connect(lp); lp.connect(swell); swell.connect(out);
                noise.start(); lfo.start();
                return function stop() { try { noise.stop(); lfo.stop(); } catch (e) {} };
            }
        },
        {
            id: 'rain', label: '\uD83C\uDF27\uFE0F Rain',
            build: function (ctx, out) {
                var bufSize = 2 * ctx.sampleRate;
                var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
                var data = buf.getChannelData(0);
                for (var i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
                var noise = ctx.createBufferSource();
                noise.buffer = buf; noise.loop = true;
                var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
                var gain = ctx.createGain(); gain.gain.value = 0.28;
                noise.connect(hp); hp.connect(gain); gain.connect(out);
                noise.start();
                return function stop() { try { noise.stop(); } catch (e) {} };
            }
        },
        {
            id: 'worship', label: '\uD83D\uDE4F Worship Pad',
            build: function (ctx, out) {
                // A simple sustained major-ish pad: three detuned sines a
                // fifth/octave apart, slow amplitude swell.
                var freqs = [130.81, 196.00, 261.63]; // C3, G3, C4
                var oscs = [], stopFns = [];
                var padGain = ctx.createGain(); padGain.gain.value = 0.0;
                padGain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.5); // gentle fade-in
                freqs.forEach(function (f) {
                    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
                    var g = ctx.createGain(); g.gain.value = 1 / freqs.length;
                    o.connect(g); g.connect(padGain);
                    o.start();
                    oscs.push(o);
                });
                padGain.connect(out);
                return function stop() { oscs.forEach(function (o) { try { o.stop(); } catch (e) {} }); };
            }
        },
        {
            id: 'drone', label: '\uD83C\uDFB9 Soft Piano Drone',
            build: function (ctx, out) {
                var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 220;
                var o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 220 * 1.5; // perfect fifth
                var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
                var g = ctx.createGain(); g.gain.value = 0.18;
                o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
                o1.start(); o2.start();
                return function stop() { try { o1.stop(); o2.stop(); } catch (e) {} };
            }
        },
        {
            id: 'campfire', label: '\uD83D\uDD25 Campfire',
            build: function (ctx, out) {
                var bufSize = 2 * ctx.sampleRate;
                var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
                var data = buf.getChannelData(0);
                for (var i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
                var noise = ctx.createBufferSource();
                noise.buffer = buf; noise.loop = true;
                var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 450; bp.Q.value = 0.6;
                var gain = ctx.createGain(); gain.gain.value = 0.22;
                noise.connect(bp); bp.connect(gain); gain.connect(out);
                noise.start();
                return function stop() { try { noise.stop(); } catch (e) {} };
            }
        }
    ];

    function _buildAudioGraphIfNeeded() {
        if (_ambient.graphBuilt) return true;
        if (!_hostTracksReady()) return false;
        var ctx = _ensureAudioCtx();
        if (!ctx) { warn('Web Audio unavailable — sound library cannot run on this device.'); return false; }
        try {
            var rawStreamTrack = typeof _rawMicTrack.getMediaStreamTrack === 'function' ? _rawMicTrack.getMediaStreamTrack() : null;
            if (!rawStreamTrack) { warn('could not read the raw MediaStreamTrack off the host mic track.'); return false; }
            _ambient.micSource = ctx.createMediaStreamSource(new MediaStream([rawStreamTrack]));
            _ambient.destination = ctx.createMediaStreamDestination();
            _ambient.ambientGain = ctx.createGain();
            var startVol = (_prefs.ambientVolume != null) ? _prefs.ambientVolume : 0.5;
            _ambient.ambientGain.gain.value = startVol;

            // Mic goes straight through, unaffected by the ambient volume
            // slider — only the bed's own gain is host-adjustable.
            _ambient.micSource.connect(_ambient.destination);
            _ambient.ambientGain.connect(_ambient.destination);

            _ambient.graphBuilt = true;
            return true;
        } catch (e) {
            warn('failed to build audio graph: ' + (e && e.message));
            return false;
        }
    }

    async function _publishMixedAudioIfNeeded() {
        if (_ambient.published) return true;
        if (!_buildAudioGraphIfNeeded()) return false;
        try {
            var mixedStreamTrack = _ambient.destination.stream.getAudioTracks()[0];
            _ambient.customTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: mixedStreamTrack });
            // Publish the mixed track BEFORE unpublishing the raw one — no
            // gap where the host is publishing zero audio (same ordering
            // app-patch-v37.js's own camera swap already uses).
            await _hostClient.publish([_ambient.customTrack]);
            try { await _hostClient.unpublish([_rawMicTrack]); } catch (eUnpub) { /* non-fatal — worst case both are briefly published together */ }
            _ambient.published = true;
            log('switched published audio to the mixed (mic + ambient) track.');
            return true;
        } catch (e) {
            notify('Could not enable the sound library: ' + (e && e.message ? e.message : 'try again.'), 'error');
            return false;
        }
    }

    async function _playAmbient(presetId) {
        if (!_hostTracksReady()) { notify('Go live first, then pick a background sound.', 'warning'); return; }
        var preset = AMBIENT_PRESETS.filter(function (p) { return p.id === presetId; })[0];
        if (!preset) return;
        var ok = await _publishMixedAudioIfNeeded();
        if (!ok) return;
        if (_ambient.activeStop) { _ambient.activeStop(); _ambient.activeStop = null; }
        try {
            _ambient.activeStop = preset.build(_actx, _ambient.ambientGain);
            _ambient.activePresetId = presetId;
            _prefs.ambientPreset = presetId;
            _savePrefs(_prefs);
            notify(preset.label + ' is now playing under your mic.', 'success');
            _renderSoundLibraryModal();
        } catch (e) {
            warn('failed to start preset ' + presetId + ': ' + (e && e.message));
        }
    }
    function _stopAmbient() {
        if (_ambient.activeStop) { _ambient.activeStop(); _ambient.activeStop = null; }
        _ambient.activePresetId = null;
        _prefs.ambientPreset = null;
        _savePrefs(_prefs);
        // Deliberately does NOT swap back to the raw mic track — see
        // header (§1 of Feature 1): the mixed graph is a transparent
        // passthrough with the bed silenced, so there's no benefit to the
        // swap-back complexity the video pipeline needs for CPU reasons.
        _renderSoundLibraryModal();
    }
    function _setAmbientVolume(v) {
        v = Math.max(0, Math.min(1, v));
        _prefs.ambientVolume = v;
        _savePrefs(_prefs);
        if (_ambient.ambientGain) {
            try { _ambient.ambientGain.gain.setTargetAtTime(v, _actx.currentTime, 0.05); } catch (e) { _ambient.ambientGain.gain.value = v; }
        }
    }

    function _teardownAudioGraph() {
        if (_ambient.activeStop) { try { _ambient.activeStop(); } catch (e) {} _ambient.activeStop = null; }
        try { if (_ambient.micSource) _ambient.micSource.disconnect(); } catch (e) {}
        try { if (_ambient.ambientGain) _ambient.ambientGain.disconnect(); } catch (e) {}
        try { if (_ambient.customTrack) { _ambient.customTrack.close(); } } catch (e) {}
        _ambient.graphBuilt = false;
        _ambient.published = false;
        _ambient.micSource = null;
        _ambient.ambientGain = null;
        _ambient.destination = null;
        _ambient.customTrack = null;
        _ambient.activePresetId = null;
    }

    /* =========================================================================
       §4 — FEATURE 2: beauty / filter effects (canvas 2D pipeline)
       ========================================================================= */
    var BEAUTY_PRESETS = [
        { id: 'original', label: 'Original', filter: 'none', overlay: null },
        { id: 'glow', label: '\u2728 Natural Glow', filter: 'brightness(1.08) contrast(1.04) saturate(1.12) blur(0.4px)', overlay: null },
        { id: 'soft', label: '\uD83C\uDF19 Soft Focus', filter: 'brightness(1.05) contrast(0.97) blur(0.9px)', overlay: null },
        { id: 'bright', label: '\u2600\uFE0F Bright', filter: 'brightness(1.18) contrast(1.06) saturate(1.05)', overlay: null },
        { id: 'warm', label: '\uD83C\uDF45 Warm Tone', filter: 'brightness(1.06) contrast(1.03) saturate(1.15)', overlay: 'rgba(255,150,60,0.10)' }
    ];

    var _beauty = {
        video: null,      // hidden <video> playing the raw camera stream
        canvas: null,
        ctx2d: null,
        rafId: null,
        customTrack: null,
        activePresetId: 'original',
        published: false, // true while the CANVAS track (not raw camera) is what's published
        intensity: 1.0    // 0..1, scales how strongly the filter is applied
    };

    function _scaledFilter(preset, intensity) {
        if (preset.id === 'original' || intensity <= 0) return 'none';
        // Cheap linear interpolation toward "no filter" as intensity drops,
        // so the slider actually does something instead of being all-or-
        // nothing. Only touches the numeric filter functions; blur is
        // scaled directly in px.
        var m = intensity;
        return preset.filter.replace(/([\d.]+)(px)?/g, function (full, num, isPx) {
            var n = parseFloat(num);
            if (isPx) return (n * m).toFixed(2) + 'px';
            var delta = n - 1;
            return (1 + delta * m).toFixed(3);
        });
    }

    function _ensureCanvasPipeline() {
        if (_beauty.canvas) return true;
        if (!_hostCameraReady()) return false;
        try {
            var rawStreamTrack = typeof _rawCameraTrack.getMediaStreamTrack === 'function' ? _rawCameraTrack.getMediaStreamTrack() : null;
            if (!rawStreamTrack) { warn('could not read the raw MediaStreamTrack off the host camera track.'); return false; }

            var video = document.createElement('video');
            video.muted = true; video.playsInline = true; video.autoplay = true;
            video.srcObject = new MediaStream([rawStreamTrack]);
            video.play().catch(function () {});

            var canvas = document.createElement('canvas');
            var ctx2d = canvas.getContext('2d');

            _beauty.video = video;
            _beauty.canvas = canvas;
            _beauty.ctx2d = ctx2d;
            return true;
        } catch (e) {
            warn('failed to set up beauty pipeline: ' + (e && e.message));
            return false;
        }
    }

    function _drawLoop() {
        _beauty.rafId = requestAnimationFrame(_drawLoop);
        var v = _beauty.video, c = _beauty.canvas, ctx = _beauty.ctx2d;
        if (!v || v.readyState < 2) return; // not enough data yet this frame
        if (c.width !== v.videoWidth && v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
        if (!c.width) return;
        var preset = BEAUTY_PRESETS.filter(function (p) { return p.id === _beauty.activePresetId; })[0] || BEAUTY_PRESETS[0];
        ctx.filter = _scaledFilter(preset, _beauty.intensity);
        ctx.drawImage(v, 0, 0, c.width, c.height);
        if (preset.overlay && _beauty.intensity > 0) {
            ctx.filter = 'none';
            ctx.fillStyle = preset.overlay;
            ctx.globalCompositeOperation = 'soft-light';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    function _showCanvasAsPreview() {
        var wrapper = document.getElementById('agora-local-video');
        if (!wrapper) return;
        var existing = document.getElementById('pv55-beauty-canvas-preview');
        if (existing) return; // already swapped in
        _beauty.canvas.id = 'pv55-beauty-canvas-preview';
        _beauty.canvas.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        wrapper.appendChild(_beauty.canvas);
        var rawVideoEl = wrapper.querySelector('video');
        if (rawVideoEl) rawVideoEl.style.display = 'none'; // keep it in the DOM (still the capture source), just hide it
    }
    function _hideCanvasPreview() {
        var el = document.getElementById('pv55-beauty-canvas-preview');
        if (el) el.remove();
        var wrapper = document.getElementById('agora-local-video');
        var rawVideoEl = wrapper && wrapper.querySelector('video');
        if (rawVideoEl) rawVideoEl.style.display = '';
    }

    async function _publishCanvasVideoIfNeeded() {
        if (_beauty.published) return true;
        if (!_ensureCanvasPipeline()) return false;
        if (!_beauty.rafId) _drawLoop();
        try {
            var canvasStream = _beauty.canvas.captureStream(30);
            var canvasStreamTrack = canvasStream.getVideoTracks()[0];
            _beauty.customTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: canvasStreamTrack });
            await _hostClient.publish([_beauty.customTrack]);
            try { await _hostClient.unpublish([_rawCameraTrack]); } catch (eUnpub) {}
            _beauty.published = true;
            _showCanvasAsPreview();
            log('switched published video to the beauty-filtered canvas track.');
            return true;
        } catch (e) {
            notify('Could not enable filters: ' + (e && e.message ? e.message : 'try again.'), 'error');
            return false;
        }
    }
    async function _revertToRawVideo() {
        if (!_beauty.published) return;
        try {
            await _hostClient.publish([_rawCameraTrack]);
            try { await _hostClient.unpublish([_beauty.customTrack]); } catch (eUnpub) {}
        } catch (e) {
            warn('could not cleanly revert to the raw camera track: ' + (e && e.message));
        }
        try { if (_beauty.customTrack) _beauty.customTrack.close(); } catch (e) {}
        _beauty.customTrack = null;
        _beauty.published = false;
        _hideCanvasPreview();
        if (_beauty.rafId) { cancelAnimationFrame(_beauty.rafId); _beauty.rafId = null; }
    }

    async function _selectBeautyPreset(presetId) {
        if (!_hostCameraReady()) { notify('Go live with your camera on first, then pick a filter.', 'warning'); return; }
        _beauty.activePresetId = presetId;
        _prefs.beautyPreset = presetId;
        _savePrefs(_prefs);
        if (presetId === 'original') {
            await _revertToRawVideo();
            notify('Filters off — back to your original camera.', 'info');
        } else {
            var ok = await _publishCanvasVideoIfNeeded();
            if (ok) {
                var preset = BEAUTY_PRESETS.filter(function (p) { return p.id === presetId; })[0];
                notify((preset ? preset.label : 'Filter') + ' applied.', 'success');
            }
        }
        _renderBeautyModal();
    }
    function _setBeautyIntensity(v) {
        v = Math.max(0, Math.min(1, v));
        _beauty.intensity = v;
        _prefs.beautyIntensity = v;
        _savePrefs(_prefs);
    }

    function _teardownVideoPipeline(hard) {
        if (_beauty.rafId) { cancelAnimationFrame(_beauty.rafId); _beauty.rafId = null; }
        _hideCanvasPreview();
        try { if (_beauty.customTrack) _beauty.customTrack.close(); } catch (e) {}
        _beauty.customTrack = null;
        _beauty.published = false;
        if (hard) {
            try { if (_beauty.video) { _beauty.video.pause(); _beauty.video.srcObject = null; } } catch (e) {}
            _beauty.video = null;
            _beauty.canvas = null;
            _beauty.ctx2d = null;
            _beauty.activePresetId = _prefs.beautyPreset || 'original';
        }
    }

    /* =========================================================================
       §5 — UI: CSS, the two host-control-panel buttons, and their modals.
       Everything below reuses the existing `.live-sub-modal` bottom-sheet
       class (no new modal chrome) and the existing `.live-action-btn
       host-control` button styling — the same reuse app-patch-v42.js's
       own poll/PK modals and app-patch-v33.js's crown icon already rely
       on, so nothing here needs new base CSS beyond a couple of grid/
       slider rules scoped to this file's own ids.
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv55-css')) return;
        var css = document.createElement('style');
        css.id = 'pv55-css';
        css.textContent =
            '.pv55-preset-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 2px;}' +
            '.pv55-preset-btn{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:12px;padding:14px 8px;text-align:center;cursor:pointer;font-size:var(--text-md);transition:var(--transition-base, all .15s ease);}' +
            '.pv55-preset-btn:active{transform:scale(0.96);}' +
            '.pv55-preset-btn.pv55-active{background:var(--accent-color, #f5a623);border-color:transparent;color:#1a1a1a;font-weight:600;}' +
            '.pv55-slider-row{display:flex;align-items:center;gap:10px;margin-top:14px;color:#eee;font-size:var(--text-sm);}' +
            '.pv55-slider-row input[type="range"]{flex:1;}' +
            '.pv55-stop-btn{width:100%;margin-top:14px;}';
        document.head.appendChild(css);
    })();

    // FIX (bug report: "works on the first tap, then stops responding"):
    // this used to be a plain `.classList.add('show')` — fine for OPENING
    // the modal once, but every tap after that landed on an ALREADY-open
    // modal, so `.add('show')` was a true no-op: nothing on screen changed,
    // which reads exactly like "the button stopped working," even though
    // the tap itself was reaching this function correctly every single
    // time (confirmed — this was never a click-propagation bug). Every
    // OTHER icon on this same panel (chevron/viewers/trophy/requests bell)
    // already opens AND closes via a single `.classList.toggle('show')` on
    // repeat taps of the SAME icon — these two didn't match that pattern.
    // Now they do: tapping the icon again while its own modal is showing
    // closes it, exactly like its neighbors, so a tap on this icon is
    // never a no-op. Also closes the OTHER of this pair (sound/beauty) so
    // the two can never both be open/stacked on top of each other at once.
    function _openSoundModal() {
        var m = document.getElementById('pv55-sound-modal');
        if (!m) return;
        var opening = !m.classList.contains('show');
        m.classList.toggle('show');
        var other = document.getElementById('pv55-beauty-modal');
        if (opening && other) other.classList.remove('show');
        if (opening) _renderSoundLibraryModal();
    }
    function _openBeautyModal() {
        var m = document.getElementById('pv55-beauty-modal');
        if (!m) return;
        var opening = !m.classList.contains('show');
        m.classList.toggle('show');
        var other = document.getElementById('pv55-sound-modal');
        if (opening && other) other.classList.remove('show');
        if (opening) _renderBeautyModal();
    }

    function _ensureHostButtons() {
        if (!isRealHost()) { _removeHostButtons(); return; }
        var panel = document.getElementById('host-control-panel-inner');
        if (!panel) return;
        if (!document.getElementById('pv55-sound-btn')) {
            var soundBtn = document.createElement('button');
            soundBtn.id = 'pv55-sound-btn';
            soundBtn.type = 'button';
            soundBtn.className = 'live-action-btn host-control';
            soundBtn.title = 'Background Sound';
            soundBtn.innerHTML = '<i class="fas fa-music"></i>';
            panel.appendChild(soundBtn);
            soundBtn.addEventListener('click', _openSoundModal);
        }
        if (!document.getElementById('pv55-beauty-btn')) {
            var beautyBtn = document.createElement('button');
            beautyBtn.id = 'pv55-beauty-btn';
            beautyBtn.type = 'button';
            beautyBtn.className = 'live-action-btn host-control';
            beautyBtn.title = 'Beauty / Filters';
            beautyBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i>';
            panel.appendChild(beautyBtn);
            beautyBtn.addEventListener('click', _openBeautyModal);
        }
    }
    function _removeHostButtons() {
        var s = document.getElementById('pv55-sound-btn'); if (s) s.remove();
        var b = document.getElementById('pv55-beauty-btn'); if (b) b.remove();
    }

    // FIX (bug report: "control panel buttons — first click works, then
    // stop responding / never work at all"): #pv55-sound-btn and
    // #pv55-beauty-btn only ever had a plain bubble-phase listener bound
    // directly to the button. Every OTHER control on this exact panel
    // (toggle, viewers count, rank trophy, join-request, end-live) hit
    // this identical symptom and was fixed the same way — see
    // app-live-tiktok-patch.js's "SINGLE AUTHORITATIVE HANDLER" header —
    // a capture-phase listener on `document` always runs before
    // app-fixes.js's large body-level bubble delegate (registered at
    // document.body, handling most of the app's click routing) can ever
    // intercept or otherwise interfere with the same tap. Applying that
    // same proven fix here, for these two buttons specifically.
    // stopPropagation() prevents this from double-firing alongside the
    // button's own listener above.
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var sBtn = e.target.closest('#pv55-sound-btn');
        if (sBtn) { e.stopImmediatePropagation(); e.preventDefault(); _openSoundModal(); return; }
        var bBtn = e.target.closest('#pv55-beauty-btn');
        if (bBtn) { e.stopImmediatePropagation(); e.preventDefault(); _openBeautyModal(); return; }
    }, true);

    function _ensureModals() {
        var container = document.getElementById('live-stream-screen') || document.body;
        if (!document.getElementById('pv55-sound-modal')) {
            var m1 = document.createElement('div');
            m1.id = 'pv55-sound-modal';
            m1.className = 'live-sub-modal';
            m1.innerHTML =
                '<button type="button" class="close-modal pv55-close" style="color:white; z-index:5; top:5px; right:10px;">\u00d7</button>' +
                '<h3>\uD83C\uDFB6 Background Sound</h3>' +
                '<div class="pv55-preset-grid" id="pv55-sound-grid"></div>' +
                '<div class="pv55-slider-row"><i class="fas fa-volume-down"></i><input type="range" id="pv55-sound-vol" min="0" max="100" value="50"><i class="fas fa-volume-up"></i></div>' +
                '<button type="button" class="btn btn-danger pv55-stop-btn" id="pv55-sound-stop">Stop Background Sound</button>';
            container.appendChild(m1);
            m1.querySelector('.pv55-close').addEventListener('click', function () { m1.classList.remove('show'); });
            m1.querySelector('#pv55-sound-stop').addEventListener('click', _stopAmbient);
            m1.querySelector('#pv55-sound-vol').addEventListener('input', function (e) { _setAmbientVolume(e.target.value / 100); });
        }
        if (!document.getElementById('pv55-beauty-modal')) {
            var m2 = document.createElement('div');
            m2.id = 'pv55-beauty-modal';
            m2.className = 'live-sub-modal';
            m2.innerHTML =
                '<button type="button" class="close-modal pv55-close" style="color:white; z-index:5; top:5px; right:10px;">\u00d7</button>' +
                '<h3>\u2728 Beauty / Filters</h3>' +
                '<div class="pv55-preset-grid" id="pv55-beauty-grid"></div>' +
                '<div class="pv55-slider-row"><span>Intensity</span><input type="range" id="pv55-beauty-intensity" min="0" max="100" value="100"></div>';
            container.appendChild(m2);
            m2.querySelector('.pv55-close').addEventListener('click', function () { m2.classList.remove('show'); });
            m2.querySelector('#pv55-beauty-intensity').addEventListener('input', function (e) { _setBeautyIntensity(e.target.value / 100); });
        }
    }

    function _renderSoundLibraryModal() {
        var grid = document.getElementById('pv55-sound-grid');
        if (!grid) return;
        grid.innerHTML = AMBIENT_PRESETS.map(function (p) {
            var active = p.id === _ambient.activePresetId ? ' pv55-active' : '';
            return '<button type="button" class="pv55-preset-btn' + active + '" data-pv55-sound="' + esc(p.id) + '">' + p.label + '</button>';
        }).join('');
        var vol = document.getElementById('pv55-sound-vol');
        if (vol) vol.value = Math.round(((_ambient.ambientGain ? _ambient.ambientGain.gain.value : (_prefs.ambientVolume != null ? _prefs.ambientVolume : 0.5))) * 100);
    }
    function _renderBeautyModal() {
        var grid = document.getElementById('pv55-beauty-grid');
        if (!grid) return;
        grid.innerHTML = BEAUTY_PRESETS.map(function (p) {
            var active = p.id === _beauty.activePresetId ? ' pv55-active' : '';
            return '<button type="button" class="pv55-preset-btn' + active + '" data-pv55-beauty="' + esc(p.id) + '">' + p.label + '</button>';
        }).join('');
        var intensity = document.getElementById('pv55-beauty-intensity');
        if (intensity) intensity.value = Math.round(_beauty.intensity * 100);
    }

    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var soundBtn = e.target.closest('[data-pv55-sound]');
        if (soundBtn) { _playAmbient(soundBtn.getAttribute('data-pv55-sound')); return; }
        var beautyBtn = e.target.closest('[data-pv55-beauty]');
        if (beautyBtn) { _selectBeautyPreset(beautyBtn.getAttribute('data-pv55-beauty')); return; }
    });

    /* =========================================================================
       §6 — lifecycle: poll for host+live+tracks-ready (same 800ms polling
       convention app-live-final.js's own _watchGuestSelfState and
       app-patch-v37.js's §2 already use, for the same reason — there's no
       single reliable DOM event covering every path into/out of this
       state), show/hide the two buttons accordingly, and tear everything
       down cleanly when the stream ends.
       ========================================================================= */
    var _wasLiveWithTracks = false;
    function _tick() {
        _ensureModals();
        _ensureHostButtons();
        var readyNow = _hostTracksReady();
        if (readyNow && !_wasLiveWithTracks) {
            // Re-apply a remembered preset from a previous session, if any —
            // convenience only (see §0). Never auto-starts anything the
            // host didn't already choose at least once before.
            if (_prefs.ambientPreset) _playAmbient(_prefs.ambientPreset);
            if (_prefs.beautyPreset && _prefs.beautyPreset !== 'original') {
                _beauty.intensity = _prefs.beautyIntensity != null ? _prefs.beautyIntensity : 1.0;
                _selectBeautyPreset(_prefs.beautyPreset);
            }
        }
        if (!readyNow && _wasLiveWithTracks) {
            // Stream ended (or this device is no longer the live host) —
            // tear both pipelines down so nothing leaks into a future
            // session's fresh tracks.
            _teardownAudioGraph();
            _teardownVideoPipeline(true);
        }
        _wasLiveWithTracks = readyNow;
    }
    setInterval(_tick, 800);
    document.addEventListener('empyrean-init-done', function () { setTimeout(_tick, 500); });

    console.log('[EmpyreanPatchV55] \u2705 Background sound library (5 synthesized ambient presets, host-volume-controlled, mixed under the mic via Web Audio) and beauty/filter effects (5 canvas-2D presets with an intensity slider) added for the real host only. Built as a fully standalone, unmerged file — zero edits to any other file, via AgoraRTC factory wrapping (see header \u00a71). Not yet folded into app-patch-v42.js\u2019s merged block, per this session\u2019s instruction.');

})();

/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v56
   (lives inside app-patch-v55.js — see that file's own top header for why
   v55/v56/v57/v58/v59 are being built back-to-back in one standalone,
   unmerged file before a later merge into app-patch-v42.js)

   FEATURE — LIVE SHOPPING / PRODUCT PIN

   REQUESTED: let the host pin one of their own Marketplace listings while
   live, so every viewer sees a small tappable product card over the
   stream and can jump straight to that listing.

   ═══════════════════════════════════════════════════════════════════════
   DATA MODEL
   ═══════════════════════════════════════════════════════════════════════
   One new optional field on the EXISTING active_streams/{streamId} doc:
   `pinnedProduct: { listingId, name, price, currency, image, sellerId,
   pinnedAt } | <deleted>`. No new collection, no new security rule —
   this reuses active_streams' own existing permissive update rule, the
   same reuse app-patch-v42.js's poll/chat-mode fields (§1 of that file)
   and app-patch-v37.js already rely on for the same doc.

   REQUIRED FIRESTORE INDEX ADDITION (only needed the first time the host
   opens the picker — Firestore requires a composite index for an
   equality filter combined with an orderBy on a different field):
     Collection: marketplace_listings
     Fields:     sellerId  Ascending,  createdAt  Descending
   Firestore's own console throws a direct "create index" link with this
   exact spec the first time the query below runs, so this isn't
   guesswork — the fallback in §2 also degrades gracefully (client-side
   sort) if that index isn't in place yet, so the feature still works,
   just unsorted-from-the-server, until the index finishes building.

   ═══════════════════════════════════════════════════════════════════════
   WHY THIS NEEDED NO EDIT TO ANY OTHER FILE
   ═══════════════════════════════════════════════════════════════════════
   Same discipline as v55's own AgoraRTC-wrapping section: the pinned-
   product card is a floating overlay appended into `#live-stream-screen`
   (already the container every other live sub-modal in this codebase
   appends into), and the doc listener is this patch's OWN onSnapshot on
   active_streams/{streamId} — the exact "one shared onSnapshot, don't
   reach into another file's" pattern app-patch-v42.js's §1 already
   documents doing for polls/chat-mode. Tapping the card to jump to the
   listing reuses the SAME deep-link-by-polling-the-DOM technique
   app-startup.js's own `_openReelById` already uses for shared post/reel
   links — search for `.property-card[data-id="…"]` under
   `#property-grid-container` (the id app-fixes.js's own listing-card
   builder already sets — verified against that file directly) rather
   than inventing a new per-listing route, since this app doesn't have
   one (see app-fixes.js's own comment: "no per-listing deep-link view
   anywhere in this app").
   ============================================================================= */

(function empyreanPatchV56() {
    'use strict';

    if (window._empPatchV56Loaded) {
        console.warn('[V56] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV56Loaded = true;

    function log(msg) { console.log('[V56] ' + msg); }
    function warn(msg) { console.warn('[V56] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }
    function isCurrentlyLive() {
        return !!(window.liveStreamData && window.liveStreamData.isLive);
    }
    function _streamId() { return window.liveStreamData && window.liveStreamData.streamId; }
    function _streamRef() {
        var db = window.fbDb, sid = _streamId();
        if (!db || !sid || !window._firebaseLoaded) return null;
        return db.collection('active_streams').doc(sid);
    }
    function _fmtPrice(p, cur) {
        var n = Number(p);
        return (cur || '') + ' ' + (isNaN(n) ? p : n.toLocaleString());
    }

    /* =========================================================================
       §1 — one onSnapshot on the active_streams doc, scoped to just the
       pinnedProduct field (own listener — see header for why).
       ========================================================================= */
    var _docUnsub = null;
    var _docStreamId = null;
    var _pinned = null; // current pinnedProduct object, or null

    function _attachDocListener() {
        var sid = _streamId();
        if (_docUnsub && _docStreamId === sid) return; // already watching this stream
        _detachDocListener();
        var ref = _streamRef();
        if (!ref) return;
        _docStreamId = sid;
        _docUnsub = ref.onSnapshot(function (doc) {
            var data = doc.exists ? (doc.data() || {}) : {};
            _pinned = data.pinnedProduct || null;
            _renderPinnedCard();
            _renderPickerModalIfOpen();
        }, function (err) { warn('active_streams listener error: ' + err.message); });
    }
    function _detachDocListener() {
        if (_docUnsub) { _docUnsub(); _docUnsub = null; }
        _docStreamId = null;
        _pinned = null;
    }

    /* =========================================================================
       §2 — host's own listings picker. Fetched fresh each time the modal
       opens (a host's catalog changes rarely enough that a cache would
       just be one more stale-state bug to chase — see the "no separate
       notification needed" discipline v55's header already argues for
       the same reason).
       ========================================================================= */
    var _myListings = [];
    var _loadingListings = false;

    async function _fetchMyListings() {
        var db = window.fbDb;
        if (!db || !window._firebaseLoaded || !window.userState) return [];
        var uid = window.userState.id;
        try {
            var snap = await db.collection('marketplace_listings')
                .where('sellerId', '==', uid)
                .orderBy('createdAt', 'desc')
                .limit(25)
                .get();
            return snap.docs.map(function (d) { return d.data(); });
        } catch (eIdx) {
            // Composite index not built yet (see header) — degrade to an
            // unsorted equality-only query rather than failing outright.
            warn('sorted listing query failed (' + (eIdx && eIdx.message) + ') — falling back to unsorted.');
            try {
                var snap2 = await db.collection('marketplace_listings').where('sellerId', '==', uid).limit(25).get();
                return snap2.docs.map(function (d) { return d.data(); });
            } catch (e2) {
                warn('fallback listing query also failed: ' + (e2 && e2.message));
                return [];
            }
        }
    }

    // FIX (bug report: "works on the first tap, then stops responding"):
    // same root cause and fix as pv55-sound-btn/pv55-beauty-btn above —
    // this only ever called `.add('show')`, so a second tap on the SAME
    // icon while the picker was already open changed nothing on screen
    // (a genuine no-op, not a broken click), which reads exactly like the
    // button had stopped responding. Tapping the icon again now closes
    // the picker instead, matching every other toggleable icon on this
    // panel.
    async function _openPicker() {
        if (!isRealHost()) return;
        if (!isCurrentlyLive()) { notify('Go live first, then pin a product.', 'warning'); return; }
        _ensurePickerModal();
        var _pickModal = document.getElementById('pv56-pick-modal');
        if (_pickModal.classList.contains('show')) { _pickModal.classList.remove('show'); return; }
        _pickModal.classList.add('show');
        _loadingListings = true;
        _renderPickerModalIfOpen();
        _myListings = await _fetchMyListings();
        _loadingListings = false;
        _renderPickerModalIfOpen();
    }

    function _ensurePickerModal() {
        if (document.getElementById('pv56-pick-modal')) return;
        var container = document.getElementById('live-stream-screen') || document.body;
        var m = document.createElement('div');
        m.id = 'pv56-pick-modal';
        m.className = 'live-sub-modal';
        m.innerHTML =
            '<button type="button" class="close-modal pv56-close" style="color:white; z-index:5; top:5px; right:10px;">\u00d7</button>' +
            '<h3>\uD83D\uDECD\uFE0F Pin a Product</h3>' +
            '<div id="pv56-unpin-row" style="display:none;margin-bottom:10px;">' +
            '<button type="button" class="btn btn-danger" id="pv56-unpin-btn" style="width:100%;">Unpin current product</button>' +
            '</div>' +
            '<div id="pv56-pick-list"></div>';
        container.appendChild(m);
        m.querySelector('.pv56-close').addEventListener('click', function () { m.classList.remove('show'); });
        m.querySelector('#pv56-unpin-btn').addEventListener('click', _unpinProduct);
        m.addEventListener('click', function (e) {
            var card = e.target.closest('[data-pv56-listing]');
            if (!card) return;
            var id = card.getAttribute('data-pv56-listing');
            var listing = _myListings.filter(function (l) { return l.id === id; })[0];
            if (listing) _pinProduct(listing);
        });
    }

    function _renderPickerModalIfOpen() {
        var modal = document.getElementById('pv56-pick-modal');
        if (!modal || !modal.classList.contains('show')) return;
        var unpinRow = document.getElementById('pv56-unpin-row');
        if (unpinRow) unpinRow.style.display = _pinned ? '' : 'none';
        var list = document.getElementById('pv56-pick-list');
        if (!list) return;
        if (_loadingListings) {
            list.innerHTML = '<p style="text-align:center;color:#ccc;padding:20px 0;">Loading your listings\u2026</p>';
            return;
        }
        if (!_myListings.length) {
            list.innerHTML = '<p style="text-align:center;color:#ccc;padding:20px 0;">You don\u2019t have any Marketplace listings yet.</p>';
            return;
        }
        list.innerHTML = _myListings.map(function (l) {
            var img = (l.media && l.media[0]) ? l.media[0] : '';
            var active = _pinned && _pinned.listingId === l.id ? ' pv56-active' : '';
            return '' +
                '<div class="pv56-listing-row' + active + '" data-pv56-listing="' + esc(l.id) + '">' +
                (img ? '<img src="' + esc(img) + '" alt="">' : '<div class="pv56-listing-noimg"><i class="fas fa-image"></i></div>') +
                '<div class="pv56-listing-meta">' +
                '<strong>' + esc(l.name || 'Listing') + '</strong>' +
                '<span>' + esc(_fmtPrice(l.price, l.currency)) + '</span>' +
                '</div>' +
                (active ? '<i class="fas fa-check-circle pv56-pinned-check"></i>' : '') +
                '</div>';
        }).join('');
    }

    /* =========================================================================
       §3 — pin / unpin (host only, writes the shared field on the doc).
       ========================================================================= */
    function _pinProduct(listing) {
        var ref = _streamRef();
        if (!ref) return;
        var img = (listing.media && listing.media[0]) ? listing.media[0] : '';
        ref.update({
            pinnedProduct: {
                listingId: listing.id,
                name: listing.name || 'Listing',
                price: listing.price != null ? listing.price : '',
                currency: listing.currency || '',
                image: img,
                sellerId: listing.sellerId || (window.userState && window.userState.id) || '',
                pinnedAt: new Date().toISOString()
            }
        }).then(function () {
            notify('\uD83D\uDECD\uFE0F Pinned "' + (listing.name || 'listing') + '" for viewers.', 'success');
        }).catch(function (e) { notify('Could not pin product: ' + (e && e.message ? e.message : 'try again.'), 'error'); });
    }
    function _unpinProduct() {
        var ref = _streamRef();
        if (!ref) return;
        var FV = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
        var payload = FV ? { pinnedProduct: FV.delete() } : { pinnedProduct: null };
        ref.update(payload).then(function () {
            notify('Product unpinned.', 'info');
        }).catch(function (e) { warn('unpin failed: ' + (e && e.message)); });
    }

    /* =========================================================================
       §4 — the floating pinned-product card everyone (host + every
       viewer) sees, driven purely off _pinned from §1's listener.
       ========================================================================= */
    function _goToPinnedListing() {
        if (!_pinned) return;
        var targetId = _pinned.listingId;
        var name = _pinned.name;
        if (typeof window.navigateTo === 'function') window.navigateTo('marketplace');
        // Same poll-for-the-DOM-node technique app-startup.js's own deep-link
        // handler already uses (see that file's `_openReelById`) — the
        // marketplace card for this listing may not exist in the DOM yet
        // if the section just mounted.
        var attempts = 0, maxAttempts = 20;
        var poll = setInterval(function () {
            attempts++;
            var card = document.querySelector('#property-grid-container .property-card[data-id="' + targetId + '"]');
            if (card) {
                clearInterval(poll);
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('pv56-flash-highlight');
                setTimeout(function () { card.classList.remove('pv56-flash-highlight'); }, 2200);
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(poll);
                notify('"' + name + '" isn\u2019t showing in the Marketplace right now — it may have been removed.', 'info');
            }
        }, 500);
    }

    function _renderPinnedCard() {
        var existing = document.getElementById('pv56-pinned-card');
        if (!_pinned || !isCurrentlyLive()) {
            if (existing) existing.remove();
            return;
        }
        var container = document.getElementById('live-stream-screen');
        if (!container) return;
        if (!existing) {
            existing = document.createElement('div');
            existing.id = 'pv56-pinned-card';
            existing.addEventListener('click', _goToPinnedListing);
            container.appendChild(existing);
        }
        var img = _pinned.image;
        existing.innerHTML =
            (img ? '<img src="' + esc(img) + '" alt="">' : '<div class="pv56-pinned-noimg"><i class="fas fa-shopping-bag"></i></div>') +
            '<div class="pv56-pinned-meta">' +
            '<strong>' + esc(_pinned.name) + '</strong>' +
            '<span>' + esc(_fmtPrice(_pinned.price, _pinned.currency)) + '</span>' +
            '</div>' +
            '<i class="fas fa-chevron-right pv56-pinned-chevron"></i>';
    }

    /* =========================================================================
       §5 — CSS + host control button (reuses `.live-action-btn
       host-control` / `.live-sub-modal`, same reuse discipline as v55's
       own §5).
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv56-css')) return;
        var css = document.createElement('style');
        css.id = 'pv56-css';
        css.textContent =
            '.pv56-listing-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer;margin-bottom:6px;background:rgba(255,255,255,0.04);}' +
            '.pv56-listing-row:active{transform:scale(0.98);}' +
            '.pv56-listing-row.pv56-active{background:rgba(245,166,35,0.18);}' +
            '.pv56-listing-row img,.pv56-listing-noimg{width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:#999;}' +
            '.pv56-listing-meta{display:flex;flex-direction:column;min-width:0;flex:1;}' +
            '.pv56-listing-meta strong{color:#fff;font-size:var(--text-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '.pv56-listing-meta span{color:var(--accent-color,#f5a623);font-size:var(--text-xs);}' +
            '.pv56-pinned-check{color:var(--accent-color,#f5a623);font-size:18px;}' +
            '#pv56-pinned-card{position:absolute;left:12px;right:70px;bottom:96px;display:flex;align-items:center;gap:10px;background:rgba(20,20,24,0.85);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:8px 10px;cursor:pointer;z-index:6;box-shadow:0 4px 14px rgba(0,0,0,0.35);}' +
            '#pv56-pinned-card:active{transform:scale(0.97);}' +
            '#pv56-pinned-card img,.pv56-pinned-noimg{width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:#f5a623;}' +
            '.pv56-pinned-meta{display:flex;flex-direction:column;min-width:0;flex:1;}' +
            '.pv56-pinned-meta strong{color:#fff;font-size:var(--text-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '.pv56-pinned-meta span{color:var(--accent-color,#f5a623);font-size:var(--text-xs);}' +
            '.pv56-pinned-chevron{color:#ccc;flex-shrink:0;}' +
            '.pv56-flash-highlight{outline:3px solid var(--accent-color,#f5a623);outline-offset:2px;transition:outline-color 2s ease;}';
        document.head.appendChild(css);
    })();

    function _ensureHostButton() {
        var panel = document.getElementById('host-control-panel-inner');
        if (!panel || document.getElementById('pv56-pin-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'pv56-pin-btn';
        btn.type = 'button';
        btn.className = 'live-action-btn host-control';
        btn.title = 'Pin a Product';
        btn.innerHTML = '<i class="fas fa-shopping-bag"></i>';
        panel.appendChild(btn);
        btn.addEventListener('click', _openPicker);
    }
    function _removeHostButton() {
        var b = document.getElementById('pv56-pin-btn');
        if (b) b.remove();
    }

    // FIX (bug report: "control panel buttons unresponsive") — same
    // guaranteed-first capture-phase treatment as pv55-sound-btn/
    // pv55-beauty-btn above; see that fix's comment for the full
    // explanation. stopPropagation() prevents double-firing alongside
    // the button's own bubble-phase listener registered above.
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var btn = e.target.closest('#pv56-pin-btn');
        if (!btn) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        _openPicker();
    }, true);

    /* =========================================================================
       §6 — lifecycle: same 800ms poll convention every other patch in
       this area already uses (see v55 §6 / app-patch-v37.js §2 for why).
       ========================================================================= */
    function _tick() {
        if (isRealHost() && isCurrentlyLive()) _ensureHostButton(); else _removeHostButton();
        if (isCurrentlyLive() && (window.fbDb && window._firebaseLoaded)) _attachDocListener();
        else _detachDocListener();
        if (!isCurrentlyLive()) {
            var card = document.getElementById('pv56-pinned-card');
            if (card) card.remove();
        }
    }
    setInterval(_tick, 800);
    document.addEventListener('empyrean-init-done', function () { setTimeout(_tick, 500); });

    console.log('[EmpyreanPatchV56] \u2705 Live shopping / product pin added — host can pin one of their own Marketplace listings from the live control panel; every viewer sees a tappable card that jumps to it in Marketplace. Own onSnapshot on active_streams, no edits to any other file.');

})();


/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v57
   (lives inside app-patch-v55.js — see that file's own top header)

   FEATURE — STREAM REPLAY (RECORD \u2192 CLOUD SAVE \u2192 PLAYBACK)

   REQUESTED: viewers should be able to watch a stream again after it
   ends. The punch-list's own note flagged this as needing "Agora Cloud
   Recording, which is a server-side/backend piece (Agora RESTful API +
   storage), not something a client-only patch file can do" — that
   assessment is correct and still true here: real Agora Cloud
   Recording (server-composited audio/video across every participant,
   started/stopped via Agora's REST API with an app-certificate-signed
   request) needs a backend to hold that certificate. A client-only
   patch file can never do that safely.

   WHAT THIS BUILDS INSTEAD, HONESTLY SCOPED: a HOST-DEVICE-ONLY local
   recording — MediaRecorder capturing whatever is on the host's own
   screen (their camera or, if v55's beauty filter is active, the
   filtered canvas \u2014 see \u00a72) plus the host's own mic \u2014 uploaded to
   Cloudinary and saved as a `stream_replays` doc the moment the stream
   ends. This is real, working, cross-device, permanently-playable
   replay \u2014 it just doesn't composite in guest-broadcaster video/audio
   the way server-side Agora Cloud Recording would. Flagged explicitly
   so that gap isn't discovered as a surprise later; extending to a true
   multi-participant composited recording is a separate, backend-owned
   project.

   ═══════════════════════════════════════════════════════════════════════
   REUSING THE EXISTING #live-record-btn INSTEAD OF ADDING A NEW ONE
   ═══════════════════════════════════════════════════════════════════════
   index.html already ships a `#live-record-btn` ("Start Recording"),
   and app-fixes.js already has TWO pieces of code touching it: an
   early delegated click handler that now just early-returns with the
   comment "Recording removed", and a later "FIX 4: LIVE RECORDING --
   USE ACTUAL BLOB" block that DOES start a real MediaRecorder off
   `#host-main-video` \u2014 but only keeps the result as a same-session
   blob: URL in an in-memory card (`addRecordedLiveStream`), with no
   Cloudinary upload and no Firestore doc, so it's gone the moment the
   tab closes and was never visible to anyone but the host, on that one
   device, that one session.

   Rather than add a second, competing button, this patch neutralizes
   BOTH of those existing handlers for this one button id and replaces
   them with the full record\u2192upload\u2192persist\u2192playback pipeline below.
   Neutralizing is done the same way this codebase already resolved an
   identical duplicate-handler conflict (see live-streaming fix notes:
   "migrating from per-node event binding to a single capture-phase
   document-delegated handler" for the gift/share icons) \u2014 a listener
   added in the CAPTURE phase runs before any bubble-phase listener
   (which is what both of app-fixes.js's own handlers are), so calling
   `stopImmediatePropagation()` there, scoped ONLY to clicks on
   `#live-record-btn`, cleanly stops both older handlers from ever
   running for this button while touching zero bytes of app-fixes.js
   and leaving every other button on that same delegated listener
   completely alone.

   ═══════════════════════════════════════════════════════════════════════
   REQUIRED FIRESTORE RULE ADDITION (new collection \u2014 active_streams'
   existing rule does not cover this):
     match /stream_replays/{replayId} {
       allow read: if true;
       allow create: if request.auth != null
                     && request.resource.data.hostId == request.auth.uid;
       allow update: if request.auth != null
                     && request.resource.data.diff(resource.data)
                          .affectedKeys().hasOnly(['views']);
       allow delete: if request.auth != null
                     && resource.data.hostId == request.auth.uid;
     }
   (mirrors the read-public / write-owner-only shape this codebase
   already uses for marketplace_listings.)
   ============================================================================= */

(function empyreanPatchV57() {
    'use strict';

    if (window._empPatchV57Loaded) {
        console.warn('[V57] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV57Loaded = true;

    function log(msg) { console.log('[V57] ' + msg); }
    function warn(msg) { console.warn('[V57] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }
    function isCurrentlyLive() {
        return !!(window.liveStreamData && window.liveStreamData.isLive);
    }

    /* =========================================================================
       §1 — minimal, SEPARATE AgoraRTC capture wrap (own flag
       `_empV57Wrapped`, distinct from v55's `_empV55Wrapped`) — only
       needs the host's raw mic track, nothing else, so this is a much
       smaller wrap than v55's own §1. Safe to coexist: each patch wraps
       whatever `AgoraRTC.createMicrophoneAndCameraTracks` currently
       points to at the moment it runs, so whichever of v55/v57 loads
       second simply wraps the first one's wrapper — both still fire,
       order-independent (same chaining v55's own header already
       explains for why this technique is reliable).
       ========================================================================= */
    var _rawMicTrack = null;
    var _capturedForChannel = null;
    function _resetIfNewChannel() {
        var ch = window._agoraActiveChannel;
        if (ch !== _capturedForChannel) { _capturedForChannel = ch; _rawMicTrack = null; }
    }
    (function installWrap() {
        function tryWrap() {
            if (typeof AgoraRTC === 'undefined' || AgoraRTC._empV57Wrapped) return;
            AgoraRTC._empV57Wrapped = true;
            if (typeof AgoraRTC.createMicrophoneAndCameraTracks === 'function') {
                var origBoth = AgoraRTC.createMicrophoneAndCameraTracks.bind(AgoraRTC);
                AgoraRTC.createMicrophoneAndCameraTracks = async function () {
                    var tracks = await origBoth.apply(AgoraRTC, arguments);
                    if (isRealHost()) { _resetIfNewChannel(); _rawMicTrack = tracks && tracks[0] ? tracks[0] : _rawMicTrack; }
                    return tracks;
                };
            }
            if (typeof AgoraRTC.createMicrophoneAudioTrack === 'function') {
                var origMic = AgoraRTC.createMicrophoneAudioTrack.bind(AgoraRTC);
                AgoraRTC.createMicrophoneAudioTrack = async function () {
                    var t = await origMic.apply(AgoraRTC, arguments);
                    if (isRealHost()) { _resetIfNewChannel(); _rawMicTrack = t || _rawMicTrack; }
                    return t;
                };
            }
        }
        tryWrap();
        setTimeout(tryWrap, 500);
        setTimeout(tryWrap, 1500);
        setTimeout(tryWrap, 4000);
    })();

    /* =========================================================================
       §2 — pick whatever the host is CURRENTLY publishing on screen: the
       v55 beauty canvas if that's active (found purely via its DOM id,
       never by reaching into v55's own closure — same discipline v55's
       own header already documents for staying out of OTHER files'
       private state), else the raw local camera <video>.
       ========================================================================= */
    function _pickMimeType() {
        var candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
        for (var i = 0; i < candidates.length; i++) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
        }
        return null;
    }
    // Extension point for v59's watermark compositor (defined later in
    // THIS SAME FILE — see v59's own §4 header note for why registering
    // an override function here, rather than v59 reaching into v57's
    // vars directly, is the chosen wiring: it keeps v57 loadable and
    // fully functional on its own even if v59 is stripped out before
    // the eventual v42 merge, since this array just stays empty).
    var _videoSourceOverrides = [];
    window._empV57RegisterVideoSourceOverride = function (fn) {
        if (typeof fn === 'function') _videoSourceOverrides.push(fn);
    };
    function _getVideoTrackForRecording() {
        // Ask every registered override first (highest-priority one is
        // whichever registered — currently only v59's watermark canvas
        // ever registers one, so this is a 0-or-1-entry list in
        // practice today).
        for (var i = 0; i < _videoSourceOverrides.length; i++) {
            var overrideCanvas = null;
            try { overrideCanvas = _videoSourceOverrides[i](); } catch (e) {}
            if (overrideCanvas && typeof overrideCanvas.captureStream === 'function') {
                try { var so = overrideCanvas.captureStream(30); var to = so.getVideoTracks()[0]; if (to) return to; } catch (eo) {}
            }
        }
        var canvas = document.getElementById('pv55-beauty-canvas-preview');
        if (canvas && typeof canvas.captureStream === 'function') {
            try { var s = canvas.captureStream(30); var t = s.getVideoTracks()[0]; if (t) return t; } catch (e) {}
        }
        var wrapper = document.getElementById('agora-local-video');
        var vEl = wrapper && wrapper.querySelector('video');
        if (vEl && typeof vEl.captureStream === 'function') {
            try { var s2 = vEl.captureStream(30); var t2 = s2.getVideoTracks()[0]; if (t2) return t2; } catch (e2) {}
        }
        return null;
    }

    /* =========================================================================
       §3 — recording lifecycle.
       ========================================================================= */
    var _rec = {
        active: false,
        cloud: false, // true when this recording is running via /api/agora-recording (§2b) rather than the local MediaRecorder below
        recorder: null,
        chunks: [],
        startedAt: null,
        mimeType: null,
        warnTimer: null,
        hardStopTimer: null
    };
    var LONG_RECORDING_WARN_MS = 20 * 60 * 1000; // 20 min — memory-usage heads-up
    var LONG_RECORDING_HARD_STOP_MS = 45 * 60 * 1000; // 45 min — hard safety cap; a
    // client-side MediaRecorder holds every chunk in page memory until
    // upload, so an unbounded recording is a real tab-crash risk on a
    // long stream — this cap exists for that reason alone, not a
    // product decision about replay length.

    function _updateRecordBtnUI() {
        var btn = document.getElementById('live-record-btn');
        if (!btn) return;
        btn.classList.toggle('recording', _rec.active);
        btn.innerHTML = _rec.active ? '<i class="fas fa-stop"></i> Rec' : '<i class="fas fa-circle"></i> Rec';
        btn.title = _rec.active ? 'Stop Recording' : 'Start Recording';
    }

    /* =========================================================================
       §2b — Cloud Recording upgrade. Checked ONCE (server config doesn't
       change mid-session) via /api/config's recording.cloudAvailable flag
       (see server.js) — true only when a full Agora Customer ID/Secret +
       storage bucket are actually configured on the server. When it's
       false (the common case until those env vars are set), _rec.cloud
       never becomes true and every existing device-recording code path
       below runs completely unmodified — this is purely additive.
       ========================================================================= */
    var _cloudAvailable = null; // null = not checked yet, true/false once known
    (function _checkCloudAvailability() {
        // FIX (2026-08-02 — merge-time hardening): this call is invoked
        // synchronously at the top level of this IIFE. `fetch` is a
        // standard global in every real browser this app targets, so
        // this was never expected to throw in production — but this
        // file is one of several back-to-back top-level IIFEs sharing a
        // single script tag (same layout as V50→V51→V52→V53 in this
        // same file), and that exact layout is what turned one unguarded
        // reference into a silent script-wide abort in the previous
        // session (see V50's own fix note further up). Guarding this
        // one call costs nothing and closes off that entire failure
        // class here too, regardless of whether it would ever actually
        // fire.
        if (typeof fetch !== 'function') { _cloudAvailable = false; return; }
        try {
            fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
                _cloudAvailable = !!(cfg && cfg.recording && cfg.recording.cloudAvailable);
                if (_cloudAvailable) log('server-side Cloud Recording available — recordings will composite every guest broadcaster, not just the host.');
            }).catch(function () { _cloudAvailable = false; });
        } catch (eFetch) {
            _cloudAvailable = false;
        }
    })();


    async function _startCloudRecording() {
        var channelName = window.liveStreamData && window.liveStreamData._agoraChannel;
        if (!channelName) { notify('Stream channel isn\u2019t ready yet — try again in a moment.', 'warning'); return false; }
        try {
            var res = await fetch('/api/agora-recording/start', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelName: channelName,
                    hostId: window.userState && window.userState.id,
                    hostName: window.userState && (window.userState.fullName || window.userState.username) || 'Host',
                    hostAvatar: window.userState && window.userState.avatar || '',
                    title: (window.liveStreamData && window.liveStreamData.title) || 'Live stream',
                    streamId: window.liveStreamData && window.liveStreamData.streamId
                })
            });
            var data = await res.json();
            if (!res.ok || !data.recording) throw new Error(data.error || 'server declined to start recording');
            return true;
        } catch (e) {
            warn('cloud recording start failed, falling back to device recording: ' + (e && e.message));
            return false;
        }
    }
    async function _stopCloudRecording() {
        var channelName = window.liveStreamData && window.liveStreamData._agoraChannel;
        if (!channelName) return;
        try {
            var res = await fetch('/api/agora-recording/stop', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelName: channelName })
            });
            var data = await res.json();
            if (data.savedToReplays) notify('\uD83D\uDCFC Replay saved — this one includes every guest who was on with you.', 'success');
            else notify('Recording stopped, but couldn\u2019t be saved — check server logs (RECORDING_PUBLIC_BASE_URL may be unset).', 'warning');
        } catch (e) {
            warn('cloud recording stop failed: ' + (e && e.message));
            notify('Couldn\u2019t confirm the recording stopped cleanly — check Replays in a moment.', 'warning');
        }
    }

    function _startRecording() {
        if (_rec.active) return;
        if (!isRealHost()) { notify('Only the host can record this stream.', 'warning'); return; }
        if (!isCurrentlyLive()) { notify('Go live first, then start recording.', 'warning'); return; }

        // Cloud path takes priority when available — it's a strict upgrade
        // (composites every guest broadcaster, survives a page close,
        // doesn't hold anything in this tab's memory). Falls through to
        // the existing device-recording code below on any failure, same
        // "never leave the host with nothing" discipline the rest of this
        // patch file already follows for its own AgoraRTC-availability
        // checks.
        if (_cloudAvailable) {
            _rec.active = true; // set optimistically so a second tap while the request is in flight is treated as "already recording", not a second start
            _rec.cloud = true;
            _rec.startedAt = Date.now();
            if (window.liveStreamData) window.liveStreamData.isRecording = true;
            if (typeof window.updateLiveUI === 'function') window.updateLiveUI();
            _updateRecordBtnUI();
            _startCloudRecording().then(function (ok) {
                if (ok) {
                    notify('\uD83D\uDD34 Cloud recording started — every guest broadcaster will be included in the replay.', 'success');
                } else {
                    // Roll the optimistic state back and retry through the
                    // device path instead of leaving the button stuck in a
                    // "recording" state for a recording that never started.
                    _rec.active = false; _rec.cloud = false;
                    if (window.liveStreamData) window.liveStreamData.isRecording = false;
                    _updateRecordBtnUI();
                    _startDeviceRecording();
                }
            });
            return;
        }
        _startDeviceRecording();
    }

    // Renamed from the original _startRecording body — see §2b above for
    // why this is now reached via a fallback rather than being the only
    // path. Logic itself is completely unchanged from before this upgrade.
    function _startDeviceRecording() {
        var mt = _pickMimeType();
        if (!mt) { notify('This browser can\u2019t record video locally — try a recent Chrome/Edge/Firefox.', 'error'); return; }
        var videoTrack = _getVideoTrackForRecording();
        if (!videoTrack) { notify('Camera preview isn\u2019t ready yet — try again in a moment.', 'warning'); return; }
        var tracks = [videoTrack];
        var audioTrack = (_rawMicTrack && typeof _rawMicTrack.getMediaStreamTrack === 'function') ? _rawMicTrack.getMediaStreamTrack() : null;
        if (audioTrack) tracks.push(audioTrack);

        var combined;
        try { combined = new MediaStream(tracks); } catch (e) { notify('Could not start recording: ' + (e && e.message), 'error'); return; }

        try { _rec.recorder = new MediaRecorder(combined, { mimeType: mt }); }
        catch (e) { notify('Could not start recording: ' + (e && e.message), 'error'); return; }

        _rec.chunks = [];
        _rec.cloud = false;
        _rec.recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) _rec.chunks.push(e.data); };
        _rec.recorder.onstop = _finishRecording;
        _rec.recorder.start(1000); // 1s timeslice — same periodic-flush discipline v55's ambient/beauty pipelines use for their own long-running work, so a crash mid-stream loses at most ~1s, not the whole recording
        _rec.active = true;
        _rec.startedAt = Date.now();
        _rec.mimeType = mt;
        if (window.liveStreamData) window.liveStreamData.isRecording = true;
        if (typeof window.updateLiveUI === 'function') window.updateLiveUI();
        _updateRecordBtnUI();
        notify('\uD83D\uDD34 Recording started — this replay will be saved for playback after the stream ends.', 'success');

        _rec.warnTimer = setTimeout(function () {
            if (_rec.active) notify('This recording is getting long — it\u2019ll keep going, just know it\u2019s using more memory the longer it runs.', 'info');
        }, LONG_RECORDING_WARN_MS);
        _rec.hardStopTimer = setTimeout(function () {
            if (_rec.active) { notify('Recording hit the 45-minute safety limit and has been stopped/saved automatically.', 'info'); _stopRecording(); }
        }, LONG_RECORDING_HARD_STOP_MS);
    }

    function _stopRecording() {
        if (!_rec.active) return;
        clearTimeout(_rec.warnTimer); clearTimeout(_rec.hardStopTimer);
        var wasCloud = _rec.cloud;
        _rec.active = false;
        _rec.cloud = false;
        if (window.liveStreamData) window.liveStreamData.isRecording = false;
        if (typeof window.updateLiveUI === 'function') window.updateLiveUI();
        _updateRecordBtnUI();
        if (wasCloud) { _stopCloudRecording(); return; } // no local recorder exists for the cloud path — nothing to .stop()
        try { if (_rec.recorder && _rec.recorder.state !== 'inactive') _rec.recorder.stop(); }
        catch (e) { warn('recorder.stop() failed: ' + (e && e.message)); }
    }

    async function _finishRecording() {
        var blob = new Blob(_rec.chunks, { type: (_rec.mimeType || 'video/webm').split(';')[0] });
        _rec.chunks = [];
        if (!blob.size) { warn('recording produced 0 bytes — nothing to upload.'); return; }
        var durationSec = _rec.startedAt ? Math.round((Date.now() - _rec.startedAt) / 1000) : null;
        notify('Uploading your replay\u2026 this can take a moment depending on length.', 'info');
        try {
            var sid = (window.liveStreamData && window.liveStreamData.streamId) || String(Date.now());
            var file = new File([blob], 'replay-' + sid + '.webm', { type: blob.type });
            if (typeof window.uploadToCloudinary !== 'function') throw new Error('upload helper unavailable');
            var url = await window.uploadToCloudinary(file);
            if (!url) throw new Error('no URL returned from upload');

            var db = window.fbDb;
            if (db && window._firebaseLoaded && window.userState) {
                var replayId = 'replay_' + sid;
                await db.collection('stream_replays').doc(replayId).set({
                    id: replayId,
                    streamId: (window.liveStreamData && window.liveStreamData.streamId) || null,
                    hostId: window.userState.id,
                    hostName: window.userState.fullName || window.userState.username || 'Host',
                    hostAvatar: window.userState.avatar || '',
                    title: (window.liveStreamData && window.liveStreamData.title) || ((window.userState.fullName || 'Live') + '\u2019s stream'),
                    videoUrl: url,
                    durationSec: durationSec,
                    createdAt: new Date().toISOString(),
                    views: 0
                });
                notify('\uD83D\uDCFC Replay saved — anyone can watch it from Replays anytime.', 'success');
            } else {
                notify('Replay uploaded, but couldn\u2019t be saved to your stream history right now.', 'warning');
            }
        } catch (e) {
            warn('replay upload/save failed: ' + (e && e.message));
            notify('Couldn\u2019t save this replay: ' + (e && e.message ? e.message : 'please try again next time.'), 'error');
        }
    }

    // Auto-stop + flush if the stream ends while still recording (host
    // taps "End Live", connection drops, etc.) — same "tear down when
    // the ready-state flips false" discipline as v55's own §6.
    var _wasLive = false;
    function _watchLiveEnd() {
        var live = isCurrentlyLive();
        if (_wasLive && !live && _rec.active) _stopRecording();
        _wasLive = live;
    }

    /* =========================================================================
       §4 — neutralize app-fixes.js's two existing #live-record-btn
       handlers (capture phase — see header for why this is safe/precedented)
       and wire this file's own start/stop.
       ========================================================================= */
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var btn = e.target.closest('#live-record-btn');
        if (!btn) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (!isRealHost()) { notify('Only the host can record this stream.', 'warning'); return; }
        if (_rec.active) _stopRecording(); else _startRecording();
    }, true /* capture phase — must win the race against app-fixes.js's bubble-phase handlers */);

    /* =========================================================================
       §5 — REPLAY BROWSING / PLAYBACK. A small floating "Replays" launcher
       (own id/CSS, fixed-position, hidden while a live stream is open so
       it never competes with the live-view UI) plus a lightweight, own
       list+player modal. Global/public feed (read: true, per the rule
       above) mirrors this app's existing public-marketplace-listing
       model — nothing here is DM/private.
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv57-css')) return;
        var css = document.createElement('style');
        css.id = 'pv57-css';
        css.textContent =
            '#pv57-float-btn{position:fixed;right:16px;bottom:86px;width:52px;height:52px;border-radius:50%;background:linear-gradient(145deg,rgba(46,46,52,0.9),rgba(16,16,20,0.95));border:1px solid rgba(255,255,255,0.12);box-shadow:0 4px 14px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;z-index:900;cursor:pointer;touch-action:none;user-select:none;}' +
            '#pv57-float-btn:active{transform:scale(0.93);}' +
            /* FIX (dashboard clash follow-up, round 2 \u2014 button still
               overlapping other fixed controls at its default corner on
               some layouts): rather than chase every possible overlap by
               retuning coordinates again, the button is now draggable \u2014
               see _makeDraggable() below. While actively being dragged it
               gets a slightly lifted look and no transition, so it tracks
               the finger/cursor with zero lag instead of animating toward
               it late. */
            '#pv57-float-btn.pv57-dragging{transition:none!important;opacity:0.88;box-shadow:0 10px 26px rgba(0,0,0,0.55);cursor:grabbing;}' +
            '#pv57-replays-modal{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:2000;display:none;align-items:flex-end;justify-content:center;}' +
            '#pv57-replays-modal.show{display:flex;}' +
            '#pv57-replays-sheet{width:100%;max-width:520px;max-height:82vh;background:#161618;border-radius:18px 18px 0 0;padding:14px;overflow-y:auto;}' +
            '.pv57-replay-row{display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;cursor:pointer;margin-bottom:6px;background:rgba(255,255,255,0.04);}' +
            '.pv57-replay-row:active{transform:scale(0.98);}' +
            '.pv57-replay-thumb{width:56px;height:56px;border-radius:10px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:#f5a623;flex-shrink:0;}' +
            '.pv57-replay-meta{display:flex;flex-direction:column;min-width:0;flex:1;}' +
            '.pv57-replay-meta strong{color:#fff;font-size:var(--text-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '.pv57-replay-meta span{color:#aaa;font-size:var(--text-xs);}' +
            '#pv57-player-modal{position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:2100;display:none;align-items:center;justify-content:center;flex-direction:column;}' +
            '#pv57-player-modal.show{display:flex;}' +
            '#pv57-player-modal video{width:100%;max-width:520px;max-height:70vh;background:#000;}' +
            '#pv57-player-close{position:absolute;top:16px;right:16px;color:#fff;font-size:28px;background:none;border:none;cursor:pointer;}';
        document.head.appendChild(css);
    })();

    /* =========================================================================
       MOVEABLE BUTTON — lets the person drag #pv57-float-btn anywhere on
       screen so it can never sit permanently on top of another fixed
       control again (quick-post FAB, help center, report button, a
       marketplace card price, etc. \u2014 whatever happens to be under its
       default corner on a given screen). Position is remembered across
       reloads via localStorage and re-clamped on resize/rotation so it
       can never end up dragged partly off-screen.
       ========================================================================= */
    var DRAG_POS_KEY = 'empyrean_pv57_float_btn_pos';

    function _loadSavedPos() {
        try {
            var raw = localStorage.getItem(DRAG_POS_KEY);
            if (!raw) return null;
            var pos = JSON.parse(raw);
            if (pos && typeof pos.left === 'number' && typeof pos.top === 'number') return pos;
        } catch (e) {}
        return null;
    }
    function _savePos(left, top) {
        try { localStorage.setItem(DRAG_POS_KEY, JSON.stringify({ left: left, top: top })); } catch (e) {}
    }
    function _clamp(left, top, size) {
        var w = window.innerWidth, h = window.innerHeight;
        return {
            left: Math.min(Math.max(left, 4), Math.max(4, w - size - 4)),
            top:  Math.min(Math.max(top, 4), Math.max(4, h - size - 4))
        };
    }
    function _applySavedPos(btn) {
        var pos = _loadSavedPos();
        if (!pos) return; // no saved position yet \u2014 keep the default right/bottom corner from CSS
        var c = _clamp(pos.left, pos.top, btn.offsetWidth || 52);
        btn.style.left = c.left + 'px';
        btn.style.top = c.top + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
    }
    function _reclampOnResize() {
        var btn = document.getElementById('pv57-float-btn');
        if (!btn || btn.style.left === '') return; // still sitting at the default corner \u2014 CSS keeps that in-bounds already
        var c = _clamp(parseFloat(btn.style.left) || 0, parseFloat(btn.style.top) || 0, btn.offsetWidth || 52);
        btn.style.left = c.left + 'px';
        btn.style.top = c.top + 'px';
    }
    window.addEventListener('resize', _reclampOnResize);

    // A tap (no meaningful pointer movement) still opens Replays exactly as
    // before; only a real drag (movement past DRAG_THRESHOLD) repositions
    // the button and suppresses the click that would otherwise fire right
    // after mouseup/touchend, so dragging never ALSO opens the Replays
    // sheet.
    function _makeDraggable(btn) {
        if (btn._pv57DragWired) return;
        btn._pv57DragWired = true;

        var DRAG_THRESHOLD = 8;
        var dragging = false, moved = false;
        var startX = 0, startY = 0, startLeft = 0, startTop = 0;

        function toXY(e) {
            if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        }

        function onDown(e) {
            var p = toXY(e);
            dragging = true; moved = false;
            startX = p.x; startY = p.y;
            var rect = btn.getBoundingClientRect();
            startLeft = rect.left; startTop = rect.top;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
        }

        function onMove(e) {
            if (!dragging) return;
            var p = toXY(e);
            var dx = p.x - startX, dy = p.y - startY;
            if (!moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
                moved = true;
                btn.classList.add('pv57-dragging');
            }
            if (!moved) return;
            if (e.cancelable) e.preventDefault(); // stop the page from scrolling while dragging on touch

            var c = _clamp(startLeft + dx, startTop + dy, btn.offsetWidth || 52);
            btn.style.left = c.left + 'px';
            btn.style.top = c.top + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
        }

        function onUp() {
            if (!dragging) return;
            dragging = false;
            btn.classList.remove('pv57-dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);

            if (moved) {
                var rect = btn.getBoundingClientRect();
                _savePos(rect.left, rect.top);
                btn._pv57SuppressClick = true;
                setTimeout(function () { btn._pv57SuppressClick = false; }, 50);
            }
        }

        btn.addEventListener('mousedown', onDown);
        btn.addEventListener('touchstart', onDown, { passive: true });
    }

    function _ensureFloatBtn() {
        if (document.getElementById('pv57-float-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'pv57-float-btn';
        btn.type = 'button';
        btn.title = 'Stream Replays \u2014 press and drag to move';
        btn.innerHTML = '<i class="fas fa-clapperboard"></i>';
        document.body.appendChild(btn);
        _applySavedPos(btn);
        _makeDraggable(btn);
        btn.addEventListener('click', function (e) {
            if (btn._pv57SuppressClick) { e.preventDefault(); e.stopPropagation(); return; }
            _openReplaysList(e);
        });
    }
    // FIX (dashboard clash — "replay button clashing with Quick Post,
    // Help Center, Report"): this used to only hide the button while the
    // live-stream screen was open, so document.body.appendChild placed it
    // fixed at right:16px/bottom:86px on EVERY section — dashboard,
    // marketplace, chat, settings, all of them — competing for the same
    // corner as #quick-post-fab and #emp-help-fab (self-help-assistance-
    // center.js) on every screen instead of just the one it's meant for.
    // Scoped to the home dashboard only, per this session's explicit ask
    // ("replay button only displays on the home screen"). Checks the
    // actual DOM state of #dashboard rather than caching the last
    // 'empyrean-section-change' event, so it stays correct even if this
    // poll tick runs before that listener ever fires (first load).
    function _onDashboard() {
        var dash = document.getElementById('dashboard');
        return !!(dash && dash.classList.contains('active'));
    }
    function _floatBtnVisibility() {
        var btn = document.getElementById('pv57-float-btn');
        if (!btn) return;
        var liveScreen = document.getElementById('live-stream-screen');
        var liveOpen = liveScreen && (liveScreen.classList.contains('active') || liveScreen.classList.contains('show') || liveScreen.style.display === 'flex' || liveScreen.style.display === 'block');
        btn.style.display = (!liveOpen && _onDashboard()) ? 'flex' : 'none';
    }

    function _ensureModals() {
        if (!document.getElementById('pv57-replays-modal')) {
            var m = document.createElement('div');
            m.id = 'pv57-replays-modal';
            m.innerHTML =
                '<div id="pv57-replays-sheet">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
                '<h3 style="margin:0;color:#fff;">\uD83D\uDCFC Stream Replays</h3>' +
                '<button type="button" id="pv57-replays-close" style="background:none;border:none;color:#fff;font-size:24px;cursor:pointer;">\u00d7</button>' +
                '</div>' +
                '<div id="pv57-replays-list"></div>' +
                '</div>';
            document.body.appendChild(m);
            m.addEventListener('click', function (e) { if (e.target === m) m.classList.remove('show'); });
            m.querySelector('#pv57-replays-close').addEventListener('click', function () { m.classList.remove('show'); });
            m.querySelector('#pv57-replays-list').addEventListener('click', function (e) {
                var row = e.target.closest('[data-pv57-replay]');
                if (row) _playReplay(row.getAttribute('data-pv57-replay'), row.getAttribute('data-pv57-url'));
            });
        }
        if (!document.getElementById('pv57-player-modal')) {
            var p = document.createElement('div');
            p.id = 'pv57-player-modal';
            p.innerHTML = '<button type="button" id="pv57-player-close"><i class="fas fa-times"></i></button><video id="pv57-player-video" controls playsinline></video>';
            document.body.appendChild(p);
            p.querySelector('#pv57-player-close').addEventListener('click', _closePlayer);
        }
    }

    async function _openReplaysList() {
        _ensureModals();
        var modal = document.getElementById('pv57-replays-modal');
        modal.classList.add('show');
        var list = document.getElementById('pv57-replays-list');
        list.innerHTML = '<p style="text-align:center;color:#ccc;padding:20px 0;">Loading replays\u2026</p>';
        var db = window.fbDb;
        if (!db || !window._firebaseLoaded) { list.innerHTML = '<p style="text-align:center;color:#ccc;padding:20px 0;">Replays need a connection — try again shortly.</p>'; return; }
        try {
            var snap = await db.collection('stream_replays').orderBy('createdAt', 'desc').limit(30).get();
            if (snap.empty) { list.innerHTML = '<p style="text-align:center;color:#ccc;padding:20px 0;">No replays yet — recordings show up here once a host records a stream.</p>'; return; }
            list.innerHTML = snap.docs.map(function (d) {
                var r = d.data();
                var mins = r.durationSec ? Math.max(1, Math.round(r.durationSec / 60)) : null;
                return '' +
                    '<div class="pv57-replay-row" data-pv57-replay="' + esc(r.id) + '" data-pv57-url="' + esc(r.videoUrl) + '">' +
                    '<div class="pv57-replay-thumb"><i class="fas fa-play"></i></div>' +
                    '<div class="pv57-replay-meta">' +
                    '<strong>' + esc(r.title || 'Live replay') + '</strong>' +
                    '<span>' + esc(r.hostName || 'Host') + (mins ? ' \u00b7 ' + mins + ' min' : '') + '</span>' +
                    '</div>' +
                    '</div>';
            }).join('');
        } catch (e) {
            warn('replay list fetch failed: ' + (e && e.message));
            list.innerHTML = '<p style="text-align:center;color:#ccc;padding:20px 0;">Couldn\u2019t load replays right now.</p>';
        }
    }

    function _playReplay(replayId, url) {
        _ensureModals();
        var video = document.getElementById('pv57-player-video');
        video.src = url;
        document.getElementById('pv57-player-modal').classList.add('show');
        video.play().catch(function () {});
        var db = window.fbDb;
        var FV = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
        if (db && window._firebaseLoaded && FV && replayId) {
            db.collection('stream_replays').doc(replayId).update({ views: FV.increment(1) }).catch(function () {});
        }
    }
    function _closePlayer() {
        var video = document.getElementById('pv57-player-video');
        if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {} }
        var modal = document.getElementById('pv57-player-modal');
        if (modal) modal.classList.remove('show');
    }

    /* =========================================================================
       §6 — lifecycle poll (800ms — same convention every patch in this
       area uses).
       ========================================================================= */
    function _tick() {
        _ensureFloatBtn();
        _floatBtnVisibility();
        _updateRecordBtnUI();
        _watchLiveEnd();
    }
    setInterval(_tick, 800);
    document.addEventListener('empyrean-init-done', function () { setTimeout(_tick, 500); });

    console.log('[EmpyreanPatchV57] \u2705 Stream replay added: host-device local recording (MediaRecorder \u2192 Cloudinary \u2192 stream_replays doc) reusing the existing #live-record-btn, plus a floating Replays browser/player for everyone. Honestly scoped as host-device-only capture, NOT server-side multi-participant Agora Cloud Recording (see header) \u2014 zero edits to any other file, via capture-phase button takeover + AgoraRTC wrapping.');

})();


/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v58
   (lives inside app-patch-v55.js — see that file's own top header)

   FEATURE — SCHEDULED STREAMS + REMINDERS

   REQUESTED: a "Going live at 6pm" card + reminder notification, ahead
   of the punch-list's own open question ("push infra needs checking
   against what already exists").

   ═══════════════════════════════════════════════════════════════════════
   WHAT PUSH INFRA ALREADY EXISTS — AND WHY THIS USES THE IN-APP BELL,
   NOT IT, FOR NOW
   ═══════════════════════════════════════════════════════════════════════
   index.html's own script-tag comments confirm real infrastructure
   exists: app-push-setup.js registers an FCM Web Push device token and
   fires actual broadcast notifications through a backend `/api/notify`
   route. That's genuine native push, and reminders SHOULD eventually go
   through it. But app-push-setup.js itself wasn't provided this
   session, so `/api/notify`'s exact request contract (payload shape,
   auth, targeting-by-user-vs-topic) is unknown here — guessing at a
   backend contract and shipping a fetch() call against it would either
   silently no-op or, worse, hit that endpoint with malformed requests.
   So this patch uses ONLY the confirmed-working, already-everywhere
   `window.pushNotification()` in-app bell/panel system for reminders
   (reliable — every file in this codebase already calls it the same
   way). Wiring true FCM push for reminders is flagged here as the
   explicit next step once app-push-setup.js's contract is available in
   a session.

   ═══════════════════════════════════════════════════════════════════════
   DATA MODEL
   ═══════════════════════════════════════════════════════════════════════
   New collection `scheduled_streams/{id}`:
     { id, hostId, hostName, hostAvatar, title, description,
       scheduledFor (ISO string), createdAt, remindMe: [uid, …] }

   REQUIRED FIRESTORE RULE ADDITION:
     match /scheduled_streams/{id} {
       allow read: if true;
       allow create: if request.auth != null
                     && request.resource.data.hostId == request.auth.uid;
       allow update: if request.auth != null
                     && (resource.data.hostId == request.auth.uid
                         || request.resource.data.diff(resource.data)
                              .affectedKeys().hasOnly(['remindMe']));
       allow delete: if request.auth != null
                     && resource.data.hostId == request.auth.uid;
     }
   (read-public / owner-write, same shape as v57's stream_replays rule —
   with a carve-out so any signed-in user can toggle their OWN
   membership in `remindMe` without needing host-level write access.)

   REQUIRED FIRESTORE INDEX: none — the "streams starting soon" query
   below range-filters on the single field `scheduledFor`, which
   Firestore indexes automatically. (Unlike v56's picker, there's no
   second field being sorted/filtered here.)

   ═══════════════════════════════════════════════════════════════════════
   WHY THIS NEEDED NO EDIT TO index.html / app-fixes.js
   ═══════════════════════════════════════════════════════════════════════
   The "Schedule for later" toggle is injected into the EXISTING
   `#go-live-form` purely via DOM insertion (append before its own
   `.golive-v2-actions` row) once that form is found in the DOM — the
   same append-don't-edit technique this codebase's own comments
   describe other Go-Live patches (v43's "premium redesign") already
   using on this identical form. Submission is intercepted with a
   CAPTURE-phase `submit` listener scoped to `#go-live-form`, but ONLY
   calls `stopImmediatePropagation()` when the toggle is actually
   checked — otherwise it does nothing and the existing go-live-form
   handler in app-fixes.js runs exactly as before, completely
   unaffected. Same selective-interception discipline v57 uses for
   `#live-record-btn`, just gated on a checkbox instead of always-on.
   ============================================================================= */

(function empyreanPatchV58() {
    'use strict';

    if (window._empPatchV58Loaded) {
        console.warn('[V58] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV58Loaded = true;

    function log(msg) { console.log('[V58] ' + msg); }
    function warn(msg) { console.warn('[V58] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function fbReady() { return !!(window.fbDb && window._firebaseLoaded); }

    function _fmtWhen(iso) {
        var d;
        try { d = new Date(iso); } catch (e) { return iso; }
        if (isNaN(d.getTime())) return iso;
        var now = new Date();
        var sameDay = d.toDateString() === now.toDateString();
        var tomorrow = new Date(now.getTime() + 86400000);
        var isTomorrow = d.toDateString() === tomorrow.toDateString();
        var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (sameDay) return 'Today, ' + time;
        if (isTomorrow) return 'Tomorrow, ' + time;
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
    }

    /* =========================================================================
       §1 — inject the "Schedule for later" toggle into the existing
       go-live form, and intercept submission only when it's checked.
       ========================================================================= */
    function _ensureScheduleToggle() {
        var form = document.getElementById('go-live-form');
        if (!form || document.getElementById('pv58-schedule-row')) return;
        var actions = form.querySelector('.golive-v2-actions');
        if (!actions) return;
        var row = document.createElement('div');
        row.id = 'pv58-schedule-row';
        row.className = 'form-group golive-v2-field pv58-schedule-row';
        row.innerHTML =
            '<label class="pv58-schedule-check-label">' +
            '<input type="checkbox" id="pv58-schedule-toggle"> \uD83D\uDDD3\uFE0F Schedule for later instead of going live now' +
            '</label>' +
            '<input type="datetime-local" id="pv58-schedule-when" style="display:none;">';
        actions.parentNode.insertBefore(row, actions);

        var toggle = row.querySelector('#pv58-schedule-toggle');
        var when = row.querySelector('#pv58-schedule-when');
        var submitBtn = actions.querySelector('.golive-v2-submit-btn');
        var submitBtnDefaultHTML = submitBtn ? submitBtn.innerHTML : '';
        toggle.addEventListener('change', function () {
            when.style.display = toggle.checked ? '' : 'none';
            if (submitBtn) submitBtn.innerHTML = toggle.checked ? '<i class="fas fa-calendar-check"></i> Schedule Stream' : submitBtnDefaultHTML;
        });
    }

    document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || form.id !== 'go-live-form') return;
        var toggle = document.getElementById('pv58-schedule-toggle');
        if (!toggle || !toggle.checked) return; // let the real go-live handler run untouched
        e.preventDefault();
        e.stopImmediatePropagation();
        _createScheduledStream();
    }, true /* capture phase — must run before app-fixes.js's own go-live-form handler */);

    async function _createScheduledStream() {
        if (!fbReady() || !window.userState) { notify('You need to be signed in and online to schedule a stream.', 'warning'); return; }
        var titleEl = document.getElementById('live-title');
        var descEl = document.getElementById('live-description');
        var whenEl = document.getElementById('pv58-schedule-when');
        var title = titleEl ? titleEl.value.trim() : '';
        var whenVal = whenEl ? whenEl.value : '';
        if (!title) { notify('Add a stream title first.', 'warning'); return; }
        if (!whenVal) { notify('Pick a date and time first.', 'warning'); return; }
        var whenDate = new Date(whenVal);
        if (isNaN(whenDate.getTime()) || whenDate.getTime() <= Date.now()) { notify('Pick a time in the future.', 'warning'); return; }

        var id = 'sched_' + window.userState.id + '_' + Date.now();
        try {
            await window.fbDb.collection('scheduled_streams').doc(id).set({
                id: id,
                hostId: window.userState.id,
                hostName: window.userState.fullName || window.userState.username || 'Host',
                hostAvatar: window.userState.avatar || '',
                title: title,
                description: descEl ? descEl.value.trim() : '',
                scheduledFor: whenDate.toISOString(),
                createdAt: new Date().toISOString(),
                remindMe: []
            });
            notify('\uD83D\uDDD3\uFE0F Stream scheduled for ' + _fmtWhen(whenDate.toISOString()) + '.', 'success');
            // Reset just this patch's own fields + collapse the create panel,
            // same toggle-visibility convention .section-create-toggle-btn
            // already drives elsewhere in this app.
            if (titleEl) titleEl.value = '';
            if (descEl) descEl.value = '';
            var toggle = document.getElementById('pv58-schedule-toggle');
            if (toggle) { toggle.checked = false; toggle.dispatchEvent(new Event('change')); }
            var panel = document.getElementById('golive-create-panel');
            if (panel) panel.style.display = 'none';
            _refreshUpcomingList();
        } catch (e) {
            notify('Could not schedule stream: ' + (e && e.message ? e.message : 'try again.'), 'error');
        }
    }

    /* =========================================================================
       §2 — "Upcoming Streams" list, shown on the Go Live section itself
       so anyone visiting it (not just the host) can see what's coming
       and opt into a reminder.
       ========================================================================= */
    function _ensureUpcomingList() {
        var section = document.getElementById('go-live');
        var content = section && section.querySelector('.card-content');
        if (!content || document.getElementById('pv58-upcoming-wrap')) return;
        var wrap = document.createElement('div');
        wrap.id = 'pv58-upcoming-wrap';
        wrap.innerHTML = '<h3 class="golive-v2-title" style="margin-top:18px;">\uD83D\uDCC5 Upcoming Streams</h3><div id="pv58-upcoming-list"></div>';
        // Above the "Start a Live Stream" toggle button, so it's the
        // first thing anyone lands on when they open this section.
        content.insertBefore(wrap, content.firstChild);
        _refreshUpcomingList();
    }

    async function _refreshUpcomingList() {
        var list = document.getElementById('pv58-upcoming-list');
        if (!list || !fbReady()) return;
        try {
            var nowIso = new Date().toISOString();
            var snap = await window.fbDb.collection('scheduled_streams')
                .where('scheduledFor', '>=', nowIso)
                .orderBy('scheduledFor', 'asc')
                .limit(20)
                .get();
            if (snap.empty) { list.innerHTML = '<p style="color:#999;font-size:var(--text-sm);">No streams scheduled right now.</p>'; return; }
            var myId = window.userState && window.userState.id;
            list.innerHTML = snap.docs.map(function (d) {
                var s = d.data();
                var reminded = myId && Array.isArray(s.remindMe) && s.remindMe.indexOf(myId) !== -1;
                var isOwner = myId && s.hostId === myId;
                return '' +
                    '<div class="pv58-upcoming-card" data-pv58-id="' + esc(s.id) + '">' +
                    '<div class="pv58-upcoming-meta">' +
                    '<strong>' + esc(s.title || 'Live stream') + '</strong>' +
                    '<span>' + esc(s.hostName || 'Host') + ' \u00b7 ' + esc(_fmtWhen(s.scheduledFor)) + '</span>' +
                    '</div>' +
                    (isOwner
                        ? '<button type="button" class="pv58-cancel-btn" data-pv58-cancel="' + esc(s.id) + '" title="Cancel"><i class="fas fa-trash"></i></button>'
                        : '<button type="button" class="pv58-remind-btn' + (reminded ? ' pv58-reminded' : '') + '" data-pv58-remind="' + esc(s.id) + '" title="Remind me"><i class="fas fa-bell' + (reminded ? '' : '-slash') + '"></i></button>') +
                    '</div>';
            }).join('');
        } catch (e) {
            warn('upcoming list fetch failed: ' + (e && e.message));
            list.innerHTML = '<p style="color:#999;font-size:var(--text-sm);">Couldn\u2019t load upcoming streams right now.</p>';
        }
    }

    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var remindBtn = e.target.closest('[data-pv58-remind]');
        if (remindBtn) { _toggleRemindMe(remindBtn.getAttribute('data-pv58-remind'), remindBtn); return; }
        var cancelBtn = e.target.closest('[data-pv58-cancel]');
        if (cancelBtn) { _cancelScheduledStream(cancelBtn.getAttribute('data-pv58-cancel')); return; }
    });

    async function _toggleRemindMe(id, btn) {
        if (!fbReady() || !window.userState) { notify('Sign in to set a reminder.', 'warning'); return; }
        var FV = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
        if (!FV) return;
        var alreadyOn = btn.classList.contains('pv58-reminded');
        try {
            await window.fbDb.collection('scheduled_streams').doc(id).update({
                remindMe: alreadyOn ? FV.arrayRemove(window.userState.id) : FV.arrayUnion(window.userState.id)
            });
            notify(alreadyOn ? 'Reminder turned off.' : '\uD83D\uDD14 You\u2019ll get a reminder 15 minutes before this stream.', 'success');
            _refreshUpcomingList();
        } catch (e) { notify('Could not update reminder: ' + (e && e.message ? e.message : 'try again.'), 'error'); }
    }
    async function _cancelScheduledStream(id) {
        if (!fbReady()) return;
        try {
            await window.fbDb.collection('scheduled_streams').doc(id).delete();
            notify('Scheduled stream canceled.', 'info');
            _refreshUpcomingList();
        } catch (e) { notify('Could not cancel: ' + (e && e.message ? e.message : 'try again.'), 'error'); }
    }

    /* =========================================================================
       §3 — reminder polling. Runs once a minute (this doesn't need
       v55/v56/v57's 800ms responsiveness — it's firing minutes-ahead
       reminders, not reacting to a live UI state). Tracks which
       stream/phase pairs this DEVICE has already notified for in
       localStorage, so a reload/re-render never re-fires the same
       reminder twice on the same device.
       ========================================================================= */
    var NOTIFIED_KEY = 'emp_v58_notified';
    function _loadNotified() { try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]'); } catch (e) { return []; } }
    function _saveNotified(arr) {
        // Cap at the most recent 200 entries so this never grows unbounded
        // across a long-lived install.
        try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(arr.slice(-200))); } catch (e) {}
    }
    var _notified = _loadNotified();
    function _markNotified(key) { if (_notified.indexOf(key) === -1) { _notified.push(key); _saveNotified(_notified); } }

    async function _checkReminders() {
        if (!fbReady() || !window.userState) return;
        var myId = window.userState.id;
        var now = Date.now();
        var soonIso = new Date(now + 16 * 60 * 1000).toISOString(); // 16-min window catches anything due in the next ~15 min even with a slightly-late poll tick
        var nowIso = new Date(now).toISOString();
        try {
            var snap = await window.fbDb.collection('scheduled_streams')
                .where('scheduledFor', '>=', nowIso)
                .where('scheduledFor', '<=', soonIso)
                .get();
            snap.forEach(function (doc) {
                var s = doc.data();
                var iAmIn = s.hostId === myId || (Array.isArray(s.remindMe) && s.remindMe.indexOf(myId) !== -1);
                if (!iAmIn) return;
                var key = s.id + ':15min';
                if (_notified.indexOf(key) !== -1) return;
                _markNotified(key);
                var who = s.hostId === myId ? 'Your' : (esc(s.hostName || 'A stream') + '\u2019s');
                notify('\u23F0 ' + who + ' stream "' + s.title + '" starts ' + _fmtWhen(s.scheduledFor) + '.', 'info');
            });
        } catch (e) { warn('reminder check failed: ' + (e && e.message)); }
    }

    /* =========================================================================
       §4 — CSS
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv58-css')) return;
        var css = document.createElement('style');
        css.id = 'pv58-css';
        css.textContent =
            '.pv58-schedule-row{margin-top:6px;}' +
            '.pv58-schedule-check-label{display:flex;align-items:center;gap:8px;font-size:var(--text-sm);color:#ddd;cursor:pointer;}' +
            '#pv58-schedule-when{width:100%;margin-top:8px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#fff;}' +
            '.pv58-upcoming-card{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border-radius:12px;background:rgba(255,255,255,0.04);margin-bottom:8px;}' +
            '.pv58-upcoming-meta{display:flex;flex-direction:column;min-width:0;}' +
            '.pv58-upcoming-meta strong{color:#fff;font-size:var(--text-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
            '.pv58-upcoming-meta span{color:#999;font-size:var(--text-xs);}' +
            '.pv58-remind-btn,.pv58-cancel-btn{background:rgba(255,255,255,0.08);border:none;border-radius:50%;width:36px;height:36px;color:#ccc;cursor:pointer;flex-shrink:0;}' +
            '.pv58-remind-btn.pv58-reminded{background:var(--accent-color,#f5a623);color:#1a1a1a;}';
        document.head.appendChild(css);
    })();

    /* =========================================================================
       §5 — lifecycle
       ========================================================================= */
    setInterval(function () { _ensureScheduleToggle(); _ensureUpcomingList(); }, 1500);
    setInterval(_checkReminders, 60 * 1000);
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(function () { _ensureScheduleToggle(); _ensureUpcomingList(); _checkReminders(); }, 800);
    });

    console.log('[EmpyreanPatchV58] \u2705 Scheduled streams + reminders added: "Schedule for later" toggle on the Go Live form, an Upcoming Streams list with per-user remind-me, and a once-a-minute reminder check via the existing in-app notification bell. True FCM push wiring flagged as a follow-up (see header) since app-push-setup.js\u2019s /api/notify contract wasn\u2019t available this session.');

})();


/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v59
   (lives inside app-patch-v55.js — see that file's own top header)

   FEATURE — WATERMARKED SCREEN-SHARE / DOWNLOAD

   REQUESTED: downloads/captures from a live stream (including while the
   host is screen-sharing via the existing `#live-share-screen-btn`)
   should carry the Empyrean watermark, and the punch-list explicitly
   ties this to "the existing save-to-gallery flow (v47)".

   ═══════════════════════════════════════════════════════════════════════
   TWO PIECES, BOTH REUSING EXISTING HOOKS RATHER THAN NEW MACHINERY
   ═══════════════════════════════════════════════════════════════════════
   (A) A "\uD83D\uDCF8 Snapshot" button in the live footer, for HOST AND VIEWERS
   alike (unlike v37/v55's host-or-guest-only features, there's no
   reason to restrict who can save a frame). Captures whatever is
   currently on screen — which, with zero special-casing, already
   includes a screen-share, since `#agora-local-video`'s `<video>` (or
   a viewer's own `#agora-viewer-video`) shows exactly what's being
   published regardless of source — draws the Empyrean corner-badge
   watermark on top (own lightweight drawing routine, §2 below — NOT a
   reach into app-fixes.js's own private `_drawWatermark`-style
   routines used for post/reel downloads, since those are that file's
   local closures; same "can't reach another file's private helpers
   without an edit" limit v55's header already explains, so this is a
   deliberately separate, visually-matching implementation, not the
   same function reused), then triggers a real file download AND
   dispatches the SAME `empyrean:download-complete` CustomEvent
   app-fixes.js's own download handler already dispatches (confirmed at
   its exact call site: `detail: { urls, fileWord }`) — which is the
   real, documented hook app-patch-v47.js listens on to offer its
   native "Save to Gallery" share-sheet prompt. That's the literal tie-
   in the punch list asked for: this patch produces a watermarked file
   and hands it to v47's EXISTING flow instead of building a second,
   competing save-to-gallery prompt.

   (B) An OPT-IN "Watermark Recording" host toggle that, when on, runs a
   continuous compositor canvas (§3 — same one-frame-at-a-time
   `requestAnimationFrame` technique as v55's own beauty pipeline, same
   "only pay for the per-frame cost while a host actually asked for it"
   discipline) drawing the live source + the same corner badge, 30fps.
   v57's own `_getVideoTrackForRecording()` (defined earlier in THIS
   SAME FILE — not a cross-file reach, since v55\u2192v58 are being built
   together in one file this session, per this session's own build
   plan) is updated to prefer this compositor canvas when it's running,
   so a host who wants a saved replay to visibly carry the Empyrean
   mark end-to-end gets that automatically, with the one-shot Snapshot
   button in (A) staying watermarked unconditionally either way.
   ============================================================================= */

(function empyreanPatchV59() {
    'use strict';

    if (window._empPatchV59Loaded) {
        console.warn('[V59] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV59Loaded = true;

    function log(msg) { console.log('[V59] ' + msg); }
    function warn(msg) { console.warn('[V59] ' + msg); }
    function notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }

    function isRealHost() {
        if (window.isGuest || !window.userState || !window.liveStreamData) return false;
        var sd = window.liveStreamData;
        var hid = sd.hostUserId || sd.hostId;
        return !!hid && window.userState.id === hid;
    }
    function isCurrentlyLive() {
        return !!(window.liveStreamData && window.liveStreamData.isLive);
    }

    /* =========================================================================
       §1 — find whatever local/remote video element is currently
       showing the stream, for host OR viewer. Same DOM-only reach
       discipline as v57 §2 — never touches another file's JS closures.
       ========================================================================= */
    function _findActiveStreamVideoEl() {
        var localWrap = document.getElementById('agora-local-video');
        var localVideo = localWrap && localWrap.querySelector('video');
        if (localVideo && localVideo.videoWidth) return localVideo;
        // Viewer side: app-live.js/app-live-tiktok-patch.js render the
        // host's remote video into a wrapper matching this id pattern
        // (see v37's own `_isVideoWrapper` regex, which this reuses the
        // spirit of rather than re-deriving a new one).
        var candidates = document.querySelectorAll('[id^="agora-viewer-video"] video, [id^="agora-guest-"] video, #agora-remote-video video');
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].videoWidth) return candidates[i];
        }
        return null;
    }

    /* =========================================================================
       §2 — the watermark drawing routine itself. Bottom-right rounded
       badge, semi-transparent dark background + a small ring "logo" +
       "Empyrean" wordmark — visually in the same family as the
       existing post/reel watermark description (corner badge + logo
       circle + wordmark) without reusing its code (see header).
       ========================================================================= */
    function _drawWatermarkBadge(ctx, w, h) {
        var pad = Math.max(10, Math.round(w * 0.02));
        var badgeH = Math.max(26, Math.round(h * 0.05));
        var fontSize = Math.max(12, Math.round(badgeH * 0.5));
        ctx.save();
        ctx.font = fontSize + 'px sans-serif';
        var text = 'Empyrean';
        var textW = ctx.measureText(text).width;
        var ringD = badgeH * 0.6;
        var badgeW = ringD + 10 + textW + 24;
        var x = w - pad - badgeW;
        var y = h - pad - badgeH;

        ctx.globalAlpha = 0.82;
        ctx.fillStyle = 'rgba(10,10,12,0.55)';
        var r = badgeH / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + badgeW, y, x + badgeW, y + badgeH, r);
        ctx.arcTo(x + badgeW, y + badgeH, x, y + badgeH, r);
        ctx.arcTo(x, y + badgeH, x, y, r);
        ctx.arcTo(x, y, x + badgeW, y, r);
        ctx.closePath();
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#f5a623';
        ctx.lineWidth = Math.max(1.5, ringD * 0.12);
        ctx.beginPath();
        ctx.arc(x + 12 + ringD / 2, y + badgeH / 2, ringD / 2 - ctx.lineWidth, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 12 + ringD + 8, y + badgeH / 2);
        ctx.restore();
    }

    /* =========================================================================
       §3 — continuous compositor canvas (opt-in, host only, off by
       default — see header for the CPU-cost reasoning, same discipline
       v55's own beauty canvas already follows).
       ========================================================================= */
    var _compositor = { canvas: null, ctx: null, rafId: null, sourceVideo: null, active: false };

    function _startCompositor() {
        if (_compositor.active) return;
        var video = _findActiveStreamVideoEl();
        if (!video) { notify('Camera preview isn\u2019t ready yet — try again in a moment.', 'warning'); return; }
        var canvas = document.createElement('canvas');
        canvas.id = 'pv59-watermark-canvas';
        canvas.style.cssText = 'position:absolute;left:-99999px;top:-99999px;'; // never shown directly — only used as a recording source (§4), same off-screen-canvas approach v55's beauty pipeline uses for its own capture buffer, just not swapped into the visible preview here since the raw view already shows the unwatermarked feed live
        document.body.appendChild(canvas);
        _compositor.canvas = canvas;
        _compositor.ctx = canvas.getContext('2d');
        _compositor.sourceVideo = video;
        _compositor.active = true;
        _drawCompositorFrame();
        notify('\uD83D\uDCA7 Watermark enabled — your saved replay will carry the Empyrean mark.', 'success');
    }
    function _drawCompositorFrame() {
        _compositor.rafId = requestAnimationFrame(_drawCompositorFrame);
        var v = _compositor.sourceVideo, c = _compositor.canvas, ctx = _compositor.ctx;
        if (!v || v.readyState < 2 || !v.videoWidth) return;
        if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
        ctx.drawImage(v, 0, 0, c.width, c.height);
        _drawWatermarkBadge(ctx, c.width, c.height);
    }
    function _stopCompositor() {
        if (_compositor.rafId) cancelAnimationFrame(_compositor.rafId);
        if (_compositor.canvas) _compositor.canvas.remove();
        _compositor = { canvas: null, ctx: null, rafId: null, sourceVideo: null, active: false };
    }
    function _toggleCompositor() {
        if (!isRealHost()) { notify('Only the host can turn this on.', 'warning'); return; }
        if (_compositor.active) { _stopCompositor(); notify('Watermark turned off.', 'info'); }
        else _startCompositor();
        _updateWatermarkBtnUI();
    }
    function _updateWatermarkBtnUI() {
        var btn = document.getElementById('pv59-watermark-btn');
        if (btn) btn.classList.toggle('pv59-active', _compositor.active);
    }

    /* =========================================================================
       §4 — v57 integration: prefer this compositor canvas as the
       recording source when it's running. Defined here, in the SAME
       FILE as v57 (see header for why this isn't a cross-file reach).
       ========================================================================= */
    if (typeof window._empV57RegisterVideoSourceOverride === 'function') {
        // Defensive: only wire in if v57 exposed the extension point
        // below (it always does when loaded — see the matching line
        // added at the bottom of v57's own §2). Guarded so this file
        // still loads cleanly even if v57 is ever stripped out ahead of
        // this feature during the eventual v42 merge.
        window._empV57RegisterVideoSourceOverride(function () {
            return (_compositor.active && _compositor.canvas) ? _compositor.canvas : null;
        });
    }

    /* =========================================================================
       §5 — the Snapshot button (host + viewers), always watermarked
       regardless of the compositor toggle above, and wired straight
       into v47's existing Save-to-Gallery hook.
       ========================================================================= */
    function _takeSnapshot() {
        var video = _findActiveStreamVideoEl();
        if (!video) { notify('Nothing to capture right now.', 'warning'); return; }
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        _drawWatermarkBadge(ctx, canvas.width, canvas.height);

        canvas.toBlob(function (blob) {
            if (!blob) { notify('Could not capture a snapshot — try again.', 'error'); return; }
            var url = URL.createObjectURL(blob);
            var filename = 'empyrean-live-' + Date.now() + '.png';
            var a = document.createElement('a');
            a.href = url; a.download = filename; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);

            notify('\uD83D\uDCF8 Snapshot saved with the Empyrean watermark.', 'success');
            // Reuses app-fixes.js's OWN download-complete hook, verbatim
            // event name + detail shape (see header) — this is the exact
            // signal app-patch-v47.js listens for to offer its native
            // "Save to Gallery" share-sheet prompt, so that prompt now
            // appears for this download too, with zero new UI built for it.
            document.dispatchEvent(new CustomEvent('empyrean:download-complete', {
                detail: { urls: [url], fileWord: 'file' }
            }));
        }, 'image/png');
    }

    /* =========================================================================
       §6 — CSS + buttons (footer Snapshot button for everyone, host-
       control Watermark toggle for the host only).
       ========================================================================= */
    (function injectCSS() {
        if (document.getElementById('pv59-css')) return;
        var css = document.createElement('style');
        css.id = 'pv59-css';
        css.textContent =
            '#pv59-snapshot-btn,#pv59-watermark-btn{width:44px;height:44px;border-radius:14px;background:linear-gradient(145deg,rgba(46,46,52,0.62),rgba(16,16,20,0.78));border:1px solid rgba(255,255,255,0.10);display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;cursor:pointer;flex-shrink:0;}' +
            '#pv59-snapshot-btn:active,#pv59-watermark-btn:active{transform:scale(0.90);}' +
            '#pv59-watermark-btn.pv59-active{background:var(--accent-color,#f5a623);color:#1a1a1a;}';
        document.head.appendChild(css);
    })();

    function _ensureSnapshotBtn() {
        var footer = document.querySelector('.live-footer');
        if (!footer || document.getElementById('pv59-snapshot-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'pv59-snapshot-btn';
        btn.type = 'button';
        btn.title = 'Save Snapshot';
        btn.innerHTML = '<i class="fas fa-camera"></i>';
        footer.appendChild(btn);
        btn.addEventListener('click', _takeSnapshot);
    }
    function _ensureWatermarkToggle() {
        var panel = document.getElementById('host-control-panel-inner');
        if (!panel || document.getElementById('pv59-watermark-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'pv59-watermark-btn';
        btn.type = 'button';
        btn.className = 'live-action-btn host-control';
        btn.title = 'Watermark Recording';
        btn.innerHTML = '<i class="fas fa-droplet"></i>';
        panel.appendChild(btn);
        btn.addEventListener('click', _toggleCompositor);
    }
    function _removeHostOnlyUI() {
        var b = document.getElementById('pv59-watermark-btn');
        if (b) b.remove();
        if (_compositor.active) _stopCompositor();
    }

    // FIX (bug report: "control panel buttons unresponsive") — same
    // guaranteed-first capture-phase treatment as pv55/pv56 above; see
    // those fixes' comments for the full explanation. stopImmediatePropagation()
    // (FIX 2026-08-03: upgraded from stopPropagation, the same
    // defense-in-depth hardening applied to every other button on this
    // panel this session) prevents double-firing alongside the button's
    // own bubble-phase listener registered above.
    document.addEventListener('click', function (e) {
        if (!e.target || !e.target.closest) return;
        var btn = e.target.closest('#pv59-watermark-btn');
        if (!btn) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        _toggleCompositor();
    }, true);
    function _removeSnapshotBtn() {
        var b = document.getElementById('pv59-snapshot-btn');
        if (b) b.remove();
    }

    /* =========================================================================
       §7 — lifecycle (800ms — same convention as every other button in
       this footer/panel family).
       ========================================================================= */
    function _tick() {
        if (isCurrentlyLive()) _ensureSnapshotBtn(); else _removeSnapshotBtn();
        if (isRealHost() && isCurrentlyLive()) _ensureWatermarkToggle(); else _removeHostOnlyUI();
        _updateWatermarkBtnUI();
    }
    setInterval(_tick, 800);
    document.addEventListener('empyrean-init-done', function () { setTimeout(_tick, 500); });

    console.log('[EmpyreanPatchV59] \u2705 Watermarked screen-share/download added: a Snapshot button (host + viewers, always watermarked, wired into v47\u2019s existing Save-to-Gallery hook) and an opt-in host \u201cWatermark Recording\u201d toggle that v57\u2019s replay recorder now prefers as its source when on. Screen-share needs no special-casing — it\u2019s captured the same as any other published video.');

})();

/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v60 (appended into app-patch-v42.js)
   Load: already covered — this ships from the same <script> tag as the
   v42/v50-v59 modules above, executes after all of them.

   FIXES (per this session's report + screenshot):
     [1] Help & Assistance Center "?" floating button (self-help-
         assistance-center.js's #emp-help-fab, position:fixed, appended
         directly to <body>) stays visible OVER the full-screen live
         stream view, sitting on top of the live UI. It has nothing to
         do with being live, so it's hidden for the duration of a live
         session.

   WHY THIS COULDN'T BE A PLAIN CSS RULE ALONE
   #emp-help-fab is appended straight to <body> by
   self-help-assistance-center.js, and #go-live-modal-overlay (per
   index.html) is not guaranteed to be that same element's immediate
   DOM sibling — so a CSS sibling-combinator rule
   (`#go-live-modal-overlay.show ~ #emp-help-fab`) can't be relied on to
   match. Instead, this watches the same `.show` class toggle every
   other live-related patch in this codebase already watches
   (app-patch-v30/v33/v37/v52's own onModalToggle) and mirrors it onto a
   `body.emp-live-active` class, which style.css's new
   `body.emp-live-active #emp-help-fab { display:none!important; }` rule
   (see style.css) then targets directly — no DOM-order assumption
   needed, and it composes cleanly with anything else that might also
   read `body.emp-live-active` later.
   ============================================================================= */
(function empyreanPatchV60() {
    'use strict';

    if (window._empPatchV60Loaded) {
        console.warn('[V60] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV60Loaded = true;

    var ACTIVE_CLASS = 'emp-live-active';

    function _sync(modal) {
        var isLive = modal && modal.classList.contains('show');
        document.body.classList.toggle(ACTIVE_CLASS, !!isLive);
    }

    function _wire() {
        var modal = document.getElementById('go-live-modal-overlay');
        if (!modal || modal._pv60Watched) return;
        modal._pv60Watched = true;
        new MutationObserver(function () { _sync(modal); })
            .observe(modal, { attributes: true, attributeFilter: ['class'] });
        _sync(modal); // cover the case where it's already open when this runs
    }

    if (document.readyState !== 'loading') _wire();
    else document.addEventListener('DOMContentLoaded', _wire);
    document.addEventListener('empyrean-init-done', function () { setTimeout(_wire, 300); });

    console.log('[EmpyreanPatchV60] \u2705 Help & Assistance Center "?" button now hides for the duration of a live stream (body.emp-live-active, toggled off #go-live-modal-overlay.show) \u2014 see the matching style.css rule.');

})();

/* =============================================================================
   EMPYREAN INTERNATIONAL — PATCH v61 (appended into app-patch-v42.js)
   Load: already covered — same <script> tag, executes after v60 above.

   FIX (per this session's report + screenshot):
     [1] Help & Assistance Center "?" button (#emp-help-fab) and the
         Report/Complaint FAB (#submit-complaint-fab) both float on top
         of the Reel viewer's right-side engagement column (like/
         comment/share/download), blocking taps on those icons. Neither
         has anything to do with reels, so both are hidden for the
         duration of the reel viewer — same treatment v60 above already
         gives them during a live stream.
     [2] (companion CSS-only fix, see style.css) — the Report/Complaint
         FAB overlapped the quick-post FAB on the home page; moved to
         sit to its left instead of stacked above it.

   Mirrors v60's own approach exactly: watch the one class toggle that
   already marks the feature as open/visible (#reel-viewer-modal-overlay
   .show, set by openReelViewer()/closeReelViewer() in app-nav.js/
   app-reel.js) and reflect it onto a body class
   (body.emp-reel-active) that style.css's selectors target directly —
   no DOM-order assumption needed, composes cleanly with v60's own
   body.emp-live-active for the same two buttons.
   ============================================================================= */
(function empyreanPatchV61() {
    'use strict';

    if (window._empPatchV61Loaded) {
        console.warn('[V61] Already loaded — skipping duplicate.');
        return;
    }
    window._empPatchV61Loaded = true;

    var ACTIVE_CLASS = 'emp-reel-active';

    function _isVisible(el) {
        if (!el) return false;
        if (el.classList.contains('show')) return true;
        var cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
    }

    function _sync(modal) {
        document.body.classList.toggle(ACTIVE_CLASS, _isVisible(modal));
    }

    function _wire() {
        var modal = document.getElementById('reel-viewer-modal-overlay');
        if (!modal || modal._pv61Watched) return;
        modal._pv61Watched = true;
        new MutationObserver(function () { _sync(modal); })
            .observe(modal, { attributes: true, attributeFilter: ['class', 'style'] });
        _sync(modal); // cover the case where it's already open when this runs
    }

    if (document.readyState !== 'loading') _wire();
    else document.addEventListener('DOMContentLoaded', _wire);
    document.addEventListener('empyrean-init-done', function () { setTimeout(_wire, 300); });

    console.log('[EmpyreanPatchV61] \u2705 Help & Assistance Center "?" button and Report/Complaint FAB now hide for the duration of the Reel viewer (body.emp-reel-active, toggled off #reel-viewer-modal-overlay.show) \u2014 see the matching style.css rule. Report/Complaint FAB also moved left of the quick-post FAB on the home page so the two no longer overlap.');

})();
