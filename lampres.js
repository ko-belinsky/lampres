(function () {
    'use strict';
    if (window.cs_v25) return;
    window.cs_v25 = true;

    const KEY = 'cs_v25_store';
    let lastMovieId = null;
    let pendingResume = null;

    function L() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('CS25');
        console.log.apply(console, args);
    }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); } catch(e) {}
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Hook Player.play — запоминаем текущий movie.id ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v25) {
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
                        prim.__card_id = ex.__card_id || null;
                        save(movie.id, prim);
                        L('PLAY saved id=' + movie.id);
                    }
                }
            } catch(e) { L('hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v25 = true;
        L('HOOKED Player.play');
    }

    // === 2. Hook Timeline.update — Lampa сама даёт нам card_id и time ===
    if (Lampa.Timeline && typeof Lampa.Timeline.update === 'function' && !Lampa.Timeline.__hooked_v25_update) {
        const origUpdate = Lampa.Timeline.update;
        Lampa.Timeline.update = function () {
            try {
                const args = Array.prototype.slice.call(arguments);
                const hash = args[0];
                let time = 0, duration = 0;
                if (typeof args[1] === 'number') time = args[1];
                if (typeof args[2] === 'number') duration = args[2];
                if (args[1] && typeof args[1] === 'object') {
                    time = args[1].time || 0;
                    duration = args[1].duration || 0;
                }
                if (hash && time > 1 && lastMovieId) {
                    const d = get(lastMovieId);
                    if (d) {
                        d.__time = time;
                        d.__duration = duration || d.__duration || 0;
                        d.__card_id = hash;
                        save(lastMovieId, d);
                        L('TU saved hash=' + String(hash).slice(0,8) + ' time=' + Math.round(time));
                    }
                }
            } catch(e) { L('tu err', e.message); }
            return origUpdate.apply(this, arguments);
        };
        Lampa.Timeline.__hooked_v25_update = true;
        L('HOOKED Timeline.update');
    }

    // === 3. Hook Timeline.view — подсовываем сохранённое время ===
    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function' && !Lampa.Timeline.__hooked_v25_view) {
        const origView = Lampa.Timeline.view;
        Lampa.Timeline.view = function (hash) {
            let result;
            try { result = origView.apply(this, arguments); } catch(e) { result = null; }
            L('TV hash=' + String(hash||'').slice(0,16) + ' -> ' + (result ? Math.round(result.time||0)+'s' : 'null'));

            if (pendingResume && pendingResume.movieId) {
                L('TV OVERRIDE -> ' + Math.round(pendingResume.time) + 's');
                return {
                    time: pendingResume.time,
                    duration: pendingResume.duration || (result && result.duration) || pendingResume.time + 3000,
                    percent: 0
                };
            }
            return result;
        };
        Lampa.Timeline.__hooked_v25_view = true;
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
            L('BTN click id=' + movie.id, 'data=' + (d ? 'time=' + Math.round(d.__time||0) : 'no'));
            if (!d || !d.url) return;

            const resumeTime = d.__time || 0;
            L('BTN resumeTime=' + Math.round(resumeTime));

            if (resumeTime > 1) {
                pendingResume = { movieId: movie.id, time: resumeTime, duration: d.__duration };
                L('BTN pendingResume SET');
                setTimeout(function () {
                    if (pendingResume && pendingResume.movieId === movie.id) {
                        pendingResume = null;
                        L('BTN pendingResume cleared');
                    }
                }, 15000);
            }

            const playArg = {};
            for (const k in d) { if (k.indexOf('__') === 0) continue; playArg[k] = d[k]; }
            playArg.card = movie;
            playArg.movie = movie;

            L('BTN play');
            Lampa.Player.play(playArg);
        });
    });

    L('v25 loaded');
})();
