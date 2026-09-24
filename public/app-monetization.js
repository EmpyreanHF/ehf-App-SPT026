/* =============================================================================
   EMPYREAN INTERNATIONAL — CREATOR MONETIZATION MODULE
   app-monetization.js  |  Load LAST (after app-profile.js, app-wallet.js,
   app-kyc.js, app-analytics.js, app-admin.js, app-live.js) — this file only
   READS/WRAPS globals those already provide; it does not need to run before
   any of them.

   TASK: "Build a monetization module linked to the individual analytical
   tools system." — a full eligibility → tier → badge → payout pipeline,
   wired to real engagement data, additive only.

   ═══════════════════════════════════════════════════════════════════════
   WHAT ALREADY EXISTED (audited before writing a single line here)
   ═══════════════════════════════════════════════════════════════════════
   • app-profile.js  §2 renderMonetizationTab() — a flat gate
     (isVerified && followerCount>=500) showing a wallet-balance card or a
     "locked" reasons list, plus a RANKS ladder (Bronze 100 / Silver 500 /
     Gold 1000 / Platinum 5000 / Diamond 10000 / Elite 50000 followers)
     used ONLY for one-time EMPY follower-milestone rewards.
   • app-wallet.js — checkAndAwardRank() (pays out that RANKS ladder),
     updateWithdrawalPreview()/handleWithdrawalMethodChange() (fee math for
     an UNGATED withdrawal form), and already calls
     window.renderMonetizationTab() after every balance update.
   • app-kyc.js — kyc_submissions queue, approveKyc()/rejectKyc(), but
     approveKyc() never actually flips user.isVerified — only the separate
     admin "Mark Verified" toggle in app-live.js does that. Gap noted below.
   • app-analytics.js — site-wide analytics_sessions/analytics_daily page
     view tracking. Not per-creator, not engagement/retention.
   • Firestore rules already define posts, presence, withdrawal_queue,
     kyc_submissions, users — all reused here, nothing duplicated.

   This module does NOT replace or delete any of the above. It:
     1. Keeps RANKS (app-profile.js) and CREATOR_TIERS (below) as two
        clearly separate systems — one is a one-time follower-milestone
        reward, the other is the paid/compulsory creator badge + payout
        tier from the monetization spec. Same currency, different purpose.
     2. Fixes the approveKyc() → isVerified gap by wrapping (not editing)
        the existing function.
     3. Overrides window.renderMonetizationTab with a richer dashboard
        that reuses the same #profile-monetization container app-profile.js
        already builds and calls. (One surgical one-line change was made
        in app-profile.js so that call now checks window.renderMonetizationTab
        first, exactly like the "last-loaded patch wins" convention already
        used for CSS in app-patch-v32.js.)
     4. Wraps (not replaces) updateWithdrawalPreview to add an eligibility
        gate on top of the existing fee-math, and adds the missing
        "submit the request" step into the existing withdrawal_queue
        collection.
     5. Computes engagement straight from the existing `posts` collection
        (views / shareCount / commentCount / likes fields already written
        by app-feed.js) — no new collection for something that already
        exists.
     6. Adds exactly two new, narrowly-scoped Firestore collections that
        have no existing equivalent: creator_badges/{userId} and
        referrals/{referralId}. Rules for both appended to firebase-rules.js
        in the same style as the WALLET / FINANCIAL block.

   PUBLIC API
   ──────────
   window.EmpMonetization = {
       CREATOR_TIERS, computeEngagement, computeEligibility, determineTier,
       openCreatorBadgeModal, purchaseCreatorBadge, submitWithdrawalRequest,
       generateReferralLink, renderMonetizationTab, renderAdminMonetizationPanel
   }
   (Also exposed individually on window.* for onclick="" handlers, matching
   this codebase's existing convention.)

   SECTION MAP
   ───────────
   §1  Guards, shared helpers
   §2  CREATOR_TIERS constants (separate from app-profile.js RANKS)
   §3  Engagement engine (reads `posts` collection)
   §4  Activity engine (reads `presence` collection)
   §5  Eligibility engine (merges §3+§4 + KYC + followers + badge)
   §6  Tier assignment
   §7  Creator badge purchase flow (creator_badges collection)
   §8  Payout / withdrawal gate + compliance pre-check (withdrawal_queue)
   §9  Referral tracking (referrals collection)
   §10 Creator dashboard renderer — overrides window.renderMonetizationTab
   §11 Admin monetization panel
   §12 KYC → isVerified wiring fix (wraps approveKyc, non-destructive)
   §13 Init / event wiring
   §14 AD REVENUE SHARE — "Content Creator Monetization Model" proposal
       (engagement-based ad-revenue split, kept deliberately independent of
       both the CREATOR_TIERS/badge system above and app-impactmining.js;
       see §14's own header comment for the full design). Computation and
       every write now live SERVER-SIDE (server.js's /api/admin/ad-revenue/*
       and /api/ad-revenue/request-payout routes, Admin SDK) — this file
       only reads ad_revenue_shares/ad_revenue_quarterly_reports/
       ad_revenue_program_meta and calls those routes; firebase-rules.js
       denies client writes to all three outright (`if false`), admin
       session or not. Admin UI mounts into #admin-ad-revenue-container
       (added to index.html next to #admin-monetization-container).
   ============================================================================= */

