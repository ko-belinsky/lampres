(function () {
    'use strict';
    if (window.cs_v21) return;
    window.cs_v21 = true;

    const KEY = 'cs_v21_store';
    let lastArg = null;
    let lastMovieId = null;

    function L(m) { console.log('CS21 ' + m); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Хук Player.play: сохраняем ВСЕ поля + movieId ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v21) {
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
            } catch(e) { L('hook err '+e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v21 = true;
        L('HOOKED');
    }

    // === 2. Функция поиска времени в хранилище timecodes ===
    function findTimeInStorage(movieId, torrentHash, indexPath) {
        try {
            // Пробуем разные ключи хранилища, где Lampa может держать таймкоды
            const keys = ['timecodes', 'file_view', 'timeline'];
            for (const storeKey of keys) {
                let store = null;
                try { store = Lampa.Storage.get(storeKey); } catch(e) {}
                if (!store || typeof store !== 'object') continue;

                L('check store "' + storeKey + '" items=' + Object.keys(store).length);

                // Перебираем все записи
                for (const k in store) {
                    const v = store[k];
                    if (!v || typeof v !== 'object') continue;

                    // Совпадение по ID карточки
                    if (v.card_id == movieId || v.movie_id == movieId || v.tmdb_id == movieId) {
                        if (v.time > 1) {
                            L('FOUND by card_id in ' + storeKey + ' time=' + Math.round(v.time));
                            return v.time;
                        }
                    }
                    // Совпадение по хэшу торрента (ключ или поле)
                    if (torrentHash && (String(k).indexOf(torrentHash) >= 0 || (v.hash && String(v.hash).indexOf(torrentHash) >= 0))) {
                        if (v.time > 1) {
                            L('FOUND by torrent_hash in ' + storeKey + ' time=' + Math.round(v.time));
                            return v.time;
                        }
                    }
                    // Совпадение по пути файла
                    if (indexPath && (v.path == indexPath || String(k).indexOf(indexPath) >= 0)) {
                        if (v.time > 1) {
                            L('FOUND by path in ' + storeKey + ' time=' + Math.round(v.time));
                            return v.time;
                        }
                    }
                }
            }
        } catch(e) { L('findTime err '+e.message); }
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'yes' : 'no'));
            if (!d || !d.url) return;

            // Ищем время в хранилище Lampa
            const resumeTime = findTimeInStorage(movie.id, d.torrent_hash, d.path);
            L('BTN resumeTime=' + Math.round(resumeTime));

            // Восстанавливаем аргумент запуска
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

            // Перематываем родным API Lampa
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
                            L('no to/rewind');
                        }
                    } catch(e) { L('seek err '+e.message); }
                }, 3000);
            }
        });
    });

    L('v21 loaded');
})();(function () {
    'use strict';
    if (window.cs_v20) return;
    window.cs_v20 = true;

    const KEY = 'cs_v20_store';
    let lastArg = null;
    let lastMovieId = null;
    let diagDone = false;
    let lastSaveAt = 0;

    function L(m) { console.log('CS20 ' + m); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Хук Player.play ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v20) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object' && arg.url) {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        lastArg = arg;
                        diagDone = false;
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
        Lampa.Player.__hooked_v20 = true;
        L('HOOKED');
    }

    // === 2. Опрос видео — с ОДНОКРАТНОЙ диагностикой ===
    setInterval(function () {
        if (!lastMovieId) return;
        try {
            let v = null;
            try { v = Lampa.PlayerVideo.video(); } catch(e){}
            if (!v) { try { v = document.querySelector('video'); } catch(e){} }

            if (!diagDone) {
                diagDone = true;
                try {
                    const videos = document.querySelectorAll('video');
                    L('DIAG pvvideo=' + (v ? 'yes' : 'null') +
                      ' videos=' + videos.length +
                      ' ct=' + (v && typeof v.currentTime === 'number' ? v.currentTime.toFixed(1) : 'na') +
                      ' pvkeys=' + (v ? Object.keys(v).slice(0,5).join(',') : ''));
                } catch(e) { L('diag err '+e.message); }
            }

            if (v && typeof v.currentTime === 'number' && v.currentTime > 1) {
                const now = Date.now();
                if (now - lastSaveAt > 3000) {
                    lastSaveAt = now;
                    const d = get(lastMovieId);
                    if (d) {
                        d.__time = v.currentTime;
                        save(lastMovieId, d);
                        L('SAVE time=' + Math.round(v.currentTime));
                    }
                }
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
            L('BTN click id=' + movie.id + ' time=' + (d ? Math.round(d.__time||0) : 'no'));
            if (!d || !d.url) return;
            const resumeTime = d.__time || 0;

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
                // Через 3с перематываем РОДНЫМ API Lampa
                setTimeout(function () {
                    try {
                        if (Lampa.PlayerVideo) {
                            if (typeof Lampa.PlayerVideo.to === 'function') {
                                Lampa.PlayerVideo.to(resumeTime);
                                L('PV.to(' + Math.round(resumeTime) + ')');
                            } else if (typeof Lampa.PlayerVideo.rewind === 'function') {
                                Lampa.PlayerVideo.rewind(resumeTime);
                                L('PV.rewind(' + Math.round(resumeTime) + ')');
                            } else {
                                L('no to/rewind methods');
                            }
                        }
                    } catch(e) { L('seek err '+e.message); }
                }, 3000);
            }
        });
    });

    L('v20 loaded');
})();
