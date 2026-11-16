(function () {
    'use strict';
    if (window.cs_v18) return;
    window.cs_v18 = true;

    const KEY = 'cs_v18_store';
    let lastArg = null;
    let lastMovieId = null;
    let lastTimelineHash = null;

    function L(m) { console.log('CS18 ' + m); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Хук Player.play — сохраняем ВСЕ поля + lastArg в памяти ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v18) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object' && arg.url) {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        lastArg = arg;
                        lastTimelineHash = null;
                        const prim = {};
                        for (const k in arg) {
                            const v = arg[k];
                            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') prim[k] = v;
                        }
                        prim.__movieId = movie.id;
                        prim.__timelineHash = null;
                        prim.__time = 0;
                        save(movie.id, prim);
                        L('PLAY saved id=' + movie.id);
                    }
                }
            } catch(e) { L('hook err '+e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v18 = true;
        L('HOOKED Player.play');
    }

    // === 2. Timeline.update — ловим точный хэш и время ===
    function attachTimeline() {
        if (!Lampa.Timeline || !Lampa.Timeline.listener) { setTimeout(attachTimeline, 1000); return; }
        Lampa.Timeline.listener.follow('update', function (e) {
            if (!e || !e.hash || e.hash === '0' || !lastMovieId) return;
            lastTimelineHash = e.hash;
            const d = get(lastMovieId);
            if (d) {
                d.__timelineHash = e.hash;
                if (typeof e.time === 'number') d.__time = e.time;
                save(lastMovieId, d);
            }
            L('TIMELINE hash=' + String(e.hash).slice(0,8) + ' time=' + Math.round(e.time||0));
        });
        L('ATTACHED Timeline.update');
    }

    // === 3. Резервное сохранение времени через video ===
    if (Lampa.Player && Lampa.Player.listener) {
        Lampa.Player.listener.follow('start', function () {
            try {
                if (Lampa.PlayerVideo && Lampa.PlayerVideo.listener) {
                    Lampa.PlayerVideo.listener.follow('timeupdate', function (e) {
                        if (!lastMovieId || !e || typeof e.current !== 'number' || e.current < 1) return;
                        const d = get(lastMovieId);
                        if (!d) return;
                        d.__time = e.current;
                        const now = Date.now();
                        if (!d.__lastSave || now - d.__lastSave > 5000) {
                            d.__lastSave = now;
                            save(lastMovieId, d);
                            L('VIDEO time=' + Math.round(e.current));
                        }
                    });
                    L('ATTACHED timeupdate');
                }
            } catch(e) { L('attach err '+e.message); }
        });
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'time=' + Math.round(d.__time||0) : 'no'));
            if (!d || !d.url) return;

            let resumeTime = d.__time || 0;
            const hashToUse = lastTimelineHash || d.__timelineHash;
            if (hashToUse && Lampa.Timeline && typeof Lampa.Timeline.view === 'function') {
                try {
                    const v = Lampa.Timeline.view(hashToUse);
                    if (v && v.time > 1) resumeTime = v.time;
                } catch(e) {}
            }
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
                L('BTN using storage reconstruction');
            }

            Lampa.Player.play(playArg);

            if (resumeTime > 1) {
                let tries = 0;
                const timer = setInterval(function () {
                    let v = null;
                    try { v = Lampa.PlayerVideo.video(); } catch(e) {}
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

    attachTimeline();
    L('v18 loaded');
})();
