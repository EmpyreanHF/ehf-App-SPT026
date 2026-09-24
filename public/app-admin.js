// =====================================================
        // FIREBASE — use globals set by head initialization
        // =====================================================
        // Re-attempt init in case SDK loaded after head script ran
        if (!window._firebaseLoaded && typeof firebase !== 'undefined') {
            window._initFirebase();
        }
        // Local aliases that always point to working implementations
        /* FIX: was `let fbAuth/fbDb/fbStorage` -- top-level let/const in a
           classic <script> tag binds to the page's shared global lexical
           scope. app-dom.js (loaded earlier) already declares `let fbAuth`,
           `let fbDb`, `let fbStorage` the same way, so this second
           declaration threw "SyntaxError: Identifier 'fbAuth' has already
           been declared" -- a parse-time error that killed this entire
           1630-line file, every load, for every user. `var` rebinds the
           existing global instead of fighting over it, so the rest of this
           file's `fbDb.collection(...)` calls keep working unchanged. */
        var fbAuth    = window.fbAuth;
        var fbDb      = window.fbDb;
        var fbStorage = window.fbStorage;

        // FIX (2026-08-08 — Advert/Announcement Edit+Delete silently not
        // working): the three lines above are a ONE-TIME snapshot, taken
        // the instant this script tag is parsed — which, per index.html's
        // own load sequence, happens well before `_initFirebase()` can
        // possibly have finished (that depends on an async /api/config
        // fetch + 5 external SDK <script> tags, all still in flight at
        // this point on anything but the fastest connection). So `fbDb`
        // here is captured as the pre-Firebase LOCAL STUB (index.html's
        // `_col()` mock) — a real, truthy object whose .update()/.delete()
        // calls always resolve SUCCESSFULLY without ever touching
        // Firestore, rather than rejecting. That's the exact shape of "Edit
        // shows a success toast but the change doesn't stick" and "Delete
        // does nothing, no error" — this file's own `if (!fbDb) return`
        // guards (e.g. _submitAdvert()) never catch it, because the stub
        // is never falsy, just fake.
        //
        // Same bug class app-patch-v26.js already had to fix for
        // window.fbAuth specifically ("re-arm" on firebase-ready, since
        // window.fbDb/fbAuth/fbStorage get reassigned WHOLESALE once
        // real Firebase loads — see index.html's _initFirebase()). That
        // fix never covered this file. Re-sync all three local aliases
        // the moment real Firebase actually comes up, so every feature in
        // this ~2300-line file that reads the bare `fbDb`/`fbAuth`/
        // `fbStorage` identifiers (not just adverts) starts using the real
        // instances instead of being stuck on the stub for the rest of
        // the session.
        function _reSyncFirebaseAliases() {
            fbAuth    = window.fbAuth;
            fbDb      = window.fbDb;
            fbStorage = window.fbStorage;
        }
        window.addEventListener('empyrean:firebase-ready', function () { setTimeout(_reSyncFirebaseAliases, 50); });
        // Belt-and-suspenders in case this script finishes parsing AFTER
        // _initFirebase() already completed (fast connection) — the event
        // above would already have fired and been missed.
        setTimeout(_reSyncFirebaseAliases, 800);
        setTimeout(_reSyncFirebaseAliases, 2500);


        function _serverTimestamp() {
            try {
                if (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue)
                    return firebase.firestore.FieldValue.serverTimestamp();
            } catch(e) {}
            return new Date();
        }

        // =====================================================
        // MEDIA UPLOAD — app-dom.js defines window.uploadToCloudinary,
        // already backed by Firebase Storage (name kept for the 80+ call
        // sites across other files — see app-dom.js's own comment).
        // app-admin.js MUST NOT overwrite it when app-dom.js already has.
        //
        // Safety net only: define it here if app-dom.js failed to load.
        //
        // FIX (dev note — "we are currently using firebase backend
        // storage and not cloudinary"): this fallback used to post
        // straight to Cloudinary's REST API (api.cloudinary.com) — a
        // real, live Cloudinary upload, not just a stale name. That was
        // the one remaining genuine Cloudinary call left in this app;
        // everywhere else (app-dom.js's own uploadToCloudinary) already
        // went through Firebase Storage. Now mirrors app-dom.js's own
        // Storage-based implementation (same fbStorage.ref().put(),
        // same uploads/<owner>/<file> path convention) so this safety
        // net never reaches Cloudinary either, even if it's the one that
        // ends up running.
        // =====================================================
        if (typeof window.uploadToCloudinary !== 'function') {
            window.uploadToCloudinary = async function uploadToCloudinary(file, onProgress) {
                if (!file || !(file instanceof File) && !(file instanceof Blob)) {
                    if (typeof file === 'string') return file;
                    return Promise.reject(new Error('uploadToCloudinary: expected a File or Blob'));
                }
                if (!fbStorage || typeof fbStorage.ref !== 'function') {
                    return Promise.reject(new Error('Firebase Storage is not available yet — please try again in a moment.'));
                }
                var _ownerSeg = (fbAuth && fbAuth.currentUser && fbAuth.currentUser.uid) || 'anon';
                var _safeName = String((file && file.name) || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
                var path = 'uploads/' + _ownerSeg + '/' + Date.now() + '_' +
                    Math.random().toString(36).slice(2, 8) + '_' + _safeName;
                var fileRef = fbStorage.ref().child(path);
                return new Promise((resolve, reject) => {
                    const tid = setTimeout(() => { try { task.cancel(); } catch(e) {} reject(new Error('Upload timed out after 90 s')); }, 90000);
                    const task = fileRef.put(file, { contentType: file.type || 'application/octet-stream' });
                    task.on('state_changed',
                        (snap) => {
                            if (onProgress && snap.totalBytes) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
                        },
                        (err) => {
                            clearTimeout(tid);
                            console.error('[Storage] ❌ Upload failed (admin fallback):', err && err.message);
                            reject(err);
                        },
                        () => {
                            clearTimeout(tid);
                            task.snapshot.ref.getDownloadURL().then((url) => {
                                window._firebaseStorageUploads = (window._firebaseStorageUploads||0)+1;
                                resolve(url);
                            }).catch(reject);
                        }
                    );
                });
            };
            console.warn('[Empyrean] uploadToCloudinary safety-net activated — app-dom.js may not have run.');
        }

        // FIX (bug report: "the posting tab on the profile page is no longer
        // functional" — traced to actual post SUBMISSION failing, not the tab
        // switcher): this definition ran UNCONDITIONALLY, with no guard, unlike
        // its own sibling `uploadToCloudinary` seven lines above (which is
        // correctly wrapped in `if (typeof window.uploadToCloudinary !== 'function')`)
        // and unlike app-helper.js's own polyfill of this exact same function
        // (`if (typeof window.uploadMediaFilesToCloudinary !== 'function')`).
        // Since index.html loads app-admin.js LAST among the four files that
        // each define window.uploadMediaFilesToCloudinary (app-dom.js,
        // app-helper.js, app-fixes.js, then app-admin.js), this version always
        // won and silently replaced the canonical app-dom.js implementation on
        // every single page load, everywhere in the app — not just admin
        // screens.
        //
        // It also dropped the try/catch app-dom.js's version wraps around each
        // individual upload (see that file's own comment: "return ''; // return
        // empty string so the rest of the post can still proceed"). Without
        // that, `await window.uploadToCloudinary(file, ...)` rejecting for ANY
        // ONE file in a multi-file batch — a network blip, a Storage timeout,
        // anything transient — threw inside this map's async callback, which
        // made the surrounding `Promise.all(uploads)` reject the WHOLE batch
        // immediately. Every caller of uploadMediaFilesToCloudinary (the
        // profile page's own "Share a Moment" composer among them —
        // app-profile.js awaits this call inside a try/catch that shows
        // "Post failed. Please try again." on any rejection) then failed the
        // entire post over a single flaky file, instead of posting the files
        // that DID succeed and just leaving the failed one out — exactly what
        // "no longer functional" looks like on anything but a perfect connection.
        //
        // Fixed the same way its own sibling above already is: guarded so this
        // never overwrites an already-working implementation, and given the
        // same per-file try/catch resilience as app-dom.js's canonical version,
        // so even on a page where this fallback IS the one that ends up
        // installed, one bad file can no longer take down an entire post.
        if (typeof window.uploadMediaFilesToCloudinary !== 'function') {
            async function uploadMediaFilesToCloudinary(files, onProgress) {
                if (!files || files.length === 0) return [];
                const uploads = Array.from(files).map(async (file, idx) => {
                    if (!(file instanceof File)) {
                        return file._cloudUrl || (typeof file === 'string' ? file : (file.url || ''));
                    }
                    if (file.size > 100 * 1024 * 1024) {
                        if (typeof showNotification === 'function') showNotification(`"${file.name}" is too large (max 100MB).`, 'error');
                        return '';
                    }
                    try {
                        // Always use window.uploadToCloudinary — guaranteed to be the
                        // app-dom.js version with correct preset and proper reject on failure.
                        const url = await window.uploadToCloudinary(file, (pct) => {
                            if (onProgress) onProgress(idx, pct);
                        });
                        file._cloudUrl = url;
                        return url;
                    } catch (err) {
                        console.error('[uploadMedia] \u274c Upload failed (admin fallback) for "' + (file.name || 'file') + '":', err && err.message);
                        if (typeof showNotification === 'function') showNotification('Upload failed for "' + (file.name || 'file') + '": ' + (err && err.message || 'unknown error'), 'error');
                        return ''; // let the rest of the post/batch still proceed
                    }
                });
                return Promise.all(uploads);
            }
            window.uploadMediaFilesToCloudinary = uploadMediaFilesToCloudinary;
            console.warn('[Empyrean] uploadMediaFilesToCloudinary safety-net activated — app-dom.js may not have run.');
        }

        // =====================================================
        // FLUTTERWAVE PAYMENT GATEWAY — keys from /api/config
        // FLW_SECRET_KEY and FLW_ENCRYPTION_KEY live on the
        // server only — never sent to the browser.
        // =====================================================
        const _adminFlw = window._appConfig && window._appConfig.flutterwave;
        const FLW_PUBLIC_KEY_ADMIN = (_adminFlw && _adminFlw.publicKey) || '';

        // SDK queue — ensures callers never hit "FlutterwaveCheckout is not defined"
        window._flwSDKLoaded  = (typeof FlutterwaveCheckout !== 'undefined');
        window._flwSDKLoading = false;
        window._flwSDKQueue   = [];

        window._ensureFlutterwaveSDK = function(callback) {
            if (typeof FlutterwaveCheckout !== 'undefined') {
                window._flwSDKLoaded = true;
                callback();
                return;
            }
            window._flwSDKQueue.push(callback);
            if (window._flwSDKLoading) return; // already loading, will drain queue on load
            window._flwSDKLoading = true;
            const s = document.createElement('script');
            s.src = 'https://checkout.flutterwave.com/v3.js';
            s.onload = function() {
                window._flwSDKLoaded = true;
                window._flwSDKLoading = false;
                console.info('[FLW] ✅ SDK loaded');
                window._flwSDKQueue.forEach(function(fn) { try { fn(); } catch(e) {} });
                window._flwSDKQueue = [];
            };
            s.onerror = function() {
                window._flwSDKLoading = false;
                window._flwSDKQueue = [];
                if (typeof window.showNotification === 'function')
                    window.showNotification('Payment gateway unavailable. Please check your connection.', 'error');
            };
            document.head.appendChild(s);
        };

        // Pre-load SDK at startup so first payment click is instant
        if (!window._flwSDKLoaded) {
            window._ensureFlutterwaveSDK(function() {
                console.info('[FLW] Payment gateway ready');
            });
        }

        function initiateFlutterwavePayment(opts) {
            if (!opts || !opts.amount || parseFloat(opts.amount) < 1) {
                console.error('[FLW] Invalid payment options — amount required');
                if (opts && opts.onFailure) opts.onFailure({ status: 'error', message: 'Invalid payment amount' });
                return;
            }
            const txRef = 'EMPY-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

            window._ensureFlutterwaveSDK(function() {
                try {
                    FlutterwaveCheckout({
                        public_key: FLW_PUBLIC_KEY_ADMIN,
                        tx_ref: txRef,
                        amount: parseFloat(opts.amount),
                        currency: opts.currency || 'NGN',
                        payment_options: 'card,ussd,banktransfer,mobilemoney,barter,nqr',
                        customer: {
                            email:        opts.email || (window.userState && window.userState.email) || 'user@empyrean.com',
                            phone_number: opts.phone || (window.userState && window.userState.phone) || '',
                            name:         opts.name  || (window.userState && window.userState.fullName) || 'Empyrean User'
                        },
                        customizations: {
                            title:       'Empyrean Humanitarian Platform',
                            description: opts.description || 'Payment',
                            logo:        'https://cdn-icons-png.flaticon.com/512/6001/6001527.png'
                        },
                        meta: {
                            source:   'empyrean_app',
                            purpose:  opts.purpose || 'general',
                            userId:   (window.userState && window.userState.id) || 'guest'
                        },
                        callback: function(response) {
                            if (response.status === 'successful' || response.status === 'completed') {
                                // Persist transaction to Firestore
                                try {
                                    if (window.fbDb && window._firebaseLoaded) {
                                        window.fbDb.collection('flw_transactions').doc(txRef).set({
                                            txRef,
                                            flwRef:   response.flw_ref || response.transaction_id || '',
                                            amount:   parseFloat(opts.amount),
                                            currency: opts.currency || 'NGN',
                                            purpose:  opts.purpose || 'general',
                                            status:   'successful',
                                            userId:   (window.userState && window.userState.id) || 'guest',
                                            userEmail: opts.email || (window.userState && window.userState.email) || '',
                                            createdAt: _serverTimestamp()
                                        }).catch(function(e) { console.error('[FLW] Firestore save error:', e.message); });
                                    }
                                } catch(e) {}
                                if (opts.onSuccess) opts.onSuccess(response, txRef);
                            } else {
                                if (opts.onFailure) opts.onFailure(response);
                            }
                        },
                        onclose: function() { if (opts.onClose) opts.onClose(); }
                    });
                } catch(flwErr) {
                    console.error('[FLW] FlutterwaveCheckout error:', flwErr.message);
                    if (opts.onFailure) opts.onFailure({ status: 'error', message: flwErr.message });
                }
            });
        }

        // Expose globally for use by all scripts
        window.initiateFlutterwavePayment = initiateFlutterwavePayment;
        window._flwPublicKey = FLW_PUBLIC_KEY_ADMIN;

        // Firebase user helpers
        //
        // FIX (2026-08-06 — cover/profile save STILL crashing with
        // "Unsupported field value: a custom Set object (found in field
        // downloadedPostIds...)" even after app-auth.js's saveUserToFirestore
        // was fixed to convert every Set field, including this one): this
        // file has no IIFE/module wrapper around it (see the top-of-file
        // comment about `var fbAuth/fbDb/fbStorage` existing precisely
        // because top-level `let` here collided with app-dom.js's global
        // scope) — so this `function saveUserToFirestore(...)` is likewise
        // a plain top-level declaration, which JS auto-exposes as
        // `window.saveUserToFirestore`. Since index.html loads this file
        // AFTER app-auth.js, that auto-exposure silently overwrote
        // app-auth.js's already-fixed `window.saveUserToFirestore` with
        // THIS copy every single page load — and this copy's Set-key list
        // was still missing 'downloadedPostIds' and 'quotedPostIds', so the
        // exact same crash kept happening no matter what app-auth.js did.
        // Added the two missing keys AND a generic catch-all sweep (mirrors
        // app-auth.js's own fix) so any Set field, known or future, is
        // converted here too — since this is the copy that actually wins.
        async function saveUserToFirestore(uid, userData) {
            // Ensure real Firebase is ready before saving
            if (!window._firebaseLoaded) {
                console.warn('[saveUser] Firebase not ready — queuing retry in 2s');
                return new Promise((resolve) => {
                    setTimeout(async () => { try { await saveUserToFirestore(uid, userData); } catch(e){} resolve(); }, 2000);
                });
            }
            // FIX (2026-08-06 — cover/profile save keeps permission-denying
            // even for a single-field write, right after the Storage upload
            // of the same photo succeeded): Storage's rule only requires
            // request.auth != null, but every Firestore rule on /users/{id}
            // requires request.auth.uid == id specifically. On a slow
            // connection the UI can show a fully "logged in" user (from the
            // cached profile app-auth.js restores immediately) before
            // Firebase Auth's own session restore has actually finished —
            // window.fbAuth.currentUser is still null (or a leftover
            // anonymous session with a DIFFERENT uid) at the moment this
            // runs, so request.auth.uid can never match uid and the write
            // is denied — regardless of payload size or content, which is
            // why trimming the write down further didn't help. Give the
            // real session a few seconds to finish restoring (mirrors the
            // grace-window pattern app-auth.js's own auth watcher already
            // uses) before attempting the write, instead of firing a write
            // that's guaranteed to fail.
            var _authUser = fbAuth && fbAuth.currentUser;
            var _waited = 0;
            while ((!_authUser || _authUser.isAnonymous || _authUser.uid !== uid) && _waited < 15000) {
                await new Promise(function(r) { setTimeout(r, 400); });
                _waited += 400;
                _authUser = fbAuth && fbAuth.currentUser;
            }
            // FIX (2026-09-15 — "updating user name doesn't work, shows
            // updated but reverts"): this used to `return false` here,
            // WITHOUT ever attempting the write, whenever auth still hadn't
            // caught up to `uid` after the 15s wait above — on a real but
            // slow connection (e.g. Firebase Auth session restore still not
            // finished loading its own SDK scripts) this silently and
            // PERMANENTLY dropped the edit: the caller only ever saw the
            // "updated locally, couldn't reach server" toast, nothing ever
            // reached Firestore, and the field reverted on next load/refresh
            // since that's still the only source of truth. The wait itself
            // is still worth keeping (it avoids a near-certain
            // permission-denied in the common fast case), but giving up
            // afterward instead of just trying is what actually lost the
            // edit. Now it always attempts the write once the wait ends —
            // a genuine permission-denied still throws and is handled by
            // the try/catch below exactly as before, so this doesn't bring
            // back the crash the wait was added to avoid; it only stops a
            // slow-but-legitimate save from being thrown away silently.
            if (!_authUser || _authUser.isAnonymous || _authUser.uid !== uid) {
                console.warn('[saveUser] No matching signed-in session for uid ' + uid +
                    ' after waiting — attempting the write anyway (Firestore\'s own rules will reject it if truly unauthorized). Current auth uid: ' +
                    (_authUser ? _authUser.uid + (_authUser.isAnonymous ? ' (anonymous)' : '') : 'none'));
            }
            const safe = { ...userData };
            ['likedPostIds','followedUserIds','retweetedPostIds','downloadedPostIds','quotedPostIds','awardedRanks','completedTasks','viewedStatusUserIds']
                .forEach(k => { if (safe[k] instanceof Set) safe[k] = [...safe[k]]; });
            // Belt-and-braces: convert ANY remaining Set instance, whether or
            // not its key name is in the list above.
            Object.keys(safe).forEach(k => { if (safe[k] instanceof Set) safe[k] = [...safe[k]]; });
            delete safe.password;
            safe.updatedAt = _serverTimestamp();
            try {
                await fbDb.collection('users').doc(uid).set(safe, { merge: true });
                console.log('[Firestore] ✅ User profile saved for uid:', uid);
                return true;
            } catch(err) {
                console.error('[Firestore] ❌ User save failed:', err.message);
                throw err;
            }
        }
        async function loadUserFromFirestore(uid) {
            const doc = await fbDb.collection('users').doc(uid).get();
            if (!doc.exists) return null;
            const data = doc.data();
            ['likedPostIds','followedUserIds','retweetedPostIds','awardedRanks','completedTasks','viewedStatusUserIds']
                .forEach(k => { data[k] = new Set(data[k] || []); });
            return data;
        }

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — TAB SWITCHING
        // Wires up all .admin-nav-tab buttons including the new Disbursements tab
        // ═══════════════════════════════════════════════════════════════════
        (function initAdminTabSwitching() {
            const adminSection = document.getElementById('admin');
            if (!adminSection) return;

            function switchAdminTab(targetId) {
                adminSection.querySelectorAll('.admin-nav-tab').forEach(function(b) {
                    const isActive = b.dataset.tab === targetId;
                    b.classList.toggle('active', isActive);
                    b.style.background = isActive ? 'var(--g-navy)' : 'transparent';
                    b.style.color      = isActive ? 'white' : 'var(--text-muted)';
                });
                adminSection.querySelectorAll('.admin-tab-content').forEach(function(panel) {
                    panel.style.display = panel.id === targetId ? 'block' : 'none';
                });
                if (targetId === 'admin-disburse-tab') {
                    _adminLoadNgoList();
                    _adminLoadRecentDisbursements();
                    /* Initialise panel visibility and method tabs on every tab open */
                    if (typeof window._adminDisbRecipChange === 'function') {
                        window._adminDisbRecipChange();
                    }
                    if (typeof window._selectDisbMethod === 'function') {
                        window._selectDisbMethod(window._currentDisbMethod || 'bank');
                    }
                }
                if (targetId === 'admin-media-migration-tab' && typeof window._adminResumeMediaMigrationPoll === 'function') {
                    // Re-attach to an in-progress job if the admin switched tabs
                    // and came back — the job keeps running server-side either way.
                    window._adminResumeMediaMigrationPoll();
                }
                if (targetId === 'admin-adverts-tab' && typeof window._adminLoadAdvertsList === 'function') {
                    window._adminLoadAdvertsList();
                }
                if (targetId === 'admin-branding-tab' && typeof window._adminRefreshBrandingPanel === 'function') {
                    window._adminRefreshBrandingPanel();
                }
                if (targetId === 'admin-election-tab' && typeof window._adminLoadElectionFlags === 'function') {
                    window._adminLoadElectionFlags();
                }
                if (targetId === 'admin-election-tab' && typeof window._adminLoadElectionResultsPanel === 'function') {
                    window._adminLoadElectionResultsPanel();
                }
            }

            adminSection.addEventListener('click', function(e) {
                const btn = e.target.closest('.admin-nav-tab');
                if (btn && btn.dataset.tab) switchAdminTab(btn.dataset.tab);
            });

            window._switchAdminTab = switchAdminTab;

            /* BUG FIX: Delegated change handler for disb-recip-type radios.
               Inline onchange may not fire if the function isn't yet defined
               at the moment the radio fires (script load ordering issue).
               This delegated listener is always live and overrides the inline. */
            document.addEventListener('change', function(e) {
                var t = e.target;
                if (t && t.name === 'disb-recip-type') {
                    if (typeof window._adminDisbRecipChange === 'function') {
                        window._adminDisbRecipChange();
                    }
                }
            });

            /* Also re-wire the Initiate Disbursement button via delegation
               so it works regardless of wrapper chain issues */
            document.addEventListener('click', function(e) {
                var btn = e.target.closest && e.target.closest(
                    'button[onclick*="_adminInitiateDisbursement"],' +
                    '#disb-initiate-btn'
                );
                if (btn && !btn._disbDelegated) {
                    btn._disbDelegated = true;
                    /* The onclick attribute still fires; delegation is a safety net */
                }
            });

            console.log('[Admin] ✅ Tab switching wired');
        })();

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — BRANDING (dashboard header logo)
        // Writes to app_config/branding.headerLogoDataUrl in Firestore. The
        // runtime side of this lives in app-nav.js: buildHeader() reads
        // window._empCurrentLogoSrc() (falls back to the shipped default
        // logo when no override is set), and a live onSnapshot listener
        // there keeps window._empBranding in sync and re-renders the header
        // the instant this doc changes — so every open tab/session across
        // every signed-in user picks up a new logo immediately, without a
        // reload, the moment an admin saves one here.
        // ═══════════════════════════════════════════════════════════════════
        (function initAdminBrandingPanel() {
            var MAX_DIM = 240;

            function _els() {
                return {
                    input:       document.getElementById('admin-branding-logo-input'),
                    currentImg:  document.getElementById('admin-branding-current-logo'),
                    previewImg:  document.getElementById('admin-branding-preview-logo'),
                    previewPlaceholder: document.getElementById('admin-branding-preview-placeholder'),
                    saveBtn:     document.getElementById('admin-branding-save-btn'),
                    resetBtn:    document.getElementById('admin-branding-reset-btn'),
                    feedback:    document.getElementById('admin-branding-feedback')
                };
            }

            function _feedback(msg, type) {
                var el = document.getElementById('admin-branding-feedback');
                if (!el) return;
                var color = type === 'error' ? 'var(--danger-color, #EF4444)' : type === 'success' ? 'var(--success-color, #10B981)' : 'var(--text-muted)';
                el.style.color = color;
                el.textContent = msg || '';
            }

            var _pendingDataUrl = null;

            function _resizeToSquareDataUrl(file, callback) {
                var reader = new FileReader();
                reader.onerror = function () { callback(null, 'Could not read that file.'); };
                reader.onload = function () {
                    var img = new Image();
                    img.onerror = function () { callback(null, 'That file isn\'t a readable image.'); };
                    img.onload = function () {
                        try {
                            var side = Math.min(img.naturalWidth, img.naturalHeight);
                            var sx = (img.naturalWidth  - side) / 2;
                            var sy = (img.naturalHeight - side) / 2;
                            var canvas = document.createElement('canvas');
                            canvas.width = MAX_DIM;
                            canvas.height = MAX_DIM;
                            var ctx = canvas.getContext('2d');
                            ctx.drawImage(img, sx, sy, side, side, 0, 0, MAX_DIM, MAX_DIM);
                            // PNG first (crisp on logos/text); if that comes out large
                            // (e.g. a busy photo), fall back to JPEG to keep the
                            // Firestore doc small — a header badge doesn't need
                            // lossless quality at 240x240.
                            var pngUrl = canvas.toDataURL('image/png');
                            if (pngUrl.length <= 260000) { callback(pngUrl, null); return; }
                            var jpgUrl = canvas.toDataURL('image/jpeg', 0.85);
                            callback(jpgUrl, null);
                        } catch (e) {
                            callback(null, 'Could not process that image.');
                        }
                    };
                    img.src = reader.result;
                };
                reader.readAsDataURL(file);
            }

            function _wireInput() {
                var els = _els();
                if (!els.input || els.input._brandingWired) return;
                els.input._brandingWired = true;
                els.input.addEventListener('change', function () {
                    var file = els.input.files && els.input.files[0];
                    if (!file) return;
                    if (!/^image\//.test(file.type)) {
                        _feedback('Please choose an image file.', 'error');
                        return;
                    }
                    _feedback('Processing…');
                    _resizeToSquareDataUrl(file, function (dataUrl, err) {
                        if (err) { _feedback(err, 'error'); return; }
                        _pendingDataUrl = dataUrl;
                        var e = _els();
                        if (e.previewImg) { e.previewImg.src = dataUrl; e.previewImg.style.display = ''; }
                        if (e.previewPlaceholder) e.previewPlaceholder.style.display = 'none';
                        if (e.saveBtn) e.saveBtn.disabled = false;
                        _feedback('Ready — click Save Logo to publish this everywhere.');
                    });
                });
            }

            function _wireSave() {
                var els = _els();
                if (!els.saveBtn || els.saveBtn._brandingWired) return;
                els.saveBtn._brandingWired = true;
                els.saveBtn.addEventListener('click', function () {
                    if (!_pendingDataUrl) return;
                    if (!window.fbDb || typeof window.fbDb.collection !== 'function') {
                        _feedback('Not connected — try again in a moment.', 'error');
                        return;
                    }
                    els.saveBtn.disabled = true;
                    _feedback('Saving…');
                    var uid = (window.fbAuth && window.fbAuth.currentUser && window.fbAuth.currentUser.uid) || null;
                    window.fbDb.collection('app_config').doc('branding').set({
                        headerLogoDataUrl: _pendingDataUrl,
                        updatedAt: window.fbDb.FieldValue ? window.fbDb.FieldValue.serverTimestamp() : new Date(),
                        updatedBy: uid
                    }, { merge: true }).then(function () {
                        _feedback('Saved — the new logo is now live for everyone.', 'success');
                        if (typeof window.showNotification === 'function') {
                            window.showNotification('Dashboard header logo updated', 'success');
                        }
                        _pendingDataUrl = null;
                        var e = _els();
                        if (e.saveBtn) e.saveBtn.disabled = true;
                        if (e.input) e.input.value = '';
                        // window._empBranding / the CURRENT preview will refresh on
                        // their own via app-nav.js's live onSnapshot listener — no
                        // need to touch them here.
                    }).catch(function (err) {
                        _feedback('Could not save: ' + (err && err.message ? err.message : err), 'error');
                        if (els.saveBtn) els.saveBtn.disabled = false;
                    });
                });
            }

            function _wireReset() {
                var els = _els();
                if (!els.resetBtn || els.resetBtn._brandingWired) return;
                els.resetBtn._brandingWired = true;
                els.resetBtn.addEventListener('click', function () {
                    if (els.resetBtn._confirming) {
                        if (!window.fbDb || typeof window.fbDb.collection !== 'function') return;
                        _feedback('Resetting…');
                        window.fbDb.collection('app_config').doc('branding').set({
                            headerLogoDataUrl: null,
                            updatedAt: window.fbDb.FieldValue ? window.fbDb.FieldValue.serverTimestamp() : new Date()
                        }, { merge: true }).then(function () {
                            _feedback('Reset — back to the default logo for everyone.', 'success');
                            _pendingDataUrl = null;
                            var e = _els();
                            if (e.saveBtn) e.saveBtn.disabled = true;
                            if (e.previewImg) e.previewImg.style.display = 'none';
                            if (e.previewPlaceholder) e.previewPlaceholder.style.display = '';
                            if (e.input) e.input.value = '';
                        }).catch(function (err) {
                            _feedback('Could not reset: ' + (err && err.message ? err.message : err), 'error');
                        });
                        els.resetBtn._confirming = false;
                        els.resetBtn.innerHTML = '<i class="fas fa-rotate-left"></i> Reset to Default';
                        return;
                    }
                    els.resetBtn._confirming = true;
                    els.resetBtn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Click again to confirm';
                    setTimeout(function () {
                        if (!els.resetBtn) return;
                        els.resetBtn._confirming = false;
                        els.resetBtn.innerHTML = '<i class="fas fa-rotate-left"></i> Reset to Default';
                    }, 4000);
                });
            }

            function refreshBrandingPanel() {
                _wireInput();
                _wireSave();
                _wireReset();
                var els = _els();
                var current = typeof window._empCurrentLogoSrc === 'function' ? window._empCurrentLogoSrc() : '';
                if (els.currentImg && current) els.currentImg.src = current;
            }

            window._adminRefreshBrandingPanel = refreshBrandingPanel;
        })();

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — ELECTION RESULTS (AUTO-TALLIED FROM POLLING UNITS)
        //
        // REWORKED (2026-09-24): admins no longer type results in. People at
        // polling units upload their own result (tally + photo of the sheet)
        // from the Election Hub; app-patch-v49-v50.js's submitPuResult()
        // writes election_pu_results/{unit} AND bumps the running totals in
        // election_results/current in the SAME transaction, so the public
        // Dashboard (app-news.js) updates the moment a result lands.
        //
        // What an admin does here:
        //   • watch the live tally (read-only),
        //   • review submissions (photo next to the typed numbers) and
        //     DECLINE any that don't tally — declining deletes the result,
        //     subtracts its numbers from the running totals in the same
        //     transaction, and frees that polling unit for a corrected upload,
        //   • APPROVE a flagged result once they've checked the photo.
        // Everything goes straight to Firestore (rules: isAdmin()) — no
        // server.js routes involved, so it works wherever the app is hosted.
        // "Recalculate totals" rebuilds election_results/current from the
        // submissions themselves (repair tool, and clears any old hand-typed
        // figures left in that doc).
        // ═══════════════════════════════════════════════════════════════════
        (function initElectionReviewPanel() {
            var CANDIDATES = [
                { id: 'tinubu', name: 'Bola Ahmed Tinubu', party: 'APC', color: '#00853F' },
                { id: 'atiku',  name: 'Atiku Abubakar',     party: 'ADC', color: '#1E7A3D' },
                { id: 'obi',    name: 'Peter Obi',          party: 'NDC', color: '#1B2260' },
                { id: 'sowore', name: 'Omoyele Sowore',     party: 'AAC', color: '#5C4033' }
            ];
            var _rows = [];
            var _filter = 'all';

            function _esc(s) {
                return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
                });
            }
            function _toast(msg, type) {
                if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info');
            }
            function _feedback(msg, type) {
                var el = document.getElementById('admin-election-feedback');
                if (!el) return;
                el.style.color = type === 'error' ? '#e53935' : (type === 'success' ? '#22c55e' : 'var(--text-muted)');
                el.textContent = msg;
            }
            function _adminEmail() { return (fbAuth && fbAuth.currentUser && fbAuth.currentUser.email) || null; }
            function _FV() { return firebase.firestore.FieldValue; }

            /* ── live tally (read-only) ─────────────────────────────────── */
            function loadLiveTally() {
                var host = document.getElementById('admin-election-live');
                if (!host) return;
                if (!fbDb) { host.innerHTML = '<div style="color:#e53935;font-size:0.85rem;">Not connected to the database.</div>'; return; }
                host.innerHTML = '<div style="text-align:center;padding:14px 0;color:var(--text-muted);font-size:0.85rem;">Loading\u2026</div>';
                fbDb.collection('election_results').doc('current').get().then(function (doc) {
                    var d = doc.exists ? (doc.data() || {}) : {};
                    var cands = d.candidates || {};
                    var total = CANDIDATES.reduce(function (s, c) { return s + Number(cands[c.id] || 0); }, 0);
                    var units = Number(d.unitsReported || 0);
                    var su = d.stateUnits || {};
                    var states = Object.keys(su).filter(function (k) { return Number(su[k]) > 0; }).length;
                    var rows = CANDIDATES.map(function (c) {
                        var v = Number(cands[c.id] || 0);
                        var pct = total > 0 ? (v / total * 100) : 0;
                        return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;">' +
                            '<div style="flex:0 0 150px;font-size:0.82rem;font-weight:700;">' + _esc(c.name) + ' <span style="color:var(--text-muted);font-weight:500;">(' + _esc(c.party) + ')</span></div>' +
                            '<div style="flex:1;height:14px;border-radius:7px;background:rgba(10,14,39,0.06);overflow:hidden;"><div style="height:100%;width:' + pct.toFixed(1) + '%;background:' + c.color + ';"></div></div>' +
                            '<div style="flex:0 0 96px;text-align:right;font-size:0.8rem;font-weight:800;">' + v.toLocaleString() + ' <span style="color:var(--text-muted);font-weight:600;">(' + pct.toFixed(1) + '%)</span></div>' +
                            '</div>';
                    }).join('');
                    host.innerHTML =
                        '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px;">' +
                        '<strong>' + units.toLocaleString() + '</strong> polling unit' + (units === 1 ? '' : 's') + ' reported \u00B7 ' +
                        '<strong>' + states + '</strong> state' + (states === 1 ? '' : 's') + ' reporting \u00B7 ' +
                        '<strong>' + total.toLocaleString() + '</strong> total votes' +
                        (d.updatedAt ? (' \u00B7 updated ' + _esc(new Date(d.updatedAt).toLocaleString())) : '') +
                        '</div>' + rows;
                }).catch(function (err) {
                    host.innerHTML = '<div style="color:#e53935;font-size:0.85rem;">Could not load the tally: ' + _esc(err && err.message) + '</div>';
                });
            }

            /* Rebuild election_results/current from the submissions. */
            async function recalcTotals(btn) {
                if (!fbDb) return;
                if (!btn._confirming) {
                    btn._confirming = true;
                    btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Click again to confirm';
                    setTimeout(function () { btn._confirming = false; btn.innerHTML = '<i class="fas fa-rotate"></i> Recalculate totals'; }, 4000);
                    return;
                }
                btn._confirming = false;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Recalculating\u2026';
                _feedback('Reading all submissions\u2026', 'info');
                try {
                    var cands = {}; CANDIDATES.forEach(function (c) { cands[c.id] = 0; });
                    var stateUnits = {}; var units = 0; var last = null;
                    for (;;) {
                        var q = fbDb.collection('election_pu_results').orderBy(firebase.firestore.FieldPath.documentId()).limit(500);
                        if (last) q = q.startAfter(last);
                        var snap = await q.get();
                        if (snap.empty) break;
                        snap.forEach(function (doc) {
                            var d = doc.data() || {}; var t = d.tally || {};
                            units++;
                            CANDIDATES.forEach(function (c) { cands[c.id] += Number(t[c.id] || 0); });
                            if (d.state) stateUnits[d.state] = (stateUnits[d.state] || 0) + 1;
                        });
                        last = snap.docs[snap.docs.length - 1];
                        if (snap.size < 500) break;
                    }
                    await fbDb.collection('election_results').doc('current').set({
                        candidates: cands, unitsReported: units, stateUnits: stateUnits,
                        updatedAt: new Date().toISOString(), recalculatedBy: _adminEmail()
                    });
                    _feedback('Totals rebuilt from ' + units.toLocaleString() + ' submission' + (units === 1 ? '' : 's') + '.', 'success');
                    loadLiveTally();
                } catch (err) {
                    _feedback('Recalculate failed: ' + (err && err.message ? err.message : 'try again.'), 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-rotate"></i> Recalculate totals';
                }
            }

            /* ── submissions review ─────────────────────────────────────── */
            function _tallyHtml(t) {
                t = t || {};
                return CANDIDATES.map(function (c) {
                    return '<span style="display:inline-block;margin:0 10px 4px 0;font-size:0.78rem;"><span style="color:' + c.color + ';font-weight:800;">' + _esc(c.party) + '</span> ' + Number(t[c.id] || 0).toLocaleString() + '</span>';
                }).join('');
            }

            function _render() {
                var host = document.getElementById('admin-election-flags-list');
                if (!host) return;
                var rows = _filter === 'flagged' ? _rows.filter(function (r) { return r.flagged; }) : _rows;
                if (!rows.length) {
                    host.innerHTML = '<div style="text-align:center;padding:18px 0;color:var(--text-muted);font-size:0.85rem;">' +
                        (_filter === 'flagged' ? 'No flagged results right now.' : 'No polling unit results uploaded yet.') + '</div>';
                    return;
                }
                host.innerHTML = rows.map(function (r) {
                    var when = r.createdAt ? new Date(r.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                    var photos = (r.images || []).slice(0, 4).map(function (u) {
                        return '<img src="' + _esc(u) + '" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="window.open(this.src,\'_blank\')">';
                    }).join('');
                    return '<div class="admin-ef-card" data-key="' + _esc(r.key) + '" style="border:1.5px solid ' + (r.flagged ? '#e53935' : 'rgba(10,14,39,0.12)') + ';border-radius:14px;padding:12px 14px;margin-bottom:10px;">' +
                        '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px;">' +
                        '<div><div style="font-weight:800;font-size:0.88rem;">' + _esc(r.pollingUnit || '') + '</div>' +
                        '<div style="font-size:0.74rem;color:var(--text-muted);">' + _esc(r.ward || '') + ', ' + _esc(r.lga || '') + ', ' + _esc(r.state || '') + '</div></div>' +
                        '<div style="font-size:0.74rem;color:var(--text-muted);text-align:right;white-space:nowrap;">' + _esc(r.uploaderName || '') + '<br>' + _esc(when) + '</div>' +
                        '</div>' +
                        '<div style="margin-bottom:8px;">' + _tallyHtml(r.tally) + '</div>' +
                        (r.flagged ? '<div style="font-size:0.78rem;color:#e53935;margin-bottom:8px;"><i class="fas fa-triangle-exclamation"></i> ' + _esc(r.flagReason || 'Typed tally didn\u2019t match the uploaded photo.') + '</div>' : '') +
                        (photos ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">' + photos + '</div>' : '') +
                        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        (r.flagged ? '<button type="button" class="btn admin-ef-dismiss-btn" style="padding:8px 14px;border-radius:10px;font-size:0.78rem;font-weight:700;"><i class="fas fa-check"></i> Approve</button>' : '') +
                        '<button type="button" class="btn admin-ef-remove-btn" style="padding:8px 14px;border-radius:10px;font-size:0.78rem;font-weight:700;background:#e53935;color:#fff;"><i class="fas fa-trash"></i> Decline</button>' +
                        '</div></div>';
                }).join('');

                host.querySelectorAll('.admin-ef-dismiss-btn').forEach(function (b) { b.addEventListener('click', function () { approve(b); }); });
                host.querySelectorAll('.admin-ef-remove-btn').forEach(function (b) { b.addEventListener('click', function () { decline(b); }); });
            }

            function _keyOf(btn) { var c = btn.closest('.admin-ef-card'); return c && c.dataset.key; }

            function approve(btn) {
                var key = _keyOf(btn); if (!key || !fbDb) return;
                btn.disabled = true;
                fbDb.collection('election_pu_results').doc(key).update({
                    flagged: false, reviewedAt: new Date().toISOString(), reviewedBy: _adminEmail()
                }).then(function () {
                    _rows.forEach(function (r) { if (r.key === key) r.flagged = false; });
                    _render(); _toast('Result approved', 'success');
                }).catch(function (err) {
                    btn.disabled = false; _toast('Could not approve: ' + (err && err.message), 'error');
                });
            }

            /* Decline = delete the result AND subtract it from the running
               totals, in one transaction, so the public numbers never drift. */
            function decline(btn) {
                if (!btn._confirming) {
                    btn._confirming = true;
                    btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Click again to decline';
                    setTimeout(function () { btn._confirming = false; btn.innerHTML = '<i class="fas fa-trash"></i> Decline'; }, 4000);
                    return;
                }
                var key = _keyOf(btn); if (!key || !fbDb) return;
                btn.disabled = true;
                var ref = fbDb.collection('election_pu_results').doc(key);
                var agg = fbDb.collection('election_results').doc('current');
                fbDb.runTransaction(function (tx) {
                    return tx.get(ref).then(function (doc) {
                        if (!doc.exists) return; // already gone
                        var d = doc.data() || {}; var t = d.tally || {};
                        var dec = {};
                        CANDIDATES.forEach(function (c) { dec[c.id] = _FV().increment(-Number(t[c.id] || 0)); });
                        var upd = { candidates: dec, unitsReported: _FV().increment(-1), updatedAt: new Date().toISOString() };
                        if (d.state) { var s = {}; s[d.state] = _FV().increment(-1); upd.stateUnits = s; }
                        tx.delete(ref);
                        tx.set(agg, upd, { merge: true });
                    });
                }).then(function () {
                    _rows = _rows.filter(function (r) { return r.key !== key; });
                    _render(); loadLiveTally(); _toast('Result declined and removed from the totals', 'success');
                }).catch(function (err) {
                    btn.disabled = false; btn._confirming = false; btn.innerHTML = '<i class="fas fa-trash"></i> Decline';
                    _toast('Could not decline: ' + (err && err.message), 'error');
                });
            }

            function loadSubmissions() {
                var host = document.getElementById('admin-election-flags-list');
                if (!host) return;
                if (!fbDb) { host.innerHTML = '<div style="color:#e53935;font-size:0.85rem;">Not connected to the database.</div>'; return; }
                host.innerHTML = '<div style="text-align:center;padding:18px 0;color:var(--text-muted);font-size:0.85rem;">Loading\u2026</div>';
                fbDb.collection('election_pu_results').orderBy('createdAt', 'desc').limit(60).get().then(function (snap) {
                    _rows = [];
                    snap.forEach(function (doc) { var d = doc.data() || {}; d.key = doc.id; _rows.push(d); });
                    _render();
                }).catch(function (err) {
                    host.innerHTML = '<div style="text-align:center;padding:18px 0;color:#e53935;font-size:0.85rem;">Could not load submissions: ' + _esc(err && err.message) + '</div>';
                });
            }

            /* ── wiring ─────────────────────────────────────────────────── */
            var refreshBtn = document.getElementById('admin-election-flags-refresh-btn');
            if (refreshBtn) refreshBtn.addEventListener('click', function () { loadSubmissions(); loadLiveTally(); });
            var recalcBtn = document.getElementById('admin-election-recalc-btn');
            if (recalcBtn) recalcBtn.addEventListener('click', function () { recalcTotals(recalcBtn); });
            document.querySelectorAll('.admin-election-filter').forEach(function (chip) {
                chip.addEventListener('click', function () {
                    _filter = chip.getAttribute('data-filter') || 'all';
                    document.querySelectorAll('.admin-election-filter').forEach(function (c) {
                        var on = c === chip;
                        c.style.background = on ? 'var(--primary, #1B2B8B)' : 'rgba(10,14,39,0.06)';
                        c.style.color = on ? '#fff' : '#374151';
                    });
                    _render();
                });
            });

            window._adminLoadElectionFlags = loadSubmissions;
            window._adminLoadElectionResultsPanel = loadLiveTally;
        })();

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — MEDIA MIGRATION (Cloudinary -> Firebase Storage)
        // Drives server.js's already-built /api/admin/media-migration/start
        // and /:id/status routes. Both routes require a Firebase ID token
        // from an admin account (see _requireAdminForMediaMigration in
        // server.js), so this reads fbAuth.currentUser.getIdToken() the same
        // way the client already authenticates against Firestore elsewhere
        // in this file — no new auth mechanism introduced.
        // ═══════════════════════════════════════════════════════════════════
        (function initMediaMigrationPanel() {
            var _mmPollTimer = null;
            var _mmCurrentJobId = null;

            function _mmEl(id) { return document.getElementById(id); }

            async function _mmAuthHeader() {
                if (!fbAuth || !fbAuth.currentUser) {
                    throw new Error('Not signed in as admin.');
                }
                var token = await fbAuth.currentUser.getIdToken();
                return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
            }

            function _mmRenderStatus(job) {
                var wrap = _mmEl('mm-progress-wrap');
                if (wrap) wrap.style.display = 'block';

                var total = job.urlsFound || 0;
                var done  = job.urlsProcessed || 0;
                var pct   = total > 0 ? Math.round((done / total) * 100) : (job.status === 'completed' ? 100 : 0);

                var label = _mmEl('mm-status-label');
                if (label) {
                    label.textContent = job.status === 'completed' ? (job.dryRun ? 'Dry run complete' : 'Migration complete')
                        : job.status === 'error' ? ('Job crashed: ' + (job.error || 'unknown error'))
                        : (job.dryRun ? 'Checking links…' : 'Migrating media…');
                }
                var countEl = _mmEl('mm-status-count');
                if (countEl) countEl.textContent = done + ' / ' + total;
                var bar = _mmEl('mm-progress-bar');
                if (bar) bar.style.width = pct + '%';

                if (_mmEl('mm-stat-docs'))     _mmEl('mm-stat-docs').textContent = job.docsWithMedia || 0;
                if (_mmEl('mm-stat-updated'))  _mmEl('mm-stat-updated').textContent = job.docsUpdated || 0;
                if (_mmEl('mm-stat-migrated')) _mmEl('mm-stat-migrated').textContent = job.urlsMigrated || 0;
                if (_mmEl('mm-stat-failed'))   _mmEl('mm-stat-failed').textContent = job.urlsFailed || 0;

                var failWrap = _mmEl('mm-failures-wrap');
                var failList = _mmEl('mm-failures-list');
                if (failWrap && failList) {
                    var items = (job.failures || []).concat(
                        (job.scanErrors || []).map(function(s) { return { url: s.target, error: s.error }; })
                    );
                    if (items.length) {
                        failWrap.style.display = 'block';
                        failList.innerHTML = items.map(function(f) {
                            var where = f.url || f.docPath || '—';
                            return '<div style="padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.05);word-break:break-all;">' +
                                '<strong>' + where.replace(/</g, '&lt;') + '</strong><br>' +
                                (f.error || '').replace(/</g, '&lt;') + '</div>';
                        }).join('');
                    } else {
                        failWrap.style.display = 'none';
                    }
                }

                var startBtn = _mmEl('mm-start-btn');
                if (startBtn) {
                    var running = job.status === 'running';
                    startBtn.disabled = running;
                    startBtn.style.opacity = running ? '0.6' : '1';
                    startBtn.innerHTML = running
                        ? '<i class="fas fa-spinner fa-spin"></i> ' + (job.dryRun ? 'Checking…' : 'Migrating…')
                        : '<i class="fas fa-play"></i> Start Migration';
                }
            }

            async function _mmPollOnce() {
                if (!_mmCurrentJobId) return;
                try {
                    var headers = await _mmAuthHeader();
                    var res = await fetch('/api/admin/media-migration/' + _mmCurrentJobId + '/status', { headers: headers });
                    var job = await res.json();
                    if (!res.ok) throw new Error(job.error || ('HTTP ' + res.status));
                    _mmRenderStatus(job);
                    if (job.status === 'completed' || job.status === 'error') {
                        clearInterval(_mmPollTimer);
                        _mmPollTimer = null;
                        if (typeof window.showNotification === 'function') {
                            window.showNotification(
                                job.status === 'completed'
                                    ? (job.dryRun
                                        ? 'Dry run finished — ' + job.urlsMigrated + ' link(s) OK, ' + job.urlsFailed + ' failed.'
                                        : 'Migration finished — ' + job.urlsMigrated + ' file(s) moved to Firebase Storage, ' + job.docsUpdated + ' doc(s) updated.')
                                    : 'Media migration job crashed — check server logs.',
                                job.status === 'completed' ? 'success' : 'error'
                            );
                        }
                    }
                } catch (err) {
                    console.error('[MediaMigration] poll failed:', err.message);
                }
            }

            window._adminStartMediaMigration = async function() {
                var dryRunEl = _mmEl('mm-dry-run');
                var dryRun = !dryRunEl || dryRunEl.checked;
                var startBtn = _mmEl('mm-start-btn');
                if (startBtn) startBtn.disabled = true;
                try {
                    var headers = await _mmAuthHeader();
                    var res = await fetch('/api/admin/media-migration/start', {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({ dryRun: dryRun })
                    });
                    var data = await res.json();
                    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
                    _mmCurrentJobId = data.jobId;
                    window._mmLastJobId = data.jobId; // survives tab switches within this session
                    if (_mmPollTimer) clearInterval(_mmPollTimer);
                    _mmPollTimer = setInterval(_mmPollOnce, 2000);
                    _mmPollOnce();
                } catch (err) {
                    if (startBtn) startBtn.disabled = false;
                    if (typeof window.showNotification === 'function') {
                        window.showNotification('Could not start migration: ' + err.message, 'error');
                    }
                    // ALWAYS also show a native alert for this button specifically:
                    // the toast above can be visually hidden behind the admin
                    // panel's own overlay (z-index), which is exactly why this
                    // error was happening silently -- alert() cannot be hidden
                    // by any CSS on the page, so this guarantees it's seen.
                    alert('Could not start migration: ' + err.message);
                }
            };

            // Called when the Media Migration tab is (re)opened — resumes
            // polling an already-running job instead of starting a new one.
            window._adminResumeMediaMigrationPoll = function() {
                if (window._mmLastJobId && !_mmPollTimer) {
                    _mmCurrentJobId = window._mmLastJobId;
                    _mmPollTimer = setInterval(_mmPollOnce, 2000);
                    _mmPollOnce();
                }
            };
        })();

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — SYSTEM RESET
        // Logic is now fully inline in index.html (inline <script> tag).
        // This stub exists only as a fallback safety net.
        // ═══════════════════════════════════════════════════════════════════
        window._adminMasterDelete = function() {
            var btn = document.getElementById('master-delete-btn');
            if (btn) { btn.click(); return; }
            console.warn('[Reset] Trigger button not found in DOM.');
        };

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — DISBURSEMENTS
        // Vault connect, NGO loading, fiat + crypto disbursement
        //
        // CRYPTO_HIDDEN_FOR_PLAY_STORE (verified, no code change needed here):
        // every UI entry point into the MetaMask/on-chain code below is
        // already hidden in index.html — the "Empy Distribution Vault"
        // (MetaMask connect) card is wrapped in a CRYPTO_HIDDEN_FOR_PLAY_STORE
        // comment block (never renders), and the "Initiate Disbursement" card
        // containing the fiat/crypto mode select, the USDT/BNB/BTC method
        // tabs, and the Send button is itself display:none (retired in favor
        // of the Grant Disbursement Control Panel in app-ngo.js, which is
        // fiat/EMPY-only — see that file's own CRYPTO_HIDDEN_FOR_PLAY_STORE
        // notes). window._adminConnectVault / window._adminInitiateDisbursement
        // / window._selectDisbMethod therefore cannot be reached from any
        // visible screen. Left in place, unreachable, rather than deleted —
        // restore the index.html markup when crypto disbursement is ready to
        // ship, and this code is ready to go with it.
        // ═══════════════════════════════════════════════════════════════════

        // Contract addresses (mirrors contractAddresses in app-fixes.js)
        const _DISBURSE = {
            registryAddr:  '0xc861e3ae9a35336c9735692d788065c4a0e37ebb',
            empyTokenAddr: '0x624ca3Db53adb41944EbF2BcB015f68C7BAB0c02',
            usdtAddr:      '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            provider:      null,
            signer:        null,
            walletAddr:    null,
            connected:     false
        };

        const _REGISTRY_ABI = [
            'function recordOffChainGrant(address _recipient, uint256 _amount, string _currency, string _projectId, string _transactionReference) external',
            'function recordOnChainGrant(address _recipient, address _tokenAddress, uint256 _amount, string _projectId) external',
            'function getVerifiedNgoCount() external view returns (uint256)'
        ];
        const _ERC20_ABI = [
            'function transfer(address to, uint256 amount) external returns (bool)',
            'function balanceOf(address account) external view returns (uint256)',
            'function decimals() external view returns (uint8)'
        ];

        // Helper: update vault status badge
        function _setVaultBadge(connected, label) {
            const badge = document.getElementById('vault-status-badge');
            if (!badge) return;
            badge.textContent   = connected ? '● CONNECTED' : ('● ' + (label || 'DISCONNECTED'));
            badge.style.background = connected ? 'rgba(0,137,123,0.1)' : 'rgba(239,68,68,0.1)';
            badge.style.color      = connected ? 'var(--success-color, #22c55e)' : 'var(--danger-color)';
        }

        // Connect MetaMask → Ethers provider → read vault balances
        window._adminConnectVault = async function() {
            var _cvBtn = document.querySelector('button[onclick="window._adminConnectVault()"]');
            function _cvBtn2(lbl,icon,dis,bg){if(_cvBtn){_cvBtn.disabled=dis;_cvBtn.innerHTML='<i class="fas '+icon+'"></i> '+lbl;_cvBtn.style.background=bg||'';}}
            if (typeof window.ethereum === 'undefined') {
                _setVaultBadge(false,'NO METAMASK');
                _cvBtn2('No MetaMask','fa-exclamation-triangle',false,'var(--danger-color)');
                if (typeof showNotification === 'function')
                    showNotification('MetaMask not installed. Install MetaMask to use vault.', 'error');
                return;
            }
            if (typeof ethers === 'undefined' || !ethers) {
                _setVaultBadge(false,'LIB ERROR');
                _cvBtn2('Library Error','fa-exclamation-triangle',false,'var(--danger-color)');
                if (typeof showNotification === 'function')
                    showNotification('Blockchain library not loaded. Please refresh.', 'error');
                return;
            }
            _setVaultBadge(false, 'CONNECTING…');
            _cvBtn2('Connecting…','fa-spinner fa-spin',true,'');
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });
                const provider = new ethers.providers.Web3Provider(window.ethereum);
                const signer   = provider.getSigner();
                const addr     = await signer.getAddress();

                _DISBURSE.provider   = provider;
                _DISBURSE.signer     = signer;
                _DISBURSE.walletAddr = addr;
                _DISBURSE.connected  = true;

                // Read EMPY balance
                let empyBal = '—', usdtBal = '—';
                try {
                    const empyC = new ethers.Contract(_DISBURSE.empyTokenAddr, _ERC20_ABI, provider);
                    const rawEmpy = await empyC.balanceOf(addr);
                    const decEmpy = await empyC.decimals();
                    empyBal = parseFloat(ethers.utils.formatUnits(rawEmpy, decEmpy)).toLocaleString('en-NG', { maximumFractionDigits: 2 }) + ' EMPY';
                } catch(e) { empyBal = 'N/A'; }
                try {
                    const usdtC = new ethers.Contract(_DISBURSE.usdtAddr, _ERC20_ABI, provider);
                    const rawUsdt = await usdtC.balanceOf(addr);
                    usdtBal = parseFloat(ethers.utils.formatUnits(rawUsdt, 6)).toLocaleString('en-NG', { maximumFractionDigits: 2 }) + ' USDT';
                } catch(e) { usdtBal = 'N/A'; }

                _setVaultBadge(true);
                const infoRow = document.getElementById('vault-info-row');
                if (infoRow) infoRow.style.display = 'block';
                const elEmpy = document.getElementById('vault-bal-empy');
                const elUsdt = document.getElementById('vault-bal-usdt');
                const elAddr = document.getElementById('vault-wallet-addr');
                if (elEmpy) elEmpy.textContent = empyBal;
                if (elUsdt) elUsdt.textContent = usdtBal;
                if (elAddr) elAddr.textContent = addr.slice(0, 6) + '…' + addr.slice(-4);

                _cvBtn2('Vault Connected','fa-check-circle',false,'var(--success-color,#22c55e)');
                if (typeof showNotification === 'function') showNotification('Vault connected: ' + addr.slice(0,6) + '…' + addr.slice(-4), 'success');
            } catch(err) {
                _setVaultBadge(false, 'FAILED');
                _cvBtn2('Connect Vault','fa-plug',false,'');
                if (typeof showNotification === 'function') showNotification('Vault connection failed: ' + (err.message||'User rejected'), 'error');
                console.error('[Vault] Connect error:', err);
            }
        };

        // Toggle crypto token row visibility
        window._adminDisbModeChange = function() {
            const mode = document.getElementById('disb-mode')?.value;
            const cryptoRow = document.getElementById('disb-crypto-row');
            if (cryptoRow) cryptoRow.style.display = mode === 'crypto' ? 'block' : 'none';
        };

        // Toggle NGO / Individual panels
        // BUG FIX: Made robust against optional-chaining absence and wrapper chain breakage.
        // Also initialises the method tabs whenever the individual panel becomes visible.
        window._adminDisbRecipChange = function() {
            var checked = document.querySelector('input[name="disb-recip-type"]:checked');
            var val = checked ? checked.value : 'ngo';
            var ngoPanel = document.getElementById('disb-ngo-panel');
            var indPanel = document.getElementById('disb-individual-panel');
            if (ngoPanel) ngoPanel.style.display = (val === 'ngo')        ? 'block' : 'none';
            if (indPanel) indPanel.style.display = (val === 'individual') ? 'block' : 'none';
            /* When individual panel becomes visible, ensure method tabs are initialised */
            if (val === 'individual' && typeof window._selectDisbMethod === 'function') {
                window._selectDisbMethod(window._currentDisbMethod || 'bank');
            }
        };

        // Switch disbursement method tabs (bank / empy / usdt / bnb / btc)
        window._selectDisbMethod = function(method) {
            ['bank','empy','usdt','bnb','btc'].forEach(function(m) {
                var panel = document.getElementById('disb-method-' + m);
                if (panel) panel.style.display = m === method ? 'block' : 'none';
            });
            document.querySelectorAll('#disb-method-tabs button[data-method]').forEach(function(btn) {
                var active = btn.dataset.method === method;
                btn.style.background = active ? '#0A0E27' : 'white';
                btn.style.color      = active ? 'white'   : '#0A0E27';
            });
            window._currentDisbMethod = method;
        };

        // Load NGO partners into the multi-select list
        window._adminLoadNgoList = async function() {
            const list = document.getElementById('disb-ngo-list');
            if (!list) return;
            list.innerHTML = '<div style="color:var(--text-muted);font-size:0.88rem;padding:10px;">Loading…</div>';

            // Try Firestore ngo_partners collection first, fall back to mockNgoPartners
            let ngos = [];
            try {
                if (window._firebaseLoaded) {
                    const snap = await fbDb.collection('ngo_partners').limit(60).get();
                    snap.forEach(function(doc) {
                        const d = doc.data();
                        ngos.push({ id: doc.id, name: d.name || d.orgName || doc.id, wallet: d.walletAddress || d.wallet || '', email: d.email || '' });
                    });
                }
            } catch(e) {}

            // Merge with mockNgoPartners if available
            if (window.mockNgoPartners && typeof window.mockNgoPartners === 'object') {
                Object.values(window.mockNgoPartners).forEach(function(ngo) {
                    if (!ngos.find(function(n) { return n.id === ngo.id; })) {
                        ngos.push({ id: ngo.id, name: ngo.name || ngo.id, wallet: ngo.wallet || ngo.walletAddress || '', email: ngo.email || '' });
                    }
                });
            }

            if (!ngos.length) {
                list.innerHTML = '<div style="color:var(--text-muted);font-size:0.88rem;padding:10px;">No NGO partners found. Register partners via the Publish → NGO Partners section.</div>';
                return;
            }

            list.innerHTML = ngos.map(function(ngo) {
                return '<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid rgba(10,14,39,0.08);border-radius:12px;cursor:pointer;font-size:0.88rem;background:white;">' +
                    '<input type="checkbox" class="disb-ngo-chk" data-id="' + ngo.id + '" data-name="' + (ngo.name).replace(/"/g,'&quot;') + '" data-wallet="' + (ngo.wallet||'') + '" data-email="' + (ngo.email||'') + '" style="width:15px;height:15px;accent-color:var(--secondary);flex-shrink:0;">' +
                    '<span><strong>' + ngo.name + '</strong>' + (ngo.wallet ? '<br><span style="font-size:0.75rem;color:var(--text-muted);font-family:monospace;">' + ngo.wallet.slice(0,10) + '…</span>' : '') + '</span>' +
                    '</label>';
            }).join('');
        };

        // Load recent disbursements from Firestore
        window._adminLoadRecentDisbursements = async function() {
            const tbody = document.getElementById('disb-history-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">Loading…</td></tr>';
            if (!window._firebaseLoaded) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">Firebase not connected.</td></tr>';
                return;
            }
            try {
                const snap = await fbDb.collection('disbursements').orderBy('createdAt', 'desc').limit(30).get();
                if (snap.empty) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted);">No disbursements recorded yet.</td></tr>';
                    return;
                }
                let rows = '';
                snap.forEach(function(doc) {
                    const d  = doc.data();
                    const dt = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }) : '—';
                    const statusColor = d.status === 'completed' ? 'var(--success-color,#22c55e)' : d.status === 'failed' ? 'var(--danger-color)' : '#F59E0B';
                    rows += '<tr style="border-bottom:1px solid rgba(10,14,39,0.06);">' +
                        '<td style="padding:10px 14px;white-space:nowrap;">' + dt + '</td>' +
                        '<td style="padding:10px 14px;">' + (d.recipientName || d.recipientId || '—') + '</td>' +
                        '<td style="padding:10px 14px;font-weight:700;">' + (d.amountFormatted || d.amount || '—') + '</td>' +
                        '<td style="padding:10px 14px;">' + (d.mode || '—') + '</td>' +
                        '<td style="padding:10px 14px;">' + (d.purpose || '—') + '</td>' +
                        '<td style="padding:10px 14px;"><span style="font-weight:700;color:' + statusColor + ';">' + (d.status || 'pending') + '</span></td>' +
                        '</tr>';
                });
                tbody.innerHTML = rows;
            } catch(err) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--danger-color);">Error: ' + err.message + '</td></tr>';
            }
        };

        // Append a live row to the Grant Transparency Portal after disbursement
        function _appendGrantLedgerRow(rec) {
            var tbody = document.getElementById('grant-ledger-body');
            if (!tbody) return;
            var empty = tbody.querySelector('td[colspan]');
            if (empty) empty.closest('tr').remove();
            var gid  = 'G-' + Date.now().toString(36).toUpperCase().slice(-6);
            var dt   = new Date().toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'});
            var txTxt = rec.txHash ? rec.txHash.slice(0,16)+'..' : rec.txRef ? rec.txRef.slice(0,16)+'..' : 'pending';
            var txUrl = rec.txHash ? 'https://polygonscan.com/tx/'+rec.txHash : '#';
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>'+gid+'</td>'+
                '<td>'+(rec.recipientName||'—')+'</td>'+
                '<td>'+(rec.purpose||'—')+'</td>'+
                '<td>'+(rec.amountFormatted||rec.amount||'—')+'</td>'+
                '<td><a href="'+txUrl+'" target="_blank" style="color:var(--secondary);font-family:monospace;font-size:0.82rem;">'+txTxt+'</a></td>'+
                '<td style="color:var(--success-color,#22c55e);font-weight:700;">completed</td>'+
                '<td>'+dt+'</td>';
            tbody.prepend(tr);
        }

                // Show feedback inside disbursement form
        function _disbFeedback(msg, type) {
            const el = document.getElementById('disb-feedback');
            if (!el) return;
            el.style.display    = 'block';
            el.style.background = type === 'error' ? 'rgba(239,68,68,0.1)' : type === 'success' ? 'rgba(0,137,123,0.1)' : 'rgba(245,158,11,0.1)';
            el.style.color      = type === 'error' ? 'var(--danger-color)' : type === 'success' ? 'var(--success-color,#22c55e)' : '#d97706';
            el.style.border     = '1.5px solid currentColor';
            el.textContent      = msg;
        }

        // Main disbursement initiator
        window._adminInitiateDisbursement = async function() {
            const amount    = parseFloat(document.getElementById('disb-amount')?.value || '0');
            const mode      = document.getElementById('disb-mode')?.value;
            const purpose   = document.getElementById('disb-purpose')?.value?.trim();
            const recipType = document.querySelector('input[name="disb-recip-type"]:checked')?.value || 'ngo';
            const token     = document.querySelector('input[name="disb-token"]:checked')?.value || 'empy';
            const _dBtn     = document.querySelector('button[onclick="window._adminInitiateDisbursement()"]');
            const _lock   = function(){if(_dBtn){_dBtn.disabled=true; _dBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Processing…';}};
            const _unlock = function(){if(_dBtn){_dBtn.disabled=false;_dBtn.innerHTML='<i class="fas fa-paper-plane"></i> Initiate Disbursement';}};

            // Validate
            if (!amount || amount < 1) return _disbFeedback('Please enter a valid amount.', 'error');
            if (!mode)                 return _disbFeedback('Please select a disbursement mode.', 'error');
            if (!purpose)              return _disbFeedback('Please enter a purpose / project ID.', 'error');

            // Gather recipients
            const recipients = [];
            if (recipType === 'ngo') {
                document.querySelectorAll('.disb-ngo-chk:checked').forEach(function(chk) {
                    recipients.push({ id: chk.dataset.id, name: chk.dataset.name, wallet: chk.dataset.wallet, email: chk.dataset.email });
                });
                if (!recipients.length) return _disbFeedback('Please select at least one NGO partner.', 'error');
            } else {
                /* Individual disbursement — read from method-specific fields */
                const method = window._currentDisbMethod || 'bank';
                let addr = '', walletType = method;

                if (method === 'bank') {
                    const accNum  = document.getElementById('disb-bank-acc-number')?.value?.trim();
                    const accName = document.getElementById('disb-bank-acc-name')?.value?.trim();
                    const bank    = document.getElementById('disb-bank-name')?.value?.trim();
                    if (!accNum) return _disbFeedback('Please enter the recipient account number.', 'error');
                    addr = accNum + (bank ? ' — ' + bank : '') + (accName ? ' (' + accName + ')' : '');
                    walletType = 'bank';
                } else if (method === 'usdt') {
                    const network = document.getElementById('disb-usdt-network')?.value || 'erc20';
                    addr = document.getElementById('disb-usdt-addr')?.value?.trim();
                    if (!addr) return _disbFeedback('Please enter the USDT wallet address.', 'error');
                    walletType = 'usdt-' + network;
                } else if (method === 'empy') {
                    addr = document.getElementById('disb-individual-addr')?.value?.trim();
                    if (!addr) return _disbFeedback('Please enter the EMPY wallet address.', 'error');
                } else if (method === 'bnb') {
                    addr = document.getElementById('disb-bnb-addr')?.value?.trim();
                    if (!addr) return _disbFeedback('Please enter the BNB wallet address.', 'error');
                } else if (method === 'btc') {
                    addr = document.getElementById('disb-btc-addr')?.value?.trim();
                    if (!addr) return _disbFeedback('Please enter the BTC wallet address.', 'error');
                }

                const name = document.getElementById('disb-individual-name')?.value?.trim() || 'Individual Recipient';
                if (!addr) return _disbFeedback('Please fill in the recipient details.', 'error');
                recipients.push({ id: addr, name: name, wallet: addr, email: '', walletType: walletType });
            }

            _lock();
            _disbFeedback('Processing disbursement…', 'info');

            if (mode === 'fiat') {
                // Fiat via Flutterwave — disburse to each selected recipient
                let processed = 0;
                let lastErr = '';
                const perRecipient = Math.floor(amount / recipients.length);

                for (const recip of recipients) {
                    try {
                        await new Promise(function(resolve, reject) {
                            window.initiateFlutterwavePayment({
                                amount:      perRecipient,
                                currency:    'NGN',
                                email:       recip.email || (window.userState && window.userState.email) || 'admin@empyrean.com',
                                name:        recip.name,
                                description: purpose,
                                purpose:     purpose,
                                onSuccess: async function(response, txRef) {
                                    // Record in Firestore
                                    try {
                                        await fbDb.collection('disbursements').add({
                                            recipientId:     recip.id,
                                            recipientName:   recip.name,
                                            recipientWallet: recip.wallet || '',
                                            amount:          perRecipient,
                                            amountFormatted: '₦' + perRecipient.toLocaleString('en-NG'),
                                            mode:            'fiat-ngn',
                                            token:           'NGN',
                                            purpose:         purpose,
                                            txRef:           txRef,
                                            flwRef:          response.flw_ref || '',
                                            status:          'completed',
                                            adminId:         (window.userState && window.userState.id) || '',
                                            createdAt:       _serverTimestamp()
                                        });
                                        // Record off-chain on the registry contract if vault is connected
                                        if (_DISBURSE.connected && _DISBURSE.signer && recip.wallet && recip.wallet.startsWith('0x')) {
                                            try {
                                                const registry = new ethers.Contract(_DISBURSE.registryAddr, _REGISTRY_ABI, _DISBURSE.signer);
                                                await registry.recordOffChainGrant(
                                                    recip.wallet,
                                                    ethers.utils.parseUnits(String(perRecipient), 18),
                                                    'NGN',
                                                    purpose,
                                                    txRef
                                                );
                                            } catch(chainErr) { console.warn('[Disburse] Off-chain record error:', chainErr.message); }
                                        }
                                    } catch(e) { console.warn('[Disburse] Firestore save error:', e.message); }
                                    _appendGrantLedgerRow({recipientName:recip.name,purpose:purpose,amountFormatted:'₦'+perRecipient.toLocaleString('en-NG'),txRef:txRef});
                                    processed++;
                                    resolve();
                                },
                                onFailure: function(res) { reject(new Error(res.message || 'Payment failed')); },
                                onClose:   function()    { reject(new Error('Payment window closed')); }
                            });
                        });
                    } catch(flwErr) {
                        lastErr = flwErr.message || String(flwErr);
                        console.warn('[Disburse] FLW error for', recip.name, ':', lastErr);
                        _disbFeedback('⚠ Error for '+recip.name+': '+lastErr,'error');
                    }
                }
                _unlock();
                if (processed === recipients.length && processed > 0) {
                    _disbFeedback('✅ Fiat disbursement completed for ' + processed + ' recipient(s). Ledger updated.', 'success');
                    window._adminLoadRecentDisbursements();
                } else if (processed > 0) {
                    _disbFeedback('⚠ Partial: ' + processed + ' of ' + recipients.length + ' completed.', 'warning');
                    window._adminLoadRecentDisbursements();
                } else {
                    _disbFeedback('❌ No disbursements completed.' + (lastErr ? ' Reason: ' + lastErr : ' Check payment gateway connection.'), 'error');
                }

            } else if (mode === 'crypto') {
                // Crypto — requires vault connection
                if (!_DISBURSE.connected || !_DISBURSE.signer) {
                    _unlock();
                    return _disbFeedback('Please connect the vault (MetaMask) before sending crypto.', 'error');
                }
                if (typeof ethers === 'undefined' || !ethers) {
                    _unlock();
                    return _disbFeedback('Blockchain library not loaded. Please refresh.', 'error');
                }
                const tokenAddr = token === 'usdt' ? _DISBURSE.usdtAddr : _DISBURSE.empyTokenAddr;
                const decimals  = token === 'usdt' ? 6 : 18;
                const perRecipient = amount / recipients.length;
                const amtUnits  = ethers.utils.parseUnits(perRecipient.toFixed(decimals > 6 ? 6 : decimals), decimals);
                const tokenLabel = token === 'usdt' ? 'USDT' : 'EMPY';

                let processed = 0;
                const tokenContract  = new ethers.Contract(tokenAddr, _ERC20_ABI, _DISBURSE.signer);
                const registryContract = new ethers.Contract(_DISBURSE.registryAddr, _REGISTRY_ABI, _DISBURSE.signer);

                for (const recip of recipients) {
                    if (!recip.wallet || !recip.wallet.startsWith('0x')) {
                        console.warn('[Disburse] No valid wallet for', recip.name, '— skipping');
                        continue;
                    }
                    try {
                        _disbFeedback('Sending ' + tokenLabel + ' to ' + recip.name + '…', 'info');
                        // ERC-20 transfer
                        const tx = await tokenContract.transfer(recip.wallet, amtUnits);
                        await tx.wait();
                        // Record on-chain in registry
                        try {
                            const regTx = await registryContract.recordOnChainGrant(recip.wallet, tokenAddr, amtUnits, purpose);
                            await regTx.wait();
                        } catch(regErr) { console.warn('[Disburse] Registry record error:', regErr.message); }
                        // Persist to Firestore
                        try {
                            await fbDb.collection('disbursements').add({
                                recipientId:     recip.id,
                                recipientName:   recip.name,
                                recipientWallet: recip.wallet,
                                amount:          perRecipient,
                                amountFormatted: perRecipient.toLocaleString('en', { maximumFractionDigits: 4 }) + ' ' + tokenLabel,
                                mode:            'crypto',
                                token:           tokenLabel,
                                tokenAddress:    tokenAddr,
                                txHash:          tx.hash,
                                purpose:         purpose,
                                status:          'completed',
                                adminId:         (window.userState && window.userState.id) || '',
                                createdAt:       _serverTimestamp()
                            });
                        } catch(firestoreErr) { console.warn('[Disburse] Firestore error:', firestoreErr.message); }
                        _appendGrantLedgerRow({recipientName:recip.name,purpose:purpose,amountFormatted:perRecipient.toLocaleString('en',{maximumFractionDigits:4})+' '+tokenLabel,txHash:tx.hash});
                        processed++;
                    } catch(txErr) {
                        console.error('[Disburse] TX error for', recip.name, ':', txErr.message);
                        _disbFeedback('❌ Failed for ' + recip.name + ': ' + txErr.message, 'error');
                    }
                }
                _unlock();
                if (processed > 0) {
                    _disbFeedback('✅ ' + tokenLabel + ' sent to ' + processed + ' of ' + recipients.length + ' recipient(s). Ledger updated.', 'success');
                    window._adminLoadRecentDisbursements();
                } else {
                    _disbFeedback('❌ No transactions completed. Check wallet addresses and vault.', 'error');
                }
            } else {
                _unlock();
                _disbFeedback('Unknown disbursement mode.', 'error');
            }
        };

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — NEWS ARTICLE PUBLISH FORM
        // Wires the #admin-news-form submit, toolbar formatting buttons,
        // media upload preview, and the published articles table.
        // Root cause of Bug 1: no submit handler was ever wired to this form.
        // ═══════════════════════════════════════════════════════════════════
        (function _wireAdminNewsForm() {

            // FIX (2026-08-14 — bug report: "Edit and delete options are not
            // available" for published news): Delete already existed here;
            // Edit genuinely did not — there was no code path anywhere that
            // loaded an existing article back into this form for editing.
            // Tracks which article (if any) is currently being edited, so
            // the ONE existing form/submit handler can serve both "publish
            // new" and "save edits" without a second form or a new file.
            // null = normal create mode.
            // FIX (2026-08-14 — Edit was populating the form but "Save
            // Changes" silently published a brand-new article instead of
            // updating the original — see the submit handler below for the
            // root cause and full fix): these three companion vars capture
            // the article's existing media/createdAt/publishedBy the moment
            // Edit is opened, so the submit handler can (a) keep the
            // original publish date instead of bumping the article to the
            // top of the feed on every edit, and (b) keep the existing
            // photo/video attached when the admin edits text only, without
            // re-uploading anything.
            var _editingArticleId = null;
            var _editingArticleMedia = [];
            var _editingArticleCreatedAt = null;
            var _editingArticlePublishedBy = null;

            function _feedbackNews(msg, type) {
                var el = document.getElementById('admin-news-feedback');
                if (!el) return;
                var colors = {
                    success: { bg: 'rgba(34,197,94,0.12)', color: 'var(--success-color,#22c55e)' },
                    error:   { bg: 'rgba(239,68,68,0.12)', color: 'var(--danger-color,#ef4444)' },
                    info:    { bg: 'rgba(27,43,139,0.08)', color: 'var(--secondary,#1B2B8B)' }
                };
                var c = colors[type] || colors.info;
                el.style.display    = 'block';
                el.style.background = c.bg;
                el.style.color      = c.color;
                el.style.border     = '1.5px solid currentColor';
                el.style.padding    = '12px 16px';
                el.style.borderRadius = '10px';
                el.style.fontWeight = '600';
                el.style.fontSize   = '0.88rem';
                el.textContent = msg;
            }

            function _newsRowHTML(id, d) {
                var dt = d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' }) : '—';
                return '<td style="padding:10px 16px;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+_esc(d.title||'')+'">'+_esc(d.title||'—')+'</td>'+
                    '<td style="padding:10px 16px;">'+_esc(d.writer||'—')+'</td>'+
                    '<td style="padding:10px 16px;"><span style="background:rgba(27,43,139,0.08);color:var(--secondary);padding:2px 9px;border-radius:10px;font-size:0.78rem;font-weight:600;">'+_esc(d.category||'—')+'</span></td>'+
                    '<td style="padding:10px 16px;white-space:nowrap;">'+dt+'</td>'+
                    // ADDED — view count. The reader UI (app-news.js's
                    // _openArticleDetail) already displayed d.views but
                    // nothing wrote to it until now (see that file's own
                    // _bumpArticleViewCount); this surfaces the same field
                    // here so admins can actually see how many people have
                    // viewed each published article.
                    '<td style="padding:10px 16px;white-space:nowrap;color:var(--text-muted);"><i class="fas fa-eye" style="margin-right:5px;opacity:0.6;"></i>'+(Number(d.views)||0).toLocaleString()+'</td>'+
                    '<td style="padding:10px 16px;white-space:nowrap;">'+
                        '<button onclick="window._adminEditNewsArticle(\''+id+'\')" style="background:rgba(27,43,139,0.08);color:var(--secondary,#1B2B8B);border:none;border-radius:8px;padding:5px 10px;font-size:0.78rem;font-weight:700;cursor:pointer;margin-right:6px;"><i class="fas fa-pen"></i> Edit</button>'+
                        '<button onclick="window._adminDeleteNewsArticle(\''+id+'\')" style="background:rgba(239,68,68,0.1);color:#ef4444;border:none;border-radius:8px;padding:5px 10px;font-size:0.78rem;font-weight:700;cursor:pointer;"><i class="fas fa-trash"></i> Delete</button>'+
                    '</td>';
            }

            // FIX (2026-08-14 — bug report: "News Published section does not
            // store entries in the store log" / "immediately after posting,
            // the item is hidden"): this used to unconditionally do
            // `tbody.innerHTML = ''` and rebuild the ENTIRE table from
            // whatever this one query returned. That's fine when the query
            // is complete and up to date, but two things could make a
            // freshly-published article briefly (or permanently) missing
            // from it: (a) app-fixes.js's separate "quick post -> News"
            // composer wrote only to news_posts and never to this
            // news_articles archive at all (fixed at the source in that
            // file this session), and (b) even a fully-awaited archive
            // write can occasionally still be settling relative to a
            // `.get()` fired immediately after it on a weak connection
            // (the same class of race app-patch-v26/v31/v35 already
            // document elsewhere in this app). Either way, a query that
            // simply doesn't (yet) include the newest article used to
            // silently ERASE the optimistic row that addNewsPost()'s
            // _syncAdminTable() (app-news.js) had already inserted the
            // moment the article was published — which is exactly what
            // "hidden immediately after posting" looks like from the
            // admin's side. Now this merges by article id instead of
            // wiping: existing rows are updated in place, new ones from
            // the query are added, and a row is only ever REMOVED here if
            // it's missing from the query AND wasn't just added within the
            // last 30s (same "still probably in flight" grace window
            // app-news.js's own listener already uses for its own
            // prepend-vs-append decision) — so a genuinely deleted article
            // still disappears, just not a split-second-old one still
            // catching up to this query.
            var RECENT_GRACE_MS = 30000;
            function _refreshNewsTable() {
                var tbody = document.getElementById('admin-news-table-body');
                var badge = document.getElementById('admin-news-count-badge');
                if (!tbody) return;
                if (!window._firebaseLoaded || !window.fbDb) return;
                window.fbDb.collection('news_articles').orderBy('createdAt', 'desc').limit(30).get()
                    .then(function(snap) {
                        var emptyRow = document.getElementById('admin-news-empty-row');
                        var seenIds = {};

                        if (!snap.empty) {
                            if (emptyRow) emptyRow.remove();
                            // Walk newest-first so re-inserted/moved rows end up in the right order.
                            var prevEl = null;
                            snap.forEach(function(doc) {
                                seenIds[doc.id] = true;
                                var d = doc.data();
                                var row = tbody.querySelector('tr[data-post-id="' + doc.id + '"]');
                                if (row) {
                                    row.innerHTML = _newsRowHTML(doc.id, d);
                                } else {
                                    row = document.createElement('tr');
                                    row.dataset.postId = doc.id;
                                    row.style.borderBottom = '1px solid rgba(10,14,39,0.06)';
                                    row.innerHTML = _newsRowHTML(doc.id, d);
                                }
                                if (prevEl) prevEl.after(row); else tbody.prepend(row);
                                prevEl = row;
                            });
                        }

                        // Drop rows that are no longer in the query result —
                        // unless they were only just added (grace window above).
                        Array.prototype.slice.call(tbody.querySelectorAll('tr[data-post-id]')).forEach(function (row) {
                            var id = row.dataset.postId;
                            if (seenIds[id]) return;
                            var addedAt = parseInt(row.dataset.addedAt || '0', 10);
                            if (addedAt && (Date.now() - addedAt) < RECENT_GRACE_MS) return; // still in grace window — keep it
                            row.remove();
                        });

                        var remaining = tbody.querySelectorAll('tr[data-post-id]').length;
                        if (badge) badge.textContent = remaining;
                        if (remaining === 0 && !tbody.querySelector('#admin-news-empty-row')) {
                            tbody.innerHTML = '<tr id="admin-news-empty-row"><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">No articles published yet.</td></tr>';
                        }
                    })
                    .catch(function(e) { console.warn('[AdminNews] Table refresh error:', e.message); });
            }

            // Optimistic insert used right after a successful publish (see
            // the submit handler below) — same idea as app-news.js's own
            // _syncAdminTable(), kept local to this file since it also needs
            // to stamp data-added-at for the grace window above.
            function _optimisticAddRow(id, d) {
                var tbody = document.getElementById('admin-news-table-body');
                var badge = document.getElementById('admin-news-count-badge');
                if (!tbody) return;
                var emptyRow = document.getElementById('admin-news-empty-row');
                if (emptyRow) emptyRow.remove();
                var row = tbody.querySelector('tr[data-post-id="' + id + '"]');
                if (!row) {
                    row = document.createElement('tr');
                    row.dataset.postId = id;
                    row.style.borderBottom = '1px solid rgba(10,14,39,0.06)';
                    tbody.prepend(row);
                }
                row.dataset.addedAt = String(Date.now());
                row.innerHTML = _newsRowHTML(id, d);
                if (badge) badge.textContent = tbody.querySelectorAll('tr[data-post-id]').length;
            }

            window._adminDeleteNewsArticle = function(docId) {
                if (!confirm('Delete this article? This cannot be undone.')) return;
                var row = document.querySelector('#admin-news-table-body tr[data-post-id="' + docId + '"]');
                if (row) row.remove(); // optimistic — don't wait on the network to feel responsive
                if (_editingArticleId === docId) _cancelEdit();
                /* Also remove the archive copy so the log stays in sync — deleteNewsPost()
                   (app-news.js) only ever deletes from news_posts (the public/live copy). */
                if (window._firebaseLoaded && window.fbDb) {
                    window.fbDb.collection('news_articles').doc(docId).delete().catch(function (e) {
                        console.warn('[AdminNews] Archive delete failed:', e && e.message);
                    });
                }
                /* Delegate to app-news.js which handles cache + DOM + dashboard strip + Firestore */
                if (typeof window.deleteNewsPost === 'function') {
                    window.deleteNewsPost(docId);
                    _refreshNewsTable();
                    return;
                }
                /* Fallback if app-news.js not loaded */
                if (!window._firebaseLoaded || !window.fbDb) return;
                window.fbDb.collection('news_posts').doc(docId).delete()
                    .then(function() {
                        if (typeof window.showNotification === 'function') window.showNotification('Article deleted.', 'success');
                        _refreshNewsTable();
                    })
                    .catch(function(e) { if (typeof window.showNotification === 'function') window.showNotification('Delete failed: '+e.message, 'error'); });
            };

            // FIX (2026-08-14 — bug report: "Edit... options are not
            // available" for published news): genuinely new — nothing in
            // this codebase previously loaded a published article back into
            // the form for editing. Loads the archived copy (news_articles
            // has the full body/summary/category/pubdate — news_posts only
            // ever stored a trimmed-down `content` copy for the public
            // feed), populates every #admin-news-form field, and flips the
            // form into "edit mode" so the existing submit handler updates
            // the SAME article id in both collections instead of publishing
            // a new one. See _wireNewsFormSubmit()'s edit-mode branch below.
            function _cancelEdit() {
                _editingArticleId = null;
                _editingArticleMedia = [];
                _editingArticleCreatedAt = null;
                _editingArticlePublishedBy = null;
                var form = document.getElementById('admin-news-form');
                var submitBtn = form && form.querySelector('button[type="submit"]');
                var cancelBtn = document.getElementById('admin-news-cancel-edit-btn');
                if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Article';
                if (cancelBtn) cancelBtn.style.display = 'none';
                if (form) form.reset();
                var prev = document.getElementById('admin-news-media-preview');
                if (prev) prev.innerHTML = '';
            }
            window._adminCancelEditNewsArticle = _cancelEdit;

            /* FIX (request — "multiple pictures can be placed... at the
               middle of the article"): builds one clickable, numbered
               thumbnail for the media preview strip. Tapping it inserts
               a `[img:N]` token at the current cursor position in
               #admin-news-body — app-news.js's _renderArticleBody()
               (reader side) expands that exact token into a real inline
               image/video at that position, reading from the same
               media list this index refers to (mediaInput.files order on
               a fresh upload, or _editingArticleMedia order when editing
               without picking new files — both cases match what the
               submit handler actually saves as article.media, so the
               index a thumbnail is tapped at is always correct). The
               numbered badge is what tells the admin which token maps to
               which picture. Shared by both places a media preview gets
               built: a fresh file selection (_wireNewsMediaInput) and
               loading an existing article for editing
               (window._adminEditNewsArticle), so a token typed in either
               flow behaves identically. */
            function _insertImgTokenAtCursor(idx) {
                var body = document.getElementById('admin-news-body');
                if (!body) return;
                var token = '[img:' + idx + ']';
                var start = (typeof body.selectionStart === 'number') ? body.selectionStart : body.value.length;
                var end   = (typeof body.selectionEnd   === 'number') ? body.selectionEnd   : start;
                body.value = body.value.slice(0, start) + token + body.value.slice(end);
                var caret = start + token.length;
                body.focus();
                try { body.selectionStart = body.selectionEnd = caret; } catch (e) {}
                _feedbackNews('Inserted ' + token + ' into the article — it\u2019ll render as an inline picture at that exact spot.', 'success');
            }

            function _buildMediaPreviewThumb(url, idx, isVid) {
                var box = document.createElement('div');
                box.className = 'admin-news-media-thumb';
                box.title = 'Tap to insert this image into the article body at the cursor';
                box.style.cssText = 'position:relative;width:90px;height:70px;cursor:pointer;';
                var el = document.createElement(isVid ? 'video' : 'img');
                el.src = url;
                if (isVid) { el.muted = true; el.controls = false; }
                el.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px;border:2px solid rgba(27,43,139,0.15);display:block;pointer-events:none;';
                var badge = document.createElement('span');
                badge.textContent = idx + 1;
                badge.style.cssText = 'position:absolute;top:-6px;left:-6px;background:var(--secondary,#1B2B8B);color:#fff;font-size:0.68rem;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.25);pointer-events:none;';
                box.appendChild(el);
                box.appendChild(badge);
                box.addEventListener('click', function () { _insertImgTokenAtCursor(idx); });
                return box;
            }

            window._adminEditNewsArticle = function (docId) {
                if (!window._firebaseLoaded || !window.fbDb) {
                    if (typeof window.showNotification === 'function') window.showNotification('Not connected — try again in a moment.', 'error');
                    return;
                }
                window.fbDb.collection('news_articles').doc(docId).get().then(function (doc) {
                    if (!doc.exists) {
                        if (typeof window.showNotification === 'function') window.showNotification('Could not find that article — it may have just been deleted.', 'error');
                        return;
                    }
                    var d = doc.data() || {};
                    _editingArticleId = docId;
                    _editingArticleMedia = Array.isArray(d.media) ? d.media : (d.image ? [d.image] : []);
                    _editingArticleCreatedAt = d.createdAt || null;
                    _editingArticlePublishedBy = d.publishedBy || null;

                    var titleEl    = document.getElementById('admin-news-title');
                    var writerEl   = document.getElementById('admin-news-writer');
                    var categoryEl = document.getElementById('admin-news-category');
                    var pubdateEl  = document.getElementById('admin-news-pubdate');
                    var summaryEl  = document.getElementById('admin-news-summary');
                    var bodyEl     = document.getElementById('admin-news-body');
                    var displayAsEl = document.getElementById('admin-news-display-as');

                    if (titleEl)    titleEl.value    = d.title    || '';
                    if (writerEl)   writerEl.value   = d.writer   || '';
                    if (categoryEl) categoryEl.value = d.category || 'impact';
                    if (pubdateEl)  pubdateEl.value  = d.pubdate  || '';
                    if (summaryEl)  summaryEl.value  = d.summary  || '';
                    if (bodyEl)     bodyEl.value     = d.body     || '';
                    if (displayAsEl) displayAsEl.value = d.displayAs || 'writer';

                    var preview = document.getElementById('admin-news-media-preview');
                    if (preview) {
                        preview.innerHTML = '';
                        // FIX (request — inline mid-article images): this used
                        // to only ever show d.image (a single cover shot), so
                        // an admin editing an article with multiple uploaded
                        // pictures couldn't see or reference any but the
                        // first — no way to insert the others into the body.
                        // _editingArticleMedia (set just above) already holds
                        // the FULL list; render every item as a numbered,
                        // clickable thumbnail so [img:N] tokens can be
                        // inserted for any of them, the same as a fresh
                        // upload.
                        _editingArticleMedia.forEach(function (url, idx) {
                            var isVid = /\.(mp4|webm|mov)(\?|$)/i.test(url) || /\/video\/upload\//i.test(url);
                            preview.appendChild(_buildMediaPreviewThumb(url, idx, isVid));
                        });
                    }

                    var form = document.getElementById('admin-news-form');
                    var submitBtn = form && form.querySelector('button[type="submit"]');
                    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';

                    var cancelBtn = document.getElementById('admin-news-cancel-edit-btn');
                    if (!cancelBtn && form) {
                        cancelBtn = document.createElement('button');
                        cancelBtn.type = 'button';
                        cancelBtn.id = 'admin-news-cancel-edit-btn';
                        cancelBtn.className = 'btn';
                        cancelBtn.style.cssText = 'margin-left:10px;';
                        cancelBtn.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';
                        cancelBtn.addEventListener('click', _cancelEdit);
                        if (submitBtn && submitBtn.parentNode) submitBtn.parentNode.appendChild(cancelBtn);
                    }
                    if (cancelBtn) cancelBtn.style.display = 'inline-block';

                    if (form && typeof form.scrollIntoView === 'function') form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    _feedbackNews('Editing "' + (d.title || 'article') + '" — make your changes and tap Save Changes.', 'info');
                }).catch(function (e) {
                    if (typeof window.showNotification === 'function') window.showNotification('Could not load article: ' + (e && e.message || 'try again.'), 'error');
                });
            };

            /* ── Wire toolbar formatting buttons ── */
            function _wireToolbar() {
                var toolbar = document.getElementById('admin-news-toolbar');
                var body    = document.getElementById('admin-news-body');
                if (!toolbar || !body || toolbar._newsToolbarWired) return;
                toolbar._newsToolbarWired = true;
                toolbar.addEventListener('click', function(e) {
                    var btn = e.target.closest('.admin-news-fmt-btn');
                    if (!btn) return;
                    var fmt = btn.dataset.fmt;
                    var start = body.selectionStart;
                    var end   = body.selectionEnd;
                    var sel   = body.value.substring(start, end);
                    var before = body.value.substring(0, start);
                    var after  = body.value.substring(end);
                    var insert = sel;
                    if (fmt === 'bold')   insert = '**' + (sel || 'bold text') + '**';
                    if (fmt === 'italic') insert = '_' + (sel || 'italic text') + '_';
                    if (fmt === 'h2')     insert = '\n## ' + (sel || 'Heading') + '\n';
                    if (fmt === 'quote')  insert = '\n> ' + (sel || 'quote') + '\n';
                    if (fmt === 'bullet') insert = '\n- ' + (sel || 'list item') + '\n';
                    body.value = before + insert + after;
                    body.focus();
                    body.selectionStart = body.selectionEnd = before.length + insert.length;
                    e.preventDefault();
                });
            }

            /* ── Wire media preview for news upload ── */
            function _wireNewsMediaInput() {
                var input = document.getElementById('admin-news-media');
                if (!input || input._newsMediaWired) return;
                input._newsMediaWired = true;
                input.addEventListener('change', function() {
                    var preview = document.getElementById('admin-news-media-preview');
                    if (!preview) return;
                    preview.innerHTML = '';
                    // FIX (request — inline mid-article images): each thumb
                    // is now numbered + clickable (_buildMediaPreviewThumb)
                    // instead of a plain, inert preview — tapping one
                    // inserts that file's [img:N] token into the article
                    // body at the cursor. Picking new files here always
                    // matches what the submit handler will actually save
                    // (files.length loop -> mediaUrls, in this same order),
                    // so index N here is guaranteed correct.
                    Array.from(input.files || []).forEach(function(file, idx) {
                        var url = URL.createObjectURL(file);
                        var isVid = file.type.startsWith('video/');
                        preview.appendChild(_buildMediaPreviewThumb(url, idx, isVid));
                    });
                });
            }

            /* ── Wire the form submit ── */
            function _wireNewsFormSubmit() {
                var form = document.getElementById('admin-news-form');
                if (!form || form._newsFormWired) return;
                form._newsFormWired = true;

                form.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    e.stopImmediatePropagation();

                    var titleEl    = document.getElementById('admin-news-title');
                    var writerEl   = document.getElementById('admin-news-writer');
                    var categoryEl = document.getElementById('admin-news-category');
                    var pubdateEl  = document.getElementById('admin-news-pubdate');
                    var summaryEl  = document.getElementById('admin-news-summary');
                    var bodyEl     = document.getElementById('admin-news-body');
                    var mediaInput = document.getElementById('admin-news-media');
                    var displayAsEl = document.getElementById('admin-news-display-as');
                    var submitBtn  = form.querySelector('button[type="submit"]');

                    var title  = titleEl  ? titleEl.value.trim()  : '';
                    var writer = writerEl ? writerEl.value.trim() : '';
                    var body   = bodyEl   ? bodyEl.value.trim()   : '';
                    // FIX (bug: "news section always shows 'admin' as the author in the
                    // public dashboard feed, regardless of who wrote it"): this used to be
                    // hardcoded below to the logged-in admin account's own username (or the
                    // literal string 'admin'), completely ignoring the "Writer's Name" field
                    // above even though it's a required field the admin fills in every time.
                    // #admin-news-display-as (added alongside this fix, see index.html) lets
                    // the admin choose per-article whether the public feed should show the
                    // writer's name or "Admin" — defaults to the writer's name, since that's
                    // what the required field is FOR and what was actually expected.
                    var displayAs   = displayAsEl ? displayAsEl.value : 'writer';
                    var displayName = (displayAs === 'admin') ? 'Admin' : (writer || 'Admin');

                    if (!title)  { _feedbackNews('Article title is required.', 'error'); return; }
                    if (!writer) { _feedbackNews('Writer name is required.', 'error'); return; }
                    if (!body)   { _feedbackNews('Article body is required.', 'error'); return; }

                    // FIX (2026-08-14 — "Edit and delete options are not
                    // available" / Edit populated the form but silently
                    // published a duplicate instead of saving): everything
                    // below this point used to build a brand-new article
                    // (new id, new createdAt, publishedBy reset to the
                    // CURRENTLY logged-in admin) on every submit, whether
                    // this form was opened via "Publish Article" or via
                    // Edit -> "Save Changes". _editingArticleId (set by
                    // window._adminEditNewsArticle above) was tracked but
                    // never actually read here, so "Save Changes" always
                    // took the create path: it minted a second, separate
                    // article doc, left the original untouched, and the
                    // admin's edits appeared to vanish (they were saved —
                    // just under a new id the admin never asked for).
                    // isEditing/articleId below make the rest of this
                    // handler branch correctly for both modes.
                    var isEditing  = !!_editingArticleId;
                    var articleId  = _editingArticleId || ('news-' + Date.now());

                    var origText = submitBtn ? submitBtn.innerHTML : '';
                    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEditing ? 'Saving…' : 'Publishing…'); }
                    _feedbackNews(isEditing ? 'Saving changes…' : 'Publishing article…', 'info');

                    try {
                        /* Upload media files */
                        var mediaUrls = [];
                        var files = Array.from((mediaInput && mediaInput.files) || []);
                        // ADDED (2026-08-10 — upload progress tracker)
                        var _adminNewsBar = (typeof window.empUploadProgress === 'object')
                            ? window.empUploadProgress.attach(document.getElementById('admin-news-feedback') ? document.getElementById('admin-news-feedback').parentElement : form, files.length > 1 ? 'Media' : 'Upload')
                            : { update: function () {}, done: function () {}, fail: function () {} };
                        for (var i = 0; i < files.length; i++) {
                            try {
                                var url = await window.uploadToCloudinary(files[i], function (pct) {
                                    var overall = Math.round(((i + (pct / 100)) / files.length) * 100);
                                    _adminNewsBar.update(overall, files.length > 1 ? ('File ' + (i + 1) + '/' + files.length) : null);
                                });
                                if (url) mediaUrls.push(url);
                            } catch(ue) { console.warn('[AdminNews] Media upload error:', ue.message); }
                        }
                        if (files.length) _adminNewsBar.done();

                        // FIX (2026-08-14, same edit-mode fix as above): if this is
                        // an edit and the admin didn't pick a new file, keep the
                        // article's existing photo/video (captured by
                        // window._adminEditNewsArticle into _editingArticleMedia)
                        // instead of wiping it — an untouched file input means
                        // "leave the media as it was," not "remove it."
                        if (!mediaUrls.length && isEditing && _editingArticleMedia.length) {
                            mediaUrls = _editingArticleMedia.slice();
                        }

                        var article = {
                            id:        articleId,
                            title:     title,
                            writer:    writer,
                            category:  categoryEl ? categoryEl.value : 'impact',
                            pubdate:   pubdateEl  ? pubdateEl.value  : '',
                            summary:   summaryEl  ? summaryEl.value.trim() : '',
                            body:      body,
                            media:     mediaUrls,
                            image:     mediaUrls[0] || '',
                            // Editing keeps the ORIGINAL publish date so a text/typo
                            // fix doesn't bump the article back to the top of the
                            // public feed as if it were brand new.
                            createdAt: (isEditing && _editingArticleCreatedAt) ? _editingArticleCreatedAt : new Date().toISOString(),
                            publishedBy: (isEditing && _editingArticlePublishedBy) ? _editingArticlePublishedBy : ((window.userState && window.userState.id) || 'admin'),
                            displayAs: displayAs
                        };

                        /* Save to Firestore — write to news_posts so the real-time
                           listener in app-news.js propagates it to all devices and
                           also populates the dashboard strip via _newsCache.
                           Also archive a copy in news_articles for admin history. */
                        if (window._firebaseLoaded && window.fbDb) {
                            // FIX (2026-08-14, same edit-mode fix as above): was a bare
                            // .set(...) (full overwrite). On a first publish that's
                            // identical to merge:true since there's nothing to
                            // preserve — but on an EDIT save it would have wiped this
                            // doc's likes/views/commentCount back to whatever this
                            // payload doesn't mention (i.e. gone), since those fields
                            // are only ever written by separate engagement code paths,
                            // never by this form. merge:true keeps this write scoped to
                            // exactly the fields the admin can actually edit here.
                            await window.fbDb.collection('news_posts').doc(article.id).set({
                                id:          article.id,
                                title:       article.title,
                                content:     article.body,
                                writer:      article.writer,
                                category:    article.category,
                                summary:     article.summary,
                                pubdate:     article.pubdate,
                                mediaUrl:    article.image  || null,
                                mediaType:   (article.image && files[0]) ? (files[0].type || null) : null,
                                media:       article.media,
                                userId:      article.publishedBy,
                                // FIX: was (window.userState && window.userState.username) ||
                                // 'admin' — always the logged-in admin's own handle, never the
                                // writer typed into the required "Writer's Name" field above.
                                // app-news.js's public renderer shows this `username` field
                                // as-is (see its _buildNewsItem: n.username || 'Empyrean News'),
                                // so that's exactly why "admin" was showing regardless of who
                                // actually wrote the piece. Now driven by the Display Author As
                                // choice (defaults to the writer's name).
                                username:    displayName,
                                displayAs:   displayAs,
                                createdAt:   article.createdAt,
                                publishedBy: article.publishedBy
                            }, { merge: true });
                            /* Archive copy.
                               FIX (bug: "published article does not register in the news
                               log"): this write used to be fire-and-forget — not awaited,
                               and any failure silently swallowed by an empty .catch(). The
                               very next thing this handler does is call _refreshNewsTable()
                               (a few lines below), which queries THIS SAME news_articles
                               collection and then unconditionally replaces the whole table's
                               innerHTML with whatever that query returned. If the query
                               resolved before this write had actually reached the backend —
                               easy to hit on this app's already-documented weak-connection
                               conditions (see app-patch-v26/v31/v35's own notes on this same
                               device) — the just-published article was simply absent from
                               that query's results, and the optimistic row addNewsPost()
                               already inserted via _syncAdminTable() got wiped out along with
                               it by that same innerHTML replace. Net effect: the article
                               published fine (news_posts + the public feed were unaffected —
                               different collection, different code path) but never appeared
                               in the admin's own "Published Articles" log. Awaiting this
                               write closes that race: _refreshNewsTable() now can't run until
                               the archive doc is actually committed, so its query is
                               guaranteed to include it. A real failure now also surfaces in
                               the console (and no longer looks identical to "worked fine")
                               instead of vanishing silently. */
                            await window.fbDb.collection('news_articles').doc(article.id).set(article, { merge: true })
                                .catch(function(archErr) {
                                    console.warn('[AdminNews] Archive write to news_articles failed — article will not appear in the Published Articles log until this succeeds:', archErr && archErr.message);
                                });
                        }

                        /* Immediately inject into app-news.js cache so dashboard
                           strip and news section update even before Firestore fires */
                        if (typeof window.addNewsPost === 'function') {
                            window.addNewsPost({
                                id:        article.id,
                                title:     article.title,
                                content:   article.body,
                                mediaUrl:  article.image  || null,
                                mediaType: (article.image && files[0]) ? (files[0].type || null) : null,
                                // FIX (request — inline mid-article images /
                                // multi-picture gallery): this optimistic
                                // pre-Firestore cache entry was missing the
                                // full media array (only mediaUrl, the
                                // single cover shot, was ever passed) — so
                                // right after publishing, before the real
                                // news_posts onSnapshot delivers the full
                                // doc, the gallery/thumbnail strip and any
                                // [img:N] tokens beyond the first picture
                                // would briefly render as missing. The
                                // Firestore doc already carries this field
                                // (see the news_posts .set() call above);
                                // this just stops the optimistic copy from
                                // being incomplete for those few seconds.
                                media:     article.media,
                                userId:    article.publishedBy,
                                username:  displayName,
                                createdAt: article.createdAt
                            });
                        }

                        _feedbackNews(isEditing
                            ? ('✅ Article "' + title + '" updated successfully!')
                            : ('✅ Article "' + title + '" published successfully!'), 'success');
                        if (typeof window.showNotification === 'function') {
                            window.showNotification(isEditing ? '✅ Article updated!' : '✅ Article published!', 'success');
                        }

                        // FIX (2026-08-14, same edit-mode fix as above): was a plain
                        // form.reset() that cleared the FIELDS but left _editingArticleId
                        // set and the button still reading "Save Changes" — so the very
                        // next thing typed into the now-blank form would itself have been
                        // saved OVER the just-edited article on the next submit.
                        // _cancelEdit() resets the fields AND returns the form to normal
                        // create mode (clears _editingArticleId/_editingArticleMedia/etc.,
                        // restores the "Publish Article" button, hides Cancel Edit).
                        _cancelEdit();

                        /* Refresh the published articles table — now safe to run
                           immediately since the news_articles write above is awaited. */
                        _refreshNewsTable();

                    } catch(err) {
                        console.error('[AdminNews] Publish error:', err);
                        _feedbackNews('❌ Failed to publish: ' + (err.message || 'Please try again.'), 'error');
                    } finally {
                        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origText; }
                    }
                });

                /* Preview button */
                var previewBtn = document.getElementById('admin-news-preview-btn');
                if (previewBtn && !previewBtn._newsPreviewWired) {
                    previewBtn._newsPreviewWired = true;
                    previewBtn.addEventListener('click', function() {
                        var titleEl = document.getElementById('admin-news-title');
                        var bodyEl  = document.getElementById('admin-news-body');
                        var t = titleEl ? titleEl.value : '';
                        var b = bodyEl  ? bodyEl.value  : '';
                        if (!t && !b) { if (typeof window.showNotification === 'function') window.showNotification('Fill in title and body to preview.', 'warning'); return; }
                        var win = window.open('', '_blank', 'width=800,height=600');
                        if (win) {
                            win.document.write('<html><head><title>Preview: '+t+'</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.8;color:#222;}h1{font-size:2rem;}h2{font-size:1.4rem;}blockquote{border-left:4px solid #1B2B8B;margin:0;padding:0 20px;color:#555;}</style></head><body><h1>'+t+'</h1><hr><pre style="white-space:pre-wrap;font-family:inherit;">'+b+'</pre></body></html>');
                            win.document.close();
                        }
                    });
                }
            }

            /* Run wiring now and after admin tab switches */
            function _tryWire() {
                _wireToolbar();
                _wireNewsMediaInput();
                _wireNewsFormSubmit();
            }

            if (document.readyState !== 'loading') _tryWire();
            else document.addEventListener('DOMContentLoaded', _tryWire);
            document.addEventListener('empyrean-init-done', function() { setTimeout(_tryWire, 400); });

            /* Re-wire when admin publish tab is clicked */
            document.addEventListener('click', function(e) {
                var btn = e.target.closest && e.target.closest('[data-tab="admin-publish-tab"]');
                if (btn) { setTimeout(_tryWire, 200); setTimeout(_refreshNewsTable, 300); }
            });

            console.log('[Admin] ✅ News form wired — publish, preview, toolbar, media, and table.');
        }());


        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — USER MANAGEMENT
        // Wires the existing #admin-users-tab markup (search, results list,
        // detail panel, "All Registered Users" table). Supports:
        //   • Listing all users from Firestore `users` collection
        //   • Searching by Unique ID (uid), username, or email
        //   • Viewing a user's profile + their business page(s)
        //   • Deleting a user: removes their `users/{uid}` Firestore doc and
        //     any `business_pages` (+ associated `business_posts`) they own.
        //
        // NOTE: This removes the user's data/profile from the app entirely.
        // It does NOT delete their Firebase Authentication account (that
        // requires a server-side Admin SDK, which this app does not have) —
        // their login credentials remain, but they will have no profile and
        // will be treated as a new user on next login.
        // ═══════════════════════════════════════════════════════════════════
        (function initAdminUserManagement() {

            function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
            function _notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type); else console.log('[Admin]', msg); }

            var _allUsersCache = [];

            function _fmtDate(ts) {
                try {
                    if (!ts) return '—';
                    var d = ts.toDate ? ts.toDate() : new Date(ts);
                    if (isNaN(d.getTime())) return '—';
                    return d.toLocaleDateString();
                } catch (e) { return '—'; }
            }

            function _kycLabel(u) {
                var k = u.kycStatus || (u.kyc && u.kyc.status) || '';
                if (!k) return '<span style="color:#9CA3AF;">Not Submitted</span>';
                if (k === 'verified' || k === 'approved') return '<span style="color:#16A34A;font-weight:700;">Verified</span>';
                if (k === 'pending') return '<span style="color:#F59E0B;font-weight:700;">Pending</span>';
                if (k === 'rejected') return '<span style="color:#EF4444;font-weight:700;">Rejected</span>';
                return _esc(k);
            }

            function _statusLabel(u) {
                if (u.isAdmin) return '<span style="color:#1B2B8B;font-weight:700;"><i class="fas fa-user-shield"></i> Admin</span>';
                if (u.banned) return '<span style="color:#EF4444;font-weight:700;">Banned</span>';
                if (u.disabled || u.suspended) return '<span style="color:#F59E0B;font-weight:700;">Suspended</span>';
                return '<span style="color:#16A34A;font-weight:700;">Active</span>';
            }

            function _avatarHTML(u) {
                var av = u.avatar || u.profilePhoto || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(u.fullName || u.username || 'U') + '&background=1B2B8B&color=fff&size=64');
                return '<img src="' + _esc(av) + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=64\'">';
            }

            /* ── Render one row of the "All Registered Users" table ── */
            function _userRowHTML(u) {
                return '<tr data-uid="' + _esc(u.id) + '" style="border-bottom:1px solid rgba(10,14,39,0.06);">'
                    + '<td style="padding:10px 16px;font-size:0.8rem;font-family:monospace;color:#6B7280;">' + _esc(u.id) + '</td>'
                    + '<td style="padding:10px 16px;"><div style="display:flex;align-items:center;gap:8px;">' + _avatarHTML(u)
                        + '<div><div style="font-weight:700;font-size:0.85rem;color:#0A0E27;">' + _esc(u.fullName || u.username || 'Unnamed') + '</div>'
                        + '<div style="font-size:0.72rem;color:#9CA3AF;">@' + _esc(u.username || '—') + '</div></div></div></td>'
                    + '<td style="padding:10px 16px;font-size:0.82rem;color:#374151;">' + _esc(u.email || '—') + '</td>'
                    + '<td style="padding:10px 16px;font-size:0.82rem;color:#374151;">' + (Number(u.empyBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>'
                    + '<td style="padding:10px 16px;font-size:0.8rem;">' + _kycLabel(u) + '</td>'
                    + '<td style="padding:10px 16px;font-size:0.8rem;">' + _statusLabel(u) + '</td>'
                    + '<td style="padding:10px 16px;white-space:nowrap;">'
                        + '<button class="admin-user-view-btn" data-uid="' + _esc(u.id) + '" style="padding:6px 12px;border-radius:8px;background:rgba(27,43,139,0.08);color:#1B2B8B;border:1px solid rgba(27,43,139,0.18);font-size:0.76rem;font-weight:700;cursor:pointer;margin-right:6px;"><i class="fas fa-eye"></i> View</button>'
                        + '<button class="admin-user-delete-btn" data-uid="' + _esc(u.id) + '" style="padding:6px 12px;border-radius:8px;background:rgba(239,68,68,0.08);color:#EF4444;border:1px solid rgba(239,68,68,0.2);font-size:0.76rem;font-weight:700;cursor:pointer;"><i class="fas fa-trash"></i> Delete</button>'
                    + '</td></tr>';
            }

            function _renderAllUsersTable(list) {
                var tbody = document.getElementById('admin-all-users-table');
                var badge = document.getElementById('admin-total-users-badge');
                if (badge) badge.textContent = list.length + (list.length === 1 ? ' user' : ' users');
                if (!tbody) return;
                if (!list.length) {
                    tbody.innerHTML = '<tr><td colspan="7" style="padding:30px;text-align:center;color:#9CA3AF;font-size:0.88rem;">No users found.</td></tr>';
                    return;
                }
                tbody.innerHTML = list.map(_userRowHTML).join('');
            }

            function _loadAllUsers() {
                if (!fbDb) return Promise.resolve([]);
                var tbody = document.getElementById('admin-all-users-table');
                if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:30px;text-align:center;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> Loading users…</td></tr>';
                return fbDb.collection('users').limit(200).get().then(function (snap) {
                    var list = [];
                    snap.forEach(function (doc) {
                        var d = doc.data();
                        d.id = doc.id;
                        list.push(d);
                    });
                    _allUsersCache = list;
                    _renderAllUsersTable(list);
                    return list;
                }).catch(function (err) {
                    console.warn('[Admin Users] load failed:', err && err.message);
                    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="padding:30px;text-align:center;color:#EF4444;">Could not load users: ' + _esc(err && err.message) + '</td></tr>';
                    return [];
                });
            }

            /* ── Detail panel: shows full profile + business page(s) + delete action ── */
            function _showUserDetail(u) {
                var panel = document.getElementById('admin-user-detail-panel');
                var content = document.getElementById('admin-user-detail-content');
                if (!panel || !content) return;

                var html = ''
                    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px;">'
                    + '<div style="display:flex;align-items:center;gap:14px;">'
                    + '<img src="' + _esc(u.avatar || u.profilePhoto || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(u.fullName || u.username || 'U') + '&background=1B2B8B&color=fff&size=100')) + '" style="width:64px;height:64px;border-radius:50%;object-fit:cover;" onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=100\'">'
                    + '<div><h3 style="margin:0 0 2px;font-size:1.05rem;font-weight:900;color:#0A0E27;">' + _esc(u.fullName || u.username || 'Unnamed User') + '</h3>'
                    + '<div style="font-size:0.8rem;color:#6B7280;">@' + _esc(u.username || '—') + ' &middot; ' + _esc(u.email || '—') + '</div>'
                    + '<div style="font-size:0.74rem;color:#9CA3AF;margin-top:2px;font-family:monospace;">UID: ' + _esc(u.id) + '</div></div>'
                    + '</div>'
                    + '<button id="admin-user-detail-close" style="background:rgba(10,14,39,0.07);border:none;width:32px;height:32px;border-radius:50%;font-size:0.95rem;cursor:pointer;color:#6B7280;"><i class="fas fa-times"></i></button>'
                    + '</div>'
                    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">'
                    + '<div style="background:rgba(27,43,139,0.05);border-radius:12px;padding:12px;"><div style="font-size:0.7rem;color:#6B7280;text-transform:uppercase;font-weight:700;">EMPY Balance</div><div style="font-size:1.05rem;font-weight:800;color:#0A0E27;">' + (Number(u.empyBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</div></div>'
                    + '<div style="background:rgba(27,43,139,0.05);border-radius:12px;padding:12px;"><div style="font-size:0.7rem;color:#6B7280;text-transform:uppercase;font-weight:700;">KYC Status</div><div style="font-size:0.92rem;font-weight:800;margin-top:2px;">' + _kycLabel(u) + '</div></div>'
                    + '<div style="background:rgba(27,43,139,0.05);border-radius:12px;padding:12px;"><div style="font-size:0.7rem;color:#6B7280;text-transform:uppercase;font-weight:700;">Account Status</div><div style="font-size:0.92rem;font-weight:800;margin-top:2px;">' + _statusLabel(u) + '</div></div>'
                    + '<div style="background:rgba(27,43,139,0.05);border-radius:12px;padding:12px;"><div style="font-size:0.7rem;color:#6B7280;text-transform:uppercase;font-weight:700;">Joined</div><div style="font-size:0.92rem;font-weight:800;color:#0A0E27;">' + _fmtDate(u.createdAt) + '</div></div>'
                    + '</div>'
                    + '<div id="admin-user-biz-pages" style="margin-bottom:16px;"><div style="font-size:0.78rem;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Business Page(s)</div><div style="color:#9CA3AF;font-size:0.85rem;"><i class="fas fa-spinner fa-spin"></i> Checking…</div></div>'
                    + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">'
                    + (u.banned
                        ? '<button id="admin-user-reactivate-btn" data-uid="' + _esc(u.id) + '" style="flex:1;min-width:150px;padding:12px;border-radius:14px;background:rgba(22,163,74,0.08);color:#16A34A;border:2px solid rgba(22,163,74,0.25);font-weight:800;font-size:0.85rem;cursor:pointer;"><i class="fas fa-user-check" style="margin-right:7px;"></i>Reactivate Account</button>'
                        : (u.suspended
                            ? '<button id="admin-user-reactivate-btn" data-uid="' + _esc(u.id) + '" style="flex:1;min-width:150px;padding:12px;border-radius:14px;background:rgba(22,163,74,0.08);color:#16A34A;border:2px solid rgba(22,163,74,0.25);font-weight:800;font-size:0.85rem;cursor:pointer;"><i class="fas fa-user-check" style="margin-right:7px;"></i>Lift Suspension</button>'
                            : '<button id="admin-user-suspend-btn" data-uid="' + _esc(u.id) + '" style="flex:1;min-width:150px;padding:12px;border-radius:14px;background:rgba(245,158,11,0.08);color:#B45309;border:2px solid rgba(245,158,11,0.25);font-weight:800;font-size:0.85rem;cursor:pointer;"><i class="fas fa-user-clock" style="margin-right:7px;"></i>Suspend Account</button>')
                      )
                    + (u.banned ? '' : '<button id="admin-user-ban-btn" data-uid="' + _esc(u.id) + '" style="flex:1;min-width:150px;padding:12px;border-radius:14px;background:rgba(239,68,68,0.08);color:#EF4444;border:2px solid rgba(239,68,68,0.25);font-weight:800;font-size:0.85rem;cursor:pointer;"><i class="fas fa-ban" style="margin-right:7px;"></i>Ban User</button>')
                    + '</div>'
                    + '<button id="admin-user-delete-detail-btn" data-uid="' + _esc(u.id) + '" style="width:100%;padding:13px;border-radius:14px;background:rgba(239,68,68,0.08);color:#EF4444;border:2px solid rgba(239,68,68,0.25);font-weight:800;font-size:0.9rem;cursor:pointer;"><i class="fas fa-user-times" style="margin-right:7px;"></i>Delete This User</button>';

                content.innerHTML = html;
                panel.style.display = 'block';
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                document.getElementById('admin-user-detail-close').addEventListener('click', function () {
                    panel.style.display = 'none';
                });

                /* Load this user's business page(s) */
                var bizContainer = document.getElementById('admin-user-biz-pages').querySelector('div:last-child');
                if (fbDb) {
                    fbDb.collection('business_pages').where('ownerId', '==', u.id).get().then(function (snap) {
                        if (snap.empty) { bizContainer.innerHTML = '<div style="color:#9CA3AF;font-size:0.85rem;">No business page.</div>'; return; }
                        var rows = [];
                        snap.forEach(function (doc) {
                            var b = doc.data(); b.id = doc.id;
                            rows.push('<div style="display:flex;align-items:center;justify-content:between;gap:10px;padding:10px 12px;border:1px solid rgba(10,14,39,0.08);border-radius:10px;margin-bottom:6px;">'
                                + '<div style="flex:1;min-width:0;"><strong style="font-size:0.85rem;color:#0A0E27;">' + _esc(b.name || b.businessName || 'Business') + '</strong>'
                                + '<div style="font-size:0.72rem;color:#9CA3AF;font-family:monospace;">' + _esc(b.id) + '</div></div>'
                                + '<button class="admin-bizpage-delete-btn" data-bizid="' + _esc(b.id) + '" style="padding:5px 10px;border-radius:8px;background:rgba(239,68,68,0.08);color:#EF4444;border:1px solid rgba(239,68,68,0.2);font-size:0.74rem;font-weight:700;cursor:pointer;"><i class="fas fa-trash"></i> Delete Page</button>'
                                + '</div>');
                        });
                        bizContainer.innerHTML = rows.join('');
                        bizContainer.querySelectorAll('.admin-bizpage-delete-btn').forEach(function (btn) {
                            btn.addEventListener('click', function () { _deleteBusinessPage(btn.dataset.bizid, btn); });
                        });
                    }).catch(function () {
                        bizContainer.innerHTML = '<div style="color:#9CA3AF;font-size:0.85rem;">Could not check business pages.</div>';
                    });
                } else {
                    bizContainer.innerHTML = '<div style="color:#9CA3AF;font-size:0.85rem;">Not connected.</div>';
                }

                document.getElementById('admin-user-delete-detail-btn').addEventListener('click', function () {
                    _deleteUser(u.id, this, function () { panel.style.display = 'none'; });
                });

                function _runModerationAction(btn, action, confirmMsg) {
                    if (typeof window._empGovModerateUser !== 'function') {
                        _notify('Moderation module not loaded yet — please try again in a moment.', 'error');
                        return;
                    }
                    if (!btn._confirming) {
                        btn._confirming = true;
                        var original = btn.innerHTML;
                        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Confirm — ' + confirmMsg;
                        setTimeout(function () { btn._confirming = false; btn.innerHTML = original; }, 4000);
                        return;
                    }
                    btn._confirming = false;
                    btn.disabled = true;
                    window._empGovModerateUser(u.id, action).then(function () {
                        _notify('Account updated.', 'success');
                        panel.style.display = 'none';
                        _loadAllUsers();
                    }).catch(function (err) {
                        _notify('Could not update this account: ' + (err && err.message || 'unknown error'), 'error');
                        btn.disabled = false;
                    });
                }

                var suspendBtn = document.getElementById('admin-user-suspend-btn');
                if (suspendBtn) suspendBtn.addEventListener('click', function () { _runModerationAction(this, 'suspend', 'Suspend?'); });

                var banBtn = document.getElementById('admin-user-ban-btn');
                if (banBtn) banBtn.addEventListener('click', function () { _runModerationAction(this, 'ban', 'Ban?'); });

                var reactivateBtn = document.getElementById('admin-user-reactivate-btn');
                if (reactivateBtn) reactivateBtn.addEventListener('click', function () { _runModerationAction(this, 'reactivate', 'Reactivate?'); });
            }

            /* ── Delete a business page (+ its posts) ── */
            function _deleteBusinessPage(bizId, btn) {
                if (!bizId) return;
                if (!btn._confirming) {
                    btn._confirming = true;
                    btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Confirm';
                    setTimeout(function () { btn._confirming = false; btn.innerHTML = '<i class="fas fa-trash"></i> Delete Page'; }, 4000);
                    return;
                }
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';
                if (!fbDb) { _notify('Not connected.', 'error'); return; }
                fbDb.collection('business_posts').where('pageId', '==', bizId).get()
                    .then(function (snap) {
                        var dels = [];
                        snap.forEach(function (doc) { dels.push(doc.ref.delete().catch(function () {})); });
                        return Promise.all(dels);
                    })
                    .then(function () { return fbDb.collection('business_pages').doc(bizId).delete(); })
                    .then(function () {
                        _notify('Business page deleted.', 'success');
                        var row = btn.closest('div');
                        if (row && row.parentNode) row.parentNode.removeChild(row);
                        /* Remove from dashboard if present */
                        document.querySelectorAll('[data-biz-id="' + bizId + '"],[data-page-id="' + bizId + '"]').forEach(function (c) { c.remove(); });
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-trash"></i> Delete Page';
                        _notify('Failed to delete page: ' + (err && err.message ? err.message : 'Please try again.'), 'error');
                    });
            }

            /* ── Delete a user's Firestore profile + their business page(s)/post(s) ──
               Does NOT remove their Firebase Auth credentials (requires Admin SDK). */
            function _deleteUser(uid, btn, onDone) {
                if (!uid) return;
                if (!btn._confirming) {
                    btn._confirming = true;
                    btn.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:7px;"></i>Tap again to permanently delete this user';
                    setTimeout(function () {
                        if (btn._confirming) {
                            btn._confirming = false;
                            btn.innerHTML = btn.dataset.origLabel || '<i class="fas fa-trash"></i> Delete';
                        }
                    }, 4000);
                    if (!btn.dataset.origLabel) btn.dataset.origLabel = btn.innerHTML;
                    return;
                }
                if (!fbDb) { _notify('Not connected.', 'error'); return; }
                btn._confirming = false;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:7px;"></i>Deleting…';

                /* 1. Find + delete this user's business pages and their posts */
                fbDb.collection('business_pages').where('ownerId', '==', uid).get()
                    .then(function (pagesSnap) {
                        var pageDeletes = [];
                        pagesSnap.forEach(function (pageDoc) {
                            var pid = pageDoc.id;
                            pageDeletes.push(
                                fbDb.collection('business_posts').where('pageId', '==', pid).get().then(function (postsSnap) {
                                    var postDels = [];
                                    postsSnap.forEach(function (pd) { postDels.push(pd.ref.delete().catch(function () {})); });
                                    return Promise.all(postDels);
                                }).then(function () { return pageDoc.ref.delete().catch(function () {}); })
                            );
                        });
                        return Promise.all(pageDeletes);
                    })
                    /* 2. Delete the user's own posts in business_posts (authored, even if pageless) */
                    .then(function () {
                        return fbDb.collection('business_posts').where('userId', '==', uid).get().then(function (snap) {
                            var dels = [];
                            snap.forEach(function (doc) { dels.push(doc.ref.delete().catch(function () {})); });
                            return Promise.all(dels);
                        });
                    })
                    /* 3. Delete the user's Firestore profile */
                    .then(function () { return fbDb.collection('users').doc(uid).delete(); })
                    .then(function () {
                        _notify('User deleted from the platform.', 'success');
                        _allUsersCache = _allUsersCache.filter(function (u) { return u.id !== uid; });
                        _renderAllUsersTable(_allUsersCache);
                        var row = document.querySelector('#admin-all-users-table tr[data-uid="' + uid + '"]');
                        if (row) row.remove();
                        if (typeof onDone === 'function') onDone();
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        btn.innerHTML = btn.dataset.origLabel || '<i class="fas fa-trash"></i> Delete';
                        _notify('Failed to delete user: ' + (err && err.message ? err.message : 'Please try again.'), 'error');
                    });
            }

            /* ── Search ── */
            function _runSearch() {
                var input = document.getElementById('admin-user-search-input');
                var typeSel = document.getElementById('admin-user-search-type');
                var resultsEl = document.getElementById('admin-user-search-results');
                if (!input || !resultsEl) return;
                var q = (input.value || '').trim();
                var type = typeSel ? typeSel.value : 'all';
                if (!q) { resultsEl.innerHTML = ''; return; }
                resultsEl.innerHTML = '<div style="padding:14px;text-align:center;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> Searching…</div>';

                var qLower = q.toLowerCase();
                function _matches(u) {
                    if (type === 'id' || type === 'all') { if ((u.id || '').toLowerCase() === qLower || (u.id || '').toLowerCase().indexOf(qLower) > -1) return true; }
                    if (type === 'username' || type === 'all') { if ((u.username || '').toLowerCase().indexOf(qLower.replace(/^@/, '')) > -1) return true; }
                    if (type === 'email' || type === 'all') { if ((u.email || '').toLowerCase().indexOf(qLower) > -1) return true; }
                    return false;
                }

                function _renderMatches(list) {
                    var matches = list.filter(_matches);
                    if (!matches.length) {
                        resultsEl.innerHTML = '<div style="padding:14px;text-align:center;color:#9CA3AF;font-size:0.88rem;">No users found matching "' + _esc(q) + '".</div>';
                        return;
                    }
                    resultsEl.innerHTML = matches.map(function (u) {
                        return '<div class="admin-user-result-item" data-uid="' + _esc(u.id) + '" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(10,14,39,0.08);border-radius:12px;margin-bottom:8px;cursor:pointer;">'
                            + _avatarHTML(u)
                            + '<div style="flex:1;min-width:0;"><div style="font-weight:700;font-size:0.88rem;color:#0A0E27;">' + _esc(u.fullName || u.username || 'Unnamed') + '</div>'
                            + '<div style="font-size:0.76rem;color:#9CA3AF;">' + _esc(u.email || '') + ' &middot; ' + _esc(u.id) + '</div></div>'
                            + '<i class="fas fa-chevron-right" style="color:#bbb;"></i></div>';
                    }).join('');
                    resultsEl.querySelectorAll('.admin-user-result-item').forEach(function (item) {
                        item.addEventListener('click', function () {
                            var u = _allUsersCache.find(function (x) { return x.id === item.dataset.uid; });
                            if (u) _showUserDetail(u);
                        });
                    });
                }

                if (_allUsersCache.length) {
                    _renderMatches(_allUsersCache);
                } else {
                    _loadAllUsers().then(_renderMatches);
                }
            }

            /* ── Wire everything ── */
            function _wire() {
                var searchBtn = document.getElementById('admin-user-search-btn');
                var searchInput = document.getElementById('admin-user-search-input');
                if (searchBtn && !searchBtn._wired) {
                    searchBtn._wired = true;
                    searchBtn.addEventListener('click', _runSearch);
                }
                if (searchInput && !searchInput._wired) {
                    searchInput._wired = true;
                    searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') _runSearch(); });
                }

                /* Delegate clicks on the All Users table (View / Delete buttons) */
                var table = document.getElementById('admin-all-users-table');
                if (table && !table._wired) {
                    table._wired = true;
                    table.addEventListener('click', function (e) {
                        var viewBtn = e.target.closest('.admin-user-view-btn');
                        if (viewBtn) {
                            var u = _allUsersCache.find(function (x) { return x.id === viewBtn.dataset.uid; });
                            if (u) _showUserDetail(u);
                            return;
                        }
                        var delBtn = e.target.closest('.admin-user-delete-btn');
                        if (delBtn) { _deleteUser(delBtn.dataset.uid, delBtn); }
                    });
                }

                /* Load users when the Users tab is opened */
                document.addEventListener('click', function (e) {
                    var tabBtn = e.target.closest && e.target.closest('[data-tab="admin-users-tab"]');
                    if (tabBtn) setTimeout(_loadAllUsers, 150);
                });
            }

            if (document.readyState !== 'loading') _wire();
            else document.addEventListener('DOMContentLoaded', _wire);
            document.addEventListener('empyrean-init-done', function () { setTimeout(_wire, 400); });

            console.log('[Admin] ✅ User Management — search, list, view detail, delete user (+ business pages/posts).');
        }());


        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — URGENT SAFETY REPORTS (child safety / CSAE)
        // Self-contained card injected into #admin-users-tab, same pattern as
        // the Business Page Manager card just above. Surfaces
        // moderation_flags docs with severity:'urgent' — written by
        // app-reel.js's _submitReelReport() and app-marketplace-
        // governance.js's _submitReport() whenever a user picks "Child
        // sexual abuse or exploitation" as their report reason (see both
        // files' own comments at their moderation_flags.add() call), plus
        // app-fixes.js's pre-existing auto-moderation writer for explicit
        // content. Nothing previously read this collection back — these
        // reports were being written but never shown to anyone. Real-time
        // (onSnapshot), so a new urgent report appears here the moment it's
        // filed, no manual refresh needed.
        // ═══════════════════════════════════════════════════════════════════
        (function initAdminUrgentSafetyReports() {

            function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
            function _notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type); else console.log('[Admin]', msg); }
            function _fmtWhen(v) {
                try {
                    var d = v && v.toDate ? v.toDate() : new Date(v);
                    if (isNaN(d.getTime())) return '—';
                    return d.toLocaleString();
                } catch (e) { return '—'; }
            }

            /* Walks an arbitrary Firestore doc's data recursively and
               collects every URL that points at one of this app's own
               media hosts (Cloudinary or Firebase/GCS Storage — same
               ALLOWED_HOSTS media-download-routes.js's proxy already
               trusts). Generic on purpose: reel/listing/business-page/
               business-post docs each use different field names for their
               media (videoUrl, images[], coverPhoto, media[], etc.) — this
               finds them all without needing to hardcode every collection's
               schema, the same approach migrate-once.js's own
               _collectCloudinaryUrls already takes for its Cloudinary-only
               case. */
            function _extractMediaUrls(value, into) {
                if (typeof value === 'string') {
                    if (/^https:\/\/(res\.cloudinary\.com|firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(value)) into.add(value);
                    return;
                }
                if (Array.isArray(value)) { value.forEach(function (v) { _extractMediaUrls(v, into); }); return; }
                if (value && typeof value === 'object') {
                    for (var k in value) { if (Object.prototype.hasOwnProperty.call(value, k)) _extractMediaUrls(value[k], into); }
                }
            }

            /* Best-effort call to server.js's new admin-only
               POST /api/media/purge (media-download-routes.js) — actually
               deletes the underlying file(s) from Cloudinary/Storage, not
               just the Firestore doc referencing them. Never throws: a
               purge failure (e.g. CLOUDINARY_API_KEY not yet configured —
               see render.yaml's own note) shouldn't undo or block the
               content takedown that already succeeded by the time this
               runs. */
            function _purgeMediaUrls(urls) {
                if (!urls || !urls.length) return Promise.resolve();
                if (!window.fbAuth || !window.fbAuth.currentUser || typeof window._empApiBase !== 'function') return Promise.resolve();
                return window.fbAuth.currentUser.getIdToken().then(function (token) {
                    return fetch(window._empApiBase() + '/api/media/purge', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ urls: urls.slice(0, 100) })
                    });
                }).catch(function (err) {
                    console.warn('[Admin] media purge call failed (content doc was already deleted — this cleanup step is best-effort):', err && err.message);
                });
            }

            var _unsub = null;

            function _injectCard() {
                if (document.getElementById('admin-urgent-safety-card')) return true;
                var tab = document.getElementById('admin-users-tab');
                if (!tab) return false;

                var card = document.createElement('div');
                card.className = 'card';
                card.id = 'admin-urgent-safety-card';
                card.style.cssText = 'margin-bottom:20px;border:1.5px solid rgba(239,68,68,0.35);';
                card.innerHTML =
                    '<h3 style="padding:20px 24px 0;display:flex;align-items:center;gap:10px;">'
                    + '<span style="background:#EF4444;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-shield-halved" style="color:#fff;font-size:0.9rem;"></i></span>'
                    + '<span>Urgent Safety Reports</span>'
                    + '<span id="admin-urgent-safety-badge" style="font-size:0.78rem;background:rgba(239,68,68,0.12);color:#EF4444;padding:3px 10px;border-radius:12px;margin-left:8px;font-weight:800;">0</span>'
                    + '</h3>'
                    + '<div class="card-content">'
                    + '<p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">Reports flagged "Child sexual abuse or exploitation" from any Report menu across the app (reels, marketplace) — reviewed here first, ahead of the normal report queues.</p>'
                    + '<div id="admin-urgent-safety-list"><div style="padding:20px;text-align:center;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> Loading…</div></div>'
                    + '</div>';

                tab.insertBefore(card, tab.firstChild);
                return true;
            }

            function _rowHTML(doc) {
                var d = doc.data();
                var contentBtn = '';
                if (d.type === 'reel') {
                    contentBtn = '<button class="admin-urgent-safety-remove-btn" data-id="' + _esc(doc.id) + '" data-type="reel" data-content-id="' + _esc(d.reelId || '') + '" style="padding:8px 14px;border-radius:10px;background:rgba(239,68,68,0.08);color:#EF4444;border:1.5px solid rgba(239,68,68,0.3);font-size:0.8rem;font-weight:800;cursor:pointer;"><i class="fas fa-trash"></i> Remove Content</button>';
                } else if (d.type === 'listing') {
                    contentBtn = '<button class="admin-urgent-safety-remove-btn" data-id="' + _esc(doc.id) + '" data-type="listing" data-content-id="' + _esc(d.targetId || '') + '" style="padding:8px 14px;border-radius:10px;background:rgba(239,68,68,0.08);color:#EF4444;border:1.5px solid rgba(239,68,68,0.3);font-size:0.8rem;font-weight:800;cursor:pointer;"><i class="fas fa-trash"></i> Remove Content</button>';
                } else if (d.type === 'seller') {
                    /* A seller-profile report has no single content doc to
                       delete — reuses app-marketplace-governance.js's own
                       window._empGovModerateUser('ban'), the exact same
                       function/effect (bans the account, cascades to
                       delisting every active listing they own) as the
                       "Ban Seller" button on its own Reports queue. */
                    contentBtn = '<button class="admin-urgent-safety-remove-btn" data-id="' + _esc(doc.id) + '" data-type="seller" data-content-id="' + _esc(d.targetId || d.sellerId || '') + '" style="padding:8px 14px;border-radius:10px;background:rgba(239,68,68,0.08);color:#EF4444;border:1.5px solid rgba(239,68,68,0.3);font-size:0.8rem;font-weight:800;cursor:pointer;"><i class="fas fa-user-slash"></i> Ban Seller</button>';
                }
                return '<div class="admin-urgent-safety-row" data-id="' + _esc(doc.id) + '" style="padding:14px;border:1.5px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.03);border-radius:14px;margin-bottom:10px;">'
                    + '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">'
                        + '<div style="font-weight:800;font-size:0.88rem;color:#0A0E27;text-transform:capitalize;">' + _esc(d.type || 'content') + ' report</div>'
                        + '<div style="font-size:0.76rem;color:#9CA3AF;">' + _esc(_fmtWhen(d.flaggedAt)) + '</div>'
                    + '</div>'
                    + '<div style="font-size:0.82rem;color:#374151;margin-top:6px;">' + _esc(d.reason || 'Unspecified') + '</div>'
                    + '<div style="font-size:0.76rem;color:#9CA3AF;margin-top:4px;">Target ID: <span style="font-family:monospace;">' + _esc(d.reelId || d.targetId || '—') + '</span>'
                        + (d.sellerId ? ' &middot; Seller: <span style="font-family:monospace;">' + _esc(d.sellerId) + '</span>' : '')
                    + '</div>'
                    + '<div style="font-size:0.76rem;color:#9CA3AF;">Reported by: <span style="font-family:monospace;">' + _esc(d.reporterId || 'unknown') + '</span></div>'
                    + '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">'
                        + '<button class="admin-urgent-safety-reviewed-btn" data-id="' + _esc(doc.id) + '" style="padding:8px 14px;border-radius:10px;background:#EF4444;color:#fff;border:none;font-size:0.8rem;font-weight:800;cursor:pointer;"><i class="fas fa-check"></i> Mark Reviewed</button>'
                        + contentBtn
                    + '</div>'
                    + '</div>';
            }

            /* Marks the moderation_flags doc reviewed with an audit trail of
               WHAT was done (kept separate from the plain "Mark Reviewed"
               button's write above only by the extra `action` field, so
               existing readers of `reviewed` keep working unchanged). */
            function _markReviewed(flagId, action) {
                if (!fbDb || !flagId) return Promise.reject(new Error('Not connected'));
                var us = (window.userState || {});
                return fbDb.collection('moderation_flags').doc(flagId).set({
                    reviewed: true,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: us.id || 'admin',
                    action: action || 'reviewed_only'
                }, { merge: true });
            }

            /* ── Remove the reported content itself (or ban the seller for
               a seller-type report), then mark the flag reviewed. Same
               tap-to-confirm pattern as the Business Page Manager's own
               _deletePage above — one tap arms it, a second tap within 4s
               actually deletes, so a stray tap can't remove content by
               accident. Hard delete (not the softer "Delist Listing" the
               ordinary marketplace Reports queue offers) — appropriate for
               a report already confirmed urgent enough to reach this
               panel. */
            function _removeContent(btn) {
                var type = btn.dataset.type;
                var contentId = btn.dataset.contentId;
                var flagId = btn.dataset.id;

                if (!btn._confirming) {
                    btn._confirming = true;
                    var label = type === 'seller' ? 'Tap again to ban' : 'Tap again to delete';
                    btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ' + label;
                    setTimeout(function () {
                        if (btn._confirming) {
                            btn._confirming = false;
                            btn.innerHTML = type === 'seller'
                                ? '<i class="fas fa-user-slash"></i> Ban Seller'
                                : '<i class="fas fa-trash"></i> Remove Content';
                        }
                    }, 4000);
                    return;
                }
                if (!fbDb || !contentId) { _notify('Missing content reference — cannot proceed.', 'error'); return; }
                btn._confirming = false;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

                var collectionName = type === 'reel' ? 'reels' : (type === 'listing' ? 'marketplace_listings' : null);
                var work;

                if (collectionName) {
                    /* Read the doc FIRST (before deleting it) so its media
                       URLs are still available to purge afterwards — once
                       the doc is gone, so is the only record of which
                       file(s) it pointed at. */
                    var docRef = fbDb.collection(collectionName).doc(contentId);
                    work = docRef.get().then(function (snap) {
                        var mediaUrls = new Set();
                        if (snap.exists) _extractMediaUrls(snap.data(), mediaUrls);
                        return docRef.delete().then(function () {
                            /* Best-effort, doesn't block/fail the takedown
                               that already succeeded above. */
                            return _purgeMediaUrls(Array.from(mediaUrls));
                        });
                    });
                } else if (type === 'seller') {
                    if (typeof window._empGovModerateUser !== 'function') {
                        _notify('Seller moderation isn\u2019t available right now — try again once the page finishes loading.', 'error');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-user-slash"></i> Ban Seller';
                        return;
                    }
                    work = window._empGovModerateUser(contentId, 'ban');
                } else {
                    _notify('Unknown report type — nothing to remove.', 'error');
                    btn.disabled = false;
                    return;
                }

                work.then(function () {
                    return _markReviewed(flagId, type === 'seller' ? 'seller_banned' : 'content_removed');
                }).then(function () {
                    _notify(type === 'seller' ? 'Seller banned.' : 'Content removed.', 'success');
                }).catch(function (err) {
                    btn.disabled = false;
                    btn.innerHTML = type === 'seller' ? '<i class="fas fa-user-slash"></i> Ban Seller' : '<i class="fas fa-trash"></i> Remove Content';
                    _notify('Could not complete this action: ' + (err && err.message ? err.message : 'please try again.'), 'error');
                });
            }

            function _renderList(docs) {
                var container = document.getElementById('admin-urgent-safety-list');
                var badge = document.getElementById('admin-urgent-safety-badge');
                if (badge) badge.textContent = String(docs.length);
                if (!container) return;
                if (!docs.length) {
                    container.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.86rem;"><i class="fas fa-circle-check" style="color:#22c55e;margin-right:6px;"></i>No open urgent reports.</div>';
                    return;
                }
                container.innerHTML = docs.map(_rowHTML).join('');
                container.querySelectorAll('.admin-urgent-safety-reviewed-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var id = btn.dataset.id;
                        if (!fbDb || !id) return;
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        _markReviewed(id, 'reviewed_only').then(function () {
                            _notify('Marked reviewed.', 'success');
                        }).catch(function (err) {
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fas fa-check"></i> Mark Reviewed';
                            _notify('Could not update: ' + (err && err.message ? err.message : 'please try again.'), 'error');
                        });
                    });
                });
                container.querySelectorAll('.admin-urgent-safety-remove-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () { _removeContent(btn); });
                });
            }

            function _startListener() {
                if (_unsub || !fbDb) return;
                /* No orderBy — avoids requiring a composite index just for

                   this one admin-only panel; sorted client-side instead,
                   which is plenty for a queue capped at 50 open items. */
                _unsub = fbDb.collection('moderation_flags')
                    .where('severity', '==', 'urgent')
                    .limit(50)
                    .onSnapshot(function (snap) {
                        var docs = [];
                        snap.forEach(function (doc) {
                            var d = doc.data();
                            if (!d.reviewed) docs.push(doc);
                        });
                        docs.sort(function (a, b) {
                            var av = a.data().flaggedAt || '', bv = b.data().flaggedAt || '';
                            return av < bv ? 1 : (av > bv ? -1 : 0);
                        });
                        _renderList(docs);
                    }, function (err) {
                        console.warn('[Admin] urgent safety reports listener error:', err && err.message);
                    });
            }

            function _boot() {
                if (!_injectCard()) return;
                _startListener();
            }

            document.addEventListener('empyrean-section-change', function (e) {
                if (e && e.detail && e.detail.section === 'admin') setTimeout(_boot, 300);
            });
            setTimeout(_boot, 1500);

            console.log('[Admin] ✅ Urgent Safety Reports panel wired — surfaces moderation_flags where severity:"urgent" in real time.');
        }());

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — LIVE POLLS
        // Self-contained card injected into #admin-users-tab, same pattern as
        // the Urgent Safety Reports / Business Page Manager cards. Lets an
        // admin raise a poll ticket (question + multiple-choice options,
        // tagged by topic) and see live results (click-to-vote progress bars,
        // percentages, total count) update in real time as participants vote
        // — participant voting itself is app-feed.js's job (the widget
        // injected above the community feed); this panel is create/monitor/
        // close/export only.
        //
        // Firestore model:
        //   polls/{id}: { question, topic, options:[{id,text,votes}],
        //                 totalVotes, status:'open'|'closed', createdBy,
        //                 createdByName, createdAt, closedAt }
        //   polls/{id}/voters/{voterId}: { optionId, votedAt, method }
        //
        // Vote integrity is enforced at the two places that actually cast a
        // vote (app-feed.js's client-side Firestore transaction for signed-in
        // voters; server.js's new POST /api/polls/:id/vote-guest, IP-gated,
        // for guests) — this panel only ever READS poll docs and flips
        // status, so it needs no vote-integrity logic of its own.
        // ═══════════════════════════════════════════════════════════════════
        (function initAdminLivePolls() {

            var TOPICS = ['politics', 'music', 'medicine', 'science', 'epidemic', 'disaster', 'general'];
            var BAR_COLORS = ['#00D4AA', '#3B82F6', '#C9A66B', '#8B5CF6', '#ef4444', '#f97316', '#22c55e', '#eab308'];

            function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
            function _notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type); else console.log('[Admin]', msg); }
            function _pct(n, total) { return total > 0 ? Math.round((n / total) * 1000) / 10 : 0; }

            var _pollsUnsub = null;

            function _injectCard() {
                if (document.getElementById('admin-live-polls-card')) return true;
                var tab = document.getElementById('admin-users-tab');
                if (!tab) return false;

                var card = document.createElement('div');
                card.className = 'card';
                card.id = 'admin-live-polls-card';
                card.style.cssText = 'margin-bottom:20px;';
                card.innerHTML =
                    '<h3 style="padding:20px 24px 0;display:flex;align-items:center;gap:10px;">'
                    + '<span style="background:var(--nav-accent,#00D4AA);width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-square-poll-vertical" style="color:#fff;font-size:0.9rem;"></i></span>'
                    + '<span>Live Polls</span>'
                    + '</h3>'
                    + '<div class="card-content">'
                    + '<p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">Raise a poll ticket with a question and multiple-choice options. Participants click an option to vote; results update live below as votes come in.</p>'
                    + '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;padding:14px;border:1px solid rgba(10,14,39,0.1);border-radius:12px;background:rgba(10,14,39,0.02);">'
                    + '<input type="text" id="admin-poll-question-input" placeholder="Poll question, e.g. What\u2019s the most pressing issue today?" style="padding:10px 12px;border-radius:8px;border:1px solid rgba(10,14,39,0.15);font-size:0.88rem;">'
                    + '<select id="admin-poll-topic-select" style="padding:10px 12px;border-radius:8px;border:1px solid rgba(10,14,39,0.15);font-size:0.88rem;">'
                    + TOPICS.map(function (t) { return '<option value="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>'; }).join('')
                    + '</select>'
                    + '<div id="admin-poll-options-inputs" style="display:flex;flex-direction:column;gap:6px;"></div>'
                    + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
                    + '<button class="btn btn-small" id="admin-poll-add-option-btn" type="button"><i class="fas fa-plus"></i> Add option</button>'
                    + '<button class="btn btn-small btn-accent" id="admin-poll-create-btn" type="button"><i class="fas fa-bullhorn"></i> Raise Poll Ticket</button>'
                    + '</div>'
                    + '</div>'
                    + '<div id="admin-live-polls-list"><div style="padding:20px;text-align:center;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> Loading…</div></div>'
                    + '</div>';

                tab.insertBefore(card, tab.firstChild);
                _wireCreateForm();
                return true;
            }

            function _wireCreateForm() {
                var optWrap = document.getElementById('admin-poll-options-inputs');
                if (!optWrap || optWrap._pollsWired) return;
                optWrap._pollsWired = true;

                function addOptionInput(value) {
                    var row = document.createElement('input');
                    row.type = 'text';
                    row.className = 'admin-poll-opt-input';
                    row.placeholder = 'Option ' + (optWrap.children.length + 1);
                    row.value = value || '';
                    row.style.cssText = 'padding:9px 12px;border-radius:8px;border:1px solid rgba(10,14,39,0.15);font-size:0.85rem;';
                    optWrap.appendChild(row);
                }
                addOptionInput(); addOptionInput(); addOptionInput(); addOptionInput();

                document.getElementById('admin-poll-add-option-btn').addEventListener('click', function () { addOptionInput(); });

                document.getElementById('admin-poll-create-btn').addEventListener('click', function () {
                    var btn = this;
                    if (!fbDb) { _notify('Not connected to the database — please refresh and try again.', 'error'); return; }

                    var question = (document.getElementById('admin-poll-question-input').value || '').trim();
                    var topic = document.getElementById('admin-poll-topic-select').value;
                    var opts = Array.prototype.map.call(optWrap.querySelectorAll('.admin-poll-opt-input'), function (i) { return (i.value || '').trim(); })
                        .filter(Boolean);

                    if (!question) { _notify('Enter a poll question first.', 'error'); return; }
                    if (opts.length < 2) { _notify('Add at least two options.', 'error'); return; }

                    var options = opts.map(function (text, i) { return { id: 'opt_' + i + '_' + Date.now().toString(36), text: text, votes: 0 }; });
                    var us = (window.userState || {});

                    btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating\u2026';
                    fbDb.collection('polls').add({
                        question: question,
                        topic: TOPICS.indexOf(topic) !== -1 ? topic : 'general',
                        options: options,
                        totalVotes: 0,
                        status: 'open',
                        createdBy: us.id || null,
                        createdByName: us.fullName || us.username || 'Admin',
                        createdByUid: (window.fbAuth && window.fbAuth.currentUser) ? window.fbAuth.currentUser.uid : null,
                        createdAt: _serverTimestamp(),
                        closedAt: null
                    }).then(function () {
                        _notify('Poll ticket raised — now live for participants.', 'success');
                        document.getElementById('admin-poll-question-input').value = '';
                        optWrap.innerHTML = '';
                        addOptionInput(); addOptionInput(); addOptionInput(); addOptionInput();
                    }).catch(function (err) {
                        _notify('Could not create poll: ' + (err && err.message || 'unknown error'), 'error');
                    }).finally(function () {
                        btn.disabled = false; btn.innerHTML = '<i class="fas fa-bullhorn"></i> Raise Poll Ticket';
                    });
                });
            }

            function _optionsHtml(data) {
                var total = data.totalVotes || 0;
                return (data.options || []).map(function (opt, i) {
                    var pct = _pct(opt.votes || 0, total);
                    var color = BAR_COLORS[i % BAR_COLORS.length];
                    return '<div style="position:relative;border-radius:8px;overflow:hidden;margin-bottom:6px;border:1px solid rgba(10,14,39,0.1);background:rgba(10,14,39,0.02);">'
                        + '<div style="position:absolute;inset:0;width:' + pct + '%;background:' + color + ';opacity:0.18;transition:width .5s ease;"></div>'
                        + '<div style="position:relative;display:flex;justify-content:space-between;padding:7px 12px;font-size:0.82rem;">'
                        + '<span style="font-weight:700;">' + _esc(opt.text) + '</span>'
                        + '<span style="font-weight:800;color:' + color + ';white-space:nowrap;">' + pct + '% <span style="color:var(--text-muted);font-weight:600;">(' + (opt.votes || 0) + ')</span></span>'
                        + '</div></div>';
                }).join('');
            }

            function _renderList(docs) {
                var listEl = document.getElementById('admin-live-polls-list');
                if (!listEl) return;
                if (!docs.length) { listEl.innerHTML = '<div style="padding:14px;color:var(--text-muted);">No polls yet — raise one above.</div>'; return; }

                listEl.innerHTML = '';
                docs.forEach(function (doc) {
                    var data = doc.data();
                    var closed = data.status !== 'open';
                    var total = data.totalVotes || 0;
                    var row = document.createElement('div');
                    row.style.cssText = 'padding:14px;border:1px solid rgba(10,14,39,0.1);border-radius:12px;margin-bottom:10px;';
                    row.innerHTML =
                        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">'
                        + '<div style="min-width:0;flex:1;"><div style="font-weight:800;font-size:0.9rem;">' + _esc(data.question) + '</div>'
                        + '<div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px;">' + _esc(data.topic || 'general') + ' \u2022 ' + total + ' vote' + (total === 1 ? '' : 's') + ' \u2022 ' + (closed ? '<span style="color:#991b1b;font-weight:700;">closed</span>' : '<span style="color:#22c55e;font-weight:700;">\u25CF live</span>') + '</div></div>'
                        + '<div style="display:flex;gap:6px;flex-shrink:0;">'
                        + '<button class="btn btn-small" data-act="toggle" data-id="' + _esc(doc.id) + '">' + (closed ? '<i class="fas fa-play"></i> Reopen' : '<i class="fas fa-stop"></i> Close') + '</button>'
                        + '<button class="btn btn-small" data-act="export" data-id="' + _esc(doc.id) + '"><i class="fas fa-download"></i> Export</button>'
                        + '</div></div>'
                        + '<div style="margin-top:10px;">' + _optionsHtml(data) + '</div>';
                    listEl.appendChild(row);
                });

                Array.prototype.forEach.call(listEl.querySelectorAll('[data-act="toggle"]'), function (btn) {
                    btn.addEventListener('click', function () {
                        if (!fbDb) return;
                        var id = btn.getAttribute('data-id');
                        var wasClosed = btn.innerHTML.indexOf('Reopen') !== -1;
                        btn.disabled = true;
                        fbDb.collection('polls').doc(id).update(
                            wasClosed ? { status: 'open', closedAt: null } : { status: 'closed', closedAt: _serverTimestamp() }
                        ).then(function () {
                            _notify(wasClosed ? 'Poll reopened.' : 'Poll closed.', 'success');
                        }).catch(function (err) {
                            _notify('Could not update poll: ' + (err && err.message || ''), 'error');
                        }).finally(function () { btn.disabled = false; });
                    });
                });
                Array.prototype.forEach.call(listEl.querySelectorAll('[data-act="export"]'), function (btn) {
                    btn.addEventListener('click', function () {
                        if (!window.fbAuth || !window.fbAuth.currentUser || typeof window._empApiBase !== 'function') {
                            _notify('Not signed in — please refresh and try again.', 'error');
                            return;
                        }
                        var id = btn.getAttribute('data-id');
                        _notify('Preparing export\u2026', 'info');
                        window.fbAuth.currentUser.getIdToken().then(function (token) {
                            return fetch(window._empApiBase() + '/api/admin/polls/' + id + '/export-csv', {
                                headers: { 'Authorization': 'Bearer ' + token }
                            });
                        }).then(function (r) {
                            if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || ('HTTP ' + r.status)); });
                            return r.blob();
                        }).then(function (blob) {
                            var url = URL.createObjectURL(blob);
                            var a = document.createElement('a');
                            a.href = url; a.download = 'poll-' + id + '-results.csv';
                            document.body.appendChild(a); a.click(); a.remove();
                            URL.revokeObjectURL(url);
                        }).catch(function (err) {
                            _notify('Export failed: ' + (err && err.message || 'unknown error'), 'error');
                        });
                    });
                });
            }

            function _startListener() {
                if (!fbDb || _pollsUnsub) return;
                _pollsUnsub = fbDb.collection('polls').orderBy('createdAt', 'desc').limit(50)
                    .onSnapshot(function (snap) {
                        _renderList(snap.docs);
                    }, function (err) {
                        console.warn('[Admin] live polls listener error:', err && err.message);
                    });
            }

            function _boot() {
                if (!_injectCard()) return;
                _startListener();
            }

            document.addEventListener('empyrean-section-change', function (e) {
                if (e && e.detail && e.detail.section === 'admin') setTimeout(_boot, 300);
            });
            setTimeout(_boot, 1500);

            console.log('[Admin] ✅ Live Polls panel wired — create/close/export, live results via onSnapshot.');
        }());

        // ═══════════════════════════════════════════════════════════════════
        // ADMIN PANEL — BUSINESS PAGE MANAGER
        // Self-contained card injected into #admin-users-tab. Lets the admin
        // browse / search ALL business pages on the platform and delete any
        // of them (+ their business_posts) directly — independent of any
        // other user-detail view.
        // ═══════════════════════════════════════════════════════════════════
        (function initAdminBusinessPageManager() {

            function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
            function _notify(msg, type) { if (typeof window.showNotification === 'function') window.showNotification(msg, type); else console.log('[Admin]', msg); }

            /* Same generic media-URL walker + purge call as the Urgent
               Safety Reports panel above (initAdminUrgentSafetyReports) —
               duplicated rather than shared across these two self-
               contained IIFEs, matching this file's own established
               per-feature-card convention. See that panel's copy for the
               full explanation of why this is generic (recursive scan)
               rather than hardcoded per collection's field names. */
            function _extractMediaUrls(value, into) {
                if (typeof value === 'string') {
                    if (/^https:\/\/(res\.cloudinary\.com|firebasestorage\.googleapis\.com|storage\.googleapis\.com)\//.test(value)) into.add(value);
                    return;
                }
                if (Array.isArray(value)) { value.forEach(function (v) { _extractMediaUrls(v, into); }); return; }
                if (value && typeof value === 'object') {
                    for (var k in value) { if (Object.prototype.hasOwnProperty.call(value, k)) _extractMediaUrls(value[k], into); }
                }
            }
            function _purgeMediaUrls(urls) {
                if (!urls || !urls.length) return Promise.resolve();
                if (!window.fbAuth || !window.fbAuth.currentUser || typeof window._empApiBase !== 'function') return Promise.resolve();
                return window.fbAuth.currentUser.getIdToken().then(function (token) {
                    return fetch(window._empApiBase() + '/api/media/purge', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                        body: JSON.stringify({ urls: urls.slice(0, 100) })
                    });
                }).catch(function (err) {
                    console.warn('[Admin BizPages] media purge call failed (docs were already deleted — this cleanup step is best-effort):', err && err.message);
                });
            }

            var _allPagesCache = [];

            function _injectCard() {
                if (document.getElementById('admin-bizpages-card')) return true;
                var tab = document.getElementById('admin-users-tab');
                if (!tab) return false;

                var card = document.createElement('div');
                card.className = 'card';
                card.id = 'admin-bizpages-card';
                card.style.marginBottom = '20px';
                card.innerHTML =
                    '<h3 style="padding:20px 24px 0;display:flex;align-items:center;gap:10px;">'
                    + '<span style="background:var(--g-navy);width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-store" style="color:#F5C518;font-size:0.9rem;"></i></span>'
                    + '<span>Business Page Manager</span>'
                    + '<span id="admin-total-bizpages-badge" style="font-size:0.78rem;background:rgba(27,43,139,0.1);color:var(--secondary);padding:3px 10px;border-radius:12px;margin-left:8px;">0 pages</span>'
                    + '</h3>'
                    + '<div class="card-content">'
                    + '<p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px;">Search by page name, owner Unique ID, or page ID. Deleting a page also deletes all of its posts.</p>'
                    + '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">'
                    + '<input type="text" id="admin-bizpage-search-input" placeholder="Page name, owner UID, or page ID..." style="flex:1;min-width:200px;padding:12px 16px;border:1.5px solid rgba(10,14,39,0.12);border-radius:14px;font-size:0.9rem;outline:none;font-family:inherit;">'
                    + '<button id="admin-bizpage-search-btn" class="btn btn-accent" style="padding:12px 24px;border-radius:14px;font-weight:700;"><i class="fas fa-search"></i> Search</button>'
                    + '<button id="admin-bizpage-refresh-btn" style="padding:12px 18px;border-radius:14px;font-weight:700;background:rgba(10,14,39,0.06);border:none;color:#374151;cursor:pointer;"><i class="fas fa-rotate"></i></button>'
                    + '</div>'
                    + '<div id="admin-bizpages-list"><div style="padding:20px;text-align:center;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> Loading business pages…</div></div>'
                    + '<div style="margin-top:18px;padding:16px;border:1.5px dashed rgba(239,68,68,0.3);border-radius:14px;background:rgba(239,68,68,0.03);">'
                    + '<div style="font-size:0.76rem;font-weight:800;color:#EF4444;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;"><i class="fas fa-triangle-exclamation"></i> Danger Zone</div>'
                    + '<p style="color:var(--text-muted);font-size:0.8rem;margin:0 0 12px;">Permanently deletes every business page and every business post, for every user on the platform. Cannot be undone.</p>'
                    + '<button id="admin-bizpages-wipeall-btn" style="width:100%;padding:12px;border-radius:12px;background:rgba(239,68,68,0.08);color:#EF4444;border:2px solid rgba(239,68,68,0.25);font-weight:800;font-size:0.86rem;cursor:pointer;"><i class="fas fa-radiation" style="margin-right:7px;"></i>Wipe ALL Business Pages</button>'
                    + '</div>'
                    + '</div>';

                /* Insert at the top of the tab, above the User Search card */
                tab.insertBefore(card, tab.firstChild);
                return true;
            }

            function _pageRowHTML(p) {
                var cover = p.coverPhoto || p.profilePhoto || '';
                var avatar = p.profilePhoto || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name || p.businessName || 'B') + '&background=1B2B8B&color=fff&size=64');
                return '<div class="admin-bizpage-row" data-pageid="' + _esc(p.id) + '" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid rgba(10,14,39,0.08);border-radius:14px;margin-bottom:10px;flex-wrap:wrap;">'
                    + '<img src="' + _esc(avatar) + '" style="width:42px;height:42px;border-radius:10px;object-fit:cover;flex-shrink:0;" onerror="this.src=\'https://ui-avatars.com/api/?name=B&background=1B2B8B&color=fff&size=64\'">'
                    + '<div style="flex:1;min-width:160px;">'
                        + '<div style="font-weight:800;font-size:0.9rem;color:#0A0E27;display:flex;align-items:center;gap:6px;">' + _esc(p.name || p.businessName || 'Unnamed Business')
                            + (p.verified ? '<span title="Verified" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#1B9AF5;flex-shrink:0;"><i class="fas fa-check" style="color:#fff;font-size:0.5rem;"></i></span>' : '')
                        + '</div>'
                        + '<div style="font-size:0.74rem;color:#9CA3AF;">Page ID: <span style="font-family:monospace;">' + _esc(p.id) + '</span>' + (p.industry ? ' &middot; ' + _esc(p.industry) : '') + '</div>'
                        + '<div style="font-size:0.74rem;color:#9CA3AF;">Owner: <span style="font-family:monospace;">' + _esc(p.ownerId || '—') + '</span>' + (p.email ? ' &middot; ' + _esc(p.email) : '') + '</div>'
                        + (p.postCount != null ? '<div style="font-size:0.74rem;color:#9CA3AF;">' + p.postCount + ' post' + (p.postCount === 1 ? '' : 's') + '</div>' : '')
                    + '</div>'
                    + '<button class="admin-bizpage-verify-btn" data-pageid="' + _esc(p.id) + '" data-verified="' + (p.verified ? '1' : '0') + '"'
                        + ' style="padding:8px 14px;border-radius:10px;font-size:0.8rem;font-weight:800;cursor:pointer;white-space:nowrap;'
                        + (p.verified
                            ? 'background:rgba(10,14,39,0.05);color:#374151;border:1.5px solid rgba(10,14,39,0.12);'
                            : 'background:rgba(27,154,245,0.08);color:#1B9AF5;border:1.5px solid rgba(27,154,245,0.25);')
                        + '"><i class="fas ' + (p.verified ? 'fa-circle-xmark' : 'fa-check') + '"></i> ' + (p.verified ? 'Unverify' : 'Verify') + '</button>'
                    + '<button class="admin-bizpage-delete-btn2" data-pageid="' + _esc(p.id) + '" style="padding:8px 14px;border-radius:10px;background:rgba(239,68,68,0.08);color:#EF4444;border:1.5px solid rgba(239,68,68,0.2);font-size:0.8rem;font-weight:800;cursor:pointer;white-space:nowrap;"><i class="fas fa-trash"></i> Delete Page</button>'
                    + '</div>';
            }

            /* Universal feature: Verified badge — admin-only toggle. Writes
               business_pages/{id}.verified, which app-business.js's live
               page renderer reads to show/hide the blue checkmark next to
               the page name (see that file's _renderBizPageFull). */
            function _toggleVerified(pageId, btn) {
                if (!pageId || !fbDb) return;
                var nextVerified = btn.dataset.verified !== '1';
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                fbDb.collection('business_pages').doc(pageId).update({ verified: nextVerified })
                    .then(function () {
                        var p = (_allPagesCache || []).find(function (pg) { return pg.id === pageId; });
                        if (p) p.verified = nextVerified;
                        _notify(nextVerified ? 'Page verified.' : 'Verification removed.', 'success');
                        _renderList(_allPagesCache);
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas ' + (nextVerified ? 'fa-check' : 'fa-circle-xmark') + '"></i> ' + (nextVerified ? 'Verify' : 'Unverify');
                        _notify('Could not update verification: ' + (err && err.message ? err.message : 'please try again.'), 'error');
                    });
            }

            function _renderList(list) {
                var container = document.getElementById('admin-bizpages-list');
                var badge = document.getElementById('admin-total-bizpages-badge');
                if (badge) badge.textContent = list.length + (list.length === 1 ? ' page' : ' pages');
                if (!container) return;
                if (!list.length) {
                    container.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:0.88rem;">No business pages found.</div>';
                    return;
                }
                container.innerHTML = list.map(_pageRowHTML).join('');
                container.querySelectorAll('.admin-bizpage-delete-btn2').forEach(function (btn) {
                    btn.addEventListener('click', function () { _deletePage(btn.dataset.pageid, btn); });
                });
                container.querySelectorAll('.admin-bizpage-verify-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () { _toggleVerified(btn.dataset.pageid, btn); });
                });
            }

            /* Load all business pages, then count posts per page */
            function _loadAllPages() {
                if (!fbDb) return Promise.resolve([]);
                var container = document.getElementById('admin-bizpages-list');
                if (container) container.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> Loading business pages…</div>';

                return fbDb.collection('business_pages').limit(200).get().then(function (snap) {
                    var pages = [];
                    snap.forEach(function (doc) {
                        var d = doc.data();
                        d.id = doc.id;
                        pages.push(d);
                    });

                    /* Attach post counts (best-effort, parallel) */
                    return Promise.all(pages.map(function (p) {
                        return fbDb.collection('business_posts').where('pageId', '==', p.id).get()
                            .then(function (postsSnap) { p.postCount = postsSnap.size; })
                            .catch(function () { p.postCount = null; });
                    })).then(function () {
                        _allPagesCache = pages;
                        _renderList(pages);
                        return pages;
                    });
                }).catch(function (err) {
                    console.warn('[Admin BizPages] load failed:', err && err.message);
                    if (container) container.innerHTML = '<div style="padding:20px;text-align:center;color:#EF4444;">Could not load business pages: ' + _esc(err && err.message) + '</div>';
                    return [];
                });
            }

            function _runSearch() {
                var input = document.getElementById('admin-bizpage-search-input');
                if (!input) return;
                var q = (input.value || '').trim().toLowerCase();
                if (!q) { _renderList(_allPagesCache); return; }
                var matches = _allPagesCache.filter(function (p) {
                    return (p.name || p.businessName || '').toLowerCase().indexOf(q) > -1
                        || (p.id || '').toLowerCase().indexOf(q) > -1
                        || (p.ownerId || '').toLowerCase().indexOf(q) > -1
                        || (p.email || '').toLowerCase().indexOf(q) > -1;
                });
                _renderList(matches);
            }

            /* ── Delete a business page + all its posts ── */
            function _deletePage(pageId, btn) {
                if (!pageId) return;
                if (!btn._confirming) {
                    btn._confirming = true;
                    btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Tap again to confirm';
                    setTimeout(function () {
                        if (btn._confirming) {
                            btn._confirming = false;
                            btn.innerHTML = '<i class="fas fa-trash"></i> Delete Page';
                        }
                    }, 4000);
                    return;
                }
                if (!fbDb) { _notify('Not connected.', 'error'); return; }
                btn._confirming = false;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';

                var mediaUrls = new Set();
                var pageRef = fbDb.collection('business_pages').doc(pageId);

                pageRef.get()
                    .then(function (pageSnap) {
                        if (pageSnap.exists) _extractMediaUrls(pageSnap.data(), mediaUrls);
                        return fbDb.collection('business_posts').where('pageId', '==', pageId).get();
                    })
                    .then(function (snap) {
                        var dels = [];
                        snap.forEach(function (doc) {
                            _extractMediaUrls(doc.data(), mediaUrls);
                            dels.push(doc.ref.delete().catch(function () {}));
                        });
                        return Promise.all(dels);
                    })
                    .then(function () { return pageRef.delete(); })
                    .then(function () {
                        /* Best-effort — the takedown (Firestore docs already
                           gone) doesn't wait on or fail because of this. */
                        _purgeMediaUrls(Array.from(mediaUrls));
                        _notify('Business page deleted.', 'success');
                        _allPagesCache = _allPagesCache.filter(function (p) { return p.id !== pageId; });
                        _renderList(_allPagesCache);
                        /* If the deleted page belongs to the currently logged-in
                           admin/user, clear local references + dashboard card */
                        var us = (window.EmpState && window.EmpState.userState) || window.userState || {};
                        if (us && us.businessPage && (us.businessPage.id === pageId || us.businessPage === pageId)) {
                            us.businessPage = null;
                            if (fbDb && us.id) fbDb.collection('users').doc(us.id).update({ businessPage: null }).catch(function () {});
                        }
                        document.querySelectorAll('[data-biz-id="' + pageId + '"],[data-page-id="' + pageId + '"]').forEach(function (c) { c.remove(); });
                        if (typeof window.renderDashboardBusinesses === 'function') {
                            try { window.renderDashboardBusinesses(); } catch (e) {}
                        }
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-trash"></i> Delete Page';
                        _notify('Failed to delete page: ' + (err && err.message ? err.message : 'Please try again.'), 'error');
                    });
            }

            /* ── Wipe every business page + post platform-wide ──
               FIX (bulk deletes via a one-off console script left dashboard
               cards behind): deleting the Firestore docs alone never removed
               anything already rendered into the DOM. Cards on the dashboard
               are pure additive renders (renderDashboardBusinesses only adds
               or skips existing cards, it never checks whether a card's
               backing page still exists) and the real-time listener that
               feeds #dashboard-bizposts-slider only reacts to docChanges()
               of type 'added' — a 'removed' change from a deleted doc is
               silently ignored. So a bulk delete anywhere else in the app
               will always leave stale cards on screen until this function's
               explicit querySelectorAll(...).remove() sweep runs (same
               pattern _deletePage already uses per-page, just applied to
               every business-tagged element on the page instead of one id). */
            function _wipeAllPages(btn) {
                if (!fbDb) { _notify('Not connected.', 'error'); return; }
                if (!btn._confirming) {
                    btn._confirming = true;
                    btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Tap again to confirm — deletes ALL pages';
                    setTimeout(function () {
                        if (btn._confirming) {
                            btn._confirming = false;
                            btn.innerHTML = '<i class="fas fa-radiation" style="margin-right:7px;"></i>Wipe ALL Business Pages';
                        }
                    }, 4000);
                    return;
                }
                btn._confirming = false;
                if (!confirm('This permanently deletes EVERY business page and post for EVERY user on the platform. This cannot be undone. Continue?')) {
                    btn.innerHTML = '<i class="fas fa-radiation" style="margin-right:7px;"></i>Wipe ALL Business Pages';
                    return;
                }
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wiping…';

                var BATCH = 400;
                function _deleteAllIn(collectionName) {
                    return fbDb.collection(collectionName).get().then(function (snap) {
                        var docs = snap.docs, chains = [];
                        for (var i = 0; i < docs.length; i += BATCH) {
                            var chunk = docs.slice(i, i + BATCH);
                            var batch = fbDb.batch();
                            chunk.forEach(function (d) { batch.delete(d.ref); });
                            chains.push(batch.commit());
                        }
                        return Promise.all(chains).then(function () { return docs.length; });
                    });
                }

                var postsDeleted = 0, pagesDeleted = 0;

                _deleteAllIn('business_posts')
                    .then(function (n) { postsDeleted = n; return _deleteAllIn('business_pages'); })
                    .then(function (n) { pagesDeleted = n; return fbDb.collection('users').get(); })
                    .then(function (usersSnap) {
                        var docs = usersSnap.docs.filter(function (d) {
                            var v = d.data();
                            return v.businessPage || (v.businessPages && v.businessPages.length);
                        });
                        var chains = [];
                        for (var i = 0; i < docs.length; i += BATCH) {
                            var chunk = docs.slice(i, i + BATCH);
                            var batch = fbDb.batch();
                            chunk.forEach(function (d) { batch.update(d.ref, { businessPage: null, businessPages: [] }); });
                            chains.push(batch.commit());
                        }
                        return Promise.all(chains);
                    })
                    .then(function () {
                        /* In-memory caches */
                        window._firestoreBusinessPages = [];
                        window._activeBizData   = null;
                        window._activeBizPageId = '';
                        window._bizPagesFetchDone = false;
                        var us = (window.EmpState && window.EmpState.userState) || window.userState || {};
                        if (us) { us.businessPage = null; us.businessPages = []; }

                        /* Every rendered business card/tile, anywhere in the app —
                           dashboard slider, product-card slider, profile links, etc. */
                        document.querySelectorAll('[data-biz-id],[data-page-id]').forEach(function (c) { c.remove(); });

                        /* Reset the admin list itself */
                        _allPagesCache = [];
                        _renderList([]);

                        /* Re-render the dashboard slider(s) so they settle into
                           their correct empty/demo state instead of just being
                           left blank where cards used to be */
                        if (typeof window.renderDashboardBusinesses === 'function') {
                            try { window.renderDashboardBusinesses(); } catch (e) {}
                        }

                        _notify('Wiped ' + pagesDeleted + ' business page(s) and ' + postsDeleted + ' post(s).', 'success');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-radiation" style="margin-right:7px;"></i>Wipe ALL Business Pages';
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-radiation" style="margin-right:7px;"></i>Wipe ALL Business Pages';
                        _notify('Wipe failed: ' + (err && err.message ? err.message : 'Please try again.'), 'error');
                    });
            }

            function _wire() {
                if (!_injectCard()) return;

                var searchBtn = document.getElementById('admin-bizpage-search-btn');
                var searchInput = document.getElementById('admin-bizpage-search-input');
                var refreshBtn = document.getElementById('admin-bizpage-refresh-btn');
                var wipeAllBtn = document.getElementById('admin-bizpages-wipeall-btn');

                if (searchBtn && !searchBtn._wired) { searchBtn._wired = true; searchBtn.addEventListener('click', _runSearch); }
                if (searchInput && !searchInput._wired) {
                    searchInput._wired = true;
                    searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') _runSearch(); });
                    searchInput.addEventListener('input', function () { if (!searchInput.value) _renderList(_allPagesCache); });
                }
                if (refreshBtn && !refreshBtn._wired) { refreshBtn._wired = true; refreshBtn.addEventListener('click', _loadAllPages); }
                if (wipeAllBtn && !wipeAllBtn._wired) { wipeAllBtn._wired = true; wipeAllBtn.addEventListener('click', function () { _wipeAllPages(wipeAllBtn); }); }

                if (!_allPagesCache.length) _loadAllPages();
            }

            if (document.readyState !== 'loading') _wire();
            else document.addEventListener('DOMContentLoaded', _wire);
            document.addEventListener('empyrean-init-done', function () { setTimeout(_wire, 400); });

            /* Load/refresh when the Users tab is clicked */
            document.addEventListener('click', function (e) {
                var tabBtn = e.target.closest && e.target.closest('[data-tab="admin-users-tab"]');
                if (tabBtn) setTimeout(function () { _wire(); _loadAllPages(); }, 150);
            });

            /* ── Robust retry: the admin panel markup is often injected into
               the DOM dynamically (e.g. after "Exit/Enter Admin" toggle),
               and the Users tab may already be active by default with no
               click event ever firing. Poll until the card is injected. ── */
            (function _retryUntilInjected() {
                var attempts = 0;
                var iv = setInterval(function () {
                    attempts++;
                    if (document.getElementById('admin-bizpages-card')) { clearInterval(iv); return; }
                    _wire();
                    if (attempts >= 40) clearInterval(iv); /* ~20s max */
                }, 500);
            })();

            /* Also watch for the admin-users-tab being added/shown dynamically */
            if (typeof MutationObserver !== 'undefined') {
                var _bizMo = new MutationObserver(function () {
                    if (!document.getElementById('admin-bizpages-card') && document.getElementById('admin-users-tab')) {
                        _wire();
                    }
                });
                _bizMo.observe(document.body, { childList: true, subtree: true });
            }

            console.log('[Admin] ✅ Business Page Manager — search/list/delete any business page (+ posts).');
        }());

        // ═══════════════════════════════════════════════════════════════════
        // ADVERT CONTROL ROOM — push image/video adverts (multiple
        // companies/organizations) into a new `adverts` Firestore collection.
        // The feed side of this feature (rotating sponsored cards into
        // #feed-container / #profile-dash-feed / #profile-posts-feed) lives
        // in app-feed.js's own empyreanAdvertsFeedInjector() — this file only
        // owns the admin CRUD: push/edit/pause/delete + impression/click
        // counters. Markup lives in index.html's #admin-adverts-tab (static
        // skeleton — form + list container only, everything dynamic is here).
        //
        // Media upload reuses window.uploadToCloudinary (Firebase-Storage-
        // backed despite the legacy name), the same function every other
        // upload path in this app already goes through — so adverts get the
        // same owner-segmented path, auth, retry, AND the app-wide client-
        // side image-compression wrap (app-startup.js) automatically, with
        // no separate upload logic to maintain here.
        // ═══════════════════════════════════════════════════════════════════
        (function initAdvertManager() {
            var ADVERTS_COL = 'adverts';
            var _advertsCache = [];
            var _editingAdvertId = null;
            var _pendingMediaFile = null;
            var _pendingMediaType = null;

            function _notifyAdmin(msg, type) {
                if (typeof window.showNotification === 'function') window.showNotification(msg, type || 'info');
            }
            function _escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
            function _escAttr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
            function _fmtNum(n) { return Number(n || 0).toLocaleString(); }

            function _resetForm() {
                _editingAdvertId  = null;
                _pendingMediaFile = null;
                _pendingMediaType = null;
                var f = document.getElementById('admin-advert-form');
                if (f) f.reset();
                var prev = document.getElementById('admin-advert-media-preview');
                if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
                var priorityEl = document.getElementById('admin-advert-priority-input');
                if (priorityEl) priorityEl.value = 1;
                var activeEl = document.getElementById('admin-advert-active-checkbox');
                if (activeEl) activeEl.checked = true;
                var submitBtn = document.getElementById('admin-advert-submit-btn');
                if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-bullhorn"></i> Push Advert';
                var cancelBtn = document.getElementById('admin-advert-cancel-edit-btn');
                if (cancelBtn) cancelBtn.style.display = 'none';
            }

            /* ── media preview: shows the chosen file immediately, before
               upload — same "pick, preview, then submit" pattern the create-
               business-page modal already uses (app-business.js §4). ── */
            function _wireMediaPreview() {
                var input = document.getElementById('admin-advert-media-input');
                if (!input || input._wired) return;
                input._wired = true;
                input.addEventListener('change', function () {
                    var file = input.files && input.files[0];
                    var prev = document.getElementById('admin-advert-media-preview');
                    if (!file || !prev) return;
                    _pendingMediaFile = file;
                    _pendingMediaType = (file.type && file.type.indexOf('video/') === 0) ? 'video' : 'image';
                    var url = URL.createObjectURL(file);
                    prev.style.display = 'block';
                    prev.innerHTML = _pendingMediaType === 'video'
                        ? '<video src="' + url + '" muted playsinline controls style="width:100%;max-height:220px;border-radius:12px;object-fit:cover;"></video>'
                        : '<img src="' + url + '" style="width:100%;max-height:220px;border-radius:12px;object-fit:cover;">';
                });
            }

            function _wireFormSubmit() {
                var form = document.getElementById('admin-advert-form');
                if (!form || form._wired) return;
                form._wired = true;
                form.addEventListener('submit', function (e) {
                    e.preventDefault();
                    _submitAdvert();
                });
            }

            function _submitAdvert() {
                var nameEl     = document.getElementById('admin-advert-name-input');
                var captionEl  = document.getElementById('admin-advert-caption-input');
                var linkEl     = document.getElementById('admin-advert-link-input');
                var ctaEl      = document.getElementById('admin-advert-cta-input');
                var priorityEl = document.getElementById('admin-advert-priority-input');
                var activeEl   = document.getElementById('admin-advert-active-checkbox');
                var submitBtn  = document.getElementById('admin-advert-submit-btn');

                var advertiserName = nameEl && nameEl.value.trim();
                if (!advertiserName) { _notifyAdmin('Advertiser / company name is required.', 'warning'); return; }
                if (!_editingAdvertId && !_pendingMediaFile) { _notifyAdmin('Choose an image or video for this advert.', 'warning'); return; }
                if (!fbDb) { _notifyAdmin('Not connected — try again in a moment.', 'error'); return; }

                if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Pushing…'; }
                // ADDED (2026-08-10 — upload progress tracker)
                var _advertBar = (typeof window.empUploadProgress === 'object')
                    ? window.empUploadProgress.attach(submitBtn ? submitBtn.parentElement : document.body, 'Advert media')
                    : { update: function () {}, done: function () {}, fail: function () {} };

                var payload = {
                    advertiserName: advertiserName,
                    caption:  (captionEl  && captionEl.value.trim())  || '',
                    linkUrl:  (linkEl     && linkEl.value.trim())     || '',
                    ctaLabel: (ctaEl      && ctaEl.value.trim())      || 'Learn More',
                    priority: Math.max(1, Math.min(10, parseInt(priorityEl && priorityEl.value, 10) || 1)),
                    active:   activeEl ? !!activeEl.checked : true,
                    updatedAt: _serverTimestamp()
                };

                var uploadStep = _pendingMediaFile
                    ? window.uploadToCloudinary(_pendingMediaFile, function (pct) { _advertBar.update(pct); }).then(function (url) {
                        _advertBar.done();
                        payload.mediaUrl  = url;
                        payload.mediaType = _pendingMediaType;
                    }).catch(function (err) { _advertBar.fail('Upload failed'); throw err; })
                    : Promise.resolve();

                uploadStep.then(function () {
                    if (_editingAdvertId) {
                        return fbDb.collection(ADVERTS_COL).doc(_editingAdvertId).update(payload)
                            .then(function () { _notifyAdmin('Advert updated.', 'success'); });
                    }
                    payload.impressions = 0;
                    payload.clicks      = 0;
                    payload.createdAt   = _serverTimestamp();
                    payload.createdBy   = (window.userState && window.userState.id) || 'admin';
                    return fbDb.collection(ADVERTS_COL).add(payload)
                        .then(function () { _notifyAdmin('Advert pushed — it will start rotating into the feed.', 'success'); });
                }).then(function () {
                    _resetForm();
                    _loadAdvertsList();
                }).catch(function (err) {
                    _notifyAdmin('Could not save advert: ' + (err && err.message ? err.message : 'unknown error'), 'error');
                }).finally(function () {
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = _editingAdvertId ? '<i class="fas fa-save"></i> Save Changes' : '<i class="fas fa-bullhorn"></i> Push Advert'; }
                });
            }

            function _loadAdvertsList() {
                var listEl  = document.getElementById('admin-adverts-list');
                var badgeEl = document.getElementById('admin-advert-count-badge');
                if (!listEl || !fbDb) return;
                listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;"><i class="fas fa-spinner fa-spin"></i> Loading adverts…</div>';
                fbDb.collection(ADVERTS_COL).orderBy('createdAt', 'desc').limit(50).get()
                    .then(function (snap) {
                        _advertsCache = [];
                        snap.forEach(function (doc) {
                            var d = doc.data(); d.id = doc.id; _advertsCache.push(d);
                        });
                        if (badgeEl) badgeEl.textContent = _advertsCache.length;
                        _renderAdvertsList();
                    })
                    .catch(function (err) {
                        listEl.innerHTML = '<div style="padding:20px;text-align:center;color:#EF4444;">Could not load adverts: ' + _escHtml(err && err.message) + '</div>';
                    });
            }
            window._adminLoadAdvertsList = _loadAdvertsList;

            function _renderAdvertsList() {
                var listEl = document.getElementById('admin-adverts-list');
                if (!listEl) return;
                if (!_advertsCache.length) {
                    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;">No adverts yet — push your first one above.</div>';
                    return;
                }
                listEl.innerHTML = _advertsCache.map(function (ad) {
                    var thumb = ad.mediaType === 'video'
                        ? '<video src="' + _escAttr(ad.mediaUrl) + '" muted style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;"></video>'
                        : '<img src="' + _escAttr(ad.mediaUrl) + '" style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;">';
                    return '<div class="admin-advert-row" data-id="' + _escAttr(ad.id) + '" style="display:flex;gap:12px;align-items:center;padding:12px;border-radius:12px;background:rgba(10,14,39,0.02);margin-bottom:10px;">'
                        + thumb
                        + '<div style="flex:1;min-width:0;">'
                        + '<div style="font-weight:700;font-size:0.88rem;">' + _escHtml(ad.advertiserName) + '</div>'
                        + '<div style="font-size:0.76rem;color:#9CA3AF;">'
                        + (ad.active ? '<span style="color:#22c55e;">\u25CF Active</span>' : '<span style="color:#9CA3AF;">\u25CF Paused</span>')
                        + ' \u00B7 Priority ' + (ad.priority || 1)
                        + ' \u00B7 ' + _fmtNum(ad.impressions) + ' views \u00B7 ' + _fmtNum(ad.clicks) + ' clicks</div>'
                        + '</div>'
                        + '<div style="display:flex;gap:6px;flex-shrink:0;">'
                        + '<button class="admin-advert-toggle-btn" data-id="' + _escAttr(ad.id) + '" data-active="' + (!!ad.active) + '" title="' + (ad.active ? 'Pause' : 'Activate') + '" style="width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;background:rgba(10,14,39,0.06);"><i class="fas ' + (ad.active ? 'fa-pause' : 'fa-play') + '"></i></button>'
                        + '<button class="admin-advert-edit-btn" data-id="' + _escAttr(ad.id) + '" title="Edit" style="width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;background:rgba(27,43,139,0.08);color:#1B2B8B;"><i class="fas fa-edit"></i></button>'
                        + '<button class="admin-advert-delete-btn" data-id="' + _escAttr(ad.id) + '" title="Delete" style="width:34px;height:34px;border-radius:50%;border:none;cursor:pointer;background:rgba(239,68,68,0.08);color:#EF4444;"><i class="fas fa-trash"></i></button>'
                        + '</div></div>';
                }).join('');
            }

            function _findAd(id) { return _advertsCache.find(function (a) { return a.id === id; }); }

            document.addEventListener('click', function (e) {
                var t = e.target.closest ? e.target.closest('.admin-advert-toggle-btn, .admin-advert-edit-btn, .admin-advert-delete-btn') : null;
                if (!t) return;
                var id = t.dataset.id;
                var ad = _findAd(id);
                // FIX (2026-08-08 — silent no-op): this used to just `return`
                // here with zero feedback if either lookup failed — which,
                // combined with the stale-fbDb bug fixed above, is exactly
                // what "the button doesn't work" looks like from the admin's
                // side: a click that visibly does nothing at all. Now every
                // failure path says why.
                if (!ad) { _notifyAdmin('Could not find that advert (list may be out of date — try reopening the Adverts tab).', 'error'); return; }
                if (!fbDb) { _notifyAdmin('Not connected to the database — please refresh and try again.', 'error'); return; }

                if (t.classList.contains('admin-advert-toggle-btn')) {
                    var newActive = t.dataset.active !== 'true';
                    fbDb.collection(ADVERTS_COL).doc(id).update({ active: newActive, updatedAt: _serverTimestamp() })
                        .then(function () { ad.active = newActive; _renderAdvertsList(); _notifyAdmin(newActive ? 'Advert activated.' : 'Advert paused.', 'success'); })
                        .catch(function (err) { _notifyAdmin('Could not update: ' + (err && err.message || ''), 'error'); });
                } else if (t.classList.contains('admin-advert-edit-btn')) {
                    _editingAdvertId = id;
                    var nameEl = document.getElementById('admin-advert-name-input');
                    var captionEl = document.getElementById('admin-advert-caption-input');
                    var linkEl = document.getElementById('admin-advert-link-input');
                    var ctaEl = document.getElementById('admin-advert-cta-input');
                    var priorityEl = document.getElementById('admin-advert-priority-input');
                    var activeEl = document.getElementById('admin-advert-active-checkbox');
                    if (nameEl) nameEl.value = ad.advertiserName || '';
                    if (captionEl) captionEl.value = ad.caption || '';
                    if (linkEl) linkEl.value = ad.linkUrl || '';
                    if (ctaEl) ctaEl.value = ad.ctaLabel || '';
                    if (priorityEl) priorityEl.value = ad.priority || 1;
                    if (activeEl) activeEl.checked = !!ad.active;
                    var prev = document.getElementById('admin-advert-media-preview');
                    if (prev && ad.mediaUrl) {
                        prev.style.display = 'block';
                        prev.innerHTML = ad.mediaType === 'video'
                            ? '<video src="' + _escAttr(ad.mediaUrl) + '" muted playsinline controls style="width:100%;max-height:220px;border-radius:12px;object-fit:cover;"></video>'
                            : '<img src="' + _escAttr(ad.mediaUrl) + '" style="width:100%;max-height:220px;border-radius:12px;object-fit:cover;">';
                    }
                    var submitBtn = document.getElementById('admin-advert-submit-btn');
                    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
                    var cancelBtn = document.getElementById('admin-advert-cancel-edit-btn');
                    if (cancelBtn) cancelBtn.style.display = 'inline-block';
                    var form = document.getElementById('admin-advert-form');
                    if (form && form.scrollIntoView) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else if (t.classList.contains('admin-advert-delete-btn')) {
                    // FIX (2026-08-08 — native confirm() unreliable on mobile):
                    // same class of issue app-fixes.js's _deletePostCapture
                    // already had to work around for post deletion ("avoids
                    // native confirm() mobile issues") — some mobile
                    // webviews/PWA contexts suppress or auto-dismiss a
                    // blocking window.confirm(), which silently returns
                    // false/undefined and makes Delete look completely
                    // inert. Reusing that same proven custom in-page banner
                    // here instead of window.confirm().
                    _confirmAdvertDelete(id, ad);
                }
            });

            // FIX (2026-08-08): custom in-page confirmation banner, replacing
            // window.confirm() for the same mobile-reliability reason
            // app-fixes.js's post-delete flow already switched away from it.
            // Mirrors that pattern: a dismissable bottom banner with
            // Cancel/Delete, auto-dismisses after 7s if ignored.
            function _confirmAdvertDelete(id, ad) {
                var existing = document.getElementById('_empAdvertDeleteConfirm');
                if (existing) existing.remove();
                var banner = document.createElement('div');
                banner.id = '_empAdvertDeleteConfirm';
                banner.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;background:#0A0E27;color:white;border-radius:16px;padding:14px 20px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,0.4);min-width:280px;max-width:92vw;font-family:inherit;';
                banner.innerHTML = '<span style="flex:1;font-size:0.88rem;font-weight:600;">Delete this advert permanently? This cannot be undone.</span>'
                    + '<button id="_advDelCancel" style="background:rgba(255,255,255,0.12);border:none;color:white;padding:7px 14px;border-radius:8px;cursor:pointer;font-size:0.82rem;">Cancel</button>'
                    + '<button id="_advDelConfirm" style="background:#e53935;border:none;color:white;padding:7px 16px;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.82rem;">Delete</button>';
                document.body.appendChild(banner);
                var timeout = setTimeout(function () { banner.remove(); }, 7000);
                document.getElementById('_advDelCancel').onclick = function () { clearTimeout(timeout); banner.remove(); };
                document.getElementById('_advDelConfirm').onclick = function () {
                    clearTimeout(timeout); banner.remove();
                    if (!fbDb) { _notifyAdmin('Not connected to the database — please refresh and try again.', 'error'); return; }
                    fbDb.collection(ADVERTS_COL).doc(id).delete()
                        .then(function () { _advertsCache = _advertsCache.filter(function (a) { return a.id !== id; }); _renderAdvertsList(); _notifyAdmin('Advert deleted.', 'success'); })
                        .catch(function (err) { _notifyAdmin('Could not delete: ' + (err && err.message || ''), 'error'); });
                };
            }

            document.addEventListener('click', function (e) {
                var t = e.target.closest ? e.target.closest('#admin-advert-cancel-edit-btn') : null;
                if (t) _resetForm();
            });

            function _wireAll() {
                _wireMediaPreview();
                _wireFormSubmit();
            }
            if (document.readyState !== 'loading') _wireAll();
            else document.addEventListener('DOMContentLoaded', _wireAll);
            document.addEventListener('empyrean-init-done', function () { setTimeout(_wireAll, 400); });

            console.log('[Admin] \u2705 Advert Control Room wired \u2014 push/edit/pause/delete image or video adverts for multiple companies/organizations; feed rotation handled by app-feed.js.');
        }());