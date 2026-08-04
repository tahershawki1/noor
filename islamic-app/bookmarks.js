/* ============================================================
   bookmarks.js — الإشارات المرجعية
   ============================================================ */
function getBookmarks() {
  try {
    return JSON.parse(localStorage.getItem("quranBookmarks") || "[]");
  } catch (_) {
    return [];
  }
}
function saveBookmarks(list) {
  localStorage.setItem("quranBookmarks", JSON.stringify(list));
}

function toggleBookmark(surahNum, ayahNum, surahName, span) {
  const key = `${surahNum}:${ayahNum}`;
  let bookmarks = getBookmarks();
  const existing = bookmarks.findIndex((b) => b.key === key);

  if (existing >= 0) {
    bookmarks.splice(existing, 1);
    saveBookmarks(bookmarks);
    span.classList.remove("bookmarked");
    showToast("تم حذف الإشارة المرجعية 🗑");
  } else {
    // نص الآية من العنصر نفسه (بدون رقم الآية)
    const clone = span.cloneNode(true);
    clone.querySelector(".ayah-marker")?.remove();
    const text = clone.textContent.trim();

    bookmarks.unshift({
      key,
      surah: surahNum,
      ayah: ayahNum,
      surahName,
      text,
      date: new Date().toISOString(),
    });
    saveBookmarks(bookmarks);
    span.classList.add("bookmarked");
    showToast("تمت إضافة الإشارة المرجعية 🔖");
  }

  span.classList.add("pulse");
  setTimeout(() => span.classList.remove("pulse"), 450);
}

function renderBookmarks() {
  const list = getBookmarks();
  const el = $("bookmarksList");
  if (!list.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="big">${icon("bookmark")}</div>
        <p>لا توجد آيات محفوظة بعد</p>
        <p class="muted">افتح أي سورة واضغط مطولاً على الآية لإضافتها هنا</p>
      </div>`;
    return;
  }
  el.innerHTML = list
    .map(
      (b, i) => `
      <div class="bookmark-item">
        <div class="bookmark-ayah-text">${b.text} <span class="ayah-marker">﴿${toArabicNum(b.ayah)}﴾</span></div>
        <div class="bookmark-meta">
          <span class="bookmark-ref">${b.surahName} — الآية ${toArabicNum(b.ayah)}</span>
          <div class="bookmark-actions">
            <button class="icon-action" onclick="goToBookmark(${b.surah}, ${b.ayah})" aria-label="فتح الآية">${icon("open")}</button>
            <button class="icon-action danger" onclick="deleteBookmark(${i})" aria-label="حذف">${icon("trash")}</button>
          </div>
        </div>
      </div>`
    )
    .join("");
}

function goToBookmark(surahNum, ayahNum) {
  // navigateTo("quran") مباشرة، لا نقر زر التنقل — النقر يمرّ options.resume،
  // فيُطلق resumeReading() بالتوازي مع openSurah هنا، وكلاهما async يكتب
  // نفس الحالة العامة (currentSurah وHTML الحاوية)، فأيّهما ينتهي أخيراً
  // "يفوز" ويهبط القارئ في مكان مختلف عن الآية المطلوبة.
  navigateTo("quran");
  openSurah(surahNum, ayahNum);
}

function deleteBookmark(index) {
  const list = getBookmarks();
  list.splice(index, 1);
  saveBookmarks(list);
  renderBookmarks();
  showToast("تم حذف الإشارة المرجعية");
}
