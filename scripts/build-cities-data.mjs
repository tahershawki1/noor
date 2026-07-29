#!/usr/bin/env node
/**
 * يولّد قائمة مدن محلية بإحداثياتها، ليعمل البحث بالمدينة دون إنترنت
 * (كان يعتمد سابقاً على api.aladhan.com/timingsByCity).
 *
 * المخرجات: islamic-app/data/cities.json
 *   [{ n: الاسم اللاتيني, a: الاسم العربي (إن وُجد), c: رمز الدولة, y: خط العرض, x: خط الطول }]
 *
 * المعيار: كل مدن العالم فوق 200 ألف نسمة، بالإضافة إلى مدن الدول العربية
 * والإسلامية فوق 50 ألف نسمة (حيث تكثر الحاجة لمواقيت دقيقة لمدن صغيرة).
 *
 * الإحداثيات من حزمة all-the-cities (مصدرها GeoNames)، أما الأسماء العربية
 * فمن جدول أسفله — وهي للبحث فقط ولا تؤثر على دقة الحساب إطلاقاً.
 *
 * الاستعمال (مرة واحدة — الناتج مرفوع في الريبو):
 *   npm i --no-save all-the-cities
 *   node scripts/build-cities-data.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'islamic-app', 'data', 'cities.json');

let allCities;
try {
  allCities = require('all-the-cities');
} catch (error) {
  console.error('ثبّت المصدر أولاً:\n  npm i --no-save all-the-cities\n');
  process.exit(1);
}

/** الدول التي نخفض لها حد السكان لتغطية المدن الصغيرة. */
const PRIORITY_COUNTRIES = new Set([
  'EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'YE', 'JO', 'PS', 'LB', 'SY', 'IQ',
  'LY', 'TN', 'DZ', 'MA', 'MR', 'SD', 'SO', 'DJ', 'KM',
  'TR', 'IR', 'PK', 'ID', 'MY', 'BD', 'AF', 'BN', 'MV',
  'NG', 'SN', 'ML', 'NE', 'TD', 'GN', 'BF',
  'AZ', 'KZ', 'UZ', 'TM', 'KG', 'TJ', 'AL', 'XK', 'BA',
]);

const WORLD_MIN_POPULATION = 200000;
const PRIORITY_MIN_POPULATION = 50000;

