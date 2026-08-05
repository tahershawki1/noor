/* ============================================================
   adhkar.js — صفحة الأذكار + السبحة الإلكترونية
   ============================================================ */

/* --------- تخزين الأذكار المخصصة وترتيب العرض --------- */
function getCustomAdhkar() {
  try { return JSON.parse(localStorage.getItem("customAdhkar")) || {}; } catch (_) { return {}; }
}
function saveCustomAdhkar(obj) { localStorage.setItem("customAdhkar", JSON.stringify(obj)); }

function getAdhkarOrder() {
  try { return JSON.parse(localStorage.getItem("adhkarOrder")) || {}; } catch (_) { return {}; }
}
function saveAdhkarOrder(obj) { localStorage.setItem("adhkarOrder", JSON.stringify(obj)); }

// يدمج أذكار القسم الأصلية مع الأذكار المخصصة، ثم يطبّق الترتيب المحفوظ إن وجد
function getCategoryItems(cat) {
  const custom = getCustomAdhkar()[cat.id] || [];
  const builtIn = cat.items.map((item, idx) => ({ id: `built-${idx}`, ...item, isCustom: false }));
  const customMapped = custom.map((item) => ({ ...item, isCustom: true }));
  let all = builtIn.concat(customMapped);

  const order = getAdhkarOrder()[cat.id];
  if (order && order.length) {
    const byId = new Map(all.map((it) => [it.id, it]));
    const ordered = [];
    order.forEach((id) => {
      if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); }
    });
    byId.forEach((it) => ordered.push(it)); // عناصر جديدة لم تكن ضمن الترتيب المحفوظ تُلحق بالنهاية
    all = ordered;
  }
  return all;
}

let currentAdhkarCategoryId = null;
let adhkarReorderMode = false;

function renderAdhkarCategories() {
  const custom = getCustomAdhkar();
  $("adhkarCategories").innerHTML = ADHKAR_DATA.map((cat) => {
    const count = cat.items.length + (custom[cat.id] || []).length;
    return `
    <div class="category-card" onclick="openAdhkarCategory('${cat.id}')">
      <div class="category-icon">${cat.icon}</div>
      <div class="category-name">${cat.name}</div>
      <div class="category-count">${arabicCountLabel(count, "ذكر واحد", "ذكران", "أذكار", "ذكراً")}</div>
    </div>`;
  }).join("");
}

function openAdhkarCategory(id) {
  const cat = ADHKAR_DATA.find((c) => c.id === id);
  if (!cat) return;
  currentAdhkarCategoryId = id;
  adhkarReorderMode = false;
  $("reorderAdhkarBtn").innerHTML = `${icon("sort")} ترتيب`;
  $("reorderAdhkarBtn").classList.remove("on");
  $("adhkarCatView").classList.add("hidden");
  $("adhkarListView").classList.remove("hidden");
  $("adhkarCatTitle").textContent = `${cat.icon} ${cat.name}`;
  renderAdhkarItemsList();
  $("mainContent").scrollTop = 0;
}

function renderAdhkarItemsList() {
  const cat = ADHKAR_DATA.find((c) => c.id === currentAdhkarCategoryId);
  if (!cat) return;
  const items = getCategoryItems(cat);

  if (adhkarReorderMode) {
    $("adhkarItems").innerHTML = items
      .map(
        (item, i) => `
      <div class="dhikr-card">
        <div class="dhikr-text">${escapeHtml(item.text)}</div>
        ${item.benefit ? `<div class="dhikr-benefit">💡 ${escapeHtml(item.benefit)}</div>` : ""}
        <div class="dhikr-footer">
          <div class="reorder-controls">
            <button class="tune-btn" onclick="moveAdhkarItem(${i}, -1)" ${i === 0 ? "disabled" : ""} aria-label="تحريك لأعلى">▲</button>
            <button class="tune-btn" onclick="moveAdhkarItem(${i}, 1)" ${i === items.length - 1 ? "disabled" : ""} aria-label="تحريك لأسفل">▼</button>
          </div>
          ${item.isCustom ? `<button class="icon-action danger" onclick="deleteCustomAdhkar('${item.id}')" aria-label="حذف">${icon("trash")}</button>` : ""}
        </div>
      </div>`
      )
      .join("");
    return;
  }

  $("adhkarItems").innerHTML = items
    .map(
      (item) => `
      <div class="dhikr-card">
        <div class="dhikr-text">${escapeHtml(item.text)}</div>
        ${item.benefit ? `<div class="dhikr-benefit">💡 ${escapeHtml(item.benefit)}</div>` : ""}
        <div class="dhikr-footer">
          <span class="dhikr-repeat">التكرار: ${arabicCountLabel(item.repeat, "مرة واحدة", "مرتان", "مرات", "مرة")}</span>
          <button class="dhikr-counter-btn" data-remaining="${item.repeat}" onclick="tickDhikr(this)">
            ${toArabicNum(item.repeat)}
          </button>
        </div>
        ${item.isCustom ? `<span class="custom-adhkar-tag">✍️ مخصص</span>` : ""}
      </div>`
    )
    .join("");
}

