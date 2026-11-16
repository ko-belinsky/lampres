(function () {
    'use strict';
    if (window.cs_v24) return;
    window.cs_v24 = true;

    const KEY = 'cs_v24_store';
    let lastArg = null;
    let lastMovieId = null;

    function L() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('CS24');
        console.log.apply(console, args);
    }

    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); }
        catch(e) { L('save err', e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Хук Player.play ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v24) {
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
                        // Сохраняем ID карточки и TMDB ID
                        prim.__movieId = movie.id;
                        prim.__tmdbId = movie.tmdb_id || movie.id;
                        prim.__name = movie.original_name || movie.name || movie.title;
                        prim.__time = 0;
                        save(movie.id, prim);
                        L('PLAY saved id=' + movie.id, 'tmdb=' + prim.__tmdbId, 'name=' + prim.__name);
                    }
                }
            } catch(e) { L('hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v24 = true;
        L('HOOKED');
    }

    // === 2. Поиск времени в file_view ===
    function findTimeInFileView(d) {
        try {
            let profileId = '';
            try {
                if (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile) {
                    profileId = Lampa.Account.Permit.account.profile.id;
                }
            } catch(e) {}
            const storeKey = profileId ? 'file_view_' + profileId : 'file_view';
            let store = null;
            try { store = JSON.parse(localStorage.getItem(storeKey)); } catch(e) {}
            if (!store || typeof store !== 'object') { L('store not found', storeKey); return 0; }

            const season = d.season;
            const episode = d.episode;
            const originalName = d.__name || d.first_title || d.title;

            // Формируем возможные card-значения
            const cardCandidates = [];
            if (d.__tmdbId) cardCandidates.push('tv_' + d.__tmdbId);
            if (d.__movieId) cardCandidates.push('tv_' + d.__movieId);
            L('card candidates:', cardCandidates.join(', '));

            // Формируем возможные хэши
            const hashCandidates = [];
            if (Lampa.Utils && typeof Lampa.Utils.hash === 'function') {
                const s = String(season || 1);
                const e = String(episode || 1);
                const name = originalName || '';
                // Как в MyShows: hash("11" + name) для season<10 episode<10
                hashCandidates.push(Lampa.Utils.hash(s + e + name));
                hashCandidates.push(Lampa.Utils.hash([season || 1, (season>10?":":""), episode || 1, name].join("")));
                hashCandidates.push(Lampa.Utils.hash(name));
            }
            L('hash candidates:', hashCandidates.map(h => String(h).slice(0,10)).join(', '));

            // Проходим по всем записям
            for (const k in store) {
                const v = store[k];
                if (!v || typeof v !== 'object') continue;
                if (typeof v.time !== 'number' || v.time < 1) continue;

                // Совпадение по card + season + episode
                for (const cc of cardCandidates) {
                    if (v.card === cc && v.season == season && v.episode == episode) {
                        L('FOUND by card+se+ep, card=' + cc, 'time=' + Math.round(v.time));
                        return v.time;
                    }
                }
                // Совпадение по хэшу
                for (const h of hashCandidates) {
                    if (String(k) === String(h)) {
                        L('FOUND by hash=' + String(h).slice(0,10), 'time=' + Math.round(v.time));
                        return v.time;
                    }
                }
            }
            L('NOT FOUND. store size:', Object.keys(store).length);
        } catch(e) { L('findTime err', e.message); }
        return 0;
    }

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
            L('BTN click id=' + movie.id, 'data=' + (d ? 'yes' : 'no'));
            if (!d || !d.url) return;

            const resumeTime = findTimeInFileView(d);
            L('BTN resumeTime=' + Math.round(resumeTime));

            let playArg;
            if (lastArg && lastArg.card && lastArg.card.id === movie.id) {
                playArg = lastArg; L('using lastArg');
            } else {
                playArg = {};
                for (const k in d) { if (k.indexOf('__') === 0) continue; playArg[k] = d[k]; }
                playArg.card = movie; playArg.movie = movie;
                L('using storage');
            }

            Lampa.Player.play(playArg);

            if (resumeTime > 1) {
                setTimeout(function () {
                    try {
                        if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.to === 'function') {
                            Lampa.PlayerVideo.to(resumeTime);
                            L('PV.to(' + Math.round(resumeTime) + ')');
                        } else if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.rewind === 'function') {
                            Lampa.PlayerVideo.rewind(resumeTime);
                            L('PV.rewind(' + Math.round(resumeTime) + ')');
                        }
                    } catch(e) { L('seek err', e.message); }
                }, 3000);
            }
        });
    });

    L('v24 loaded');
})();
