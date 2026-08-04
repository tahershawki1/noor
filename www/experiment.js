(function () {
  'use strict';

  var DATA_DIR = 'mushaf-data/f_sora_o/';
  var META_URL = 'data/quran-meta.json';
  var EASTERN_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  var state = {
    meta: null,
    totalAyat: 0,
    surahCache: {},
    mode: 'scroll',
    page: 1
  };

  var els = {
    scrollView: document.getElementById('scrollView'),
    pagesView: document.getElementById('pagesView'),
    pageContent: document.getElementById('pageContent'),
    pageNum: document.getElementById('pageNum'),
    pageTotal: document.getElementById('pageTotal'),
    modeScroll: document.getElementById('modeScroll'),
    modePages: document.getElementById('modePages'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage')
  };

  function toEasternDigits(n) {
    return String(n).split('').map(function (ch) {
      return /[0-9]/.test(ch) ? EASTERN_DIGITS[+ch] : ch;
    }).join('');
  }

  function fetchText(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('تعذر تحميل ' + url);
      return res.text();
    });
  }

  function fetchJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('تعذر تحميل ' + url);
      return res.json();
    });
  }

  // يفصل ملف السورة الخام (اسم&بسملة\nآية # آية # ...) بدون تعديل محتواه
  function parseSurah(raw) {
    raw = raw.replace(/^﻿/, '');
    var ampIdx = raw.indexOf('&');
    var name = raw.slice(0, ampIdx).trim();
    var rest = raw.slice(ampIdx + 1);
    var nlIdx = rest.indexOf('\n');
    var bismillah = null;
    var ayatText;

    if (nlIdx !== -1 && rest.slice(0, nlIdx).indexOf('#') === -1) {
      bismillah = rest.slice(0, nlIdx).trim();
      ayatText = rest.slice(nlIdx + 1);
    } else {
      ayatText = rest;
    }

    var ayat = ayatText.replace(/\n/g, ' ').split('#')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    return { name: name, bismillah: bismillah, ayat: ayat };
  }

  function loadSurah(number) {
    if (state.surahCache[number]) return Promise.resolve(state.surahCache[number]);
    return fetchText(DATA_DIR + number).then(function (raw) {
      var parsed = parseSurah(raw);
      state.surahCache[number] = parsed;
      return parsed;
    });
  }

  function ayahEndMark(numberInSurah) {
    var span = document.createElement('span');
    span.className = 'ayah-end';
    span.textContent = toEasternDigits(numberInSurah);
    return span;
  }

  function buildSurahBanner(surahMeta, uthmaniName) {
    var wrap = document.createElement('div');
    wrap.className = 'surah-banner';

    var nameEl = document.createElement('div');
    nameEl.className = 'surah-name-uth';
    nameEl.textContent = 'سورة ' + uthmaniName;
    wrap.appendChild(nameEl);

    var meta = document.createElement('div');
    meta.className = 'surah-meta';
    meta.textContent = surahMeta.type + ' • ' + toEasternDigits(surahMeta.ayahs) + ' آية';
    wrap.appendChild(meta);

    return wrap;
  }

  function buildBismillah(text) {
    var p = document.createElement('p');
    p.className = 'bismillah';
    p.textContent = text;
    return p;
  }

  function appendAyatFlow(container, ayat, fromIndex, toIndex) {
    var p = document.createElement('p');
    p.className = 'ayat-flow';
    for (var i = fromIndex; i <= toIndex; i++) {
      p.appendChild(document.createTextNode(ayat[i] + ' '));
      p.appendChild(ayahEndMark(i + 1));
      p.appendChild(document.createTextNode(' '));
    }
    container.appendChild(p);
  }

  // ===== شكل ١: مصحف متصل =====

  function buildScrollView() {
    var surahs = state.meta.surahs;
    return Promise.all(surahs.map(function (s) { return loadSurah(s.n); }))
      .then(function (parsedList) {
        var frag = document.createDocumentFragment();
        surahs.forEach(function (s, idx) {
          var parsed = parsedList[idx];
          var section = document.createElement('section');
          section.className = 'surah-block';
          section.id = 'surah-' + s.n;
          section.appendChild(buildSurahBanner(s, parsed.name));
          if (parsed.bismillah) section.appendChild(buildBismillah(parsed.bismillah));
          appendAyatFlow(section, parsed.ayat, 0, parsed.ayat.length - 1);
          frag.appendChild(section);
        });
        els.scrollView.innerHTML = '';
        els.scrollView.appendChild(frag);
      })
      .catch(function (err) {
        els.scrollView.innerHTML = '<div class="loading">تعذر تحميل المصحف: ' + err.message + '</div>';
      });
  }

  // ===== شكل ٢: تقليب صفحات =====

  function locateGlobalAyah(globalId) {
    var surahs = state.meta.surahs;
    for (var i = surahs.length - 1; i >= 0; i--) {
      if (surahs[i].first <= globalId) {
        return { surah: surahs[i], ayahInSurah: globalId - surahs[i].first + 1 };
      }
    }
    return null;
  }

  // يحدد أي سور/آيات تقع داخل رقم الصفحة المطلوب اعتمادًا على pageStarts الحقيقية
  function pageSegments(pageNum) {
    var starts = state.meta.pageStarts;
    var startGlobal = starts[pageNum - 1];
    var endGlobal = pageNum < starts.length ? starts[pageNum] - 1 : state.totalAyat;
    var segments = [];
    var cursor = startGlobal;

    while (cursor <= endGlobal) {
      var loc = locateGlobalAyah(cursor);
      var surah = loc.surah;
      var surahEndGlobal = surah.first + surah.ayahs - 1;
      var segEndGlobal = Math.min(endGlobal, surahEndGlobal);
      segments.push({
        surah: surah,
        fromAyah: loc.ayahInSurah,
        toAyah: segEndGlobal - surah.first + 1
      });
      cursor = segEndGlobal + 1;
    }

    return segments;
  }

  function renderPage(pageNum) {
    var segments = pageSegments(pageNum);
    els.pageContent.innerHTML = '<div class="loading">جارٍ التحميل…</div>';

    return Promise.all(segments.map(function (seg) { return loadSurah(seg.surah.n); }))
      .then(function (parsedList) {
        var frag = document.createDocumentFragment();
        segments.forEach(function (seg, idx) {
          var parsed = parsedList[idx];
          if (seg.fromAyah === 1) {
            frag.appendChild(buildSurahBanner(seg.surah, parsed.name));
            if (parsed.bismillah) frag.appendChild(buildBismillah(parsed.bismillah));
          }
          appendAyatFlow(frag, parsed.ayat, seg.fromAyah - 1, seg.toAyah - 1);
        });
        els.pageContent.innerHTML = '';
        els.pageContent.appendChild(frag);
        els.pageContent.scrollTop = 0;
        els.pageNum.textContent = toEasternDigits(pageNum);
        els.prevPage.disabled = pageNum <= 1;
        els.nextPage.disabled = pageNum >= state.meta.pageStarts.length;
      })
      .catch(function (err) {
        els.pageContent.innerHTML = '<div class="loading">تعذر تحميل الصفحة: ' + err.message + '</div>';
      });
  }

  function goToPage(pageNum) {
    var total = state.meta.pageStarts.length;
    pageNum = Math.max(1, Math.min(total, pageNum));
    if (pageNum === state.page && els.pageContent.children.length) return;
    state.page = pageNum;
    renderPage(pageNum);
  }

  // ===== التبديل بين الشكلين =====

  function setMode(mode) {
    state.mode = mode;
    var isScroll = mode === 'scroll';
    els.scrollView.hidden = !isScroll;
    els.pagesView.hidden = isScroll;
    els.modeScroll.classList.toggle('is-active', isScroll);
    els.modeScroll.setAttribute('aria-selected', String(isScroll));
    els.modePages.classList.toggle('is-active', !isScroll);
    els.modePages.setAttribute('aria-selected', String(!isScroll));

    if (!isScroll && !els.pageContent.dataset.loaded) {
      els.pageContent.dataset.loaded = '1';
      renderPage(state.page);
    }
  }

  els.modeScroll.addEventListener('click', function () { setMode('scroll'); });
  els.modePages.addEventListener('click', function () { setMode('pages'); });
  els.prevPage.addEventListener('click', function () { goToPage(state.page - 1); });
  els.nextPage.addEventListener('click', function () { goToPage(state.page + 1); });

  document.addEventListener('keydown', function (e) {
    if (state.mode !== 'pages') return;
    if (e.key === 'ArrowRight') goToPage(state.page - 1);
    if (e.key === 'ArrowLeft') goToPage(state.page + 1);
  });

  // ===== الإقلاع =====

  fetchJSON(META_URL).then(function (meta) {
    state.meta = meta;
    var lastSurah = meta.surahs[meta.surahs.length - 1];
    state.totalAyat = lastSurah.first + lastSurah.ayahs - 1;
    els.pageTotal.textContent = toEasternDigits(meta.pageStarts.length);
    return buildScrollView();
  }).catch(function (err) {
    els.scrollView.innerHTML = '<div class="loading">تعذر تحميل بيانات المصحف: ' + err.message + '</div>';
  });

}());
