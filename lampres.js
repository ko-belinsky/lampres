(function () {
    'use strict';
    if (window.cs_v33) return;
    window.cs_v33 = true;

    const KEY = 'cs_v33_store';
    let lastMovieId = null;
    let pendingResume = null;
    let overrideUsed = false;
    let lastFvSnapshot = {};

    function L() { console.log.apply(console, ['CS33'].concat([].slice.call(arguments))); }

    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); } catch(e) { L('save err', e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }
    function getFvKey() {
        try {
            if (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile) {
                return 'file_view_' + Lampa.Account.Permit.account.profile.id;
            }
        } catch(e) {}
        return 'file_view';
    }

    // === 1. Перехват Player.play ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v33) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object' && arg.url) {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        const prim = {};
                        for (const k in arg) {
                            const v = arg[k];
                            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') prim[k] = v;
                        }
                        const ex = get(movie.id) || {};
                        prim.__time = ex.__time || 0;
                        prim.__duration = ex.__duration || 0;
                        prim.__playlist = ex.__playlist || null;
                        save(movie.id, prim);
                        try { lastFvSnapshot = JSON.parse(localStorage.getItem(getFvKey()) || '{}'); } catch(e) { lastFvSnapshot = {}; }
                        L('PLAY id=' + movie.id + ' fileIdx=' + (arg.id !== undefined ? arg.id : 'na') + ' path=' + String(arg.path||'').slice(0, 60));
                    }
                }
            } catch(e) { L('play hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v33 = true;
        L('HOOKED Player.play');
    }

    // === 2. Перехват Player.playlist ===
    if (Lampa.Player && typeof Lampa.Player.playlist === 'function' && !Lampa.Player.__hooked_v33_pl) {
        const origPl = Lampa.Player.playlist;
        Lampa.Player.playlist = function () {
            const args = [].slice.call(arguments);
            let result;
            try { result = origPl.apply(this, args); }
            catch(e) { L('pl call err', e.message); return; }

            if (args.length > 0 && Array.isArray(args[0]) && args[0].length > 0 && lastMovieId) {
                try {
                    if (args[0][0]) L('PL item0 keys: ' + Object.keys(args[0][0]).join(','));
                    const stored = args[0].map(item => {
                        const o = {};
                        for (const k in item) {
                            const v = item[k];
                            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') o[k] = v;
                        }
                        return o;
                    });
                    const d = get(lastMovieId) || {};
                    d.__playlist = stored;
                    save(lastMovieId, d);
                    L('PLAYLIST saved id=' + lastMovieId + ' items=' + stored.length);
                } catch(e) { L('pl save err', e.message); }
            }
            return result;
        };
        Lampa.Player.__hooked_v33_pl = true;
        L('HOOKED Player.playlist');
    }

    // === 3. Опрос file_view ===
    setInterval(function () {
        if (!lastMovieId) return;
        try {
            const store = JSON.parse(localStorage.getItem(getFvKey()) || '{}');
            let best = null;
            for (const hash in store) {
                const v = store[hash];
                if (!v || !v.time) continue;
                const prev = lastFvSnapshot[hash];
                const prevTime = prev ? (prev.time || 0) : -1;
                if (Math.abs(prevTime - v.time) > 1) {
                    if (!best || v.time > (best.time || 0)) best = { hash, time: v.time, duration: v.duration };
                }
            }
            if (best) {
                const d = get(lastMovieId);
                if (d) { d.__time = best.time; d.__duration = best.duration || d.__duration || 0; save(lastMovieId, d); L('FV time=' + Math.round(best.time)); }
            }
            lastFvSnapshot = store;
        } catch(e) {}
    }, 2000);

    // === 4. Перехват Timeline.view ===
    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function' && !Lampa.Timeline.__hooked_v33) {
        const origView = Lampa.Timeline.view;
        Lampa.Timeline.view = function (hash) {
            let result;
            try { result = origView.apply(this, arguments); } catch(e) { result = null; }
            if (pendingResume && pendingResume.time > 1) {
                overrideUsed = true;
                L('TV OVERRIDE -> ' + Math.round(pendingResume.time));
                return { time: pendingResume.time, duration: pendingResume.duration || (pendingResume.time + 3000), percent: 0 };
            }
            return result;
        };
        Lampa.Timeline.__hooked_v33 = true;
        L('HOOKED Timeline.view');
    }

    // === 5. Универсальный поиск индекса в плейлисте ===
    function findPlaylistIndex(playlist, d) {
        if (!playlist || !d) return -1;
        for (let i = 0; i < playlist.length; i++) {
            const it = playlist[i];
            if (!it) continue;
            // 1. По path (самый уникальный)
            if (d.path && it.path && d.path === it.path) return i;
            // 2. По url
            if (d.url && it.url && d.url === it.url) return i;
            // 3. По индексу файла — разные имена полей
            if (d.id !== undefined && d.id !== null) {
                if (it.id === d.id) return i;
                if (it.file_index === d.id) return i;
                if (it.index === d.id) return i;
                if (it.file === d.id) return i;
            }
            // 4. По индексу в URL
            if (d.url && it.url) {
                const m1 = String(d.url).match(/[?&]index=(\d+)/);
                const m2 = String(it.url).match(/[?&]index=(\d+)/);
                if (m1 && m2 && m1[1] === m2[1]) return i;
            }
        }
        return -1;
    }

    // === 6. Кнопка «Продолжить» ===
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        const movie = e.data.movie;
        if (!isSeries(movie)) return;

        $('.button--continue-series').remove();
        $('.full-start-new__buttons').append(
            '<div class="full-start__button selector button--continue-series">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<span>Продолжить</span></div>'
        );

        $('.button--continue-series').on('hover:enter', function () {
            const d = get(movie.id);
            L('BTN id=' + movie.id + ' time=' + (d ? Math.round(d.__time||0) : 'no') +
              ' fileIdx=' + (d && d.id !== undefined ? d.id : 'na') +
              ' playlist=' + (d && d.__playlist ? d.__playlist.length : 0));
            if (!d || !d.url) return;

            const resumeTime = d.__time || 0;
            overrideUsed = false;
            if (resumeTime > 1) {
                pendingResume = { movieId: movie.id, time: resumeTime, duration: d.__duration };
                L('pendingResume SET ' + Math.round(resumeTime));
                setTimeout(function () {
                    if (pendingResume && pendingResume.movieId === movie.id) {
                        pendingResume = null;
                        L('pendingResume TIMEOUT (used=' + overrideUsed + ')');
                    }
                }, 20000);
            }

            if (d.__playlist && d.__playlist.length > 0) {
                L('BTN use saved playlist items=' + d.__playlist.length);
                playWithPlaylist(movie, d, d.__playlist, resumeTime);
            } else {
                L('BTN no playlist, single fallback');
                fallbackSingle(movie, d, resumeTime);
            }
        });
    });

    function playWithPlaylist(movie, d, playlist, resumeTime) {
        const idx = findPlaylistIndex(playlist, d);
        L('findPlaylistIndex idx=' + idx + '/' + playlist.length + ' (d.id=' + d.id + ', d.path=' + String(d.path||'').slice(0,40) + ')');

        const startIdx = idx >= 0 ? idx : 0;
        if (idx < 0) {
            L('WARN: not found, using 0');
            if (playlist[0]) L('first item fields: id=' + playlist[0].id + ' file_index=' + playlist[0].file_index + ' index=' + playlist[0].index);
        } else {
            L('MATCH at idx=' + idx + ' id=' + playlist[idx].id + ' path=' + String(playlist[idx].path||'').slice(0,40));
        }

        try {
            if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                Lampa.Player.playlist(playlist);
                L('Player.playlist set, len=' + playlist.length);
            }
        } catch(e) { L('pl err', e.message); }

        const playArg = Object.assign({}, playlist[startIdx]);
        playArg.card = movie;
        playArg.movie = movie;
        Lampa.Player.play(playArg);

        if (resumeTime > 1) {
            setTimeout(function () {
                if (overrideUsed) { L('skip PV.to'); return; }
                try {
                    if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.to === 'function') {
                        L('PV.to(' + Math.round(resumeTime) + ') fallback');
                        Lampa.PlayerVideo.to(resumeTime);
                    }
                } catch(e) {}
            }, 5000);
        }
    }

    function fallbackSingle(movie, d, resumeTime) {
        L('FALLBACK single');
        const playArg = {};
        for (const k in d) { if (k.indexOf('__') === 0) continue; playArg[k] = d[k]; }
        playArg.card = movie; playArg.movie = movie;
        Lampa.Player.play(playArg);
        if (resumeTime > 1) {
            setTimeout(function () {
                if (overrideUsed) return;
                try {
                    if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.to === 'function') Lampa.PlayerVideo.to(resumeTime);
                } catch(e) {}
            }, 5000);
        }
    }

    L('v33 loaded');
})();
