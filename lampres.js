(function() {
    'use strict';

    if (window.continue_series_plugin) return;
    window.continue_series_plugin = true;

    const STORAGE_KEY = 'continue_series_data';

    // --- 1. Сохранение контекста при старте торрент-плеера ---
    function setupPlayerListener() {
        Lampa.Player.listener.follow('start', function(data) {
            // Работаем только если это торрент и есть объект movie (карточка)
            if (!data.torrent_hash || !data.movie) return;
            
            const movie = data.movie;
            // Нас интересуют только сериалы
            if (movie.media_type !== 'tv') return;

            const cardId = movie.id; // TMDB ID
            if (!cardId) return;

            // Получаем текущую позицию из Timeline
            // Хэш для Timeline генерируется отдельно, но мы можем сохранить
            // позицию напрямую из плеера после его инициализации.
            // Пока сохраним "заглушку", а позицию обновим позже.
            let savedData = {
                torrent_hash: data.torrent_hash,
                file_index: data.id, // Индекс файла внутри торрента
                position: 0,         // Будет обновлено
                title: movie.name || movie.title
            };

            // Слушаем обновление времени, чтобы сохранять актуальную позицию
            let currentVideo = null;
            function onCanPlay() {
                currentVideo = Lampa.PlayerVideo.video();
                if (currentVideo) {
                    // Если в сохранённых данных уже есть позиция, перематываем
                    if (savedData.position > 0) {
                        currentVideo.currentTime = savedData.position;
                    }
                }
                Lampa.PlayerVideo.listener.remove('canplay', onCanPlay);
            }

            function onTimeUpdate() {
                if (currentVideo && !currentVideo.paused) {
                    savedData.position = currentVideo.currentTime;
                    // Периодически сохраняем в localStorage
                    saveDataForCard(cardId, savedData);
                }
            }

            function onDestroy() {
                // Сохраняем финальную позицию при закрытии
                if (currentVideo) {
                    savedData.position = currentVideo.currentTime;
                    saveDataForCard(cardId, savedData);
                }
                Lampa.PlayerVideo.listener.remove('canplay', onCanPlay);
                Lampa.PlayerVideo.listener.remove('timeupdate', onTimeUpdate);
                Lampa.Player.listener.remove('destroy', onDestroy);
            }

            Lampa.PlayerVideo.listener.follow('canplay', onCanPlay);
            Lampa.PlayerVideo.listener.follow('timeupdate', onTimeUpdate);
            Lampa.Player.listener.follow('destroy', onDestroy);

            // Сразу сохраняем первоначальные данные
            saveDataForCard(cardId, savedData);
        });
    }

    // --- 2. Вспомогательные функции для работы с localStorage ---
    function saveDataForCard(cardId, data) {
        try {
            const allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            allData[cardId] = data;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
        } catch (e) {
            console.error('ContinueSeries: Ошибка сохранения', e);
        }
    }

    function getDataForCard(cardId) {
        try {
            const allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return allData[cardId] || null;
        } catch (e) {
            return null;
        }
    }

    // --- 3. Регистрация пункта в контекстном меню карточки ---
    function setupContextMenu() {
        Lampa.Manifest.plugins = {
            type: 'video',
            onContextMenu: function(card) {
                // Показываем пункт только для сериалов, у которых есть сохранённые данные
                if (card.media_type !== 'tv') return null;
                const saved = getDataForCard(card.id);
                if (!saved) return null;

                return {
                    title: 'Продолжить просмотр',
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="currentColor"/></svg>'
                };
            },
            onContextLauch: function(card) {
                const saved = getDataForCard(card.id);
                if (!saved) return;

                // Прямой запуск торрента по известному хэшу
                // Torrent.open(hash, movie) пропускает этап поиска и выбора раздачи
                Lampa.Torrent.open(saved.torrent_hash, card);
                
                // После открытия торрента нужно выбрать файл по индексу и перемотать.
                // Это можно сделать через слушатель события 'torrent_file' или
                // дождавшись старта плеера, как в пункте 1.
                Lampa.Noty.show('Запуск с позиции ' + formatTime(saved.position));
            }
        };
    }

    // --- 4. Вспомогательная функция форматирования времени ---
    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // --- 5. Инициализация ---
    function init() {
        setupPlayerListener();
        setupContextMenu();
        console.log('ContinueSeries: Плагин загружен');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }
})();
