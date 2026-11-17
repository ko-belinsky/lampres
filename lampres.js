(function () {
    'use strict';
    if (window.cs_v30) return;
    window.cs_v30 = true;

    const KEY = 'cs_v30_store';
    let lastMovieId = null;
    let pendingResume = null;
    let overrideUsed = false;
    let lastFvSnapshot = {};

    function L() {
        console.log.apply(console, ['CS30'].concat([].slice.call(arguments)));
    }

    function save(id, data) {
        try {
            const a = JSON.parse(localStorage.getItem(KEY) || '{}');
            a[String(id)] = data;
            localStorage.setItem(KEY, JSON.stringify(a));
        } catch (e) { L('save err', e.message); }
    }

    function get(id) {
        try {
            return JSON.parse(localStorage.getItem(KEY) || '{}')[String(id)] || null;
        } catch (e) { return null; }
    }

    function isSeries(m) {
        return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title));
    }

    function currentMovie() {
        try {
            const a = Lampa.Activity.active();
            return a && (a.movie || a.card || a.card_data);
        } catch (e) { return null; }
    }

    function getFvKey() {
        try {
            if (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile) {
                return 'file_view_' + Lampa.Account.Permit.account.profile.id;
            }
        } catch (e) {}
        return 'file_view';
    }

    // === 1. Перехват Player.play (сохранение контекста) ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v30) {
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
                        save(movie.id, prim);
                        try { lastFvSnapshot = JSON.parse(localStorage.getItem(getFvKey()) || '{}'); } catch (e) { lastFvSnapshot = {}; }
                        L('PLAY id=' + movie.id);
                    }
                }
            } catch (e) { L('hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v30 = true;
        L('HOOKED Player.play');
    }

    // === 2. Опрос file_view для сохранения прогресса ===
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
                if (d) {
                    d.__time = best.time;
                    d.__duration = best.duration || d.__duration || 0;
                    save(lastMovieId, d);
                    L('FV time=' + Math.round(best.time));
                }
            }
            lastFvSnapshot = store;
        } catch (e) {}
    }, 2000);

    // === 3. Перехват Timeline.view для перемотки ===
    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function' && !Lampa.Timeline.__hooked_v30_view) {
        const origView = Lampa.Timeline.view;
        Lampa.Timeline.view = function (hash) {
            let result;
            try { result = origView.apply(this, arguments); } catch (e) { result = null; }
            if (pendingResume && pendingResume.time > 1) {
                overrideUsed = true;
                L('TV OVERRIDE -> ' + Math.round(pendingResume.time));
                return { time: pendingResume.time, duration: pendingResume.duration || (pendingResume.time + 3000), percent: 0 };
            }
            return result;
        };
        Lampa.Timeline.__hooked_v30_view = true;
        L('HOOKED Timeline.view');
    }

    // === 4. Кнопка «Продолжить» ===
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
            L('BTN id=' + movie.id + ' time=' + (d ? Math.round(d.__time || 0) : 'no'));
            if (!d || !d.torrent_hash) return;

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

            // Запускаем опрос файлов торрента (как в Lampa)
            pollTorserverFiles(movie, d, resumeTime, 0);
        });
    });

    // === 5. Опрос файлов TorrServer ===
    function pollTorserverFiles(movie, d, resumeTime, attempt) {
        attempt++;
        L('BTN запрос файлов, попытка ' + attempt);
        Lampa.Torserver.files(d.torrent_hash, function (filesData) {
            try {
                const files = (filesData && filesData.file_stats) ? filesData.file_stats : [];
                L('BTN файлов получено: ' + files.length);
                if (!files.length) {
                    if (attempt < 15) {
                        setTimeout(function () { pollTorserverFiles(movie, d, resumeTime, attempt); }, 2000);
                    } else {
                        L('BTN: пустой список файлов после 15 попыток, fallback');
                        fallbackSingle(movie, d, resumeTime);
                    }
                    return;
                }

                const videoFiles = files.filter(function (f) {
                    return f.path && f.path.match(/\.(mkv|mp4|avi|ts|m4v)$/i);
                });
                L('BTN видеофайлов: ' + videoFiles.length);
                if (!videoFiles.length) {
                    fallbackSingle(movie, d, resumeTime);
                    return;
                }

                // Строим плейлист
                const playlist = videoFiles.map(function (f) {
                    return {
                        url: Lampa.Torserver.stream(f.path, d.torrent_hash, f.id),
                        title: f.path.split('/').pop(),
                        torrent_hash: d.torrent_hash,
                        file_index: f.id,
                        card: movie,
                        movie: movie,
                        season: f.season,
                        episode: f.episode
                    };
                });

                // Передаём плейлист в Lampa
                if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                    Lampa.Player.playlist(playlist);
                    L('Player.playlist() вызван, элементов: ' + playlist.length);
                } else {
                    L('Player.playlist недоступен');
                }

                // Находим сохранённую серию
                let startIndex = playlist.findIndex(function (item) { return item.file_index === d.id; });
                if (startIndex < 0) startIndex = 0;
                L('BTN startIndex=' + startIndex + ' file_index=' + d.id);

                // Запускаем выбранную серию
                const playArg = playlist[startIndex];
                L('BTN play url=' + playArg.url.slice(0, 100));
                Lampa.Player.play(playArg);

                // Резервная перемотка
                if (resumeTime > 1) {
                    setTimeout(function () {
                        if (overrideUsed) { L('skip PV.to (override worked)'); return; }
                        try {
                            if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.to === 'function') {
                                L('PV.to(' + Math.round(resumeTime) + ') fallback');
                                Lampa.PlayerVideo.to(resumeTime);
                            }
                        } catch (e) { L('PV.to err', e.message); }
                    }, 5000);
                }
            } catch (e) {
                L('files callback err: ' + e.message);
                fallbackSingle(movie, d, resumeTime);
            }
        }, function (err) {
            L('Torserver.files ошибка (попытка ' + attempt + '): ' + (err ? err.message || JSON.stringify(err) : 'unknown'));
            if (attempt < 15) {
                setTimeout(function () { pollTorserverFiles(movie, d, resumeTime, attempt); }, 2000);
            } else {
                L('BTN: 15 попыток не удались, fallback');
                fallbackSingle(movie, d, resumeTime);
            }
        });
    }

    // === 6. Резервный запуск ===
    function fallbackSingle(movie, d, resumeTime) {
        L('FALLBACK single');
        const playArg = {};
        for (const k in d) { if (k.indexOf('__') === 0) continue; playArg[k] = d[k]; }
        playArg.card = movie; playArg.movie = movie;
        Lampa.Player.play(playArg);
        if (resumeTime > 1) {
            setTimeout(function () {
                if (overrideUsed) { L('skip PV.to (override worked)'); return; }
                try {
                    if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.to === 'function') {
                        L('PV.to(' + Math.round(resumeTime) + ') fallback');
                        Lampa.PlayerVideo.to(resumeTime);
                    }
                } catch (e) { L('PV.to err', e.message); }
            }, 5000);
        }
    }

    L('v30 loaded');
})();
