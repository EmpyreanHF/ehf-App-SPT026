/* =============================================================================
   EMPYREAN INTERNATIONAL — MARKETPLACE GOVERNANCE
   app-marketplace-governance.js

   WHAT THIS FILE OWNS
   ────────────────────
   Fills the gaps found in the marketplace-workflow audit that no other file
   covers. Self-contained module, same conventions as app-marketplace-sellers.js
   (own <style> block, own Firestore listeners, DOM post-processing only —
   never edits app-fixes.js's card-builder HTML directly).

   1) ITEM LIFECYCLE — "Mark as Sold" button on a seller's own listing cards,
      a live listener that hides sold/delisted listings from the main
      marketplace grid (moved to the Sold tab app-marketplace-sellers.js
      renders on the seller profile page instead), and a SOLD ribbon inside
      that tab.

   2) BUYER REPORTING — a lightweight report modal (window._empGovReportTarget)
      reachable from a "Report" link injected onto listing cards and from the
      "Report this seller" link app-marketplace-sellers.js renders on seller
      profiles. Writes to `marketplace_reports`. Deliberately generic-worded
      towards the reporter/reported party — no moderation mechanics are ever
      surfaced to end users.

   3) ADMIN — KYC APPROVAL — populates the existing (previously dead)
      #admin-kyc-docs-container placeholder in index.html with the real
      `kyc_submissions` queue and working Approve/Reject actions. Approving a
      marketplace-seller submission sets isVerified + mirrors the bio-data
      fields (phone/email/address/DOB/state) collected at onboarding onto the
      user doc.

   4) ADMIN — REPORTS & MODERATION — injects a new admin card (Resolve /
      Delist Listing / Suspend Seller / Ban Seller) reading `marketplace_reports`.
      Exposes window._empGovModerateUser(uid, action), which app-admin.js's
      per-user Suspend/Ban/Reactivate buttons call directly. Banning cascades:
      every active listing owned by that seller is delisted in the same pass.

   DEPENDENCY NOTE: reuses the existing `kyc_submissions` collection shape
   app-marketplace-sellers.js writes to, the existing `users/{uid}.isVerified`
   flag, and the existing `marketplace_listings` collection. No Firestore
   security-rule changes are made here — if rules currently restrict writes
   to `suspended`/`banned`/`status` fields to admins only, that's already the
   correct behavior and doesn't need touching.
   ============================================================================= */

