(function () {
    'use strict';
    if (window.cs_v14) return;
    window.cs_v14 = true;

    const KEY = 'cs_v14_store';
    function L(m) { console.log('CS14 ' + m); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); L('SAVED id='+id); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === Хук Player.play: сохраняем ВСЕ сериализуемые поля аргумента ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v14) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object') {
                    const prim = {};
                    for (const k in arg) {
                        const v = arg[k];
                        if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                            prim[k] = v;
                            const vs = typeof v === 'string' ? v.slice(0, 120) : String(v);
                            L('PLAY.' + k + '=' + vs);
                        }
                    }
                    L('PLAY keys: ' + Object.keys(prim).join(','));

                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie) && prim.url) {
                        const h = String(prim.url).match(/[?&]link=([a-f0-9]+)/i);
                        const i = String(prim.url).match(/[?&]index=(\d+)/i);
                        prim.__hash = h ? h[1] : null;
                        prim.__index = i ? parseInt(i[1]) : 0;
                        save(movie.id, prim);
                    }
                }
            } catch(e) { L('hook err ' + e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v14 = true;
        L('HOOKED Player.play');
    } else {
        L('cannot hook Player.play');
    }

    // === Кнопка «Продолжить» ===
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'yes keys=' + Object.keys(d).join(',') : 'no'));
            if (!d || !d.url) { L('BTN: no url'); return; }

            // Восстанавливаем аргумент как можно ближе к оригиналу
            const playArg = {};
            for (const k in d) {
                if (k !== '__hash' && k !== '__index') playArg[k] = d[k];
            }
            playArg.card = movie;
            playArg.movie = movie;

            L('BTN play url=' + String(d.url).slice(0, 80));
            try { Lampa.Player.play(playArg); }
            catch(ex) { L('play err ' + ex.message); }
        });
    });

    L('v14 loaded');
})();
