(function () {
    'use strict';
    if (window.cs_v23) return;
    window.cs_v23 = true;

    const KEY = 'cs_v23_store';
    let lastArg = null;
    let lastMovieId = null;

    // Отдельная группа в консоли Lampa
    function L() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('CS23');
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
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v23) {
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
        Lampa.Player.__hooked_v23 = true;
        L('HOOKED');
    }

    // === 2. Поиск времени в file_view с диагностикой ===
    function findTimeInFileView(movieId, arg) {
        try {
            // Находим профиль
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

            const keys = Object.keys(store);
            L('file_view keys:', keys.slice(0, 20).join(', '));
            // Выводим структуру первой записи для примера
            if (keys.length > 0) {
                const sampleKey = keys[0];
                L('sample record key:', sampleKey);
                L('sample record value:', JSON.stringify(store[sampleKey]).slice(0, 200));
            }

            // Пробуем вычислить хэш по разным формулам
            const originalName = arg.first_title || arg.title || (arg.card && (arg.card.original_name || arg.card.name));
            const season = arg.season;
            const episode = arg.episode;
            const candidates = [];

            if (Lampa.Utils && typeof Lampa.Utils.hash === 'function') {
                if (season !== undefined && episode !== undefined && originalName) {
                    candidates.push(Lampa.Utils.hash([season, episode, originalName]));
                    candidates.push(Lampa.Utils.hash([1, episode, originalName])); // как в watched()
                    candidates.push(Lampa.Utils.hash(season + ':' + episode + ':' + originalName));
                    candidates.push(Lampa.Utils.hash(season + ':' + episode));
                }
                if (arg.path) candidates.push(Lampa.Utils.hash(arg.path));
                if (arg.url) candidates.push(Lampa.Utils.hash(arg.url));
            }

            L('candidate hashes:', candidates.map(h => String(h).slice(0,8)).join(', '));

            // Сравниваем с ключами
            for (const h of candidates) {
                if (store[h] && store[h].time > 1) {
                    L('FOUND by hash', String(h).slice(0,8), 'time', Math.round(store[h].time));
                    return store[h].time;
                }
            }

            // Если хэши не совпали, пробуем найти по времени (если в записи есть привязка к сезону/эпизоду)
            // Но в file_view только хэши, поэтому просто выводим все записи для анализа
            L('no hash match, dumping all records:');
            keys.forEach(k => {
                const v = store[k];
                if (v && v.time > 1) {
                    L('  record', k.slice(0,8), 'time=', Math.round(v.time), 'percent=', v.percent);
                }
            });

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

            // Передаём сохранённый аргумент для поиска
            const resumeTime = findTimeInFileView(movie.id, d);
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

    L('v23 loaded');
})();
