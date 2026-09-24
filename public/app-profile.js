/* =============================================================================
   EMPYREAN INTERNATIONAL — USER PROFILE SYSTEM
   app-profile.js  |  Step 0.9  |  Refactor Roadmap v1.0
   =============================================================================

   PURPOSE
   ───────
   Complete profile system extracted from app-fixes.js.  Covers:

     • renderUserProfile(userId)   — full profile page builder
     • renderMonetizationTab()     — earnings / withdrawal eligibility
     • renderBusinessPage()        — business page (create + view)
     • populateProfileGallery()    — 3-col gallery from DOM feed posts
     • _populateHomeBioCard()      — home card trigger (delegates to renderSuggestedUsers)
     • showFollowersModal(tab)     — followers / following modal
     • showFollowingModal()        — alias
     • Story-header click → navigate to user profile (delegated)
     • Profile tab switching
     • Profile post submit (inside dashboard tab)

   LOAD ORDER
   ──────────
   Must come AFTER: firebase-init, app-state, app-helpers, app-contracts,
   app-notifications, app-tags, app-dom (when extracted), app-auth, app-feed.

   DEPENDS ON
   ──────────
   • window.EmpState / window.userState / window.isGuest / window.isAdmin
   • window.mockUsers / window.registeredUsers
   • window.fbDb / window._firebaseLoaded
   • window.formatUsdPrice          (app-helpers.js)
   • window.showNotification        (app-helpers.js)
   • window.uploadMediaFilesToCloudinary (app-helpers.js)
   • window.createNewPostElement    (app-feed.js)
   • window.navigateTo              (app-dom.js)
   • window.showMarketplaceGallery  (app-marketplace.js — optional)
   • window.populateDobSelectors    (app-helpers.js)

   PUBLIC API
   ──────────
   window.renderUserProfile(userId)
   window.renderMonetizationTab()
   window.renderBusinessPage()
   window.populateProfileGallery(userId)
   window._populateHomeBioCard()
   window.showFollowersModal(tab?)
   window.showFollowingModal()

   SECTION MAP
   ───────────
   §1  renderUserProfile — full profile page builder
   §2  renderMonetizationTab
   §3  renderBusinessPage
   §4  populateProfileGallery
   §5  _populateHomeBioCard
   §6  showFollowersModal / showFollowingModal
   §7  Profile tab switching (MutationObserver delegated)
   §8  Story-header click → user profile navigation

   ============================================================================= */

