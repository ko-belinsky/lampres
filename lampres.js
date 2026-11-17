(function () {
    'use strict';
    if (window.cs_v34) return;
    window.cs_v34 = true;

    const KEY = 'cs_v34_store';
    let lastMovieId = null;
    let pendingResume = null;
    let overrideUsed = false;
    let lastFvSnapshot = {};

    function L() { console.log.apply(console, ['CS34'].concat([].slice.call(arguments))); }

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

    // Дамп сигнатур API
    setTimeout(function () {
        try {
            L('API play:', String(Lampa.Player.play).slice(0, 200).replace(/\s+/g, ' '));
            L('API playlist:', String(Lampa.Player.playlist).slice(0, 200).replace(/\s+/g, ' '));
            L('API runas:', String(Lampa.Player.runas || '').slice(0, 300).replace(/\s+/g, ' '));
            L('API playdata:', String(Lampa.Player.playdata || '').slice(0, 200).replace(/\s+/g, ' '));
        } catch(e) { L('dump err', e.message); }
    }, 3000);

    // Перехват runas и playdata — диагностика
    if (Lampa.Player && typeof Lampa.Player.runas === 'function' && !Lampa.Player.__hooked_v34_runas) {
        const origRunas = Lampa.Player.runas;
        Lampa.Player.runas = function () {
            const a = [].slice.call(arguments);
            L('RUNAS called args=' + a.length + ' t0=' + typeof a[0] + ' t1=' + typeof a[1]);
            return origRunas.apply(this, arguments);
        };
        Lampa.Player.__hooked_v34_runas = true;
        L('HOOKED runas');
    }
    if (Lampa.Player && typeof Lampa.Player.playdata === 'function' && !Lampa.Player.__hooked_v34_playdata) {
        const origPd = Lampa.Player.playdata;
        Lampa.Player.playdata = function () {
            const a = [].slice.call(arguments);
            L('PLAYDATA called args=' + a.length + ' t0=' + typeof a[0]);
            return origPd.apply(this, arguments);
        };
        Lampa.Player.__hooked_v34_playdata = true;
        L('HOOKED playdata');
    }

    // === 1. Перехват Player.play ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v34) {
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
                        L('PLAY id=' + movie.id + ' fileIdx=' + (arg.id !== undefined ? arg.id : 'na'));
                    }
                }
            } catch(e) { L('play hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v34 = true;
        L('HOOKED Player.play');
    }

    // === 2. Перехват Player.playlist ===
    if (Lampa.Player && typeof Lampa.Player.playlist === 'function' && !Lampa.Player.__hooked_v34_pl) {
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
        Lampa.Player.__hooked_v34_pl = true;
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
    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function' && !Lampa.Timeline.__hooked_v34) {
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
        Lampa.Timeline.__hooked_v34 = true;
        L('HOOKED Timeline.view');
    }

    // === 5. Универсальный поиск индекса ===
    function findPlaylistIndex(playlist, d) {
        if (!playlist || !d) return -1;
        for (let i = 0; i < playlist.length; i++) {
            const it = playlist[i];
            if (!it) continue;
            if (d.path && it.path && d.path === it.path) return i;
            if (d.url && it.url && d.url === it.url) return i;
            if (d.id !== undefined && d.id !== null) {
                if (it.id === d.id) return i;
                if (it.file_index === d.id) return i;
                if (it.index === d.id) return i;
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
            L('BTN id=' + movie.id + ' time=' + (d ? Math.round(d.__time||0) : 'no') + ' fileIdx=' + (d && d.id !== undefined ? d.id : 'na') + ' playlist=' + (d && d.__playlist ? d.__playlist.length : 0));
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
                fallbackSingle(movie, d, resumeTime);
            }
        });
    });

    function playWithPlaylist(movie, d, playlist, resumeTime) {
        const idx = findPlaylistIndex(playlist, d);
        const startIdx = idx >= 0 ? idx : 0;
        L('findPlaylistIndex idx=' + idx + '/' + playlist.length + ' → startIdx=' + startIdx);

        // Явно проставляем selected только на нужном элементе
        for (let i = 0; i < playlist.length; i++) {
            playlist[i].selected = (i === startIdx);
        }

        const playArg = Object.assign({}, playlist[startIdx]);
        playArg.card = movie;
        playArg.movie = movie;

        // ПОРЯДОК КАК В LAMPA: сначала play, потом playlist
        L('ORD play → playlist');
        try {
            Lampa.Player.play(playArg);
            L('play done');
        } catch(e) { L('play err', e.message); }

        try {
            if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                Lampa.Player.playlist(playlist);
                L('playlist done');
            }
        } catch(e) { L('pl err', e.message); }

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

    L('v34 loaded');
})();
