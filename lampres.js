(function () {
    'use strict';
    if (window.cs_v22) return;
    window.cs_v22 = true;

    const KEY = 'cs_v22_store';
    let lastArg = null;
    let lastMovieId = null;

    // Отдельная группа в консоли Lampa
    function L() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('CS22');
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
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v22) {
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
                        prim.__movieId = movie.id;
                        prim.__time = 0;
                        save(movie.id, prim);
                        L('PLAY saved id=' + movie.id);
                    }
                }
            } catch(e) { L('hook err', e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v22 = true;
        L('HOOKED');
    }

    // === 2. Поиск времени напрямую в localStorage ===
    function findTimeInLocalStorage(movieId, torrentHash, filePath) {
        const candidates = [];
        // Собираем все ключи localStorage, которые могут содержать таймкоды
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k.indexOf('file_view') === 0 ||
                k.indexOf('timecode') === 0 ||
                k.indexOf('timeline') === 0 ||
                k.indexOf('view') === 0) {
                try {
                    const raw = localStorage.getItem(k);
                    const obj = JSON.parse(raw);
                    if (obj && typeof obj === 'object') {
                        candidates.push({ key: k, data: obj });
                    }
                } catch(e) {}
            }
        }

        L('found storage keys:', candidates.map(c => c.key + '(' + Object.keys(c.data).length + ')').join(', '));

        for (const store of candidates) {
            for (const id in store.data) {
                const v = store.data[id];
                if (!v || typeof v !== 'object') continue;

                // Совпадение по ID карточки
                if (v.card_id == movieId || v.movie_id == movieId || v.tmdb_id == movieId) {
                    if (v.time > 1) { L('FOUND by card_id in', store.key, 'time', Math.round(v.time)); return v.time; }
                }
                // Совпадение по хэшу торрента
                if (torrentHash && (String(id).indexOf(torrentHash) >= 0 || (v.hash && String(v.hash).indexOf(torrentHash) >= 0))) {
                    if (v.time > 1) { L('FOUND by hash in', store.key, 'time', Math.round(v.time)); return v.time; }
                }
                // Совпадение по пути файла
                if (filePath && (v.path == filePath || String(id).indexOf(filePath) >= 0)) {
                    if (v.time > 1) { L('FOUND by path in', store.key, 'time', Math.round(v.time)); return v.time; }
                }
            }
        }
        L('NOT FOUND in localStorage');
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

            const resumeTime = findTimeInLocalStorage(movie.id, d.torrent_hash, d.path);
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
                        } else {
                            L('no to/rewind methods');
                        }
                    } catch(e) { L('seek err', e.message); }
                }, 3000);
            }
        });
    });

    L('v22 loaded');
})();
