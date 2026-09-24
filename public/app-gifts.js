// =====================================================
// APP-GIFTS.JS  —  Empyrean Platform  (Module 0.13)
// Covers: EMPY gift catalog, full-screen catalog modal,
//         quick-send side tab, gift animations (standard
//         + Heart Mills), send-gift handler, recipient
//         crediting, live-goal update integration, and
//         (SECTION 11, new) the profile/birthday "Send a
//         Gift" catalog — the same EMPY-token economy,
//         reused outside of live streaming.
// Depends on: app-state.js, app-wallet.js, app-live.js
// =====================================================
(function initGiftsModule() {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // SECTION 1: Gift Catalog Data
    // Single source of truth — re-exposed on window so any module
    // that loads before or after this one can read it.
    //
    // ICON SET ("real, beautiful, TikTok-style" request):
    // The previous icon set was a small in-house line-art SVG library.
    // Its 'Rose' entry drew a circle + straight stem + one diagonal
    // "thorn" line — which is exactly a padlock-key silhouette once
    // rendered at small size, not a rose. That's why gifts showed up
    // looking like a key in the catalog, quick-send tab and live
    // comment feed (see screenshots): the icon itself was wrong, not
    // a CSS/sizing bug.
    //
    // FIX: replaced the whole hand-drawn line-icon set with real,
    // full-color native emoji glyphs — the same approach TikTok's own
    // "basic" gift tier (Rose, Heart, Like, etc.) effectively renders
    // as: a recognisable, full-color picture of the actual object,
    // not an abstract outline. Modern Android/Chrome/iOS all render
    // these via the system's built-in color emoji font (no external
    // asset/CDN dependency, so nothing to break like the Font Awesome
    // CDN issues elsewhere in this codebase), and every shape here is
    // a real, unambiguous drawing of its name (a rose looks like a
    // rose, a crown looks like a crown, etc).
    //
    // `symbol` is a plain string (was previously an HTML/SVG string).
    // Every call site already does `el.innerHTML = gift.symbol`
    // (kept that way — harmless for plain text, and some legacy
    // callers still pass old SVG markup through the same code path),
    // so no call sites needed to change.
    // ─────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────
    // Premium Rose artwork — original, hand-built SVG (gradient-shaded
    // petals + stem/leaf), not a copy of TikTok's own rose asset. Used
    // everywhere the flat 🌹 glyph used to appear (catalog, quick-send
    // tab, footer quick-rose button, chat gift line) so the single most
    // important gift — the one people tap constantly — reads as a real
    // dimensional illustration instead of a plain emoji character.
    //
    // BUG FIX ("rose renders as a tiny dot"): the gradients used to be
    // declared inside a local <defs> INSIDE the rose SVG markup itself,
    // and that same markup string gets dropped into the page many times
    // over (catalog card, quick-send tab, footer button, every chat
    // gift line...). SVG element IDs are global to the whole document,
    // not scoped to their own <svg>, so every extra copy created a
    // second/third/Nth element with the exact same id="tkRosePetal" —
    // an illegal duplicate. Browsers resolve url(#tkRosePetal) against
    // whichever element with that id they find (often not the "local"
    // one), so the big gradient-filled petal shape silently failed to
    // paint (rendered as invisible/black-on-black) almost everywhere,
    // leaving only the small solid-color highlight ellipse visible —
    // exactly the "tiny dot" seen in the screenshot.
    //
    // FIX: the gradients are now defined exactly ONCE, in a hidden
    // sprite-sheet <svg> injected into <body> on module load (see
    // _ensureRoseGradientDefs below). Every rose instance references
    // those same two ids via url(#tkRosePetal) / url(#tkRoseStem) but
    // never redeclares them, so there's only ever one definition per id
    // no matter how many roses are on screen at once.
    // ─────────────────────────────────────────────────────────────
    function _ensureRoseGradientDefs() {
        if (document.getElementById('tk-rose-gradient-defs')) return;
        const wrap = document.createElement('div');
        wrap.id = 'tk-rose-gradient-defs';
        wrap.setAttribute('aria-hidden', 'true');
        wrap.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
        wrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
            '<radialGradient id="tkRosePetal" cx="38%" cy="32%" r="75%">' +
                '<stop offset="0%" stop-color="#ff8fa3"/>' +
                '<stop offset="35%" stop-color="#f43f5e"/>' +
                '<stop offset="70%" stop-color="#c81e42"/>' +
                '<stop offset="100%" stop-color="#7a0e26"/>' +
            '</radialGradient>' +
            '<linearGradient id="tkRoseStem" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0%" stop-color="#5fbf5a"/>' +
                '<stop offset="100%" stop-color="#1f6d2a"/>' +
            '</linearGradient>' +
        '</defs></svg>';
        (document.body || document.documentElement).appendChild(wrap);
    }
    if (document.body) {
        _ensureRoseGradientDefs();
    } else {
        document.addEventListener('DOMContentLoaded', _ensureRoseGradientDefs);
    }

    const PREMIUM_ROSE_SVG = '<svg class="tk-premium-rose" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M30 34 C27 44 27 52 24 60" fill="none" stroke="url(#tkRoseStem)" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="M27 46 C22 45 18 48 16 53 C21 53 25 51 27 46 Z" fill="#2f8c3a"/>' +
        '<g transform="translate(32 26)">' +
            '<path d="M0 -20 C13 -20 20 -10 20 0 C20 12 10 21 0 21 C-10 21 -20 12 -20 0 C-20 -10 -13 -20 0 -20 Z" fill="url(#tkRosePetal)"/>' +
            '<path d="M0 -13 C8 -13 13 -6 13 1 C13 9 6 15 0 15 C-4 15 -8 12 -8 7 C-8 3 -4 2 0 4 C3 5 5 3 4 -1 C3 -5 -2 -6 -6 -3 C-9 -1 -10 -6 -6 -10 C-3 -13 2 -14 0 -13 Z" fill="#ffb3c1" opacity="0.85"/>' +
            '<ellipse cx="-7" cy="-9" rx="4.5" ry="2.6" fill="#ffe1e8" opacity="0.65" transform="rotate(-30 -7 -9)"/>' +
        '</g>' +
    '</svg>';
    window.tkPremiumRoseSVG = PREMIUM_ROSE_SVG;

    // FIX ("rose turns into a gear-ball icon when tapped/re-rendered"):
    // populateGiftCatalog() below is the ACTUAL single source of truth
    // for what every gift tile renders as — it wipes and rebuilds
    // #gift-grid-container from GIFT_ICONS/EMPY_GIFT_CATALOG on every
    // load, tab switch, and balance refresh (see SECTION 4). It was
    // using PREMIUM_ROSE_SVG above for Rose, which is exactly the
    // gradient-shaded SVG already documented a few lines up as having
    // rendered as "a tiny dot" once before, from its gradient defs
    // failing to resolve — the same failure mode produces a dark,
    // lobed, gradient-less blob at 32-48px, which reads as a gear/cog,
    // not a rose. app-live-tiktok-patch.js separately swaps in a known-
    // good PNG rose image (TK_ROSE_IMG) after the catalog modal opens,
    // but only ONCE, on that first open — any later rebuild by THIS
    // function (e.g. the one that runs after tapping a tile) reverts
    // straight back to the fragile SVG above, which is the exact bug
    // reported. Using that same proven PNG here, at the real source of
    // truth, means every rebuild renders it correctly, not just the
    // first one. Identical base64 asset to the one already used
    // reliably for the footer rose button, the guest-request icon, and
    // the "sent Rose" gift-comment rows (see app-live-tiktok-patch.js).
    const ROSE_IMG_DATA_URI = 'data:image/png;base64,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';
    const ROSE_IMG_HTML = '<img class="tk-rose-img" src="' + ROSE_IMG_DATA_URI + '" alt="Rose">';

    // Empy Token (platform coin) gift icon.
    //
    // FIX (reported: "coin sitting in a dark square" in the Send-a-Gift
    // catalog, unlike Rose which has no background at all): this was
    // NOT a CSS/background-color issue — .tk-emoji-3d's own "3D orb"
    // background (see that class's rule below) is the same light glass
    // gradient behind both Rose and Token, and was never dark enough to
    // produce the solid black square seen in the screenshot. The actual
    // cause was the source asset itself: this was previously a JPEG
    // (data:image/jpeg — no alpha channel, so every pixel including the
    // corners around the coin is fully opaque, exported with a solid
    // near-black backing fill baked into the pixel data), while
    // ROSE_IMG_DATA_URI above has always been a PNG with real
    // transparency — that's why only the token showed a dark box and
    // the rose never did. Re-exported this asset as a PNG with the
    // near-black background colour-keyed to transparent (edges checked
    // against both a dark-navy and a bright-magenta test background —
    // no dark fringe/halo). Only the coin's own pixels now render.
    //
    // NOTE: TK_TOKEN_IMG in app-live-tiktok-patch.js (used for the
    // separate support-nudge card, not the gift catalog) is its own
    // deliberately-independent local copy of the OLD jpeg asset — see
    // that file's own comment for why it's not shared with this one.
    // It was NOT touched here since the nudge card wasn't the reported
    // location; if the same dark-box look shows up there too, it needs
    // the identical PNG swap applied to that file's own copy.
    const EMPY_TOKEN_IMG_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAADcCAMAAAAshD+zAAADAFBMVEUFBQaTZhCIWAh0SAK0hyyrdxLRqEjImDJpOADRpTWoeSd6UwjnuU/vxlFRKADZtE741nAqGgY3Iwf85oq1hRTwyGmnagsuHAZWNQUiFQebchXImkbIiBG7kzPotzMZEgfOlRWGSwEmFwY1HAQVEAf++ZGSaSUdFAj+5XWZcyj++6vGiy7numVIGwD31VP32ofkqS/GeQcbCgDvxDZjLADZszP/9XXWpRa5lUezikTirEmlWwFvWCj766khCgBYQxPXtWZ2ZC4lDADnqBUsIAikbCUqDADkmhPlmynntRggEgMeDQDUqmT50Tr//cKHWiLWsxeVh1G7lBbHagH941q2p2rYw3PUyYouDQDBi0TcwlOCPQCJeEceGAs8MQtZSCPjihLxzIJOOSNlTSa7oVTFfSTxwRl9YBE8CwBbUigmIQp4ZkJ6cTCegTi8s3fb0YrmrWE1DABDDwCck1SlTQCsf0Okl2LknEDp2qFZUh5/cE+Ga0CagRy9sYHHvYzewDzgiicAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQKmPKAAABAHRSTlMA/////////////////////6/7/////83/bv//////Lv//jfET//9L/////////////y3//////////////1D///9v/8//jf///1lE////////////////q/////9l//////////////r/s////////9j///////////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAw0+P2wAAQ5RJREFUeNrtvYd/20jSLapOaGRCIkBBAEGTkkWTJqlgSaNgj+N4PGnv5Nmcw5fDzffF+/70d06DCvbM7lvZHo/3/l5blkjJonFYVadOVQesrPz/41XGTX66ceN/GTg3lw9uPP/04jt/4wMgbty8+vy91Vu3Vtc2/tew3q32y8Zq+ejz//b11//64x9/882Pf/zw6/88/ed/jtY21/9mYd6g0W6896t/+Pz/+vFu9/bt29vbt7vd7S7G9jYffPP11794dO/B2ubm5p2/PQL55dq9r4nqdnc5Mnzgb3fSvRi7D0+m4+hBubb+t4TwZvmLH797e/sSRvfqY4cryxzUbub9y1RECgjfenyOFn/1+f/97qXFurvFQ+9E6+m0CrXW1ut0imyXP5gA32Qy6Rae1n+ngO9Xm28zNHDIP/76X3dbZNuA1TnRIoqU75e+woj4CY8iwAREOqozYBY3VUXzleX6nbcuws4fvPfox7e3WxcsvDBSJUBFUhiYrGmCwGJoXQn4ofIjEXrFbneXCLuTwsO3BX9jbf2tJJHNXyyN1i1OBC5TyanWdQcjjvm547m/HoZtjKQpK29pwMkk6zRCufEgfWvSxDKfrWz84n/chh22iQxuGE2153Vih8hLOp0kucAX4wcBEWpBF/UKF35ZVgTGGBkx/Mqtt8Q9f0mAtx6BH5HSut4UNpM0WGstfKHdkiC4/IazHT95tZ5GkdAdQsPf2BoXl3iJcuttyA/Ocg/+lQ55e/ck8lNVNZ7zxICgaKvESyYdEQBUJykEf9piaz9pOKjwsgngTYqONkJGGAC4tvk2oNv8z+8y1ghNKXgjgDlHJFU0quPFtEykabZk2yqEXaaFs5wHlvFqiwAEPGe9AtEYRfhQ0b0H5eoPziT/2785GvlDlJZCew4C/jo5UjwUJQwYZ0VXR4w4omw6na4uGxd2QOfZmuEXER59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';
    const EMPY_TOKEN_IMG_HTML = '<img class="tk-empy-token-img" src="' + EMPY_TOKEN_IMG_DATA_URI + '" alt="Empy Token">';

    const GIFT_ICONS = {
        'Empy Token':      EMPY_TOKEN_IMG_HTML,
        'Rose':            ROSE_IMG_HTML,
        'Like':             '👍',
        'Heart':            '❤️',
        'Coffee':           '☕',
        'Star':             '⭐',
        'Chocolate':        '🍫',
        'Ice Cream':        '🍦',
        'Balloon':          '🎈',
        'Gift Box':         '🎁',
        'Cupcake':          '🧁',
        'Candy':            '🍬',
        'Birthday Cake':    '🎂',
        'Teddy Bear':       '🧸',
        'Pizza Slice':      '🍕',
        'Popcorn':          '🍿',
        'Music Note':       '🎵',
        'Flower Bouquet':   '💐',
        'Football':         '⚽',
        'Sunglasses':       '🕶️',
        'Perfume':          '🧴',
        'Cat':              '🐱',
        'Dog':              '🐶',
        'Diamond Ring':     '💍',
        'Camera':           '📷',
        'Champagne':        '🍾',
        'Heart Mills':      '💖',
        'Guitar':           '🎸',
        'Laptop':           '💻',
        'Gold Medal':       '🥇',
        'Airplane':         '✈️',
        'Luxury Watch':     '⌚',
        'Car':              '🚗',
        'Yacht':            '🛥️',
        'Mansion':          '🏰',
        'Helicopter':       '🚁',
        'Private Jet':      '🛩️',
        'Crown':            '👑',
        'Island':           '🏝️',
        'Diamond Trophy':   '🏆'
    };

    // Rarity tier per gift — drives the card glow/border colour so the
    // catalog reads visually like TikTok's Common/Rare/Epic/Legendary
    // gift tiers instead of every gift looking the same.
    function _tierForPrice(price) {
        if (price >= 1000) return 'legendary';
        if (price >= 120)  return 'epic';
        if (price >= 25)   return 'rare';
        return 'basic';
    }

    const EMPY_GIFT_CATALOG = [
        // ── Tier 1: Micro (1–20 EMPY) ──
        { name: 'Empy Token',     symbol: GIFT_ICONS['Empy Token'],     price: 1   },
        { name: 'Rose',           symbol: GIFT_ICONS['Rose'],           price: 1   },
        { name: 'Like',           symbol: GIFT_ICONS['Like'],           price: 2   },
        { name: 'Heart',          symbol: GIFT_ICONS['Heart'],          price: 3   },
        { name: 'Coffee',         symbol: GIFT_ICONS['Coffee'],         price: 5   },
        { name: 'Star',           symbol: GIFT_ICONS['Star'],           price: 7   },
        { name: 'Chocolate',      symbol: GIFT_ICONS['Chocolate'],      price: 10  },
        { name: 'Ice Cream',      symbol: GIFT_ICONS['Ice Cream'],      price: 12  },
        { name: 'Balloon',        symbol: GIFT_ICONS['Balloon'],        price: 15  },
        { name: 'Gift Box',       symbol: GIFT_ICONS['Gift Box'],       price: 16  },
        { name: 'Cupcake',        symbol: GIFT_ICONS['Cupcake'],        price: 18  },
        { name: 'Candy',          symbol: GIFT_ICONS['Candy'],          price: 20  },
        { name: 'Birthday Cake',  symbol: GIFT_ICONS['Birthday Cake'],  price: 22  },
        // ── Tier 2: Small (25–100 EMPY) ──
        { name: 'Teddy Bear',     symbol: GIFT_ICONS['Teddy Bear'],     price: 25  },
        { name: 'Pizza Slice',    symbol: GIFT_ICONS['Pizza Slice'],    price: 30  },
        { name: 'Popcorn',        symbol: GIFT_ICONS['Popcorn'],        price: 35  },
        { name: 'Music Note',     symbol: GIFT_ICONS['Music Note'],     price: 40  },
        { name: 'Flower Bouquet', symbol: GIFT_ICONS['Flower Bouquet'], price: 50  },
        { name: 'Football',       symbol: GIFT_ICONS['Football'],       price: 60  },
        { name: 'Sunglasses',     symbol: GIFT_ICONS['Sunglasses'],     price: 70  },
        { name: 'Perfume',        symbol: GIFT_ICONS['Perfume'],        price: 80  },
        { name: 'Cat',            symbol: GIFT_ICONS['Cat'],            price: 90  },
        { name: 'Dog',            symbol: GIFT_ICONS['Dog'],            price: 100 },
        // ── Tier 3: Mid (120–500 EMPY) ──
        { name: 'Diamond Ring',   symbol: GIFT_ICONS['Diamond Ring'],   price: 120 },
        { name: 'Camera',         symbol: GIFT_ICONS['Camera'],         price: 150 },
        { name: 'Champagne',      symbol: GIFT_ICONS['Champagne'],      price: 180 },
        { name: 'Heart Mills',    symbol: GIFT_ICONS['Heart Mills'],    price: 200 },
        { name: 'Guitar',         symbol: GIFT_ICONS['Guitar'],         price: 200 },
        { name: 'Laptop',         symbol: GIFT_ICONS['Laptop'],         price: 250 },
        { name: 'Gold Medal',     symbol: GIFT_ICONS['Gold Medal'],     price: 300 },
        { name: 'Airplane',       symbol: GIFT_ICONS['Airplane'],       price: 350 },
        { name: 'Luxury Watch',   symbol: GIFT_ICONS['Luxury Watch'],   price: 400 },
        { name: 'Car',            symbol: GIFT_ICONS['Car'],            price: 450 },
        { name: 'Yacht',          symbol: GIFT_ICONS['Yacht'],          price: 500 },
        // ── Tier 4: Premium (1 000–10 000 EMPY) ──
        { name: 'Mansion',        symbol: GIFT_ICONS['Mansion'],        price: 1000  },
        { name: 'Helicopter',     symbol: GIFT_ICONS['Helicopter'],     price: 2000  },
        { name: 'Private Jet',    symbol: GIFT_ICONS['Private Jet'],    price: 3500  },
        { name: 'Crown',          symbol: GIFT_ICONS['Crown'],          price: 5000  },
        { name: 'Island',         symbol: GIFT_ICONS['Island'],         price: 7500  },
        { name: 'Diamond Trophy', symbol: GIFT_ICONS['Diamond Trophy'], price: 10000 },
    ];

    // Stamp a `tier` onto every entry (used by the card CSS below).
    EMPY_GIFT_CATALOG.forEach(function (g) { g.tier = _tierForPrice(g.price); });

    // Expose catalog so other modules can reference it without duplicating the array
    window.empyGiftCatalog = EMPY_GIFT_CATALOG;

    // Currently selected gift (set by catalog click, consumed by send handler)
    window._selectedGift = null;

    // ─────────────────────────────────────────────────────────────
    // SECTION 2: CSS – inject keyframes once
    // ─────────────────────────────────────────────────────────────
    (function injectGiftStyles() {
        if (document.getElementById('_gift_keyframes')) return;
        const s = document.createElement('style');
        s.id    = '_gift_keyframes';
        s.textContent = `
            /* Base sizing so the SVG scales like a text glyph (1em) in any
               context it's dropped into via gift.symbol — animation layer,
               chat line, catalog card, etc. — without each call site
               needing its own override. */
            svg.tk-premium-rose { width:1em; height:1em; vertical-align:middle; display:inline-block; }

            /* NOTE (session 2026-07-19, fifth follow-up): the floating-gift
               animation CSS (base .gift-animation, .gift-animation-small,
               .gift-animation-token, giftFloat/giftFloatSmall/heartMill
               keyframes) used to live here, injected at runtime via this
               <style> tag. Moved to style.css as a static, linked
               stylesheet instead — a runtime-injected <style> tag is one
               more thing that can silently fail to apply (blocked by a
               strict Content-Security-Policy style-src directive, raced
               by another stylesheet's insertion order, skipped if this
               IIFE errors before reaching document.head.appendChild,
               etc.) with no visible symptom other than "the fix doesn't
               seem to do anything" — which is exactly what kept
               happening across repeated attempts at this fix. A linked
               stylesheet has none of those failure modes. See style.css
               for the actual rules; this file's showGiftAnimation() /
               triggerGiftAnimation() below still add the
               'gift-animation-small' / 'gift-animation-token' classes —
               only where the CSS that responds to them lives has
               changed. */

            /* ── Glossy "3D" emoji badge ──────────────────────────────
               TikTok's own gift glyphs are custom-illustrated, licensed
               image assets — those specific files can't be pulled into
               this codebase. This reproduces the *look* (dimensional,
               glossy, sitting on a little sphere) using the platform's
               native color-emoji glyph on a radial-gradient "orb" with
               a soft specular highlight, so it reads as 3D/colorful
               without depending on any external/TikTok-owned asset. */
            .tk-emoji-3d {
                position: relative; z-index: 1; display: inline-flex;
                align-items: center; justify-content: center;
                line-height: 1; border-radius: 50%;
                background: radial-gradient(circle at 32% 28%, rgba(255,255,255,0.35), rgba(255,255,255,0) 45%),
                            radial-gradient(circle at 50% 60%, rgba(255,255,255,0.10), rgba(0,0,0,0.18) 100%);
                filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45));
            }
            .tk-emoji-3d::after {
                content:''; position:absolute; top:10%; left:18%; width:32%; height:20%;
                background: rgba(255,255,255,0.55); border-radius:50%;
                filter: blur(2px); transform: rotate(-18deg); pointer-events:none;
            }
            .tk-emoji-3d .tk-premium-rose {
                width: 66%; height: 66%; position: relative; z-index: 1;
                filter: drop-shadow(0 2px 3px rgba(0,0,0,0.5));
            }

            /* ── Gift catalog grid item — real, colorful, TikTok-style card ── */
            .gift-item {
                position: relative;
                display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
                gap: 2px; padding: 14px 6px 9px; border-radius: 16px; min-height: 96px;
                border: 1.5px solid rgba(255,255,255,0.08); cursor: pointer;
                background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
                transition: transform 0.15s ease, border-color 0.15s, box-shadow 0.15s, background 0.15s;
                user-select: none; overflow: hidden;
                --gift-glow: rgba(245,197,24,0.30);
            }
            .gift-item::before {
                content: ''; position: absolute; top: 6px; left: 50%; width: 46px; height: 46px;
                transform: translateX(-50%);
                background: radial-gradient(circle, var(--gift-glow) 0%, transparent 72%);
                filter: blur(4px); pointer-events: none;
            }
            .gift-item:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.18); }
            .gift-item:active{ transform: scale(0.94); }
            .gift-item.selected {
                border-color: #F5C518;
                background: linear-gradient(180deg, rgba(245,197,24,0.20), rgba(245,197,24,0.04));
                box-shadow: 0 0 0 2px rgba(245,197,24,0.35), 0 4px 16px rgba(245,197,24,0.25);
            }
            /* Rarity tiers — accent glow + border, like TikTok's gift rarity system */
            .gift-item[data-tier="rare"]      { --gift-glow: rgba(88,166,255,0.35); }
            .gift-item[data-tier="epic"]      { --gift-glow: rgba(186,104,255,0.40); border-color: rgba(186,104,255,0.20); }
            .gift-item[data-tier="legendary"] {
                --gift-glow: rgba(255,183,3,0.55); border-color: rgba(255,183,3,0.35);
                background: linear-gradient(180deg, rgba(255,183,3,0.14), rgba(255,255,255,0.02));
            }
            .gift-item[data-tier="legendary"].selected { border-color: #FFB703; box-shadow: 0 0 0 2px rgba(255,183,3,0.45), 0 4px 18px rgba(255,183,3,0.35); }
            .gift-item .symbol {
                position: relative; z-index: 1; line-height: 1; margin-bottom: 4px;
            }
            .gift-item .symbol .tk-emoji-3d { width: 48px; height: 48px; font-size: 1.9rem; }
            /* FIX (reported: Empy Token gift tile rendering oversized,
               filling the whole card instead of sitting inside the
               small circular badge like every other gift): unlike the
               emoji gifts above, EMPY_TOKEN_IMG_HTML is a real <img>,
               so it has its own intrinsic size and does not shrink to
               fit its flex parent on its own — the exact same situation
               Rose (also an <img>) already needed its own explicit size
               rule for. Mirrors that already-proven rule
               (#gift-grid-container .gift-item .symbol .tk-rose-img,
               app-live-tiktok-patch.js) at the identical 48px so both
               image-based gifts match the emoji gifts' size exactly —
               kept here, in this file's own style block, rather than in
               that other file, for the same reason the token asset
               itself was kept as a local copy in this file. */
            #gift-grid-container .gift-item .symbol .tk-empy-token-img {
                width: 48px; height: 48px; margin: 0 auto; display: block; object-fit: contain;
            }
            /* FIX (reported: Rose reads smaller than its neighbors in
               the gift catalog grid): Rose is also an <img> (like the
               token above), and app-live-tiktok-patch.js already ships
               a same-goal rule for it — but that file separately sets
               .tk-footer-icon .tk-rose-img to 68px !important for the
               footer button, and depends on this style block loading
               after that one to win on specificity/order alone (no
               !important of its own). Adding the identical 48px target
               here too, with !important, makes it correct unconditionally
               — regardless of script load order — without editing or
               removing app-live-tiktok-patch.js's own rule, which stays
               exactly as-is for the footer/nudge-card contexts it owns. */
            #gift-grid-container .gift-item .symbol .tk-rose-img {
                width: 48px !important; height: 48px !important; margin: 0 auto; display: block; object-fit: contain;
            }
            .gift-item .name {
                font-size: 0.66rem; font-weight: 700; color: #fff; text-align: center;
                max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .gift-item .price {
                display: flex; align-items: center; gap: 3px;
                font-size: 0.7rem; color: #F5C518; font-weight: 700; margin-top: 2px;
            }
            .gift-item .price i { font-size: 0.62rem; }

            /* ── Quick-send side tab — small matching cards ── */
            .gift-quick-item {
                position: relative;
                display: flex; flex-direction: column; align-items: center;
                gap: 2px; padding: 8px 5px 6px; border-radius: 12px; cursor: pointer;
                background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
                transition: background 0.15s, transform 0.15s; user-select: none;
                --gift-glow: rgba(245,197,24,0.30);
            }
            .gift-quick-item::before {
                content: ''; position: absolute; top: 2px; left: 50%; width: 30px; height: 30px;
                transform: translateX(-50%);
                background: radial-gradient(circle, var(--gift-glow) 0%, transparent 72%);
                filter: blur(3px); pointer-events: none;
            }
            .gift-quick-item[data-tier="rare"]      { --gift-glow: rgba(88,166,255,0.35); }
            .gift-quick-item[data-tier="epic"]      { --gift-glow: rgba(186,104,255,0.40); }
            .gift-quick-item[data-tier="legendary"] { --gift-glow: rgba(255,183,3,0.55); border-color: rgba(255,183,3,0.35); }
            .gift-quick-item:hover  { background: rgba(255,255,255,0.14); }
            .gift-quick-item:active { transform: scale(0.92); }
            .gift-quick-item .g-sym {
                position: relative; z-index: 1; line-height: 1;
            }
            .gift-quick-item .g-sym .tk-emoji-3d { width: 32px; height: 32px; font-size: 1.3rem; }
            .gift-quick-item .g-price {
                font-size: 0.6rem; color: #F5C518; font-weight: 700;
                display: flex; align-items: center; gap: 2px;
            }
        `;
        document.head.appendChild(s);
    })();

    // ─────────────────────────────────────────────────────────────
    // SECTION 3: Animation helpers
    // ─────────────────────────────────────────────────────────────

    /**
     * showGiftAnimation(symbol, giftName)
     * Plays the floating icon animation inside #gift-animation-layer.
     * Heart Mills triggers the multi-heart shower instead.
     *
     * FIX: `symbol` used to be a plain emoji character, so the special
     * Heart Mills case was detected with `symbol === '💖'`. Now that
     * `symbol` is an SVG markup string (see catalog above), that
     * equality check would never match, silently dropping the heart
     * shower. Detect Heart Mills by name instead — pass giftName at
     * every call site.
     */
    function showGiftAnimation(symbol, giftName) {
        const layer = document.getElementById('gift-animation-layer');
        if (!layer) return;

        if (giftName === 'Heart Mills') {
            showHeartMillsAnimation(layer);
        } else {
            const el      = document.createElement('div');
            el.className  = 'gift-animation';

            // PATCH (session 2026-07-19) — see the matching CSS comment
            // above (SECTION 2) for the full rationale. Uses this file's
            // own EMPY_GIFT_CATALOG/.tier directly (the real source of
            // truth) rather than re-deriving thresholds, so it can't drift.
            const _entry = EMPY_GIFT_CATALOG.find(function (g) { return g.name === giftName; });
            if (_entry && (_entry.tier === 'basic' || _entry.tier === 'rare')) {
                el.classList.add('gift-animation-small');
            }
            if (giftName === 'Empy Token' || /class="[^"]*token[^"]*"/i.test(symbol || '')) {
                el.classList.add('gift-animation-token');
            }

            el.innerHTML  = symbol; // symbol is SVG markup, not plain text
            el.dataset.giftName = giftName || '';
            el.style.left = (20 + Math.random() * 60) + '%';
            layer.appendChild(el);
            setTimeout(function () { el.remove(); }, 3000);
        }
    }
    window.showGiftAnimation = showGiftAnimation;

    /**
     * triggerGiftAnimation(symbol, giftName)
     * Alias used by the live quick-send side tab and the quick-rose button.
     * Plays directly inside #gift-animation-layer with giftFloat keyframe.
     */
    function triggerGiftAnimation(symbol, giftName) {
        const layer = document.getElementById('gift-animation-layer');
        if (!layer) return;

        if (giftName === 'Heart Mills') {
            showHeartMillsAnimation(layer);
            return;
        }
        const el      = document.createElement('div');
        el.className  = 'gift-animation';

        // PATCH (session 2026-07-19) — same tier/token classification as
        // showGiftAnimation() above, kept in sync since both read the same
        // EMPY_GIFT_CATALOG.
        const _entry = EMPY_GIFT_CATALOG.find(function (g) { return g.name === giftName; });
        if (_entry && (_entry.tier === 'basic' || _entry.tier === 'rare')) {
            el.classList.add('gift-animation-small');
        }
        if (giftName === 'Empy Token' || /class="[^"]*token[^"]*"/i.test(symbol || '')) {
            el.classList.add('gift-animation-token');
        }

        el.innerHTML  = symbol; // symbol is SVG markup, not plain text
        el.dataset.giftName = giftName || '';
        el.style.left = (20 + Math.random() * 60) + '%';
        layer.appendChild(el);
        setTimeout(function () { el.remove(); }, 2200);
    }
    window.triggerGiftAnimation = triggerGiftAnimation;

    /**
     * showHeartMillsAnimation(layer)
     * Spawns 20 animated hearts for the Heart Mills gift (💖).
     */
    function showHeartMillsAnimation(layer) {
        layer = layer || document.getElementById('gift-animation-layer');
        if (!layer) return;
        const HEART_GLYPHS = ['💖', '💗', '❤️', '💕'];
        for (let i = 0; i < 20; i++) {
            const heart       = document.createElement('span');
            heart.className   = 'heart-mill-animation';
            heart.textContent = HEART_GLYPHS[Math.floor(Math.random() * HEART_GLYPHS.length)];
            const startX      = Math.random() * 100;
            const delay       = Math.random() * 2000;
            heart.style.left  = startX + 'vw';
            heart.style.fontSize = (1.1 + Math.random() * 1.2) + 'rem';
            heart.style.animationDelay = delay + 'ms';
            layer.appendChild(heart);
            setTimeout(function () { heart.remove(); }, 4000 + delay);
        }
    }
    window.showHeartMillsAnimation = showHeartMillsAnimation;

    // ─────────────────────────────────────────────────────────────
    // SECTION 4: populateGiftCatalog
    // Renders the full grid inside #gift-grid-container (modal).
    // ─────────────────────────────────────────────────────────────
    function populateGiftCatalog() {
        const container = document.getElementById('gift-grid-container');
        if (!container) return;
        container.innerHTML = '';

        EMPY_GIFT_CATALOG.forEach(function (gift) {
            const el          = document.createElement('div');
            el.className      = 'gift-item';
            el.dataset.name    = gift.name;
            el.dataset.symbol  = gift.symbol;
            el.dataset.price   = gift.price;
            el.dataset.tier    = gift.tier || _tierForPrice(gift.price);
            el.innerHTML     = `
                <div class="symbol"><span class="tk-emoji-3d">${gift.symbol}</span></div>
                <div class="name">${gift.name}</div>
                <div class="price"><i class="fa-solid fa-coins"></i> ${gift.price.toLocaleString()}</div>`;
            container.appendChild(el);
        });
    }
    window.populateGiftCatalog = populateGiftCatalog;

    // ─────────────────────────────────────────────────────────────
    // SECTION 5: renderGiftSideTab
    // Populates the quick-send side strip shown during live streams
    // (#live-gift-quick-items). Shows the top 8 gifts by tier order.
    // ─────────────────────────────────────────────────────────────
    function renderGiftSideTab() {
        const container = document.getElementById('live-gift-quick-items');
        if (!container) return;

        const topGifts = EMPY_GIFT_CATALOG.slice(0, 8);
        container.innerHTML = topGifts.map(function (g) {
            return `<div class="gift-quick-item"
                        data-gift-name="${g.name}"
                        data-gift-symbol="${g.symbol}"
                        data-gift-price="${g.price}"
                        data-tier="${g.tier || _tierForPrice(g.price)}"
                        title="${g.name} — ${g.price} EMPY">
                        <span class="g-sym"><span class="tk-emoji-3d">${g.symbol}</span></span>
                        <span class="g-price">${g.price}
                            <i class="fa-solid fa-coins" style="font-size:0.55rem;margin-left:2px;"></i>
                        </span>
                    </div>`;
        }).join('');

        // Wire quick-send clicks
        container.querySelectorAll('.gift-quick-item').forEach(function (item) {
            item.addEventListener('click', function () {
                // Guest guard
                if (window.isGuest) {
                    if (typeof window.showNotification === 'function') {
                        window.showNotification('Please log in to send gifts.', 'warning');
                    }
                    return;
                }
                const price = parseInt(this.dataset.giftPrice, 10);
                const us    = window.userState || {};
                if ((us.empyBalance || 0) < price) {
                    if (typeof window.showNotification === 'function') {
                        window.showNotification(
                            'Insufficient EMPY. You need ' + price + ' EMPY for this gift.', 'error'
                        );
                    }
                    const buyModal = document.getElementById('buy-empy-modal');
                    if (buyModal) buyModal.classList.add('show');
                    return;
                }

                // Deduct and animate
                us.empyBalance -= price;
                if (typeof window.updateWalletUI === 'function') window.updateWalletUI();

                const hostName = (
                    document.getElementById('live-host-name') || {}
                ).textContent || 'the host';

                if (typeof window.showNotification === 'function') {
                    // FIX: this used to splice `this.dataset.giftSymbol` (now
                    // SVG markup, not a plain emoji character) straight into
                    // a plain-text toast -- showNotification() renders via
                    // textContent, so the raw <svg>...</svg> markup would
                    // have shown up as literal garbled text on screen.
                    window.showNotification(
                        this.dataset.giftName + ' sent to ' + hostName + '!', 'success'
                    );
                }
                triggerGiftAnimation(this.dataset.giftSymbol, this.dataset.giftName);

                // Reward sender
                if (typeof window.rewardUserForAction === 'function') {
                    window.rewardUserForAction('SEND_GIFT');
                }

                // Credit live goal
                const lsd = window.liveStreamData;
                if (lsd && lsd.liveGoal) {
                    lsd.liveGoal.currentAmount = (lsd.liveGoal.currentAmount || 0) + price;
                    if (typeof window.updateLiveUI === 'function') window.updateLiveUI();
                }

                // Persist to Firestore
                try {
                    if (window.fbDb && window._firebaseLoaded && lsd) {
                        window.fbDb.collection('live_gifts').add({
                            senderId:   us.id,
                            senderName: us.fullName || us.username || 'Someone',
                            hostId:     lsd.hostUserId || null,
                            streamId:   lsd.streamId   || null,
                            giftName:   this.dataset.giftName,
                            giftSymbol: this.dataset.giftSymbol,
                            amount:     price,
                            createdAt:  new Date().toISOString()
                        }).catch(function () {});
                    }
                } catch (e) {}

                // FIX (2026-08-27 — gifting/earnings consolidation): this
                // quick-send tab never credited the host at all (see
                // _creditGiftEarnings's header comment above). Now credits
                // the host's real, withdrawable giftTokenBalance.
                _creditGiftEarnings(lsd && lsd.hostUserId, us.id, price);
            });
        });
    }
    window.renderGiftSideTab = renderGiftSideTab;

    // ─────────────────────────────────────────────────────────────
    // SHARED: credit a gift recipient's REAL, withdrawable earnings
    // FIX (2026-08-27 — gifting/earnings consolidation): every gift-send
    // path in this app credited the recipient inconsistently. Traced all
    // four:
    //   - SECTION 5 quick-send side tab: only ever wrote a `live_gifts`
    //     LOG doc — no recipient balance was touched anywhere, real or
    //     mock. The host received nothing.
    //   - SECTION 6 handleSendGift (full catalog / live participant
    //     popup): only updated `window.mockUsers[recipientId].empyBalance`,
    //     an in-memory demo object — never reached Firestore, so the
    //     real recipient's balance never moved on any other device.
    //   - SECTION 11 birthday/profile gifts: the ONLY path that actually
    //     wrote to the recipient's real Firestore doc — but credited
    //     `empyBalance` (the general spend balance), not
    //     `giftTokenBalance` (the ledger earnings-routes.js's Gifting &
    //     Tipping withdrawal tier actually reads — see that file's own
    //     header). Crediting empyBalance also would have let a gift
    //     recipient re-spend value the sender already paid for once,
    //     on top of not being withdrawable.
    //   - app-live-tiktok-patch.js's sendQuickRose: debited the sender
    //     and logged a `live_gifts` doc, but credited no one at all.
    // Net effect: a gift/tip/birthday-gift recipient's `giftTokenBalance`
    // never increased no matter how many gifts they received, so
    // "withdraw my gift earnings" always saw $0 available beyond
    // whatever EMPY they'd personally purchased.
    // FIX: one shared, real Firestore credit path, called from every
    // gift-send site below (and exposed on window so
    // app-live-tiktok-patch.js's sendQuickRose can call it too, the
    // same "expose one function, don't duplicate the flow" convention
    // this codebase already uses elsewhere — e.g. app-patch-v37.js's
    // window._empGetGuestClient()). Uses the SAME increase-only,
    // capped Firestore rule (isGiftTokenBalanceCreditOnlyUpdate,
    // firebase-rules.js) already in place for server.js's purchase
    // credit — no rule change needed.
    // ─────────────────────────────────────────────────────────────
    function _creditGiftEarnings(recipientId, senderId, amount) {
        try {
            if (!recipientId || !amount) return;
            if (senderId && recipientId === senderId) return; // never self-credit
            if (!window.fbDb || !window._firebaseLoaded) return;
            var fv = (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) || null;
            if (!fv) return;
            window.fbDb.collection('users').doc(recipientId).update({
                giftTokenBalance: fv.increment(amount)
            }).catch(function (err) {
                console.warn('[Gifts] recipient giftTokenBalance credit failed:', err && err.message);
            });
        } catch (e) { /* never let a credit failure break the sender's own flow */ }
    }
    window._empCreditGiftEarnings = _creditGiftEarnings;

    // ─────────────────────────────────────────────────────────────
    // SECTION 6: Core send-gift handler
    // Called when user clicks #send-gift-btn inside the full catalog
    // modal (#live-gift-catalog-modal).
    // ─────────────────────────────────────────────────────────────
    window.handleSendGift = function handleSendGift() {
        const gift = window._selectedGift;
        const us   = window.userState || {};

        if (!gift) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Please select a gift first.', 'error');
            }
            return;
        }
        if ((us.empyBalance || 0) < gift.price) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Insufficient EMPY balance to send this gift.', 'error');
            }
            return;
        }

        // Deduct sender's balance
        us.empyBalance -= gift.price;

        // Play animation
        showGiftAnimation(gift.symbol, gift.name);

        // Resolve recipient
        const catalogModal  = document.getElementById('live-gift-catalog-modal');
        const lsd           = window.liveStreamData || {};
        const recipientId   = (catalogModal && catalogModal.dataset.recipientId)   || lsd.hostUserId   || null;
        const recipientName = (catalogModal && catalogModal.dataset.recipientName) ||
            (document.getElementById('live-host-name') || {}).textContent || 'host';

        // Clean up modal recipient attrs
        if (catalogModal) {
            delete catalogModal.dataset.recipientId;
            delete catalogModal.dataset.recipientName;
        }

        // Announce in live chat
        if (typeof window.createLiveComment === 'function') {
            // FIX: used to append gift.symbol (now SVG markup) to plain text
            // passed through createLiveComment -> formatWhatsAppText, which
            // HTML-escapes '<'/'>' -- would have shown as literal
            // "&lt;svg..." text in chat. Symbol is decorative only; drop it.
            window.createLiveComment(
                us.fullName || 'Someone',
                'Sent a ' + gift.name + ' to ' + recipientName + '!'
            );
        }

        if (typeof window.showNotification === 'function') {
            window.showNotification(
                '🎁 You sent ' + gift.name + ' (' + gift.price + ' EMPY) to ' + recipientName + '!',
                'success'
            );
        }

        // Credit recipient's wallet (local mock + REAL Firestore earnings)
        if (recipientId && recipientId !== us.id) {
            const mockUsers   = window.mockUsers || {};
            const recipient   = mockUsers[recipientId];
            if (recipient) {
                recipient.empyBalance = (recipient.empyBalance || 0) + gift.price;
            }
            // FIX (2026-08-27 — gifting/earnings consolidation): the block
            // above only ever touched `window.mockUsers`, an in-memory demo
            // object — it never reached the real recipient's Firestore doc,
            // so gifts sent through the full catalog / live participant
            // popup never actually paid out (see _creditGiftEarnings's
            // header comment above). This is the real, withdrawable credit.
            _creditGiftEarnings(recipientId, us.id, gift.price);
            // Push notification to recipient if they're viewing
            if (typeof window.pushNotification === 'function') {
                window.pushNotification(
                    (us.fullName || 'Someone') + ' sent you a ' + gift.name + '! +' + gift.price + ' EMPY',
                    'success'
                );
            }
            // Persist gift transaction
            try {
                if (window.fbDb && window._firebaseLoaded) {
                    window.fbDb.collection('live_gifts').add({
                        senderId:      us.id,
                        senderName:    us.fullName  || us.username || 'Someone',
                        recipientId:   recipientId,
                        recipientName: recipientName,
                        streamId:      lsd.streamId || null,
                        giftName:      gift.name,
                        giftSymbol:    gift.symbol,
                        amount:        gift.price,
                        createdAt:     new Date().toISOString()
                    }).catch(function () {});
                }
            } catch (e) {}
        }

        // Reward sender for gifting
        if (typeof window.rewardUserForAction === 'function') {
            window.rewardUserForAction('SEND_GIFT');
        }

        // Update wallet display
        if (typeof window.updateWalletUI === 'function') window.updateWalletUI();

        // Credit live goal
        if (lsd.liveGoal) {
            lsd.liveGoal.currentAmount = (lsd.liveGoal.currentAmount || 0) + gift.price;
            if (typeof window.updateLiveUI === 'function') window.updateLiveUI();
        }

        // Reset selection
        window._selectedGift = null;
        document.querySelectorAll('.gift-item.selected').forEach(function (el) {
            el.classList.remove('selected');
        });

        // Close catalog modal
        if (catalogModal) catalogModal.classList.remove('show');
        document.body.classList.remove('modal-open');
    };

    // ─────────────────────────────────────────────────────────────
    // SECTION 7: openGiftCatalog
    // Opens the full catalog modal, optionally pre-targeting a recipient
    // (used from the participant popup in live streams).
    // ─────────────────────────────────────────────────────────────
    window.openGiftCatalog = function openGiftCatalog(recipientId, recipientName) {
        const modal = document.getElementById('live-gift-catalog-modal');
        if (!modal) return;

        // FIX ("host control: sending gifts worked once, then stopped" —
        // confirmed via console trace: classList.add('show') fires on
        // every tap, but nothing ever reappears after the first close).
        // Some close paths elsewhere in the codebase (a generic capture-
        // phase close-button handler) leave a stale inline
        // style="display:none" on this modal. An inline style always
        // beats the ".live-sub-modal.show { display:flex }" CSS rule, so
        // every open after the first stale close silently failed with no
        // visible error — the class was added correctly, the modal just
        // never became visible. Clearing any stale inline display/
        // visibility HERE, at the one source both entry points (footer
        // button and every guest/grid box gift icon) already funnel
        // through, guarantees every open actually shows the modal
        // regardless of which handler closed it last time.
        modal.style.removeProperty('display');
        modal.style.removeProperty('visibility');

        if (recipientId)   modal.dataset.recipientId   = recipientId;
        if (recipientName) modal.dataset.recipientName = recipientName;

        // Update title if targeting a specific person
        const titleEl = modal.querySelector('h3');
        if (titleEl) {
            titleEl.innerHTML = recipientName
                ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg> Send Gift to ' + recipientName
                : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg> Send a Gift';
        }

        // Ensure grid is populated
        populateGiftCatalog();
        modal.classList.add('show');
        document.body.classList.add('modal-open');
    };

    // ─────────────────────────────────────────────────────────────
    // SECTION 8: Event delegation — catalog item selection & buttons
    // ─────────────────────────────────────────────────────────────
    document.addEventListener('click', function (e) {
        const closest = function (sel) { return e.target.closest ? e.target.closest(sel) : null; };

        // ── Gift item selection (in full catalog modal) ──────────
        // DISABLED (root cause of "gift only works once then freezes",
        // same disease already fixed below for #live-gift-btn):
        // app-fixes.js's master click handler ALSO matches '.gift-item'
        // and immediately calls _empySendGiftNow(selectedGift) to send the
        // gift for real (search app-fixes.js for "disable one-time send
        // gift"). Both listeners are independent and BOTH always ran on
        // every tap -- this copy only set window._selectedGift, while
        // app-fixes.js's copy read its own separate local `selectedGift`
        // variable and sent/debited immediately. Two handlers reacting to
        // one tap, each tracking its own "selected gift" state, is exactly
        // the class of bug that looks like "does nothing" or "sends
        // twice" depending on timing. Disabled here so app-fixes.js's copy
        // is the one and only place a gift tap is handled.
        const giftItem = false && closest('.gift-item');
        if (giftItem) {
            document.querySelectorAll('.gift-item.selected').forEach(function (el) {
                el.classList.remove('selected');
            });
            giftItem.classList.add('selected');
            window._selectedGift = {
                name:   giftItem.dataset.name,
                symbol: giftItem.dataset.symbol,
                price:  parseFloat(giftItem.dataset.price)
            };
            return;
        }

        // ── Send Gift button ─────────────────────────────────────
        // DISABLED (same root cause): app-fixes.js's modalAction chain
        // ALSO handles `#send-gift-btn` (its own "kept for backward
        // compatibility" branch, calling the shared _empySendGiftNow), so
        // a single tap on Send used to fire BOTH window.handleSendGift()
        // here AND app-fixes.js's copy -- a real double-send/double-debit
        // on one tap, not just a cosmetic duplicate. Disabled so
        // app-fixes.js's copy is the sole handler.
        if (false && closest('#send-gift-btn')) {
            e.preventDefault();
            window.handleSendGift();
            return;
        }

        // ── Live "Gift" button toggles full catalog ──────────────
        // DISABLED (root cause of "gift icon works once then freezes"):
        // app-fixes.js's master click handler ALSO does
        // catalogModal.classList.toggle('show') for this exact same
        // button (#live-gift-btn), and both handlers fire on every
        // single tap (they're two independent document click listeners,
        // not one -- both always run). That means every tap toggled the
        // modal open, then immediately closed it again in the same
        // click, back-to-back, silently -- which looks exactly like
        // "does nothing" on a tap. Disabled here so app-fixes.js's copy
        // (which also closes the viewers modal and refreshes the wallet
        // UI) is the single authoritative handler -- same "one
        // authoritative handler" pattern already used elsewhere in this
        // codebase for this exact class of bug (see the disabled
        // .live-viewers block in app-fixes.js).
        if (false && closest('#live-gift-btn')) {
            const catalog = document.getElementById('live-gift-catalog-modal');
            if (catalog) {
                catalog.classList.toggle('show');
                if (catalog.classList.contains('show')) populateGiftCatalog();
            }
            return;
        }

        // ── "All Gifts" tab button in side tab → open full catalog ──
        if (closest('#live-gift-all-btn')) {
            window.openGiftCatalog();
            return;
        }
    });

    // ─────────────────────────────────────────────────────────────
    // SECTION 9: Auto-populate catalog when modal opens (MutationObserver)
    // and show/hide side tab with live modal.
    // ─────────────────────────────────────────────────────────────
    (function wireModals() {
        // Full catalog modal — populate on first show
        const catalogModal = document.getElementById('live-gift-catalog-modal');
        if (catalogModal) {
            const obs = new MutationObserver(function (muts) {
                muts.forEach(function (m) {
                    if (m.attributeName === 'class') {
                        if (catalogModal.classList.contains('show')) {
                            populateGiftCatalog();
                        }
                    }
                });
            });
            obs.observe(catalogModal, { attributes: true, attributeFilter: ['class'] });
        }

        // Live stream modal — show/hide gift side tab
        const liveModal = document.getElementById('go-live-modal-overlay');
        if (liveModal) {
            const obs2 = new MutationObserver(function () {
                const sideTab = document.getElementById('live-gift-side-tab');
                if (liveModal.classList.contains('show')) {
                    renderGiftSideTab();
                    if (sideTab) sideTab.style.display = 'flex';
                } else {
                    if (sideTab) sideTab.style.display = 'none';
                }
            });
            obs2.observe(liveModal, { attributes: true, attributeFilter: ['class'] });
        }
    })();

    // ─────────────────────────────────────────────────────────────
    // SECTION 10: DOMContentLoaded — initial catalog seeding
    // ─────────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', populateGiftCatalog);
    } else {
        // DOM already ready (script loaded late)
        populateGiftCatalog();
    }

    // ─────────────────────────────────────────────────────────────
    // SECTION 11: Birthday / Profile Gift Catalog
    // A second, independent "Send a Gift" modal — separate from
    // #live-gift-catalog-modal (live-stream only: targets the live
    // host/a guest, credits `liveStreamIncome`) — for sending a gift
    // to ANY user's profile. Currently opened from app-profile.js's
    // "Send a Gift" button, shown on a profile whose owner's
    // dobMonthDay matches today (the birthday feature).
    //
    // PAYMENT MODEL: same EMPY-token economy as everywhere else in
    // this app, per this session's own direction — nothing new to
    // pay with. Insufficient balance opens the SAME existing
    // #buy-empy-modal (Flutterwave debit/credit-card checkout,
    // server-verified via /api/wallet/confirm-purchase — see
    // app-wallet.js §7/§8) rather than building a second payment
    // path. Sending debits the sender's own empyBalance (self-update,
    // satisfies firebase-rules.js's isSelfEmpyBalanceNonIncreasing)
    // and credits the recipient's REAL empyBalance directly via the
    // existing isEmpyBalanceCreditOnlyUpdate rule — the same
    // already-audited "any signed-in sender may only ever raise this
    // one field on someone else's user doc" mechanism a wallet
    // transfer/escrow release already uses, so no new Firestore rule
    // is needed for /users/{userId} itself.
    //
    // CATALOG: reuses EMPY_GIFT_CATALOG's existing, already-tested
    // icons/prices for all three tabs rather than inventing a second
    // price list. "Virtual Gifts" is the exact four items from the
    // reference mockup (Teddy Bear, Birthday Cake, Flower Bouquet,
    // Gift Box — the latter two added to the shared catalog above).
    // "Gift Cards" and "Real Gifts" are populated with existing
    // mid/high-tier items as symbolic categories — there is no real
    // gift-card vendor or physical-shipping integration anywhere in
    // this codebase, so every tab settles the same way: an instant
    // EMPY-token transfer, recorded as `status:'delivered'` (nothing
    // to fulfill), never `'pending'`.
    //
    // PERSISTENCE: each send writes one `birthday_feed` doc (spec:
    // the wishes/gifts feed for the birthday person) and one `gifts`
    // doc referencing it via birthdayFeedId (spec: gift_id, sender_id,
    // recipient_id, gift_type, message, timestamp, status) — see the
    // matching rules added to firebase-rules.js.
    // ─────────────────────────────────────────────────────────────
    function _authUid() {
        try {
            if (window.fbAuth && window.fbAuth.currentUser && window.fbAuth.currentUser.uid) {
                return window.fbAuth.currentUser.uid;
            }
        } catch (e) {}
        return (window.userState && window.userState.id) || null;
    }

    function _pgFieldValue() {
        return (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) || null;
    }

    function _pgByNames(names) {
        return names.map(function (n) {
            return EMPY_GIFT_CATALOG.find(function (g) { return g.name === n; });
        }).filter(Boolean);
    }

    const PROFILE_GIFT_TABS = {
        virtual:  ['Teddy Bear', 'Birthday Cake', 'Flower Bouquet', 'Gift Box'],
        giftcard: ['Perfume', 'Diamond Ring', 'Champagne', 'Luxury Watch'],
        real:     ['Camera', 'Guitar', 'Laptop', 'Car']
    };

    var _pgState = { recipientId: null, recipientName: null, tab: 'virtual', selected: null };

    function _pgEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _ensureProfileGiftModal() {
        if (document.getElementById('profile-gift-catalog-modal')) return;

        var css = document.createElement('style');
        css.id = '_pg_gift_modal_css';
        css.textContent = [
            '#profile-gift-catalog-modal .pg-card { background:#fff; border-radius:18px; max-width:420px; width:92vw; max-height:88vh; overflow-y:auto; padding:22px; position:relative; }',
            '#profile-gift-catalog-modal .pg-close { position:absolute; top:14px; left:16px; font-size:1.3rem; background:none; border:none; cursor:pointer; color:#334; line-height:1; }',
            '#profile-gift-catalog-modal h3 { text-align:center; margin:4px 0 2px; font-size:1.15rem; color:#1B2B8B; }',
            '#profile-gift-catalog-modal .pg-sub { text-align:center; color:#667; font-size:0.85rem; margin-bottom:14px; }',
            '#profile-gift-catalog-modal .pg-tabs { display:flex; gap:8px; margin-bottom:16px; }',
            '#profile-gift-catalog-modal .pg-tab { flex:1; padding:8px 4px; border-radius:10px; border:1px solid rgba(27,43,139,0.2); background:#fff; color:#1B2B8B; font-size:0.8rem; font-weight:700; cursor:pointer; text-align:center; }',
            '#profile-gift-catalog-modal .pg-tab.active { background:#1B2B8B; color:#fff; }',
            '#profile-gift-catalog-modal .pg-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }',
            '#profile-gift-catalog-modal .pg-item { border:1px solid rgba(10,14,39,0.1); border-radius:14px; padding:14px 8px; text-align:center; cursor:pointer; background:#fafbff; }',
            '#profile-gift-catalog-modal .pg-item.selected { border-color:#1B2B8B; background:rgba(27,43,139,0.08); box-shadow:0 0 0 2px rgba(27,43,139,0.25); }',
            '#profile-gift-catalog-modal .pg-item .pg-emoji { font-size:2.1rem; display:block; margin-bottom:6px; }',
            '#profile-gift-catalog-modal .pg-item .pg-name { font-size:0.82rem; font-weight:700; color:#223; }',
            '#profile-gift-catalog-modal .pg-item .pg-price { font-size:0.75rem; color:#8a6d1a; margin-top:2px; }',
            '#profile-gift-catalog-modal textarea#pg-message { width:100%; box-sizing:border-box; border:1px solid rgba(10,14,39,0.15); border-radius:12px; padding:10px 12px; font-size:0.88rem; resize:none; min-height:44px; margin-bottom:14px; font-family:inherit; }',
            '#profile-gift-catalog-modal .pg-send-btn { width:100%; padding:13px; border:none; border-radius:24px; background:linear-gradient(135deg,#1B2B8B,#3B5BDB); color:#fff; font-weight:700; font-size:0.95rem; cursor:pointer; }',
            '#profile-gift-catalog-modal .pg-send-btn:disabled { opacity:0.5; cursor:not-allowed; }',
            '#profile-gift-catalog-modal .pg-confirm-emoji { font-size:4rem; text-align:center; display:block; margin:10px 0; }',
            '#profile-gift-catalog-modal .pg-confirm-sub { text-align:center; font-weight:800; color:#1B2B8B; margin-bottom:16px; }',
            '#profile-gift-catalog-modal .pg-summary { background:#fafbff; border-radius:12px; padding:12px 14px; margin-bottom:16px; font-size:0.85rem; }',
            '#profile-gift-catalog-modal .pg-summary-row { display:flex; justify-content:space-between; margin-bottom:6px; }',
            '#profile-gift-catalog-modal .pg-secondary-btn { width:100%; padding:12px; border:1px solid rgba(10,14,39,0.15); border-radius:24px; background:#fff; color:#334; font-weight:700; font-size:0.9rem; cursor:pointer; margin-top:10px; }'
        ].join('\n');
        document.head.appendChild(css);

        var wrap = document.createElement('div');
        wrap.id = 'profile-gift-catalog-modal';
        wrap.className = 'modal-overlay-container';
        wrap.innerHTML =
            '<div class="pg-card">' +
                '<button class="pg-close" type="button" data-pg-action="close" aria-label="Close">&#8592;</button>' +
                '<div id="pg-view-catalog">' +
                    '<h3><i class="fas fa-gift"></i> Send a Gift</h3>' +
                    '<div class="pg-sub" id="pg-recipient-sub">Select a Gift</div>' +
                    '<div class="pg-tabs">' +
                        '<button type="button" class="pg-tab active" data-pg-tab="virtual">Virtual Gifts</button>' +
                        '<button type="button" class="pg-tab" data-pg-tab="giftcard">Gift Cards</button>' +
                        '<button type="button" class="pg-tab" data-pg-tab="real">Real Gifts</button>' +
                    '</div>' +
                    '<div class="pg-grid" id="pg-grid"></div>' +
                    '<textarea id="pg-message" maxlength="200" placeholder="Add a Personal Message."></textarea>' +
                    '<button type="button" class="pg-send-btn" id="pg-send-btn" data-pg-action="send" disabled>Send Gift</button>' +
                '</div>' +
                '<div id="pg-view-confirm" style="display:none;">' +
                    '<span class="pg-confirm-emoji" id="pg-confirm-emoji"></span>' +
                    '<h3 id="pg-confirm-title">Gift Sent!</h3>' +
                    '<div class="pg-confirm-sub">Your Gift Has Been Sent!</div>' +
                    '<div class="pg-summary" id="pg-summary"></div>' +
                    '<button type="button" class="pg-send-btn" data-pg-action="again">Send Another Gift</button>' +
                    '<button type="button" class="pg-secondary-btn" data-pg-action="close">Done</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(wrap);
    }

    function _renderProfileGiftGrid() {
        var grid = document.getElementById('pg-grid');
        if (!grid) return;
        var items = _pgByNames(PROFILE_GIFT_TABS[_pgState.tab] || []);
        grid.innerHTML = items.map(function (g) {
            var sel = (_pgState.selected && _pgState.selected.name === g.name) ? ' selected' : '';
            return '<div class="pg-item' + sel + '" data-pg-gift="' + _pgEsc(g.name) + '">' +
                '<span class="pg-emoji">' + g.symbol + '</span>' +
                '<div class="pg-name">' + _pgEsc(g.name) + '</div>' +
                '<div class="pg-price">' + g.price + ' EMPY</div>' +
                '</div>';
        }).join('');
    }

    function _updatePgSendBtn() {
        var btn = document.getElementById('pg-send-btn');
        if (btn) btn.disabled = !_pgState.selected;
    }

    function _closeProfileGiftModal() {
        var modal = document.getElementById('profile-gift-catalog-modal');
        if (modal) modal.classList.remove('show');
        document.body.classList.remove('modal-open');
    }

    window.openProfileGiftCatalog = function (recipientId, recipientName) {
        if (!recipientId) return;
        _ensureProfileGiftModal();
        _pgState.recipientId   = recipientId;
        _pgState.recipientName = recipientName || 'this user';
        _pgState.tab = 'virtual';
        _pgState.selected = null;

        var modal = document.getElementById('profile-gift-catalog-modal');
        document.getElementById('pg-view-catalog').style.display = 'block';
        document.getElementById('pg-view-confirm').style.display = 'none';
        document.getElementById('pg-recipient-sub').textContent = 'Select a Gift for ' + _pgState.recipientName;
        document.getElementById('pg-message').value = '';
        document.querySelectorAll('#profile-gift-catalog-modal .pg-tab').forEach(function (t) {
            t.classList.toggle('active', t.dataset.pgTab === 'virtual');
        });
        _renderProfileGiftGrid();
        _updatePgSendBtn();

        // Same stale-inline-style guard openGiftCatalog() already uses
        // (SECTION 7) — a generic close-button handler elsewhere can
        // leave display:none inline, which would otherwise beat the
        // .modal-overlay-container.show CSS rule on every open after
        // the first close.
        modal.style.removeProperty('display');
        modal.style.removeProperty('visibility');
        modal.classList.add('show');
        document.body.classList.add('modal-open');
    };

    async function _sendProfileGift() {
        var gift = _pgState.selected;
        var us   = window.userState || {};
        if (!gift) {
            if (typeof window.showNotification === 'function') window.showNotification('Please select a gift first.', 'error');
            return;
        }
        if (!_pgState.recipientId) return;
        if (_pgState.recipientId === us.id) {
            if (typeof window.showNotification === 'function') window.showNotification("You can't send a gift to yourself.", 'error');
            return;
        }
        if ((us.empyBalance || 0) < gift.price) {
            if (typeof window.showNotification === 'function') window.showNotification('Insufficient EMPY balance — top up to send this gift.', 'error');
            var buyModal = document.getElementById('buy-empy-modal');
            if (buyModal) { buyModal.classList.add('show'); document.body.classList.add('modal-open'); }
            return;
        }

        var message = ((document.getElementById('pg-message') || {}).value || '').trim().slice(0, 200);
        var senderId   = _authUid() || us.id;
        var senderName = us.fullName || us.username || 'Someone';

        var btn = document.getElementById('pg-send-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

        // Debit sender — local display + Firestore self-update. A self
        // update may only ever DECREASE empyBalance (see firebase-rules.js's
        // isSelfEmpyBalanceNonIncreasing on the owner-only /users/{userId}
        // rule), which is exactly what this is.
        us.empyBalance = (us.empyBalance || 0) - gift.price;
        if (typeof window.updateWalletUI === 'function') window.updateWalletUI();
        try {
            if (window.fbDb && window._firebaseLoaded && senderId) {
                window.fbDb.collection('users').doc(senderId).update({ empyBalance: us.empyBalance }).catch(function () {});
            }
        } catch (e) {}

        try {
            if (window.fbDb && window._firebaseLoaded) {
                // birthday_feed first so the gifts doc below can link to it
                // (spec: "each gift transaction links to the birthday_feed
                // entry").
                var feedRef = await window.fbDb.collection('birthday_feed').add({
                    birthdayUserId: _pgState.recipientId,
                    type: 'gift',
                    senderId: senderId,
                    senderName: senderName,
                    senderAvatar: us.avatar || '',
                    message: message,
                    giftName: gift.name,
                    giftSymbol: gift.symbol,
                    giftAmount: gift.price,
                    createdAt: new Date().toISOString()
                });

                await window.fbDb.collection('gifts').add({
                    senderId: senderId,
                    recipientId: _pgState.recipientId,
                    giftType: gift.name,
                    giftSymbol: gift.symbol,
                    amount: gift.price,
                    message: message,
                    status: 'delivered', // EMPY-token transfer — nothing physical to fulfill
                    birthdayFeedId: feedRef.id,
                    timestamp: new Date().toISOString()
                });

                // FIX (2026-08-27 — gifting/earnings consolidation): this
                // used to credit `empyBalance` — isEmpyBalanceCreditOnlyUpdate
                // (firebase-rules.js) does allow it, but empyBalance is the
                // general SPEND balance, not the ledger earnings-routes.js's
                // Gifting & Tipping withdrawal tier reads from. Crediting it
                // here would also let the recipient re-spend value the
                // sender already paid for once, instead of being able to
                // withdraw it. Birthday gifts are gift-earnings like any
                // other, so they now go through the same real,
                // withdrawable giftTokenBalance credit every other
                // gift-send path in this file uses — see
                // _creditGiftEarnings's header comment near the top of
                // this file.
                _creditGiftEarnings(_pgState.recipientId, senderId, gift.price);
            }
        } catch (err) {
            console.warn('[ProfileGift] Firestore write failed:', err && err.message);
        }

        if (typeof window.rewardUserForAction === 'function') window.rewardUserForAction('SEND_GIFT');

        // Confirmation screen
        document.getElementById('pg-view-catalog').style.display = 'none';
        document.getElementById('pg-view-confirm').style.display = 'block';
        document.getElementById('pg-confirm-emoji').innerHTML = gift.symbol;
        document.getElementById('pg-confirm-title').textContent = 'Gift Sent to ' + _pgState.recipientName + '!';
        document.getElementById('pg-summary').innerHTML =
            '<div class="pg-summary-row"><span>' + gift.symbol + ' ' + _pgEsc(gift.name) + '</span><span>' + gift.price + ' EMPY</span></div>' +
            (message ? '<div><strong>Message:</strong> \u201c' + _pgEsc(message) + '\u201d</div>' : '');

        if (btn) { btn.disabled = false; btn.textContent = 'Send Gift'; }
        if (typeof window.showNotification === 'function') window.showNotification('🎁 Gift sent to ' + _pgState.recipientName + '!', 'success');
    }

    document.addEventListener('click', function (e) {
        var modal = document.getElementById('profile-gift-catalog-modal');
        if (!modal) return;
        var closest = function (sel) { return e.target.closest ? e.target.closest(sel) : null; };

        var tabBtn = closest('#profile-gift-catalog-modal .pg-tab');
        if (tabBtn) {
            _pgState.tab = tabBtn.dataset.pgTab;
            _pgState.selected = null;
            document.querySelectorAll('#profile-gift-catalog-modal .pg-tab').forEach(function (t) {
                t.classList.toggle('active', t === tabBtn);
            });
            _renderProfileGiftGrid();
            _updatePgSendBtn();
            return;
        }

        var itemEl = closest('#profile-gift-catalog-modal .pg-item');
        if (itemEl) {
            var name = itemEl.dataset.pgGift;
            _pgState.selected = EMPY_GIFT_CATALOG.find(function (g) { return g.name === name; }) || null;
            _renderProfileGiftGrid();
            _updatePgSendBtn();
            return;
        }

        var actionEl = closest('[data-pg-action]');
        if (actionEl) {
            var action = actionEl.dataset.pgAction;
            if (action === 'close') {
                _closeProfileGiftModal();
            } else if (action === 'send') {
                _sendProfileGift();
            } else if (action === 'again') {
                _pgState.selected = null;
                document.getElementById('pg-view-catalog').style.display = 'block';
                document.getElementById('pg-view-confirm').style.display = 'none';
                document.getElementById('pg-message').value = '';
                _renderProfileGiftGrid();
                _updatePgSendBtn();
            }
        }
    });

    // ─────────────────────────────────────────────────────────────
    // SECTION 12: Dashboard "Birthdays Today" row + Birthday Wishes feed
    // FEATURE (requested): a horizontally-scrollable row on the general
    // dashboard, visible to EVERYONE (not just followers — that's the
    // existing FCM push's job in server.js; this is the in-app,
    // "everybody can see and scroll through today's birthdays" version).
    // Tapping a thumbnail opens a "Birthday Wishes" feed/comments modal
    // for that person, backed by the SAME `birthday_feed` collection
    // SECTION 11's gift-sending already writes to (type:'gift' there,
    // type:'wish' here for a free-text birthday message with no EMPY
    // cost) — one shared, chronological feed per birthday person, gifts
    // and text wishes interleaved, the same way a Facebook birthday
    // post's comment thread mixes well-wishes and gifts.
    //
    // "DISAPPEARS AFTER 24 HOURS": achieved by construction, not by an
    // expiry timestamp/cleanup job — the row's membership query is
    // `dobMonthDay === today's own local MM-DD`, so a person silently
    // drops out of the row the instant the calendar date changes. The
    // one case that needs explicit handling is a tab left open PAST
    // midnight, where "today" computed once at load would go stale —
    // _armBirthdayRow() re-checks what day it is on an interval (not
    // just once at load) and re-queries whenever the date has actually
    // rolled over, so a long-lived tab correctly empties the row on its
    // own without needing a reload.
    // ─────────────────────────────────────────────────────────────
    function _bdTodayMonthDay() {
        var d = new Date();
        return String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    var _bdRow = { day: null, unsub: null, users: [] };
    var _bdFeed = { userId: null, unsub: null };

    function _bdEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _bdTimeAgo(iso) {
        var t = new Date(iso).getTime();
        if (!t || isNaN(t)) return '';
        var diff = Math.max(0, Date.now() - t);
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        return Math.floor(hrs / 24) + 'd ago';
    }

    (function injectBirthdayRowCSS() {
        if (document.getElementById('_bd_row_css')) return;
        var css = document.createElement('style');
        css.id = '_bd_row_css';
        css.textContent = [
            /* Row card reuses .horizontal-slider-container/-wrapper's own
               overflow-x:auto scrolling — no new scroll mechanism here. */
            '.emp-bday-chip{flex:0 0 auto;width:76px;text-align:center;cursor:pointer;padding:4px 2px;}',
            '.emp-bday-chip-ring{width:64px;height:64px;border-radius:50%;padding:3px;margin:0 auto 6px;',
            'background:linear-gradient(135deg,#F5C518,#F08C1A,#EF4444);display:flex;align-items:center;justify-content:center;position:relative;}',
            '.emp-bday-chip-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;border:2px solid #fff;background:#e2e6f5;}',
            /* PREMIUM PASS (2026-08-25 — "make all the icons premium
               including the cake"): was a flat white circle behind the
               🎂 emoji. Now a gold-gradient badge with a soft pulsing glow
               (matches the new .bd-header-cake-badge below) so the whole
               birthday feature reads as one consistent "premium/VIP" gold
               treatment instead of a plain sticker. */
            '.emp-bday-chip-cake{position:absolute;bottom:-3px;right:-2px;font-size:1rem;',
            'background:radial-gradient(circle at 35% 30%,#FFE9A8,#F5C518 55%,#F08C1A 100%);border-radius:50%;width:22px;height:22px;',
            'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(240,140,26,0.5),inset 0 0 0 1.5px #fff;',
            'animation:bdCakeGlow 2.4s ease-in-out infinite;}',
            '.emp-bday-chip-name{font-size:0.72rem;font-weight:700;color:var(--text-main,#1B2B8B);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.emp-bday-chip:active .emp-bday-chip-ring{transform:scale(0.94);}',
            /* Dashboard section-header badge (index.html's "Birthdays
               Today" <h3>) — replaces the old flat-colored Font-Awesome
               glyph (see index.html's own FIX comment at that <h3> for why:
               it could render as a broken/tofu box on a slow FA CDN load).
               Same gold-gradient + glow treatment as the chip badge above
               so the header icon and the row icons read as one family. */
            '.bd-header-cake-badge{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;',
            'background:radial-gradient(circle at 35% 30%,#FFE9A8,#F5C518 55%,#F08C1A 100%);box-shadow:0 2px 8px rgba(240,140,26,0.5),inset 0 0 0 1px rgba(255,255,255,0.55);',
            'margin-right:6px;font-size:0.92rem;vertical-align:-6px;animation:bdCakeGlow 2.4s ease-in-out infinite;}',
            '@keyframes bdCakeGlow{0%,100%{box-shadow:0 2px 8px rgba(240,140,26,0.5),inset 0 0 0 1px rgba(255,255,255,0.55);}',
            '50%{box-shadow:0 2px 15px rgba(240,140,26,0.9),inset 0 0 0 1px rgba(255,255,255,0.8);}}'
        ].join('\n');
        document.head.appendChild(css);
    })();

    function _renderBirthdayRow() {
        var container = document.getElementById('dashboard-birthday-container');
        var slider    = document.getElementById('dashboard-birthday-slider');
        if (!container || !slider) return;
        if (!_bdRow.users.length) {
            container.style.display = 'none';
            slider.innerHTML = '';
            return;
        }
        slider.innerHTML = _bdRow.users.map(function (u) {
            var name = _bdEsc(u.fullName || u.username || 'Friend');
            var avatar = _bdEsc(u.avatar || '');
            return '<div class="emp-bday-chip" data-bday-user-id="' + _bdEsc(u.id) + '" ' +
                'data-bday-user-name="' + name + '" data-bday-user-avatar="' + avatar + '">' +
                '<div class="emp-bday-chip-ring"><img src="' + avatar + '" alt="' + name + '" onerror="this.style.visibility=\'hidden\'"><span class="emp-bday-chip-cake">🎂</span></div>' +
                '<div class="emp-bday-chip-name">' + name.split(' ')[0] + '</div>' +
                '</div>';
        }).join('');
        container.style.display = '';
    }

    function _attachBirthdayRowListener() {
        var today = _bdTodayMonthDay();
        if (_bdRow.day === today && _bdRow.unsub) return; // already watching the right day
        if (_bdRow.unsub) { try { _bdRow.unsub(); } catch (e) {} _bdRow.unsub = null; }
        _bdRow.day = today;
        _bdRow.users = [];
        _renderBirthdayRow();

        if (!window.fbDb || !window._firebaseLoaded) return; // will retry via the interval/firebase-ready hook below

        try {
            _bdRow.unsub = window.fbDb.collection('users')
                .where('dobMonthDay', '==', today)
                .onSnapshot(function (snap) {
                    // Re-check the day on every tick too — guards the one edge
                    // case where a snapshot for the OLD listener resolves right
                    // as midnight rolls over and a new one is being attached.
                    if (_bdRow.day !== _bdTodayMonthDay()) return;
                    _bdRow.users = [];
                    snap.forEach(function (doc) {
                        var d = doc.data() || {};
                        _bdRow.users.push({ id: doc.id, fullName: d.fullName, username: d.username, avatar: d.avatar });
                    });
                    _renderBirthdayRow();
                }, function (err) {
                    console.warn('[Birthday] dashboard row listener error:', err && err.message);
                });
        } catch (e) {
            console.warn('[Birthday] could not attach dashboard row listener:', e && e.message);
        }
    }

    function _armBirthdayRow() {
        _attachBirthdayRowListener();
        // Catches (a) firebase not ready yet the first time this fired, and
        // (b) the calendar date rolling over while the tab stays open — see
        // this section's own header note. Checked every 5 minutes; cheap,
        // and Firestore's own listener does the real-time heavy lifting the
        // rest of the time.
        if (!window._empBirthdayRowInterval) {
            window._empBirthdayRowInterval = setInterval(_attachBirthdayRowListener, 5 * 60 * 1000);
        }
    }

    document.addEventListener('empyrean-init-done', function () { setTimeout(_armBirthdayRow, 400); });
    window.addEventListener('empyrean:firebase-ready', function () { setTimeout(_armBirthdayRow, 50); });
    setTimeout(_armBirthdayRow, 1500); // covers a returning session where firebase is already live by load

    /* ── Birthday Wishes feed modal ───────────────────────────────── */
    function _ensureBirthdayWishesModal() {
        if (document.getElementById('birthday-wishes-modal')) return;

        var css = document.createElement('style');
        css.id = '_bd_wishes_css';
        css.textContent = [
            /* ═══════════════════════════════════════════════════════════
               REDESIGN (2026-08-24 — "premium, sleek, elegant birthday
               card"): full visual pass on the modal, layout unchanged in
               spirit (header → banner → feed → composer) but every piece
               restyled — deep navy/gold "VIP card" palette instead of
               plain white, a single-line name, a taller square avatar,
               a new horizontal "recent pictures" strip, and a
               swipe-to-dismiss/auto-fading banner. See each rule's own
               comment below for what changed and why.
               ═══════════════════════════════════════════════════════════ */
            '#birthday-wishes-modal .bw-card{background:linear-gradient(180deg,#fff,#fbfaf5 60%);border-radius:24px;max-width:430px;width:92vw;',
            'max-height:86vh;display:flex;flex-direction:column;overflow:hidden;position:relative;',
            'box-shadow:0 24px 60px rgba(10,14,39,0.35),0 0 0 1px rgba(245,197,24,0.25);}',
            /* Header — deep navy-to-indigo gradient (the "VIP card" look),
               replacing the old plain-white header so the whole top reads
               as one premium unit rather than a plain form bar. */
            /* FIX ("gift/design-card buttons hidden/cut off"): .bw-card is a
               flex column capped at max-height:86vh with overflow:hidden.
               Without flex-shrink:0 here, the header — avatar, recent-photos
               strip, AND the action-buttons row all together — was one of
               several flex children competing to shrink whenever the modal's
               total content (header + banner + feed + input) exceeded 86vh.
               Flexbox shrinks from the bottom of this block's own overflow,
               which is exactly the action-buttons row, cutting off part of
               "Design Card"/"Gift" behind the message list underneath. Pinning
               the header (and banner/input/composer below, same fix) means
               only .bw-list — which already has overflow-y:auto and is
               DESIGNED to scroll — ever shrinks now, so the header and its
               buttons are always shown in full. */
            '#birthday-wishes-modal .bw-head{padding:20px 44px 16px 18px;background:linear-gradient(135deg,#0A0E27,#1B2B8B 65%,#3B2E8B);position:relative;overflow:hidden;flex-shrink:0;}',
            /* Subtle gold sheen in the corner — the one decorative touch,
               purely cosmetic (a radial glow), never intercepts clicks. */
            '#birthday-wishes-modal .bw-head::before{content:"";position:absolute;top:-40%;right:-20%;width:70%;height:180%;',
            'background:radial-gradient(circle,rgba(245,197,24,0.22),transparent 70%);pointer-events:none;}',
            '#birthday-wishes-modal .bw-head-top{display:flex;align-items:flex-start;gap:12px;position:relative;z-index:1;}',
            /* FEATURE: square (not round) avatar frame, sized up per this
               request ("a little bit larger square box") — a gold-ringed
               squircle instead of the old 48px circle, so it reads as a
               framed portrait rather than a small chat avatar. */
            '#birthday-wishes-modal .bw-head-avatar-ring{width:64px;height:64px;border-radius:16px;padding:3px;flex-shrink:0;',
            'background:linear-gradient(135deg,#F5C518,#F08C1A,#EF4444);box-shadow:0 4px 14px rgba(0,0,0,0.35);}',
            '#birthday-wishes-modal .bw-head-avatar-ring img{width:100%;height:100%;border-radius:13px;object-fit:cover;display:block;',
            'border:2px solid #0A0E27;background:#e2e6f5;}',
            '#birthday-wishes-modal .bw-head-textcol{flex:1;min-width:0;}',
            /* FIX ("name should be on one line at the top"): single line,
               ellipsis instead of wrap — the old title had no white-space
               control at all, so a two-word name like "Allen Akhigbe's"
               wrapped across three lines (see the screenshot this was
               reported from). font-size still scales down slightly via
               clamp() on very narrow screens rather than wrapping. */
            '#birthday-wishes-modal .bw-head-title{font-weight:800;color:#fff;font-size:clamp(1rem,4.6vw,1.15rem);',
            'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0.01em;}',
            '#birthday-wishes-modal .bw-head-sub{font-size:0.78rem;color:rgba(255,255,255,0.75);margin-top:2px;font-weight:600;}',
            '#birthday-wishes-modal .bw-close{position:absolute;top:14px;right:14px;font-size:1.15rem;background:rgba(255,255,255,0.12);',
            'border:none;cursor:pointer;color:#fff;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:2;',
            'transition:background .15s;}',
            '#birthday-wishes-modal .bw-close:active{background:rgba(255,255,255,0.28);}',
            /* FEATURE: "recent pictures, slidable horizontally" — a new
               strip of square thumbnails, populated in
               openBirthdayWishesFeed() from the celebrant's most recent
               posts with photos (falls back to avatar/cover if they have
               none). Sized up from the old single 34px square per this
               request, snap-scrolls like the dashboard's own horizontal
               rows elsewhere in this app. */
            '#birthday-wishes-modal .bw-recent-strip{display:flex;gap:8px;overflow-x:auto;padding:14px 18px 4px;',
            'scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none;position:relative;z-index:1;}',
            '#birthday-wishes-modal .bw-recent-strip::-webkit-scrollbar{display:none;}',
            '#birthday-wishes-modal .bw-recent-strip img{width:66px;height:66px;border-radius:12px;object-fit:cover;flex-shrink:0;',
            'scroll-snap-align:start;border:1.5px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);}',
            '#birthday-wishes-modal .bw-recent-strip.bw-empty-strip{display:none;}',
            '#birthday-wishes-modal .bw-actions-row{display:flex;gap:10px;padding:14px 18px 18px;position:relative;z-index:1;}',
            '#birthday-wishes-modal .bw-gift-btn{flex:1;border:none;border-radius:22px;padding:10px 14px;font-size:0.82rem;font-weight:800;',
            'background:linear-gradient(135deg,#F5C518,#F08C1A);color:#1B2B8B;cursor:pointer;white-space:nowrap;',
            'display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 4px 12px rgba(240,140,26,0.35);}',
            /* Card-composer entry point — restyled to match the new
               header (translucent glass pill on the navy background)
               instead of the old small solid-purple circle. The FA icon
               is gone (see markup note below — "fix the broken icon"). */
            '#birthday-wishes-modal .bw-card-btn{border:1px solid rgba(255,255,255,0.3);border-radius:22px;padding:10px 16px;',
            'font-size:0.82rem;font-weight:800;background:rgba(255,255,255,0.10);color:#fff;cursor:pointer;white-space:nowrap;',
            'display:flex;align-items:center;justify-content:center;gap:6px;backdrop-filter:blur(6px);}',
            '#birthday-wishes-modal .bw-card-btn:active,#birthday-wishes-modal .bw-gift-btn:active{transform:scale(0.97);}',
            /* Festive banner — now a dismissable "ribbon": swipe
               horizontally or wait ~7s and it slides up + fades out on
               its own (see _armBirthdayBanner() below). translateX during
               a drag is applied inline by the swipe handler; the
               `.bw-banner-leaving` class drives the auto/committed exit
               animation via @keyframes bwBannerExit. */
            '#birthday-wishes-modal .bw-banner-wrap{overflow:hidden;flex-shrink:0;}',
            '#birthday-wishes-modal .bw-banner{margin:12px 16px;padding:12px 16px;border-radius:14px;font-size:0.82rem;line-height:1.45;font-weight:600;',
            'color:#7a5a0a;background:linear-gradient(135deg,rgba(245,197,24,0.18),rgba(240,140,26,0.10));border:1px solid rgba(245,197,24,0.4);',
            'position:relative;cursor:grab;touch-action:pan-y;transition:transform .25s ease;}',
            '#birthday-wishes-modal .bw-banner-leaving{animation:bwBannerExit .45s ease forwards;}',
            '@keyframes bwBannerExit{to{transform:translateY(-14px) scale(0.96);opacity:0;max-height:0;margin-top:0;margin-bottom:0;padding-top:0;padding-bottom:0;}}',
            '#birthday-wishes-modal .bw-banner-dot{position:absolute;bottom:6px;right:10px;display:flex;gap:4px;}',
            '#birthday-wishes-modal .bw-banner-dot span{width:4px;height:4px;border-radius:50%;background:rgba(122,90,10,0.35);}',
            '#birthday-wishes-modal .bw-list{flex:1;overflow-y:auto;padding:4px 16px 12px;display:flex;flex-direction:column;gap:12px;min-height:120px;}',
            '#birthday-wishes-modal .bw-item{display:flex;gap:10px;}',
            '#birthday-wishes-modal .bw-item img{width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#e2e6f5;}',
            '#birthday-wishes-modal .bw-bubble{background:#f4f6fb;border-radius:14px;padding:8px 12px;font-size:0.85rem;flex:1;}',
            '#birthday-wishes-modal .bw-bubble strong{color:#1B2B8B;font-size:0.82rem;}',
            '#birthday-wishes-modal .bw-time{font-size:0.68rem;color:#99a;margin-top:2px;}',
            '#birthday-wishes-modal .bw-gift-line{color:#8a6d1a;font-weight:700;}',
            /* Personalized/custom card entries in the feed — a small colored
               card rendered inline in the thread, distinct from a plain-text
               wish or a gift line. */
            '#birthday-wishes-modal .bw-card-mini{position:relative;border-radius:12px;padding:14px 12px;color:#fff;font-weight:700;font-size:0.85rem;',
            'text-align:center;box-shadow:0 3px 10px rgba(0,0,0,0.14);overflow:hidden;}',
            /* Template-based mini cards (new) get a touch more breathing
               room + the serif greeting-card font so they read the same as
               the composer preview, just smaller — plain-bg legacy cards
               (cardBg only, no cardTemplate) keep the original compact look
               above untouched. */
            '#birthday-wishes-modal .bw-card-mini-tpl{padding:20px 12px;font-family:Georgia,"Times New Roman",serif;font-size:0.88rem;',
            'box-shadow:0 6px 16px rgba(10,14,39,0.22),0 0 0 1px rgba(245,197,24,0.25);}',
            '#birthday-wishes-modal .bw-empty{text-align:center;color:#99a;font-size:0.85rem;padding:24px 12px;}',
            '#birthday-wishes-modal .bw-input-row{display:flex;gap:8px;padding:12px 14px;border-top:1px solid rgba(10,14,39,0.08);flex-shrink:0;}',
            '#birthday-wishes-modal .bw-input-row input{flex:1;border:1px solid rgba(10,14,39,0.15);border-radius:20px;padding:10px 14px;font-size:0.85rem;}',
            '#birthday-wishes-modal .bw-send-btn{border:none;border-radius:50%;width:40px;height:40px;flex-shrink:0;background:#1B2B8B;color:#fff;cursor:pointer;font-size:0.95rem;}',
            '#birthday-wishes-modal .bw-send-btn:disabled{opacity:0.5;cursor:not-allowed;}',
            /* Custom-card composer panel — a small inline view swapped in
               below the feed (feed stays visible above it), matching this
               file's existing convention of hide/show panels rather than a
               second modal-on-top-of-a-modal. */
            /* FIX ("no send button / send is hidden" — a direct consequence
               of the earlier flex-shrink:0 fix on THIS element specifically):
               giving .bw-composer flex-shrink:0 kept it from being crushed,
               but .bw-list stays in the DOM (still visible) behind the
               composer too — nothing hid it when the composer opened — so
               the combined height of head + banner + list(at its 120px
               floor) + this composer's own full natural height could still
               exceed .bw-card's 86vh cap. Since flex-shrink:0 means this
               element refuses to shrink, THAT overflow had nowhere to go but
               clipped by .bw-card's own overflow:hidden — landing squarely
               on whatever is visually last inside the composer, i.e. the
               Cancel/Send Card row. Fix: same pattern .bw-list itself
               already uses successfully — flex:1 + min-height:0 +
               overflow-y:auto, so THIS element (not the outer card) is what
               scrolls, and it can never be clipped by an ancestor's
               overflow:hidden again. Paired with hiding .bw-list/.bw-banner-
               wrap for the composer's own duration (see
               _openBirthdayCardComposer below) so it actually gets the
               room, and the actions row is pinned sticky at the bottom (see
               .bw-composer-actions below) so Send never requires scrolling
               to find in the first place. */
            '#birthday-wishes-modal .bw-composer{padding:12px 16px 16px;border-top:1px solid rgba(10,14,39,0.08);background:#fafbff;flex:1;min-height:0;overflow-y:auto;}',
            '#birthday-wishes-modal .bw-composer-title{font-weight:800;color:#1B2B8B;font-size:0.85rem;margin-bottom:10px;}',
            /* ═══════════════════════════════════════════════════════════
               UPGRADE (real illustrated card library, replacing the old
               5-color swatch row): each entry in BW_CARD_TEMPLATES below is
               a fully "designed" card — its own background, a scattered set
               of decorative glyphs (balloons/confetti/flowers/stars/ribbons/
               etc., all emoji + CSS so nothing depends on an external image
               host ever being reachable, same reasoning this file already
               used to drop the ui-avatars.com dependency elsewhere), and a
               gold foil border so it reads as an actual printed greeting
               card, not a flat color chip. The gallery below shows every
               template as a small live thumbnail (built by the same
               _cardTemplateDecorHTML() the big preview uses, just scaled
               down) so people are picking a real design, not guessing what
               a color swatch will look like once text is on it. */
            '#birthday-wishes-modal .bw-card-gallery-label{font-size:0.72rem;font-weight:800;color:#7a5a0a;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;}',
            '#birthday-wishes-modal .bw-card-gallery{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 10px;-webkit-overflow-scrolling:touch;',
            'scroll-snap-type:x proximity;scrollbar-width:thin;}',
            '#birthday-wishes-modal .bw-card-thumb{position:relative;flex-shrink:0;width:78px;height:104px;border-radius:12px;cursor:pointer;',
            'overflow:hidden;box-sizing:border-box;border:2.5px solid transparent;scroll-snap-align:start;',
            'box-shadow:0 3px 8px rgba(10,14,39,0.18);transition:transform .15s,border-color .15s;}',
            '#birthday-wishes-modal .bw-card-thumb:active{transform:scale(0.94);}',
            '#birthday-wishes-modal .bw-card-thumb.selected{border-color:#F5C518;box-shadow:0 0 0 2px rgba(245,197,24,0.35),0 4px 12px rgba(10,14,39,0.3);',
            'transform:translateY(-2px);}',
            '#birthday-wishes-modal .bw-card-thumb-name{position:absolute;left:0;right:0;bottom:0;padding:3px 4px;font-size:0.55rem;font-weight:800;',
            'text-align:center;color:#fff;background:rgba(0,0,0,0.38);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:2;}',
            /* The decorative glyphs — shared markup between the small
               gallery thumbnail and the big live preview, just scaled by a
               CSS custom property so one template definition renders both
               without two separate layouts to keep in sync. */
            '#birthday-wishes-modal .bw-card-decor{position:absolute;pointer-events:none;line-height:1;',
            'font-size:calc(var(--bwcd-scale, 1) * 1em);left:var(--bwcd-l);top:var(--bwcd-t);',
            'transform:translate(-50%,-50%) rotate(var(--bwcd-r,0deg));filter:drop-shadow(0 2px 3px rgba(0,0,0,0.25));}',
            '#birthday-wishes-modal .bw-card-foil{position:absolute;inset:0;border-radius:inherit;pointer-events:none;',
            'box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.35);}',
            '#birthday-wishes-modal .bw-card-preview{position:relative;border-radius:16px;padding:22px 16px;text-align:center;font-weight:700;',
            'font-family:Georgia,"Times New Roman",serif;font-size:1rem;min-height:130px;display:flex;align-items:center;justify-content:center;',
            'margin-bottom:10px;overflow:hidden;box-shadow:0 10px 26px rgba(10,14,39,0.28),0 0 0 1px rgba(245,197,24,0.3);}',
            '#birthday-wishes-modal .bw-card-preview-msg{position:relative;z-index:2;word-break:break-word;padding:0 6px;text-shadow:0 1px 3px rgba(0,0,0,0.25);}',
            '#birthday-wishes-modal textarea#bw-card-text{width:100%;box-sizing:border-box;border:1px solid rgba(10,14,39,0.15);border-radius:12px;',
            'padding:10px 12px;font-size:0.85rem;resize:none;min-height:44px;margin-bottom:10px;font-family:inherit;}',
            /* FIX ("no send button"): pinned to the bottom of the now-
               scrollable .bw-composer (see that rule's own comment above)
               with its own opaque background, so Cancel/Send Card stay on
               screen the whole time the composer is open, however tall the
               gallery/preview/textarea above them get — never something the
               person has to scroll down to discover. */
            '#birthday-wishes-modal .bw-composer-actions{display:flex;gap:10px;position:sticky;bottom:0;',
            'margin-top:10px;padding-top:10px;padding-bottom:2px;background:#fafbff;}',
            '#birthday-wishes-modal .bw-composer-actions .bw-secondary-btn{flex:1;padding:10px;border:1px solid rgba(10,14,39,0.15);border-radius:20px;',
            'background:#fff;color:#334;font-weight:700;font-size:0.82rem;cursor:pointer;}',
            '#birthday-wishes-modal .bw-composer-actions .bw-send-btn-wide{flex:2;padding:10px;border:none;border-radius:20px;',
            'background:linear-gradient(135deg,#1B2B8B,#3B5BDB);color:#fff;font-weight:700;font-size:0.82rem;cursor:pointer;}',
            /* ═══════════════════════════════════════════════════════════
               FEATURE (2026-08-25 — "click the picture should expand for a
               better view, swipeable horizontally, then a button to
               navigate back"): a lightbox for the "recent pictures" strip.
               A separate fixed overlay ABOVE #birthday-wishes-modal (which
               stays mounted underneath, untouched — this never rebuilds or
               closes the wishes feed, only covers it) rather than a second
               modal-on-modal, so there's exactly one extra layer to reason
               about. "Swipeable horizontally" is native horizontal scroll
               + scroll-snap on .bw-lb-track (same snap mechanism
               .bw-recent-strip already uses) — no custom touch/drag JS
               needed.

               REDESIGN (2026-08-25 — "covers the full screen, make a
               premium classic elegant frame with the same picture size,
               fix the exit button"): was a plain edge-to-edge black
               fullscreen block. Now a dimmed backdrop behind a centered,
               gold-gilded "picture frame" card (same navy/gold VIP palette
               as .bw-card/.bw-head elsewhere in this modal) sized to the
               picture rather than the viewport — object-fit:contain keeps
               every photo at its own true aspect ratio (never stretched or
               cropped to fill the screen), and tapping the dimmed backdrop
               outside the frame closes it too, same as any standard
               lightbox. The back button lives in the frame's own header
               bar instead of floating loose over the image.

               FIX ("back navigation is not working"): the back button's
               data-bw-action was never firing — the shared click-delegation
               handler below only matched `#birthday-wishes-modal
               [data-bw-action]`, and #bw-lightbox is a SIBLING of that
               modal (both direct children of <body>), not a descendant of
               it, so the selector could never match anything inside the
               lightbox. Fixed at the delegation handler itself (see the
               `bwAction` selector further down this file) to also match
               `#bw-lightbox [data-bw-action]`.

               REDESIGN #2 (2026-08-25 — "still covers too much of the
               screen, reduce it; give the expansion a birthday card feel"):
               shrunk the frame from ~92vw/86vh down to a genuinely
               card-sized ~76vw/62vh (image capped at 42vh, down from
               70vh) so it reads as a picture popping up over the feed, not
               a takeover. Added actual party dressing on top of the same
               gold frame rather than a new component: two balloon emoji
               anchored to the frame's top corners (poking outside it, like
               they're tied to the frame), a shimmering gold "🎉 Happy
               Birthday 🎉" ribbon between the header and the picture, and a
               small glowing cake medallion overlapping the frame's bottom
               edge — the same gold-glow badge treatment as the dashboard
               row's cake badges (.emp-bday-chip-cake / .bd-header-cake-
               badge), so this reads as the same "premium birthday" family,
               not a separate style. All three are decorative-only
               (pointer-events:none / not part of any click target), so
               none of them can intercept a tap meant for the picture, the
               back button, or the backdrop-dismiss. ═══════════════════ */
            '#bw-lightbox{position:fixed;inset:0;z-index:100000;background:rgba(6,9,26,0.92);backdrop-filter:blur(3px);',
            'display:none;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;}',
            '#bw-lightbox.bw-lightbox-open{display:flex;}',
            /* Gilded outer edge — the "frame" itself, a slim gold-gradient
               border wrapping a dark inner mat, so the picture reads as
               displayed in a frame rather than floating loose on black.
               Card-sized, not viewport-sized — see REDESIGN #2 above. */
            '#bw-lightbox .bw-lb-frame{position:relative;width:min(76vw,340px);max-height:62vh;border-radius:22px;padding:7px;',
            'background:linear-gradient(135deg,#F5C518,#F08C1A 55%,#C9A66B);box-shadow:0 22px 60px rgba(0,0,0,0.55),0 0 0 1px rgba(245,197,24,0.35);',
            'display:flex;flex-direction:column;}',
            '#bw-lightbox .bw-lb-inner{background:#0A0E27;border-radius:17px;overflow:hidden;display:flex;flex-direction:column;min-height:0;}',
            '#bw-lightbox .bw-lb-top{display:flex;align-items:center;justify-content:space-between;padding:11px 12px;',
            'background:linear-gradient(135deg,#0A0E27,#1B2B8B 65%,#3B2E8B);flex-shrink:0;}',
            '#bw-lightbox .bw-lb-back{border:none;background:rgba(255,255,255,0.14);color:#fff;width:34px;height:34px;border-radius:50%;',
            'display:flex;align-items:center;justify-content:center;font-size:1.05rem;cursor:pointer;flex-shrink:0;}',
            '#bw-lightbox .bw-lb-back:active{background:rgba(255,255,255,0.3);transform:scale(0.92);}',
            '#bw-lightbox .bw-lb-counter{color:#fff;font-size:0.76rem;font-weight:800;background:rgba(255,255,255,0.12);padding:5px 13px;',
            'border-radius:20px;letter-spacing:0.02em;}',
            /* Shimmering gold ribbon — the "birthday card" banner, sitting
               between the header bar and the picture itself. */
            '#bw-lightbox .bw-lb-ribbon{background:linear-gradient(90deg,#F5C518,#F08C1A,#EF4444,#F08C1A,#F5C518);background-size:250% 100%;',
            'color:#3a1e00;font-weight:800;font-size:0.68rem;letter-spacing:0.03em;text-align:center;padding:5px 8px;flex-shrink:0;',
            'animation:bdLbRibbonShine 3.2s linear infinite;}',
            '@keyframes bdLbRibbonShine{0%{background-position:0% 0;}100%{background-position:250% 0;}}',
            /* Balloons tied to the frame's top corners — decorative only,
               pointer-events:none so they can never eat a tap meant for
               the picture/back button/backdrop underneath them. */
            '#bw-lightbox .bw-lb-balloon{position:absolute;font-size:1.6rem;pointer-events:none;',
            'filter:drop-shadow(0 4px 6px rgba(0,0,0,0.35));z-index:1;}',
            '#bw-lightbox .bw-lb-balloon-l{top:-16px;left:8px;transform:rotate(-12deg);}',
            '#bw-lightbox .bw-lb-balloon-r{top:-14px;right:6px;transform:rotate(10deg);}',
            /* Glowing cake medallion overlapping the frame's bottom edge —
               same gold-glow badge language as the dashboard's cake
               badges, so this whole feature reads as one family. */
            '#bw-lightbox .bw-lb-seal{position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);width:30px;height:30px;border-radius:50%;',
            'background:radial-gradient(circle at 35% 30%,#FFE9A8,#F5C518 55%,#F08C1A 100%);display:flex;align-items:center;justify-content:center;',
            'font-size:1rem;box-shadow:0 3px 10px rgba(240,140,26,0.55),inset 0 0 0 2px #fff;pointer-events:none;z-index:1;',
            'animation:bdLbSealGlow 2.4s ease-in-out infinite;}',
            '@keyframes bdLbSealGlow{0%,100%{box-shadow:0 3px 10px rgba(240,140,26,0.55),inset 0 0 0 2px #fff;}',
            '50%{box-shadow:0 3px 16px rgba(240,140,26,0.9),inset 0 0 0 2px #fff;}}',
            /* Picture area — sized to the picture, not the viewport.
               object-fit:contain preserves each photo's own aspect ratio
               ("the same picture size", never stretched/cropped/zoomed to
               fill the frame). max-height caps it (shrunk in REDESIGN #2)
               so the whole card — ribbon, picture, header — fits well
               inside the smaller frame. */
            '#bw-lightbox .bw-lb-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;',
            'min-height:0;}',
            '#bw-lightbox .bw-lb-track::-webkit-scrollbar{display:none;}',
            '#bw-lightbox .bw-lb-slide{flex:0 0 100%;scroll-snap-align:center;display:flex;align-items:center;justify-content:center;',
            'box-sizing:border-box;padding:8px;}',
            '#bw-lightbox .bw-lb-slide img{max-width:100%;max-height:42vh;object-fit:contain;display:block;border-radius:8px;}'
        ].join('\n');
        document.head.appendChild(css);

        var wrap = document.createElement('div');
        wrap.id = 'birthday-wishes-modal';
        wrap.className = 'modal-overlay-container';
        wrap.innerHTML =
            '<div class="bw-card">' +
                '<div class="bw-head">' +
                    '<button type="button" class="bw-close" data-bw-action="close" aria-label="Close">&times;</button>' +
                    '<div class="bw-head-top">' +
                        '<div class="bw-head-avatar-ring"><img id="bw-head-avatar" src="" alt=""></div>' +
                        '<div class="bw-head-textcol">' +
                            '<div class="bw-head-title" id="bw-head-title">Birthday</div>' +
                            '<div class="bw-head-sub">🎂 Birthday wishes</div>' +
                        '</div>' +
                    '</div>' +
                    /* "Recent pictures" — slidable horizontal strip,
                       populated per-recipient in openBirthdayWishesFeed(). */
                    '<div class="bw-recent-strip" id="bw-recent-strip"></div>' +
                    '<div class="bw-actions-row">' +
                        /* FIX ("broken icon"): the palette glyph was a
                           Font-Awesome <i> icon, which renders as a blank/
                           broken box for a moment (or entirely, on a poor
                           connection — see this session's own bottom-nav
                           fallback fix) until the webfont finishes
                           downloading. Replaced with a plain emoji glyph,
                           which is part of the text itself and can never
                           fail to load — same reasoning app-fix-final.js's
                           bottom-nav rebuild already uses inline SVG for
                           ("never depends on Font Awesome loading"). */
                        '<button type="button" class="bw-card-btn" id="bw-card-btn" data-bw-action="open-card" title="Design a birthday card">🎨 Design Card</button>' +
                        '<button type="button" class="bw-gift-btn" id="bw-gift-btn">🎁 Gift</button>' +
                    '</div>' +
                '</div>' +
                '<div class="bw-banner-wrap"><div class="bw-banner" id="bw-banner"></div></div>' +
                '<div class="bw-list" id="bw-list"></div>' +
                '<div class="bw-input-row" id="bw-input-row">' +
                    '<input type="text" id="bw-input" maxlength="200" placeholder="Write a birthday wish…">' +
                    '<button type="button" class="bw-send-btn" id="bw-send-btn" data-bw-action="send"><i class="fas fa-paper-plane"></i></button>' +
                '</div>' +
                /* Custom card composer — hidden until "Design a birthday
                   card" is tapped; see §Section 12's card-composer wiring
                   below (_openBirthdayCardComposer / _sendBirthdayCard). */
                '<div class="bw-composer" id="bw-composer" style="display:none;">' +
                    '<div class="bw-composer-title">🎨 Design a Birthday Card</div>' +
                    '<div class="bw-card-gallery-label">Choose a card design</div>' +
                    '<div class="bw-card-gallery" id="bw-card-gallery"></div>' +
                    '<div class="bw-card-preview" id="bw-card-preview"></div>' +
                    '<textarea id="bw-card-text" maxlength="140" placeholder="Write your personalized card message…"></textarea>' +
                    '<div class="bw-composer-actions">' +
                        '<button type="button" class="bw-secondary-btn" data-bw-action="close-card">Cancel</button>' +
                        '<button type="button" class="bw-send-btn-wide" data-bw-action="send-card"><i class="fas fa-paper-plane"></i> Send Card</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(wrap);

        /* Recent-pictures lightbox — see the "FEATURE"/"REDESIGN" comment
           on its CSS above. Built once alongside the wishes modal, reused
           for every open (populated fresh each time by
           _openBirthdayLightbox). Tapping the dimmed backdrop itself
           (outside the frame) also closes it — handled by an exact
           e.target === overlay check in the click delegation below, NOT
           via data-bw-action/closest(), since closest() would match the
           overlay as an ancestor of every click inside the frame too
           (image, back button, everything) and close on any tap at all. */
        var lb = document.createElement('div');
        lb.id = 'bw-lightbox';
        lb.innerHTML =
            '<div class="bw-lb-frame">' +
                '<span class="bw-lb-balloon bw-lb-balloon-l" aria-hidden="true">🎈</span>' +
                '<span class="bw-lb-balloon bw-lb-balloon-r" aria-hidden="true">🎈</span>' +
                '<div class="bw-lb-inner">' +
                    '<div class="bw-lb-top">' +
                        '<button type="button" class="bw-lb-back" data-bw-action="close-lightbox" aria-label="Back">&larr;</button>' +
                        '<span class="bw-lb-counter" id="bw-lb-counter"></span>' +
                    '</div>' +
                    '<div class="bw-lb-ribbon">🎉 Happy Birthday 🎉</div>' +
                    '<div class="bw-lb-track" id="bw-lb-track"></div>' +
                '</div>' +
                '<span class="bw-lb-seal" aria-hidden="true">🎂</span>' +
            '</div>';
        document.body.appendChild(lb);
    }

    function _renderBirthdayFeedItems(items) {
        var list = document.getElementById('bw-list');
        if (!list) return;
        if (!items.length) {
            list.innerHTML = '<div class="bw-empty">No wishes yet — be the first to say Happy Birthday! 🎉</div>';
            return;
        }
        // Sorted client-side (newest last, reads like a chat thread) rather
        // than via a Firestore orderBy — avoids requiring a new composite
        // index on birthday_feed (equality on birthdayUserId + orderBy a
        // different field) just for this one feed.
        list.innerHTML = items.map(function (it) {
            var name = _bdEsc(it.senderName || 'Someone');
            var avatar = _bdEsc(it.senderAvatar || '');
            var body = it.type === 'gift'
                ? '<span class="bw-gift-line">' + _bdEsc(it.giftSymbol || '🎁') + ' sent ' + _bdEsc(it.giftName || 'a gift') + '</span>' +
                  (it.message ? '<br>' + _bdEsc(it.message) : '')
                // FEATURE (customized birthday cards): a 'card' entry (see
                // _sendBirthdayCard() below) renders as its own small
                // illustrated card inline in the thread, instead of the
                // plain text bubble a free-text wish gets — so a
                // personalized card visually stands out the way it's meant
                // to. `cardTemplate` (new) renders the full design library
                // card (decorative glyphs + gold foil border, same markup
                // the composer's live preview uses); older cards sent
                // before this upgrade only have `cardBg` on file, so they
                // still fall back to a plain colored chip rather than
                // breaking or showing nothing.
                : it.type === 'card'
                ? (it.cardTemplate
                    ? '<div class="bw-card-mini bw-card-mini-tpl" style="background:' + _bdEsc(_findCardTemplate(it.cardTemplate).bg) + ';color:' + _bdEsc(_findCardTemplate(it.cardTemplate).color) + ';">' +
                        _cardTemplateDecorHTML(_findCardTemplate(it.cardTemplate), 0.6) +
                        '<span class="bw-card-preview-msg">' + _bdEsc(it.message || '') + '</span></div>'
                    : '<div class="bw-card-mini" style="background:' + _bdEsc(it.cardBg || 'linear-gradient(135deg,#1B2B8B,#5B0EA6)') + ';">🎉 ' + _bdEsc(it.message || '') + '</div>')
                : _bdEsc(it.message || '');
            return '<div class="bw-item"><img src="' + avatar + '" alt="' + name + '" onerror="this.style.visibility=\'hidden\'">' +
                '<div class="bw-bubble"><strong>' + name + '</strong><br>' + body +
                '<div class="bw-time">' + _bdEsc(_bdTimeAgo(it.createdAt)) + '</div></div></div>';
        }).join('');
        list.scrollTop = list.scrollHeight;
    }

    function _detachBirthdayFeedListener() {
        if (_bdFeed.unsub) { try { _bdFeed.unsub(); } catch (e) {} _bdFeed.unsub = null; }
        _bdFeed.userId = null;
    }

    // ─────────────────────────────────────────────────────────────
    // "Recent pictures, slidable horizontally" (requested addition):
    // pulls the celebrant's most recent photo posts and renders them as
    // a horizontal snap-scroll strip in the header. A SEPARATE, one-shot
    // .get() per open (not a live listener — this is a static "recent
    // photos" glance, not a feed that needs to update in real time while
    // the modal is open) using a single .where() with no chained
    // .orderBy() — same "avoid needing a composite Firestore index"
    // reasoning this section's own birthday_feed listener already uses
    // (see that query's own comment) — sorted client-side instead.
    // ─────────────────────────────────────────────────────────────
    var _bdRecentPicsToken = 0; // staleness guard — a fast second open shouldn't have an earlier fetch overwrite it

    // Holds the CURRENT strip's urls so the click handler (which only sees
    // the tapped <img>'s index) can hand the whole gallery + a start index
    // to _openBirthdayLightbox(). Reset on every render, same lifetime as
    // the strip itself.
    var _bdRecentPicUrls = [];

    function _renderBirthdayRecentPics(urls) {
        var strip = document.getElementById('bw-recent-strip');
        if (!strip) return;
        _bdRecentPicUrls = urls || [];
        if (!urls.length) { strip.classList.add('bw-empty-strip'); strip.innerHTML = ''; return; }
        strip.classList.remove('bw-empty-strip');
        // FEATURE ("click the picture should expand for a better view,
        // swipeable horizontally, then a button to navigate back"): each
        // thumbnail now carries its own index so a tap can open the full
        // gallery (_openBirthdayLightbox) starting on the exact picture
        // that was tapped, not just the first one.
        strip.innerHTML = urls.map(function (u, i) {
            return '<img src="' + _bdEsc(u) + '" alt="" loading="lazy" data-bd-pic-index="' + i + '" onerror="this.remove()">';
        }).join('');
    }

    /* ── Recent-pictures lightbox: tap → full view, swipe → next/prev,
       back button → return to the wishes feed underneath (never closed). */
    function _openBirthdayLightbox(urls, startIndex) {
        var lb = document.getElementById('bw-lightbox');
        var track = document.getElementById('bw-lb-track');
        var counter = document.getElementById('bw-lb-counter');
        if (!lb || !track || !urls || !urls.length) return;
        startIndex = Math.max(0, Math.min(urls.length - 1, startIndex || 0));

        track.innerHTML = urls.map(function (u) {
            return '<div class="bw-lb-slide"><img src="' + _bdEsc(u) + '" alt=""></div>';
        }).join('');
        if (counter) counter.textContent = (startIndex + 1) + ' / ' + urls.length;
        lb.classList.add('bw-lightbox-open');

        // Jump to the tapped picture instantly (no scroll animation) — the
        // slides don't have real width until the innerHTML write above has
        // been laid out, so this waits one frame rather than racing it.
        requestAnimationFrame(function () {
            track.scrollLeft = startIndex * track.clientWidth;
        });

        // Keep the counter in sync while swiping — one shared handler,
        // rewired per open rather than stacked, since track is reused.
        if (track._bdScrollHandler) track.removeEventListener('scroll', track._bdScrollHandler);
        track._bdScrollHandler = function () {
            if (!track.clientWidth) return;
            var idx = Math.round(track.scrollLeft / track.clientWidth);
            idx = Math.max(0, Math.min(urls.length - 1, idx));
            if (counter) counter.textContent = (idx + 1) + ' / ' + urls.length;
        };
        track.addEventListener('scroll', track._bdScrollHandler, { passive: true });
    }

    function _closeBirthdayLightbox() {
        var lb = document.getElementById('bw-lightbox');
        if (lb) lb.classList.remove('bw-lightbox-open');
    }

    function _loadBirthdayRecentPics(userId, fallbackAvatar) {
        var myToken = ++_bdRecentPicsToken;
        var strip = document.getElementById('bw-recent-strip');
        if (strip) { strip.classList.add('bw-empty-strip'); strip.innerHTML = ''; } // clear the PREVIOUS person's photos immediately

        var mu = window.mockUsers || {};
        var fullUser = mu[userId] || {};
        var fallbacks = [fullUser.coverPhoto, fallbackAvatar].filter(Boolean);

        if (!window.fbDb || !window._firebaseLoaded) { _renderBirthdayRecentPics(fallbacks); return; }

        window.fbDb.collection('posts').where('userId', '==', userId).limit(20).get()
            .then(function (snap) {
                if (myToken !== _bdRecentPicsToken) return; // superseded by a later open
                var posts = [];
                snap.forEach(function (doc) { posts.push(doc.data() || {}); });
                posts.sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
                var VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|$)/i;
                var urls = [];
                posts.forEach(function (p) {
                    (p.media || []).forEach(function (u) {
                        if (u && !VIDEO_EXT.test(u) && urls.length < 8) urls.push(u);
                    });
                });
                _renderBirthdayRecentPics(urls.length ? urls : fallbacks);
            })
            .catch(function (err) {
                console.warn('[Birthday] recent-pics fetch failed:', err && err.message);
                if (myToken === _bdRecentPicsToken) _renderBirthdayRecentPics(fallbacks);
            });
    }

    // ─────────────────────────────────────────────────────────────
    // Banner — "scrollable/slidable then disappear with animation"
    // (requested change): the festive intro banner can now be swiped
    // away (left or right, either direction dismisses — this is a single
    // one-off message, not a multi-page carousel, so direction doesn't
    // carry separate meaning) or it fades/slides itself out on its own
    // after a few seconds so it never permanently occupies space once
    // its one job (announcing the birthday) is done.
    // ─────────────────────────────────────────────────────────────
    var _bdBannerTimer = null;
    var _bdBannerDrag = null; // {startX, active}

    function _dismissBirthdayBanner(bannerEl) {
        if (!bannerEl || bannerEl.classList.contains('bw-banner-leaving')) return;
        bannerEl.style.transform = ''; // clear any in-progress drag offset before the exit keyframe takes over
        bannerEl.classList.add('bw-banner-leaving');
    }

    function _armBirthdayBanner() {
        var bannerEl = document.getElementById('bw-banner');
        if (!bannerEl) return;
        clearTimeout(_bdBannerTimer);
        bannerEl.classList.remove('bw-banner-leaving');
        bannerEl.style.transform = '';

        // Auto-dismiss after a few seconds of dwell time — long enough to
        // read, short enough that it doesn't sit there forever eating
        // space above the wishes feed.
        _bdBannerTimer = setTimeout(function () { _dismissBirthdayBanner(bannerEl); }, 7000);

        // Swipe-to-dismiss, wired once (idempotent via _bdSwipeWired) —
        // touch-only (mouse users have the auto-dismiss timer and can
        // simply scroll past it; this file's other swipe-ish surfaces in
        // this app are touch-first too).
        if (bannerEl._bdSwipeWired) return;
        bannerEl._bdSwipeWired = true;
        bannerEl.addEventListener('touchstart', function (e) {
            _bdBannerDrag = { startX: e.touches[0].clientX, active: true };
            clearTimeout(_bdBannerTimer); // a person actively touching it shouldn't have it vanish mid-swipe
        }, { passive: true });
        bannerEl.addEventListener('touchmove', function (e) {
            if (!_bdBannerDrag || !_bdBannerDrag.active) return;
            var dx = e.touches[0].clientX - _bdBannerDrag.startX;
            bannerEl.style.transform = 'translateX(' + dx + 'px)';
            bannerEl.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / 160));
        }, { passive: true });
        bannerEl.addEventListener('touchend', function (e) {
            if (!_bdBannerDrag) return;
            var dx = (e.changedTouches[0].clientX - _bdBannerDrag.startX);
            _bdBannerDrag = null;
            if (Math.abs(dx) > 60) {
                _dismissBirthdayBanner(bannerEl);
            } else {
                bannerEl.style.transform = '';
                bannerEl.style.opacity = '';
                // Swipe was too short to count as a dismiss — resume the
                // auto-dismiss countdown from a fresh window rather than
                // leaving it disarmed.
                clearTimeout(_bdBannerTimer);
                _bdBannerTimer = setTimeout(function () { _dismissBirthdayBanner(bannerEl); }, 7000);
            }
        }, { passive: true });
    }

    window.openBirthdayWishesFeed = function (userId, userName, userAvatar) {
        if (!userId) return;
        _ensureBirthdayWishesModal();
        _detachBirthdayFeedListener();

        var name = userName || 'Friend';
        // FIX ("name should be at the top, on one line"): the header CSS
        // (.bw-head-title) now enforces white-space:nowrap + ellipsis, so
        // this can stay a normal textContent assignment — the overflow
        // handling lives entirely in CSS rather than truncating the
        // string here, so a tooltip/copy of the full name is never lost.
        document.getElementById('bw-head-title').textContent = name + '\u2019s Birthday 🎂';
        document.getElementById('bw-head-avatar').src = userAvatar || '';
        _loadBirthdayRecentPics(userId, userAvatar);
        // Festive community banner — the requested pop-up message, now a
        // dismissable/auto-fading ribbon (see _armBirthdayBanner below).
        var bannerEl = document.getElementById('bw-banner');
        if (bannerEl) bannerEl.textContent = name + ', your birthday is today and the Empyrean community is glad to celebrate with you. Please everyone should wish him or her well.';
        _armBirthdayBanner();
        document.getElementById('bw-list').innerHTML = '<div class="bw-empty">Loading wishes…</div>';
        document.getElementById('bw-input').value = '';
        _closeBirthdayCardComposer(); // reset composer to closed/blank on every open

        var giftBtn = document.getElementById('bw-gift-btn');
        var cardBtn = document.getElementById('bw-card-btn');
        var us = window.userState || {};
        var isSelf = userId === us.id;
        giftBtn.style.display = isSelf ? 'none' : '';
        giftBtn.onclick = function () {
            if (typeof window.openProfileGiftCatalog === 'function') window.openProfileGiftCatalog(userId, userName);
        };
        // A person can still design a card for their OWN birthday thread
        // (friends read it same as any other card) — only gifting yourself
        // is blocked, same restriction _sendProfileGift() already enforces.
        if (cardBtn) cardBtn.style.display = '';

        var modal = document.getElementById('birthday-wishes-modal');
        modal.dataset.bwUserId = userId;
        modal.dataset.bwUserName = userName || 'Friend';
        modal.style.removeProperty('display');
        modal.style.removeProperty('visibility');
        modal.classList.add('show');
        document.body.classList.add('modal-open');

        if (!window.fbDb || !window._firebaseLoaded) return;
        _bdFeed.userId = userId;
        try {
            _bdFeed.unsub = window.fbDb.collection('birthday_feed')
                .where('birthdayUserId', '==', userId)
                .onSnapshot(function (snap) {
                    var items = [];
                    snap.forEach(function (doc) { items.push(doc.data() || {}); });
                    items.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
                    _renderBirthdayFeedItems(items);
                }, function (err) {
                    console.warn('[Birthday] wishes feed listener error:', err && err.message);
                });
        } catch (e) {
            console.warn('[Birthday] could not attach wishes feed listener:', e && e.message);
        }
    };

    function _closeBirthdayWishesModal() {
        var modal = document.getElementById('birthday-wishes-modal');
        if (modal) modal.classList.remove('show');
        document.body.classList.remove('modal-open');
        _detachBirthdayFeedListener();
        clearTimeout(_bdBannerTimer); // don't let a stale timer fire against a closed/reused modal
        _closeBirthdayLightbox(); // belt-and-suspenders — don't leave the lightbox open over a re-opened modal later
    }

    async function _sendBirthdayWish() {
        var modal = document.getElementById('birthday-wishes-modal');
        var input = document.getElementById('bw-input');
        if (!modal || !input) return;
        var recipientId = modal.dataset.bwUserId;
        var us = window.userState || {};
        if (!recipientId) return;
        if (recipientId === us.id) {
            if (typeof window.showNotification === 'function') window.showNotification("This is your own birthday — friends can leave their wishes here!", 'info');
            return;
        }
        var message = (input.value || '').trim().slice(0, 200);
        if (!message) return;

        var btn = document.getElementById('bw-send-btn');
        if (btn) btn.disabled = true;
        input.value = '';

        try {
            if (window.fbDb && window._firebaseLoaded) {
                await window.fbDb.collection('birthday_feed').add({
                    birthdayUserId: recipientId,
                    type: 'wish',
                    senderId: _authUid() || us.id,
                    senderName: us.fullName || us.username || 'Someone',
                    senderAvatar: us.avatar || '',
                    message: message,
                    createdAt: new Date().toISOString()
                });
            }
        } catch (err) {
            console.warn('[Birthday] wish send failed:', err && err.message);
            if (typeof window.showNotification === 'function') window.showNotification('Could not send your wish — try again.', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Customized birthday cards — "design and send a personalized card"
    // FEATURE (requested addition): a lightweight inline composer inside
    // the same Birthday Wishes modal (see #bw-composer above) — pick a
    // background from a small palette, write a message, preview it live,
    // and send. Persists as a `birthday_feed` doc with type:'card' (the
    // same collection/thread every wish and gift already writes to — see
    // this section's own header note on that shared feed), so a card
    // shows up interleaved with wishes and gifts, in order, exactly like
    // a Facebook birthday post's comment thread. No EMPY cost — this is
    // a free, creative way to participate distinct from the paid gift
    // catalog (SECTION 11) above.
    // ─────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────
    // UPGRADE (2026-08-25 — "generate a library of beautiful real-life
    // birthday cards to select and send instead of text formatting"):
    // BW_CARD_BGS (5 flat color gradients) replaced with a real library of
    // fully "designed" cards — each one a background PLUS a scattered set
    // of decorative glyphs (balloons, confetti, flowers, stars, ribbons,
    // a cake, etc.) and a thin gold-foil inner border, so picking one looks
    // and feels like choosing an actual printed greeting card, not a color
    // chip. Built entirely from CSS + emoji (no external image host — this
    // app already avoids exactly that dependency elsewhere, see
    // app-patch-v15.js's own note on dropping ui-avatars.com), so every
    // design always renders, even offline, with nothing to fetch or fail
    // to load. `decor` positions are in percent (top/left within the card)
    // so the exact same template renders correctly at both the small
    // gallery-thumbnail size and the big live-preview size — see
    // _cardTemplateDecorHTML() below.
    // ─────────────────────────────────────────────────────────────
    var BW_CARD_TEMPLATES = [
        {
            id: 'golden-confetti', name: 'Golden Confetti',
            bg: 'linear-gradient(160deg,#1B2B8B 0%,#3B2E8B 48%,#0A0E27 100%)', color: '#fff',
            decor: [
                { e: '🎉', t: 10, l: 14, s: 1.5, r: -12 }, { e: '✨', t: 14, l: 82, s: 1.1, r: 10 },
                { e: '🎊', t: 86, l: 20, s: 1.5, r: 8 },   { e: '⭐', t: 82, l: 78, s: 1.0, r: -6 },
                { e: '✨', t: 50, l: 8,  s: 0.8, r: 0 },    { e: '🎈', t: 24, l: 90, s: 1.2, r: 14 }
            ]
        },
        {
            id: 'balloon-bash', name: 'Balloon Bash',
            bg: 'linear-gradient(160deg,#8EC5FC 0%,#E0C3FC 55%,#FBC2EB 100%)', color: '#3a2060',
            decor: [
                { e: '🎈', t: 16, l: 20, s: 1.7, r: -10 }, { e: '🎈', t: 12, l: 50, s: 1.4, r: 8 },
                { e: '🎈', t: 18, l: 80, s: 1.6, r: 12 },  { e: '🎉', t: 84, l: 16, s: 1.2, r: -6 },
                { e: '🎊', t: 86, l: 82, s: 1.2, r: 8 }
            ]
        },
        {
            id: 'rose-garden', name: 'Rose Garden',
            bg: 'linear-gradient(160deg,#FDEBD3 0%,#FBC7D4 55%,#F7A8B8 100%)', color: '#7a1f3d',
            decor: [
                { e: '🌸', t: 10, l: 12, s: 1.3, r: -8 },  { e: '🌷', t: 88, l: 14, s: 1.4, r: 6 },
                { e: '🌹', t: 12, l: 86, s: 1.3, r: 10 },  { e: '🌸', t: 88, l: 84, s: 1.2, r: -10 },
                { e: '🦋', t: 46, l: 90, s: 1.0, r: 0 }
            ]
        },
        {
            id: 'tropical-paradise', name: 'Tropical Paradise',
            bg: 'linear-gradient(160deg,#0BA360 0%,#3CBA92 55%,#F5C518 130%)', color: '#0A2E1F',
            decor: [
                { e: '🌴', t: 14, l: 14, s: 1.6, r: -8 },  { e: '🍍', t: 84, l: 82, s: 1.4, r: 10 },
                { e: '☀️', t: 12, l: 82, s: 1.3, r: 0 },   { e: '🌺', t: 86, l: 16, s: 1.2, r: -6 }
            ]
        },
        {
            id: 'starry-wish', name: 'Starry Night Wish',
            bg: 'linear-gradient(160deg,#0A0E27 0%,#241654 55%,#3B2E8B 100%)', color: '#fff',
            decor: [
                { e: '🌙', t: 14, l: 82, s: 1.6, r: 0 },   { e: '⭐', t: 12, l: 16, s: 1.0, r: 0 },
                { e: '✨', t: 30, l: 8,  s: 0.8, r: 0 },    { e: '✨', t: 84, l: 20, s: 0.9, r: 0 },
                { e: '⭐', t: 88, l: 84, s: 1.1, r: 0 },    { e: '🌠', t: 50, l: 90, s: 1.2, r: -14 }
            ]
        },
        {
            id: 'classic-ribbon', name: 'Classic Ribbon',
            bg: 'linear-gradient(160deg,#7A1F2B 0%,#A62639 55%,#C9A66B 130%)', color: '#fff',
            decor: [
                { e: '🎀', t: 12, l: 50, s: 1.7, r: 0 },   { e: '🎁', t: 86, l: 18, s: 1.4, r: -8 },
                { e: '🎁', t: 86, l: 82, s: 1.3, r: 8 }
            ]
        },
        {
            id: 'rainbow-pop', name: 'Rainbow Pop',
            bg: 'linear-gradient(120deg,#FF5F6D 0%,#FFC371 30%,#F9F871 55%,#37D67A 75%,#3B5BDB 100%)', color: '#1B2B8B',
            decor: [
                { e: '🎂', t: 82, l: 50, s: 1.7, r: 0 },   { e: '🎉', t: 12, l: 16, s: 1.3, r: -10 },
                { e: '🎊', t: 14, l: 84, s: 1.3, r: 10 }
            ]
        },
        {
            id: 'gold-foil-luxe', name: 'Elegant Gold Foil',
            bg: 'linear-gradient(160deg,#0A0A0A 0%,#1a1a1a 55%,#2b2b2b 100%)', color: '#F5D98A',
            decor: [
                { e: '👑', t: 14, l: 50, s: 1.6, r: 0 },   { e: '✨', t: 84, l: 18, s: 1.0, r: 0 },
                { e: '✨', t: 84, l: 82, s: 1.0, r: 0 },    { e: '✨', t: 50, l: 10, s: 0.8, r: 0 },
                { e: '✨', t: 50, l: 90, s: 0.8, r: 0 }
            ]
        }
    ];
    var _bdCardState = { templateId: BW_CARD_TEMPLATES[0].id };

    function _findCardTemplate(id) {
        for (var i = 0; i < BW_CARD_TEMPLATES.length; i++) if (BW_CARD_TEMPLATES[i].id === id) return BW_CARD_TEMPLATES[i];
        return BW_CARD_TEMPLATES[0];
    }

    // Shared between the small gallery thumbnail and the big live preview —
    // `scale` multiplies each decor glyph's own font-size so the identical
    // template definition looks right at either size (thumbnail glyphs use
    // a smaller absolute em, preview glyphs the full size).
    function _cardTemplateDecorHTML(tpl, scale) {
        return (tpl.decor || []).map(function (d) {
            return '<span class="bw-card-decor" style="--bwcd-t:' + d.t + '%;--bwcd-l:' + d.l + '%;' +
                '--bwcd-scale:' + (d.s * scale) + ';--bwcd-r:' + (d.r || 0) + 'deg;">' + d.e + '</span>';
        }).join('') + '<span class="bw-card-foil"></span>';
    }

    function _renderCardGallery() {
        var wrap = document.getElementById('bw-card-gallery');
        if (!wrap) return;
        wrap.innerHTML = BW_CARD_TEMPLATES.map(function (tpl) {
            var sel = tpl.id === _bdCardState.templateId ? ' selected' : '';
            return '<div class="bw-card-thumb' + sel + '" data-bw-tpl="' + tpl.id + '" style="background:' + tpl.bg + ';" title="' + _bdEsc(tpl.name) + '">' +
                _cardTemplateDecorHTML(tpl, 0.42) +
                '<span class="bw-card-thumb-name">' + _bdEsc(tpl.name) + '</span>' +
                '</div>';
        }).join('');
    }

    function _updateCardPreview() {
        var preview = document.getElementById('bw-card-preview');
        var textEl  = document.getElementById('bw-card-text');
        if (!preview) return;
        var tpl = _findCardTemplate(_bdCardState.templateId);
        preview.style.background = tpl.bg;
        preview.style.color = tpl.color;
        preview.innerHTML = _cardTemplateDecorHTML(tpl, 1) +
            '<span class="bw-card-preview-msg">' + (_bdEsc((textEl && textEl.value.trim()) || '') || 'Your message will appear here…') + '</span>';
    }

    function _openBirthdayCardComposer() {
        var composer = document.getElementById('bw-composer');
        var inputRow = document.getElementById('bw-input-row');
        // FIX ("no send button / send is hidden"): .bw-list (the message
        // feed) was never hidden while the composer was open — it stayed
        // in the flex layout taking up its own space (down to its 120px
        // floor) right alongside the composer, which is exactly what left
        // too little room for the composer's own content and pushed its
        // Send button out of view. Hiding the feed + banner for the
        // composer's duration gives it the room it actually needs; both
        // are restored untouched in _closeBirthdayCardComposer below.
        var list = document.getElementById('bw-list');
        var bannerWrap = document.querySelector('#birthday-wishes-modal .bw-banner-wrap');
        if (!composer) return;
        _bdCardState.templateId = BW_CARD_TEMPLATES[0].id;
        var textEl = document.getElementById('bw-card-text');
        if (textEl) textEl.value = '';
        _renderCardGallery();
        _updateCardPreview();
        composer.style.display = 'block';
        if (inputRow) inputRow.style.display = 'none'; // one composing surface at a time
        if (list) list.style.display = 'none';
        if (bannerWrap) bannerWrap.style.display = 'none';
    }

    function _closeBirthdayCardComposer() {
        var composer = document.getElementById('bw-composer');
        var inputRow = document.getElementById('bw-input-row');
        var list = document.getElementById('bw-list');
        var bannerWrap = document.querySelector('#birthday-wishes-modal .bw-banner-wrap');
        if (composer) composer.style.display = 'none';
        if (inputRow) inputRow.style.display = '';
        if (list) list.style.display = '';
        if (bannerWrap) bannerWrap.style.display = '';
    }

    async function _sendBirthdayCard() {
        var modal = document.getElementById('birthday-wishes-modal');
        var textEl = document.getElementById('bw-card-text');
        if (!modal || !textEl) return;
        var recipientId = modal.dataset.bwUserId;
        var us = window.userState || {};
        if (!recipientId) return;

        var message = (textEl.value || '').trim().slice(0, 140);
        if (!message) {
            if (typeof window.showNotification === 'function') window.showNotification('Write a message for your card first.', 'error');
            return;
        }

        var btn = document.querySelector('#birthday-wishes-modal [data-bw-action="send-card"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

        try {
            if (window.fbDb && window._firebaseLoaded) {
                var sendTpl = _findCardTemplate(_bdCardState.templateId);
                await window.fbDb.collection('birthday_feed').add({
                    birthdayUserId: recipientId,
                    type: 'card',
                    senderId: _authUid() || us.id,
                    senderName: us.fullName || us.username || 'Someone',
                    senderAvatar: us.avatar || '',
                    message: message,
                    cardTemplate: sendTpl.id,
                    // cardBg kept alongside cardTemplate for backward
                    // compatibility — app-profile.js's own (simpler, text-
                    // only) birthday feed rendering reads cardBg directly
                    // and doesn't know about the template library, so it
                    // still shows a correctly-colored card rather than a
                    // blank/default one for cards sent from here.
                    cardBg: sendTpl.bg,
                    createdAt: new Date().toISOString()
                });
            }
            if (typeof window.showNotification === 'function') window.showNotification('🎉 Your personalized card was sent!', 'success');
            _closeBirthdayCardComposer();
        } catch (err) {
            console.warn('[Birthday] card send failed:', err && err.message);
            if (typeof window.showNotification === 'function') window.showNotification('Could not send your card — try again.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Card'; }
        }
    }

    document.addEventListener('click', function (e) {
        var closest = function (sel) { return e.target.closest ? e.target.closest(sel) : null; };

        var chip = closest('.emp-bday-chip');
        if (chip) {
            window.openBirthdayWishesFeed(chip.dataset.bdayUserId, chip.dataset.bdayUserName, chip.dataset.bdayUserAvatar);
            return;
        }

        var pic = closest('.bw-recent-strip img');
        if (pic) {
            _openBirthdayLightbox(_bdRecentPicUrls, parseInt(pic.dataset.bdPicIndex, 10) || 0);
            return;
        }

        // Tap on the lightbox's dimmed backdrop itself (outside the framed
        // picture) closes it too — checked via an EXACT target match, not
        // closest(), since the overlay is an ancestor of the whole frame
        // and closest() would otherwise match (and close) on every tap
        // inside it, including the picture and the back button.
        if (e.target && e.target.id === 'bw-lightbox') {
            _closeBirthdayLightbox();
            return;
        }

        var thumb = closest('#birthday-wishes-modal .bw-card-thumb');
        if (thumb) {
            _bdCardState.templateId = thumb.dataset.bwTpl || BW_CARD_TEMPLATES[0].id;
            _renderCardGallery();
            _updateCardPreview();
            return;
        }

        // FIX ("back navigation is not working"): was scoped to only
        // `#birthday-wishes-modal [data-bw-action]`. #bw-lightbox is a
        // SIBLING of that modal (both appended directly to <body> — see
        // _ensureBirthdayWishesModal()), not a descendant of it, so the
        // lightbox's own back button could never match this selector and
        // its click was silently swallowed. Now matches both scopes.
        var bwAction = closest('#birthday-wishes-modal [data-bw-action], #bw-lightbox [data-bw-action]');
        if (bwAction) {
            var action = bwAction.dataset.bwAction;
            if (action === 'close') _closeBirthdayWishesModal();
            else if (action === 'send') _sendBirthdayWish();
            else if (action === 'open-card') _openBirthdayCardComposer();
            else if (action === 'close-card') _closeBirthdayCardComposer();
            else if (action === 'send-card') _sendBirthdayCard();
            else if (action === 'close-lightbox') _closeBirthdayLightbox();
            return;
        }
    });
    document.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'bw-card-text') _updateCardPreview();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            var lb = document.getElementById('bw-lightbox');
            if (lb && lb.classList.contains('bw-lightbox-open')) { _closeBirthdayLightbox(); return; }
        }
        if (e.key !== 'Enter') return;
        if (e.target && e.target.id === 'bw-input') { e.preventDefault(); _sendBirthdayWish(); }
    });

    console.log('[Gifts] Module 0.14 loaded — ' + EMPY_GIFT_CATALOG.length + ' gifts in catalog (incl. profile/birthday catalog + dashboard Birthdays Today row/wishes feed + custom card composer + recent-pictures lightbox + premium gold cake badges). ✅');
})();