function moveAdhkarItem(index, direction) {
  const cat = ADHKAR_DATA.find((c) => c.id === currentAdhkarCategoryId);
  if (!cat) return;
  const items = getCategoryItems(cat);
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= items.length) return;
  [items[index], items[newIndex]] = [items[newIndex], items[index]];
  const order = getAdhkarOrder();
  order[currentAdhkarCategoryId] = items.map((it) => it.id);
  saveAdhkarOrder(order);
  renderAdhkarItemsList();
}

function deleteCustomAdhkar(id) {
  const custom = getCustomAdhkar();
  const list = custom[currentAdhkarCategoryId] || [];
  custom[currentAdhkarCategoryId] = list.filter((it) => it.id !== id);
  saveCustomAdhkar(custom);

  const order = getAdhkarOrder();
  if (order[currentAdhkarCategoryId]) {
    order[currentAdhkarCategoryId] = order[currentAdhkarCategoryId].filter((oid) => oid !== id);
    saveAdhkarOrder(order);
  }
  renderAdhkarItemsList();
  showToast("تم حذف الذكر");
}

function tickDhikr(btn) {
  let remaining = parseInt(btn.dataset.remaining, 10);
  if (remaining <= 0) return;
  remaining -= 1;
  btn.dataset.remaining = remaining;
  NoorStats.record("dhikr");
  if (remaining === 0) {
    btn.textContent = "✓ تم";
    btn.classList.add("done");
  } else {
    btn.textContent = toArabicNum(remaining);
  }
}

function backToAdhkarCategories() {
  $("adhkarListView").classList.add("hidden");
  $("adhkarCatView").classList.remove("hidden");
  renderAdhkarCategories();
  $("mainContent").scrollTop = 0;
}
$("backToCategories").addEventListener("click", backToAdhkarCategories);

$("reorderAdhkarBtn").addEventListener("click", () => {
  adhkarReorderMode = !adhkarReorderMode;
  $("reorderAdhkarBtn").innerHTML = adhkarReorderMode
    ? `${icon("check")} تم`
    : `${icon("sort")} ترتيب`;
  $("reorderAdhkarBtn").classList.toggle("on", adhkarReorderMode);
  renderAdhkarItemsList();
});

/* --------- إضافة ذكر جديد --------- */
function openAddAdhkarModal() {
  $("newAdhkarCategory").innerHTML = ADHKAR_DATA.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  if (currentAdhkarCategoryId) $("newAdhkarCategory").value = currentAdhkarCategoryId;
  $("newAdhkarText").value = "";
  $("newAdhkarRepeat").value = "1";
  $("newAdhkarBenefit").value = "";
  $("addAdhkarOverlay").classList.remove("hidden");
}
function closeAddAdhkarModal() {
  $("addAdhkarOverlay").classList.add("hidden");
}
$("addAdhkarBtn").addEventListener("click", openAddAdhkarModal);
$("closeAddAdhkar").addEventListener("click", closeAddAdhkarModal);
$("addAdhkarOverlay").addEventListener("click", (e) => {
  if (e.target.id === "addAdhkarOverlay") closeAddAdhkarModal();
});

$("saveNewAdhkarBtn").addEventListener("click", () => {
  const categoryId = $("newAdhkarCategory").value;
  const text = $("newAdhkarText").value.trim();
  const repeat = Math.max(1, parseInt($("newAdhkarRepeat").value, 10) || 1);
  const benefit = $("newAdhkarBenefit").value.trim();
  if (!text) { showToast("اكتب نص الذكر أولاً"); return; }

  const custom = getCustomAdhkar();
  if (!custom[categoryId]) custom[categoryId] = [];
  custom[categoryId].push({ id: `custom-${Date.now()}`, text, repeat, benefit });
  saveCustomAdhkar(custom);

  closeAddAdhkarModal();
  showToast("تمت إضافة الذكر ✓");
  renderAdhkarCategories();
  if (!$("adhkarListView").classList.contains("hidden") && currentAdhkarCategoryId === categoryId) {
    renderAdhkarItemsList();
  }
});

/* --------- السبحة الإلكترونية --------- */
let tasbeehCount = parseInt(localStorage.getItem("tasbeehCount") || "0", 10);
$("tasbeehCount").textContent = toArabicNum(tasbeehCount);
$("tasbeehBtn").textContent = localStorage.getItem("tasbeehPhrase") || "سبحان الله";
$("tasbeehPhrase").value = localStorage.getItem("tasbeehPhrase") || "سبحان الله";

$("tasbeehBtn").addEventListener("click", () => {
  tasbeehCount += 1;
  $("tasbeehCount").textContent = toArabicNum(tasbeehCount);
  localStorage.setItem("tasbeehCount", tasbeehCount);
  NoorStats.record("tasbeeh");
  if (navigator.vibrate) navigator.vibrate(15);
});
$("tasbeehReset").addEventListener("click", () => {
  tasbeehCount = 0;
  $("tasbeehCount").textContent = toArabicNum(0);
  localStorage.setItem("tasbeehCount", 0);
});
$("tasbeehPhrase").addEventListener("change", (e) => {
  $("tasbeehBtn").textContent = e.target.value;
  localStorage.setItem("tasbeehPhrase", e.target.value);
});