/** أسماء عربية للمدن الكبرى — تُستعمل في البحث فقط. */
const ARABIC_NAMES = {
  'Cairo|EG': 'القاهرة', 'Alexandria|EG': 'الإسكندرية', 'Giza|EG': 'الجيزة',
  'Port Said|EG': 'بورسعيد', 'Suez|EG': 'السويس', 'Luxor|EG': 'الأقصر',
  'Aswan|EG': 'أسوان', 'Asyut|EG': 'أسيوط', 'Tanta|EG': 'طنطا',
  'Mansoura|EG': 'المنصورة', 'Ismailia|EG': 'الإسماعيلية', 'Faiyum|EG': 'الفيوم',
  'Zagazig|EG': 'الزقازيق', 'Damanhur|EG': 'دمنهور', 'Minya|EG': 'المنيا',
  'Sohag|EG': 'سوهاج', 'Banha|EG': 'بنها', 'Qena|EG': 'قنا', 'Damietta|EG': 'دمياط',
  'Mecca|SA': 'مكة المكرمة', 'Medina|SA': 'المدينة المنورة', 'Riyadh|SA': 'الرياض',
  'Jeddah|SA': 'جدة', 'Dammam|SA': 'الدمام', 'Ta’if|SA': 'الطائف', 'Taif|SA': 'الطائف',
  'Tabuk|SA': 'تبوك', 'Buraydah|SA': 'بريدة', 'Khamis Mushait|SA': 'خميس مشيط',
  'Abha|SA': 'أبها', 'Hail|SA': 'حائل', 'Najran|SA': 'نجران', 'Jubail|SA': 'الجبيل',
  'Khobar|SA': 'الخبر', 'Yanbu|SA': 'ينبع', 'Al Hufuf|SA': 'الهفوف',
  'Dubai|AE': 'دبي', 'Abu Dhabi|AE': 'أبوظبي', 'Sharjah|AE': 'الشارقة',
  'Ajman|AE': 'عجمان', 'Al Ain|AE': 'العين', 'Ras Al Khaimah|AE': 'رأس الخيمة',
  'Fujairah|AE': 'الفجيرة',
  'Kuwait City|KW': 'الكويت', 'Doha|QA': 'الدوحة', 'Manama|BH': 'المنامة',
  'Muscat|OM': 'مسقط', 'Salalah|OM': 'صلالة', 'Sohar|OM': 'صحار',
  'Sanaa|YE': 'صنعاء', 'Aden|YE': 'عدن', 'Taiz|YE': 'تعز', 'Hodeidah|YE': 'الحديدة',
  'Amman|JO': 'عمّان', 'Zarqa|JO': 'الزرقاء', 'Irbid|JO': 'إربد', 'Aqaba|JO': 'العقبة',
  'Jerusalem|IL': 'القدس', 'East Jerusalem|PS': 'القدس الشرقية', 'Gaza|PS': 'غزة',
  'Hebron|PS': 'الخليل', 'Nablus|PS': 'نابلس', 'Ramallah|PS': 'رام الله',
  'Beirut|LB': 'بيروت', 'Tripoli|LB': 'طرابلس', 'Sidon|LB': 'صيدا',
  'Damascus|SY': 'دمشق', 'Aleppo|SY': 'حلب', 'Homs|SY': 'حمص', 'Hama|SY': 'حماة',
  'Latakia|SY': 'اللاذقية', 'Deir ez-Zor|SY': 'دير الزور',
  'Baghdad|IQ': 'بغداد', 'Basrah|IQ': 'البصرة', 'Mosul|IQ': 'الموصل',
  'Erbil|IQ': 'أربيل', 'Najaf|IQ': 'النجف', 'Karbala|IQ': 'كربلاء',
  'Kirkuk|IQ': 'كركوك', 'Sulaymaniyah|IQ': 'السليمانية',
  'Tripoli|LY': 'طرابلس', 'Benghazi|LY': 'بنغازي', 'Misratah|LY': 'مصراتة',
  'Tunis|TN': 'تونس', 'Sfax|TN': 'صفاقس', 'Sousse|TN': 'سوسة', 'Kairouan|TN': 'القيروان',
  'Algiers|DZ': 'الجزائر', 'Oran|DZ': 'وهران', 'Constantine|DZ': 'قسنطينة',
  'Annaba|DZ': 'عنابة', 'Batna|DZ': 'باتنة', 'Setif|DZ': 'سطيف',
  'Casablanca|MA': 'الدار البيضاء', 'Rabat|MA': 'الرباط', 'Fes|MA': 'فاس',
  'Marrakesh|MA': 'مراكش', 'Tangier|MA': 'طنجة', 'Agadir|MA': 'أكادير',
  'Meknes|MA': 'مكناس', 'Oujda|MA': 'وجدة', 'Tetouan|MA': 'تطوان',
  'Nouakchott|MR': 'نواكشوط', 'Khartoum|SD': 'الخرطوم', 'Omdurman|SD': 'أم درمان',
  'Port Sudan|SD': 'بورتسودان', 'Mogadishu|SO': 'مقديشو', 'Djibouti|DJ': 'جيبوتي',
  'Moroni|KM': 'موروني',
  'Istanbul|TR': 'إسطنبول', 'Ankara|TR': 'أنقرة', 'Izmir|TR': 'إزمير',
  'Bursa|TR': 'بورصة', 'Antalya|TR': 'أنطاليا', 'Konya|TR': 'قونية',
  'Tehran|IR': 'طهران', 'Mashhad|IR': 'مشهد', 'Isfahan|IR': 'أصفهان',
  'Qom|IR': 'قم', 'Shiraz|IR': 'شيراز', 'Tabriz|IR': 'تبريز',
  'Karachi|PK': 'كراتشي', 'Lahore|PK': 'لاهور', 'Islamabad|PK': 'إسلام آباد',
  'Faisalabad|PK': 'فيصل آباد', 'Peshawar|PK': 'بيشاور', 'Quetta|PK': 'كويتا',
  'Jakarta|ID': 'جاكرتا', 'Surabaya|ID': 'سورابايا', 'Bandung|ID': 'باندونغ',
  'Medan|ID': 'ميدان', 'Kuala Lumpur|MY': 'كوالالمبور', 'Johor Bahru|MY': 'جوهور بهرو',
  'Dhaka|BD': 'دكا', 'Chittagong|BD': 'شيتاغونغ',
  'Kabul|AF': 'كابل', 'Kandahar|AF': 'قندهار', 'Herat|AF': 'هرات',
  'Male|MV': 'ماليه', 'Bandar Seri Begawan|BN': 'بندر سري بكاوان',
  'Baku|AZ': 'باكو', 'Tashkent|UZ': 'طشقند', 'Samarkand|UZ': 'سمرقند',
  'Almaty|KZ': 'ألماتي', 'Astana|KZ': 'أستانا', 'Bishkek|KG': 'بيشكك',
  'Dushanbe|TJ': 'دوشنبه', 'Ashgabat|TM': 'عشق آباد',
  'Sarajevo|BA': 'سراييفو', 'Tirana|AL': 'تيرانا', 'Pristina|XK': 'بريشتينا',
  'London|GB': 'لندن', 'Manchester|GB': 'مانشستر', 'Birmingham|GB': 'برمنغهام',
  'Paris|FR': 'باريس', 'Marseille|FR': 'مرسيليا', 'Lyon|FR': 'ليون',
  'Berlin|DE': 'برلين', 'Hamburg|DE': 'هامبورغ', 'Munich|DE': 'ميونخ',
  'Frankfurt am Main|DE': 'فرانكفورت', 'Cologne|DE': 'كولونيا',
  'Amsterdam|NL': 'أمستردام', 'Rotterdam|NL': 'روتردام', 'Brussels|BE': 'بروكسل',
  'Madrid|ES': 'مدريد', 'Barcelona|ES': 'برشلونة', 'Rome|IT': 'روما', 'Milan|IT': 'ميلان',
  'Stockholm|SE': 'ستوكهولم', 'Oslo|NO': 'أوسلو', 'Copenhagen|DK': 'كوبنهاغن',
  'Vienna|AT': 'فيينا', 'Zurich|CH': 'زيورخ', 'Moscow|RU': 'موسكو',
  'New York City|US': 'نيويورك', 'Chicago|US': 'شيكاغو', 'Detroit|US': 'ديترويت',
  'Houston|US': 'هيوستن', 'Los Angeles|US': 'لوس أنجلوس', 'Washington|US': 'واشنطن',
  'Toronto|CA': 'تورونتو', 'Montreal|CA': 'مونتريال', 'Ottawa|CA': 'أوتاوا',
  'Sydney|AU': 'سيدني', 'Melbourne|AU': 'ملبورن',
};

