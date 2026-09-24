/* =============================================================================
   EMPYREAN INTERNATIONAL — DIRECT MESSAGES / CHAT
   app-chat.js  |  Step 0.12a  |  Refactor Roadmap v1.0
   =============================================================================

   PURPOSE
   ───────
   Complete messaging system extracted from app-fixes.js.  Covers:

     • createMessageElement(text, isSent, isFile, fileUrl, fileType, messageId)
     • renderContactList()        — contact list with unread badges, last preview
     • openChat(userId)           — open thread, load history, Firestore listener
     • Message form submit        — localStorage + Firestore dual persistence
     • Mobile back button         — responsive contact ↔ chat panel switching
     • Contact search filter      — live filter by name
     • Firestore real-time sync   — incoming message listener per conversation
     • Media attachments          — image / video / audio / file send

   LOAD ORDER
   ──────────
   Must come AFTER: firebase-init, app-state, app-helpers, app-notifications,
   app-auth.

   DEPENDS ON
   ──────────
   • window.EmpState / window.userState / window.mockUsers
   • window.isGuest / window._firebaseLoaded / window.fbDb
   • window._timeAgo          (app-helpers.js)
   • window.formatWhatsAppText (app-helpers.js)
   • window.showNotification   (app-helpers.js)
   • window.pushNotification   (app-notifications.js)
   • window.uploadToCloudinary (app-dom.js — for media attachments)

   PUBLIC API
   ──────────
   window.createMessageElement(text, isSent, isFile?, fileUrl?, fileType?, msgId?)
   window.renderContactList()
   window.openChat(userId)

   SECTION MAP
   ───────────
   §1  createMessageElement — message bubble builder
   §2  renderContactList    — contact list with badges + search
   §3  openChat             — conversation view, history load, Firestore listener
   §4  Message send handler — submit form, localStorage, Firestore write
   §5  Media attachment     — file input + Cloudinary upload
   §6  Firestore real-time  — incoming message onSnapshot per thread
   §7  Event delegation     — contact click, mobile back, message input
   §8  Bootstrap

   ============================================================================= */

