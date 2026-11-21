(function () {
    'use strict';
    if (window.continue_series_plugin) return;
    window.continue_series_plugin = true;

    const KEY = 'continue_series_data';
    let lastMovieId = null;
    let pendingResume = null;
    let lastFvSnapshot = {};

    function save(id, data) {
        try { 
            const a = JSON.parse(localStorage.getItem(KEY) || '{}'); 
            a[String(id)] = data; 
            localStorage.setItem(KEY, JSON.stringify(a)); 
        } catch(e) {}
    }

    function get(id) {
        try { 
            return JSON.parse(localStorage.getItem(KEY) || '{}')[String(id)] || null; 
        } catch(e) { return null; }
    }

    function isSeries(m) { 
        return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); 
    }

    function currentMovie() { 
        try { 
            const a = Lampa.Activity.active(); 
            return a && (a.movie || a.card || a.card_data); 
        } catch(e) { return null; } 
    }

    function getFvKey() {
        try {
            if (Lampa.Account && Lampa.Account.Permit && Lampa.Account.Permit.account && Lampa.Account.Permit.account.profile) {
                return 'file_view_' + Lampa.Account.Permit.account.profile.id;
            }
        } catch(e) {}
        return 'file_view';
    }

    // 1. Перехват Player.play (сохранение контекста и сброс времени при смене серии)
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_cs) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object' && arg.url) {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        const d = get(movie.id) || {};
                        
                        if (arg.id !== undefined) {
                            d.__lastIndex = arg.id;
                        }
                        for (const k in arg) {
                            const v = arg[k];
                            if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                                d[k] = v;
                            }
                        }
                        if (arg.playlist) {
                            d.__playlist = arg.playlist;
                        }
                        save(movie.id, d);
                        try { lastFvSnapshot = JSON.parse(localStorage.getItem(getFvKey()) || '{}'); } catch(e) { lastFvSnapshot = {}; }
                    }
                }
            } catch(e) {}
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_cs = true;
    }

    // 2. Перехват Player.playlist (сохранение очереди)
    if (Lampa.Player && typeof Lampa.Player.playlist === 'function' && !Lampa.Player.__hooked_cs_pl) {
        const origPl = Lampa.Player.playlist;
        Lampa.Player.playlist = function () {
            const args = [].slice.call(arguments);
            let result;
            try { result = origPl.apply(this, args); } catch(e) { return; }
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
                } catch(e) {}
            }
            return result;
        };
        Lampa.Player.__hooked_cs_pl = true;
    }

    // 3. Отслеживание прогресса (берем активную серию из плейлиста)
    setInterval(function () {
        if (!lastMovieId) return;
        try {
            const d = get(lastMovieId);
            if (!d) return;

            let activeIndex = null;
            
            // Способ 1: Ищем активную серию в плейлисте Lampa
            try {
                if (Lampa.Player && typeof Lampa.Player.playlist === 'function') {
                    const pl = Lampa.Player.playlist();
                    if (Array.isArray(pl)) {
                        const activeItem = pl.find(i => i.selected);
                        if (activeItem) {
                            activeIndex = activeItem.id !== undefined ? activeItem.id : (activeItem.file_index !== undefined ? activeItem.file_index : activeItem.index);
                        }
                    }
                }
            } catch(e) {}

            // Способ 2: Парсим URL видео (для встроенного плеера)
            if (activeIndex === null) {
                let v = null;
                try { v = Lampa.PlayerVideo.video(); } catch(e) {}
                if (!v) v = document.querySelector('video');
                if (v && v.src) {
                    const m = String(v.src).match(/[?&]index=(\d+)/i);
                    if (m) activeIndex = parseInt(m[1]);
                }
            }

            if (activeIndex === null) return;

            const store = JSON.parse(localStorage.getItem(getFvKey()) || '{}');
            for (const hash in store) {
                const v = store[hash];
                if (!v || !v.time) continue;
                const prev = lastFvSnapshot[hash];
                const prevTime = prev ? (prev.time || 0) : -1;
                
                if (Math.abs(prevTime - v.time) > 1) {
                    if (!d.__episodes) d.__episodes = {};
                    d.__episodes[activeIndex] = { time: v.time, duration: v.duration, hash: hash };
                    d.__lastIndex = activeIndex;
                    d.__lastTime = v.time;
                    d.__lastHash = hash;
                    d.__lastDuration = v.duration;
                    save(lastMovieId, d);
                }
            }
            lastFvSnapshot = store;
        } catch(e) {}
    }, 2000);

    // 4. Перехват Timeline.view для перемотки
    if (Lampa.Timeline && typeof Lampa.Timeline.view === 'function' && !Lampa.Timeline.__hooked_cs) {
        const origView = Lampa.Timeline.view;
        Lampa.Timeline.view = function (hash) {
            let result;
            try { result = origView.apply(this, arguments); } catch(e) { result = null; }
            
            if (pendingResume && pendingResume.time > 1) {
                return { 
                    time: pendingResume.time, 
                    duration: pendingResume.duration || (pendingResume.time + 3000), 
                    percent: 0 
                };
            }
            return result;
        };
        Lampa.Timeline.__hooked_cs = true;
    }

    // 5. Поиск правильной серии в плейлисте
    function findPlaylistIndex(playlist, d) {
        if (!playlist || !d) return -1;
        
        // Приоритет: серия, которую смотрели последней (__lastIndex)
        if (d.__lastIndex !== undefined && d.__lastIndex !== null) {
            for (let i = 0; i < playlist.length; i++) {
                const it = playlist[i];
                if (!it) continue;
                if (it.id === d.__lastIndex || it.file_index === d.__lastIndex || it.index === d.__lastIndex) return i;
            }
        }
        // Fallback: по пути или url
        for (let i = 0; i < playlist.length; i++) {
            const it = playlist[i];
            if (!it) continue;
            if (d.path && it.path && d.path === it.path) return i;
            if (d.url && it.url && d.url === it.url) return i;
        }
        return -1;
    }

    // 6. Вычисление времени для продолжения
    function computeResumeData(d) {
        if (!d) return null;
        
        // Берем время конкретной серии
        if (d.__episodes && d.__lastIndex !== null && d.__lastIndex !== undefined) {
            const ep = d.__episodes[d.__lastIndex];
            if (ep && ep.time > 1) {
                return { index: d.__lastIndex, time: ep.time, hash: ep.hash || '0', duration: ep.duration || 0 };
            }
        }
        // Fallback на последнее известное
        if (d.__lastTime > 1) {
            return { index: d.__lastIndex, time: d.__lastTime, hash: d.__lastHash || '0', duration: d.__lastDuration || 0 };
        }
        return null;
    }

    // 7. Отрисовка кнопки
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        
        const movie = e.data.movie;
        if (!isSeries(movie)) return;

        $('.button--continue-series').remove();

        const d = get(movie.id);
        const resume = computeResumeData(d);
        
        // Показываем кнопку только если есть сохраненный прогресс
        if (!resume) return;

        $('.full-start-new__buttons').append(
            '<div class="full-start__button selector button--continue-series">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<span>Продолжить</span></div>'
        );

        $('.button--continue-series').on('hover:enter', function () {
            pendingResume = { movieId: movie.id, time: resume.time, duration: resume.duration };
            setTimeout(function () {
                if (pendingResume && pendingResume.movieId === movie.id) {
                    pendingResume = null;
                }
            }, 20000);

            const playArg = {};
            for (const k in d) { 
                if (k.indexOf('__') === 0) continue; 
                playArg[k] = d[k]; 
            }
            playArg.card = movie;
            playArg.movie = movie;

            // Восстановление плейлиста
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

            playArg.timeline = { 
                hash: resume.hash, 
                time: resume.time, 
                duration: resume.duration 
            };

            Lampa.Player.play(playArg);

            // Принудительная перемотка для встроенного плеера
            let tries = 0;
            const timer = setInterval(function () {
                let v = null;
                try { v = Lampa.PlayerVideo.video(); } catch(e) {}
                if (!v) { try { v = document.querySelector('video'); } catch(e) {} }
                
                if (v && v.readyState >= 1 && v.duration > 0) {
                    if (Math.abs(v.currentTime - resume.time) > 3) {
                        v.currentTime = resume.time;
                    }
                    clearInterval(timer);
                } else if (++tries > 40) {
                    clearInterval(timer);
                }
            }, 500);
        });
    });
})();
