/* ============================================================================
 * QuranData — طبقة بيانات القرآن المحلية (تعمل دون إنترنت)
 * ============================================================================
 *
 * كل ما يعرضه قسم القرآن يأتي من ملفات مرفقة مع التطبيق، لا من أي API:
 *
 *   data/quran-meta.json      14KB   أسماء السور وحدود الصفحات والأجزاء والأرباع
 *   data/quran-text.json      1.3MB  نص المصحف كاملاً برسم حفص العثماني
 *   data/tafsir-muyassar.json 2.7MB  تفسير الميسر لكل آية
 *
 * تُولَّد هذه الملفات بـ scripts/build-quran-data.mjs و scripts/build-tafsir-data.mjs.
 *
 * التحميل كسول: قائمة السور تحتاج الملف الصغير فقط، ونص المصحف لا يُقرأ إلا
 * عند فتح أول سورة، والتفسير لا يُقرأ إلا عند طلبه. وكل ملف يُقرأ مرة واحدة
 * ويبقى في الذاكرة.
 *
 * حدود الصفحات والأجزاء والأرباع مخزّنة كأرقام "الآية العالمية" (1..6236) التي
 * تبدأ عندها كل وحدة، فنجدها ببحث ثنائي بدل تخزين قيمة لكل آية على حدة.
 * ========================================================================== */

(function (global) {
  'use strict';

  var DATA_PATH = 'data/';

  var cache = { meta: null, text: null, tafsir: null };
  var pending = { meta: null, text: null, tafsir: null };

  function loadJson(name) {
    if (cache[name]) {
      return Promise.resolve(cache[name]);
    }
    if (pending[name]) {
      return pending[name];
    }
    var files = {
      meta: 'quran-meta.json',
      text: 'quran-text.json',
      tafsir: 'tafsir-muyassar.json',
    };
    pending[name] = fetch(DATA_PATH + files[name])
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' — ' + files[name]);
        }
        return response.json();
      })
      .then(function (data) {
        cache[name] = data;
        pending[name] = null;
        return data;
      })
      .catch(function (error) {
        pending[name] = null;
        throw error;
      });
    return pending[name];
  }

  /** فهرس آخر عنصر في المصفوفة التصاعدية لا يتجاوز القيمة — بحث ثنائي. */
  function lastIndexAtOrBefore(starts, value) {
    var low = 0;
    var high = starts.length - 1;
    var result = 0;
    while (low <= high) {
      var mid = (low + high) >> 1;
      if (starts[mid] <= value) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  }

  var QuranData = {
    /** يحمّل البيانات الصغيرة اللازمة لقائمة السور. */
    loadMeta: function () {
      return loadJson('meta');
    },

    /** يحمّل نص المصحف كاملاً (مرة واحدة). */
    loadText: function () {
      return loadJson('text');
    },

    loadTafsir: function () {
      return loadJson('tafsir');
    },

    /** قائمة السور: [{ n, name, en, type, ayahs, first }] */
    getSurahs: function () {
      return cache.meta ? cache.meta.surahs : [];
    },

    getSurahMeta: function (number) {
      return cache.meta ? cache.meta.surahs[number - 1] : null;
    },

    /** رقم الآية عالمياً (1..6236) من رقم السورة ورقم الآية داخلها. */
    ayahId: function (surahNumber, ayahNumber) {
      var surah = this.getSurahMeta(surahNumber);
      return surah ? surah.first + ayahNumber - 1 : 0;
    },

    /** رقم صفحة المصحف (1..604) للآية. */
    pageOf: function (ayahId) {
      return lastIndexAtOrBefore(cache.meta.pageStarts, ayahId) + 1;
    },

    /** رقم الجزء (1..30). */
    juzOf: function (ayahId) {
      return lastIndexAtOrBefore(cache.meta.juzStarts, ayahId) + 1;
    },

    /** رقم ربع الحزب (1..240) — نفس ترقيم hizbQuarter المعروف. */
    rubOf: function (ayahId) {
      return lastIndexAtOrBefore(cache.meta.rubStarts, ayahId) + 1;
    },

    /** هل تبدأ هذه الآية صفحة جديدة في المصحف؟ */
    isPageStart: function (ayahId) {
      var pageIndex = lastIndexAtOrBefore(cache.meta.pageStarts, ayahId);
      return cache.meta.pageStarts[pageIndex] === ayahId;
    },

    /** رقم الآية عالمياً (1..6236) التي تبدأ عندها صفحة المصحف رقم pageNumber. */
    firstAyahOfPage: function (pageNumber) {
      return cache.meta.pageStarts[pageNumber - 1];
    },

    /** آية السجدة في السورة إن وُجدت، وإلا null. */
    sajdahAyahOf: function (surahNumber) {
      var sajdah = cache.meta && cache.meta.sajdah;
      return sajdah && sajdah[surahNumber] ? sajdah[surahNumber] : null;
    },

    /**
     * سورة كاملة جاهزة للعرض:
     * { number, name, type, ayahs: [{ numberInSurah, text, juz, hizbQuarter, page, pageStart, sajdah }] }
     */
    getSurah: function (number) {
      var meta = this.getSurahMeta(number);
      var texts = cache.text ? cache.text[number - 1] : null;
      if (!meta || !texts) {
        return null;
      }

      var sajdahAyah = this.sajdahAyahOf(number);
      var self = this;
      var ayahs = texts.map(function (text, index) {
        var ayahNumber = index + 1;
        var id = meta.first + index;
        return {
          numberInSurah: ayahNumber,
          text: text,
          juz: self.juzOf(id),
          hizbQuarter: self.rubOf(id),
          page: self.pageOf(id),
          pageStart: self.isPageStart(id),
          sajdah: sajdahAyah === ayahNumber,
        };
      });

      return { number: number, name: meta.name, type: meta.type, ayahs: ayahs };
    },

    /** تفسير الميسر لآية — يتطلب loadTafsir() مسبقاً. */
    getTafsir: function (surahNumber, ayahNumber) {
      if (!cache.tafsir) {
        return null;
      }
      var surah = cache.tafsir[surahNumber - 1];
      return surah ? surah[ayahNumber - 1] || null : null;
    },
  };

  global.QuranData = QuranData;
})(typeof window !== 'undefined' ? window : this);
