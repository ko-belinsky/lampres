(function () {
    'use strict';

    const KEY = 'store';
    let lastMovieId = null;
    let pendingResume = null;
    let overrideUsed = false;
    let lastFvSnapshot = {};

    function save(id, data) {
        try {
            const a = JSON.parse(localStorage.getItem(KEY) || '{}');
            a[String(id)] = data;
            localStorage.setItem(KEY, JSON.stringify(a));
        } catch (e) {}
    }

    function get(id) {
        try {
            return JSON.parse(localStorage.getItem(KEY) || '{}')[String(id)] || null;
        } catch (e) {
            return null;
        }
    }

    function isSeries(m) {
        return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title));
    }

    function currentMovie() {
        try {
            const a = Lampa.Activity.active();
            return a && (a.movie || a.card || a.card_data);
        } catch (e) {
            return null;
        }
    }

    function getFvKey() {
        try {
            if (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile) {
                return 'file_view_' + Lampa.Account.Permit.account.profile.id;
            }
        } catch (e) {}
        return 'file_view';
    }

    // Перехват Player.play
    if (Lampa.Player && typeof Lampa.Player.play === 'function') {
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
                        try { lastFvSnapshot = JSON.parse(localStorage.getItem(getFvKey()) || '{}'); } catch (e) { lastFvSnapshot = {}; }
                    }
                }
            } catch (e) {}
            return orig.apply(this, arguments);
        };
    }

    // Перехват Player.playlist (сохранение плейлиста при ручном запуске)
    if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
        const origPl = Lampa.Player.playlist;
        Lampa.Player.playlist = function () {
            const args = [].slice.call(arguments);
            let result;
            try { result = origPl.apply(this, args); }
            catch (e) { return; }

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
                } catch (e) {}
            }
            return result;
        };
    }

    // Опрос file_view
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
                }
            }
            lastFvSnapshot = store;
        } catch (e) {}
    }, 2000);

    // Перехват Timeline.view
    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function') {
        const origView = Lampa.Timeline.view;
        Lampa.Timeline.view = function (hash) {
            let result;
            try { result = origView.apply(this, arguments); } catch (e) { result = null; }
            if (pendingResume && pendingResume.time > 1) {
                overrideUsed = true;
                return { time: pendingResume.time, duration: pendingResume.duration || (pendingResume.time + 3000), percent: 0 };
            }
            return result;
        };
    }

    // Поиск индекса серии в плейлисте
    function findPlaylistIndex(playlist, d) {
        if (!playlist || !d) return -1;
        for (let i = 0; i < playlist.length; i++) {
            const it = playlist[i];
            if (!it) continue;
            if (d.path && it.path && d.path === it.path) return i;
            if (d.url && it.url && d.url === it.url) return i;
            if (d.id !== undefined && d.id !== null) {
                if (it.id === d.id || it.file_index === d.id || it.index === d.id) return i;
            }
        }
        return -1;
    }

    // === Блок кнопки «Продолжить» ===

    let cardObserver = null;

    function stopWatching() {
        if (cardObserver) { cardObserver.disconnect(); cardObserver = null; }
    }

    // Ищем родную кнопку «Источник» по её подписи — это работает
    // одинаково на любой версии, потому что интерфейс везде один
    function findSourceButton($container) {
        if (!$container || !$container.length) return null;
        const items = $container[0].children;
        for (let i = 0; i < items.length; i++) {
            const el = items[i];
            if (el.classList.contains('button--continue-series')) continue;
            const text = (el.textContent || '').trim().toLowerCase();
            if (text.indexOf('источник') !== -1 || text.indexOf('плеер') !== -1) return el;
        }
        return null;
    }

    // Ставим кнопку сразу после «Источник»
    function placeButton($btn, $container) {
        if (!document.body.contains($btn[0])) return;
        const sourceEl = findSourceButton($container);
        if (!sourceEl) return;
        if (sourceEl.nextElementSibling !== $btn[0]) {
            sourceEl.after($btn[0]);
        }
    }

    // Кнопка «Продолжить»
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite') {
            if (e.type === 'destroy') stopWatching();
            return;
        }
        if (!e.data || !e.data.movie || !e.object) return;
        const movie = e.data.movie;
        if (!isSeries(movie)) return;

        // Работаем строго внутри текущей карточки, а не по всей странице
        let root;
        try { root = e.object.activity.render(); } catch (err) { return; }
        const $container = root.find('.full-start-new__buttons').length
            ? root.find('.full-start-new__buttons')
            : root.find('.full-start__buttons');
        if (!$container.length) return;

        stopWatching();
        root.find('.button--continue-series').remove();

        // Показываем кнопку только если в плагине есть сохранённый прогресс
        const saved = get(movie.id);
        if (!saved || !saved.url) return;

        const $btn = $(
            '<div class="full-start__button selector button--continue-series">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<span>Продолжить</span></div>'
        );

        $btn.on('hover:enter', function () {
            const d = get(movie.id);
            if (!d || !d.url) return;

            const resumeTime = d.__time || 0;
            overrideUsed = false;
            if (resumeTime > 1) {
                pendingResume = { movieId: movie.id, time: resumeTime, duration: d.__duration };
                setTimeout(function () {
                    if (pendingResume && pendingResume.movieId === movie.id) {
                        pendingResume = null;
                    }
                }, 20000);
            }

            const playArg = {};
            for (const k in d) { if (k.indexOf('__') === 0) continue; playArg[k] = d[k]; }
            playArg.card = movie;
            playArg.movie = movie;

            if (d.__playlist && d.__playlist.length > 0) {
                const idx = findPlaylistIndex(d.__playlist, d);
                const startIdx = idx >= 0 ? idx : 0;
                for (let i = 0; i < d.__playlist.length; i++) {
                    d.__playlist[i].selected = (i === startIdx);
                }
                Object.assign(playArg, d.__playlist[startIdx]);
                playArg.card = movie;
                playArg.movie = movie;
                playArg.playlist = d.__playlist;
            }

            Lampa.Player.play(playArg);

            // Резервная перемотка
            if (resumeTime > 1) {
                setTimeout(function () {
                    if (overrideUsed) return;
                    try {
                        if (Lampa.PlayerVideo && typeof Lampa.PlayerVideo.to === 'function') {
                            Lampa.PlayerVideo.to(resumeTime);
                        }
                    } catch (err) {}
                }, 5000);
            }
        });

        // Сначала просто добавляем в ряд, а как только «Источник» рядом — встаём после него
        $container.append($btn);
        placeButton($btn, $container);

        // Если «Источник» отрисуется позже или ряд перестроится — сразу переезжаем
        if ('MutationObserver' in window) {
            cardObserver = new MutationObserver(function () {
                placeButton($btn, $container);
            });
            cardObserver.observe($container[0], { childList: true });
        }
    });
})();
