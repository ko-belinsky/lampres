(function () {
    'use strict';
    if (window.cs_v32) return;
    window.cs_v32 = true;

    const KEY = 'cs_v32_store';
    let lastMovieId = null;
    let pendingResume = null;
    let overrideUsed = false;
    let lastFvSnapshot = {};

    function L() { console.log.apply(console, ['CS32'].concat([].slice.call(arguments))); }

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
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v32) {
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
                        L('PLAY id=' + movie.id);
                    }
                }
            } catch(e) { L('play hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v32 = true;
        L('HOOKED Player.play');
    }

    // === 2. Перехват Player.playlist (геттер/сеттер) ===
    if (Lampa.Player && typeof Lampa.Player.playlist === 'function' && !Lampa.Player.__hooked_v32_pl) {
        const origPl = Lampa.Player.playlist;
        Lampa.Player.playlist = function () {
            const args = [].slice.call(arguments);
            let result;
            try {
                if (args.length > 0) {
                    L('Pl.set arg isArr=' + Array.isArray(args[0]) + ' len=' + (Array.isArray(args[0]) ? args[0].length : 'na'));
                }
                result = origPl.apply(this, args);
            } catch(e) { L('pl call err', e.message); return; }

            // Если это установка — читаем и сохраняем
            if (args.length > 0 && Array.isArray(args[0]) && args[0].length > 0 && lastMovieId) {
                try {
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
        Lampa.Player.__hooked_v32_pl = true;
        L('HOOKED Player.playlist');
    } else {
        L('Player.playlist NOT FOUND');
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
    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function' && !Lampa.Timeline.__hooked_v32) {
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
        Lampa.Timeline.__hooked_v32 = true;
        L('HOOKED Timeline.view');
    }

    // === 5. Прямой запрос файлов у TorrServer ===
    function fetchTorrServerFiles(host, hash, onOk, onErr) {
        L('fetch /torrents');
        fetch(host + '/torrents', { method: 'GET' })
            .then(r => { L('resp status=' + r.status); return r.text(); })
            .then(text => {
                try {
                    const data = JSON.parse(text);
                    // TorrServer может вернуть массив или объект
                    const list = Array.isArray(data) ? data : (data.torrents || []);
                    L('torrents in server: ' + list.length);
                    let found = null;
                    for (const t of list) {
                        const th = t.hash || t.Hash || '';
                        if (String(th).toLowerCase() === String(hash).toLowerCase()) { found = t; break; }
                    }
                    if (!found) { L('torrent not found on server'); onErr(); return; }
                    L('torrent found, keys=' + Object.keys(found).join(','));
                    const files = found.file_stats || found.FileStats || [];
                    L('file_stats: ' + files.length);
                    onOk(files, host);
                } catch(e) { L('parse err: ' + e.message); onErr(); }
            })
            .catch(e => { L('fetch err: ' + e.message); onErr(); });
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
            L('BTN id=' + movie.id + ' time=' + (d ? Math.round(d.__time||0) : 'no') + ' playlist=' + (d && d.__playlist ? d.__playlist.length : 0));
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
                // Сценарий А: плейлист уже сохранён
                L('BTN use saved playlist items=' + d.__playlist.length);
                playWithPlaylist(movie, d, d.__playlist, resumeTime);
            } else {
                // Сценарий Б: получаем файлы напрямую у TorrServer
                const hostMatch = String(d.url).match(/^(https?:\/\/[^/]+)/);
                if (!hostMatch) { L('BTN no host'); fallbackSingle(movie, d, resumeTime); return; }
                const host = hostMatch[1];
                fetchTorrServerFiles(host, d.torrent_hash, function (files, srvHost) {
                    if (!files || !files.length) { fallbackSingle(movie, d, resumeTime); return; }
                    const videos = files.filter(f => f.path && f.path.match(/\.(mkv|mp4|avi|ts|m4v)$/i));
                    L('video files: ' + videos.length);
                    if (!videos.length) { fallbackSingle(movie, d, resumeTime); return; }
                    const playlist = videos.map(f => {
                        const o = {};
                        o.url = srvHost + '/stream/' + encodeURIComponent(f.path).replace(/%2F/g, '/') + '?link=' + d.torrent_hash + '&index=' + f.id + '&play';
                        o.title = f.path.split('/').pop();
                        o.torrent_hash = d.torrent_hash;
                        o.file_index = f.id;
                        o.path = f.path;
                        return o;
                    });
                    d.__playlist = playlist;
                    save(movie.id, d);
                    playWithPlaylist(movie, d, playlist, resumeTime);
                }, function () {
                    fallbackSingle(movie, d, resumeTime);
                });
            }
        });
    });

    function playWithPlaylist(movie, d, playlist, resumeTime) {
        let idx = 0;
        for (let i = 0; i < playlist.length; i++) {
            if (playlist[i].file_index === d.id) { idx = i; break; }
        }
        L('play playlist idx=' + idx + '/' + playlist.length);
        try {
            if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                Lampa.Player.playlist(playlist);
                L('Player.playlist set, len=' + playlist.length);
            }
        } catch(e) { L('pl err', e.message); }
        const playArg = Object.assign({}, playlist[idx]);
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

    L('v32 loaded');
})();
