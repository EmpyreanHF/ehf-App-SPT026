/* =============================================================================
   EMPYREAN INTERNATIONAL — GLOBAL HELPER UTILITIES
   app-helpers.js  |  Step 0.3  |  Refactor Roadmap v1.0
   =============================================================================

   PURPOSE
   ───────
   Every reusable, stateless-ish utility function used across two or more
   modules.  Extracted verbatim (plus JSDoc + minor de-duplication) from the
   original DOMContentLoaded closure in app-fixes.js.

   LOAD ORDER
   ──────────
   <script src="firebase-init.js">
   <script src="app-state.js">
   <script src="app-helpers.js">   ← THIS FILE
   <script src="app-dom.js">
   ... all other app-*.js modules ...

   DEPENDS ON
   ──────────
   • window.EmpState  (app-state.js) — reads isGuest, userState, impactMiningState,
     userLockedStakedBalance, userLockedStakingEndTime, userClaimedRewardsHistory,
     userState.empyBalance, and calls EmpState.patchUser().
   • window.fbDb      (firebase-init.js stub) — to persist empyBalance updates.

   SECTION MAP
   ───────────
   §1  DOM utilities            — empyreanClosest
   §2  Formatters               — _fmtCount, _timeAgo, formatNgnPrice,
                                  formatUsdPrice
   §3  Notification toast       — showNotification
   §4  Form helpers             — showFormFeedback, generateCaptcha
   §5  Rich text renderer       — formatWhatsAppText
   §6  Upload utilities         — uploadMediaFilesToCloudinary (polyfill),
                                  showUploadProgress
   §7  Image & media preview    — resizeAndCropImage, handleAvatarUpload,
                                  handleMediaPreview, handleMarketplacePreview
   §8  Share                    — shareContent
   §9  Impact mining reward     — REMOVED 2026-08-15, see §9's own comment (was a stale duplicate of app-impactmining.js's rewardUserForAction)
   §10 KYC date selectors       — populateDobSelectors
   §11 Error recovery           — onerror handler, unhandledrejection,
                                  _blankScreenGuard, _injectArticleCollapseCSS

   ============================================================================= */

