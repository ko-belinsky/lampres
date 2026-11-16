(function () {
    'use strict';
    if (window.cs_v27) return;
    window.cs_v27 = true;

    const KEY = 'cs_v27_store';
    let lastMovieId = null;
    let pendingResume = null;
    let overrideUsed = false;
    let lastFvSnapshot = {};

    function L() { console.log.apply(console, ['CS27'].concat([].slice.call(arguments))); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); } catch(e) {}
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

    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v27) {
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
                        prim.__timelineHash = ex.__timelineHash || null;
                        save(movie.id, prim);
                        try { lastFvSnapshot = JSON.parse(localStorage.getItem(getFvKey()) || '{}'); } catch(e) { lastFvSnapshot = {}; }
                        L('PLAY id=' + movie.id);
                    }
                }
            } catch(e) { L('hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v27 = true;
        L('HOOKED Player.play');
    }

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
                    if (!best || v.time > (best.time || 0)) {
                        best = { hash, time: v.time, duration: v.duration };
                    }
                }
            }
            if (best) {
                const d = get(lastMovieId);
                if (d) {
                    d.__timelineHash = best.hash;
                    d.__time = best.time;
                    d.__duration = best.duration || d.__duration || 0;
                    save(lastMovieId, d);
                    L('FV hash=' + best.hash.slice(0,10) + ' time=' + Math.round(best.time));
                }
            }
            lastFvSnapshot = store;
        } catch(e) {}
    }, 2000);

    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function' && !Lampa.Timeline.__hooked_v27_view) {
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
        Lampa.Timeline.__hooked_v27_view = true;
        L('HOOKED Timeline.view');
    }

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
            L('BTN id=' + movie.id + ' time=' + (d ? Math.round(d.__time||0) : 'no'));
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

            const playArg = {};
            for (const k in d) { if (k.indexOf('__') === 0) continue; playArg[k] = d[k]; }
            playArg.card = movie;
            playArg.movie = movie;
            Lampa.Player.play(playArg);

            if (resumeTime > 1) {
                setTimeout(function () {
                    if (overrideUsed) { L('skip PV.to (override worked)'); return; }
                    try {
                        if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.to === 'function') {
                            L('PV.to(' + Math.round(resumeTime) + ') fallback');
                            Lampa.PlayerVideo.to(resumeTime);
                        }
                    } catch(e) { L('PV.to err', e.message); }
                }, 5000);
            }
        });
    });

    L('v27 loaded');
})();