(function empyreanChatModule() {
    'use strict';

    if (window._empyreanChatLoaded) {
        console.warn('[EmpChat] Already loaded — skipping duplicate.');
        return;
    }
    window._empyreanChatLoaded = true;

    /* ── State accessors ── */
    function _S()       { return window.EmpState || {}; }
    function _us()      { return _S().userState  || window.userState || {}; }
    function _mu()      { return (_S().mockUsers) || window.mockUsers || {}; }
    function _isGuest() { var s = _S(); return s.isGuest != null ? s.isGuest : !!window.isGuest; }

    /** Active Firestore message listener handle (unsubscribe fn) */
    var _activeMsgListener = null;

    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ── Premium chat header + message-background styling (injected once) ── */
    function _ensureChatPremiumStyle() {
        if (document.getElementById('_chat-premium-style')) return;
        var s = document.createElement('style');
        s.id = '_chat-premium-style';
        s.textContent = [
            '#chat-header-info.chat-header-premium{',
            '  background:linear-gradient(135deg,#0B1437 0%,#1B2B8B 100%);',
            '  padding:12px 16px;box-shadow:0 2px 14px rgba(10,14,39,0.18);',
            '  position:relative;z-index:2;',
            '}',
            '.chat-header-premium .chp-avatar{',
            '  width:42px;height:42px;border-radius:50%;overflow:hidden;flex-shrink:0;',
            '  border:2px solid rgba(245,197,24,0.55);box-shadow:0 2px 8px rgba(0,0,0,0.35);',
            '}',
            '.chat-header-premium .chp-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.chat-header-premium .chp-name{',
            '  display:block;color:#F5F7FF;font-weight:700;font-size:0.96rem;letter-spacing:0.1px;',
            '}',
            '.chat-header-premium .chp-sub{font-size:0.76rem;color:rgba(232,240,255,0.68);}',
            '.chat-header-premium #chat-back-btn{color:#F5F7FF !important;}',
            '#chat-messages-container.chat-bg-premium{',
            '  background:',
            '    radial-gradient(circle at 15% 0%, rgba(27,43,139,0.05) 0%, transparent 45%),',
            '    radial-gradient(circle at 85% 100%, rgba(245,197,24,0.05) 0%, transparent 45%),',
            '    linear-gradient(180deg,#F6F7FB 0%,#EEF0F7 100%);',
            '}'
        ].join('');
        document.head.appendChild(s);
    }


    /* =========================================================================
       §1  createMessageElement
       Builds a single message bubble div for the chat view.
       Supports plain text, images, videos, audio, and generic files.
       ========================================================================= */

    function createMessageElement(text, isSent, isFile, fileUrl, fileType, messageId) {
        isFile    = isFile    || false;
        fileUrl   = fileUrl   || '';
        fileType  = fileType  || '';
        messageId = messageId || ('msg-' + Date.now());

        var el = document.createElement('div');
        el.className        = 'message ' + (isSent ? 'sent' : 'received');
        el.dataset.messageId = messageId;
        el.style.cssText    =
            'max-width:72%;padding:10px 14px;'
            + 'border-radius:' + (isSent ? '18px 18px 4px 18px' : '18px 18px 18px 4px') + ';'
            + 'background:' + (isSent ? 'var(--secondary,#1B2B8B)' : 'white') + ';'
            + 'color:' + (isSent ? 'white' : 'var(--primary)') + ';'
            + 'font-size:0.88rem;line-height:1.45;'
            + 'align-self:' + (isSent ? 'flex-end' : 'flex-start') + ';'
            + 'box-shadow:0 1px 4px rgba(10,14,39,0.08);word-break:break-word;margin-bottom:4px;';

        var contentHTML;
        if (isFile && fileUrl) {
            if (fileType.startsWith('image/')) {
                contentHTML = (text ? '<p>' + _esc(text) + '</p>' : '')
                    + '<img src="' + _esc(fileUrl) + '" class="message-media" alt="Sent image" '
                    + 'style="max-width:100%;border-radius:8px;margin-top:6px;display:block;">';
            } else if (fileType.startsWith('video/')) {
                contentHTML = (text ? '<p>' + _esc(text) + '</p>' : '')
                    + '<video src="' + _esc(fileUrl) + '" class="message-media" controls '
                    + 'style="max-width:100%;border-radius:8px;margin-top:6px;display:block;"></video>';
            } else if (fileType.startsWith('audio/')) {
                contentHTML = (text ? '<p>' + _esc(text) + '</p>' : '')
                    + '<audio src="' + _esc(fileUrl) + '" class="message-media" controls '
                    + 'style="width:100%;margin-top:6px;"></audio>';
            } else {
                contentHTML = '<p><i class="fas fa-file-alt"></i> '
                    + 'Sent a file: <a href="' + _esc(fileUrl) + '" target="_blank" '
                    + 'rel="noopener" style="color:inherit;text-decoration:underline;">'
                    + _esc(text || 'Download') + '</a></p>';
            }
        } else {
            contentHTML = typeof window.formatWhatsAppText === 'function'
                ? window.formatWhatsAppText(text)
                : '<p>' + _esc(text) + '</p>';
        }

        el.innerHTML = contentHTML;
        return el;
    }
    window.createMessageElement = createMessageElement;


    /* =========================================================================
       FEATURE (this session — "enable message viewers count indicator in
       the message chat icon"): syncs #nav-messages-badge (the red circle
       app-nav.js's _buildMobileBottomNav() now renders on the Messages
       icon — see that file's own comment at the same spot) with the total
       unread count computed below. Same show/hide-at-zero, "9+" cap
       pattern app-notifications.js's own updateBadge() already uses for
       the bell icon, so both badges behave identically. Safe to call even
       before the bottom nav has been built yet (no-ops if the element
       isn't there — renderContactList() itself is called on
       empyrean-init-done/empyrean-user-ready, the same events app-nav.js
       already uses to build it, so in practice it's always present by
       the time this runs). */
    function _updateMessagesNavBadge(totalUnread) {
        var badge = document.getElementById('nav-messages-badge');
        if (!badge) return;
        if (totalUnread > 0) {
            badge.style.display = 'flex';
            badge.textContent   = totalUnread > 9 ? '9+' : String(totalUnread);
        } else {
            badge.style.display = 'none';
        }
    }
    window._empUpdateMessagesNavBadge = _updateMessagesNavBadge;

    /* =========================================================================
       §2  renderContactList
       Builds the contact list from followedUserIds + mockUsers.
       Shows unread badge, last message preview, and timestamp.
       ========================================================================= */

    function renderContactList() {
        if (_isGuest()) return;

        var container = document.getElementById('contacts-inner')
            || document.getElementById('contact-list-container');
        if (!container) return;

        /* FIX (Chat List Specification): this used to be
           `container.innerHTML = '';`, which wipes EVERY child of
           #contacts-inner — including #v14-groups-section (rendered by
           app-patch-v14.js) and #v20-broadcasts-section / the per-tab
           empty-state divs (rendered by app-patch-v20.js), since all
           three files share this one container. Worse, this function is
           called directly (unwrapped) from several places in this same
           file — the incoming/outgoing message handlers and the init /
           user-ready bootstrap below — which bypass app-patch-v14.js's
           window.renderContactList wrapper, so the groups section was
           frequently destroyed without ever being rebuilt, leaving the
           Groups/Broadcasts tabs to fall back to showing whatever plain
           .contact-item rows were still sitting in the shared container.
           This function only OWNS the 1:1 `.contact-item` rows (and its
           own "No contacts yet" placeholder), so it should only ever
           remove those — leaving any sections other files render into
           the same container untouched. */
        Array.prototype.slice.call(container.children).forEach(function (child) {
            if (child.classList && (child.classList.contains('contact-item') || child.id === '_chat-empty-state')) {
                child.remove();
            }
        });

        var us      = _us();
        var mu      = _mu();
        var allUids = new Set(us.followedUserIds instanceof Set
            ? us.followedUserIds : (Array.isArray(us.followedUserIds) ? us.followedUserIds : []));
        Object.values(mu).forEach(function (u) { if (u.id !== us.id) allUids.add(u.id); });

        /* Load localStorage message threads */
        var msgStore = {};
        try { msgStore = JSON.parse(localStorage.getItem('empyrean_msgs') || '{}'); } catch (e) {}

        var count = 0;
        var totalUnread = 0; // FEATURE (this session): drives #nav-messages-badge, see _updateMessagesNavBadge below
        allUids.forEach(function (uid) {
            var u = mu[uid];
            if (!u || u.id === us.id) return;
            count++;

            var thread    = msgStore[uid] || [];
            var lastMsg   = thread.length ? thread[thread.length - 1] : null;
            var lastText  = lastMsg
                ? (lastMsg.text.length > 38 ? lastMsg.text.slice(0, 38) + '…' : lastMsg.text)
                : 'Tap to start a conversation';
            var unreadCnt = thread.filter(function (m) { return m.from !== us.id && !m.read; }).length;
            totalUnread += unreadCnt;
            var timeStr   = (lastMsg && typeof window._timeAgo === 'function')
                ? window._timeAgo(lastMsg.ts) : '';

            var fallbackAv = 'https://ui-avatars.com/api/?name='
                + encodeURIComponent(u.fullName || 'U') + '&background=1B2B8B&color=fff&size=96';
            var avatar = u.avatar || fallbackAv;

            var el = document.createElement('div');
            el.className = 'contact-item';
            el.dataset.userId = uid;
            el.style.cssText =
                'display:flex;align-items:center;gap:12px;padding:13px 16px;'
                + 'border-bottom:1px solid rgba(10,14,39,0.05);cursor:pointer;transition:background 0.15s;';

            el.innerHTML =
                '<div style="position:relative;flex-shrink:0;">'
                + '<img src="' + _esc(avatar) + '" data-fb="' + _esc(fallbackAv) + '" class="contact-avatar-img" data-full-avatar="' + _esc(avatar) + '"'
                + ' style="width:48px;height:48px;border-radius:50%;object-fit:cover;'
                + 'border:2px solid rgba(27,43,139,0.12);"'
                + ' onerror="this.onerror=null;this.src=this.dataset.fb;">'
                + '<div class="online-dot" style="position:absolute;bottom:2px;right:2px;width:10px;'
                + 'height:10px;border-radius:50%;background:#9CA3AF;border:2px solid white;"></div>'
                + (unreadCnt > 0
                    ? '<span style="position:absolute;top:-1px;right:-1px;background:#EF4444;color:white;'
                    + 'font-size:0.6rem;font-weight:700;min-width:16px;height:16px;border-radius:50%;'
                    + 'display:flex;align-items:center;justify-content:center;border:1.5px solid white;'
                    + 'padding:0 2px;">' + (unreadCnt > 9 ? '9+' : unreadCnt) + '</span>'
                    : '')
                + '</div>'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">'
                + '<strong style="font-size:0.92rem;color:var(--primary);white-space:nowrap;'
                + 'overflow:hidden;text-overflow:ellipsis;max-width:160px;">' + _esc(u.fullName || '') + '</strong>'
                + (timeStr
                    ? '<span class="contact-last-time" style="font-size:0.7rem;color:var(--text-muted);flex-shrink:0;margin-left:6px;">'
                    + _esc(timeStr) + '</span>'
                    : '<span class="contact-last-time" style="font-size:0.7rem;color:var(--text-muted);flex-shrink:0;margin-left:6px;display:none;"></span>')
                + '</div>'
                + '<p class="contact-last-msg" style="font-size:0.79rem;color:'
                + (unreadCnt > 0 ? 'var(--secondary)' : 'var(--text-muted)') + ';'
                + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0;'
                + 'font-weight:' + (unreadCnt > 0 ? '600' : '400') + ';">'
                + _esc(lastText) + '</p>'
                + '</div>';

            container.appendChild(el);
            /* FIX ("Tap to start a conversation" showing for threads that
               DO have messages): this row's preview above came exclusively
               from localStorage['empyrean_msgs'], which this device only
               ever populates by (a) sending a message yourself, or (b) having
               personally opened that exact chat thread before (openChat's
               Firestore listener is what writes incoming messages into
               localStorage — see §6 below). A thread where the OTHER person
               messaged first, and you've never opened that specific chat on
               this device/session, has nothing in localStorage at all, so it
               falls back to the placeholder forever even though real
               messages exist in Firestore. Fetch the true last message for
               every row directly from Firestore and patch the row once it
               resolves — same fetch-then-patch pattern used for viewer
               profile resolution elsewhere in this app. */
            _syncLastMessagePreview(uid, el, us, lastMsg);
        });

        if (count === 0) {
            /* Same fix as above: append our own scoped empty-state div
               (tagged so the removal loop above can find and clear it on
               the next render) instead of overwriting the whole shared
               container with `container.innerHTML = ...`. */
            var emptyEl = document.createElement('div');
            emptyEl.id = '_chat-empty-state';
            emptyEl.style.cssText = 'text-align:center;padding:48px 20px;color:var(--text-muted);';
            emptyEl.innerHTML =
                '<i class="fas fa-users" style="font-size:2.2rem;display:block;margin-bottom:14px;opacity:0.35;"></i>'
                + '<p style="font-size:0.9rem;line-height:1.5;">No contacts yet.<br>'
                + 'Follow users to message them.</p>';
            container.appendChild(emptyEl);
        }

        _updateMessagesNavBadge(totalUnread);

        /* Live search filter */
        var searchInput = document.getElementById('contacts-search');
        if (searchInput) {
            if (searchInput._chatFilter) searchInput.removeEventListener('input', searchInput._chatFilter);
            searchInput._chatFilter = function () {
                /* FIX (Chat List Specification): this used to unconditionally
                   set `.contact-item` visibility on every 'input' event,
                   with no awareness of app-patch-v20.js's Chats/Groups/
                   Broadcasts tabs. Since an empty query makes `!q` true,
                   even a stray/empty input event would force EVERY 1:1
                   contact row back to display:'' — silently undoing
                   v20's display:none for the Groups/Broadcasts tabs and
                   making plain contacts bleed into those columns. This
                   filter only makes sense for the Chats tab (Groups and
                   Broadcasts have their own separate row sets), so it now
                   no-ops unless Chats is the active tab. Reads the same
                   localStorage key app-patch-v20.js uses, and defaults to
                   'chats' if v20 hasn't loaded — matching v20's own
                   default and the original single-list behavior. */
                var activeTab = 'chats';
                try { activeTab = localStorage.getItem('emp_msgs_active_tab') || 'chats'; } catch (e) {}
                if (activeTab !== 'chats') return;

                var q = searchInput.value.toLowerCase().trim();
                container.querySelectorAll('.contact-item').forEach(function (item) {
                    var name = ((item.querySelector('strong') || {}).textContent || '').toLowerCase();
                    item.style.display = (!q || name.includes(q)) ? '' : 'none';
                });
            };
            searchInput.addEventListener('input', searchInput._chatFilter);
            var searchBtn = searchInput.parentElement
                && searchInput.parentElement.querySelector('button');
            if (searchBtn) {
                searchBtn.onclick = function (e) {
                    e.preventDefault();
                    searchInput._chatFilter();
                    searchInput.focus();
                };
            }
        }
    }
    window.renderContactList = renderContactList;

    /* Per-row fetch of the real last message for a contact, so the list
       never permanently shows "Tap to start a conversation" for a thread
       that actually has messages the other person sent first. */
    function _syncLastMessagePreview(uid, rowEl, us, localLastMsg) {
        if (!window.fbDb || !window._firebaseLoaded || !us.id) return;
        var tid = [us.id, uid].sort().join('_');
        window.fbDb.collection('messages').doc(tid).collection('msgs')
            .orderBy('ts', 'desc').limit(1).get().then(function (snap) {
                if (!snap || snap.empty) return;
                var msg = snap.docs[0].data();
                if (!msg) return;

                /* Skip if what's already on screen (from localStorage) is
                   the same message or newer — avoids a flash/downgrade. */
                if (localLastMsg) {
                    var localTs = new Date(localLastMsg.ts).getTime();
                    var remoteTs = new Date(msg.ts).getTime();
                    if (isFinite(localTs) && isFinite(remoteTs) && localTs >= remoteTs) return;
                }

                var preview = msg.fileUrl ? ('📎 ' + (msg.text || 'Attachment')) : (msg.text || '');
                if (preview.length > 38) preview = preview.slice(0, 38) + '…';

                var textEl = rowEl.querySelector('.contact-last-msg');
                var timeEl = rowEl.querySelector('.contact-last-time');
                if (textEl) textEl.textContent = preview;
                if (timeEl) {
                    timeEl.style.display = '';
                    timeEl.textContent = (typeof window._timeAgo === 'function') ? window._timeAgo(msg.ts) : '';
                }

                /* Cache into localStorage so the next render (and openChat's
                   thread view) paints correctly without waiting on this
                   fetch again. */
                try {
                    var ms = JSON.parse(localStorage.getItem('empyrean_msgs') || '{}');
                    var thr = ms[uid] || [];
                    var exists = thr.some(function (m) {
                        return m.text === msg.text && m.from === msg.from
                            && Math.abs(new Date(m.ts).getTime() - new Date(msg.ts).getTime()) < 5000;
                    });
                    if (!exists) {
                        thr.push({
                            from: msg.from, text: msg.text || '', ts: msg.ts,
                            read: msg.from === us.id, fileUrl: msg.fileUrl || '', fileType: msg.fileType || ''
                        });
                        thr.sort(function (a, b) { return new Date(a.ts) - new Date(b.ts); });
                        ms[uid] = thr;
                        localStorage.setItem('empyrean_msgs', JSON.stringify(ms));
                    }
                } catch (e) {}
            }).catch(function () {});
    }


    /* =========================================================================
       §3  openChat
       Opens the conversation view for a user. Loads localStorage history,
       starts a Firestore real-time listener for the thread.
       ========================================================================= */

    function openChat(userId) {
        if (_isGuest()) {
            if (typeof window.openAuthModal === 'function') window.openAuthModal('login');
            return;
        }

        var mu   = _mu();
        var us   = _us();
        var user = mu[userId];
        if (!user) { console.warn('[Chat] User not found:', userId); return; }

        /* ── Highlight active contact ── */
        document.querySelectorAll('.contact-item').forEach(function (c) {
            c.classList.remove('active');
            c.style.background = '';
        });
        var activeItem = document.querySelector('.contact-item[data-user-id="' + userId + '"]');
        if (activeItem) {
            activeItem.classList.add('active');
            activeItem.style.background = 'rgba(27,43,139,0.05)';
        }

        /* ── Show chat panel, hide placeholder ── */
        var chatView    = document.getElementById('chat-view-container');
        var placeholder = document.getElementById('chat-placeholder');
        var contactList = document.querySelector('.contact-list');
        if (chatView) {
            chatView.style.display = 'flex';
            chatView.classList.add('active');
            if (window.innerWidth <= 700) {
                chatView.classList.add('mobile-active');
                if (contactList) contactList.style.display = 'none';
            }
        }
        if (placeholder) placeholder.style.display = 'none';

        /* ── Chat header ── */
        var chatHeader = document.getElementById('chat-header-info');
        if (chatHeader) {
            _ensureChatPremiumStyle();
            chatHeader.classList.add('chat-header-premium');
            var userAv  = (user.avatar || '').replace(/'/g, '%27');
            var userFb  = 'https://ui-avatars.com/api/?name='
                + encodeURIComponent(user.fullName || 'U') + '&background=1B2B8B&color=fff';
            var backBtn = window.innerWidth <= 700
                ? '<button id="chat-back-btn" style="background:none;border:none;font-size:1.1rem;'
                + 'cursor:pointer;padding:4px 8px 4px 0;">'
                + '<i class="fas fa-arrow-left"></i></button>'
                : '';

            chatHeader.innerHTML =
                '<div style="display:flex;align-items:center;gap:11px;flex:1;">'
                + backBtn
                + '<div class="chp-avatar">'
                + '<img src="' + _esc(userAv) + '" alt="' + _esc(user.fullName || '') + '" '
                + 'onerror="this.onerror=null;this.src=\'' + userFb + '\'"></div>'
                + '<div><strong class="chp-name">' + _esc(user.fullName || '') + '</strong>'
                + '<span class="chp-sub">@' + _esc(user.username || '') + '</span>'
                + '</div></div>';

            /* Mobile back button handler */
            var backBtnEl = document.getElementById('chat-back-btn');
            if (backBtnEl) {
                backBtnEl.onclick = function () {
                    if (chatView) { chatView.style.display = 'none'; chatView.classList.remove('active', 'mobile-active'); }
                    if (contactList) contactList.style.display = '';
                    if (placeholder) placeholder.style.display = '';
                    document.querySelectorAll('.contact-item').forEach(function (c) {
                        c.classList.remove('active'); c.style.background = '';
                    });
                    /* Detach Firestore listener */
                    if (_activeMsgListener) {
                        try { _activeMsgListener(); } catch (e) {}
                        _activeMsgListener = null;
                    }
                };
            }
        }

        /* ── Render existing thread from localStorage ── */
        var msgsContainer = document.getElementById('chat-messages-container');
        if (!msgsContainer) return;
        msgsContainer.dataset.activeChat = userId;
        msgsContainer.classList.add('chat-bg-premium');
        msgsContainer.style.cssText =
            'display:flex;flex-direction:column;gap:8px;padding:16px;overflow-y:auto;flex:1;';
        msgsContainer.innerHTML = '';

        var msgStore = {};
        try { msgStore = JSON.parse(localStorage.getItem('empyrean_msgs') || '{}'); } catch (e) {}
        var thread = msgStore[userId] || [];

        if (thread.length === 0) {
            msgsContainer.innerHTML =
                '<div id="chat-empty-hint" style="text-align:center;padding:48px 20px;color:var(--text-muted);">'
                + '<i class="fas fa-comments" style="font-size:2.2rem;display:block;margin-bottom:14px;opacity:0.3;"></i>'
                + '<p style="font-size:0.88rem;">No messages yet. Say hello! 👋</p></div>';
        } else {
            thread.forEach(function (msg) {
                var isSent = msg.from === us.id;
                if (msg.fileUrl) {
                    msgsContainer.appendChild(
                        createMessageElement(msg.text || '', isSent, true, msg.fileUrl, msg.fileType || '', msg.id)
                    );
                } else {
                    /* FIX ("make https/www/YouTube/WhatsApp links clickable
                       in the feed"): this used to build its own plain
                       `bubble.textContent = msg.text` bubble here instead of
                       going through createMessageElement() — the ONE place
                       that already calls window.formatWhatsAppText() to turn
                       a raw https://, www., youtube.com/youtu.be, or
                       wa.me/whatsapp.com URL into a real, tappable <a
                       href="..." target="_blank"> (which is what lets the OS
                       hand a wa.me link straight to the WhatsApp app, a
                       youtube.com link to the YouTube app, etc. — the browser
                       decides that from the href itself; this code only
                       needs to make sure the href actually exists as a real
                       link instead of being flattened into inert text).
                       Reusing createMessageElement(..., false) instead of
                       re-implementing a second, plainer bubble here means
                       every chat message renders identically regardless of
                       which of the two load paths (history vs. live) put it
                       on screen. */
                    msgsContainer.appendChild(createMessageElement(msg.text || '', isSent, false));
                }
                /* Mark as read */
                if (!isSent) msg.read = true;
            });
            /* Persist read status */
            if (thread.some(function (m) { return !m.read && m.from !== us.id; })) {
                try {
                    var ms2 = JSON.parse(localStorage.getItem('empyrean_msgs') || '{}');
                    if (ms2[userId]) ms2[userId].forEach(function (m) { if (m.from !== us.id) m.read = true; });
                    localStorage.setItem('empyrean_msgs', JSON.stringify(ms2));
                } catch (e) {}
            }
        }
        msgsContainer.scrollTop = msgsContainer.scrollHeight;

        /* ── Start Firestore real-time listener for this thread ── */
        _attachFirestoreListener(userId, msgsContainer);
    }
    window.openChat = openChat;


    /* =========================================================================
       §4  MESSAGE SEND HANDLER
       Wired on first openChat call via form submit event on #message-form.
       Writes to localStorage immediately, then fires Firestore in background.
       ========================================================================= */

    var _formWired = false;

    function _wireMessageForm() {
        if (_formWired) return;
        var form  = document.getElementById('message-form');
        var input = document.getElementById('message-text-input');
        if (!form) return;
        _formWired = true;

        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var text  = input ? input.value.trim() : '';
            var msgsC = document.getElementById('chat-messages-container');
            if (!text || !msgsC) return;
            var auid  = msgsC.dataset.activeChat;
            if (!auid) return;
            var us    = _us();

            /* Clear empty-state hint */
            var hint = document.getElementById('chat-empty-hint');
            if (hint) hint.remove();

            /* Render sent bubble immediately */
            var bubble = document.createElement('div');
            bubble.style.cssText =
                'max-width:72%;padding:10px 14px;border-radius:18px 18px 4px 18px;'
                + 'background:var(--secondary,#1B2B8B);color:white;font-size:0.88rem;'
                + 'line-height:1.45;align-self:flex-end;box-shadow:0 1px 4px rgba(10,14,39,0.08);'
                + 'word-break:break-word;margin-bottom:4px;';
            bubble.textContent = text;
            msgsC.appendChild(bubble);
            msgsC.scrollTop = msgsC.scrollHeight;
            if (input) input.value = '';

            /* Persist to localStorage */
            try {
                var ms = JSON.parse(localStorage.getItem('empyrean_msgs') || '{}');
                if (!ms[auid]) ms[auid] = [];
                ms[auid].push({ from: us.id, text: text, ts: Date.now(), read: true });
                localStorage.setItem('empyrean_msgs', JSON.stringify(ms));
            } catch (e) {}

            /* Persist to Firestore (background) */
            try {
                if (window.fbDb && window._firebaseLoaded && us.id) {
                    var tid = [us.id, auid].sort().join('_');
                    window.fbDb.collection('messages').doc(tid).collection('msgs').add({
                        from:     us.id,
                        to:       auid,
                        text:     text,
                        ts:       new Date().toISOString(),
                        fileUrl:  '',
                        fileType: '',
                        read:     false
                    }).catch(function () {});
                }
            } catch (e) {}

            /* Refresh contact list to update last message */
            setTimeout(renderContactList, 300);
        });
    }


    /* =========================================================================
       §5  MEDIA ATTACHMENT
       Handles file selection and Cloudinary upload for in-chat media.
       ========================================================================= */

    document.addEventListener('change', function (e) {
        var fileInput = e.target;
        if (!fileInput || fileInput.id !== 'chat-media-input') return;
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;

        var msgsC = document.getElementById('chat-messages-container');
        var us    = _us();
        var auid  = msgsC && msgsC.dataset.activeChat;
        if (!msgsC || !auid) return;

        /* Show uploading indicator */
        var hint = document.createElement('div');
        hint.style.cssText = 'align-self:flex-end;font-size:0.8rem;color:var(--text-muted);padding:6px 10px;';
        hint.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Uploading…';
        msgsC.appendChild(hint);
        msgsC.scrollTop = msgsC.scrollHeight;

        /* Upload to Cloudinary */
        var doUpload = typeof window.uploadToCloudinary === 'function'
            ? window.uploadToCloudinary(file, null)
            : Promise.reject(new Error('uploadToCloudinary not available'));

        doUpload.then(function (url) {
            hint.remove();
            if (!url) return;
            /* Render media bubble */
            var msgEl = createMessageElement(file.name, true, true, url, file.type, 'msg-' + Date.now());
            msgsC.appendChild(msgEl);
            msgsC.scrollTop = msgsC.scrollHeight;

            /* Persist */
            try {
                var ms = JSON.parse(localStorage.getItem('empyrean_msgs') || '{}');
                if (!ms[auid]) ms[auid] = [];
                ms[auid].push({ from: us.id, text: file.name, ts: Date.now(), read: true, fileUrl: url, fileType: file.type });
                localStorage.setItem('empyrean_msgs', JSON.stringify(ms));
            } catch (e) {}

            try {
                if (window.fbDb && window._firebaseLoaded && us.id) {
                    var tid = [us.id, auid].sort().join('_');
                    window.fbDb.collection('messages').doc(tid).collection('msgs').add({
                        from: us.id, to: auid, text: file.name,
                        fileUrl: url, fileType: file.type,
                        ts: new Date().toISOString(), read: false
                    }).catch(function () {});
                }
            } catch (e) {}
        }).catch(function () {
            hint.textContent = 'Upload failed.';
            setTimeout(function () { hint.remove(); }, 2000);
        });

        fileInput.value = '';
    });


    /* =========================================================================
       §6  FIRESTORE REAL-TIME INCOMING MESSAGE LISTENER
       ========================================================================= */

    function _attachFirestoreListener(recipientId, msgsContainer) {
        /* Detach any existing listener */
        if (_activeMsgListener) {
            try { _activeMsgListener(); } catch (e) {}
            _activeMsgListener = null;
        }
        if (!window.fbDb || !window._firebaseLoaded) return;

        var us  = _us();
        var uid = us.id;
        if (!uid) return;

        var tid = [uid, recipientId].sort().join('_');

        _activeMsgListener = window.fbDb
            .collection('messages').doc(tid).collection('msgs')
            .orderBy('ts', 'asc').limit(100)
            .onSnapshot(function (snap) {
                if (!snap) return;
                snap.docChanges().forEach(function (change) {
                    if (change.type !== 'added') return;
                    var msg = change.doc.data();
                    if (!msg || msg.from === uid) return; /* skip own messages already rendered */

                    /* Check if already in localStorage */
                    var ms = {};
                    try { ms = JSON.parse(localStorage.getItem('empyrean_msgs') || '{}'); } catch (e) {}
                    var thr = ms[recipientId] || [];
                    if (thr.some(function (m) { return m.text === msg.text && m.from === msg.from
                        && Math.abs(new Date(m.ts).getTime() - new Date(msg.ts).getTime()) < 5000; })) return;

                    /* Persist to localStorage */
                    thr.push({ from: msg.from, text: msg.text || '', ts: msg.ts, read: false,
                        fileUrl: msg.fileUrl || '', fileType: msg.fileType || '' });
                    ms[recipientId] = thr;
                    try { localStorage.setItem('empyrean_msgs', JSON.stringify(ms)); } catch (e) {}

                    /* Only add bubble if this chat is still the active one */
                    if (msgsContainer.dataset.activeChat !== recipientId) {
                        if (typeof window.pushNotification === 'function') {
                            var mu  = _mu();
                            var sender = (mu[msg.from] || {}).fullName || 'Message';
                            window.pushNotification('💬 ' + sender + ': ' + (msg.text || '').slice(0, 40), 'info');
                        }
                        renderContactList();
                        return;
                    }

                    /* Render received bubble */
                    var hint2 = document.getElementById('chat-empty-hint');
                    if (hint2) hint2.remove();

                    if (msg.fileUrl) {
                        msgsContainer.appendChild(
                            createMessageElement(msg.text || '', false, true, msg.fileUrl, msg.fileType || '')
                        );
                    } else {
                        // Same fix as the history-load path above — see that
                        // comment for why this now goes through
                        // createMessageElement() instead of a plain-text bubble.
                        msgsContainer.appendChild(createMessageElement(msg.text || '', false, false));
                    }
                    msgsContainer.scrollTop = msgsContainer.scrollHeight;
                    renderContactList();
                });
            }, function (err) {
                console.warn('[Chat] Firestore listener error:', err && err.message);
                _activeMsgListener = null;
            });
    }


    /* =========================================================================
       FEATURE — inbox avatar tap -> bottom-sheet bio preview
       Shows the tapped person's picture + a short bio/info snippet,
       sliding up from the bottom (not full-screen, not a chat
       navigation). "View full profile" underneath deep-links to the
       exact same "Contact info" screen the ⋮ menu's own "View contact"
       already opens (app-patch-openchat.js's _openProfileModal, exposed
       as window._ocOpenFullProfile) — one implementation of that full
       screen, not a second copy.
       ========================================================================= */
    function _openAvatarPreviewSheet(uid, avatarUrl) {
        var existing = document.getElementById('emp-avatar-preview-sheet');
        if (existing) existing.remove();
        var existingBackdrop = document.getElementById('emp-avatar-preview-backdrop');
        if (existingBackdrop) existingBackdrop.remove();

        var u = uid ? (_mu()[uid] || {}) : {};
        var name = u.fullName || u.username || 'User';

        var backdrop = document.createElement('div');
        backdrop.id = 'emp-avatar-preview-backdrop';
        backdrop.style.cssText =
            'position:fixed;inset:0;z-index:9999990;background:rgba(10,14,39,0.55);' +
            'opacity:0;transition:opacity 0.2s ease;';
        document.body.appendChild(backdrop);

        var sheet = document.createElement('div');
        sheet.id = 'emp-avatar-preview-sheet';
        sheet.style.cssText =
            'position:fixed;left:0;right:0;bottom:0;z-index:9999991;background:#fff;' +
            'border-radius:20px 20px 0 0;box-shadow:0 -8px 30px rgba(10,14,39,0.25);' +
            'padding:10px 20px 26px;max-height:78vh;overflow-y:auto;' +
            'transform:translateY(100%);transition:transform 0.25s cubic-bezier(.2,.9,.3,1);';
        sheet.innerHTML =
            '<div style="width:38px;height:4px;border-radius:3px;background:#E5E7EB;margin:0 auto 16px;"></div>' +
            '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;">' +
              '<img src="' + _esc(avatarUrl || u.avatar || '') + '" style="width:104px;height:104px;border-radius:50%;object-fit:cover;box-shadow:0 6px 18px rgba(10,14,39,0.18);">' +
              '<div id="eap-name" style="font-size:1.08rem;font-weight:800;color:#111827;margin-top:14px;">' + _esc(name) + '</div>' +
              '<div id="eap-username" style="font-size:0.84rem;color:#9CA3AF;margin-top:2px;">' + (u.username ? '@' + _esc(u.username) : '') + '</div>' +
              '<div id="eap-bio" style="font-size:0.88rem;color:#4B5563;margin-top:14px;line-height:1.5;max-width:340px;"></div>' +
              '<div id="eap-extra" style="width:100%;margin-top:10px;text-align:left;"></div>' +
            '</div>' +
            '<div style="display:flex;gap:10px;margin-top:22px;">' +
              (uid ? '<button id="eap-full-profile" style="flex:1;padding:13px;border:1.5px solid #1B2B8B;border-radius:12px;background:#fff;color:#1B2B8B;font-weight:700;font-size:0.88rem;cursor:pointer;">View full profile</button>' : '') +
              '<button id="eap-close" style="flex:1;padding:13px;border:none;border-radius:12px;background:#F3F4F6;color:#374151;font-weight:700;font-size:0.88rem;cursor:pointer;">Close</button>' +
            '</div>';
        document.body.appendChild(sheet);

        function _close() {
            sheet.style.transform = 'translateY(100%)';
            backdrop.style.opacity = '0';
            setTimeout(function () { sheet.remove(); backdrop.remove(); }, 220);
        }
        backdrop.addEventListener('click', _close);
        sheet.querySelector('#eap-close').addEventListener('click', _close);
        var fullBtn = sheet.querySelector('#eap-full-profile');
        if (fullBtn) fullBtn.addEventListener('click', function () {
            _close();
            if (typeof window._ocOpenFullProfile === 'function') {
                window._ocOpenFullProfile(uid, name, avatarUrl || u.avatar || '');
            }
        });

        requestAnimationFrame(function () {
            backdrop.style.opacity = '1';
            sheet.style.transform = 'translateY(0)';
        });

        /* Fill in bio/profession/location once fetched — same fields
           app-patch-openchat.js's own full profile screen reads, kept to
           a short list here since this is a PREVIEW, not the full page. */
        if (uid && window.fbDb && window._firebaseLoaded) {
            window.fbDb.collection('users').doc(uid).get().then(function (doc) {
                if (!doc.exists || !document.getElementById('eap-bio')) return;
                var d = doc.data() || {};
                var bioEl = document.getElementById('eap-bio');
                if (bioEl) bioEl.textContent = d.bio || '';
                var unEl = document.getElementById('eap-username');
                if (unEl && d.username) unEl.textContent = '@' + d.username;
                var extraEl = document.getElementById('eap-extra');
                if (extraEl) {
                    var rows = '';
                    if (d.profession) rows += '<div style="font-size:0.82rem;color:#6B7280;padding:6px 0;border-top:1px solid #F3F4F6;"><strong style="color:#374151;">Profession:</strong> ' + _esc(d.profession) + '</div>';
                    if (d.location) rows += '<div style="font-size:0.82rem;color:#6B7280;padding:6px 0;border-top:1px solid #F3F4F6;"><strong style="color:#374151;">Location:</strong> ' + _esc(d.location) + '</div>';
                    extraEl.innerHTML = rows;
                }
            }).catch(function () { /* preview stays with whatever cached info it already had */ });
        }
    }
    /* EXPOSED (2026-08-11): app-reel.js's own avatar tap (grid card +
       fullscreen viewer) now reuses this exact picture+bio bottom sheet
       instead of a second, separately built preview — "open a preview
       modal like it's done in the message section" per that session's
       request — rather than duplicating this sheet a third time. Safe to
       call from anywhere: it always looks the tapped uid up fresh via
       _mu()/Firestore, same as it does for its own inbox-avatar callers
       above, so no shared state needs to exist between the two files. */
    window._openAvatarPreviewSheet = _openAvatarPreviewSheet;

    /* =========================================================================
       §7  EVENT DELEGATION
       ========================================================================= */

    document.addEventListener('click', function (e) {
        /* FEATURE: tap the small avatar in the contact list → full-screen
           picture, same viewer app-patch-openchat.js already uses for the
           open-chat header avatar (exposed as window._ocOpenLightbox so
           there's only ever one implementation). Checked BEFORE the
           .contact-item handler below and stops propagation, so tapping
           the picture never also opens the chat underneath it. */
        var avatarImg = e.target.closest('.contact-avatar-img');
        if (avatarImg) {
            e.preventDefault();
            e.stopPropagation();
            /* FIX (spec: "clicking the inbox avatar shouldn't open the
               chat, and the blurred full-screen expansion should be a
               bottom-sheet bio preview instead, like View contact"):
               this used to always open the full-screen blurred lightbox
               (window._ocOpenLightbox) with no bio/info of any kind.
               Replaced with a bottom sheet showing the picture plus a
               short bio, with a way through to the full "View contact"
               screen for anyone who wants more — the lightbox function
               itself is untouched and still used elsewhere (message
               bubbles, etc.), only THIS tap target was repointed. */
            var contactEl = avatarImg.closest('.contact-item');
            var uid = contactEl && contactEl.dataset.userId;
            _openAvatarPreviewSheet(uid, avatarImg.dataset.fullAvatar || avatarImg.src);
            return;
        }

        /* Contact item click → open chat */
        var contactItem = e.target.closest('.contact-item');
        if (contactItem && contactItem.dataset.userId) {
            e.preventDefault();
            e.stopPropagation();
            /* FIX (exit button landing on broken "Messages" screen +
               composer/mic/emoji missing from chat): app-patch-openchat.js
               loads after this file and installs its own capture-phase
               .contact-item click listener that calls window.openChat(uid)
               — the current, real WhatsApp-style implementation (dynamic
               header/body/composer, proper close handling). This file's
               own click listener used to call its LOCAL openChat(userId)
               directly (the old implementation below, which pre-dates that
               rewrite and never builds a composer at all), so both ran on
               every single tap, racing to rebuild #chat-view-container at
               the same time. Whichever one finished last "won" that tap,
               which is why the bug was intermittent: sometimes the old
               header/no-composer view was left on top, sometimes the exit
               button wired by the old code's close handler ran instead of
               the new one. Deferring to window.openChat here (rather than
               the local function) means both listeners now always agree on
               the one real implementation, whatever it currently is —
               removing the race without deleting or disabling anything. */
            if (typeof window.openChat === 'function') {
                window.openChat(contactItem.dataset.userId);
            } else {
                openChat(contactItem.dataset.userId);
            }
            _wireMessageForm();
            return;
        }

        /* Chat media attach button */
        if (e.target.closest('#chat-attach-btn, .chat-attach-btn')) {
            e.preventDefault();
            var fi = document.getElementById('chat-media-input');
            if (!fi) {
                fi = document.createElement('input');
                fi.type   = 'file';
                fi.id     = 'chat-media-input';
                fi.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx';
                fi.style.display = 'none';
                document.body.appendChild(fi);
            }
            fi.click();
        }
    });

    /* Wire message form on empyrean-init-done (DOM is guaranteed ready) */
    document.addEventListener('empyrean-init-done', function () {
        setTimeout(_wireMessageForm, 400);
    });


    /* =========================================================================
       §8  BOOTSTRAP
       ========================================================================= */

    document.addEventListener('empyrean-init-done', function () {
        setTimeout(function () {
            if (!_isGuest()) {
                renderContactList();
                _wireMessageForm();
            }
        }, 500);
    });

    document.addEventListener('empyrean-user-ready', function () {
        setTimeout(function () {
            if (!_isGuest()) renderContactList();
        }, 600);
    });

    console.log('[EmpChat] ✅ Chat module ready. (contact-list-fix build 2026-07-09b: scoped container clear + tab-aware search filter; 2026-08-11: _openAvatarPreviewSheet exposed on window for reuse by app-reel.js)');

})();