/* ═══════════════════════════════════════════════════════════════════
   EMPYREAN — LINK PREVIEW PATCH  (v2.0)
   ─────────────────────────────────────────────────────────────────
   Features:
   1. URL auto-linkification in post text (formatWhatsAppText patch)
   2. Empyrean internal links → fetch post from Firestore → rich card
      (handles ?post=ID, #post/ID, #post/crisis, #post/sos patterns)
   3. External links → OGP preview card via allorigins proxy
   4. MutationObserver watches chat container for new messages
   ═══════════════════════════════════════════════════════════════════ */

(function empyreanLinkPreview() {
    'use strict';

    if (window._empLinkPreviewLoaded) return;
    window._empLinkPreviewLoaded = true;

    /* ── URL regex ─────────────────────────────────────────────────── */
    var URL_RE = /(https?:\/\/[^\s<>"']{4,})/gi;

    /* ── HTML escape ────────────────────────────────────────────────── */
    function _esc(s) {
        return String(s || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ── Extract domain ─────────────────────────────────────────────── */
    function _domain(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch(e) { return ''; }
    }

    /* ── Is this an internal Empyrean URL? ──────────────────────────── */
    function _parseEmpyreanUrl(url) {
        /* Matches patterns like:
           ?post=post-1780644841148-5012
           ?post=crisis-1780172173329
           ?post=sos-...
           #post/crisis   (with data-post-id on a card)
           #post/1780...
        */
        try {
            var parsed = new URL(url);
            /* Query param style: ?post=<id> */
            var postParam = parsed.searchParams.get('post');
            if (postParam) return _classifyId(postParam);
            /* Hash style: #post/crisis or #post/<id> */
            var hash = parsed.hash || '';
            var hashMatch = hash.match(/^#post\/(.+)$/);
            if (hashMatch) return _classifyId(hashMatch[1]);
            /* Fragment in path (localhost dev URLs) */
            var pathMatch = url.match(/[#?]post[=/]([^&\s]+)/);
            if (pathMatch) return _classifyId(pathMatch[1]);
        } catch(e) {}
        return null;
    }

    function _classifyId(id) {
        if (!id) return null;
        if (id.startsWith('crisis')) return { collection: 'crisis_reports', id: id };
        if (id.startsWith('sos'))    return { collection: 'sos_queue',       id: id };
        return { collection: 'posts', id: id };
    }


    /* ═══════════════════════════════════════════════════════════════
       §1  CSS
    ═══════════════════════════════════════════════════════════════ */
    (function _css() {
        if (document.getElementById('_elp_css')) return;
        var s = document.createElement('style');
        s.id = '_elp_css';
        s.textContent = [
            /* Clickable highlighted links */
            'a.elp-link{',
            '  color:#1B2B8B;font-weight:600;',
            '  text-decoration:underline;text-decoration-color:rgba(27,43,139,.35);',
            '  word-break:break-all;cursor:pointer;transition:color .15s;',
            '}',
            'a.elp-link:hover{ color:#0d1f7a; }',
            '[data-elp-sent="1"] a.elp-link{ color:#cce0ff;text-decoration-color:rgba(204,224,255,.5); }',
            '[data-elp-sent="1"] a.elp-link:hover{ color:#fff; }',

            /* Preview card */
            '.elp-card{',
            '  display:flex;flex-direction:column;',
            '  border-radius:14px;overflow:hidden;',
            '  border:1px solid rgba(27,43,139,.18);',
            '  background:#f8f9ff;margin-top:10px;',
            '  max-width:320px;cursor:pointer;',
            '  box-shadow:0 2px 12px rgba(27,43,139,.12);',
            '  text-decoration:none;',
            '  transition:box-shadow .18s,transform .18s;',
            '}',
            '.elp-card:hover{ box-shadow:0 6px 22px rgba(27,43,139,.2);transform:translateY(-2px); }',
            '.elp-card-img,.elp-card-media{',
            '  width:100%;max-height:240px;object-fit:cover;display:block;',
            '  background:linear-gradient(135deg,#e8eaf6,#c5cae9);',
            '}',
            'video.elp-card-media{ max-height:280px;background:#000;cursor:default; }',
            'iframe.elp-card-media{ height:220px;border:0;background:#000; }',
            '.elp-card-playshell{ position:relative;cursor:pointer; }',
            '.elp-play-btn{',
            '  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            '  width:54px;height:54px;border-radius:50%;border:none;cursor:pointer;',
            '  background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;',
            '  transition:background .15s,transform .15s;padding:0;',
            '}',
            '.elp-play-btn:hover{ background:rgba(0,0,0,.72);transform:translate(-50%,-50%) scale(1.06); }',
            '.elp-card-body{ padding:12px 14px 11px; }',
            '.elp-card-title{',
            '  font-size:1.02rem;font-weight:700;color:#0A0E27;',
            '  margin:0 0 4px;line-height:1.3;',
            '  display:-webkit-box;-webkit-line-clamp:2;',
            '  -webkit-box-orient:vertical;overflow:hidden;',
            '}',
            '.elp-card-desc{',
            '  font-size:.82rem;color:#374151;line-height:1.45;margin-bottom:8px;',
            '  display:-webkit-box;-webkit-line-clamp:2;',
            '  -webkit-box-orient:vertical;overflow:hidden;',
            '}',
            '.elp-card-domain{',
            '  font-size:.78rem;color:#1B2B8B;font-weight:600;',
            '  display:inline-flex;align-items:center;gap:5px;',
            '  text-decoration:none;',
            '}',
            '.elp-card-domain:hover{ text-decoration:underline; }',

            /* Loading state */
            '.elp-loading{',
            '  display:flex;align-items:center;gap:9px;',
            '  padding:11px 13px;font-size:.78rem;color:#6B7280;',
            '  border-radius:12px;border:1px solid rgba(27,43,139,.13);',
            '  background:#f8f9ff;margin-top:8px;max-width:320px;',
            '}',
            '.elp-spinner{',
            '  width:15px;height:15px;border-radius:50%;flex-shrink:0;',
            '  border:2px solid #e5e7eb;border-top-color:#1B2B8B;',
            '  animation:elpSpin .7s linear infinite;',
            '}',
            '@keyframes elpSpin{ to{ transform:rotate(360deg); } }',

            /* Sent bubble dark variants */
            '[data-elp-sent="1"] .elp-card{ background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.24); }',
            '[data-elp-sent="1"] .elp-card-domain{ color:#93c5fd; }',
            '[data-elp-sent="1"] .elp-card-title{ color:#fff; }',
            '[data-elp-sent="1"] .elp-card-desc{ color:rgba(255,255,255,.8); }',
            '[data-elp-sent="1"] .elp-loading{ background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.7); }',
        ].join('\n');
        document.head.appendChild(s);
    })();


    /* ═══════════════════════════════════════════════════════════════
       §2  Linkify raw text → HTML with <a> tags
    ═══════════════════════════════════════════════════════════════ */
    function _linkify(html) {
        /* FIX (2026-08-20 — post/comment/chat text showing raw
           target="_blank" rel="noopener noreferrer" style="..." markup
           as literal visible text instead of a working link):
           formatWhatsAppText() (app-fixes.js / app-patch-v41.js's
           _richFormatText override) already turns every http(s)/www URL
           in the text into a complete, real <a href="...">…</a> tag
           with its own platform icon BEFORE this function ever sees the
           text — via the formatWhatsAppText wrap in §3 below, and again
           whenever this file re-scans already-rendered post/chat HTML
           in §6/§8. URL_RE above has no concept of HTML structure, so
           re-running it against text that is already linkified matches
           the URL sitting INSIDE that real anchor's own href="..."
           attribute and wraps just that substring in a SECOND, nested
           <a> tag. Browsers can't parse that broken nested markup as one
           tag, so the outer tag's own target=/rel=/style= attributes
           spill out and render as plain visible text — exactly the bug
           reported. Any URL a person could still want linkified has
           already been caught by formatWhatsAppText itself, so it's
           always safe to leave already-linkified HTML untouched here. */
        if (/<a[\s>]/i.test(html)) return html;
        return html.replace(URL_RE, function(url) {
            return '<a class="elp-link" href="' + _esc(url)
                + '" target="_blank" rel="noopener noreferrer">' + _esc(url) + '</a>';
        });
    }


    /* ═══════════════════════════════════════════════════════════════
       §3  Patch formatWhatsAppText → linkify post body text
    ═══════════════════════════════════════════════════════════════ */
    function _patchFormat() {
        var orig = window.formatWhatsAppText;
        if (typeof orig !== 'function' || orig._elpPatched) return;
        window.formatWhatsAppText = function(t) {
            return _linkify(orig.apply(this, arguments));
        };
        window.formatWhatsAppText._elpPatched = true;
    }
    _patchFormat();
    window.addEventListener('empyrean:firebase-ready', function(){ setTimeout(_patchFormat, 200); });
    document.addEventListener('empyrean-init-done',    function(){ setTimeout(_patchFormat, 300); });


    /* ═══════════════════════════════════════════════════════════════
       §4  Fetch preview data — Empyrean post (Firestore) or OGP
    ═══════════════════════════════════════════════════════════════ */
    var _cache = {};

    /* Internal: fetch from Firestore */
    function _fetchInternal(info) {
        var key = info.collection + '/' + info.id;
        if (_cache[key]) return _cache[key];
        _cache[key] = new Promise(function(resolve) {
            /* Wait for Firebase to be ready */
            function _attempt(tries) {
                if (!window.fbDb || !window._firebaseLoaded) {
                    if (tries < 15) { setTimeout(function(){ _attempt(tries+1); }, 400); }
                    else { resolve(null); }
                    return;
                }
                window.fbDb.collection(info.collection).doc(info.id).get()
                    .then(function(snap) {
                        if (!snap || !snap.exists) { resolve(null); return; }
                        var d = snap.data();
                        /* Normalise across posts / crisis / sos */
                        var title  = d.text || d.story || d.description || d.title || '';
                        var author = d.author || d.username || d.authorName || d.reportedBy || 'Empyrean';
                        var media  = d.mediaFiles || d.media || d.mediaUrls || [];
                        var img    = '';
                        if (Array.isArray(media) && media.length) {
                            var first = media[0];
                            img = (typeof first === 'string') ? first
                                : (first._cloudUrl || first.url || '');
                            /* Skip video URLs for thumbnail */
                            if (/\.(mp4|webm|mov|avi|mkv)/i.test(img)) img = '';
                        }
                        if (!img && d.avatar)       img = d.avatar;
                        if (!img && d.coverPhoto)   img = d.coverPhoto;
                        resolve({
                            type:   'internal',
                            title:  (author ? '@' + author + ': ' : '') + title.slice(0, 140),
                            desc:   d.type || d.crisisType || d.category || '',
                            image:  img,
                            domain: 'Empyrean',
                            label:  info.collection === 'crisis_reports' ? '🚨 Crisis Report'
                                  : info.collection === 'sos_queue'       ? '🆘 SOS Alert'
                                  : '📣 Post',
                        });
                    })
                    .catch(function(){ resolve(null); });
            }
            _attempt(0);
        });
        return _cache[key];
    }

    /* External: OGP via allorigins */
    function _fetchExternal(url) {
        if (_cache[url]) return _cache[url];
        _cache[url] = fetch(
            'https://api.allorigins.win/get?url=' + encodeURIComponent(url),
            { cache: 'force-cache', signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined }
        )
        .then(function(r){ return r.json(); })
        .then(function(d){
            var html = d.contents || '';
            var get = function(prop) {
                var m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]+content=["\']([^"\']*)["\']','i'))
                     || html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + prop + '["\']','i'));
                return m ? m[1].trim() : '';
            };
            var title = get('og:title') || get('twitter:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)||[])[1] || '';
            var desc  = get('og:description') || get('twitter:description') || get('description') || '';
            var image = get('og:image') || get('twitter:image') || '';

            /* ── Video detection (so the card can play inline, not just link out) ──
               Two distinct shapes show up in the wild:
               1. og:video / og:video:url / og:video:secure_url → a DIRECT,
                  embeddable media file (mp4/webm). Goes straight into a
                  native <video> tag.
               2. twitter:player → an IFRAME embed URL (this is what X/Twitter
                  itself publishes for video tweets — it does not expose a
                  direct .mp4 via og:video). Goes into an <iframe>, same
                  mechanism Telegram/Discord/WhatsApp use to play X video
                  posts inline without leaving the app. */
            var videoUrl  = get('og:video:secure_url') || get('og:video:url') || get('og:video') || '';
            var videoType = get('og:video:type') || '';
            var isDirectVideo = !!videoUrl && (!videoType || videoType.indexOf('video/') === 0);
            var playerUrl = get('twitter:player') || '';
            if (!isDirectVideo) videoUrl = ''; /* discard non-playable swf/text og:video values */

            if (!title && !image && !playerUrl) return null;
            return {
                type:'external', title:title.slice(0,120), desc:desc.slice(0,180),
                image:image, domain:_domain(url), label:_domain(url),
                videoUrl: videoUrl, playerUrl: playerUrl
            };
        })
        .catch(function(){ return null; });
        return _cache[url];
    }

    function _fetchPreview(url) {
        var info = _parseEmpyreanUrl(url);
        return info ? _fetchInternal(info) : _fetchExternal(url);
    }


    /* ═══════════════════════════════════════════════════════════════
       §5  Build preview card DOM element
    ═══════════════════════════════════════════════════════════════ */
    function _buildCard(meta, url) {
        if (!meta) return null;

        var hasVideo = !!(meta.videoUrl || meta.playerUrl);

        /* Video cards must NOT be a clickable <a> wrapping the whole card —
           tapping the video itself has to play it in place, not navigate
           away. Only the domain footer stays a real link, exactly like the
           reference screenshot's small "🔗 x.com" line under the card. */
        var root = document.createElement(hasVideo ? 'div' : 'a');
        root.className = 'elp-card';
        if (!hasVideo) {
            root.href   = url;
            root.target = '_blank';
            root.rel    = 'noopener noreferrer';
            root.addEventListener('click', function(e){ e.stopPropagation(); });
        }

        var mediaHTML = '';
        if (meta.videoUrl) {
            /* Direct, embeddable media file → native <video>, plays right
               in the chat bubble, full transport controls, no navigation. */
            mediaHTML = '<video class="elp-card-media" src="' + _esc(meta.videoUrl)
                + '" poster="' + _esc(meta.image || '') + '" controls preload="metadata" playsinline></video>';
        } else if (meta.playerUrl) {
            /* iframe embed (this is the path X/Twitter video links use) —
               lazy: shows the thumbnail first, swaps to the live iframe
               only once tapped, so dozens of chat rows don't all load
               iframes/video players simultaneously. */
            mediaHTML = '<div class="elp-card-media elp-card-playshell">'
                + (meta.image ? '<img class="elp-card-img" src="' + _esc(meta.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '')
                + '<button type="button" class="elp-play-btn" aria-label="Play video">'
                + '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M8 5v14l11-7z"/></svg>'
                + '</button></div>';
        } else if (meta.image) {
            mediaHTML = '<img class="elp-card-img" src="' + _esc(meta.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">';
        }

        root.innerHTML = mediaHTML +
            '<div class="elp-card-body">' +
            (meta.title ? '<div class="elp-card-title">' + _esc(meta.title) + '</div>' : '') +
            (meta.desc  ? '<div class="elp-card-desc">'  + _esc(meta.desc)  + '</div>' : '') +
            '<a class="elp-card-domain" href="' + _esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
            _esc(meta.label || meta.domain) + '</a>' +
            '</div>';

        /* Wire the lazy play-button → swap thumbnail for the live iframe player */
        if (meta.playerUrl) {
            var playBtn = root.querySelector('.elp-play-btn');
            var shell   = root.querySelector('.elp-card-playshell');
            if (playBtn && shell) {
                playBtn.addEventListener('click', function(e) {
                    e.preventDefault(); e.stopPropagation();
                    var ifr = document.createElement('iframe');
                    ifr.className = 'elp-card-media';
                    ifr.src = meta.playerUrl;
                    ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                    ifr.setAttribute('allowfullscreen', '');
                    ifr.frameBorder = '0';
                    shell.replaceWith(ifr);
                });
            }
        }
        /* Domain footer link must not bubble up into a card-level handler
           even on the (non-<a>) video card variant. */
        var domainLink = root.querySelector('.elp-card-domain');
        if (domainLink) domainLink.addEventListener('click', function(e){ e.stopPropagation(); });

        return root;
    }


    /* ═══════════════════════════════════════════════════════════════
       §6  Process a single chat message row element
    ═══════════════════════════════════════════════════════════════ */
    function _processRow(row) {
        if (row._elpDone) return;
        row._elpDone = true;

        /* Detect sent vs received */
        var isSent = row.style.justifyContent === 'flex-end'
                  || row.classList.contains('sent')
                  || row.classList.contains('outgoing')
                  || !!(row.querySelector('[style*="1B2B8B"]'));
        if (isSent) row.setAttribute('data-elp-sent','1');

        /* Find the inner text container (the bubble div) */
        var bubble = row.querySelector('[style*="border-radius"],[class*="bubble"],[class*="message-text"]')
                  || row.querySelector('div');
        if (!bubble) return;

        var raw = bubble.innerHTML || '';
        URL_RE.lastIndex = 0;
        if (!URL_RE.test(raw)) { URL_RE.lastIndex = 0; return; }
        URL_RE.lastIndex = 0;

        /* Linkify */
        bubble.innerHTML = _linkify(raw);
        bubble.querySelectorAll('a.elp-link').forEach(function(a){
            a.addEventListener('click', function(e){ e.stopPropagation(); });
        });

        /* Extract first URL → preview card */
        var urls = raw.match(URL_RE) || [];
        URL_RE.lastIndex = 0;
        if (!urls.length) return;
        var firstUrl = urls[0];

        /* Loading placeholder */
        var loader = document.createElement('div');
        loader.className = 'elp-loading';
        loader.innerHTML = '<div class="elp-spinner"></div><span>Loading preview…</span>';
        row.appendChild(loader);

        _fetchPreview(firstUrl).then(function(meta) {
            loader.remove();
            var card = _buildCard(meta, firstUrl);
            if (card) row.appendChild(card);
        });
    }


    /* ═══════════════════════════════════════════════════════════════
       §7  Scan chat container + MutationObserver
    ═══════════════════════════════════════════════════════════════ */
    var _mo = null;

    function _getContainer() {
        return document.getElementById('chat-messages-container')
            || document.getElementById('messages-list')
            || document.querySelector('#chat-view-container .messages-list,.chat-messages,.vf-chat-messages');
    }

    function _scan(root) {
        var rows = (root || document).querySelectorAll(
            '[style*="justify-content"],[class*="message-row"],[class*="msg-row"],[class*="chat-msg"]'
        );
        rows.forEach(function(r){
            URL_RE.lastIndex = 0;
            if (URL_RE.test(r.textContent)) { URL_RE.lastIndex = 0; _processRow(r); }
            URL_RE.lastIndex = 0;
        });
    }

    function _attach() {
        var c = _getContainer();
        if (!c) return;
        if (_mo) _mo.disconnect();
        _mo = new MutationObserver(function(muts){
            muts.forEach(function(m){
                m.addedNodes.forEach(function(n){
                    if (n.nodeType !== 1) return;
                    URL_RE.lastIndex = 0;
                    if (URL_RE.test(n.textContent)) { URL_RE.lastIndex = 0; _processRow(n); }
                    URL_RE.lastIndex = 0;
                    _scan(n);
                });
            });
        });
        _mo.observe(c, { childList:true, subtree:true });
        _scan(c);
    }

    /* Watch for the chat container to appear in the DOM */
    new MutationObserver(function(){ _attach(); })
        .observe(document.body || document.documentElement, { childList:true, subtree:true });

    /* Section-change hook */
    document.addEventListener('empyrean-section-change', function(ev){
        if (ev && ev.detail && ev.detail.section === 'messages') setTimeout(_attach, 380);
    });

    /* Init hooks */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function(){ setTimeout(_attach, 500); });
    } else {
        setTimeout(_attach, 500);
    }
    document.addEventListener('empyrean-init-done', function(){ setTimeout(_attach, 650); });


    /* ═══════════════════════════════════════════════════════════════
       §8  Retroactively linkify post text already in the DOM
    ═══════════════════════════════════════════════════════════════ */
    function _linkifyPosts() {
        document.querySelectorAll('.story-content p, .post-text p').forEach(function(p){
            if (p._elpDone) return;
            p._elpDone = true;
            URL_RE.lastIndex = 0;
            if (!URL_RE.test(p.innerHTML)) { URL_RE.lastIndex = 0; return; }
            URL_RE.lastIndex = 0;
            p.innerHTML = _linkify(p.innerHTML);
            p.querySelectorAll('a.elp-link').forEach(function(a){
                a.addEventListener('click', function(e){ e.stopPropagation(); });
            });
        });
    }
    document.addEventListener('empyrean-init-done', function(){ setTimeout(_linkifyPosts, 900); });

    console.log('[ELP v2] Link preview — Empyrean internal + external OGP active.');

})();