(function empyreanProfileModule() {
    'use strict';

    if (window._empyreanProfileLoaded) {
        console.warn('[EmpProfile] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanProfileLoaded = true;

    /* Shorthand helpers */
    function _S()       { return window.EmpState || {}; }
    function _us()      { return _S().userState || window.userState || {}; }
    function _mu()      { return (_S().mockUsers) || window.mockUsers || {}; }
    function _isGuest() { var s = _S(); return s.isGuest != null ? s.isGuest : window.isGuest; }
    function _isAdmin() { var s = _S(); return s.isAdmin != null ? s.isAdmin : window.isAdmin; }

    /* Ranking tiers referenced by renderMonetizationTab — DISPLAY COPY ONLY.
       MUST stay identical to app-wallet.js's RANKS (the table that actually
       pays out via checkAndAwardRank) or this tab promises a reward amount
       the user won't actually receive.

       FIX (2026-08-15 — token-allocation review): this list previously used
       completely different tier names/thresholds/amounts than the ones
       app-wallet.js actually paid out (e.g. this said reaching 50,000
       followers earned 50,000 EMPY; app-wallet.js's real payout for that
       same threshold was 1,000 EMPY) — a genuine broken promise to users,
       not just a stale comment. Replaced with an exact copy of
       app-wallet.js's now-reduced canonical list. */
    var RANKS = [
        { id: 'rank-1', name: 'Rising Star',     followers: 500,      reward: 5    },
        { id: 'rank-2', name: 'Community Voice',  followers: 1000,     reward: 10   },
        { id: 'rank-3', name: 'Influencer',       followers: 5000,     reward: 25   },
        { id: 'rank-4', name: 'Advocate',         followers: 10000,    reward: 50   },
        { id: 'rank-5', name: 'Leader',           followers: 50000,    reward: 100  },
        { id: 'rank-6', name: 'Beacon',           followers: 100000,   reward: 250  },
        { id: 'rank-7', name: 'Champion',         followers: 250000,   reward: 500  },
        { id: 'rank-8', name: 'Ambassador',       followers: 500000,   reward: 1000 },
        { id: 'rank-9', name: 'Legend',           followers: 1000000,  reward: 2500 }
    ];

    function _attr(s) { return String(s || '').replace(/"/g, '&quot;'); }
    function _esc(s)  {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* FIX (2026-08-10 — reel strip duplicating + landing at the bottom
       instead of mid-feed): renderUserProfile() rebuilds #profile's
       entire innerHTML synchronously, then schedules
       _mountProfileFeedReelStrip() 500ms later via setTimeout. If
       renderUserProfile() runs again before that timeout fires — a second
       nav to the same/another profile, a story-header click re-render
       (§8), anything re-invoking it — the EARLIER call's still-pending
       timeout was never cancelled. It fires later, does a fresh
       document.getElementById() lookup, finds the CURRENT (later) DOM
       tree, and mounts a strip into it — on top of whichever strip the
       later call's own timeout already mounted. Each stale timeout adds
       one more duplicate strip; that's the "3 horizontal cards instead
       of 1". This token makes every scheduled mount check, right before
       it runs, that it's still the most recent renderUserProfile() call
       for this profile — a stale one is a no-op instead of mounting into
       DOM it no longer "owns". */
    var _profileReelStripToken = 0;

    /* Same staleness-guard as _profileReelStripToken above, for the
       quote/meme thumbnail strip's own delayed mount (see
       _mountProfileFeedQuoteMemeStrip() near the bottom of this file). */
    var _profileQuoteMemeStripToken = 0;

    /* Same staleness-guard pattern as _profileReelStripToken above, for the
       Birthday Messages section's own delayed mount (see
       _mountProfileBirthdayFeed() near the bottom of this file). */
    var _profileBirthdayToken = 0;

    /* =========================================================================
       Owner reel gallery / feed-strip CSS (§9) — injected at runtime per this
       codebase's convention (style.css/token.css are never edited directly).
       ========================================================================= */
    (function _injectReelGalleryCSS() {
        if (document.getElementById('_emp_profile_reel_css')) return;
        var s = document.createElement('style');
        s.id = '_emp_profile_reel_css';
        s.textContent = [
            /* "Reels" tab thumbnail grid — visually distinct from the plain
               Photos/Videos gallery grid (indigo/violet accent border+glow,
               matching the KYC/verification accent color already used
               elsewhere on this same profile page) so it reads as its own
               section, not a variant of the media gallery. */
            '.emp-profile-reel-thumb {',
            /* FIX (report — "implement exactly the video gallery grid in
               screenshot 1, let all the video frames be of equal size"):
               was 9/16 (portrait reel-shaped) — the reference grid uses
               uniform square tiles, same as the new Pictures tab below,
               so every tile in both tabs now shares one frame shape. */
            '  position: relative; aspect-ratio: 1 / 1; border-radius: 10px;',
            '  overflow: hidden; background: #0A0E27; cursor: pointer;',
            '  box-shadow: 0 2px 8px rgba(10,14,39,0.12);',
            '  border: 1.5px solid rgba(91,14,166,0.18);',
            '  transition: transform 0.18s, box-shadow 0.18s;',
            '}',
            '.emp-profile-reel-thumb:hover { transform: scale(1.035); box-shadow: 0 6px 18px rgba(91,14,166,0.28); }',
            '.emp-profile-reel-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }',
            '.emp-profile-reel-play {',
            '  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;',
            '  background: linear-gradient(135deg, rgba(27,43,139,0.15), rgba(91,14,166,0.28)); pointer-events: none;',
            '}',
            '.emp-profile-reel-play span {',
            '  width: 30px; height: 30px; background: rgba(255,255,255,0.92); border-radius: 50%;',
            '  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.25);',
            '}',
            '.emp-profile-reel-play i { color: #5B0EA6; font-size: 0.7rem; margin-left: 2px; }',
            /* view-count badge, bottom-left play-triangle + number, matching
               the reference screenshot's "▷ 321" style overlay. Shared by
               both the Reels tab (populateProfileReelsGallery) and the
               Videos tab (populateProfileGallery) — same look, same class,
               each just feeds it a different count source. */
            '.emp-profile-reel-viewcount {',
            '  position: absolute; left: 8px; bottom: 7px; color: #fff; font-size: 0.82rem; font-weight: 700;',
            '  display: flex; align-items: center; gap: 5px; text-shadow: 0 1px 3px rgba(0,0,0,0.55); pointer-events: none;',
            '}',
            '.emp-profile-reel-viewcount i { font-size: 0.72rem; }',
            /* NEW — Pictures tab thumbnail: same square footprint as the
               Reels tab above (report item #2 — "same frame size"), plain
               neutral border since there's no play glyph to accent here. */
            '.emp-profile-pic-thumb {',
            '  position: relative; aspect-ratio: 1 / 1; border-radius: 10px;',
            '  overflow: hidden; background: #e8eaf0; cursor: pointer;',
            '  box-shadow: 0 2px 8px rgba(10,14,39,0.10); border: 1.5px solid rgba(10,14,39,0.07);',
            '  transition: transform 0.18s, box-shadow 0.18s;',
            '}',
            '.emp-profile-pic-thumb:hover { transform: scale(1.035); box-shadow: 0 6px 18px rgba(10,14,39,0.18); }',
            '.emp-profile-pic-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
            /* NEW — Gallery tab thumbnail (now videos-only — see
               populateProfileGallery's own header comment for why photos
               moved out to the Pictures tab). Same square footprint and
               same hover polish as the other two tabs' thumbnails, so all
               three galleries now read as one consistent, "premium"
               family of tiles rather than three different-looking grids. */
            '.emp-profile-video-thumb {',
            '  position: relative; aspect-ratio: 1 / 1; border-radius: 10px;',
            '  overflow: hidden; background: #0A0E27; cursor: pointer;',
            '  box-shadow: 0 2px 8px rgba(10,14,39,0.10); border: 1.5px solid rgba(10,14,39,0.07);',
            '  transition: transform 0.18s, box-shadow 0.18s;',
            '}',
            '.emp-profile-video-thumb:hover { transform: scale(1.035); box-shadow: 0 6px 18px rgba(10,14,39,0.18); }',
            '.emp-profile-video-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }',
            '.emp-profile-video-play {',
            '  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;',
            '  background: rgba(0,0,0,0.22); pointer-events: none;',
            '}',
            '.emp-profile-video-play span {',
            '  width: 34px; height: 34px; background: rgba(255,255,255,0.92); border-radius: 50%;',
            '  display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.25);',
            '}',
            '.emp-profile-video-play i { color: #0A0E27; font-size: 0.78rem; margin-left: 3px; }',
            '.emp-profile-video-count {',
            '  position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.55); color: #fff;',
            '  border-radius: 50px; padding: 2px 7px; font-size: 0.7rem; font-weight: 700;',
            '}',
            /* Feed-strip card — same footprint as .dashboard-reel-card so it
               sits comfortably inside the existing .horizontal-slider-wrapper
               swipe/scroll-snap machinery, but its own class so it never
               triggers app-reel.js's "dashboard card → navigate to Reels
               section" click behavior (see .reel-preview-card below instead,
               which opens the actual reel in place). */
            '.emp-profile-feed-reel-card {',
            '  width: 150px; height: 240px; flex-shrink: 0; position: relative;',
            '  border-radius: 16px; overflow: hidden; display: inline-block; cursor: pointer;',
            '  box-shadow: 0 4px 16px rgba(91,14,166,0.20), 0 1px 3px rgba(10,14,39,0.10);',
            '  transition: transform 0.22s ease, box-shadow 0.22s ease;',
            '}',
            '.emp-profile-feed-reel-card:hover { transform: translateY(-4px); box-shadow: 0 10px 28px rgba(91,14,166,0.28); }',
            '.emp-profile-feed-reel-card::before {',
            '  content: ""; position: absolute; inset: 0; z-index: 2;',
            '  background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%);',
            '}',
            '.emp-profile-feed-reel-card video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }',
            '.emp-profile-feed-reel-card .emp-pfrc-avatar {',
            '  position: absolute; bottom: 10px; left: 10px; z-index: 3; width: 30px; height: 30px;',
            '  border-radius: 50%; overflow: hidden; border: 2px solid #fff; box-shadow: 0 2px 8px rgba(10,14,39,0.35);',
            '}',
            '.emp-profile-feed-reel-card .emp-pfrc-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }',
            '.emp-profile-reel-strip-card { border: 1px solid rgba(91,14,166,0.14); }',
            '.emp-profile-reel-strip-card .emp-pfrs-header {',
            '  display: flex; align-items: center; gap: 8px; padding: 14px 16px 2px;',
            '}'
        ].join('\n');
        (document.head || document.documentElement).appendChild(s);
    })();


    /* =========================================================================
       §1  renderUserProfile
       Builds the entire #profile section HTML for the given user ID.
       ========================================================================= */

    function renderUserProfile(userId) {
        var mu   = _mu();
        var user = mu[userId];
        if (!user) {
            console.error('[Profile] User not found:', userId);
            return;
        }
        var us   = _us();
        var profileSection = document.getElementById('profile');
        if (!profileSection) return;

        var isMyProfile = !_isGuest() && user.id === us.id;

        // Birthday check — dobMonthDay ('MM-DD', written once at signup —
        // see app-auth.js's newUser object) compared against today's own
        // local 'MM-DD'. Shown to OTHER visitors only (the person doesn't
        // need to gift themselves); doesn't depend on dobVisibility, since
        // a follower already knows today is this person's birthday from
        // the push notification (app-push-setup.js/server.js) — this button
        // isn't what reveals the date.
        var _now = new Date();
        var _todayMonthDay = String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0');
        var isBirthdayToday = !isMyProfile && !!user.dobMonthDay && user.dobMonthDay === _todayMonthDay;

        /* FIX (back-arrow tap not responding on another user's profile):
           .mobile-menu-toggle (nav-patch.css) is position:fixed;top:12px;
           left:12px;width:40px;height:40px;z-index:9998 — sitting directly
           on top of the "← My Profile" back button below, which renders as
           the very first element in this section's scrollable content, at
           that same top-left corner, with no elevated z-index of its own.
           Being fixed, the toggle wins every tap in that 40x40 box
           regardless of what's underneath, so the back button never
           actually receives the click. Same overlap class this codebase
           already works around for the reel viewer/thread view/marketplace
           (see app-reel.js's 'reel-open', app-thread.js's 'vf-thread-open',
           style.css's 'mkt-hide-menu-toggle') — same fix here: hide the
           toggle for as long as the back button is the thing occupying
           that corner, and restore it the moment this is the user's own
           profile (no back button, no overlap) or the section is left. */
        document.body.classList.toggle('viewing-other-profile', !isMyProfile);

        /* ── KYC form HTML (rendered only on own profile) ── */
        function _kycField(label, id, type, required) {
            return '<div class="form-group"><label for="' + _attr(id) + '">' + label + '</label>'
                + '<input type="' + (type || 'text') + '" id="' + _attr(id) + '"'
                + (required ? ' required' : '') + '></div>';
        }
        function _kycUpload(label, inputId, iconClass) {
            return '<div class="form-group"><label>' + label + '</label>'
                + '<div class="upload-area kyc-file-upload" data-input-id="' + _attr(inputId) + '">'
                + '<i class="fas ' + iconClass + '"></i><span>Click to upload</span></div>'
                + '<input type="file" id="' + _attr(inputId) + '" accept="image/*,.pdf" style="display:none;" required>'
                + '<span class="file-upload-preview" id="' + _attr(inputId) + '-preview"></span></div>';
        }
        function _kycSelfie(btnId) {
            return '<div class="form-group"><label>Selfie Verification</label>'
                + '<button type="button" class="btn btn-small live-capture-btn" id="' + _attr(btnId) + '" data-captured="false">'
                + '<i class="fas fa-camera"></i> Capture Live Selfie</button>'
                + '<span class="file-upload-preview" id="' + _attr(btnId) + '-preview"></span></div>';
        }

        var kycFormHTML =
            '<div class="card"><div class="card-content">'
            + '<h3><i class="fas fa-shield-alt"></i> Account Verification (KYC)</h3>'
            + '<p>Complete verification to access all platform features, including withdrawals.</p>'
            + '<hr style="border:1px solid #eee;margin:20px 0;">'
            + '<div id="kyc-entity-selector-container"><h4>Step 1: Select Entity Type</h4>'
            + '<div id="kyc-entity-selector" style="margin-top:20px;">'
            + '<div class="kyc-entity-btn" data-form="individual-kyc-form"><i class="fas fa-user"></i><span>Individual</span></div>'
            + '<div class="kyc-entity-btn" data-form="ngo-kyc-form"><i class="fas fa-sitemap"></i><span>NGO</span></div>'
            + '<div class="kyc-entity-btn" data-form="company-kyc-form"><i class="fas fa-building"></i><span>Company</span></div>'
            + '<div class="kyc-entity-btn" data-form="cooperative-kyc-form"><i class="fas fa-users"></i><span>Cooperative</span></div>'
            + '<div class="kyc-entity-btn" data-form="government-kyc-form"><i class="fas fa-landmark"></i><span>Government Agency</span></div>'
            + '<div class="kyc-entity-btn" data-form="international-kyc-form"><i class="fas fa-globe"></i><span>International Organization</span></div>'
            + '</div></div>'
            + '<div id="kyc-forms-container" style="margin-top:30px;">'
            /* Individual */
            + '<form id="individual-kyc-form" class="kyc-form" novalidate>'
            + '<h4>Step 2: Individual Verification</h4>'
            + '<div class="grid-2">'
            + _kycField('First Name', 'kyc-ind-fname', 'text', true)
            + _kycField('Last Name', 'kyc-ind-lname', 'text', true) + '</div>'
            + '<div class="form-group"><label>Date of Birth</label><div class="date-select-group">'
            + '<select required><option value="">Day</option></select>'
            + '<select required><option value="">Month</option></select>'
            + '<select required><option value="">Year</option></select></div></div>'
            + '<div class="form-group"><label for="kyc-ind-gender">Gender</label>'
            + '<select id="kyc-ind-gender" required><option value="">--Select--</option><option>Male</option><option>Female</option></select></div>'
            + _kycField('Phone', 'kyc-ind-phone', 'tel', true)
            + _kycField('Email', 'kyc-ind-email', 'email', true)
            + _kycField('Residential Address', 'kyc-ind-address', 'text', true)
            + '<div class="form-group"><label for="kyc-ind-id-type">ID Type</label>'
            + '<select id="kyc-ind-id-type" required><option value="">--Select--</option>'
            + '<option>Passport</option><option>National ID</option><option>Driver\'s License</option><option>Voter\'s Card</option></select></div>'
            + _kycField('ID Number', 'kyc-ind-id-number', 'text', true)
            + _kycUpload('Upload ID (Front & Back)', 'kyc-ind-id-upload', 'fa-id-card')
            + _kycSelfie('kyc-ind-selfie-btn')
            + '<button type="submit" class="btn btn-accent">Submit Verification</button>'
            + '</form>'
            /* Company */
            + '<form id="company-kyc-form" class="kyc-form" novalidate>'
            + '<h4>Step 2: Company Verification</h4>'
            + _kycField('Organisation Name', 'kyc-com-name', 'text', true)
            + _kycField('CAC Registration Number', 'kyc-com-cac', 'text', true)
            + _kycField('SCUML Certificate Number', 'kyc-com-scuml', 'text', true)
            + _kycField('CEO/Representative Name', 'kyc-com-rep-name', 'text', true)
            + _kycField('Official Phone', 'kyc-com-phone', 'tel', true)
            + _kycField('Official Email', 'kyc-com-email', 'email', true)
            + _kycField('Office Address', 'kyc-com-address', 'text', true)
            + _kycUpload('Upload CAC Certificate', 'kyc-com-cac-upload', 'fa-file-alt')
            + _kycUpload('Upload SCUML Certificate', 'kyc-com-scuml-upload', 'fa-file-alt')
            + _kycUpload("Representative's ID", 'kyc-com-rep-id-upload', 'fa-id-card')
            + _kycSelfie('kyc-com-selfie-btn')
            + '<button type="submit" class="btn btn-accent">Submit Verification</button>'
            + '</form>'
            /* NGO */
            + '<form id="ngo-kyc-form" class="kyc-form" novalidate>'
            + '<h4>Step 2: NGO Verification</h4>'
            + _kycField('Organisation Name', 'kyc-ngo-name', 'text', true)
            + _kycField('CAC Registration Number', 'kyc-ngo-cac', 'text', true)
            + _kycField('SCUML Certificate Number', 'kyc-ngo-scuml', 'text', true)
            + _kycField('President/Representative Name', 'kyc-ngo-rep-name', 'text', true)
            + _kycField('Official Phone', 'kyc-ngo-phone', 'tel', true)
            + _kycField('Official Email', 'kyc-ngo-email', 'email', true)
            + _kycField('Office Address', 'kyc-ngo-address', 'text', true)
            + _kycUpload('Upload CAC Certificate', 'kyc-ngo-cac-upload', 'fa-file-alt')
            + _kycUpload('Upload SCUML Certificate', 'kyc-ngo-scuml-upload', 'fa-file-alt')
            + _kycUpload("Representative's ID", 'kyc-ngo-rep-id-upload', 'fa-id-card')
            + _kycSelfie('kyc-ngo-selfie-btn')
            + '<button type="submit" class="btn btn-accent">Submit Verification</button>'
            + '</form>'
            /* Cooperative */
            + '<form id="cooperative-kyc-form" class="kyc-form" novalidate>'
            + '<h4>Step 2: Cooperative Society Verification</h4>'
            + _kycField('Organisation Name', 'kyc-coop-name', 'text', true)
            + _kycField('Certificate Number', 'kyc-coop-cert', 'text', true)
            + _kycField('TIN Number', 'kyc-coop-tin', 'text', true)
            + _kycField('President/Representative Name', 'kyc-coop-rep-name', 'text', true)
            + _kycField('Official Phone', 'kyc-coop-phone', 'tel', true)
            + _kycField('Official Email', 'kyc-coop-email', 'email', true)
            + _kycField('Office Address', 'kyc-coop-address', 'text', true)
            + _kycUpload('Upload Registration Certificate', 'kyc-coop-cert-upload', 'fa-file-alt')
            + _kycUpload('Upload TIN Document', 'kyc-coop-tin-upload', 'fa-file-alt')
            + _kycUpload("Representative's ID", 'kyc-coop-rep-id-upload', 'fa-id-card')
            + _kycSelfie('kyc-coop-selfie-btn')
            + '<button type="submit" class="btn btn-accent">Submit Verification</button>'
            + '</form>'
            /* Government Agency */
            + '<form id="government-kyc-form" class="kyc-form" novalidate>'
            + '<h4>Step 2: Government Agency Verification</h4>'
            + _kycField('Agency/Ministry Name', 'kyc-gov-name', 'text', true)
            + _kycField('Supervising Ministry / Parent Body', 'kyc-gov-parent', 'text', true)
            + _kycField('Gazette / Establishment Number', 'kyc-gov-gazette', 'text', true)
            + _kycField('Authorised Officer Name', 'kyc-gov-rep-name', 'text', true)
            + _kycField('Authorised Officer Designation/Title', 'kyc-gov-rep-title', 'text', true)
            + _kycField('Official Phone', 'kyc-gov-phone', 'tel', true)
            + _kycField('Official Email', 'kyc-gov-email', 'email', true)
            + _kycField('Office Address', 'kyc-gov-address', 'text', true)
            + _kycUpload('Upload Certificate of Establishment / Gazette Notice', 'kyc-gov-gazette-upload', 'fa-file-alt')
            + _kycUpload('Upload Letter of Authorisation (on official letterhead)', 'kyc-gov-auth-upload', 'fa-file-alt')
            + _kycUpload("Representative's ID", 'kyc-gov-rep-id-upload', 'fa-id-card')
            + _kycSelfie('kyc-gov-selfie-btn')
            + '<button type="submit" class="btn btn-accent">Submit Verification</button>'
            + '</form>'
            /* International Organization / Institution */
            + '<form id="international-kyc-form" class="kyc-form" novalidate>'
            + '<h4>Step 2: International Organization / Institution Verification</h4>'
            + _kycField('Organisation Name', 'kyc-intl-name', 'text', true)
            + _kycField('Country of Headquarters/Origin', 'kyc-intl-hq-country', 'text', true)
            + _kycField('International Registration/Charter Number', 'kyc-intl-reg-number', 'text', true)
            + _kycField('Local Operating Permit Number', 'kyc-intl-permit', 'text', true)
            + _kycField('Country Representative/Director Name', 'kyc-intl-rep-name', 'text', true)
            + _kycField('Official Phone', 'kyc-intl-phone', 'tel', true)
            + _kycField('Official Email', 'kyc-intl-email', 'email', true)
            + _kycField('Local Office Address', 'kyc-intl-address', 'text', true)
            + _kycUpload('Upload International Registration/Charter Certificate', 'kyc-intl-reg-upload', 'fa-file-alt')
            + _kycUpload('Upload Local Operating Permit', 'kyc-intl-permit-upload', 'fa-file-alt')
            + _kycUpload("Representative's ID", 'kyc-intl-rep-id-upload', 'fa-id-card')
            + _kycSelfie('kyc-intl-selfie-btn')
            + '<button type="submit" class="btn btn-accent">Submit Verification</button>'
            + '</form>'
            + '</div></div></div>';

        /* ── Bio chips row ── */
        function _buildBioChips() {
            var rows = [
                { icon: 'fa-align-left',      label: 'Bio',            val: user.bio },
                { icon: 'fa-briefcase',        label: 'Profession',     val: user.profession },
                { icon: 'fa-graduation-cap',   label: 'Education',      val: user.education },
                { icon: 'fa-heart',            label: 'Marital Status', val: user.maritalStatus },
                { icon: 'fa-gamepad',          label: 'Hobbies',        val: user.hobbies },
                { icon: 'fa-map-marker-alt',   label: 'Location',       val: user.location },
                { icon: 'fa-globe',            label: 'Website',        val: user.website },
                { icon: 'fa-envelope',         label: 'Email',          val: isMyProfile ? user.email : null },
                { icon: 'fa-phone',            label: 'Phone',          val: isMyProfile ? user.phone : null }
            ].filter(function (r) { return r.val && String(r.val).trim(); });

            if (!rows.length) return '';

            var chips = rows.map(function (r) {
                var v = String(r.val).trim();
                var lo = '', lc = '';
                if (r.label === 'Website') {
                    lo = '<a href="' + (v.startsWith('http') ? v : 'https://' + v) + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;">';
                    lc = '</a>';
                } else if (r.label === 'Email') {
                    lo = '<a href="mailto:' + _attr(v) + '" style="text-decoration:none;color:inherit;">'; lc = '</a>';
                } else if (r.label === 'Phone') {
                    lo = '<a href="tel:' + _attr(v) + '" style="text-decoration:none;color:inherit;">'; lc = '</a>';
                }
                return lo
                    + '<div style="flex-shrink:0;background:#fff;border:1.5px solid rgba(10,14,39,0.09);border-radius:50px;'
                    + 'padding:7px 14px;display:flex;align-items:center;gap:7px;box-shadow:0 1px 4px rgba(10,14,39,0.06);">'
                    + '<div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#0A0E27,#1B2B8B);'
                    + 'display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
                    + '<i class="fas ' + r.icon + '" style="color:#F5C518;font-size:0.5rem;"></i></div>'
                    + '<div style="min-width:0;">'
                    + '<div style="font-size:0.58rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:0.4px;white-space:nowrap;">' + r.label + '</div>'
                    + '<div style="font-size:0.78rem;color:var(--text-primary);font-weight:600;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;">' + _esc(v) + '</div>'
                    + '</div></div>' + lc;
            }).join('');

            var editBtn = isMyProfile
                ? '<a href="#" class="nav-link" data-target="settings" style="flex-shrink:0;font-size:0.65rem;color:var(--secondary);font-weight:700;text-decoration:none;display:flex;align-items:center;gap:3px;padding:0 6px;"><i class="fas fa-pencil-alt"></i> Edit</a>'
                : '';

            return '<div id="profile-biodata-card" style="margin:12px 0 0;overflow:hidden;">'
                + '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px 6px;">'
                + '<span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;">'
                + '<i class="fas fa-id-card" style="color:var(--secondary);margin-right:4px;"></i>About '
                + (isMyProfile ? 'Me' : _esc(user.fullName.split(' ')[0])) + '</span>' + editBtn + '</div>'
                + '<div style="display:flex;gap:8px;padding:0 16px 14px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;scroll-snap-type:x mandatory;">'
                + chips + '</div></div>';
        }

        /* ── About tab rows ── */
        function _buildAboutRows() {
            var rows = [
                { icon: 'fa-briefcase',       label: 'Profession',     val: user.profession },
                { icon: 'fa-graduation-cap',  label: 'Education',      val: user.education },
                { icon: 'fa-heart',           label: 'Marital Status', val: user.maritalStatus },
                { icon: 'fa-gamepad',         label: 'Hobbies',        val: user.hobbies },
                { icon: 'fa-map-marker-alt',  label: 'Location',       val: user.location },
                { icon: 'fa-envelope',        label: 'Email',          val: isMyProfile ? user.email : null },
                { icon: 'fa-phone',           label: 'Phone',          val: isMyProfile ? user.phone : null },
                { icon: 'fa-globe',           label: 'Website',        val: user.website }
            ].filter(function (r) { return r.val && String(r.val).trim(); });

            return rows.map(function (r, idx) {
                var v   = String(r.val).trim();
                var isLast = idx === rows.length - 1;
                var valHTML = r.label === 'Website'
                    ? '<a href="' + (v.startsWith('http') ? v : 'https://' + v) + '" target="_blank" rel="noopener" style="color:var(--secondary);text-decoration:none;">' + _esc(v) + '</a>'
                    : r.label === 'Email'
                    ? '<a href="mailto:' + _attr(v) + '" style="color:var(--secondary);text-decoration:none;">' + _esc(v) + '</a>'
                    : r.label === 'Phone'
                    ? '<a href="tel:' + _attr(v) + '" style="color:var(--secondary);text-decoration:none;">' + _esc(v) + '</a>'
                    : _esc(v);
                return '<div style="display:flex;align-items:center;gap:14px;padding:13px 16px;background:white;' + (!isLast ? 'border-bottom:1px solid rgba(10,14,39,0.06);' : '') + '">'
                    + '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#0A0E27,#1B2B8B);display:flex;align-items:center;justify-content:center;flex-shrink:0;">'
                    + '<i class="fas ' + r.icon + '" style="color:white;font-size:0.8rem;"></i></div>'
                    + '<div style="flex:1;min-width:0;">'
                    + '<div style="font-size:0.72rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">' + r.label + '</div>'
                    + '<div style="font-size:0.92rem;color:var(--text-primary);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + valHTML + '</div>'
                    + '</div></div>';
            }).join('');
        }

        var flwCount  = (user.followerCount  || 0).toLocaleString();
        /* FIX (2026-08-24 — "Following count always shows 0"): user.followingCount
           was never a real field — nothing in this codebase ever writes it to
           Firestore (the follow handler in app-fixes.js only ever persists
           followedUserIds itself). Every other place that needs a "following"
           number (app-patch-v23.js, app-patch-v32.js) already derives it from
           followedUserIds.length/size on the fly instead of trusting a phantom
           counter field — matched that same convention here. Handles both
           shapes: a live Set on userState (my own profile, in-session) and a
           plain array on a Firestore-fetched user doc (mockUsers copies, incl.
           of myself, are populated straight from doc.data()). */
        var _followedIds = user.followedUserIds;
        var _followingNum = Array.isArray(_followedIds) ? _followedIds.length
            : (_followedIds && typeof _followedIds.size === 'number') ? _followedIds.size
            : 0;
        var flwing    = _followingNum.toLocaleString();
        var isVerified = user.isVerified;

        /* ── Build profile HTML ── */
        profileSection.innerHTML =
            '<div class="header">'
            + (!isMyProfile
                ? '<button onclick="window._viewingOtherProfile=false;if(typeof window.renderUserProfile===\'function\'){window.renderUserProfile(window.userState.id);}else{if(typeof window.navigateTo===\'function\')window.navigateTo(\'profile\',true);}" '
                + 'style="background:none;border:none;cursor:pointer;color:var(--secondary);font-size:0.88rem;font-weight:600;padding:4px 0;display:flex;align-items:center;gap:5px;margin-bottom:6px;">'
                + '<i class="fas fa-arrow-left"></i> My Profile</button>'
                : '')
            + '<h1>' + (isMyProfile ? 'My Profile' : _esc(user.fullName) + "'s Profile") + '</h1>'
            + '</div>'

            + '<div class="card">'
            + '<div class="profile-header-container">'
            + '<div class="cover-photo-container" id="profile-cover-container" style="background-image:url(\'' + _attr(user.coverPhoto || '') + '\');">'
            + (isMyProfile
                ? '<label for="cover-photo-input" class="upload-overlay"><i class="fas fa-camera"></i> Change Cover</label>'
                + '<input type="file" id="cover-photo-input" accept="image/*" style="display:none;">'
                : '')
            + '</div>'
            + '<div class="profile-header">'
            /* Celebratory avatar frame (birthday feature — requested
               addition): a gradient ring + cake badge around the profile
               picture, shown only to visitors on the day this is someone
               else's birthday (isBirthdayToday, same flag the existing
               "Send a Gift" button below already gates on). Ring/badge CSS
               is injected once by _ensureBirthdayProfileCSS() below — see
               that function's own comment for why it matches the gradient
               already used on the dashboard's "Birthdays Today" chips
               (app-gifts.js SECTION 12) and the Birthday Wishes modal
               header, so the same visual language reads consistently
               everywhere a birthday is shown across the app. */
            + '<div class="profile-pic-container' + (isBirthdayToday ? ' emp-bday-avatar-frame' : '') + '">'
            + '<label for="profile-pic-input-main" class="avatar-placeholder"'
            + ' style="width:150px;height:150px;border-radius:50%;' + (!isMyProfile ? 'cursor:default;' : '') + '">'
            + (isMyProfile ? '<div class="upload-overlay"><i class="fas fa-camera fa-2x"></i></div>' : '')
            + '<img src="' + _attr(user.avatar || '') + '" id="profile-pic-img" class="profile-pic active" alt="Profile picture"></label>'
            + (isMyProfile ? '<input type="file" id="profile-pic-input-main" class="avatar-input" accept="image/*" style="display:none;">' : '')
            + (isBirthdayToday ? '<span class="emp-bday-avatar-cake" title="' + _esc(user.fullName || 'Their') + ' birthday today">🎂</span>' : '')
            + '</div>'
            + '<div class="profile-header-info" data-user-id="' + _attr(user.id) + '">'
            + '<h2 id="profile-display-name">' + _esc(user.fullName)
            + ' <span class="badge" style="display:' + (isVerified ? 'inline-flex' : 'none') + ';"><i class="fas fa-check"></i> Verified</span></h2>'
            + '<p id="profile-display-username">@' + _esc(user.username) + '</p>'
            + '<div class="profile-stats-row" style="display:flex;gap:20px;margin:6px 0;font-size:0.88rem;">'
            + '<span><strong id="profile-follower-count">' + flwCount + '</strong> <span style="color:var(--text-muted);">Followers</span></span>'
            + '<span><strong id="profile-following-count">' + flwing + '</strong> <span style="color:var(--text-muted);">Following</span></span>'
            + '</div>'
            + '<div class="profile-header-actions">'
            + (isMyProfile
                ? '<button class="btn btn-small nav-link" data-target="settings"><i class="fas fa-edit"></i> Edit Profile</button>'
                : '<button class="btn btn-small" id="profile-message-btn" data-message-user-id="' + _attr(user.id) + '"><i class="fas fa-envelope"></i> Message</button>')
            + '<button class="btn btn-small share-profile-btn"><svg style="vertical-align:-3px;margin-right:2px;" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share</button>'
            + (!isMyProfile ? '<button class="btn btn-small follow-btn" data-user-id="' + _attr(user.id) + '">Follow</button>' : '')
            /* FIX (2026-09-12 — "block or filter posts from selected contacts",
               WhatsApp-style content control): no per-contact Block existed
               anywhere in the app. Placed here, next to Follow/Message —
               same natural spot WhatsApp/Instagram put it. Toggles
               userState.blockedUserIds (plain array, see the field's own
               comment in app-fixes.js's default-user-state object) and
               persists it straight to this user's own Firestore doc — no
               new collection needed. Actual enforcement (hiding their
               posts/statuses once blocked) lives in app-fixes.js's posts
               and statuses onSnapshot listeners, which both already read
               this same field. */
            + (!isMyProfile ? '<button class="btn btn-small profile-block-btn" id="profile-block-btn" data-user-id="' + _attr(user.id) + '" style="color:var(--danger-color,#EF4444);">'
                + (( _us().blockedUserIds || []).indexOf(user.id) > -1 ? '<i class="fas fa-user-check"></i> Unblock' : '<i class="fas fa-user-slash"></i> Block') + '</button>' : '')
            + (isBirthdayToday
                ? '<button class="btn btn-small" id="profile-send-gift-btn" data-gift-user-id="' + _attr(user.id) + '" data-gift-user-name="' + _attr(user.fullName || 'them') + '" style="background:linear-gradient(135deg,#F5C518,#F08C1A);color:#1B2B8B;border:none;"><i class="fas fa-gift"></i> Send a Gift</button>'
                : '')
            + '</div></div></div>'

            /* KYC nudge banner */
            + (isMyProfile && !us.isVerified
                ? '<div style="background:linear-gradient(135deg,rgba(91,14,166,0.08),rgba(245,197,24,0.08));'
                + 'border:1.5px solid rgba(91,14,166,0.18);border-radius:14px;padding:10px 14px;'
                + 'margin:10px 16px 0;display:flex;align-items:center;gap:10px;cursor:pointer;" '
                + 'onclick="var el=document.querySelector(\'[data-target=\\"profile-kyc-tab\\"]\');if(el)el.click();">'
                + '<i class="fas fa-shield-alt" style="color:#5B0EA6;font-size:1.2rem;flex-shrink:0;"></i>'
                + '<div style="flex:1;"><strong style="color:#5B0EA6;font-size:0.82rem;">Complete KYC Verification</strong>'
                + '<br><span style="font-size:0.72rem;color:var(--text-muted);">To complete KYC, switch to desktop mode and click the button.</span></div>'
                + '<i class="fas fa-chevron-right" style="color:#5B0EA6;"></i></div>'
                : '')

            /* Birthday Messages section (birthday feature — requested
               "profile integration"): embedded directly on the profile,
               only on the day it's this user's birthday (isBirthdayToday —
               same flag the "Send a Gift" button above already gates on),
               so a visitor doesn't have to open the separate Birthday
               Wishes modal (app-gifts.js's openBirthdayWishesFeed) just to
               see what's already been said. Populated live by
               _mountProfileBirthdayFeed() at the bottom of this function —
               reads the SAME `birthday_feed` collection that modal, the
               dashboard chip tap, and every gift/wish/card write already
               share, so nothing here duplicates that data or logic. */
            + (isBirthdayToday
                ? '<div class="card" id="profile-birthday-section" style="margin:14px 16px 0;padding:14px 16px;'
                + 'border-radius:16px;background:linear-gradient(135deg,rgba(245,197,24,0.10),rgba(240,140,26,0.06));'
                + 'border:1px solid rgba(245,197,24,0.3);">'
                + '<h4 style="font-weight:800;color:#7a5a0a;font-size:0.9rem;margin-bottom:8px;">'
                + '<i class="fas fa-birthday-cake" style="margin-right:6px;"></i>Birthday Messages</h4>'
                + '<div id="profile-birthday-messages" style="display:flex;flex-direction:column;gap:8px;">'
                + '<div style="text-align:center;color:#99a;font-size:0.82rem;padding:8px 0;">Loading wishes…</div></div>'
                + '<button type="button" class="btn btn-small" id="profile-birthday-viewall-btn" data-gift-user-id="' + _attr(user.id) + '" '
                + 'data-gift-user-name="' + _attr(user.fullName || 'them') + '" data-gift-user-avatar="' + _attr(user.avatar || '') + '" '
                + 'style="margin-top:10px;width:100%;background:#fff;border:1px solid rgba(245,197,24,0.4);color:#7a5a0a;">'
                + '<i class="fas fa-comment-dots"></i> View All &amp; Send a Wish</button>'
                + '</div>'
                : '')

            /* Bio chips */
            + _buildBioChips()

            /* Profile tabs */
            + '<div class="profile-tabs" style="display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;'
            + 'scrollbar-width:none;white-space:nowrap;padding-bottom:2px;gap:0;margin-top:14px;">'
            + (isMyProfile ? '<div class="profile-tab active" data-target="profile-dashboard-tab" style="flex-shrink:0;"><i class="fas fa-tachometer-alt" style="margin-right:4px;"></i>Dashboard</div>' : '')
            + '<div class="profile-tab ' + (isMyProfile ? '' : 'active') + '" data-target="profile-posts-tab" style="flex-shrink:0;">Posts</div>'
            + '<div class="profile-tab" data-target="profile-main-content" style="flex-shrink:0;"><i class="fas fa-video" style="margin-right:4px;"></i>Videos</div>'
            + '<div class="profile-tab" data-target="profile-reels-tab" style="flex-shrink:0;"><i class="fas fa-film" style="margin-right:4px;"></i>Reels</div>'
            /* NEW — Pictures tab (report item #2: "create a sub column
               for picture collection ... same frame size expandable on
               clicking"), separate from the mixed Photos/Videos Gallery
               tab above so pictures alone get their own dedicated grid. */
            + '<div class="profile-tab" data-target="profile-pictures-tab" style="flex-shrink:0;"><i class="fas fa-image" style="margin-right:4px;"></i>Pictures</div>'
            + '<div class="profile-tab" data-target="profile-about-tab" style="flex-shrink:0;"><i class="fas fa-id-card" style="margin-right:4px;"></i>About</div>'
            + (isMyProfile ? '<div class="profile-tab" data-target="profile-monetization" style="flex-shrink:0;">Monetization</div>' : '')
            + (isMyProfile ? '<div class="profile-tab" data-target="profile-kyc-tab" style="flex-shrink:0;color:#5B0EA6;font-weight:700;"><i class="fas fa-shield-alt" style="margin-right:4px;"></i>KYC</div>' : '')
            + '</div>'

            /* Tab contents */
            + '<div class="card-content">'

            /* Dashboard tab (own profile only) */
            + (isMyProfile
                ? '<div id="profile-dashboard-tab" class="profile-tab-content active">'
                + '<div style="position:relative;margin-bottom:20px;">'
                + '<button id="profile-create-toggle-btn" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;'
                + 'background:linear-gradient(135deg,#0A0E27,#1B2B8B);border:none;border-radius:16px;color:white;font-size:1rem;font-weight:700;cursor:pointer;transition:all 0.2s;">'
                + '<span id="profile-create-icon" style="width:34px;height:34px;border-radius:50%;background:rgba(245,197,24,0.25);border:2px solid #F5C518;display:flex;align-items:center;justify-content:center;font-size:1.3rem;color:#F5C518;transition:transform 0.3s;">+</span>'
                + '<span>Share a Moment</span></button>'
                + '<div id="profile-create-panel" style="display:none;background:linear-gradient(135deg,#0A0E27,#1B2B8B);border-radius:0 0 18px 18px;padding:18px 20px 20px;color:white;margin-top:-4px;">'
                + '<p style="font-size:0.82rem;opacity:0.75;margin-bottom:14px;">Photos &amp; videos appear instantly on your profile and dashboard feed</p>'
                + '<input type="text" id="profile-post-title" placeholder="✏️ Title / Heading (optional)" style="width:100%;background:rgba(255,255,255,0.1);border:1.5px solid rgba(255,255,255,0.25);border-radius:12px;padding:10px 14px;color:white;font-size:0.9rem;font-weight:600;outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:10px;">'
                + '<div id="profile-post-media-preview" style="margin-bottom:10px;border-radius:12px;overflow:hidden;"></div>'
                + '<textarea id="profile-post-text" rows="3" placeholder="What\'s on your mind?" style="width:100%;background:rgba(255,255,255,0.1);border:1.5px solid rgba(255,255,255,0.2);border-radius:14px;padding:12px;color:white;font-size:0.95rem;resize:none;outline:none;font-family:inherit;margin-bottom:10px;box-sizing:border-box;"></textarea>'
                + '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
                + '<label for="profile-post-media-input" style="background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.25);color:white;padding:9px 18px;border-radius:50px;cursor:pointer;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:6px;"><i class="fas fa-images"></i> Add Media</label>'
                + '<input type="file" id="profile-post-media-input" accept="image/*,video/*" multiple style="display:none;">'
                + '<button id="profile-post-submit-btn" style="background:#F5C518;color:#0A0E27;border:none;padding:9px 22px;border-radius:50px;font-weight:700;cursor:pointer;font-size:0.9rem;margin-left:auto;">'
                + '<i class="fas fa-paper-plane"></i> Post</button></div></div></div>'
                /* Mini stats */
                + '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;">'
                + '<div style="background:white;border-radius:16px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid rgba(10,14,39,0.06);">'
                + '<div style="font-size:1.6rem;font-weight:800;color:var(--secondary);cursor:pointer;" id="profile-dash-followers" onclick="window.showFollowersModal()">'
                + (us.followerCount || 0).toLocaleString() + '</div>'
                + '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;cursor:pointer;" onclick="window.showFollowersModal()">Followers ▾</div></div>'
                + '<div style="background:white;border-radius:16px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid rgba(10,14,39,0.06);">'
                + '<div style="font-size:1.6rem;font-weight:800;color:#F5C518;" id="profile-dash-empy">'
                + (us.empyBalance || 0).toLocaleString() + '</div>'
                + '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">EMPY Balance</div></div>'
                + '</div>'
                + '<div style="margin-bottom:20px;">'
                + '<h4 style="font-weight:700;color:var(--primary);margin-bottom:12px;"><i class="fas fa-broadcast-tower" style="color:var(--danger-color);margin-right:6px;"></i>Live Streams</h4>'
                + '<div class="horizontal-slider-container"><div class="horizontal-slider-wrapper" id="profile-dash-live-slider"></div></div></div>'
                + '<h4 style="font-weight:700;color:var(--primary);margin-bottom:12px;"><i class="fas fa-stream" style="color:var(--secondary);margin-right:6px;"></i>Your Feed</h4>'
                + '<div id="profile-dash-feed"></div></div>'
                : '')

            /* Posts tab */
            + '<div id="profile-posts-tab" class="profile-tab-content ' + (isMyProfile ? '' : 'active') + '">'
            + '<div id="profile-posts-feed" style="display:flex;flex-direction:column;gap:12px;"></div>'
            + '<div id="profile-posts-empty" style="text-align:center;padding:40px;color:var(--text-muted);">'
            + '<i class="fas fa-stream" style="font-size:2rem;display:block;margin-bottom:12px;"></i>'
            + '<p>No posts yet' + (isMyProfile ? ' — share a moment above!' : ' from this user.') + '</p></div></div>'

            /* Gallery tab */
            + '<div id="profile-main-content" class="profile-tab-content">'
            + '<h3 style="margin-bottom:16px;"><i class="fas fa-video" style="color:var(--secondary);margin-right:8px;"></i>Videos</h3>'
            + '<div id="profile-gallery"><p>No videos yet.</p></div></div>'

            /* Reels gallery tab — deliberately SEPARATE from the Photos/Videos
               Gallery tab above (see §9 populateProfileReelsGallery): reels are
               stored in their own Firestore "reels" collection, not mixed in
               with .impact-story posts, so they need their own dedicated
               thumbnail section rather than being folded into the media grid. */
            + '<div id="profile-reels-tab" class="profile-tab-content">'
            + '<h3 style="margin-bottom:16px;"><i class="fas fa-film" style="color:#5B0EA6;margin-right:8px;"></i>Reels</h3>'
            + '<div id="profile-reels-gallery"><p style="text-align:center;color:var(--text-muted);padding:32px 0;font-size:0.9rem;">No reels yet.</p></div></div>'

            /* Pictures gallery tab — images only, split out of the mixed
               Photos/Videos Gallery tab above per this session's request
               (report item #2). Same square frame as the Reels tab, same
               click-to-expand lightbox as the mixed Gallery tab. */
            + '<div id="profile-pictures-tab" class="profile-tab-content">'
            + '<h3 style="margin-bottom:16px;"><i class="fas fa-image" style="color:var(--secondary);margin-right:8px;"></i>Pictures</h3>'
            + '<div id="profile-pictures-gallery"><p style="text-align:center;color:var(--text-muted);padding:32px 0;font-size:0.9rem;">No pictures yet.</p></div></div>'

            /* About tab */
            + '<div id="profile-about-tab" class="profile-tab-content">'
            + '<h3 style="margin-bottom:18px;"><i class="fas fa-id-card" style="color:var(--secondary);margin-right:8px;"></i>About '
            + (isMyProfile ? 'Me' : _esc(user.fullName)) + '</h3>'
            + (user.bio ? '<div style="background:linear-gradient(135deg,rgba(10,14,39,0.04),rgba(27,43,139,0.06));border-radius:14px;padding:14px 16px;margin-bottom:16px;border-left:3px solid var(--secondary);">'
                + '<p style="color:var(--text-muted);font-size:0.82rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Bio</p>'
                + '<p style="color:var(--text-primary);line-height:1.6;">' + _esc(user.bio) + '</p></div>' : '')
            + '<div style="display:flex;flex-direction:column;gap:0;border:1.5px solid rgba(10,14,39,0.08);border-radius:16px;overflow:hidden;">'
            + _buildAboutRows() + '</div>'
            + (isMyProfile ? '<div style="margin-top:16px;text-align:center;"><button class="btn btn-small nav-link" data-target="settings" style="font-size:0.82rem;opacity:0.75;"><i class="fas fa-edit"></i> Edit your info in Settings</button></div>' : '')
            + '</div>'

            /* Monetization tab placeholder (filled by renderMonetizationTab) */
            + (isMyProfile ? '<div id="profile-monetization" class="profile-tab-content"></div>' : '')
            + '</div></div>'

            /* KYC tab (outside card-content, own profile only) */
            + (isMyProfile ? '<div id="profile-kyc-tab" class="profile-tab-content" style="display:none;">' + kycFormHTML + '</div>' : '');

        /* ── Post-render wiring ── */
        if (isMyProfile) {
            (typeof window.renderMonetizationTab === 'function' ? window.renderMonetizationTab : renderMonetizationTab)();
            if (typeof window.populateDobSelectors === 'function') window.populateDobSelectors();

            setTimeout(function () {
                /* Create-panel toggle */
                var toggleBtn = document.getElementById('profile-create-toggle-btn');
                var panel     = document.getElementById('profile-create-panel');
                var iconEl    = document.getElementById('profile-create-icon');
                if (toggleBtn && panel && iconEl) {
                    toggleBtn.addEventListener('click', function () {
                        var open = panel.style.display !== 'none';
                        panel.style.display    = open ? 'none' : 'block';
                        iconEl.style.transform = open ? 'rotate(0deg)' : 'rotate(45deg)';
                        iconEl.textContent     = open ? '+' : '×';
                    });
                }

                /* Profile post media preview */
                var profileMediaFiles = [];
                var pMediaInput  = document.getElementById('profile-post-media-input');
                var pPreview     = document.getElementById('profile-post-media-preview');

                // FEATURE (Quote/Meme Card): pulled the preview-render loop out of the
                // input's own 'change' handler into a named function so a card image
                // generated by the Quote Card composer (below) can be pushed straight
                // into profileMediaFiles and rendered the same way an uploaded photo
                // would be, without needing to fake a 'change' event on the input.
                function renderProfileMediaPreview() {
                    if (!pPreview) return;
                    pPreview.innerHTML = '';
                    profileMediaFiles.forEach(function (f, idx) {
                        var url   = URL.createObjectURL(f);
                        var isVid = f.type.startsWith('video/');
                        var wrap  = document.createElement('div');
                        wrap.style.cssText = 'position:relative;display:inline-block;margin:4px;';
                        wrap.innerHTML = isVid
                            ? '<video src="' + url + '" muted playsinline style="width:80px;height:80px;object-fit:cover;border-radius:8px;"></video>'
                            : '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:8px;">';
                        var rmBtn = document.createElement('button');
                        rmBtn.type = 'button'; rmBtn.textContent = '×';
                        rmBtn.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.6);color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:0.8rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;';
                        rmBtn.onclick = function () {
                            profileMediaFiles.splice(idx, 1);
                            renderProfileMediaPreview();
                        };
                        wrap.appendChild(rmBtn);
                        pPreview.appendChild(wrap);
                    });
                }

                if (pMediaInput) {
                    pMediaInput.addEventListener('change', function () {
                        profileMediaFiles = profileMediaFiles.concat(Array.from(this.files)).slice(0, 10);
                        renderProfileMediaPreview();
                    });
                }

                /* FEATURE — Quote/Meme Card: reuses the exact same drawing/composer
                   engine window.EmpQuoteCard (defined in app-fixes.js, next to the
                   Quick Post modal's own wiring) instead of a second copy of it here.
                   app-profile.js loads BEFORE app-fixes.js in index.html, but this
                   only runs at click-time — by then app-fixes.js has long since
                   defined window.EmpQuoteCard, so the guard below just protects
                   against the rare case this panel gets re-rendered before that. */
                (function () {
                    if (!pMediaInput || !pMediaInput.parentElement) return;
                    var qcBtn = document.createElement('button');
                    qcBtn.type = 'button';
                    qcBtn.innerHTML = '<i class="fas fa-quote-right"></i> Quote Card';
                    qcBtn.style.cssText =
                        'background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.25);color:white;' +
                        'padding:9px 18px;border-radius:50px;cursor:pointer;font-size:0.85rem;font-weight:600;' +
                        'display:flex;align-items:center;gap:6px;';
                    qcBtn.addEventListener('click', function () {
                        if (!window.EmpQuoteCard) {
                            if (typeof showNotification === 'function') showNotification('Quote Card composer isn\u2019t ready yet — try again in a moment.', 'warning');
                            return;
                        }
                        window.EmpQuoteCard.open(function (file, quoteText) {
                            profileMediaFiles = profileMediaFiles.concat([file]).slice(0, 10);
                            renderProfileMediaPreview();
                            var textEl = document.getElementById('profile-post-text');
                            if (textEl && !textEl.value.trim()) textEl.value = quoteText;
                        });
                    });
                    pMediaInput.parentElement.insertBefore(qcBtn, pMediaInput.nextSibling);

                    /* FEATURE (2026-09-22 — "In the profile page dashboard upload
                       column also add the support your Presidential candidate
                       icon"): mirrors app-fixes.js's Quick Post "Support Candidate"
                       button one-for-one — same public hook
                       (window._empOpenElectionModal, exposed by app-patch-v49-v50.js),
                       same "next to Quote Card" placement, just this composer's own
                       (white/translucent) button styling instead of Quick Post's.
                       Inserted right after the Quote Card button above so the row
                       reads Add Media -> Quote Card -> Support Candidate -> Post. */
                    var elBtn = document.createElement('button');
                    elBtn.type = 'button';
                    elBtn.innerHTML = '\uD83D\uDDF3\uFE0F Support Candidate';
                    elBtn.title = 'Upload a photo and support your Presidential candidate';
                    elBtn.style.cssText =
                        'background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.25);color:white;' +
                        'padding:9px 18px;border-radius:50px;cursor:pointer;font-size:0.85rem;font-weight:600;' +
                        'display:flex;align-items:center;gap:6px;';
                    elBtn.addEventListener('click', function () {
                        /* FIX (2026-09-22 — same bug report as app-fixes.js's Quick
                           Post "Support Candidate" button, now sharing that file's
                           window._empEnsureElectionModal helper instead of its own copy
                           of the plain-poll logic: a bare typeof check / short poll
                           alone can't tell "still parsing" apart from "stuck on a stale
                           cached app-patch-v49-v50.js that predates this hook" — see
                           app-fixes.js's helper for the fuller write-up. Falls back to
                           the old local poll only in the unlikely case app-fixes.js
                           hasn't defined the shared helper yet by click-time. */
                        if (typeof window._empEnsureElectionModal === 'function') {
                            window._empEnsureElectionModal(function () {
                                window._empOpenElectionModal();
                            }, function () {
                                if (typeof window.showNotification === 'function') {
                                    window.showNotification('Election hub isn\u2019t available right now.', 'warning');
                                }
                            });
                            return;
                        }
                        if (typeof window._empOpenElectionModal === 'function') {
                            window._empOpenElectionModal();
                            return;
                        }
                        var elWaited = 0;
                        var elPoll = setInterval(function () {
                            elWaited += 150;
                            if (typeof window._empOpenElectionModal === 'function') {
                                clearInterval(elPoll);
                                window._empOpenElectionModal();
                            } else if (elWaited >= 3000) {
                                clearInterval(elPoll);
                                if (typeof window.showNotification === 'function') {
                                    window.showNotification('Election hub isn\u2019t available right now.', 'warning');
                                }
                            }
                        }, 150);
                    });
                    qcBtn.parentElement.insertBefore(elBtn, qcBtn.nextSibling);
                })();

                /* Profile post submit — clone-replace to prevent double-binding */
                var submitBtn = document.getElementById('profile-post-submit-btn');
                if (submitBtn) {
                    var fresh = submitBtn.cloneNode(true);
                    submitBtn.parentNode.replaceChild(fresh, submitBtn);
                    fresh.addEventListener('click', async function () {
                        var textEl  = document.getElementById('profile-post-text');
                        var titleEl = document.getElementById('profile-post-title');
                        var text    = textEl  ? textEl.value.trim()  : '';
                        var title   = titleEl ? titleEl.value.trim() : '';
                        if (!text && profileMediaFiles.length === 0) {
                            if (typeof window.showNotification === 'function') window.showNotification('Please add text or media before posting.', 'error');
                            return;
                        }
                        fresh.disabled = true;
                        if (profileMediaFiles.length > 0 && typeof window.showNotification === 'function') {
                            window.showNotification('Uploading media to cloud…', 'info');
                        }
                        // ADDED (2026-08-10 — upload progress tracker)
                        var _profPostBar = (typeof window.empUploadProgress === 'object')
                            ? window.empUploadProgress.attach(pPreview || fresh.parentElement, profileMediaFiles.length > 1 ? 'Media' : 'Upload')
                            : { update: function () {}, done: function () {}, fail: function () {} };
                        try {
                            var _profTotal = profileMediaFiles.length;
                            var cloudUrls = await window.uploadMediaFilesToCloudinary(profileMediaFiles, function (idx, pct) {
                                if (!_profTotal) return;
                                var overall = Math.round(((idx + (pct / 100)) / _profTotal) * 100);
                                _profPostBar.update(overall, _profTotal > 1 ? ('File ' + (idx + 1) + '/' + _profTotal) : null);
                            });
                            if (_profTotal) _profPostBar.done();
                            var fullText  = title ? (title + (text ? '\n' + text : '')) : text;
                            var mediaObjs = cloudUrls.filter(Boolean).map(function (u, i) {
                                var f = profileMediaFiles[i];
                                return { _cloudUrl: u, url: u, type: f ? f.type : 'image/jpeg' };
                            });

                            if (typeof window.createNewPostElement === 'function') {
                                var postEl = window.createNewPostElement(fullText, mediaObjs, { id: us.id, fullName: us.fullName, avatar: us.avatar });

                                /* Persist to Firestore */
                                var postData = {
                                    id:        postEl.dataset.postId,
                                    text:      fullText,
                                    media:     cloudUrls.filter(Boolean),
                                    userId:    us.id,
                                    username:  us.fullName || us.username || 'User',
                                    avatar:    us.avatar   || '',
                                    likes:     0, comments: 0, views: 0,
                                    createdAt: new Date().toISOString(),
                                    // FEATURE (this session — quote/meme thumbnail strip): see
                                    // app-fixes.js's matching Quick Post postDoc field for the
                                    // full explanation. profileMediaFiles carries the same
                                    // isQuoteCard tag when this post's media came from the
                                    // Quote Card button above.
                                    //
                                    // FIX (this session — quote/meme strip permanently empty):
                                    // same root cause as app-fixes.js's matching Quick Post fix
                                    // — this used to tag isQuoteCard:true purely from the
                                    // ORIGINAL profileMediaFiles array, regardless of whether
                                    // the Cloudinary upload a few lines up actually succeeded
                                    // for that file. A failed upload (weak connection —
                                    // uploadMediaFilesToCloudinary resolves '' for it instead of
                                    // throwing) still produced isQuoteCard:true + media:[], which
                                    // is invisible everywhere (skipped in the normal feed,
                                    // filtered out of the strip for having no image) — a
                                    // permanent ghost post. Requiring at least one real uploaded
                                    // URL means a post can only be tagged isQuoteCard:true when
                                    // it actually has an image to show for it.
                                    isQuoteCard: cloudUrls.filter(Boolean).length > 0 && profileMediaFiles.some(function (f) { return !!f.isQuoteCard; })
                                };
                                if (window.fbDb && window._firebaseLoaded) {
                                    window.fbDb.collection('posts').doc(postData.id).set(postData).catch(function () {});
                                }

                                /* Process tags */
                                if (typeof window._processPostTags === 'function') {
                                    window._processPostTags(fullText, us.fullName || 'User');
                                }

                                /* Reward */
                                if (typeof window.rewardUserForAction === 'function') {
                                    window.rewardUserForAction(profileMediaFiles.length > 0 ? 'CREATE_REEL' : 'CREATE_POST');
                                }

                                if (typeof window.showNotification === 'function') {
                                    window.showNotification('✅ Post published!', 'success');
                                }
                            }

                            /* Reset form */
                            if (textEl)  textEl.value  = '';
                            if (titleEl) titleEl.value = '';
                            profileMediaFiles = [];
                            if (pPreview) pPreview.innerHTML = '';
                            if (panel) panel.style.display = 'none';
                            if (iconEl) { iconEl.style.transform = 'rotate(0deg)'; iconEl.textContent = '+'; }
                        } catch (e) {
                            _profPostBar.fail('Failed');
                            if (typeof window.showNotification === 'function') window.showNotification('Post failed. Please try again.', 'error');
                        }
                        fresh.disabled = false;
                    });
                }
            }, 200);
        }

        /* Populate gallery from existing DOM posts */
        setTimeout(function () { populateProfileGallery(userId); }, 300);
        /* Pictures tab (images only, split out of the mixed gallery above
           per this session's request) — same scrape source, same timing. */
        setTimeout(function () { populateProfilePicturesGallery(userId); }, 300);

        /* Owner reel gallery (separate "Reels" tab) + reel strip embedded
           mid-feed on the Posts tab — see §9. Scheduled the same way the
           photo/video gallery above already is (a short delay so the rest
           of the profile DOM this depends on — #profile-reels-gallery,
           #profile-posts-feed — has actually been attached first).

           FIX (2026-08-10): this render's own token is captured now and
           checked when the timeout actually fires — see
           _profileReelStripToken's comment above for why. If another
           renderUserProfile() call happens in the meantime, this timeout
           becomes a no-op instead of mounting a duplicate strip into that
           newer render's DOM. */
        var _reelStripMyToken = ++_profileReelStripToken;
        setTimeout(function () { populateProfileReelsGallery(userId); }, 320);
        setTimeout(function () {
            if (_reelStripMyToken !== _profileReelStripToken) return; /* superseded by a later renderUserProfile() call */
            _mountProfileFeedReelStrip(userId);
        }, 500);

        /* FEATURE (this session — "quote and meme avatar thumbnail card...
           horizontally swipeable, middle of... the individual profile page
           dashboard"): same mid-feed swipeable-strip treatment as the reel
           strip just above, own token so an overlapping renderUserProfile()
           call can't mount a stray duplicate of THIS strip either. See §9b
           below for _mountProfileFeedQuoteMemeStrip. */
        var _quoteMemeStripMyToken = ++_profileQuoteMemeStripToken;
        setTimeout(function () {
            if (_quoteMemeStripMyToken !== _profileQuoteMemeStripToken) return;
            _mountProfileFeedQuoteMemeStrip(userId);
        }, 560);

        /* Birthday Messages section (embedded #profile-birthday-messages
           above) — only mounted when the section itself was actually
           rendered (isBirthdayToday). Same short-delay + staleness-token
           pattern as the reel strip above, since this also depends on DOM
           this same innerHTML write just created. */
        if (isBirthdayToday) {
            var _bdayMyToken = ++_profileBirthdayToken;
            setTimeout(function () {
                if (_bdayMyToken !== _profileBirthdayToken) return; /* superseded by a later renderUserProfile() call */
                _mountProfileBirthdayFeed(userId);
            }, 300);
        }
    }
    window.renderUserProfile = renderUserProfile;


    /* =========================================================================
       §2  renderMonetizationTab
       ========================================================================= */

    function renderMonetizationTab() {
        var container = document.getElementById('profile-monetization');
        if (!container) return;
        var us         = _us();
        var isEligible = us.isVerified && (us.followerCount || 0) >= 500;
        var empyBal    = (us.empyBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        var empyRate   = (_S().EMPY_RATE_USD) || window.EMPY_RATE_USD || 0.10;

        if (isEligible) {
            container.innerHTML =
                '<h3><i class="fas fa-dollar-sign"></i> Your Monetization</h3>'
                + '<div class="wallet-card">'
                + '<p>Available for Withdrawal</p>'
                + '<h3 class="empy-balance"><i class="fa-solid fa-coins"></i> ' + empyBal + '</h3>'
                + '<p>~ ' + (typeof window.formatUsdPrice === 'function' ? window.formatUsdPrice((us.empyBalance || 0) * empyRate) : '') + '</p>'
                + '<button class="btn btn-accent nav-link" data-target="my-wallet"><i class="fas fa-exchange-alt"></i> Go to Wallet</button>'
                + '</div>';
        } else {
            var nextRank = RANKS.find(function (r) { return r.followers > (us.followerCount || 0); });
            var nextInfo = nextRank
                ? '<p>Next Rank: <strong>' + nextRank.name + '</strong> (' + (us.followerCount || 0).toLocaleString() + ' / ' + nextRank.followers.toLocaleString() + ' followers) for a <strong>' + nextRank.reward + ' EMPY</strong> reward.</p>'
                : '';
            var reasons = '<ul>';
            reasons += !us.isVerified
                ? '<li><i class="fas fa-times-circle" style="color:var(--danger-color)"></i> Complete KYC verification. <a href="#" class="nav-link" data-target="profile">Verify Now</a></li>'
                : '<li><i class="fas fa-check-circle" style="color:var(--success-color)"></i> KYC Verified</li>';
            reasons += (us.followerCount || 0) < 500
                ? '<li><i class="fas fa-times-circle" style="color:var(--danger-color)"></i> Reach 500 followers (Current: ' + (us.followerCount || 0) + ')</li>'
                : '<li><i class="fas fa-check-circle" style="color:var(--success-color)"></i> 500+ Followers</li>';
            reasons += '</ul>';

            container.innerHTML =
                '<h3><i class="fas fa-lock"></i> Monetization Locked</h3>'
                + '<div class="form-feedback info" style="display:block;text-align:left;">'
                + '<p>To unlock monetization features like withdrawals and direct payments, please meet the following criteria:</p>'
                + reasons + nextInfo + '</div>';
        }
    }
    window.renderMonetizationTab = renderMonetizationTab;


    /* =========================================================================
       §3  renderBusinessPage
       ========================================================================= */

    function renderBusinessPage() {
        var container = document.getElementById('business-page');
        if (!container) return;
        var us = _us();

        if (us.businessPage) {
            var page = us.businessPage;
            var coverGradient = page.coverPhoto && page.coverPhoto.startsWith('http')
                ? "url('" + page.coverPhoto + "')"
                : 'linear-gradient(135deg,#0A0E27 0%,#1B2B8B 100%)';

            container.innerHTML =
                '<div class="card business-page-header" style="overflow:hidden;border-radius:24px;margin-bottom:16px;padding:0;">'
                + '<div id="business-page-cover-photo" style="height:220px;background:' + coverGradient + ';background-size:cover;background-position:center;position:relative;">'
                + '<label for="business-cover-photo-input" style="position:absolute;bottom:12px;right:12px;background:rgba(255,255,255,0.2);backdrop-filter:blur(8px);border:1.5px solid rgba(255,255,255,0.4);color:white;padding:8px 16px;border-radius:50px;cursor:pointer;font-size:0.82rem;font-weight:600;display:flex;align-items:center;gap:6px;"><i class="fas fa-camera"></i> Edit Cover</label>'
                + '<input type="file" id="business-cover-photo-input" accept="image/*" style="display:none;"></div>'
                /* Identity row */
                + '<div style="display:flex;align-items:flex-end;gap:18px;padding:0 24px;transform:translateY(-40px);margin-bottom:-30px;">'
                + '<div style="position:relative;flex-shrink:0;">'
                + '<div style="width:90px;height:90px;border-radius:18px;border:4px solid white;background:var(--g-navy);overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;">'
                + (page.profilePhoto && page.profilePhoto.startsWith('http')
                    ? '<img src="' + _attr(page.profilePhoto) + '" id="business-page-profile-pic" style="width:100%;height:100%;object-fit:cover;">'
                    : '<i class="fas fa-briefcase" style="font-size:2rem;color:#F5C518;"></i>')
                + '</div>'
                + '<label for="business-profile-photo-input" style="position:absolute;bottom:-4px;right:-4px;width:28px;height:28px;border-radius:50%;background:var(--accent);border:2px solid white;display:flex;align-items:center;justify-content:center;cursor:pointer;"><i class="fas fa-camera" style="font-size:0.6rem;color:#111;"></i></label>'
                + '<input type="file" id="business-profile-photo-input" accept="image/*" style="display:none;"></div>'
                + '<div style="flex:1;padding-bottom:6px;">'
                + '<h2 id="business-page-name" style="font-family:\'Syne\',sans-serif;font-size:1.3rem;font-weight:800;color:var(--primary);margin:0 0 2px;">'
                + _esc(page.name) + ' <i class="fas fa-pen edit-icon" data-field="name" style="font-size:0.75rem;color:var(--text-muted);cursor:pointer;margin-left:8px;"></i></h2>'
                + '<p id="business-page-tagline" style="color:var(--text-muted);font-size:0.88rem;margin:0;">'
                + _esc(page.tagline) + ' <i class="fas fa-pen edit-icon" data-field="tagline" style="font-size:0.7rem;cursor:pointer;margin-left:6px;"></i></p></div>'
                + '<div style="display:flex;gap:8px;padding-bottom:8px;flex-wrap:wrap;">'
                + '<button class="btn btn-small follow-btn" data-user-id="' + _attr(page.id || 'biz-1') + '" style="border-radius:50px;padding:8px 18px;font-size:0.82rem;"><i class="fas fa-plus"></i> Follow</button>'
                + '<button class="btn btn-small btn-accent business-page-promote-btn" style="border-radius:50px;padding:8px 18px;font-size:0.82rem;"><i class="fas fa-rocket"></i> Promote</button>'
                + '<button class="btn btn-small business-page-share-btn" style="border-radius:50px;padding:8px 18px;font-size:0.82rem;background:rgba(10,14,39,0.05);"><svg style="vertical-align:-3px;margin-right:2px;" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share</button>'
                + '</div></div>'
                /* Stats */
                + '<div style="display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid rgba(10,14,39,0.06);margin:0 24px;">'
                + '<div style="padding:14px;text-align:center;border-right:1px solid rgba(10,14,39,0.06);"><strong style="font-size:1.2rem;font-family:\'Syne\',sans-serif;color:var(--primary);" id="business-page-follower-count">' + (page.followerCount || 0).toLocaleString() + '</strong><p style="font-size:0.72rem;color:var(--text-muted);margin:0;">Followers</p></div>'
                + '<div style="padding:14px;text-align:center;border-right:1px solid rgba(10,14,39,0.06);"><strong style="font-size:1.2rem;font-family:\'Syne\',sans-serif;color:var(--primary);" id="biz-post-count">0</strong><p style="font-size:0.72rem;color:var(--text-muted);margin:0;">Posts</p></div>'
                + '<div style="padding:14px;text-align:center;border-right:1px solid rgba(10,14,39,0.06);"><strong style="font-size:1.2rem;font-family:\'Syne\',sans-serif;color:var(--secondary);">8.2%</strong><p style="font-size:0.72rem;color:var(--text-muted);margin:0;">Engagement</p></div>'
                + '<div style="padding:14px;text-align:center;"><strong style="font-size:1.2rem;font-family:\'Syne\',sans-serif;color:var(--accent2);">56.4K</strong><p style="font-size:0.72rem;color:var(--text-muted);margin:0;">Reach (30d)</p></div>'
                + '</div>'
                /* Tabs */
                + '<div class="profile-tabs" id="business-page-tabs" style="padding:0 24px;margin-top:0;">'
                + '<div class="profile-tab active" data-target="business-page-feed-tab">Feed</div>'
                + '<div class="profile-tab" data-target="business-page-about-tab">About</div>'
                + '<div class="profile-tab" data-target="business-page-media-tab">Media</div>'
                + '<div class="profile-tab" data-target="business-page-promotion-tab">Campaigns</div>'
                + '<div class="profile-tab" data-target="business-page-analytics-tab">Analytics</div>'
                + '</div></div>'
                /* Feed tab */
                + '<div id="business-page-feed-tab" class="profile-tab-content active">'
                + '<div class="card" style="margin-bottom:16px;"><div class="card-content">'
                + '<h3 style="margin-bottom:16px;"><i class="fas fa-pen" style="color:var(--secondary);margin-right:8px;"></i>Create Business Post</h3>'
                + '<form id="create-business-post-form">'
                + '<div class="form-group"><textarea id="business-post-text" rows="3" placeholder="Share updates, products, services, or announcements..." style="resize:vertical;min-height:80px;"></textarea></div>'
                + '<div id="business-post-media-preview" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;margin-bottom:12px;"></div>'
                + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">'
                + '<label for="business-post-media-input" class="btn btn-media-upload" style="cursor:pointer;padding:8px 16px;font-size:0.82rem;"><i class="fas fa-photo-video"></i> Media</label>'
                + '<input type="file" id="business-post-media-input" accept="image/*,video/*" multiple style="display:none;">'
                + '<button type="submit" class="btn btn-accent" style="padding:10px 24px;font-size:0.88rem;border-radius:50px;"><i class="fas fa-paper-plane"></i> Post</button>'
                + '</div></form></div></div>'
                + '<div id="business-page-feed-container"><div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-stream" style="font-size:2rem;display:block;margin-bottom:12px;"></i><p>No business posts yet. Start sharing!</p></div></div></div>';

        } else {
            /* Create page prompt */
            container.innerHTML =
                '<div class="card"><div class="card-content" id="create-page-prompt" style="text-align:center;padding:60px 30px;">'
                + '<i class="fas fa-building" style="font-size:3rem;color:var(--secondary);display:block;margin-bottom:20px;"></i>'
                + '<h2>Create Your Business Page</h2>'
                + '<p style="color:var(--text-muted);margin:12px 0 28px;">Reach more customers, build your brand, and connect with your community on Empyrean.</p>'
                + '<button id="create-business-page-btn" class="btn btn-accent" style="font-size:1rem;padding:14px 32px;border-radius:50px;">'
                + '<i class="fas fa-plus"></i> Create Business Page</button>'
                + '</div></div>';
        }
    }
    window.renderBusinessPage = renderBusinessPage;


    /* =========================================================================
       §4  populateProfileGallery
       ========================================================================= */

    /**
     * Populate #profile-gallery from .impact-story posts belonging to userId.
     * FIX (report — "this place should contain just profile page videos
     * catalog alone since the picture tab and grid has been created
     * already"): now that Pictures has its own tab (see
     * populateProfilePicturesGallery above), this tab keeps only posts
     * that actually contain a video — photo-only posts, and non-media
     * embeds like the Quote/Meme card (which was rendering here too,
     * misshapen, since it sits inside a .story-media-container without
     * being a plain img/video — that's the stray overflowing card text
     * seen in the report screenshot), no longer qualify at all.
     * @param {string} userId
     */
    function populateProfileGallery(userId) {
        var gallery = document.getElementById('profile-gallery');
        if (!gallery) return;

        var allPosts   = Array.from(document.querySelectorAll('.impact-story[data-user-id="' + userId + '"]'));
        var videoPosts = allPosts.filter(function (p) {
            var mc = p.querySelector('.story-media-container');
            return mc && mc.querySelector('video');
        });

        if (videoPosts.length === 0) {
            gallery.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;font-size:0.9rem;">No videos yet.</p>';
            return;
        }

        gallery.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;';
        gallery.innerHTML = '';

        videoPosts.forEach(function (post) {
            var mc = post.querySelector('.story-media-container');
            if (!mc) return;
            var firstVid = mc.querySelector('video');
            if (!firstVid) return;
            var src = firstVid.src || (firstVid.querySelector('source') ? firstVid.querySelector('source').src : '');
            if (!src || src.startsWith('blob:')) return;

            var totalMedia = mc.querySelectorAll('img, video').length;

            /* FIX (report — "videos should show video live viewers count,
               did you implement that"): each post already tracks and
               live-updates its own view count in its normal feed card
               (.story-actions .view-count — see app-feed.js's
               _viewCountObserver, which keeps that span's text current).
               Read it straight off THIS SAME post element rather than
               re-fetching/re-deriving a count, so the gallery badge is
               always in sync with the number already shown on the post
               itself, no separate tracking needed. */
            var _vcEl   = post.querySelector('.story-actions .view-count');
            var _vcText = (_vcEl && _vcEl.textContent.trim()) || '0';

            var card = document.createElement('div');
            card.className = 'emp-profile-video-thumb';
            card.innerHTML = '<video src="' + _attr(src) + '" muted playsinline preload="metadata"></video>'
                + '<div class="emp-profile-video-play"><span><i class="fas fa-play"></i></span></div>'
                + '<div class="emp-profile-reel-viewcount"><i class="fas fa-play"></i>' + _esc(_vcText) + '</div>';

            /* Multi-count badge — same "this post has N media items" hint
               the old mixed grid gave, unchanged. */
            if (totalMedia > 1) {
                var badge = document.createElement('div');
                badge.className = 'emp-profile-video-count';
                badge.innerHTML = '<i class="fas fa-images" style="font-size:0.65rem;margin-right:2px;"></i>' + totalMedia;
                card.appendChild(badge);
            }

            card.addEventListener('click', function () {
                var allUrls = Array.from(mc.querySelectorAll('img, video')).map(function (el) {
                    return { url: el.src || '', type: el.tagName === 'VIDEO' ? 'video/mp4' : 'image/jpeg' };
                }).filter(function (m) { return m.url && !m.url.startsWith('blob:'); });

                if (typeof window.showMarketplaceGallery === 'function') {
                    window.showMarketplaceGallery(allUrls, 0);
                } else {
                    window.open(src, '_blank');
                }
            });

            gallery.appendChild(card);
        });
    }
    window.populateProfileGallery = populateProfileGallery;

    /**
     * Populate #profile-pictures-gallery from .impact-story posts belonging
     * to userId — IMAGES ONLY, split out of populateProfileGallery above
     * per this session's request (report item #2: "create a sub column for
     * picture collection ... same frame size expandable on clicking").
     * Mirrors that function's own DOM-scrape + click-to-expand approach
     * (same source posts, same lightbox), just filtered to image media and
     * rendered into its own square-tile grid instead of the mixed one.
     * @param {string} userId
     */
    function populateProfilePicturesGallery(userId) {
        var gallery = document.getElementById('profile-pictures-gallery');
        if (!gallery) return;

        var allPosts  = Array.from(document.querySelectorAll('.impact-story[data-user-id="' + userId + '"]'));
        var picPosts  = allPosts.filter(function (p) {
            var mc = p.querySelector('.story-media-container');
            return mc && mc.querySelector('img');
        });

        if (picPosts.length === 0) {
            gallery.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;font-size:0.9rem;">No pictures yet.</p>';
            return;
        }

        gallery.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;';
        gallery.innerHTML = '';

        picPosts.forEach(function (post) {
            var mc = post.querySelector('.story-media-container');
            if (!mc) return;
            var imgs = Array.from(mc.querySelectorAll('img'));

            imgs.forEach(function (imgEl) {
                var src = imgEl.src || '';
                if (!src || src.startsWith('blob:')) return;

                var card = document.createElement('div');
                card.className = 'emp-profile-pic-thumb';
                card.innerHTML = '<img src="' + _attr(src) + '" alt="Photo" loading="lazy" onerror="this.parentElement.style.display=\'none\'">';

                /* Click-to-expand — same lightbox every other gallery in
                   this file already opens, starting on THIS specific
                   photo among all of this post's images (matches the
                   "expandable on clicking" ask). */
                card.addEventListener('click', function () {
                    var allImgs = imgs.map(function (el) {
                        return { url: el.src || '', type: 'image/jpeg' };
                    }).filter(function (m) { return m.url && !m.url.startsWith('blob:'); });
                    var startIdx = allImgs.findIndex(function (m) { return m.url === src; });
                    if (typeof window.showMarketplaceGallery === 'function') {
                        window.showMarketplaceGallery(allImgs, startIdx >= 0 ? startIdx : 0);
                    } else {
                        window.open(src, '_blank');
                    }
                });

                gallery.appendChild(card);
            });
        });
    }
    window.populateProfilePicturesGallery = populateProfilePicturesGallery;


    /* =========================================================================
       §5  _populateHomeBioCard
       ========================================================================= */

    function _populateHomeBioCard() {
        var card = document.getElementById('home-user-bio-card');
        if (!card || _isGuest()) { if (card) card.style.display = 'none'; return; }
        if (typeof window.renderSuggestedUsers === 'function') {
            setTimeout(window.renderSuggestedUsers, 150);
        }
    }
    window._populateHomeBioCard = _populateHomeBioCard;


    /* =========================================================================
       §6  showFollowersModal / showFollowingModal
       ========================================================================= */

    window.showFollowersModal = function (tab) {
        var us      = _us();
        var mu      = _mu();
        var followed = Array.from(us.followedUserIds || []);

        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:var(--z-critical,99999);display:flex;align-items:center;justify-content:center;';

        var box = document.createElement('div');
        box.style.cssText = 'background:white;border-radius:20px;width:min(400px,92vw);max-height:80vh;overflow:hidden;display:flex;flex-direction:column;';

        /* Tab bar */
        var tabs    = document.createElement('div');
        tabs.style.cssText = 'display:flex;border-bottom:1px solid rgba(10,14,39,0.08);';
        var tabFlw  = document.createElement('button');
        tabFlw.style.cssText  = 'flex:1;padding:14px;border:none;background:none;font-weight:700;cursor:pointer;color:var(--primary);';
        tabFlw.textContent    = 'Followers (' + (us.followerCount || 0) + ')';
        var tabFlwing = document.createElement('button');
        tabFlwing.style.cssText = 'flex:1;padding:14px;border:none;background:none;font-weight:600;cursor:pointer;color:var(--text-muted);';
        tabFlwing.textContent = 'Following (' + followed.length + ')';
        var closeBtn = document.createElement('button');
        closeBtn.style.cssText = 'padding:14px;border:none;background:none;cursor:pointer;font-size:1.2rem;color:var(--text-muted);';
        closeBtn.innerHTML     = '&times;';
        closeBtn.onclick = function () { overlay.remove(); };
        tabs.appendChild(tabFlw);
        tabs.appendChild(tabFlwing);
        tabs.appendChild(closeBtn);

        /* Panels */
        var panFlw = document.createElement('div');
        panFlw.style.cssText = 'overflow-y:auto;flex:1;padding:12px;';
        panFlw.innerHTML = (us.followerCount || 0) > 0
            ? '<p style="text-align:center;padding:20px;color:var(--text-muted);">Follower list synced from backend.</p>'
            : '<p style="text-align:center;padding:20px;color:var(--text-muted);">No followers yet.</p>';

        var panFlwing = document.createElement('div');
        panFlwing.style.cssText = 'overflow-y:auto;flex:1;padding:12px;display:none;';

        if (followed.length > 0) {
            followed.forEach(function (uid) {
                var u   = mu[uid] || {};
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(10,14,39,0.05);cursor:pointer;';
                var img = document.createElement('img');
                img.src           = u.avatar || 'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=40';
                img.style.cssText = 'width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;';
                var info = document.createElement('div');
                info.innerHTML    = '<strong style="display:block;">' + _esc(u.fullName || 'User') + '</strong><span style="font-size:0.8rem;color:var(--text-muted);">@' + _esc(u.username || 'user') + '</span>';
                row.appendChild(img);
                row.appendChild(info);
                row.onclick = function () {
                    overlay.remove();
                    window._viewingOtherProfile = (uid !== us.id);
                    if (typeof window.renderUserProfile === 'function') window.renderUserProfile(uid);
                    if (typeof window.navigateTo       === 'function') window.navigateTo('profile', true);
                    setTimeout(function () { window._viewingOtherProfile = false; }, 500);
                };
                panFlwing.appendChild(row);
            });
        } else {
            panFlwing.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted);">Not following anyone yet.</p>';
        }

        /* Tab switching */
        tabFlw.onclick = function () {
            panFlw.style.display = 'block'; panFlwing.style.display = 'none';
            tabFlw.style.fontWeight = '700'; tabFlw.style.color = 'var(--primary)';
            tabFlwing.style.fontWeight = '600'; tabFlwing.style.color = 'var(--text-muted)';
        };
        tabFlwing.onclick = function () {
            panFlw.style.display = 'none'; panFlwing.style.display = 'block';
            tabFlwing.style.fontWeight = '700'; tabFlwing.style.color = 'var(--primary)';
            tabFlw.style.fontWeight = '600'; tabFlw.style.color = 'var(--text-muted)';
        };

        box.appendChild(tabs);
        box.appendChild(panFlw);
        box.appendChild(panFlwing);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

        if (tab === 'following') tabFlwing.onclick();
    };

    window.showFollowingModal = function () { window.showFollowersModal('following'); };


    /* =========================================================================
       §7  PROFILE TAB SWITCHING (delegated)
       ========================================================================= */

    document.addEventListener('click', function (e) {
        var tab = e.target.closest('.profile-tab');
        if (!tab) return;
        var target = tab.dataset.target;
        if (!target) return;

        /* Deactivate siblings */
        var tabBar = tab.closest('.profile-tabs');
        if (tabBar) {
            tabBar.querySelectorAll('.profile-tab').forEach(function (t) { t.classList.remove('active'); });
        }
        tab.classList.add('active');

        /* Hide all sibling tab contents */
        var card = tab.closest('.card, .card-content, #profile') || document;
        card.querySelectorAll('.profile-tab-content').forEach(function (c) { c.style.display = 'none'; c.classList.remove('active'); });

        /* Show target */
        var panel = document.getElementById(target);
        if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }

        /* Lazy-populate gallery on first open */
        if (target === 'profile-main-content') {
            var gal = document.getElementById('profile-gallery');
            /* FIX: this used to check for '.gallery-item, [data-media-url]'
               — neither class/attribute is ever created by
               populateProfileGallery (which renders '.emp-profile-video-
               thumb' tiles), so this check always re-ran the population
               unconditionally rather than actually skipping when already
               populated. Harmless (population is cheap/idempotent), but
               fixed to match reality now that this tab has its own real
               thumbnail class, same as the Reels/Pictures tabs' checks. */
            if (gal && !gal.querySelector('.emp-profile-video-thumb')) {
                var uid = (window.EmpState ? window.EmpState.userState : window.userState || {}).id;
                if (uid) populateProfileGallery(uid);
            }
        }

        /* Lazy-populate the Reels gallery on first open — same safety-net
           pattern as the Photos/Videos gallery above. Deliberately reads
           the id off .profile-header-info's own data-user-id (set from the
           PROFILE BEING VIEWED, see renderUserProfile) rather than the
           logged-in window.userState.id the Gallery fallback above uses —
           the Gallery fallback rarely misfires because populateProfileGallery
           already ran unconditionally at render time, but getting a fresh
           fallback right matters more here since it's easy to open this tab
           on someone else's profile before that happens to be true. */
        if (target === 'profile-reels-tab') {
            var relGal = document.getElementById('profile-reels-gallery');
            if (relGal && !relGal.querySelector('.reel-preview-card')) {
                var headerInfo = document.querySelector('.profile-header-info[data-user-id]');
                var viewedUid  = headerInfo ? headerInfo.dataset.userId : null;
                if (viewedUid) populateProfileReelsGallery(viewedUid);
            }
        }

        /* Lazy-populate the Pictures gallery on first open — same
           safety-net pattern as the two galleries above. Reads the
           logged-in user's own id the same way the mixed Gallery tab's
           fallback does above, since populateProfilePicturesGallery
           scrapes the same already-rendered .impact-story DOM (no
           network fetch of its own, so there's no "viewed profile" id
           to get right the way the Reels tab needs). */
        if (target === 'profile-pictures-tab') {
            var picGal = document.getElementById('profile-pictures-gallery');
            if (picGal && !picGal.querySelector('.emp-profile-pic-thumb')) {
                var picUid = (window.EmpState ? window.EmpState.userState : window.userState || {}).id;
                if (picUid) populateProfilePicturesGallery(picUid);
            }
        }
    });


    /* =========================================================================
       §8  STORY-HEADER CLICK → USER PROFILE NAVIGATION
       ========================================================================= */

    document.addEventListener('click', function (e) {
        var storyHeader = e.target.closest('.story-header');
        if (!storyHeader) return;
        var clickedAvatar = e.target.closest('.avatar-placeholder') || (e.target.tagName === 'IMG' ? e.target : null);
        var clickedName   = e.target.closest('.story-user-info strong');
        if (!clickedAvatar && !clickedName) return;
        var post   = storyHeader.closest('.impact-story');
        if (!post) return;
        var userId = post.dataset.userId;
        var us     = _us();
        if (!userId || userId === us.id) return;
        e.preventDefault();
        e.stopPropagation();
        var mu = _mu();
        if (!mu[userId]) return;
        window._viewingOtherProfile = true;
        renderUserProfile(userId);
        if (typeof window.navigateTo === 'function') window.navigateTo('profile', true);
        setTimeout(function () { window._viewingOtherProfile = false; }, 500);
    });

    // Birthday feature — "Send a Gift" button (only rendered when the
    // profile owner's dobMonthDay matches today — see isBirthdayToday
    // above). Opens the profile/birthday gift catalog from app-gifts.js.
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#profile-send-gift-btn');
        if (!btn) return;
        e.preventDefault();
        if (typeof window.openProfileGiftCatalog === 'function') {
            window.openProfileGiftCatalog(btn.dataset.giftUserId, btn.dataset.giftUserName);
        }
    });

    // "View All & Send a Wish" — opens the full Birthday Wishes modal
    // (app-gifts.js) from the embedded #profile-birthday-section preview,
    // so a visitor who wants to actually type a wish or send a gift/card
    // gets the full modal experience rather than a cramped inline form.
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('#profile-birthday-viewall-btn');
        if (!btn) return;
        e.preventDefault();
        if (typeof window.openBirthdayWishesFeed === 'function') {
            window.openBirthdayWishesFeed(btn.dataset.giftUserId, btn.dataset.giftUserName, btn.dataset.giftUserAvatar);
        }
    });

    /* Celebratory avatar frame CSS — injected once, per this codebase's
       runtime-style-injection convention (see _profileReelStripToken's own
       comment block above for the same convention in this file). Ring
       gradient matches app-gifts.js's dashboard "Birthdays Today" chips
       and Birthday Wishes modal header, so the same visual language is
       used everywhere a birthday shows up across the app. */
    (function _ensureBirthdayProfileCSS() {
        if (document.getElementById('_profile_bday_frame_css')) return;
        var css = document.createElement('style');
        css.id = '_profile_bday_frame_css';
        css.textContent = [
            '.profile-pic-container.emp-bday-avatar-frame{position:relative;border-radius:50%;padding:4px;',
            'background:linear-gradient(135deg,#F5C518,#F08C1A,#EF4444);}',
            '.profile-pic-container.emp-bday-avatar-frame .avatar-placeholder{width:142px!important;height:142px!important;}',
            '.emp-bday-avatar-cake{position:absolute;bottom:2px;right:2px;font-size:1.5rem;background:#fff;border-radius:50%;',
            'width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.22);}'
        ].join('\n');
        document.head.appendChild(css);
    })();

    /* Birthday Messages section — live feed embedded on the profile
       itself (see #profile-birthday-section markup above). Reads the same
       `birthday_feed` collection as app-gifts.js's Birthday Wishes modal
       (SECTION 12 there) — this is intentionally a SEPARATE, independent
       listener rather than reaching into that file's private module state,
       matching this codebase's established "additive, don't reach into
       another file's closure" convention. Shows at most the 4 most recent
       entries (wishes, gifts, and custom cards alike) as a quick preview;
       "View All & Send a Wish" opens the full modal for everything else. */
    var _bdProfileFeed = { userId: null, unsub: null };

    function _bdProfEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _renderProfileBirthdayMessages(items) {
        var list = document.getElementById('profile-birthday-messages');
        if (!list) return;
        if (!items.length) {
            list.innerHTML = '<div style="text-align:center;color:#99a;font-size:0.82rem;padding:8px 0;">No wishes yet — be the first to say Happy Birthday! 🎉</div>';
            return;
        }
        var recent = items.slice(-4).reverse(); // newest first, preview only
        list.innerHTML = recent.map(function (it) {
            var name = _bdProfEsc(it.senderName || 'Someone');
            var body = it.type === 'gift'
                ? '<span style="color:#8a6d1a;font-weight:700;">' + _bdProfEsc(it.giftSymbol || '🎁') + ' sent ' + _bdProfEsc(it.giftName || 'a gift') + '</span>'
                : it.type === 'card'
                ? '<span style="display:inline-block;border-radius:8px;padding:4px 8px;color:#fff;font-weight:700;background:' + _bdProfEsc(it.cardBg || 'linear-gradient(135deg,#1B2B8B,#5B0EA6)') + ';">🎉 ' + _bdProfEsc(it.message || '') + '</span>'
                : _bdProfEsc(it.message || '');
            return '<div style="background:#fff;border-radius:10px;padding:8px 10px;font-size:0.82rem;">' +
                '<strong style="color:#1B2B8B;">' + name + '</strong><br>' + body + '</div>';
        }).join('');
    }

    function _mountProfileBirthdayFeed(userId) {
        if (!document.getElementById('profile-birthday-messages')) return;
        if (_bdProfileFeed.unsub) { try { _bdProfileFeed.unsub(); } catch (e) {} _bdProfileFeed.unsub = null; }
        _bdProfileFeed.userId = userId;
        if (!window.fbDb || !window._firebaseLoaded) return;
        try {
            _bdProfileFeed.unsub = window.fbDb.collection('birthday_feed')
                .where('birthdayUserId', '==', userId)
                .onSnapshot(function (snap) {
                    if (_bdProfileFeed.userId !== userId) return; /* a newer profile render took over */
                    var items = [];
                    snap.forEach(function (doc) { items.push(doc.data() || {}); });
                    items.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
                    _renderProfileBirthdayMessages(items);
                }, function (err) {
                    console.warn('[Profile] birthday messages listener error:', err && err.message);
                });
        } catch (e) {
            console.warn('[Profile] could not attach birthday messages listener:', e && e.message);
        }
    }


    /* =========================================================================
       §9  OWNER REEL GALLERY & PROFILE FEED INTEGRATION

       Reels live in their own Firestore "reels" collection (see app-feed.js's
       reels onSnapshot listener / app-fixes.js's reel-submit handler) — they
       are NOT .impact-story posts, so populateProfileGallery() (§4, which
       only ever scans .impact-story[data-user-id] elements) never sees them
       and they never showed up anywhere on a profile. This section adds:

         (a) populateProfileReelsGallery(userId) — fills the dedicated
             "Reels" tab (#profile-reels-gallery) added above, a 3-col
             thumbnail grid distinct from the Photos/Videos Gallery tab.
         (b) _mountProfileFeedReelStrip(userId) — a horizontally
             swipeable + auto-sliding reel strip inserted into the middle
             of BOTH feed containers that show this profile's posts —
             #profile-posts-feed (Posts tab) and #profile-dash-feed
             (Dashboard tab's "Your Feed", own profile only) — reusing the
             same .horizontal-slider-* scroll-snap machinery already used
             for the Dashboard tab's "Live Streams" row, so swipe/
             drag-to-scroll comes for free; only the auto-slide timer is
             new.

       Both read from the SAME small Firestore-backed cache (_fetchOwnerReels)
       so opening this profile only ever issues one "reels for this user"
       query, not two (or three, now that there are two feed containers).
       ========================================================================= */

    var _reelsCache        = {};   // userId -> { ts, reels: [...] }
    var REELS_CACHE_TTL_MS = 60000;
    var _reelStrips         = {};  // feedId -> { interval, observer } — one entry per mounted strip

    function _sortReelsDesc(list) {
        return list.slice().sort(function (a, b) {
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
    }

    /* DOM fallback for when Firestore isn't reachable yet — mirrors
       populateProfileGallery's own "read what's already rendered" approach.
       Only the global reels grid (app-feed.js's #reels-grid-container)
       reliably stamps data-user-id on its cards; the dashboard slider
       cards don't, so they're not usable as a fallback source here. */
    function _domFallbackReels(userId) {
        var cards = Array.from(document.querySelectorAll('#reels-grid-container .reel-card[data-user-id="' + userId + '"]'));
        return cards.map(function (c) {
            return {
                id:        c.dataset.postId || c.dataset.reelId || '',
                videoUrl:  c.dataset.videoUrl || '',
                username:  c.dataset.username || '',
                avatar:    c.dataset.avatar   || '',
                caption:   c.dataset.caption  || '',
                userId:    userId
            };
        }).filter(function (r) { return r.id && r.videoUrl; });
    }

    /**
     * Fetch (and briefly cache) every reel belonging to userId.
     * @param {string} userId
     * @param {function(Array)} cb
     */
    function _fetchOwnerReels(userId, cb) {
        var cached = _reelsCache[userId];
        if (cached && (Date.now() - cached.ts) < REELS_CACHE_TTL_MS) { cb(cached.reels); return; }

        if (window.fbDb && window._firebaseLoaded) {
            window.fbDb.collection('reels').where('userId', '==', userId).limit(30).get()
                .then(function (snap) {
                    var list = [];
                    snap.forEach(function (doc) {
                        var d = doc.data() || {};
                        if (!d.videoUrl || String(d.videoUrl).indexOf('blob:') === 0) return;
                        list.push(d);
                    });
                    list = _sortReelsDesc(list);
                    _reelsCache[userId] = { ts: Date.now(), reels: list };
                    cb(list);
                })
                .catch(function (err) {
                    console.warn('[EmpProfile] owner reel fetch failed, falling back to what\'s already on screen:', err && err.message);
                    cb(_domFallbackReels(userId));
                });
        } else {
            cb(_domFallbackReels(userId));
        }
    }

    /* ── (a) Reels gallery tab ── */

    function populateProfileReelsGallery(userId) {
        var gallery = document.getElementById('profile-reels-gallery');
        if (!gallery) return;
        gallery.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;font-size:0.9rem;"><i class="fas fa-circle-notch fa-spin"></i> Loading reels…</p>';

        _fetchOwnerReels(userId, function (reels) {
            /* The profile may have been re-rendered (or navigated away from)
               by the time this async callback lands — re-grab fresh, don't
               trust the closed-over reference. */
            gallery = document.getElementById('profile-reels-gallery');
            if (!gallery) return;

            if (!reels.length) {
                gallery.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;font-size:0.9rem;">No reels yet.</p>';
                return;
            }

            gallery.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;';
            gallery.innerHTML = '';

            reels.forEach(function (reel) {
                var card = document.createElement('div');
                /* .reel-preview-card is what app-reel.js's document-level
                   click delegate + openReelViewer() already look for — this
                   is what makes tapping a thumbnail open the real fullscreen
                   reel viewer without any new click-wiring here. */
                card.className        = 'emp-profile-reel-thumb reel-preview-card';
                card.dataset.postId   = reel.id       || '';
                card.dataset.reelId   = reel.id       || '';
                card.dataset.videoUrl = reel.videoUrl || '';
                card.dataset.username = reel.username || '';
                card.dataset.avatar   = reel.avatar   || '';
                card.dataset.caption  = reel.caption  || '';
                card.dataset.userId   = reel.userId   || userId;

                /* FIX (2026-08-22 — reel thumbnails rendering inconsistently /
                   solid black): see _empReelPosterUrl's header comment in
                   app-reel.js. Guarded — if app-reel.js hasn't loaded yet or
                   can't derive a poster for this URL, this is unchanged. */
                var _galleryPoster = (typeof window._empReelPosterUrl === 'function') ? window._empReelPosterUrl(reel.videoUrl) : '';
                /* FIX (report — "with the live viewers count as shown
                   above"): reel.viewCount is the raw Firestore field name
                   for this collection (see app-reel.js, which reads the
                   same field into its own on-screen "data.views" — that
                   file's own reel-view-count element, not this one). */
                var _galleryViews = reel.viewCount || 0;
                card.innerHTML =
                    '<video src="' + _attr(reel.videoUrl || '') + '"' + (_galleryPoster ? ' poster="' + _attr(_galleryPoster) + '"' : '') + ' muted playsinline preload="metadata"></video>'
                    + '<div class="emp-profile-reel-play"><span><i class="fas fa-play"></i></span></div>'
                    + '<div class="emp-profile-reel-viewcount"><i class="fas fa-play"></i>' + _galleryViews.toLocaleString() + '</div>';

                gallery.appendChild(card);
            });
        });
    }
    window.populateProfileReelsGallery = populateProfileReelsGallery;

    /* ── (b) Mid-feed reel strip: swipeable + auto-sliding ── */

    function _reelStripCardHTML(reel, userId) {
        var avatarFallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(reel.username || 'U') + '&background=1B2B8B&color=fff&size=80';
        return '<div class="emp-profile-feed-reel-card reel-preview-card" '
            + 'data-post-id="'   + _attr(reel.id       || '') + '" '
            + 'data-reel-id="'   + _attr(reel.id       || '') + '" '
            + 'data-video-url="' + _attr(reel.videoUrl || '') + '" '
            + 'data-username="'  + _attr(reel.username || '') + '" '
            + 'data-avatar="'    + _attr(reel.avatar   || '') + '" '
            + 'data-caption="'   + _attr(reel.caption  || '') + '" '
            + 'data-user-id="'   + _attr(reel.userId   || userId) + '">'
            /* FIX (2026-08-22 — reel thumbnails rendering inconsistently /
               solid black): see _empReelPosterUrl's header comment in
               app-reel.js. */
            + '<video src="' + _attr(reel.videoUrl || '') + '"' + ((typeof window._empReelPosterUrl === 'function' && window._empReelPosterUrl(reel.videoUrl)) ? ' poster="' + _attr(window._empReelPosterUrl(reel.videoUrl)) + '"' : '') + ' loop muted playsinline preload="metadata"></video>'
            + '<div class="emp-pfrc-avatar"><img src="' + _attr(reel.avatar || avatarFallback) + '" '
            + 'onerror="this.onerror=null;this.src=\'' + avatarFallback + '\';"></div>'
            + '</div>';
    }

    /* Keeps a strip sitting at (roughly) the middle of its feed container's
       current children, re-run whenever a post is added/removed elsewhere
       (app-feed.js/app-fixes.js/app-live.js all clone posts into
       #profile-posts-feed and/or #profile-dash-feed asynchronously and
       independently of this file — see the grep in this section's own
       header).
       @param {string} feedId  id of the feed container ('profile-posts-feed' or 'profile-dash-feed')
       @param {string} stripId id of THAT feed's own strip element */
    function _repositionReelStrip(feedId, stripId) {
        var feed  = document.getElementById(feedId);
        var strip = document.getElementById(stripId);
        if (!feed || !strip) return;

        var siblings = Array.prototype.filter.call(feed.children, function (c) { return c !== strip; });
        if (!siblings.length) {
            if (strip.parentNode !== feed) feed.appendChild(strip);
            return; /* no posts yet to sit "in the middle" of — keep as-is, will reposition once posts land */
        }
        var anchor = siblings[Math.floor(siblings.length / 2)];
        if (strip.nextSibling !== anchor) feed.insertBefore(strip, anchor);
    }

    function _startReelStripAutoSlide(feedId, wrapper) {
        var entry = _reelStrips[feedId] || (_reelStrips[feedId] = {});
        if (entry.interval) clearInterval(entry.interval);
        entry.interval = setInterval(function () {
            /* Strip was torn down by a re-render/navigation — stop ourselves
               rather than relying on the caller to remember to clear us. */
            if (!document.body.contains(wrapper)) { clearInterval(entry.interval); entry.interval = null; return; }
            if (wrapper._empUserInteracting) return;             /* paused — person is mid-swipe */
            if (wrapper.offsetParent === null) return;            /* that tab isn't currently visible — no point animating */
            if (!wrapper.children.length) return;

            var cardW = wrapper.firstElementChild.getBoundingClientRect().width + 12; /* +gap */
            var atEnd = wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 4;
            wrapper.scrollTo({ left: atEnd ? 0 : (wrapper.scrollLeft + cardW), behavior: 'smooth' });
        }, 3500);
    }

    /* Mounts one swipeable + auto-sliding reel strip into a single feed
       container. Shared by both the Posts tab and the Dashboard tab below —
       identical behavior in each place, just a different container/element
       id so the two strips (and their own timers/observers) never collide. */
    function _mountReelStripInto(feedId, stripId, wrapperId, userId, reels) {
        var feed = document.getElementById(feedId);
        if (!feed) return;

        var strip = document.createElement('div');
        strip.id        = stripId;
        strip.className = 'card emp-profile-reel-strip-card';
        strip.style.cssText = 'margin:4px 0 14px;border-radius:16px;overflow:hidden;';
        strip.innerHTML =
            '<div class="emp-pfrs-header">'
            + '<i class="fas fa-film" style="color:#5B0EA6;"></i>'
            + '<strong style="font-size:0.9rem;">Reels</strong>'
            + '</div>'
            + '<div class="horizontal-slider-container">'
            + '<div class="horizontal-slider-wrapper" id="' + wrapperId + '">'
            + reels.map(function (r) { return _reelStripCardHTML(r, userId); }).join('')
            + '</div></div>';

        feed.appendChild(strip); /* placed once here; _repositionReelStrip() below moves it to the middle */
        _repositionReelStrip(feedId, stripId);

        var wrapper = document.getElementById(wrapperId);
        if (wrapper) {
            /* Pause auto-slide while the person is actually swiping it
               themselves, resume shortly after they let go. */
            ['touchstart', 'pointerdown', 'mousedown'].forEach(function (evt) {
                wrapper.addEventListener(evt, function () { wrapper._empUserInteracting = true; }, { passive: true });
            });
            ['touchend', 'pointerup', 'mouseup'].forEach(function (evt) {
                wrapper.addEventListener(evt, function () {
                    setTimeout(function () { wrapper._empUserInteracting = false; }, 2500);
                }, { passive: true });
            });
            _startReelStripAutoSlide(feedId, wrapper);
        }

        /* Keep the strip mid-feed as other modules asynchronously clone
           more posts into this container over time. */
        var entry = _reelStrips[feedId] || (_reelStrips[feedId] = {});
        entry.observer = new MutationObserver(function () {
            clearTimeout(feed._pfrsRepositionTimer);
            feed._pfrsRepositionTimer = setTimeout(function () { _repositionReelStrip(feedId, stripId); }, 200);
        });
        entry.observer.observe(feed, { childList: true });
    }

    /* Mounts the reel strip into every feed container present on the
       currently-rendered profile: #profile-posts-feed (Posts tab, every
       profile) and #profile-dash-feed (Dashboard tab's "Your Feed", own
       profile only — the element simply doesn't exist on someone else's
       profile, so that half of this is a no-op there). */
    var _reelStripMountToken = 0;
    function _mountProfileFeedReelStrip(userId) {
        /* FIX (2026-08-20 — reel strip still occasionally showing 3 copies,
           "1 up top, 2 stuck at the bottom"): the 2026-08-10 fix below
           (renderUserProfile's own _profileReelStripToken, see that
           function) only guards against renderUserProfile() SCHEDULING
           this function more than once inside the same 500ms window — it
           says nothing about two legitimately-spaced calls to THIS
           function (500ms+ apart, e.g. leaving and reopening the profile)
           both landing while their own _fetchOwnerReels() calls are still
           in flight, which a slow/flaky mobile connection (this app's
           documented weak-4G/bouncing-signal cases) makes easy to hit.
           Neither call's async fetch callback had any way to know a NEWER
           call had since started, so whichever fetch resolved LAST would
           mount its own fresh strip without knowing an earlier call's
           strip already existed — the DOM cleanup a few lines down only
           runs synchronously at the START of a call, before either fetch
           has resolved, so it can never retroactively catch a duplicate
           mounted by an overlapping call's late-arriving response. Once
           that duplicate exists, _repositionReelStrip()'s own
           document.getElementById(stripId) — which, given a duplicate id,
           always resolves to the FIRST one in DOM order — only ever
           repositions THAT one into the middle of the feed; every later
           one it doesn't know about is left exactly where appendChild
           first put it, at the end of the feed. One correctly-positioned
           strip plus however many stragglers left at the end is exactly
           the reported "1 top, 2 bottom" symptom.

           FIX: give every call to this function its own generation token,
           checked right before the async mount actually happens — a call
           superseded by a newer one becomes a no-op instead of mounting a
           stale duplicate. Closes the gap the caller-side token doesn't
           cover, without touching that existing fix or anything else
           here. */
        var _myMountToken = ++_reelStripMountToken;

        /* Tear down whatever the PREVIOUS profile render (or a previous
           call for this same one) left running before starting fresh — any
           interval/observer would otherwise keep referencing detached DOM
           after renderUserProfile() rebuilds #profile section's innerHTML. */
        Object.keys(_reelStrips).forEach(function (feedId) {
            var entry = _reelStrips[feedId];
            if (entry.interval) clearInterval(entry.interval);
            if (entry.observer) entry.observer.disconnect();
        });
        _reelStrips = {};

        var targets = [
            { feedId: 'profile-posts-feed', stripId: 'profile-feed-reel-strip',      wrapperId: 'profile-feed-reel-strip-wrapper' },
            { feedId: 'profile-dash-feed',  stripId: 'profile-dash-feed-reel-strip', wrapperId: 'profile-dash-feed-reel-strip-wrapper' }
        ].filter(function (t) { return !!document.getElementById(t.feedId); });
        if (!targets.length) return;

        /* FIX (2026-08-10): the teardown above only ever cleared the JS-side
           interval/observer bookkeeping — it never removed the actual strip
           <div> from the DOM. Belt-and-suspenders here on top of the token
           fix at the call site (renderUserProfile): remove EVERY element
           matching each target's stripId (querySelectorAll, not
           getElementById — duplicate ids from before this fix would make
           getElementById silently see only the first one and miss the
           rest) before mounting a fresh one. This both prevents any new
           duplication and cleans up strips a still-open session may already
           have accumulated pre-fix. */
        targets.forEach(function (t) {
            document.querySelectorAll('#' + t.stripId).forEach(function (el) { el.remove(); });
        });

        _fetchOwnerReels(userId, function (reels) {
            if (_myMountToken !== _reelStripMountToken) return; /* a newer call to this function has since started — mounting now would create exactly the stray duplicate this fix exists to prevent */
            if (!reels.length) return; /* nothing to show — leave both feeds exactly as they were */
            targets.forEach(function (t) {
                if (!document.getElementById(t.feedId)) return; /* profile may have re-rendered by now */
                _mountReelStripInto(t.feedId, t.stripId, t.wrapperId, userId, reels);
            });
        });
    }
    window._mountProfileFeedReelStrip = _mountProfileFeedReelStrip;


    /* =========================================================================
       §9b  MID-FEED QUOTE/MEME CARD STRIP (Posts tab + Dashboard tab)
       ─────────────────────────────────────────────────────────────────────
       FEATURE (this session — "the quote and meme avatar card from the
       quick post and profile page post... currently appears vertically in
       the general dashboard... make it slide horizontally at the middle").
       NOT the Status/Story bar's own Quote/Meme statuses (app-status.js,
       #status-bar-container) — those are a separate, unrelated feature
       this session explicitly left untouched. This is specifically for
       ordinary POSTS created via the Quote/Meme Card composer (the
       "Quote Card" button in Quick Post and in this profile page's own
       post composer above — both call window.EmpQuoteCard.open(), and the
       resulting file is now tagged isQuoteCard:true — see app-fixes.js's
       _insertCard() and this file's own profile-post submit handler
       above).

       Same horizontally-swipeable, auto-sliding, mid-feed-positioned strip
       as the Reels one directly above (reuses the exact same
       .horizontal-slider-container/.horizontal-slider-wrapper scroll-snap
       CSS) — separate cache/state objects so the two strips never collide,
       but otherwise a deliberate mirror of that working, already-hardened
       implementation (same staleness-token + duplicate-DOM-cleanup fixes
       apply here for the same reasons).
       ========================================================================= */

    var _quoteMemeCache        = {};   // userId -> { ts, cards: [...] }
    var QUOTE_MEME_CACHE_TTL_MS = 60000;
    var _quoteMemeStrips        = {};  // feedId -> { interval, observer }
    /* FIX (this session — strip never appears; console showed
       `document.getElementById(stripId)` is `false`, i.e. the mount never
       ran): tracks whichever userId was last passed to
       _mountProfileFeedQuoteMemeStrip() so the `empyrean:firebase-ready`
       retry below (added for the same reason as app-feed.js's matching
       dashboard-strip fix) knows who to re-fetch for, without needing its
       own closure over renderUserProfile()'s local `userId`. */
    var _quoteMemeStripLastUserId = null;

    /* DOM fallback for when Firestore isn't reachable yet — same idea as
       _domFallbackReels above, scraping whatever quote/meme post cards are
       already rendered in this profile's own feed containers. Regular
       post cards don't carry a data-is-quote-card attribute (there's no
       existing convention for it), so this fallback intentionally returns
       nothing rather than guessing — the strip just doesn't appear until
       the Firestore query succeeds, same as "no reels yet" above. */
    function _fetchOwnerQuoteMemeCards(userId, cb) {
        var cached = _quoteMemeCache[userId];
        if (cached && (Date.now() - cached.ts) < QUOTE_MEME_CACHE_TTL_MS) { cb(cached.cards); return; }

        if (window.fbDb && window._firebaseLoaded) {
            window.fbDb.collection('posts')
                .where('userId', '==', userId)
                .where('isQuoteCard', '==', true)
                .limit(30).get()
                .then(function (snap) {
                    var list = [];
                    var _skippedNoMedia = 0;
                    snap.forEach(function (doc) {
                        var d = doc.data() || {};
                        if (!d.media || !d.media.length) { _skippedNoMedia++; return; }
                        list.push(d);
                    });
                    list = _sortReelsDesc(list); /* same createdAt-desc sort, reused as-is */
                    _quoteMemeCache[userId] = { ts: Date.now(), cards: list };
                    /* DIAGNOSTIC — see app-feed.js's matching dashboard-strip fetch
                       for the full explanation. Safe to leave in permanently. */
                    console.log('[EmpProfile] owner quote/meme fetch: ' + snap.size + ' isQuoteCard doc(s) total, ' + _skippedNoMedia + ' skipped (no media), ' + list.length + ' usable.');
                    cb(list);
                })
                .catch(function (err) {
                    console.warn('[EmpProfile] owner quote/meme card fetch failed:', err && err.message);
                    cb([]);
                });
        } else {
            cb([]);
        }
    }

    /* REVERTED (this session — "you don't understand English... make the
       quote and meme card thumbnail scrollable horizontally at the middle
       ... it continues to disappear"): went back to a lean, self-
       contained thumbnail (avatar+image only) instead of the full
       createNewPostElement()-built post card from the previous pass — see
       app-feed.js's matching dashboard-strip fix for the full reasoning.
       Tapping a card opens the real post — see the wrapper click handler
       in _mountQuoteMemeStripInto below (this thumbnail has no action
       buttons of its own, unlike the full-card version it replaces). */
    function _buildThumbCardEl(post, userId) {
        var avatarFallback = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(post.username || 'U') + '&background=1B2B8B&color=fff&size=80';
        var img = (post.media && post.media[0]) || '';
        var el = document.createElement('div');
        el.className = 'emp-profile-feed-quotecard-card';
        el.dataset.postId = post.id || '';
        el.dataset.userId = post.userId || userId || '';
        el.innerHTML =
            '<img src="' + _attr(img) + '" loading="lazy" alt="" onerror="this.style.display=\'none\';">'
            + '<div class="emp-pfrc-avatar"><img src="' + _attr(post.avatar || avatarFallback) + '" '
            + 'onerror="this.onerror=null;this.src=\'' + avatarFallback + '\';"></div>';
        return el;
    }

    /* Re-run whenever a post is added/removed elsewhere, same "keep the
       strip roughly mid-feed" technique as _repositionReelStrip above,
       parameterised the same way. */
    function _repositionQuoteMemeStrip(feedId, stripId) {
        var feed  = document.getElementById(feedId);
        var strip = document.getElementById(stripId);
        if (!feed || !strip) return;
        var entry = _quoteMemeStrips[feedId] || (_quoteMemeStrips[feedId] = {});
        /* FIX (this session — "cards vanish and reappear... enlargement/
           shrink cycles"): relocating a scrollable strip's DOM node while a
           touch-scroll gesture is active on a descendant of it is enough
           for a mobile browser to cancel that gesture outright (the touch
           stays down, but the hit-tested element got moved out from under
           it) — and this ran on EVERY childList mutation of the feed,
           forever, with no awareness of an in-progress swipe. Skip the move
           while the wrapper reports itself mid-interaction (same
           _empUserInteracting flag the auto-slide below already respects),
           and stop moving the strip at all once things have settled (8s or
           6 calls after mount) — same two-part fix already proven out on
           app-feed.js's dashboard strip. */
        var wrapper = strip.querySelector('.horizontal-slider-wrapper');
        if (wrapper && wrapper._empUserInteracting) return;
        var settleElapsed = Date.now() - (entry.mountedAt || 0);
        var settled = settleElapsed > 8000 || (entry.repositionCount || 0) >= 6;
        if (settled && strip.parentNode === feed) return;
        entry.repositionCount = (entry.repositionCount || 0) + 1;
        var siblings = Array.prototype.filter.call(feed.children, function (c) { return c !== strip; });
        if (!siblings.length) {
            if (strip.parentNode !== feed) feed.appendChild(strip);
            return;
        }
        var anchor = siblings[Math.floor(siblings.length / 2)];
        if (strip.nextSibling !== anchor) feed.insertBefore(strip, anchor);
    }

    function _startQuoteMemeStripAutoSlide(feedId, wrapper) {
        var entry = _quoteMemeStrips[feedId] || (_quoteMemeStrips[feedId] = {});
        if (entry.interval) clearInterval(entry.interval);
        entry.interval = setInterval(function () {
            if (!document.body.contains(wrapper)) { clearInterval(entry.interval); entry.interval = null; return; }
            if (wrapper._empUserInteracting) return;
            if (wrapper.offsetParent === null) return;
            if (!wrapper.children.length) return;
            var cardW = wrapper.firstElementChild.getBoundingClientRect().width + 12;
            var atEnd = wrapper.scrollLeft + wrapper.clientWidth >= wrapper.scrollWidth - 4;
            wrapper.scrollTo({ left: atEnd ? 0 : (wrapper.scrollLeft + cardW), behavior: 'smooth' });
        }, 4000); /* slightly offset from the reel strip's 3500ms so the two don't visually tick in lockstep when both are on screen */
    }

    function _mountQuoteMemeStripInto(feedId, stripId, wrapperId, userId, cards) {
        var feed = document.getElementById(feedId);
        if (!feed) return;

        var entry = _quoteMemeStrips[feedId] || (_quoteMemeStrips[feedId] = {});
        entry.mountedAt        = Date.now();
        entry.repositionCount = 0;

        var strip = document.createElement('div');
        strip.id        = stripId;
        strip.className = 'card emp-profile-reel-strip-card emp-profile-quotecard-strip-card';
        strip.style.cssText = 'margin:4px 0 14px;border-radius:16px;overflow:hidden;';
        /* FIX (2026-09-15 — "reverse the quote and meme card to the
           original vertical positioning instead of the horizontal
           scrollable position that failed to work"): same revert as
           app-feed.js's dashboard strip (see that file's matching
           comment) — inline !important overrides scoped to just this
           strip's own wrapper, since .horizontal-slider-container/
           .horizontal-slider-wrapper are shared with other strips
           elsewhere and style.css itself is never edited directly in
           this app. Each .emp-profile-feed-quotecard-card thumbnail
           below gets the matching per-card override once appended. */
        strip.innerHTML =
            '<div class="emp-pfrs-header">'
            + '<i class="fas fa-quote-right" style="color:#5B0EA6;"></i>'
            + '<strong style="font-size:0.9rem;">Quotes &amp; Memes</strong>'
            + '</div>'
            + '<div class="horizontal-slider-container" style="overflow:visible !important;padding-bottom:0 !important;">'
            + '<div class="horizontal-slider-wrapper" id="' + wrapperId + '" style="display:block !important;overflow-x:visible !important;overflow-y:visible !important;scroll-snap-type:none !important;cursor:default !important;gap:0 !important;padding:8px 16px 4px !important;"></div>'
            + '</div>';

        feed.appendChild(strip);

        /* Each slide is a self-contained .emp-profile-feed-quotecard-card
           thumbnail (see _buildThumbCardEl above) built straight from the
           Firestore post doc. Its own CSS (.emp-profile-feed-quotecard-card
           in style.css) is a fixed 128x172px horizontal-strip tile —
           flex:0 0 auto, width:128px. Widened to full-width/auto-height
           here so it reads as a normal stacked card instead of a cropped
           square once the strip itself is vertical; the avatar-overlay
           and image styling inside it are untouched. */
        var wrapper = document.getElementById(wrapperId);
        if (wrapper) {
            cards.forEach(function (post) {
                try {
                    var _qmThumbEl = _buildThumbCardEl(post, userId);
                    _qmThumbEl.style.cssText += ';flex:none !important;width:100% !important;height:auto !important;min-height:172px !important;margin:0 0 12px !important;';
                    wrapper.appendChild(_qmThumbEl);
                }
                catch (e) { console.warn('[EmpProfile] quote/meme thumbnail build failed for post ' + (post && post.id) + ':', e && e.message); }
            });
        }

        _repositionQuoteMemeStrip(feedId, stripId);

        if (wrapper) {
            /* FIX (this session — same root cause as app-feed.js's dashboard
               quote/meme strip, see that file's matching fix/comment):
               app-fixes.js's generic initSliderDragScroll() catch-all was
               also attaching to this wrapper and fighting its own dedicated
               swipe/auto-slide handling below. Marking it here tells that
               generic handler (see its own updated attachDragScroll/
               startAutoSwipe) to leave it alone. */
            wrapper._empOwnSwipeHandling = true;
            ['touchstart', 'pointerdown', 'mousedown'].forEach(function (evt) {
                wrapper.addEventListener(evt, function () { wrapper._empUserInteracting = true; }, { passive: true });
            });
            ['touchend', 'pointerup', 'mouseup'].forEach(function (evt) {
                wrapper.addEventListener(evt, function () {
                    setTimeout(function () { wrapper._empUserInteracting = false; }, 2500);
                }, { passive: true });
            });
            /* Tapping a thumbnail opens the real post. */
            wrapper.addEventListener('click', function (e) {
                var card = e.target.closest('.emp-profile-feed-quotecard-card');
                if (!card) return;
                var postId = card.dataset.postId;
                if (postId && typeof window.openPostById === 'function') window.openPostById(postId);
            });
            /* FIX (2026-09-15 — vertical revert, see the strip-build
               comment above): _startQuoteMemeStripAutoSlide() calls
               wrapper.scrollTo({left: ...}) on a timer — meaningless now
               that the wrapper no longer scrolls horizontally, so it's
               skipped rather than left running a pointless interval. */
        }

        entry.observer = new MutationObserver(function () {
            clearTimeout(feed._pfqmsRepositionTimer);
            feed._pfqmsRepositionTimer = setTimeout(function () { _repositionQuoteMemeStrip(feedId, stripId); }, 200);
        });
        entry.observer.observe(feed, { childList: true });
    }

    var _quoteMemeStripMountToken     = 0;
    var _quoteMemeStripLastSignature = null;
    function _mountProfileFeedQuoteMemeStrip(userId) {
        /* REVERTED (this session — "revert it back to the vertical
           positioning that was working perfectly before"): the horizontal
           quote/meme strip never rendered reliably and duplicated content
           now that app-feed.js's main posts listener no longer skips
           isQuoteCard posts — those posts render as ordinary vertical
           cards (mirrored into profile-dash-feed/profile-posts-feed the
           same way every other own post is) instead. Disarmed here rather
           than deleted; flip this return off to bring the strip back. */
        return;

        var _myMountToken = ++_quoteMemeStripMountToken;
        _quoteMemeStripLastUserId = userId; // see the empyrean:firebase-ready retry below

        var targets = [
            { feedId: 'profile-posts-feed', stripId: 'profile-feed-quotecard-strip',      wrapperId: 'profile-feed-quotecard-strip-wrapper' },
            { feedId: 'profile-dash-feed',  stripId: 'profile-dash-feed-quotecard-strip', wrapperId: 'profile-dash-feed-quotecard-strip-wrapper' }
        ].filter(function (t) { return !!document.getElementById(t.feedId); });
        if (!targets.length) return;

        _fetchOwnerQuoteMemeCards(userId, function (cards) {
            if (_myMountToken !== _quoteMemeStripMountToken) return;
            if (!cards.length) return;
            /* FIX (this session — "cards vanish and reappear"): the strip
               used to be torn out of the DOM the instant this function was
               called, THEN rebuilt once this fetch resolved — so any
               re-trigger of an already-successful strip (e.g. the
               empyrean:firebase-ready retry below landing after the strip
               is already up) produced a visible remove-then-re-add flash
               even though nothing had actually changed. Skip the
               teardown/rebuild entirely when every target strip is already
               mounted showing this exact same set of cards. */
            var sig = userId + '|' + cards.map(function (p) { return p.id; }).join(',');
            var allMounted = targets.every(function (t) { return !!document.getElementById(t.stripId); });
            if (allMounted && _quoteMemeStripLastSignature === sig) return;
            _quoteMemeStripLastSignature = sig;

            Object.keys(_quoteMemeStrips).forEach(function (feedId) {
                var entry = _quoteMemeStrips[feedId];
                if (entry.interval) clearInterval(entry.interval);
                if (entry.observer) entry.observer.disconnect();
            });
            _quoteMemeStrips = {};

            targets.forEach(function (t) {
                document.querySelectorAll('#' + t.stripId).forEach(function (el) { el.remove(); });
                if (!document.getElementById(t.feedId)) return;
                _mountQuoteMemeStripInto(t.feedId, t.stripId, t.wrapperId, userId, cards);
            });
        });
    }
    window._mountProfileFeedQuoteMemeStrip = _mountProfileFeedQuoteMemeStrip;

    /* FIX (this session — strip never appears on the profile page,
       console-confirmed `document.getElementById(stripId)` is `false`):
       renderUserProfile() calls _mountProfileFeedQuoteMemeStrip() exactly
       once, 560ms after building the profile DOM — see that call site's
       own comment. _fetchOwnerQuoteMemeCards() bails with `cb([])` the
       instant `window.fbDb && window._firebaseLoaded` isn't true yet (no
       DOM fallback exists for this strip, unlike the reel strip's
       _domFallbackReels just above), and on a slow connection (this
       session's own screenshots: 4G bouncing 3.5-3.9 M/s) 560ms after
       first render can easily still land before Firebase has finished its
       own async /api/config fetch + initializeApp(). Since nothing else
       ever re-calls the mount function afterwards, that single miss was
       permanent for the rest of that profile visit. Retrying on
       `empyrean:firebase-ready` (dispatched by firebase-init.js's
       `_initFirebase()` the instant it actually succeeds — same event
       app-fixes.js's syncLiveStreamsFromFirestore already retries on for
       the identical reason) closes that gap without touching the working
       CSS/swipe-handling fixes already in place for this strip. Guarded
       on _quoteMemeStripLastUserId so this is a no-op until a profile has
       actually been rendered at least once. */
    window.addEventListener('empyrean:firebase-ready', function () {
        if (!_quoteMemeStripLastUserId) return;
        setTimeout(function () { _mountProfileFeedQuoteMemeStrip(_quoteMemeStripLastUserId); }, 500);
    });

    document.addEventListener('empyrean-section-change', function (ev) {
        if (ev && ev.detail && ev.detail.section !== 'profile') {
            document.body.classList.remove('viewing-other-profile');
        }
    });

    console.log('[EmpProfile] ✅ Profile system ready.');

})();