(function empyreanHelpersModule() {
    'use strict';

    if (window._empyreanHelpersLoaded) {
        console.warn('[EmpHelpers] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanHelpersLoaded = true;

    /* =========================================================================
       §1  DOM UTILITIES
       ========================================================================= */

    /**
     * Safe wrapper around Element.closest() with a null-check guard.
     * Use instead of calling .closest() directly on potentially-null elements.
     *
     * @param {Element|null} el        — Starting element
     * @param {string}       selector  — CSS selector to match against ancestors
     * @returns {Element|null}
     */
    function empyreanClosest(el, selector) {
        if (!el || !selector) return null;
        return el.closest ? el.closest(selector) : null;
    }
    window.empyreanClosest = empyreanClosest;


    /* =========================================================================
       §2  FORMATTERS
       ========================================================================= */

    /**
     * Compact number formatter — abbreviates large counts.
     * 1234 → "1.2K"  |  1200000 → "1.2M"  |  999 → "999"
     *
     * @param {number|string} n
     * @returns {string}
     */
    function _fmtCount(n) {
        n = parseInt(n) || 0;
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
        return n.toString();
    }
    window._fmtCount = _fmtCount;

    /**
     * Relative time formatter.
     * Returns human-readable string: "5s", "12m", "3h", "2d", or "14 Jan".
     *
     * @param {number|string|Date|null} ts — Timestamp (ms), ISO string, or Date
     * @returns {string}
     */
    function _timeAgo(ts) {
        var d   = ts ? new Date(ts) : new Date();
        var sec = Math.floor((Date.now() - d.getTime()) / 1000);
        if (isNaN(sec) || sec < 0) return 'just now';
        if (sec < 60)      return sec + 's';
        if (sec < 3_600)   return Math.floor(sec / 60) + 'm';
        if (sec < 86_400)  return Math.floor(sec / 3_600) + 'h';
        if (sec < 604_800) return Math.floor(sec / 86_400) + 'd';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    window._timeAgo = _timeAgo;

    /**
     * Format a number as Nigerian Naira (₦).
     * @param {number} price
     * @returns {string}  e.g. "₦1,500,000.00"
     */
    function formatNgnPrice(price) {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency', currency: 'NGN', minimumFractionDigits: 2
        }).format(price);
    }
    window.formatNgnPrice = formatNgnPrice;

    /**
     * Format a number as US Dollars ($).
     * @param {number} price
     * @returns {string}  e.g. "$1,200.00"
     */
    function formatUsdPrice(price) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', minimumFractionDigits: 2
        }).format(price);
    }
    window.formatUsdPrice = formatUsdPrice;


    /* =========================================================================
       §3  NOTIFICATION TOAST
       ========================================================================= */

    /**
     * Show a brief toast notification in the top-right corner.
     * Uses the #reward-notification element defined in index.html.
     *
     * @param {string} message           — Text to display
     * @param {'success'|'error'|'warning'|'info'} [type='success']
     */
    function showNotification(message, type) {
        type = type || 'success';
        var el = document.getElementById('reward-notification');
        if (!el) return;

        var colorMap = {
            success: '#10B981',
            error:   '#EF4444',
            warning: '#F59E0B',
            info:    '#1B2B8B'
        };

        el.textContent = message;
        el.style.backgroundColor = colorMap[type] || colorMap.success;
        el.style.color  = '#ffffff';
        el.style.border = '2px solid rgba(255,255,255,0.3)';
        el.classList.add('show');
        setTimeout(function() { el.classList.remove('show'); }, 3500);
    }
    // Expose immediately — inline onclick handlers use this before DOMContentLoaded
    window.showNotification = showNotification;


    /* =========================================================================
       §4  FORM HELPERS
       ========================================================================= */

    /**
     * Display a styled feedback message below a form.
     * Looks for an element with id "${formId}-feedback".
     *
     * @param {string} formId    — Base ID of the form (e.g. "login")
     * @param {string} message   — Feedback text
     * @param {'error'|'success'|'warning'|'info'} [type='error']
     */
    function showFormFeedback(formId, message, type) {
        type = type || 'error';
        var feedbackEl = document.getElementById(formId + '-feedback');
        if (!feedbackEl) return;
        feedbackEl.textContent = message;
        feedbackEl.className   = 'form-feedback ' + type;
        feedbackEl.style.display = 'block';
    }
    window.showFormFeedback = showFormFeedback;

    /**
     * Generate a new random 6-character alphanumeric CAPTCHA and inject it
     * into #captcha-code.  Also clears the current input field.
     */
    function generateCaptcha() {
        var captchaCodeEl = document.getElementById('captcha-code');
        if (!captchaCodeEl) return;

        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var code  = Array.from({ length: 6 }, function() {
            return chars.charAt(Math.floor(Math.random() * chars.length));
        }).join('');

        // Update both the DOM and the EmpState reference
        captchaCodeEl.textContent = code;
        if (window.EmpState) window.EmpState.captchaCode = code;
        else                 window.captchaCode           = code;

        var input = document.getElementById('login-captcha-input');
        if (input) input.value = '';
    }
    window.generateCaptcha = generateCaptcha;


    /* =========================================================================
       §5  RICH TEXT RENDERER
       ========================================================================= */

    /**
     * Convert plain post/comment text into HTML with:
     * • HTML escaping (XSS safe)
     * • Auto-linked URLs (YouTube, WhatsApp, Twitter, Instagram, LinkedIn, Facebook)
     * • WhatsApp-style *bold*, _italic_, ~strikethrough~, `code`
     * • @mention highlighting → navigates to user profile on click
     * • #hashtag highlighting
     * • Newline → <br>
     *
     * @param {string} text — Raw post text
     * @returns {string}    — Safe HTML string
     */
    function formatWhatsAppText(text) {
        if (!text) return '';

        // 1. Escape HTML
        var t = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 2. Auto-linkify URLs — https/www AND a bare domain with no
        // prefix at all (e.g. "joinempyrean.com" typed plain). See
        // app-fixes.js's copy of this function for the full explanation
        // of the third regex alternative and the trailing-punctuation trim.
        t = t.replace(
            /(https?:\/\/[^\s<>"'&]+|www\.[^\s<>"'&]+\.[a-z]{2,}[^\s<>"'&]*|(?<![a-zA-Z0-9@._-])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|edu|gov|mil|co|io|ng|app|dev|me|info|biz|xyz|live|tv|ai|shop|store|online|site|uk|ca|us|in|za|gh|ke)(?:\/[^\s<>"'&]*)?\b)/gi,
            function(rawUrl) {
                var trail = '';
                var trailMatch = rawUrl.match(/[.,!?;:)\]]+$/);
                if (trailMatch) { trail = trailMatch[0]; rawUrl = rawUrl.slice(0, -trail.length); }
                if (!rawUrl) return rawUrl + trail;
                var url = rawUrl;
                var href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
                var icon = '🔗';
                if      (/youtube\.com|youtu\.be/i.test(href))                    icon = '▶️';
                else if (/whatsapp\.com|wa\.me/i.test(href))                      icon = '💬';
                else if (/twitter\.com|x\.com/i.test(href))                       icon = '𝕏';
                else if (/instagram\.com/i.test(href))                            icon = '📷';
                else if (/linkedin\.com/i.test(href))                             icon = '💼';
                else if (/facebook\.com|fb\.com/i.test(href))                     icon = '👥';
                var label = url.length > 45 ? url.substring(0, 45) + '…' : url;
                return '<a href="' + href + '" target="_blank" rel="noopener noreferrer"'
                    + ' style="color:var(--secondary);text-decoration:underline;font-weight:500;">'
                    + icon + ' ' + label + '</a>' + trail;
            }
        );

        // 3. WhatsApp markdown
        // FIX (this session — "paragraph formatting quality"): a run of
        // 2+ newlines used to just become stacked <br><br> tags — visible,
        // but cramped and inconsistent (browsers render doubled <br>s with
        // uneven gaps depending on surrounding line-height). Two-or-more
        // newlines now become a real block-level spacer with a
        // deliberate, consistent gap — reads as an actual paragraph break
        // instead of "extra blank lines". A single newline still just
        // becomes a normal line break within the same paragraph.
        t = t
            .replace(/\*(.*?)\*/g,   '<strong>$1</strong>')
            .replace(/_(.*?)_/g,     '<em>$1</em>')
            .replace(/~(.*?)~/g,     '<s>$1</s>')
            .replace(/`(.*?)`/g,
                '<code style="background:rgba(10,14,39,0.08);padding:1px 5px;'
                + 'border-radius:4px;font-family:monospace;font-size:0.88em;">$1</code>'
            )
            .replace(/\n{2,}/g, '<span style="display:block;height:0.65em;"></span>')
            .replace(/\n/g, '<br>');

        // 4. @mention
        t = t.replace(/@([a-zA-Z0-9_\.]+)/g, function(match, username) {
            return '<a href="#" class="mention-tag" data-username="' + username + '"'
                + ' style="color:var(--secondary);font-weight:700;text-decoration:none;'
                + 'background:rgba(27,43,139,0.09);border-radius:4px;padding:1px 4px;">'
                + '@' + username + '</a>';
        });

        // 5. #hashtag
        t = t.replace(/#([a-zA-Z0-9_]+)/g, function(match, tag) {
            return '<a href="#" class="hashtag-tag" data-tag="' + tag + '"'
                + ' style="color:var(--accent-color);font-weight:700;text-decoration:none;'
                + 'background:rgba(245,197,24,0.12);border-radius:4px;padding:1px 4px;">'
                + '#' + tag + '</a>';
        });

        return t;
    }
    window.formatWhatsAppText = formatWhatsAppText;


    /* =========================================================================
       §6  UPLOAD UTILITIES
       ========================================================================= */

    /**
     * Polyfill for uploadMediaFilesToCloudinary.
     * Only installed if a previous script hasn't already defined it
     * (app-dom.js may define the canonical version; this is the fallback).
     *
     * Accepts a mixed array of File objects, blob URLs, or already-uploaded
     * Cloudinary URLs.  Skips items that are already uploaded.
     * Waits up to 8 s for window.uploadToCloudinary to become available.
     *
     * @param {Array<File|string>} files
     * @returns {Promise<string[]>} Array of Cloudinary URLs (empty string on failure)
     */
    if (typeof window.uploadMediaFilesToCloudinary !== 'function') {
        window.uploadMediaFilesToCloudinary = async function uploadMediaFilesToCloudinary(files) {
            if (!files || files.length === 0) return [];

            // Wait for app-dom.js / Cloudinary SDK to expose uploadToCloudinary
            var _waited = 0;
            while (typeof window.uploadToCloudinary !== 'function' && _waited < 8000) {
                await new Promise(function(r) { setTimeout(r, 200); });
                _waited += 200;
            }
            if (typeof window.uploadToCloudinary !== 'function') {
                console.error('[uploadMediaFilesToCloudinary] uploadToCloudinary not available after 8 s');
                return Array.from(files).map(function(f) {
                    return f._cloudUrl || (f instanceof File ? '' : (typeof f === 'string' ? f : ''));
                });
            }

            var results = await Promise.all(
                Array.from(files).map(function(file) {
                    // Already uploaded — skip
                    if (file._cloudUrl && !file._cloudUrl.startsWith('blob:')) {
                        return Promise.resolve(file._cloudUrl);
                    }
                    // Not a File object — pass string through unchanged
                    if (!(file instanceof File)) {
                        return Promise.resolve(typeof file === 'string' ? file : '');
                    }
                    return window.uploadToCloudinary(file, null)
                        .then(function(url) {
                            if (url && !url.startsWith('blob:')) {
                                file._cloudUrl = url;
                                return url;
                            }
                            return '';
                        })
                        .catch(function(err) {
                            console.warn('[uploadMediaFilesToCloudinary] upload failed:', err && err.message);
                            return '';
                        });
                })
            );
            return results;
        };
        console.log('[EmpHelpers] uploadMediaFilesToCloudinary polyfill installed.');
    }

    /**
     * Show or update a progress bar beneath a given container element.
     * Creates the progress bar DOM on first call; removes it at 100 %.
     *
     * @param {string} containerId — ID of the parent element (NOT the bar itself)
     * @param {number} pct         — 0–100
     */
    function showUploadProgress(containerId, pct) {
        var cont = document.getElementById(containerId + '-progress');
        if (!cont) {
            var parentEl = document.getElementById(containerId);
            if (!parentEl) return;
            cont = document.createElement('div');
            cont.id        = containerId + '-progress';
            cont.className = 'upload-progress-container';
            cont.innerHTML = '<div class="upload-progress-bar" style="width:0%;"></div>';
            parentEl.appendChild(cont);
        }
        var bar = cont.querySelector('.upload-progress-bar');
        if (bar) bar.style.width = pct + '%';
        if (pct >= 100) setTimeout(function() { if (cont) cont.remove(); }, 800);
    }
    window.showUploadProgress = showUploadProgress;


    /* =========================================================================
       §7  IMAGE & MEDIA PREVIEW HELPERS
       ========================================================================= */

    /**
     * Resize and centre-crop an image File to the target dimensions using
     * an offscreen canvas.  Result is a JPEG data URL delivered via callback.
     *
     * Used by handleAvatarUpload() to normalise profile pictures.
     *
     * @param {File}     file     — Source image file
     * @param {number}   width    — Target width in px
     * @param {number}   height   — Target height in px
     * @param {Function} callback — Called with (dataUrl: string)
     */
    function resizeAndCropImage(file, width, height, callback) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var img   = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                var ctx    = canvas.getContext('2d');
                canvas.width  = width;
                canvas.height = height;

                var srcX, srcY, srcW, srcH;
                var imgRatio    = img.width / img.height;
                var targetRatio = width / height;

                if (imgRatio > targetRatio) {
                    // Image is wider than target — crop sides
                    srcH = img.height;
                    srcW = srcH * targetRatio;
                    srcX = (img.width - srcW) / 2;
                    srcY = 0;
                } else {
                    // Image is taller than target — crop top/bottom
                    srcW = img.width;
                    srcH = srcW / targetRatio;
                    srcY = (img.height - srcH) / 2;
                    srcX = 0;
                }

                ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, width, height);
                callback(canvas.toDataURL('image/jpeg'));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
    window.resizeAndCropImage = resizeAndCropImage;

    /**
     * Load a profile picture or cover photo File into an <img> preview element.
     * When isProfilePic is true the image is resized/cropped to 150 × 150 px
     * and stored in the appropriate EmpState media-buffer slot.
     *
     * @param {File|null} file        — Selected file (null clears the preview)
     * @param {string}    previewId   — ID of the <img> element to update
     * @param {boolean}   [isProfilePic=false]
     */
    function handleAvatarUpload(file, previewId, isProfilePic) {
        isProfilePic = isProfilePic || false;
        var preview = document.getElementById(previewId);
        if (!preview) return;

        // Clear state
        if (!file) {
            preview.src = '';
            preview.classList.remove('active');
            var icon = preview.nextElementSibling;
            if (icon && icon.classList.contains('upload-icon')) icon.style.opacity = 1;
            return;
        }

        function displayImage(dataUrl) {
            preview.src = dataUrl;
            if (!preview.classList.contains('active')) preview.classList.add('active');
            var icon = preview.nextElementSibling;
            if (icon && icon.classList.contains('upload-icon')) icon.style.opacity = 0;
        }

        if (isProfilePic) {
            resizeAndCropImage(file, 150, 150, function(dataUrl) {
                // Store in EmpState (falls back to window.* if EmpState not loaded)
                var S = window.EmpState || window;
                if (previewId === 'avatar-preview')  S.newAvatarFile = dataUrl;
                if (previewId === 'profile-pic-img') S.newAvatarFile = dataUrl;
                displayImage(dataUrl);
            });
        } else {
            var reader = new FileReader();
            reader.onload = function(e) { displayImage(e.target.result); };
            reader.readAsDataURL(file);
        }
    }
    window.handleAvatarUpload = handleAvatarUpload;

    /**
     * Render a responsive media-preview grid inside a container element.
     * Supports 1–4+ image/video Files.  Files beyond 4 are hidden with an
     * overflow badge.  Each item has an × remove button.
     *
     * Grid layout:
     *   1 file  → single column
     *   2 files → two equal columns
     *   3 files → 2:1 ratio (first item spans 2 rows)
     *   4+ files→ 2×2 grid with "+N" badge on the 4th cell
     *
     * @param {FileList|File[]} files            — Files to preview
     * @param {string}          previewContainerId — ID of the container element
     */
    function handleMediaPreview(files, previewContainerId) {
        var previewContainer = document.getElementById(previewContainerId);
        if (!previewContainer) return;
        previewContainer.innerHTML = '';

        var fileArr = Array.from(files);
        var count   = fileArr.length;

        // Grid setup
        previewContainer.style.display             = 'grid';
        previewContainer.style.gap                 = '4px';
        previewContainer.style.borderRadius        = '14px';
        previewContainer.style.overflow            = 'hidden';
        if      (count === 1)  previewContainer.style.gridTemplateColumns = '1fr';
        else if (count === 2)  previewContainer.style.gridTemplateColumns = '1fr 1fr';
        else if (count === 3)  previewContainer.style.gridTemplateColumns = '2fr 1fr';
        else                   previewContainer.style.gridTemplateColumns = '1fr 1fr';

        fileArr.forEach(function(file, idx) {
            var url          = URL.createObjectURL(file);
            var mediaWrapper = document.createElement('div');
            mediaWrapper.style.cssText = 'position:relative;overflow:hidden;background:#f0f0f0;';
            if (count === 3 && idx === 0) mediaWrapper.style.gridRow = '1 / 3';
            mediaWrapper.style.height = count === 1 ? '240px' : '160px';

            var mediaEl;
            if (file.type.startsWith('image/')) {
                mediaEl = document.createElement('img');
                mediaEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            } else if (file.type.startsWith('video/')) {
                mediaEl = document.createElement('video');
                mediaEl.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
                mediaEl.controls  = true;
                mediaEl.muted     = true;
                mediaEl.loop      = true;
                mediaEl.autoplay  = true;
            }

            // "+N more" badge on 4th cell when there are >4 files
            if (count > 4 && idx === 3) {
                var badge = document.createElement('div');
                badge.style.cssText = 'position:absolute;inset:0;background:rgba(10,14,39,0.6);'
                    + 'display:flex;align-items:center;justify-content:center;color:white;'
                    + 'font-size:1.5rem;font-weight:800;font-family:Syne,sans-serif;';
                badge.textContent = '+' + (count - 4);
                mediaWrapper.appendChild(badge);
            }

            if (mediaEl) {
                mediaEl.src = url;
                mediaWrapper.appendChild(mediaEl);
            }

            // Remove button
            var removeBtn     = document.createElement('button');
            removeBtn.type    = 'button';
            removeBtn.style.cssText =
                'position:absolute;top:5px;right:5px;background:rgba(239,68,68,0.85);'
                + 'border:none;color:white;border-radius:50%;width:22px;height:22px;'
                + 'font-size:0.75rem;cursor:pointer;display:flex;align-items:center;'
                + 'justify-content:center;line-height:1;z-index:3;';
            removeBtn.innerHTML = '×';
            removeBtn.addEventListener('click', function() { mediaWrapper.remove(); });
            mediaWrapper.appendChild(removeBtn);

            previewContainer.appendChild(mediaWrapper);
            if (count > 4 && idx >= 4) mediaWrapper.style.display = 'none';
        });
    }
    window.handleMediaPreview = handleMediaPreview;

    /**
     * Render a responsive media preview grid for marketplace listing images/videos.
     * Accepts File objects or already-uploaded URL strings.
     * Mirrors handleMediaPreview layout but also handles string URLs from
     * existing listings (edit flow).
     *
     * @param {Array<File|string>} filesArray
     * @param {HTMLElement}        previewContainer — Direct reference (not ID)
     */
    function handleMarketplacePreview(filesArray, previewContainer) {
        if (!previewContainer) return;
        if (!filesArray || filesArray.length === 0) {
            previewContainer.innerHTML = '';
            return;
        }
        previewContainer.innerHTML = '';

        var count = filesArray.length;
        previewContainer.style.display             = 'grid';
        previewContainer.style.gap                 = '4px';
        previewContainer.style.borderRadius        = '12px';
        previewContainer.style.overflow            = 'hidden';
        previewContainer.style.marginTop           = '8px';

        if      (count === 1) previewContainer.style.gridTemplateColumns = '1fr';
        else if (count === 2) previewContainer.style.gridTemplateColumns = '1fr 1fr';
        else if (count === 3) previewContainer.style.gridTemplateColumns = '2fr 1fr';
        else                  previewContainer.style.gridTemplateColumns = '1fr 1fr';

        Array.from(filesArray).forEach(function(file, idx) {
            if (idx >= 4) return;

            var url    = (typeof file === 'string') ? file : URL.createObjectURL(file);
            var type   = (typeof file === 'string')
                ? (file.match(/\.(mp4|webm|mov)/i) ? 'video' : 'image')
                : (file.type || '');
            var isVid  = type.startsWith('video') || /\.(mp4|webm|mov)/i.test(url);
            var height = count === 1 ? '220px' : '150px';

            var cell = document.createElement('div');
            cell.style.cssText = 'overflow:hidden;height:' + height
                + ';background:#f0f0f0;position:relative;'
                + (count === 3 && idx === 0 ? 'grid-row:1/3;' : '');

            cell.innerHTML = isVid
                ? '<video src="' + url + '" style="width:100%;height:100%;object-fit:cover;" muted playsinline controls></video>'
                : '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">';

            // "+N more" badge
            if (count > 4 && idx === 3) {
                var badge = document.createElement('div');
                badge.style.cssText =
                    'position:absolute;inset:0;background:rgba(0,0,0,0.6);color:white;'
                    + 'font-size:1.5rem;font-weight:800;display:flex;align-items:center;justify-content:center;';
                badge.textContent = '+' + (count - 3);
                cell.appendChild(badge);
            }
            previewContainer.appendChild(cell);
        });
    }
    window.handleMarketplacePreview = handleMarketplacePreview;


    /* =========================================================================
       §8  SHARE
       ========================================================================= */

    /**
     * Share content using the Web Share API with clipboard fallback.
     * Awards a SHARE_POST impact-mining reward on success.
     *
     * @param {{ title?: string, text?: string, url: string }} shareData
     * @returns {Promise<void>}
     */
    async function shareContent(shareData) {
        var copied = false;

        // Clipboard fallback (always tried first — desktop-friendly)
        if (navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(shareData.url);
                showNotification('Link copied to clipboard!');
                copied = true;
            } catch (err) {
                console.error('[shareContent] Clipboard write failed:', err);
            }
        }

        // Web Share API (mobile / PWA)
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                if (err.name !== 'AbortError') console.error('[shareContent] Web Share API error:', err);
            }
        } else if (!copied) {
            showNotification('Sharing not supported on this browser.', 'error');
        }

        // Reward the sharing action
        if (typeof window.rewardUserForAction === 'function') {
            window.rewardUserForAction('SHARE_POST');
        }
    }
    window.shareContent = shareContent;


    /* =========================================================================
       §9  IMPACT MINING REWARD
       ========================================================================= */

    /* REMOVED (2026-08-15 — engagement-attribution/reward-engine audit):
       this file used to have its own private rewardUserForAction() here,
       with its own copy of the rate table (still the OLD, pre-reduction
       amounts — VERIFIED_CRISIS_REPORT: 50 vs the current 0.025, etc.) and
       its own un-migrated direct Firestore write, running independently of
       app-impactmining.js — the exact same "second, independent reward
       implementation" problem app-impactmining.js's own §1 header comment
       already documented and fixed for app-fix-final.js §43 and for this
       file's sibling copy inside app-fixes.js (see that file's own
       "MOVED (2026-07)" comment at the same spot) — app-helper.js was
       simply missed in that earlier pass.

       This copy also still paid RECEIVE_COMMENT/RECEIVE_LIKE to the post
       OWNER (0.2/0.1 EMPY) — the exact mis-attributed behavior just
       retired from app-impactmining.js and server.js this same session
       (engagement rewards belong to whoever does the liking/commenting,
       not the post owner — see those files' own RETIRED notes). Because
       index.html loads app-helper.js BEFORE app-impactmining.js, this copy
       was harmless today only by load-order accident: app-impactmining.js's
       own window.rewardUserForAction assignment runs right after and wins.
       That's not something to depend on — if load order ever changed, this
       stale, wrong-attribution, wrong-rate, un-migrated implementation
       would silently become the live one again.

       Function removed entirely, not neutered in place — every bare
       `rewardUserForAction(...)` call elsewhere in this file (see
       shareContent() above) already goes through `window.rewardUserForAction`
       via normal JS scope lookup, since there's no local declaration
       shadowing it anymore. It now resolves to app-impactmining.js's
       dispatcher, the single canonical reward engine — no call sites here
       needed to change. */


    /* =========================================================================
       §10  KYC DATE SELECTORS
       ========================================================================= */

    /**
     * Populate the three DOB <select> elements (day / month / year) inside
     * #individual-kyc-form.  Restricts year range to 18–100 years before today.
     */
    function populateDobSelectors() {
        var dayEl   = document.querySelector('#individual-kyc-form .date-select-group select:nth-child(1)');
        var monthEl = document.querySelector('#individual-kyc-form .date-select-group select:nth-child(2)');
        var yearEl  = document.querySelector('#individual-kyc-form .date-select-group select:nth-child(3)');
        if (!dayEl || !monthEl || !yearEl) return;

        dayEl.innerHTML   = '<option value="">Day</option>';
        monthEl.innerHTML = '<option value="">Month</option>';
        yearEl.innerHTML  = '<option value="">Year</option>';

        for (var d = 1; d <= 31; d++) {
            dayEl.innerHTML += '<option value="' + d + '">' + d + '</option>';
        }

        var months = [
            'January','February','March','April','May','June',
            'July','August','September','October','November','December'
        ];
        months.forEach(function(m, i) {
            monthEl.innerHTML += '<option value="' + (i + 1) + '">' + m + '</option>';
        });

        var currentYear = new Date().getFullYear();
        for (var y = currentYear - 18; y >= currentYear - 100; y--) {
            yearEl.innerHTML += '<option value="' + y + '">' + y + '</option>';
        }
    }
    window.populateDobSelectors = populateDobSelectors;


    /* =========================================================================
       §11  ERROR RECOVERY
       ========================================================================= */

    /**
     * Global JS error handler.
     * Logs to console and — on blank-screen detection — reloads once.
     * Uses sessionStorage flag to prevent reload loop.
     */
    window.onerror = function(msg, src, line, col /*, err */) {
        console.error('[Empyrean Error]', msg, 'at', src, line + ':' + col);
        try {
            var mainEl = document.getElementById('main-content') || document.getElementById('app');
            if (mainEl && mainEl.children.length === 0) {
                var key = 'empyrean_blank_recovery';
                if (!sessionStorage.getItem(key)) {
                    sessionStorage.setItem(key, '1');
                    console.warn('[Empyrean] Blank screen detected — reloading once…');
                    location.reload();
                } else {
                    sessionStorage.removeItem(key);
                }
            }
        } catch (_) {}
        return false; // allow default browser error handling
    };

    /**
     * Catch unhandled promise rejections — prevents silent failures swallowing
     * Firebase / Agora errors in production.
     * FIX (2026-08-12): this was a byte-for-byte duplicate of the
     * 'unhandledrejection' listener app-fixes.js also registers on the same
     * window — addEventListener doesn't replace a prior listener the way an
     * onX= assignment would, so BOTH ran on every single rejection, doubling
     * (and, alongside app-patch-v38.js's own diagnostic listener, tripling)
     * every "[Empyrean Promise]" console line — including the real
     * FirebaseError/permission-denied bursts, which made an already-serious
     * error look even noisier than it was. Left as a single source of truth
     * in app-fixes.js (the actively-maintained fix-aggregation file, loaded
     * right alongside its matching window.onerror/blank-screen-guard logic)
     * rather than here.
     */

    /**
     * Blank-screen guard.
     * If a JS error fires and no content section is visible, recover to the
     * dashboard.  Also runs on a 5 s interval for the first 60 s of page load.
     */
    (function _blankScreenGuard() {
        function _checkAndRecover() {
            try {
                var sections   = document.querySelectorAll('.content-section');
                var anyVisible = Array.from(sections).some(function(s) {
                    return s.style.display !== 'none' && s.offsetParent !== null;
                });
                if (!anyVisible) {
                    var dash = document.getElementById('dashboard');
                    if (dash) {
                        dash.style.display = 'block';
                        console.warn('[Empyrean] Blank screen recovered → dashboard');
                    }
                }
            } catch (_) {}
        }

        window.addEventListener('error',            function() { setTimeout(_checkAndRecover, 1200); }, true);
        window.addEventListener('unhandledrejection',function() { setTimeout(_checkAndRecover, 1200); });

        // Periodic safety net: runs every 5 s for the first 60 s
        var _count = 0;
        var _timer = setInterval(function() {
            if (++_count > 12) { clearInterval(_timer); return; }
            if (document.body && document.body.children.length > 2) _checkAndRecover();
        }, 5000);
    })();

    /**
     * Inject the "Read more / Read less" and suggested-user CSS into <head>.
     * Idempotent — checks for existing style tag before inserting.
     */
    (function _injectArticleCollapseCSS() {
        if (document.getElementById('_article_collapse_css')) return;
        var s    = document.createElement('style');
        s.id     = '_article_collapse_css';
        s.textContent = [
            '.story-content { position: relative; }',
            '.news-item-content { position: relative; }',
            '.post-text-rest { display: none; }',
            '.post-read-more, .post-read-less {',
            '  display: inline-block; margin-top: 6px;',
            '  font-size: 0.83rem; font-weight: 700;',
            '  color: var(--secondary, #1B2B8B);',
            '  cursor: pointer; text-decoration: none;',
            '  border: none; background: none; padding: 0;',
            '  transition: opacity 0.15s;',
            '}',
            '.post-read-more:hover, .post-read-less:hover { opacity: 0.7; }',
            '.post-text-overflow { color: inherit; display: inline; }',
            '.suggested-user-card {',
            '  background: white; border-radius: 14px;',
            '  overflow: hidden; border: 1.5px solid rgba(10,14,39,0.08);',
            '  box-shadow: 0 2px 12px rgba(10,14,39,0.07);',
            '  display: flex; flex-direction: column;',
            '  cursor: pointer; transition: box-shadow 0.18s, transform 0.18s;',
            '  min-width: 240px; max-width: 280px; flex-shrink: 0;',
            '}',
            '.suggested-user-card:hover {',
            '  box-shadow: 0 6px 24px rgba(27,43,139,0.14);',
            '  transform: translateY(-2px);',
            '}'
        ].join('\n');
        document.head.appendChild(s);
    })();


    /* =========================================================================
       DONE
       ========================================================================= */
    console.log('[EmpHelpers] ✅ Helper utilities ready.');

})();