(function empyreanMarketplaceGovernanceModule() {
    'use strict';

    if (window._empyreanMarketplaceGovernanceLoaded) {
        console.warn('[EmpMarketGovernance] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanMarketplaceGovernanceLoaded = true;

    /* ── Local helpers (mirrors the other marketplace modules' own local
       helpers — each module in this codebase stays self-contained) ── */
    function _S()       { return window.EmpState || {}; }
    function _us()      { return _S().userState || window.userState || {}; }
    function _isAdmin() { var s = _S(); return s.isAdmin != null ? s.isAdmin : (window.isAdmin || false); }
    function _fbDb()    { return window.fbDb || null; }
    function _isGuest() {
        if (typeof window._empIsGuest === 'function') return window._empIsGuest();
        if (_S().isGuest === false) return false;
        if (_S().isGuest === true) return true;
        return !(_us() && _us().id);
    }
    function _ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }
    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _notify(msg, type) {
        if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info');
    }
    function _fmtDate(ts) {
        try {
            if (!ts) return '—';
            var d = ts.toDate ? ts.toDate() : new Date(ts);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch (e) { return '—'; }
    }

    /* =========================================================================
       §STYLE
       ========================================================================= */
    (function _injectStyles() {
        if (document.getElementById('_mkt_gov_style')) return;
        var s = document.createElement('style');
        s.id = '_mkt_gov_style';
        s.textContent = [
            '.gov-report-link { font-size:0.72rem; color:var(--color-neutral-500,#9CA3AF); text-decoration:underline; cursor:pointer; white-space:nowrap; }',
            '.gov-mark-sold-btn { background:rgba(10,14,39,0.06); color:var(--primary,#0A0E27); border:1px solid rgba(10,14,39,0.15); }',

            '#emp-gov-report-modal { position:fixed; inset:0; z-index:9999; display:none; align-items:center; justify-content:center; background:rgba(10,14,39,0.55); padding:20px; }',
            '#emp-gov-report-modal.open { display:flex; }',
            '.gov-report-card { background:#fff; border-radius:16px; padding:22px; width:100%; max-width:380px; max-height:90vh; overflow-y:auto; }',
            '.gov-report-card h3 { margin:0 0 4px; font-size:1.05rem; color:var(--primary,#0A0E27); }',
            '.gov-report-card p.gov-sub { font-size:0.82rem; color:var(--color-neutral-600,#6B7280); margin:0 0 14px; }',
            '.gov-report-card label { display:block; font-size:0.8rem; font-weight:700; color:var(--primary,#0A0E27); margin:12px 0 5px; }',
            '.gov-report-card select, .gov-report-card textarea { width:100%; padding:10px 12px; border-radius:10px; border:1.5px solid rgba(10,14,39,0.12); font-size:0.88rem; font-family:inherit; }',
            '.gov-report-card textarea { min-height:70px; resize:vertical; }',
            '.gov-report-actions { display:flex; gap:8px; margin-top:16px; }',
            '.gov-report-actions button { flex:1; padding:11px; border-radius:10px; border:none; font-weight:700; font-size:0.86rem; cursor:pointer; }',
            '.gov-report-cancel { background:rgba(10,14,39,0.06); color:var(--primary,#0A0E27); }',
            '.gov-report-submit { background:var(--secondary,#1B2B8B); color:#fff; }',

            '.gov-admin-row { border-bottom:1px solid rgba(10,14,39,0.08); padding:12px 16px; }',
            '.gov-admin-row:last-child { border-bottom:none; }',
            '.gov-admin-row .gov-row-head { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:flex-start; }',
            '.gov-admin-row .gov-row-title { font-weight:800; font-size:0.9rem; color:#0A0E27; }',
            '.gov-admin-row .gov-row-sub { font-size:0.76rem; color:#6B7280; margin-top:2px; }',
            '.gov-admin-row .gov-row-meta { font-size:0.78rem; color:#374151; margin-top:8px; line-height:1.7; }',
            '.gov-admin-row .gov-row-actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; }',
            '.gov-admin-row .gov-row-actions button { padding:7px 13px; border-radius:8px; font-size:0.76rem; font-weight:700; cursor:pointer; border:1px solid transparent; }',
            '.gov-btn-approve { background:rgba(22,163,74,0.08); color:#16A34A; border-color:rgba(22,163,74,0.2)!important; }',
            '.gov-btn-reject { background:rgba(239,68,68,0.08); color:#EF4444; border-color:rgba(239,68,68,0.2)!important; }',
            '.gov-btn-neutral { background:rgba(10,14,39,0.06); color:#0A0E27; border-color:rgba(10,14,39,0.12)!important; }',
            '.gov-btn-warn { background:rgba(245,158,11,0.08); color:#B45309; border-color:rgba(245,158,11,0.2)!important; }',
            '.gov-btn-danger { background:rgba(239,68,68,0.08); color:#EF4444; border-color:rgba(239,68,68,0.2)!important; }'
        ].join('\n');
        document.head.appendChild(s);
    })();

    /* =========================================================================
       §1  ITEM LIFECYCLE — Mark as Sold + hiding sold/delisted cards
       ========================================================================= */
    var _listingState = {};   /* listingId -> { status, sellerId } */
    var _bannedSellerCache = {}; /* sellerId -> true|false */

    function _watchListingStates() {
        var db = _fbDb();
        if (!db || window._govListingListener) return;
        window._govListingListener = db.collection('marketplace_listings')
            .orderBy('createdAt', 'desc').limit(60)
            .onSnapshot(function (snap) {
                snap.docChanges().forEach(function (change) {
                    var item = change.doc.data();
                    if (!item || !item.id) return;
                    if (change.type === 'removed') { delete _listingState[item.id]; return; }
                    _listingState[item.id] = { status: item.status || 'active', sellerId: item.sellerId || '' };
                    _applyCardState(item.id);
                });
            }, function (err) { console.warn('[GovListingWatch]', err && err.message); });
    }

    function _applyCardState(listingId) {
        var grid = document.getElementById('property-grid-container');
        if (!grid) return;
        var card = grid.querySelector('[data-id="' + listingId + '"]');
        if (!card) return;
        var state = _listingState[listingId];
        if (!state) return;

        if (state.status === 'sold' || state.status === 'delisted') {
            card.style.display = 'none';
            return;
        }

        var sellerId = state.sellerId;
        if (sellerId && _bannedSellerCache.hasOwnProperty(sellerId)) {
            card.style.display = _bannedSellerCache[sellerId] ? 'none' : '';
        } else if (sellerId) {
            var db = _fbDb();
            if (db) {
                db.collection('users').doc(sellerId).get().then(function (doc) {
                    var banned = !!(doc.exists && doc.data() && doc.data().banned);
                    _bannedSellerCache[sellerId] = banned;
                    _applyCardState(listingId);
                }).catch(function () {});
            }
            card.style.display = '';
        } else {
            card.style.display = '';
        }
    }

    function _ensureCardGovernanceControls(card) {
        if (!card || card._govWired) return;
        var id = card.dataset.id;
        if (!id) return;
        /* BUG FIX (defense-in-depth, paired with the fix in
           app-marketplace.js's _ensureOwnerActions): this module's own
           _cardObserver below watches the whole document.body for any
           newly-added `.property-card`, so it can reach the compact
           "New in Marketplace" dashboard-strip preview card too (it
           carries `.property-card` for click-routing reasons, see
           app-fixes.js). That card is a lightweight link into the real
           listing, not a management surface, and app-marketplace.js no
           longer builds a `.property-actions` row on it at all — but
           bailing out here explicitly, rather than relying solely on
           "no actions row exists yet", also stops the Report-a-listing
           link this function adds further down from ever landing on it
           either, and keeps this module correct even if some future
           change reintroduces an actions row on that card by accident. */
        if (card.classList.contains('dashboard-market-card')) return;

        var us = _us();
        /* FIX: previously card._govWired was set unconditionally right here,
           before checking who's logged in. If this ran before Firebase auth
           resolved userState.id (isOwn always false at that point), the card
           was permanently locked out — every later sweep (post-login, section
           change, etc.) saw _govWired already set and bailed out immediately,
           so the seller's own "Mark as Sold" button never got attached. Now
           we only lock the card in once we actually have a resolved user id
           (or already know it's an admin), and re-sweep on 'empyrean-user-ready'
           below to catch cards rendered before that. */
        if (!us.id && !_isAdmin()) return;
        card._govWired = true;

        var isOwn = us.id && card.dataset.sellerId === us.id;
        var actions = card.querySelector('.property-actions');

        if (actions && (isOwn || _isAdmin()) && !card.classList.contains('mkt-avatar-card')) {
            // FIX (request — "Mark as Sold should not have anything to do
            // with that card"): Job Seeking / Professional Services
            // listings (the premium avatar cards) represent a person, not
            // an item being sold, so "Mark as Sold" never made sense on
            // them. Skipped for that card type only; every other category
            // keeps the button exactly as before.
            var soldBtn = document.createElement('button');
            soldBtn.type = 'button';
            soldBtn.className = 'btn gov-mark-sold-btn';
            soldBtn.innerHTML = '<i class="fas fa-tag"></i> Mark as Sold';
            soldBtn.addEventListener('click', function () { _markListingSold(id, soldBtn, card); });
            actions.insertBefore(soldBtn, actions.firstChild);
        }

        var sellerRow = card.querySelector('.property-seller-info');
        if (sellerRow && !isOwn && !_isAdmin() && us.id) {
            var reportLink = document.createElement('a');
            reportLink.href = 'javascript:void(0)';
            reportLink.className = 'gov-report-link';
            reportLink.textContent = 'Report';
            reportLink.addEventListener('click', function (e) {
                e.stopPropagation();
                _empGovReportTarget('listing', id, card.dataset.sellerId || '');
            });
            sellerRow.appendChild(reportLink);
        }

        /* Apply whatever state we already know about (listener may not have
           fired for this id yet if the card was rendered before the
           listener attached — harmless no-op otherwise). */
        _applyCardState(id);
    }

    function _markListingSold(listingId, btn, card) {
        if (!btn._confirming) {
            btn._confirming = true;
            var original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirm Sold?';
            setTimeout(function () { btn._confirming = false; btn.innerHTML = original; }, 4000);
            return;
        }
        var db = _fbDb();
        if (!db) return;
        btn.disabled = true;
        db.collection('marketplace_listings').doc(listingId).set(
            { status: 'sold', soldAt: new Date().toISOString() },
            { merge: true }
        ).then(function () {
            _notify('Listing marked as sold and moved to your Sold catalog.', 'success');
            if (card) card.style.display = 'none';
        }).catch(function (err) {
            _notify('Could not mark this item as sold. Please try again.', 'error');
            btn.disabled = false;
        });
    }

    function _sweepCards() {
        document.querySelectorAll('#property-grid-container .property-card').forEach(_ensureCardGovernanceControls);
    }

    var _cardObserver = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            m.addedNodes.forEach(function (node) {
                if (!node.querySelectorAll) return;
                if (node.classList && node.classList.contains('property-card')) _ensureCardGovernanceControls(node);
                node.querySelectorAll('.property-card').forEach(_ensureCardGovernanceControls);
            });
        });
    });
    _cardObserver.observe(document.body, { childList: true, subtree: true });

    /* =========================================================================
       §2  BUYER REPORTING
       ========================================================================= */
    function _ensureReportModal() {
        if (document.getElementById('emp-gov-report-modal')) return;
        var wrap = document.createElement('div');
        wrap.id = 'emp-gov-report-modal';
        wrap.innerHTML =
            '<div class="gov-report-card">' +
                '<h3>Report</h3>' +
                '<p class="gov-sub">Let us know what\'s wrong. Our team reviews every report.</p>' +
                '<label>Reason</label>' +
                '<select id="gov-report-reason">' +
                    '<option value="child_exploitation">Child sexual abuse or exploitation</option>' +
                    '<option value="scam_fraud">Scam or fraud</option>' +
                    '<option value="counterfeit">Counterfeit or prohibited item</option>' +
                    '<option value="misleading">Misleading listing</option>' +
                    '<option value="harassment">Harassment or abuse</option>' +
                    '<option value="other">Other</option>' +
                '</select>' +
                '<label>Details (optional)</label>' +
                '<textarea id="gov-report-details" placeholder="Anything else we should know?"></textarea>' +
                '<div class="gov-report-actions">' +
                    '<button type="button" class="gov-report-cancel" id="gov-report-cancel-btn">Cancel</button>' +
                    '<button type="button" class="gov-report-submit" id="gov-report-submit-btn">Submit Report</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(wrap);

        document.getElementById('gov-report-cancel-btn').addEventListener('click', _closeReportModal);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) _closeReportModal(); });
    }

    function _closeReportModal() {
        var m = document.getElementById('emp-gov-report-modal');
        if (m) m.classList.remove('open');
    }

    var _reportCtx = null;

    function _empGovReportTarget(type, targetId, sellerId) {
        if (_isGuest() || !_us().id) { _notify('Please log in to submit a report.', 'error'); return; }
        if (!targetId) { _notify('Could not identify this item — please try again.', 'error'); return; }
        _ensureReportModal();
        _reportCtx = { type: type, targetId: targetId, sellerId: sellerId || targetId };
        var reasonEl = document.getElementById('gov-report-reason');
        var detailsEl = document.getElementById('gov-report-details');
        if (reasonEl) reasonEl.value = 'scam_fraud';
        if (detailsEl) detailsEl.value = '';
        document.getElementById('emp-gov-report-modal').classList.add('open');

        var submitBtn = document.getElementById('gov-report-submit-btn');
        submitBtn.onclick = function () {
            _submitReport(submitBtn);
        };
    }
    window._empGovReportTarget = _empGovReportTarget;

    function _submitReport(submitBtn) {
        if (!_reportCtx) return;
        var db = _fbDb();
        if (!db) { _notify('Reporting isn\'t available right now.', 'error'); return; }
        var us = _us();
        var reason = (document.getElementById('gov-report-reason') || {}).value || 'other';
        var details = (document.getElementById('gov-report-details') || {}).value || '';

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';

        var reportDoc = {
            type: _reportCtx.type,
            targetId: _reportCtx.targetId,
            sellerId: _reportCtx.sellerId,
            reporterId: us.id,
            reporterName: us.fullName || us.username || 'User',
            reason: reason,
            details: details.trim(),
            status: 'open',
            createdAt: new Date().toISOString()
        };

        db.collection('marketplace_reports').add(reportDoc).then(function () {
            /* Child-exploitation reports additionally go into
               moderation_flags — the same admin-reviewed collection
               app-fixes.js's auto-moderation writer and app-reel.js's
               CSAE report path both already use — so this surfaces to
               admins immediately instead of sitting in the normal
               marketplace_reports queue alongside scam/counterfeit
               reports. Best-effort: failure here doesn't block the
               report the buyer already successfully submitted above. */
            if (reason === 'child_exploitation') {
                db.collection('moderation_flags').add({
                    type: _reportCtx.type,
                    targetId: _reportCtx.targetId,
                    sellerId: _reportCtx.sellerId,
                    reason: 'Child sexual abuse or exploitation (user report)',
                    severity: 'urgent',
                    reporterId: us.id || null,
                    flaggedAt: new Date().toISOString()
                }).catch(function () {});
            }
            _notify('Report submitted. Thank you — our team will review it.', 'success');
            _closeReportModal();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
        }).catch(function () {
            _notify('Could not submit your report. Please try again.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Report';
        });
    }

    /* =========================================================================
       §3  ADMIN — KYC APPROVAL QUEUE  (#admin-kyc-docs-container)
       ========================================================================= */
    function _kycRowHTML(id, k) {
        var bioBits = [];
        if (k.phone) bioBits.push('<i class="fas fa-phone"></i> ' + _esc(k.phone));
        if (k.email) bioBits.push('<i class="fas fa-envelope"></i> ' + _esc(k.email));
        if (k.dob) bioBits.push('<i class="fas fa-birthday-cake"></i> ' + _esc(k.dob));
        if (k.stateOfResidence) bioBits.push('<i class="fas fa-map-marker-alt"></i> ' + _esc(k.stateOfResidence));
        if (k.address) bioBits.push('<i class="fas fa-home"></i> ' + _esc(k.address));

        var docLinks = [];
        if (k.documents && k.documents.idDocument) docLinks.push('<a href="' + _esc(k.documents.idDocument) + '" target="_blank" rel="noopener">View ID Doc</a>');
        if (k.documents && k.documents.businessCertificate) docLinks.push('<a href="' + _esc(k.documents.businessCertificate) + '" target="_blank" rel="noopener">View Business Cert</a>');

        return '<div class="gov-admin-row" data-kyc-id="' + _esc(id) + '" data-kyc-uid="' + _esc(k.userId || '') + '">' +
            '<div class="gov-row-head">' +
                '<div><div class="gov-row-title">' + _esc(k.businessName || k.username || 'Submission') + '</div>' +
                '<div class="gov-row-sub">@' + _esc(k.username || '—') + ' &middot; ' + _esc(k.type || 'kyc') + ' &middot; ' + _esc(k.idType || '') + ' ' + _esc(k.idNumber || '') + '</div></div>' +
                '<div class="gov-row-sub">' + _fmtDate(k.submittedAt) + '</div>' +
            '</div>' +
            (bioBits.length ? '<div class="gov-row-meta">' + bioBits.join(' &nbsp; ') + '</div>' : '') +
            (docLinks.length ? '<div class="gov-row-meta">' + docLinks.join(' &nbsp;|&nbsp; ') + '</div>' : '') +
            '<div class="gov-row-actions">' +
                '<button class="gov-btn-approve" data-act="approve">Approve</button>' +
                '<button class="gov-btn-reject" data-act="reject">Reject</button>' +
            '</div>' +
        '</div>';
    }

    function _loadKycQueue() {
        var db = _fbDb();
        var container = document.getElementById('admin-kyc-docs-container');
        var badge = document.getElementById('kyc-pending-badge');
        if (!db || !container) return;

        db.collection('kyc_submissions').where('status', '==', 'pending').limit(50).get()
            .then(function (snap) {
                if (badge) badge.textContent = snap.size + ' Pending';
                if (snap.empty) {
                    container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--color-neutral-350);">No KYC submissions yet.</p>';
                    return;
                }
                var rows = [];
                snap.forEach(function (doc) { rows.push({ id: doc.id, data: doc.data() }); });
                rows.sort(function (a, b) { return (b.data.submittedAt || '').localeCompare(a.data.submittedAt || ''); });
                container.innerHTML = rows.map(function (r) { return _kycRowHTML(r.id, r.data); }).join('');
                container.querySelectorAll('.gov-row-actions button').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var row = btn.closest('.gov-admin-row');
                        _resolveKyc(row.dataset.kycId, row.dataset.kycUid, btn.dataset.act, btn);
                    });
                });
            })
            .catch(function (err) {
                container.innerHTML = '<p style="text-align:center;padding:20px;color:#EF4444;">Could not load KYC submissions: ' + _esc(err && err.message) + '</p>';
            });
    }

    function _resolveKyc(kycId, uid, action, btn) {
        var db = _fbDb();
        if (!db || !kycId || !uid) return;
        var rowButtons = btn.closest('.gov-row-actions').querySelectorAll('button');
        rowButtons.forEach(function (b) { b.disabled = true; });

        db.collection('kyc_submissions').doc(kycId).get().then(function (doc) {
            var k = doc.exists ? (doc.data() || {}) : {};
            var kycUpdate = { status: action === 'approve' ? 'approved' : 'rejected', reviewedAt: new Date().toISOString() };
            var userUpdate = {};

            if (action === 'approve') {
                userUpdate = {
                    isVerified: true,
                    kycStatus: 'verified',
                    sellerVerificationStatus: 'verified'
                };
                if (k.phone) userUpdate.phone = k.phone;
                if (k.email) userUpdate.email = k.email;
                if (k.address) userUpdate.address = k.address;
                if (k.dob) userUpdate.dob = k.dob;
                if (k.stateOfResidence) userUpdate.stateOfResidence = k.stateOfResidence;
            } else {
                userUpdate = { kycStatus: 'rejected', sellerVerificationStatus: 'rejected' };
            }

            return Promise.all([
                db.collection('kyc_submissions').doc(kycId).set(kycUpdate, { merge: true }),
                db.collection('users').doc(uid).set(userUpdate, { merge: true })
            ]);
        }).then(function () {
            _notify('KYC submission ' + (action === 'approve' ? 'approved' : 'rejected') + '.', 'success');
            _loadKycQueue();
        }).catch(function (err) {
            _notify('Could not update this submission: ' + (err && err.message || 'unknown error'), 'error');
            rowButtons.forEach(function (b) { b.disabled = false; });
        });
    }

    /* =========================================================================
       §4  ADMIN — REPORTS & MODERATION  (injected card)
       ========================================================================= */
    function _ensureReportsCard() {
        if (document.getElementById('admin-reports-container')) return;
        var kycCard = document.getElementById('admin-kyc-docs-container');
        var kycCardWrapper = kycCard && kycCard.closest('.card');
        if (!kycCardWrapper || !kycCardWrapper.parentNode) return;

        var card = document.createElement('div');
        card.className = 'card';
        card.style.marginBottom = '20px';
        card.innerHTML =
            '<h3><span><i class="fas fa-flag" style="color:var(--primary-color)"></i> Reports &amp; Moderation</span>' +
                '<span id="gov-reports-badge" style="font-size:var(--text-sm);background:var(--accent-color);color:#222;padding:3px 10px;border-radius:12px;margin-left:10px;">0 Open</span>' +
            '</h3>' +
            '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><div id="admin-reports-container" class="card-content" style="padding:0;min-width:580px;">' +
                '<p style="text-align:center;padding:20px;color:var(--color-neutral-350);">No open reports.</p>' +
            '</div></div>';

        kycCardWrapper.parentNode.insertBefore(card, kycCardWrapper.nextSibling);
    }

    function _reportRowHTML(id, r) {
        var typeLabel = r.type === 'seller' ? 'Seller Profile' : 'Listing';
        return '<div class="gov-admin-row" data-report-id="' + _esc(id) + '" data-target-id="' + _esc(r.targetId || '') + '" data-seller-id="' + _esc(r.sellerId || '') + '" data-report-type="' + _esc(r.type || '') + '">' +
            '<div class="gov-row-head">' +
                '<div><div class="gov-row-title">' + typeLabel + ' reported</div>' +
                '<div class="gov-row-sub">Reason: ' + _esc((r.reason || 'other').replace(/_/g, ' ')) + ' &middot; by ' + _esc(r.reporterName || 'user') + '</div></div>' +
                '<div class="gov-row-sub">' + _fmtDate(r.createdAt) + '</div>' +
            '</div>' +
            (r.details ? '<div class="gov-row-meta">' + _esc(r.details) + '</div>' : '') +
            '<div class="gov-row-actions">' +
                (r.type === 'listing' ? '<button class="gov-btn-neutral" data-act="delist">Delist Listing</button>' : '') +
                '<button class="gov-btn-warn" data-act="suspend">Suspend Seller</button>' +
                '<button class="gov-btn-danger" data-act="ban">Ban Seller</button>' +
                '<button class="gov-btn-neutral" data-act="resolve">Resolve (No Action)</button>' +
            '</div>' +
        '</div>';
    }

    function _loadReportsQueue() {
        var db = _fbDb();
        _ensureReportsCard();
        var container = document.getElementById('admin-reports-container');
        var badge = document.getElementById('gov-reports-badge');
        if (!db || !container) return;

        db.collection('marketplace_reports').where('status', '==', 'open').limit(50).get()
            .then(function (snap) {
                if (badge) badge.textContent = snap.size + ' Open';
                if (snap.empty) {
                    container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--color-neutral-350);">No open reports.</p>';
                    return;
                }
                var rows = [];
                snap.forEach(function (doc) { rows.push({ id: doc.id, data: doc.data() }); });
                rows.sort(function (a, b) { return (b.data.createdAt || '').localeCompare(a.data.createdAt || ''); });
                container.innerHTML = rows.map(function (r) { return _reportRowHTML(r.id, r.data); }).join('');
                container.querySelectorAll('.gov-row-actions button').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var row = btn.closest('.gov-admin-row');
                        _handleReportAction(row, btn.dataset.act, btn);
                    });
                });
            })
            .catch(function (err) {
                container.innerHTML = '<p style="text-align:center;padding:20px;color:#EF4444;">Could not load reports: ' + _esc(err && err.message) + '</p>';
            });
    }

    function _handleReportAction(row, action, btn) {
        var db = _fbDb();
        if (!db) return;
        var reportId = row.dataset.reportId;
        var targetId = row.dataset.targetId;
        var sellerId = row.dataset.sellerId;
        var reportType = row.dataset.reportType;

        if (!btn._confirming && (action === 'ban' || action === 'delist')) {
            btn._confirming = true;
            var original = btn.textContent;
            btn.textContent = 'Confirm?';
            setTimeout(function () { btn._confirming = false; btn.textContent = original; }, 4000);
            return;
        }

        row.querySelectorAll('button').forEach(function (b) { b.disabled = true; });

        var work;
        if (action === 'resolve') {
            work = db.collection('marketplace_reports').doc(reportId).set({ status: 'resolved' }, { merge: true });
        } else if (action === 'delist' && reportType === 'listing') {
            work = db.collection('marketplace_listings').doc(targetId).set({ status: 'delisted' }, { merge: true })
                .then(function () { return db.collection('marketplace_reports').doc(reportId).set({ status: 'resolved' }, { merge: true }); });
        } else if (action === 'suspend') {
            work = _empGovModerateUser(sellerId, 'suspend')
                .then(function () { return db.collection('marketplace_reports').doc(reportId).set({ status: 'resolved' }, { merge: true }); });
        } else if (action === 'ban') {
            work = _empGovModerateUser(sellerId, 'ban')
                .then(function () { return db.collection('marketplace_reports').doc(reportId).set({ status: 'resolved' }, { merge: true }); });
        } else {
            row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
            return;
        }

        work.then(function () {
            _notify('Report handled.', 'success');
            _loadReportsQueue();
        }).catch(function (err) {
            _notify('Could not complete this action: ' + (err && err.message || 'unknown error'), 'error');
            row.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
        });
    }

    /* =========================================================================
       §5  MODERATE USER — suspend / ban / reactivate. Called both from the
       Reports queue above and from app-admin.js's per-user detail panel.
       Ban cascades: every active listing owned by this seller is delisted.
       ========================================================================= */
    function _empGovModerateUser(uid, action) {
        var db = _fbDb();
        if (!db || !uid) return Promise.reject(new Error('Not connected'));

        var userUpdate;
        if (action === 'suspend') userUpdate = { suspended: true, suspendedAt: new Date().toISOString() };
        else if (action === 'ban') userUpdate = { banned: true, suspended: true, bannedAt: new Date().toISOString() };
        else if (action === 'reactivate') userUpdate = { suspended: false, banned: false };
        else return Promise.reject(new Error('Unknown action'));

        var p = db.collection('users').doc(uid).set(userUpdate, { merge: true });

        if (action === 'ban') {
            p = p.then(function () {
                return db.collection('marketplace_listings').where('sellerId', '==', uid).limit(200).get();
            }).then(function (snap) {
                var writes = [];
                snap.forEach(function (doc) {
                    var d = doc.data();
                    if (d && d.status !== 'sold' && d.status !== 'delisted') {
                        writes.push(doc.ref.set({ status: 'delisted' }, { merge: true }).catch(function () {}));
                    }
                });
                return Promise.all(writes);
            });
        }

        return p.then(function () {
            /* Invalidate the local banned-seller cache so the marketplace
               grid re-checks this seller's cards next render. */
            delete _bannedSellerCache[uid];
        });
    }
    window._empGovModerateUser = _empGovModerateUser;

    /* =========================================================================
       §BOOTSTRAP
       ========================================================================= */
    function _initGovernance() {
        _watchListingStates();
        _sweepCards();
        if (_isAdmin()) {
            _loadKycQueue();
            _loadReportsQueue();
        }
    }

    _ready(function () { setTimeout(_initGovernance, 500); });
    document.addEventListener('empyrean-init-done', function () { setTimeout(_initGovernance, 600); });
    /* FIX: user auth can resolve after the sweeps above already ran (see
       _ensureCardGovernanceControls timing fix) — re-sweep once userState.id
       is actually available so the Mark as Sold button reliably appears. */
    document.addEventListener('empyrean-user-ready', function () { setTimeout(_sweepCards, 300); });
    document.addEventListener('empyrean-section-change', function (ev) {
        var section = ev && ev.detail && ev.detail.section;
        if (section === 'marketplace') setTimeout(_sweepCards, 300);
        if (section === 'admin' && _isAdmin()) setTimeout(function () { _loadKycQueue(); _loadReportsQueue(); }, 300);
    });

    console.log('[EmpMarketGovernance] ✅ Sold-item lifecycle + buyer reporting + admin KYC/reports moderation active.');

})();