const selected = [];
const seen = new Set();

for (const city of allCities) {
  const threshold = PRIORITY_COUNTRIES.has(city.country)
    ? PRIORITY_MIN_POPULATION
    : WORLD_MIN_POPULATION;

  if (city.population < threshold) {
    continue;
  }

  const key = `${city.name}|${city.country}`;
  if (seen.has(key)) {
    continue;
  }
  seen.add(key);

  const [longitude, latitude] = city.loc.coordinates;
  const entry = {
    n: city.name,
    c: city.country,
    y: Math.round(latitude * 10000) / 10000,
    x: Math.round(longitude * 10000) / 10000,
  };
  const arabic = ARABIC_NAMES[key];
  if (arabic) {
    entry.a = arabic;
  }
  selected.push(entry);
}

selected.sort((a, b) => a.n.localeCompare(b.n));

// تحقق: لا بد أن تكون المدن المقدسة موجودة وإحداثياتها في المدى الصحيح
const required = [['Mecca', 'SA'], ['Medina', 'SA'], ['Cairo', 'EG'], ['Jerusalem', 'IL']];
for (const [name, country] of required) {
  const found = selected.find((c) => c.n === name && c.c === country);
  if (!found) {
    console.error(`مدينة أساسية مفقودة: ${name} (${country})`);
    process.exit(1);
  }
  if (Math.abs(found.y) > 90 || Math.abs(found.x) > 180) {
    console.error(`إحداثيات غير صالحة للمدينة ${name}`);
    process.exit(1);
  }
}

const withArabic = selected.filter((c) => c.a).length;
fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(selected));

console.log(`✓ ${path.relative(ROOT, OUT_FILE)}  ${Math.round(fs.statSync(OUT_FILE).size / 1024)} KB`);
console.log(`  ${selected.length} مدينة (${withArabic} باسم عربي)`);