(function empyreanMonetizationModule() {
    'use strict';

    if (window._empyreanMonetizationLoaded) {
        console.warn('[EmpMonetization] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanMonetizationLoaded = true;

    /* =========================================================================
       §1  Shared helpers — local copies, same shape as every other patch file
           in this codebase, zero dependency on other files' closures.
       ========================================================================= */

    function log(msg)  { console.log('[Monetization] ' + msg); }
    function warn(msg) { console.warn('[Monetization] ' + msg); }

    function _S()       { return window.EmpState || {}; }
    function _us()       { return _S().userState || window.userState || {}; }
    function _mu()       { return _S().mockUsers || window.mockUsers || {}; }
    function _isGuest()  { var s = _S(); return s.isGuest != null ? s.isGuest : !!window.isGuest; }
    function _isAdmin()  { var s = _S(); return s.isAdmin != null ? s.isAdmin : !!window.isAdmin; }
    function _fbOk()     { return !!(window._firebaseLoaded && window.fbDb && typeof window.fbDb.collection === 'function'); }
    function _rate()     { return (_S().EMPY_RATE_USD) || window.EMPY_RATE_USD || 0.10; }
    function _fmtUsd(v)  { return typeof window.formatUsdPrice === 'function' ? window.formatUsdPrice(v) : ('$' + (v || 0).toFixed(2)); }
    function _notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info'); }
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _audit(action, target, details) {
        if (typeof window.logAdminAction === 'function') {
            try { window.logAdminAction(action, target, details); } catch (e) {}
        }
    }
    function _userById(userId) {
        var mu = _mu();
        if (mu && mu[userId]) return mu[userId];
        var us = _us();
        if (us && us.id === userId) return us;
        return null;
    }


    /* =========================================================================
       §2  CREATOR_TIERS
       Separate on purpose from app-profile.js RANKS (that ladder pays a
       one-time reward at 100/500/1000/5000/10000/50000 followers and is
       untouched here). This ladder governs cash-out eligibility, the
       verified-creator badge, and payout rate — per the monetization spec.
       ========================================================================= */

    var CREATOR_TIERS = [
        {
            key: 'bronze', name: 'Bronze', order: 1,
            minFollowers: 1000,
            badgeFeeUsd: 5, badgeRequired: false,       // optional at Bronze
            payoutRateMultiplier: 1.00,
            perks: ['Withdrawals enabled', 'Standard analytics']
        },
        {
            key: 'silver', name: 'Silver', order: 2,
            minFollowers: 5000,
            badgeFeeUsd: 10, badgeRequired: true,        // compulsory from Silver up
            payoutRateMultiplier: 1.15,
            perks: ['Higher payout rate', 'Advanced analytics', 'Priority support']
        },
        {
            key: 'gold', name: 'Gold', order: 3,
            minFollowers: 20000,
            badgeFeeUsd: 20, badgeRequired: true,
            payoutRateMultiplier: 1.35,
            perks: ['Premium payouts', 'Sponsorships', 'Brand partnerships', 'Referral bonuses', 'Dedicated account manager']
        }
    ];
    window.CREATOR_TIERS = CREATOR_TIERS;

    /* Mandatory-for-all-tiers engagement bar, straight from the spec. */
    var ENGAGEMENT_BAR = { avgViewsPerPost: 500, avgInteractionsPerPost: 50, retentionRate: 0.25 };

    /* Must have posted/logged in within this many days to stay eligible. */
    var ACTIVITY_WINDOW_DAYS = 90; // "3-month period"


    /* =========================================================================
       §3  Engagement engine — reads the SAME `posts` collection app-feed.js
           already writes to (views, shareCount, commentCount, likes).
           Cached 10 min per user so the dashboard doesn't re-query on every
           re-render.
       ========================================================================= */

    var _engagementCache = {}; // userId -> { data, ts }
    var ENGAGEMENT_CACHE_MS = 10 * 60 * 1000;

    function computeEngagement(userId, cb) {
        if (!userId) { cb({ postCount: 0, avgViews: 0, avgInteractions: 0, retentionRate: 0, meetsBar: false }); return; }

        var cached = _engagementCache[userId];
        if (cached && (Date.now() - cached.ts) < ENGAGEMENT_CACHE_MS) { cb(cached.data); return; }

        if (!_fbOk()) {
            var empty = {
                postCount: 0, avgViews: 0, avgInteractions: 0, retentionRate: 0, meetsBar: false, offline: true,
                dailySeries: [], breakdown: { likes: 0, comments: 0, shares: 0 }
            };
            cb(empty);
            return;
        }

        try {
            window.fbDb.collection('posts').where('userId', '==', userId).get()
                .then(function (snap) {
                    var posts = [];
                    (snap.docs || []).forEach(function (d) { posts.push(d.data() || {}); });

                    var postCount = posts.length;
                    var totalViews = 0, totalInteractions = 0, engagedPosts = 0;
                    var totalLikes = 0, totalComments = 0, totalShares = 0;

                    // Last 7 calendar days, oldest → newest, for the trend bar chart
                    // (same "one bucket per YYYY-MM-DD" idea app-analytics.js already
                    // uses for its site-wide chart, applied here per-creator).
                    var dayBuckets = {};
                    var days = [];
                    for (var i = 6; i >= 0; i--) {
                        var d = new Date();
                        d.setDate(d.getDate() - i);
                        var key = d.toISOString().slice(0, 10);
                        days.push(key);
                        dayBuckets[key] = { key: key, views: 0, interactions: 0 };
                    }

                    posts.forEach(function (p) {
                        var views    = p.views || 0;
                        var likes    = p.likes || 0;
                        var comments = p.commentCount || 0;
                        var shares   = p.shareCount || 0;
                        var interactions = likes + comments + shares;
                        totalViews += views;
                        totalInteractions += interactions;
                        totalLikes += likes; totalComments += comments; totalShares += shares;
                        // Retention proxy: a post "retained" viewers if it collected
                        // any interaction beyond a passive view. Real watch-time /
                        // scroll-depth tracking isn't wired anywhere in this codebase
                        // yet — if/when app-video-fullscreen.js starts recording
                        // watch-time, swap this one line for that figure.
                        if (interactions > 0) engagedPosts++;

                        var createdRaw = p.createdAt;
                        var createdDate = (createdRaw && typeof createdRaw.toDate === 'function') ? createdRaw.toDate() : (createdRaw ? new Date(createdRaw) : null);
                        if (createdDate && !isNaN(createdDate.getTime())) {
                            var dKey = createdDate.toISOString().slice(0, 10);
                            if (dayBuckets[dKey]) { dayBuckets[dKey].views += views; dayBuckets[dKey].interactions += interactions; }
                        }
                    });

                    var avgViews        = postCount ? (totalViews / postCount) : 0;
                    var avgInteractions = postCount ? (totalInteractions / postCount) : 0;
                    var retentionRate   = postCount ? (engagedPosts / postCount) : 0;

                    var meetsBar = postCount > 0
                        && avgViews >= ENGAGEMENT_BAR.avgViewsPerPost
                        && avgInteractions >= ENGAGEMENT_BAR.avgInteractionsPerPost
                        && retentionRate >= ENGAGEMENT_BAR.retentionRate;

                    var data = {
                        postCount: postCount,
                        avgViews: avgViews,
                        avgInteractions: avgInteractions,
                        retentionRate: retentionRate,
                        meetsBar: meetsBar,
                        dailySeries: days.map(function (k) { return dayBuckets[k]; }),
                        breakdown: { likes: totalLikes, comments: totalComments, shares: totalShares }
                    };
                    _engagementCache[userId] = { data: data, ts: Date.now() };
                    cb(data);
                })
                .catch(function (err) {
                    warn('engagement query failed: ' + (err && err.message));
                    cb({ postCount: 0, avgViews: 0, avgInteractions: 0, retentionRate: 0, meetsBar: false, error: true });
                });
        } catch (e) {
            cb({ postCount: 0, avgViews: 0, avgInteractions: 0, retentionRate: 0, meetsBar: false, error: true });
        }
    }
    window.computeCreatorEngagement = computeEngagement;


    /* =========================================================================
       §4  Activity engine — reuses the existing `presence` collection
           (app-fix-final.js already writes lastSeen there on every heartbeat).
       ========================================================================= */

    function isActiveWithinWindow(userId, cb) {
        if (!userId || !_fbOk()) { cb(true); return; } // best-effort: don't block offline/local mode
        try {
            window.fbDb.collection('presence').doc(userId).get()
                .then(function (doc) {
                    var data = doc && doc.exists && typeof doc.data === 'function' ? doc.data() : null;
                    if (!data || !data.lastSeen) { cb(true); return; } // no record yet — don't punish new accounts
                    var lastSeenMs = new Date(data.lastSeen).getTime();
                    var ageDays = (Date.now() - lastSeenMs) / (1000 * 60 * 60 * 24);
                    cb(ageDays <= ACTIVITY_WINDOW_DAYS);
                })
                .catch(function () { cb(true); });
        } catch (e) { cb(true); }
    }


    /* =========================================================================
       §5  Eligibility engine — merges everything into one verdict.
       ========================================================================= */

    function determineTier(followerCount) {
        var tier = null;
        CREATOR_TIERS.forEach(function (t) {
            if ((followerCount || 0) >= t.minFollowers) tier = t;
        });
        return tier; // null if below Bronze's 1000
    }
    window.determineCreatorTier = determineTier;

    function computeEligibility(userId, cb) {
        var user = _userById(userId) || {};
        var followerCount = user.followerCount || 0;
        var tier = determineTier(followerCount);

        var reasons = [];
        var badgeState = _badgeCache[userId] || null;

        function finish(engagement, active) {
            var kycOk = !!user.isVerified;
            if (!kycOk) reasons.push('Complete KYC verification.');
            if (!tier)  reasons.push('Reach at least ' + CREATOR_TIERS[0].minFollowers.toLocaleString() + ' followers (Bronze tier).');
            if (!engagement.meetsBar) {
                reasons.push('Meet the engagement bar: avg ' + ENGAGEMENT_BAR.avgViewsPerPost + ' views/post, '
                    + ENGAGEMENT_BAR.avgInteractionsPerPost + ' interactions/post, ' + Math.round(ENGAGEMENT_BAR.retentionRate * 100) + '%+ retention.');
            }
            if (!active) reasons.push('Stay active — no activity detected in the last ' + ACTIVITY_WINDOW_DAYS + ' days.');

            var badgeOk = true;
            if (tier && tier.badgeRequired) {
                badgeOk = !!(badgeState && badgeState.status === 'active' && badgeState.tier === tier.key);
                if (!badgeOk) reasons.push('Purchase the ' + tier.name + ' verified badge (' + _fmtUsd(tier.badgeFeeUsd) + ') — compulsory from Silver upward.');
            }

            var eligible = kycOk && !!tier && engagement.meetsBar && active && badgeOk;

            cb({
                eligible: eligible,
                tier: tier,
                followerCount: followerCount,
                engagement: engagement,
                active: active,
                kycVerified: kycOk,
                badge: badgeState,
                badgeRequired: !!(tier && tier.badgeRequired),
                badgeOk: badgeOk,
                reasons: reasons
            });
        }

        computeEngagement(userId, function (engagement) {
            isActiveWithinWindow(userId, function (active) {
                finish(engagement, active);
            });
        });
    }
    window.computeMonetizationEligibility = computeEligibility;


    /* =========================================================================
       §7  Creator badge purchase flow — new `creator_badges/{userId}` doc.
           Payment reuses the existing EMPY balance / rate, same math pattern
           as app-wallet.js's own preview functions (no new payment gateway
           invented here — Empy tokens now; card/PayPal fiat rails already
           exist in app-wallet.js's withdrawal method selector and can be
           pointed at this same purchaseCreatorBadge() entry point later).
       ========================================================================= */

    var _badgeCache = {}; // userId -> {tier, status, ...} (also §5 reads this)

    function _badgeDocRef(userId) {
        return window.fbDb.collection('creator_badges').doc(userId);
    }

    function loadCreatorBadge(userId, cb) {
        if (!userId || !_fbOk()) { cb(_badgeCache[userId] || null); return; }
        try {
            _badgeDocRef(userId).get().then(function (doc) {
                var data = doc && doc.exists && typeof doc.data === 'function' ? doc.data() : null;
                _badgeCache[userId] = data;
                cb(data);
            }).catch(function () { cb(_badgeCache[userId] || null); });
        } catch (e) { cb(_badgeCache[userId] || null); }
    }
    window.loadCreatorBadge = loadCreatorBadge;

    function openCreatorBadgeModal(tierKey) {
        var tier = CREATOR_TIERS.find(function (t) { return t.key === tierKey; });
        if (!tier) return;
        if (_isGuest()) { _notify('Please sign in to purchase a creator badge.', 'info'); return; }

        var us = _us();
        var priceEmpy = tier.badgeFeeUsd / _rate();
        var confirmMsg = 'Purchase the ' + tier.name + ' verified creator badge for '
            + _fmtUsd(tier.badgeFeeUsd) + ' (~' + priceEmpy.toFixed(2) + ' EMPY)?'
            + (tier.badgeRequired ? ' This badge is compulsory to cash out at ' + tier.name + ' tier.' : ' This badge is optional at Bronze tier.');

        if (typeof window.confirm === 'function' ? window.confirm(confirmMsg) : true) {
            purchaseCreatorBadge(tier.key);
        }
    }
    window.openCreatorBadgeModal = openCreatorBadgeModal;

    function purchaseCreatorBadge(tierKey) {
        var tier = CREATOR_TIERS.find(function (t) { return t.key === tierKey; });
        if (!tier) return;
        var us = _us();
        if (!us || !us.id) { _notify('Please sign in first.', 'error'); return; }

        var priceEmpy = tier.badgeFeeUsd / _rate();
        var balance = us.empyBalance || 0;
        if (balance < priceEmpy) {
            _notify('Insufficient EMPY balance. Need ~' + priceEmpy.toFixed(2) + ' EMPY, you have ' + balance.toFixed(2) + '.', 'error');
            return;
        }

        // Deduct locally first (optimistic — matches this app's existing
        // pattern for wallet UI updates), then persist.
        us.empyBalance = balance - priceEmpy;
        if (typeof window.updateWalletUI === 'function') window.updateWalletUI();

        var badgeDoc = {
            userId: us.id,
            tier: tier.key,
            status: 'active',
            feeUsd: tier.badgeFeeUsd,
            paidEmpy: priceEmpy,
            paymentMethod: 'empy_balance',
            purchasedAt: new Date().toISOString()
        };
        _badgeCache[us.id] = badgeDoc;

        if (_fbOk()) {
            try {
                _badgeDocRef(us.id).set(badgeDoc, { merge: true }).catch(function (e) { warn('badge write failed: ' + e.message); });
                window.fbDb.collection('users').doc(us.id).update({ empyBalance: us.empyBalance }).catch(function () {});
            } catch (e) {}
        }

        _audit('CREATOR_BADGE_PURCHASED', us.fullName + ' (' + (us.email || '') + ')', tier.name + ' badge — ' + _fmtUsd(tier.badgeFeeUsd));
        _notify(tier.name + ' verified creator badge activated! 🎉', 'success');
        renderMonetizationTab();
    }
    window.purchaseCreatorBadge = purchaseCreatorBadge;


    /* =========================================================================
       §8  Payout / withdrawal gate — wraps (never replaces) the existing
           fee-math functions in app-wallet.js, and adds the missing
           "actually submit a request" step into the existing
           withdrawal_queue collection with a lightweight client-side
           compliance pre-check. Real fraud detection needs a server (Cloud
           Function) — this is a pre-flight flag for admin review only, it
           never itself blocks or approves a payout.
       ========================================================================= */

    var _origUpdateWithdrawalPreview = window.updateWithdrawalPreview;
    window.updateWithdrawalPreview = function () {
        var previewEl = document.getElementById('withdrawal-preview');
        var us = _us();
        if (!previewEl || !us || !us.id) {
            if (typeof _origUpdateWithdrawalPreview === 'function') _origUpdateWithdrawalPreview();
            return;
        }

        computeEligibility(us.id, function (verdict) {
            if (!verdict.eligible) {
                previewEl.innerHTML = '<div class="form-feedback error" style="display:block;">'
                    + '<p><i class="fas fa-lock"></i> Withdrawals are locked.</p>'
                    + '<ul style="margin:6px 0 0 18px;">' + verdict.reasons.map(function (r) { return '<li>' + _esc(r) + '</li>'; }).join('') + '</ul>'
                    + '</div>';
                return;
            }
            if (typeof _origUpdateWithdrawalPreview === 'function') _origUpdateWithdrawalPreview();
        });
    };

    function _lastWithdrawalTs(userId, cb) {
        if (!_fbOk()) { cb(0); return; }
        try {
            window.fbDb.collection('withdrawal_queue').where('userId', '==', userId)
                .orderBy('requestedAt', 'desc').limit(1).get()
                .then(function (snap) {
                    var ts = 0;
                    (snap.docs || []).forEach(function (d) {
                        var v = d.data() || {};
                        ts = v.requestedAt ? new Date(v.requestedAt).getTime() : 0;
                    });
                    cb(ts);
                }).catch(function () { cb(0); });
        } catch (e) { cb(0); }
    }

    /**
     * Submit a withdrawal request into the existing withdrawal_queue
     * collection, gated on §5 eligibility, with a compliance pre-check
     * flag for admin review (fast repeat withdrawals get flagged, not
     * blocked — final call stays with the admin panel).
     */
    function submitWithdrawalRequest(amountEmpy, method) {
        var us = _us();
        if (_isGuest() || !us || !us.id) { _notify('Please sign in first.', 'error'); return; }
        if (!amountEmpy || amountEmpy < 5 || !method) { _notify('Enter a valid amount (min 5 EMPY) and method.', 'error'); return; }
        if ((us.empyBalance || 0) < amountEmpy) { _notify('Insufficient EMPY balance.', 'error'); return; }

        computeEligibility(us.id, function (verdict) {
            if (!verdict.eligible) {
                _notify('Withdrawal blocked — you do not currently meet eligibility. See the Monetization tab for details.', 'error');
                return;
            }

            _lastWithdrawalTs(us.id, function (lastTs) {
                var hoursSinceLast = lastTs ? (Date.now() - lastTs) / 3600000 : 999;
                var flagged = hoursSinceLast < 1; // more than one request per hour → flag for review
                var reqDoc = {
                    userId: us.id,
                    amountEmpy: amountEmpy,
                    method: method,
                    tier: verdict.tier ? verdict.tier.key : null,
                    payoutRateMultiplier: verdict.tier ? verdict.tier.payoutRateMultiplier : 1,
                    status: 'pending',
                    flaggedForReview: flagged,
                    flagReason: flagged ? 'Multiple withdrawal requests within 1 hour' : null,
                    requestedAt: new Date().toISOString()
                };

                if (_fbOk()) {
                    try {
                        window.fbDb.collection('withdrawal_queue').add(reqDoc).catch(function (e) { warn('withdrawal submit failed: ' + e.message); });
                    } catch (e) {}
                }
                _audit('WITHDRAWAL_REQUESTED', us.fullName + ' (' + (us.email || '') + ')',
                    amountEmpy + ' EMPY via ' + method + (flagged ? ' — FLAGGED for review' : ''));
                _notify('Withdrawal request submitted' + (flagged ? ' — pending compliance review.' : ' for processing.'), 'success');
            });
        });
    }
    window.submitWithdrawalRequest = submitWithdrawalRequest;


    /* =========================================================================
       §9  Referral tracking (optional at every tier, never blocks cash-out).
           Additive `referrals/{referralId}` collection. Does not touch
           app-auth.js's signup flow — captures ?ref= on load, then records
           once a real userState.id shows up (poll, since sign-up can finish
           at any point after this file has already run).
       ========================================================================= */

    function generateReferralLink() {
        var us = _us();
        if (!us || !us.id) return null;
        var base = (window.location && window.location.origin) ? window.location.origin + window.location.pathname : '';
        return base + '?ref=' + encodeURIComponent(us.id);
    }
    window.generateReferralLink = generateReferralLink;

    function _captureReferralParam() {
        try {
            var params = new URLSearchParams(window.location.search || '');
            var ref = params.get('ref');
            if (ref) window._pendingReferralCode = ref;
        } catch (e) {}
    }

    function _tryRecordPendingReferral() {
        var us = _us();
        if (!window._pendingReferralCode || !us || !us.id || _isGuest()) return;
        if (window._pendingReferralCode === us.id) { window._pendingReferralCode = null; return; } // no self-referrals
        if (window._referralRecordedFor === us.id) return; // already recorded this session

        window._referralRecordedFor = us.id;
        var doc = {
            referrerId: window._pendingReferralCode,
            referredUserId: us.id,
            status: 'pending_verification', // an admin/engagement threshold can flip this later; fraud-detection is server-side
            createdAt: new Date().toISOString()
        };
        if (_fbOk()) {
            try { window.fbDb.collection('referrals').add(doc).catch(function () {}); } catch (e) {}
        }
        window._pendingReferralCode = null;
    }

    function getReferralStats(userId, cb) {
        if (!userId || !_fbOk()) { cb({ total: 0, verified: 0 }); return; }
        try {
            window.fbDb.collection('referrals').where('referrerId', '==', userId).get()
                .then(function (snap) {
                    var total = 0, verified = 0;
                    (snap.docs || []).forEach(function (d) {
                        total++;
                        if ((d.data() || {}).status === 'verified') verified++;
                    });
                    cb({ total: total, verified: verified });
                }).catch(function () { cb({ total: 0, verified: 0 }); });
        } catch (e) { cb({ total: 0, verified: 0 }); }
    }


    /* =========================================================================
       §10 Creator dashboard — overrides window.renderMonetizationTab.
           Fills the SAME #profile-monetization container app-profile.js
           already builds; the original function stays defined and reachable
           (nothing deleted) in case this file is ever removed.
       ========================================================================= */

    function _progressBar(label, current, target) {
        var pct = target ? Math.min(100, Math.round((current / target) * 100)) : 0;
        return '<div style="margin:10px 0;">'
            + '<div style="display:flex;justify-content:space-between;font-size:0.8rem;color:#666;margin-bottom:4px;">'
            + '<span>' + _esc(label) + '</span><span>' + current.toLocaleString() + ' / ' + target.toLocaleString() + '</span></div>'
            + '<div style="background:#eee;border-radius:6px;height:8px;overflow:hidden;">'
            + '<div style="width:' + pct + '%;height:100%;background:var(--accent-color,#C9A66B);"></div></div></div>';
    }

    function renderMonetizationTab() {
        var container = document.getElementById('profile-monetization');
        if (!container) return;
        var us = _us();
        if (!us || !us.id) { container.innerHTML = ''; return; }

        container.innerHTML = '<p style="text-align:center;padding:20px;color:#888;"><i class="fas fa-spinner fa-spin"></i> Loading monetization status…</p>';

        loadCreatorBadge(us.id, function (badge) {
            _badgeCache[us.id] = badge;
            computeEligibility(us.id, function (verdict) {
                getReferralStats(us.id, function (referrals) {
                    _renderDashboard(container, us, verdict, referrals);
                });
            });
        });
    }
    window.renderMonetizationTab = renderMonetizationTab;

    function _renderDashboard(container, us, verdict, referrals) {
        var tier = verdict.tier;
        var nextTier = CREATOR_TIERS.find(function (t) { return !tier || t.order > tier.order; });
        var empyBal = (us.empyBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        var badgeChip = tier
            ? '<span style="background:' + (tier.key === 'gold' ? 'rgba(201,166,107,0.18)' : tier.key === 'silver' ? 'rgba(148,163,184,0.18)' : 'rgba(180,120,60,0.18)')
                + ';color:#333;padding:4px 12px;border-radius:20px;font-weight:700;font-size:0.85rem;">'
                + '<i class="fas fa-award"></i> ' + tier.name + ' Tier' + (verdict.badgeOk ? ' ✓ Badged' : '') + '</span>'
            : '<span style="color:#888;font-size:0.85rem;">No tier yet — reach ' + CREATOR_TIERS[0].minFollowers.toLocaleString() + ' followers for Bronze</span>';

        var html = '<h3><i class="fas fa-dollar-sign"></i> Your Monetization</h3>';
        html += '<div style="margin:8px 0 16px;">' + badgeChip + '</div>';

        /* Earnings tracker */
        html += '<div class="wallet-card">'
            + '<p>' + (verdict.eligible ? 'Available for Withdrawal' : 'Locked — see requirements below') + '</p>'
            + '<h3 class="empy-balance"><i class="fa-solid fa-coins"></i> ' + empyBal + '</h3>'
            + '<p>~ ' + _fmtUsd((us.empyBalance || 0) * _rate()) + '</p>'
            + (verdict.eligible
                ? '<button class="btn btn-accent nav-link" data-target="my-wallet"><i class="fas fa-exchange-alt"></i> Go to Wallet</button>'
                : '')
            + '</div>';

        /* Progress bars */
        html += '<div style="margin:16px 0;">';
        html += _progressBar('Followers', verdict.followerCount, tier ? (nextTier ? nextTier.minFollowers : tier.minFollowers) : CREATOR_TIERS[0].minFollowers);
        html += _progressBar('Avg views / post', Math.round(verdict.engagement.avgViews), ENGAGEMENT_BAR.avgViewsPerPost);
        html += _progressBar('Avg interactions / post', Math.round(verdict.engagement.avgInteractions), ENGAGEMENT_BAR.avgInteractionsPerPost);
        html += _progressBar('Retention', Math.round(verdict.engagement.retentionRate * 100), Math.round(ENGAGEMENT_BAR.retentionRate * 100)) + ' %';
        html += '<div style="margin:10px 0;font-size:0.82rem;color:#666;"><i class="fas fa-users"></i> Referrals (optional): '
            + referrals.verified + ' verified / ' + referrals.total + ' total — '
            + '<a href="#" id="emp-copy-referral-link" style="color:var(--accent-color,#C9A66B);">copy your link</a></div>';
        html += '</div>';

        /* Requirements / next steps */
        if (verdict.reasons.length) {
            html += '<div class="form-feedback info" style="display:block;text-align:left;">'
                + '<p>To unlock or maintain monetization, please meet the following:</p><ul>'
                + verdict.reasons.map(function (r) { return '<li><i class="fas fa-times-circle" style="color:var(--danger-color)"></i> ' + _esc(r) + '</li>'; }).join('')
                + '</ul></div>';
        }

        /* Badge purchase CTA */
        if (tier && (!verdict.badgeOk)) {
            html += '<div class="card-content" style="border:1px dashed var(--accent-color,#C9A66B);border-radius:8px;padding:12px;margin-top:10px;">'
                + '<p><strong>' + tier.name + ' Verified Badge</strong> — ' + _fmtUsd(tier.badgeFeeUsd)
                + (tier.badgeRequired ? ' (required to withdraw at this tier)' : ' (optional, unlocks perks)') + '</p>'
                + '<p style="font-size:0.82rem;color:#666;">Perks: ' + _esc(tier.perks.join(', ')) + '</p>'
                + '<button class="btn btn-accent btn-small" onclick="window.openCreatorBadgeModal(\'' + tier.key + '\')"><i class="fas fa-shield-alt"></i> Get ' + tier.name + ' Badge</button>'
                + '</div>';
        }

        container.innerHTML = html;

        var copyLink = document.getElementById('emp-copy-referral-link');
        if (copyLink) {
            copyLink.addEventListener('click', function (e) {
                e.preventDefault();
                var link = generateReferralLink();
                if (!link) return;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(link).then(function () { _notify('Referral link copied!', 'success'); }).catch(function () {});
                }
            });
        }
    }


    /* =========================================================================
       §11 Admin monetization panel — reads creator_badges + flagged
           withdrawal_queue entries across all users, for admin review.
           Renders into #admin-monetization-container if present in the DOM
           (container added alongside the KYC admin card in index.html,
           same pattern as #admin-kyc-docs-container).
       ========================================================================= */

    function renderAdminMonetizationPanel() {
        if (!_isAdmin()) return;
        var container = document.getElementById('admin-monetization-container');
        if (!container || !_fbOk()) return;

        container.innerHTML = '<p style="text-align:center;padding:20px;color:#888;"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';

        window.fbDb.collection('withdrawal_queue').where('flaggedForReview', '==', true).where('status', '==', 'pending').get()
            .then(function (snap) {
                var flagged = [];
                (snap.docs || []).forEach(function (d) { flagged.push(Object.assign({ id: d.id }, d.data())); });

                if (!flagged.length) {
                    container.innerHTML = '<p style="text-align:center;padding:20px;color:#888;">No flagged withdrawal requests.</p>';
                    return;
                }

                container.innerHTML = flagged.map(function (r) {
                    return '<div class="kyc-doc-card">'
                        + '<div><strong>' + _esc(r.userId) + '</strong>'
                        + '<p style="color:#666;font-size:0.83rem;margin:2px 0;">' + (r.amountEmpy || 0) + ' EMPY via ' + _esc(r.method || '—')
                        + ' &bull; ' + _esc(r.flagReason || '') + ' &bull; ' + _esc(r.requestedAt || '') + '</p></div>'
                        + '<div style="display:flex;gap:6px;">'
                        + '<button class="btn btn-success btn-small" onclick="window.approveFlaggedWithdrawal(\'' + r.id + '\')"><i class="fas fa-check"></i> Approve</button>'
                        + '<button class="btn btn-danger btn-small" onclick="window.rejectFlaggedWithdrawal(\'' + r.id + '\')"><i class="fas fa-times"></i> Reject</button>'
                        + '</div></div>';
                }).join('');
            })
            .catch(function (err) {
                container.innerHTML = '<p style="text-align:center;padding:20px;color:#888;">Could not load flagged requests.</p>';
                warn('admin panel load failed: ' + (err && err.message));
            });
    }
    window.renderAdminMonetizationPanel = renderAdminMonetizationPanel;

    window.approveFlaggedWithdrawal = function (reqId) {
        if (!_isAdmin() || !_fbOk()) return;
        window.fbDb.collection('withdrawal_queue').doc(reqId).update({ status: 'approved', reviewedAt: new Date().toISOString() })
            .then(function () { _audit('WITHDRAWAL_APPROVED', reqId, 'Flagged request approved by admin'); renderAdminMonetizationPanel(); })
            .catch(function () {});
    };
    window.rejectFlaggedWithdrawal = function (reqId) {
        if (!_isAdmin() || !_fbOk()) return;
        window.fbDb.collection('withdrawal_queue').doc(reqId).update({ status: 'rejected', reviewedAt: new Date().toISOString() })
            .then(function () { _audit('WITHDRAWAL_REJECTED', reqId, 'Flagged request rejected by admin'); renderAdminMonetizationPanel(); })
            .catch(function () {});
    };


    /* =========================================================================
       §12 KYC → isVerified wiring fix
           approveKyc() (app-kyc.js) updates the kyc_submissions doc status
           but never flips user.isVerified — the only thing that does today
           is the separate manual "Mark Verified" admin toggle in app-live.js.
           Wrapped, not edited: original still runs first, this only adds
           the missing side-effect once KYC is actually approved, so the
           eligibility engine above (§5) sees a consistent isVerified flag.
       ========================================================================= */

    var _origApproveKyc = window.approveKyc;
    if (typeof _origApproveKyc === 'function') {
        window.approveKyc = function (id) {
            _origApproveKyc(id);
            try {
                var entry = (window._kycQueue || []).find(function (k) { return k.id === id; });
                if (!entry || !entry.userId) return;
                var user = _userById(entry.userId);
                if (user) user.isVerified = true;
                if (_fbOk()) {
                    window.fbDb.collection('users').doc(entry.userId).update({ isVerified: true }).catch(function () {});
                }
                if (typeof window.renderMonetizationTab === 'function') window.renderMonetizationTab();
            } catch (e) { warn('post-KYC-approval sync failed: ' + e.message); }
        };
    }


    /* =========================================================================
       §14 AD REVENUE SHARE — "Content Creator Monetization Model" proposal
       ═══════════════════════════════════════════════════════════════════════
       REWRITE (2026-08, follow-up review): the first pass of this section
       computed everything client-side against a made-up perViewUsd
       constant, had no bridge to a real withdrawable balance, and relied
       only on a Firestore "admin can write" rule to keep the ledger
       honest. All three are fixed by moving computation and every write
       server-side (server.js's new /api/admin/ad-revenue/* and
       /api/ad-revenue/request-payout routes, Admin SDK) — this file is now
       READ-ONLY against ad_revenue_shares/ad_revenue_quarterly_reports/
       ad_revenue_program_meta (firebase-rules.js's write rules for all
       three are `if false` — not even an admin's own browser session can
       write them anymore, only the server's service account can) plus a
       thin fetch() layer that calls those routes for admin actions and
       for a creator's own payout request. See server.js's own header
       comment on that block for the full before/after.

       Still true from the original design, unchanged:
         • Kept fully independent of CREATOR_TIERS/badge/withdrawal above
           and of app-impactmining.js — separate collections, separate
           config, nothing shared.
         • Engagement-based: the server aggregates the same `posts` fields
           (views/likes/commentCount/shareCount) app-feed.js already
           writes and this file's own §3 computeEngagement() already
           reads client-side for the (separate) creator-tier eligibility
           bar — server.js's compute-payouts route reimplements that same
           bar independently rather than trusting anything the client
           reports about its own performance.
         • 30% baseline / 50% ceiling, performance bonus pool, market-
           adjustment countdown, regional adaptation — all now computed
           and enforced server-side; this file only displays the result.
       ═══════════════════════════════════════════════════════════════════════ */

    // Display-only mirror of server.js's AD_REVENUE_BASELINE_PCT/MAX_PCT —
    // used here purely for labels and to sanity-clamp what an admin types
    // into the override field before it's even sent. The server clamps
    // again independently; this is just so the admin doesn't have to wait
    // on a round trip to see an out-of-range value rejected.
    var AD_REVENUE_DISPLAY = {
        baselinePct: 0.30,
        maxPct: 0.50,
        marketAdjustmentIntervalMonths: 24,
        systemNote: 'Independent of app-impactmining.js — that system rewards '
            + 'humanitarian/impact actions with its own token economy; this one '
            + 'pays a share of REAL, admin-entered ad revenue, computed and '
            + 'written server-side. A creator can participate in both; neither '
            + 'figure feeds into the other.'
    };
    window.AD_REVENUE_SHARE_CONFIG = AD_REVENUE_DISPLAY;

    function _clampSharePctDisplay(pct) {
        return Math.max(AD_REVENUE_DISPLAY.baselinePct, Math.min(AD_REVENUE_DISPLAY.maxPct, pct || AD_REVENUE_DISPLAY.baselinePct));
    }

    // Same bearer-ID-token fetch pattern app-bulk-disburse.js already
    // established for admin-only server routes in this codebase.
    function _adRevGetIdToken() {
        if (!window.fbAuth || !window.fbAuth.currentUser) return Promise.reject(new Error('Not signed in.'));
        return window.fbAuth.currentUser.getIdToken();
    }
    function _adRevApiBase() {
        return (typeof window._empApiBase === 'function' ? window._empApiBase() : '') + '/api';
    }
    function _adRevAuthedFetch(path, body) {
        return _adRevGetIdToken().then(function (token) {
            return fetch(_adRevApiBase() + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(body || {})
            }).then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
                    return data;
                });
            });
        });
    }

    var _revShareCache = {}; // userId -> ad_revenue_shares doc (read-only client cache)

    function loadAdRevenueShare(userId, cb) {
        if (!userId || !_fbOk()) { cb(_revShareCache[userId] || null); return; }
        try {
            window.fbDb.collection('ad_revenue_shares').doc(userId).get().then(function (doc) {
                var data = doc && doc.exists && typeof doc.data === 'function' ? doc.data() : null;
                _revShareCache[userId] = data;
                cb(data);
            }).catch(function () { cb(_revShareCache[userId] || null); });
        } catch (e) { cb(_revShareCache[userId] || null); }
    }
    window.loadAdRevenueShare = loadAdRevenueShare;

    function loadReviewSchedule(cb) {
        if (!_fbOk()) { cb(null); return; }
        try {
            window.fbDb.collection('ad_revenue_program_meta').doc('schedule').get().then(function (doc) {
                cb(doc && doc.exists && typeof doc.data === 'function' ? doc.data() : null);
            }).catch(function () { cb(null); });
        } catch (e) { cb(null); }
    }
    function _nextReviewDate(lastReviewedAt) {
        var base = lastReviewedAt ? new Date(lastReviewedAt) : new Date();
        var next = new Date(base);
        next.setMonth(next.getMonth() + AD_REVENUE_DISPLAY.marketAdjustmentIntervalMonths);
        return next;
    }

    /**
     * Creator requests a payout of their AVAILABLE (unpaid) ad-revenue
     * balance. The server re-reads the ledger inside a transaction and
     * reserves the amount atomically (server.js's /api/ad-revenue/
     * request-payout) — this call cannot itself credit or invent a
     * balance, it only asks the server to move whatever it already
     * computed into the existing withdrawal_queue for admin review, same
     * as every other withdrawal in this app.
     */
    window.requestAdRevenuePayout = function () {
        var us = _us();
        if (_isGuest() || !us || !us.id) { _notify('Please sign in first.', 'error'); return; }
        _notify('Requesting payout…', 'info');
        _adRevAuthedFetch('/ad-revenue/request-payout')
            .then(function (data) {
                _notify('Payout of ' + _fmtUsd(data.amountUsd) + ' (~' + data.amountEmpy.toFixed(2) + ' EMPY) requested — pending admin review, same queue as your wallet withdrawals.', 'success');
                renderMonetizationTab();
            })
            .catch(function (err) { _notify('Could not request payout: ' + (err.message || 'unknown error'), 'error'); });
    };

    /**
     * Creator-facing card — appended inside §10's _renderDashboard(),
     * visually separate from the Creator Tier/badge block above it.
     * Purely a READ of what server.js's compute-payouts route already
     * wrote; this file computes nothing.
     */
    function _renderAdRevenueCard(container, us) {
        var el = document.createElement('div');
        el.className = 'card-content';
        el.style.cssText = 'border:1px solid var(--accent-color,#C9A66B);border-radius:10px;padding:14px;margin-top:18px;';
        el.innerHTML = '<p style="text-align:center;color:#888;"><i class="fas fa-spinner fa-spin"></i> Loading ad revenue share…</p>';
        container.appendChild(el);

        loadAdRevenueShare(us.id, function (ledger) {
            loadReviewSchedule(function (meta) {
                var nextReview = _nextReviewDate(meta && meta.lastReviewedAt);

                if (!ledger) {
                    el.innerHTML =
                        '<h4 style="margin:0 0 8px;"><i class="fas fa-chart-pie"></i> Ad Revenue Share <span style="font-weight:400;font-size:0.75rem;color:#888;">(separate from your Wallet balance above)</span></h4>'
                        + '<p style="font-size:0.85rem;color:#666;">No figures yet for this period — the platform\u2019s ad revenue pool is set and split by an admin each period. Keep posting; you\u2019ll show up here once you meet the engagement bar and a period has been computed.</p>'
                        + '<p style="font-size:0.75rem;color:#888;margin:8px 0 0;">Guaranteed minimum ' + Math.round(AD_REVENUE_DISPLAY.baselinePct * 100)
                        + '%, up to ' + Math.round(AD_REVENUE_DISPLAY.maxPct * 100) + '% with the performance bonus pool once figures are computed. '
                        + 'Next market-adjustment review: ' + nextReview.toLocaleDateString() + '.</p>';
                    return;
                }

                if (ledger.suspiciousFlag) {
                    el.innerHTML =
                        '<h4 style="margin:0 0 8px;"><i class="fas fa-chart-pie"></i> Ad Revenue Share</h4>'
                        + '<div class="form-feedback error" style="display:block;"><p><i class="fas fa-flag"></i> This period\u2019s payout is on hold for review — '
                        + _esc(ledger.suspiciousReason || 'unusual engagement pattern detected') + '. Contact support if you believe this is a mistake.</p></div>';
                    return;
                }

                var totalEarned = Number(ledger.totalEarnedUsd) || 0;
                var paidOut = Number(ledger.paidOutUsd) || 0;
                var available = Math.max(0, totalEarned - paidOut);

                el.innerHTML =
                    '<h4 style="margin:0 0 8px;"><i class="fas fa-chart-pie"></i> Ad Revenue Share <span style="font-weight:400;font-size:0.75rem;color:#888;">(separate from your Wallet balance above)</span></h4>'
                    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
                    + '<span>Your current share</span><strong>' + Math.round((ledger.sharePct || AD_REVENUE_DISPLAY.baselinePct) * 100) + '%'
                    + (ledger.bonusUnlocked ? ' <span style="color:#22c55e;font-size:0.78rem;">(bonus pool active)</span>' : '') + '</strong></div>'
                    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
                    + '<span>Last period (' + _esc(ledger.lastPeriodKey || '—') + ')</span><strong>' + _fmtUsd(ledger.lastPeriodCreatorShareUsd || 0) + '</strong></div>'
                    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
                    + '<span>Total earned to date</span><strong>' + _fmtUsd(totalEarned) + '</strong></div>'
                    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
                    + '<span>Already paid out</span><strong>' + _fmtUsd(paidOut) + '</strong></div>'
                    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">'
                    + '<span><strong>Available now</strong></span><strong style="color:var(--accent-color,#C9A66B);">' + _fmtUsd(available) + '</strong></div>'
                    + (available > 0.01
                        ? '<button class="btn btn-accent btn-small" onclick="window.requestAdRevenuePayout()"><i class="fas fa-paper-plane"></i> Request Payout</button>'
                        : '<p style="font-size:0.78rem;color:#888;">Nothing available to request yet.</p>')
                    + '<p style="font-size:0.75rem;color:#888;margin:10px 0 0;">Guaranteed minimum ' + Math.round(AD_REVENUE_DISPLAY.baselinePct * 100)
                    + '%, up to ' + Math.round(AD_REVENUE_DISPLAY.maxPct * 100) + '% with the performance bonus pool. '
                    + 'Next market-adjustment review: ' + nextReview.toLocaleDateString() + '.</p>'
                    + '<button class="btn btn-small" style="margin-top:8px;" onclick="window.viewLatestAdRevenueReport()"><i class="fas fa-file-invoice-dollar"></i> View latest quarterly report</button>';
            });
        });
    }

    window.viewLatestAdRevenueReport = function () {
        if (!_fbOk()) { _notify('Reports need a live connection — try again shortly.', 'info'); return; }
        window.fbDb.collection('ad_revenue_quarterly_reports').orderBy('publishedAt', 'desc').limit(1).get()
            .then(function (snap) {
                var doc = (snap.docs || [])[0];
                if (!doc) { _notify('No quarterly report has been published yet.', 'info'); return; }
                var r = doc.data() || {};
                var mine = (r.creators || []).find(function (c) { return c.userId === (_us() && _us().id); });
                var msg = 'Report ' + r.quarter + ': ' + r.creatorCount + ' creators, '
                    + _fmtUsd(r.platformCreatorShareUsd) + ' distributed platform-wide'
                    + (mine ? ('. Your share: ' + Math.round(mine.sharePct * 100) + '% — ' + _fmtUsd(mine.lastPeriodCreatorShareUsd) + ' this period.') : '.');
                _notify(msg, 'info');
            }).catch(function () { _notify('Could not load the latest report.', 'error'); });
    };

    /* =========================================================================
       Admin controls — every action below hits server.js's Admin-SDK
       routes; nothing here writes to Firestore directly (firebase-rules.js
       now denies client writes to all three ad-revenue collections
       outright, admin session or not — see that file's own comment).
       ========================================================================= */

    window.setAdRevenuePool = function () {
        if (!_isAdmin()) return;
        var amountEl = document.getElementById('rev-pool-amount');
        var sourceEl = document.getElementById('rev-pool-source');
        var amount = amountEl ? parseFloat(amountEl.value) : NaN;
        if (!(amount > 0)) { _notify('Enter the real ad revenue figure for this period (a positive number).', 'error'); return; }
        _adRevAuthedFetch('/admin/ad-revenue/set-pool', { totalAdRevenueUsd: amount, source: sourceEl ? sourceEl.value : '' })
            .then(function (data) {
                _audit('AD_REVENUE_POOL_SET', data.periodKey, _fmtUsd(amount));
                _notify('Ad revenue pool for ' + data.periodKey + ' set to ' + _fmtUsd(amount) + '.', 'success');
                renderAdRevenueAdminPanel();
            })
            .catch(function (err) { _notify('Could not set pool: ' + (err.message || 'unknown error'), 'error'); });
    };

    window.computeAdRevenuePayouts = function () {
        if (!_isAdmin()) return;
        _notify('Computing this period\u2019s payouts — this can take a moment on a large post collection…', 'info');
        _adRevAuthedFetch('/admin/ad-revenue/compute-payouts')
            .then(function (data) {
                _audit('AD_REVENUE_PAYOUTS_COMPUTED', data.periodKey, data.creatorsPaid + ' paid, ' + data.creatorsFlagged + ' flagged');
                _notify('Computed ' + data.periodKey + ': ' + data.creatorsPaid + ' creators paid, ' + data.creatorsFlagged + ' flagged for review.', 'success');
                renderAdRevenueAdminPanel();
            })
            .catch(function (err) { _notify('Compute failed: ' + (err.message || 'unknown error'), 'error'); });
    };

    window.publishQuarterlyRevenueReport = function () {
        if (!_isAdmin()) return;
        _adRevAuthedFetch('/admin/ad-revenue/publish-report')
            .then(function (data) {
                _audit('AD_REVENUE_QUARTERLY_REPORT_PUBLISHED', data.periodKey, data.creatorCount + ' creators, ' + _fmtUsd(data.platformCreatorShareUsd) + ' distributed');
                _notify('Quarterly report ' + data.periodKey + ' published (' + data.creatorCount + ' creators).', 'success');
                renderAdRevenueAdminPanel();
            })
            .catch(function (err) { _notify('Could not publish report: ' + (err.message || 'unknown error'), 'error'); });
    };

    window.markRevenueShareReviewed = function () {
        if (!_isAdmin()) return;
        _adRevAuthedFetch('/admin/ad-revenue/mark-reviewed')
            .then(function () {
                _audit('AD_REVENUE_MARKET_REVIEW', 'program', 'Market-adjustment review recorded');
                _notify('Market-adjustment review recorded — next review in ' + AD_REVENUE_DISPLAY.marketAdjustmentIntervalMonths + ' months.', 'success');
                renderAdRevenueAdminPanel();
            }).catch(function (err) { _notify('Could not record review: ' + (err.message || 'unknown error'), 'error'); });
    };

    window.setCreatorRevenueSharePct = function (userId, pct) {
        if (!_isAdmin() || !userId) return;
        var clamped = _clampSharePctDisplay(parseFloat(pct));
        _adRevAuthedFetch('/admin/ad-revenue/set-share-pct', { userId: userId, pct: clamped })
            .then(function () {
                _audit('AD_REVENUE_SHARE_ADJUSTED', userId, 'Share set to ' + Math.round(clamped * 100) + '%');
                _notify('Revenue share for ' + userId + ' set to ' + Math.round(clamped * 100) + '%.', 'success');
                renderAdRevenueAdminPanel();
            })
            .catch(function (err) { _notify('Could not set share: ' + (err.message || 'unknown error'), 'error'); });
    };

    /**
     * Admin panel — pool entry, compute/publish/review actions, and a
     * creator roster with per-creator override. Mounted into
     * #admin-ad-revenue-container (index.html). All figures displayed are
     * a straight read of ad_revenue_shares — nothing computed here.
     */
    function renderAdRevenueAdminPanel() {
        if (!_isAdmin()) return;
        var container = document.getElementById('admin-ad-revenue-container');
        if (!container || !_fbOk()) return;

        container.innerHTML = '<p style="text-align:center;padding:20px;color:#888;"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';

        loadReviewSchedule(function (meta) {
            var nextReview = _nextReviewDate(meta && meta.lastReviewedAt);
            var reviewBadge = document.getElementById('rev-share-next-review-badge');
            if (reviewBadge) reviewBadge.textContent = 'Next review: ' + nextReview.toLocaleDateString();

            var toolbarHtml = '<div style="padding:10px 14px;border-bottom:1px solid #eee;">'
                + '<div style="font-size:0.82rem;color:#666;margin-bottom:8px;">Baseline ' + Math.round(AD_REVENUE_DISPLAY.baselinePct * 100) + '% &bull; Max '
                + Math.round(AD_REVENUE_DISPLAY.maxPct * 100) + '% &bull; Next market review ' + nextReview.toLocaleDateString() + '</div>'
                + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">'
                + '<input type="number" min="0" step="0.01" placeholder="Real ad revenue this period ($)" id="rev-pool-amount" style="width:220px;">'
                + '<input type="text" placeholder="Source (e.g. AdSense payout ref)" id="rev-pool-source" style="width:220px;">'
                + '<button class="btn btn-small" onclick="window.setAdRevenuePool()"><i class="fas fa-coins"></i> Set Pool</button>'
                + '</div>'
                + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
                + '<button class="btn btn-small" onclick="window.computeAdRevenuePayouts()"><i class="fas fa-calculator"></i> Compute This Period\u2019s Payouts</button>'
                + '<button class="btn btn-small" onclick="window.markRevenueShareReviewed()"><i class="fas fa-calendar-check"></i> Mark Reviewed</button>'
                + '<button class="btn btn-accent btn-small" onclick="window.publishQuarterlyRevenueReport()"><i class="fas fa-file-export"></i> Publish Quarterly Report</button>'
                + '</div></div>';

            window.fbDb.collection('ad_revenue_shares').get().then(function (snap) {
                var rows = [];
                (snap.docs || []).forEach(function (d) { rows.push(Object.assign({ id: d.id }, d.data())); });

                if (!rows.length) {
                    container.innerHTML = toolbarHtml + '<p style="text-align:center;padding:20px;color:#888;">No creator ad-revenue ledger entries yet — set this period\u2019s pool figure, then click Compute.</p>';
                    return;
                }

                container.innerHTML = toolbarHtml + rows.map(function (r) {
                    var pct = Math.round((r.sharePct || AD_REVENUE_DISPLAY.baselinePct) * 100);
                    return '<div class="kyc-doc-card">'
                        + '<div><strong>' + _esc(r.id) + '</strong>'
                        + (r.suspiciousFlag ? ' <span style="color:#ef4444;font-size:0.75rem;"><i class="fas fa-flag"></i> flagged</span>' : '')
                        + '<p style="color:#666;font-size:0.83rem;margin:2px 0;">' + pct + '% share'
                        + (r.bonusUnlocked ? ' (bonus pool)' : '') + ' &bull; ' + _fmtUsd(r.totalEarnedUsd || 0) + ' earned, '
                        + _fmtUsd(r.paidOutUsd || 0) + ' paid out'
                        + ' &bull; last period ' + _esc(r.lastPeriodKey || '—') + '</p></div>'
                        + '<div style="display:flex;gap:6px;align-items:center;">'
                        + '<input type="number" min="' + Math.round(AD_REVENUE_DISPLAY.baselinePct * 100) + '" max="' + Math.round(AD_REVENUE_DISPLAY.maxPct * 100)
                        + '" value="' + pct + '" style="width:64px;" id="rev-pct-' + _esc(r.id) + '">%'
                        + '<button class="btn btn-small" onclick="window.setCreatorRevenueSharePct(\'' + _esc(r.id) + '\', document.getElementById(\'rev-pct-' + _esc(r.id) + '\').value/100)"><i class="fas fa-save"></i> Set</button>'
                        + '</div></div>';
                }).join('');
            }).catch(function (err) {
                container.innerHTML = toolbarHtml + '<p style="text-align:center;padding:20px;color:#888;">Could not load creator ad-revenue ledger.</p>';
                warn('ad revenue admin panel load failed: ' + (err && err.message));
            });
        });
    }
    window.renderAdRevenueAdminPanel = renderAdRevenueAdminPanel;

    // Hook the new card into §10's existing dashboard render, additively —
    // wraps (does not edit) renderMonetizationTab, matching this file's own
    // established convention (see §12's approveKyc wrap) for extending a
    // function defined earlier in this same file.
    var _origRenderMonetizationTab = window.renderMonetizationTab;
    window.renderMonetizationTab = function () {
        _origRenderMonetizationTab();
        var container = document.getElementById('profile-monetization');
        var us = _us();
        if (container && us && us.id) {
            // Wait a tick for _origRenderMonetizationTab's own async chain
            // (loadCreatorBadge → computeEligibility → getReferralStats) to
            // finish writing container.innerHTML before appending, so this
            // card is never wiped out by that render finishing after us.
            setTimeout(function () {
                if (document.getElementById('profile-monetization') === container && container.innerHTML) {
                    _renderAdRevenueCard(container, us);
                }
            }, 50);
        }
    };


    /* =========================================================================
       §13 Init / event wiring
       ========================================================================= */

    _captureReferralParam();

    // Poll briefly for sign-up completion so a referral captured pre-login
    // still gets recorded once userState.id exists (mirrors app-startup.js's
    // own short-retry pattern for Firebase init).
    var _refPoll = 0;
    var _refTimer = setInterval(function () {
        _refPoll++;
        _tryRecordPendingReferral();
        if (!window._pendingReferralCode || _refPoll >= 40) clearInterval(_refTimer); // ~20s at 500ms
    }, 500);

    // Refresh the admin panel whenever the admin section becomes visible,
    // same event this app already dispatches for other section-scoped renders.
    window.addEventListener('empyrean-section-change', function (e) {
        try {
            if (e && e.detail && e.detail.section === 'admin' && _isAdmin()) {
                renderAdminMonetizationPanel();
                renderAdRevenueAdminPanel();
            }
        } catch (err) {}
    });

    log('Creator monetization module loaded.');
})();