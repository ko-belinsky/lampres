(function () {
    'use strict';
    if (window.cs_v19) return;
    window.cs_v19 = true;

    const KEY = 'cs_v19_store';
    let lastArg = null;
    let lastMovieId = null;

    function L(m) { console.log('CS19 ' + m); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Хук Player.play: запоминаем arg и movieId ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v19) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object' && arg.url) {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        lastArg = arg;
                        const prim = {};
                        for (const k in arg) {
                            const v = arg[k];
                            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') prim[k] = v;
                        }
                        const ex = get(movie.id) || {};
                        prim.__time = ex.__time || 0;
                        save(movie.id, prim);
                        L('PLAY saved id=' + movie.id);
                    }
                }
            } catch(e) { L('hook err '+e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v19 = true;
        L('HOOKED Player.play');
    }

    // === 2. ОПРОС video.currentTime каждые 1.5с — сохраняем позицию ===
    setInterval(function () {
        if (!lastMovieId) return;
        try {
            let v = null;
            try { v = Lampa.PlayerVideo.video(); } catch(e) {}
            if (!v) v = document.querySelector('video');
            if (!v || !v.currentTime || v.currentTime < 1) return;
            const d = get(lastMovieId);
            if (!d) return;
            d.__time = v.currentTime;
            const now = Date.now();
            if (!d.__lastSave || now - d.__lastSave > 2000) {
                d.__lastSave = now;
                save(lastMovieId, d);
                L('POLL time=' + Math.round(v.currentTime));
            }
        } catch(e) {}
    }, 1500);

    // === 3. Кнопка «Продолжить» ===
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'time=' + Math.round(d.__time||0) : 'no'));
            if (!d || !d.url) return;

            const resumeTime = d.__time || 0;
            L('BTN resumeTime=' + Math.round(resumeTime));

            let playArg;
            if (lastArg && lastArg.card && lastArg.card.id === movie.id) {
                playArg = lastArg;
                L('BTN using lastArg (session)');
            } else {
                playArg = {};
                for (const k in d) {
                    if (k.indexOf('__') === 0) continue;
                    playArg[k] = d[k];
                }
                playArg.card = movie;
                playArg.movie = movie;
                L('BTN using storage (after restart)');
            }

            Lampa.Player.play(playArg);

            // Всегда перематываем вручную — независимо от внутренней логики Lampa
            if (resumeTime > 1) {
                let tries = 0;
                const timer = setInterval(function () {
                    let v = null;
                    try { v = Lampa.PlayerVideo.video(); } catch(e) { try { v = document.querySelector('video'); } catch(e2) {} }
                    if (v && v.readyState >= 1 && v.duration > 0) {
                        if (Math.abs(v.currentTime - resumeTime) > 3) {
                            v.currentTime = resumeTime;
                            L('SEEK to ' + Math.round(resumeTime));
                        } else {
                            L('already at ' + Math.round(v.currentTime));
                        }
                        clearInterval(timer);
                    } else if (++tries > 40) {
                        clearInterval(timer);
                        L('SEEK timeout');
                    }
                }, 500);
            }
        });
    });

    L('v19 loaded');
})();
