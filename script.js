 // ============================================================
// Daily Knows — app logic
// ============================================================

let db = window.db;
let firestoreFns = window.firestoreFns || {};

function getFns() {
  return {
    collection: firestoreFns.collection,
    addDoc: firestoreFns.addDoc,
    updateDoc: firestoreFns.updateDoc,
    deleteDoc: firestoreFns.deleteDoc,
    doc: firestoreFns.doc,
    onSnapshot: firestoreFns.onSnapshot,
    serverTimestamp: firestoreFns.serverTimestamp
  };
}

// If Firebase module script runs after this one, pick it up when ready.
window.addEventListener("firebase-ready", () => {
  db = window.db;
  firestoreFns = window.firestoreFns || {};
  if (window.__dk_initFirestore) window.__dk_initFirestore();
});

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

// ============================================================
// Ethiopian calendar helpers
// ============================================================
const ethiopianMonths = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas",
  "Tir", "Yekatit", "Megabit", "Miyazya",
  "Ginbot", "Sene", "Hamle", "Nehase", "Pagumen"
];

function getCurrentEthiopianYear() {
  const today = new Date();
  const gy = today.getFullYear();
  const gm = today.getMonth() + 1;
  const gd = today.getDate();
  return (gm > 9 || (gm === 9 && gd >= 11)) ? gy - 7 : gy - 8;
}
const currentECYear = getCurrentEthiopianYear();

// Convert an Ethiopian date (EC) to a Gregorian Date object.
// Ethiopian New Year (1 Meskerem) falls on Sept 11, or Sept 12 in the
// Gregorian year immediately before a Gregorian leap year.
// Verified against Wikipedia + multiple reference dates (1992/1998/2016/2017/2019 EC).
function isGregorianLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}
function ethiopianToGregorian(ecYear, ecMonth, ecDay) {
  const newYearGregorianYear = ecYear + 7; // Meskerem 1 of ecYear lands in Sept of (ecYear+7)
  const nextGregYear = newYearGregorianYear + 1;
  const newYearDay = isGregorianLeapYear(nextGregYear) ? 12 : 11;
  const newYearDate = new Date(newYearGregorianYear, 8, newYearDay); // Sept = month 8

  const dayOffset = (ecMonth - 1) * 30 + (ecDay - 1);
  const result = new Date(newYearDate);
  result.setDate(result.getDate() + dayOffset);
  return result;
}

function formatGregorian(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return "";
  return dateObj.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// ============================================================
// Tags
// ============================================================
const TAGS = [
  { key: "personal", label: "Personal" },
  { key: "work", label: "Work" },
  { key: "idea", label: "Idea" },
  { key: "gratitude", label: "Gratitude" },
  { key: "other", label: "Other" }
];
function tagClass(tag) {
  return TAGS.some(t => t.key === tag) ? `tag-${tag}` : "tag-other";
}
function tagLabel(tag) {
  const found = TAGS.find(t => t.key === tag);
  return found ? found.label : "Other";
}

// ============================================================
// Toasts
// ============================================================
function showToast(message, type = "default") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `dk-toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// ============================================================
// Main app
// ============================================================
let appInitialized = false;
let entriesData = new Map(); // id -> entry object

function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  // ---- DOM refs ----
  const entryForm = document.getElementById("entryForm");
  const entriesEl = document.getElementById("entries");
  const ethYear = document.getElementById("ethYear");
  const ethMonth = document.getElementById("ethMonth");
  const ethDay = document.getElementById("ethDay");
  const addGregorianPreview = document.getElementById("addGregorianPreview");

  const editForm = document.getElementById("editForm");
  const editYear = document.getElementById("editYear");
  const editMonth = document.getElementById("editMonth");
  const editDay = document.getElementById("editDay");
  const editText = document.getElementById("editText");
  const editGregorianPreview = document.getElementById("editGregorianPreview");

  const addModalEl = document.getElementById("addModal");
  const editModalEl = document.getElementById("editModal");
  const deleteModalEl = document.getElementById("deleteModal");

  const addTagPicker = document.getElementById("addTagPicker");
  const editTagPicker = document.getElementById("editTagPicker");
  const entryTagInput = document.getElementById("entryTag");
  const editEntryTagInput = document.getElementById("editEntryTag");

  const searchInput = document.getElementById("searchInput");
  const filterTagSel = document.getElementById("filterTag");
  const filterMonthSel = document.getElementById("filterMonth");
  const sortOrderSel = document.getElementById("sortOrder");

  const emptyState = document.getElementById("emptyState");
  const noResults = document.getElementById("noResults");

  const statTotal = document.getElementById("statTotal");
  const statMonth = document.getElementById("statMonth");
  const statTags = document.getElementById("statTags");

  const themeToggle = document.getElementById("themeToggle");
  const iconSun = document.getElementById("iconSun");
  const iconMoon = document.getElementById("iconMoon");

  const pdfBtn = document.getElementById("pdfBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

  if (!entryForm) {
    console.error("entryForm missing");
    showToast("Something went wrong loading the page.", "error");
    return;
  }

  let pendingDeleteId = null;
  let currentEditingId = null;

  // ---- Theme ----
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (iconSun && iconMoon) {
      iconSun.style.display = theme === "dark" ? "none" : "block";
      iconMoon.style.display = theme === "dark" ? "block" : "none";
    }
  }
  let savedTheme = "light";
  try { savedTheme = localStorage.getItem("dk-theme") || "light"; } catch (e) { /* ignore */ }
  applyTheme(savedTheme);
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem("dk-theme", next); } catch (e) { /* ignore */ }
    });
  }

  // ---- Populate selects ----
  function populateYears(selectEl) {
    selectEl.innerHTML = "";
    for (let y = currentECYear - 5; y <= currentECYear + 5; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === currentECYear) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }
  function populateMonths(selectEl) {
    selectEl.innerHTML = "";
    ethiopianMonths.forEach((m, i) => {
      const opt = document.createElement("option");
      opt.value = i + 1;
      opt.textContent = m;
      if (i === 0) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }
  function populateDays(selectEl, days = 30) {
    const prevVal = parseInt(selectEl.value, 10) || 1;
    selectEl.innerHTML = "";
    for (let d = 1; d <= days; d++) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      if (d === Math.min(prevVal, days)) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }

  populateYears(ethYear);
  populateMonths(ethMonth);
  populateDays(ethDay, 30);
  populateYears(editYear);
  populateMonths(editMonth);
  populateDays(editDay, 30);

  // ---- Tag pickers ----
  function buildTagPicker(container, hiddenInput, defaultTag = "personal") {
    container.innerHTML = "";
    TAGS.forEach(t => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dk-tag-option" + (t.key === defaultTag ? " active" : "");
      btn.textContent = t.label;
      btn.dataset.tag = t.key;
      btn.addEventListener("click", () => {
        container.querySelectorAll(".dk-tag-option").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        hiddenInput.value = t.key;
      });
      container.appendChild(btn);
    });
    hiddenInput.value = defaultTag;
  }
  buildTagPicker(addTagPicker, entryTagInput, "personal");
  buildTagPicker(editTagPicker, editEntryTagInput, "personal");

  // ---- Filter selects (month + tag) ----
  function populateFilterMonths() {
    filterMonthSel.innerHTML = '<option value="">All months</option>';
    ethiopianMonths.forEach((m, i) => {
      const opt = document.createElement("option");
      opt.value = i + 1;
      opt.textContent = m;
      filterMonthSel.appendChild(opt);
    });
  }
  function populateFilterTags() {
    filterTagSel.innerHTML = '<option value="">All tags</option>';
    TAGS.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.label;
      filterTagSel.appendChild(opt);
    });
  }
  populateFilterMonths();
  populateFilterTags();

  // ---- Gregorian preview ----
  function updateGregorianPreview(yearEl, monthEl, dayEl, previewEl) {
    const y = parseInt(yearEl.value, 10);
    const m = parseInt(monthEl.value, 10);
    const d = parseInt(dayEl.value, 10);
    if (!y || !m || !d) { previewEl.textContent = ""; return; }
    const greg = ethiopianToGregorian(y, m, d);
    previewEl.textContent = `≈ ${formatGregorian(greg)} (Gregorian)`;
  }

  ethMonth.addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    populateDays(ethDay, v === 13 ? 6 : 30);
    updateGregorianPreview(ethYear, ethMonth, ethDay, addGregorianPreview);
  });
  ethYear.addEventListener("change", () => updateGregorianPreview(ethYear, ethMonth, ethDay, addGregorianPreview));
  ethDay.addEventListener("change", () => updateGregorianPreview(ethYear, ethMonth, ethDay, addGregorianPreview));

  editMonth.addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    populateDays(editDay, v === 13 ? 6 : 30);
    updateGregorianPreview(editYear, editMonth, editDay, editGregorianPreview);
  });
  editYear.addEventListener("change", () => updateGregorianPreview(editYear, editMonth, editDay, editGregorianPreview));
  editDay.addEventListener("change", () => updateGregorianPreview(editYear, editMonth, editDay, editGregorianPreview));

  if (addModalEl) {
    addModalEl.addEventListener("show.bs.modal", () => {
      populateYears(ethYear);
      populateMonths(ethMonth);
      populateDays(ethDay, parseInt(ethMonth.value, 10) === 13 ? 6 : 30);
      ethYear.value = currentECYear;
      ethMonth.value = 1;
      ethDay.value = 1;
      buildTagPicker(addTagPicker, entryTagInput, "personal");
      updateGregorianPreview(ethYear, ethMonth, ethDay, addGregorianPreview);
    });
  }
  if (editModalEl) {
    editModalEl.addEventListener("show.bs.modal", () => {
      updateGregorianPreview(editYear, editMonth, editDay, editGregorianPreview);
    });
  }

  // ---- Firestore wiring (set up once db is ready) ----
  let entriesCollectionRef = null;

  window.__dk_initFirestore = function () {
    const { collection, onSnapshot } = getFns();
    if (db && collection) {
      try {
        entriesCollectionRef = collection(db, "entries");
        console.log("Firestore collection initialized.");
        listenToEntries();
      } catch (err) {
        console.error("Failed to initialize Firestore collection:", err);
        showToast("Could not connect to your saved entries.", "error");
      }
    } else {
      console.warn("Firestore not available; running local-only.");
    }
  };
  // run now in case firebase was already ready
  window.__dk_initFirestore();

  function listenToEntries() {
    const { onSnapshot } = getFns();
    if (!entriesCollectionRef || !onSnapshot) return;
    try {
      onSnapshot(entriesCollectionRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const id = change.doc.id;
          const data = change.doc.data() || {};
          if (change.type === "added" || change.type === "modified") {
            entriesData.set(id, normalizeEntry(id, data));
          } else if (change.type === "removed") {
            entriesData.delete(id);
          }
        });
        renderAll();
      }, (err) => {
        console.error("Firestore listener error:", err);
        showToast("Couldn't load entries from the cloud.", "error");
      });
    } catch (err) {
      console.error("Failed to set up Firestore listener:", err);
    }
  }

  function normalizeEntry(id, data) {
    // Support both new structured fields and legacy date-string-only entries.
    let year = data.year, month = data.month, day = data.day;
    if ((!year || !month || !day) && data.date) {
      const parts = String(data.date).split(" ");
      day = parseInt(parts[0], 10) || 1;
      const monthName = parts[1] || ethiopianMonths[0];
      month = ethiopianMonths.indexOf(monthName) + 1 || 1;
      year = parseInt(parts[2], 10) || currentECYear;
    }
    return {
      id,
      year: parseInt(year, 10) || currentECYear,
      month: parseInt(month, 10) || 1,
      day: parseInt(day, 10) || 1,
      note: data.note || "",
      tag: data.tag || "other",
      createdAtMs: data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0
    };
  }

  function dateStr(entry) {
    const monthName = ethiopianMonths[entry.month - 1] || ethiopianMonths[0];
    return `${entry.day} ${monthName} ${entry.year} EC`;
  }

  // ---- Rendering with search/filter/sort ----
  function getFilteredSortedEntries() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const tagFilter = filterTagSel.value;
    const monthFilter = filterMonthSel.value;
    const sortDir = sortOrderSel.value;

    let list = Array.from(entriesData.values());

    if (q) {
      list = list.filter(e => e.note.toLowerCase().includes(q));
    }
    if (tagFilter) {
      list = list.filter(e => e.tag === tagFilter);
    }
    if (monthFilter) {
      list = list.filter(e => e.month === parseInt(monthFilter, 10));
    }

    list.sort((a, b) => {
      const aKey = a.year * 10000 + a.month * 100 + a.day;
      const bKey = b.year * 10000 + b.month * 100 + b.day;
      if (aKey !== bKey) return sortDir === "oldest" ? aKey - bKey : bKey - aKey;
      return sortDir === "oldest" ? a.createdAtMs - b.createdAtMs : b.createdAtMs - a.createdAtMs;
    });

    return list;
  }

  function renderCard(entry) {
    const col = document.createElement("div");
    col.className = "entry-card";
    col.setAttribute("data-id", entry.id);

    const greg = ethiopianToGregorian(entry.year, entry.month, entry.day);
    const monthName = ethiopianMonths[entry.month - 1] || "";

    col.innerHTML = `
      <div class="dk-seal-badge">
        <span class="dk-seal-day">${entry.day}</span>
        <span class="dk-seal-month">${monthName.slice(0, 3)}</span>
      </div>
      <div class="dk-card-main">
        <div class="dk-card-top">
          <span class="dk-card-date">${dateStr(entry)}</span>
          <span class="dk-card-greg">${formatGregorian(greg)}</span>
        </div>
        <p class="dk-card-text"></p>
        <div class="dk-card-bottom">
          <span class="dk-tag-chip ${tagClass(entry.tag)}">${tagLabel(entry.tag)}</span>
          <div class="dk-card-actions">
            <button class="dk-action-btn edit-btn" title="Edit" aria-label="Edit entry">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
            </button>
            <button class="dk-action-btn danger delete-btn" title="Delete" aria-label="Delete entry">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
    // set note text via textContent to avoid HTML injection from user notes
    col.querySelector(".dk-card-text").textContent = entry.note;

    col.querySelector(".edit-btn").addEventListener("click", () => openEditModal(entry));
    col.querySelector(".delete-btn").addEventListener("click", () => openDeleteConfirm(entry.id));

    return col;
  }

  function renderAll() {
    const list = getFilteredSortedEntries();
    entriesEl.innerHTML = "";

    const hasAny = entriesData.size > 0;
    emptyState.style.display = hasAny ? "none" : "block";
    noResults.style.display = (hasAny && list.length === 0) ? "block" : "none";

    list.forEach(entry => entriesEl.appendChild(renderCard(entry)));
    updateStats();
  }

  function updateStats() {
    const all = Array.from(entriesData.values());
    statTotal.textContent = all.length;

    // Count entries in the same EC year+month as the most recently dated entry.
    let thisMonthCount = 0;
    if (all.length > 0) {
      const sorted = [...all].sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));
      const latest = sorted[0];
      thisMonthCount = all.filter(e => e.year === latest.year && e.month === latest.month).length;
    }
    statMonth.textContent = thisMonthCount;

    const uniqueTags = new Set(all.map(e => e.tag));
    statTags.textContent = uniqueTags.size;
  }

  [searchInput, filterTagSel, filterMonthSel, sortOrderSel].forEach(el => {
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, renderAll);
  });

  // ---- Edit modal ----
  function openEditModal(entry) {
    currentEditingId = entry.id;
    populateYears(editYear);
    populateMonths(editMonth);
    editYear.value = entry.year;
    editMonth.value = entry.month;
    populateDays(editDay, entry.month === 13 ? 6 : 30);
    editDay.value = entry.day;
    editText.value = entry.note;
    buildTagPicker(editTagPicker, editEntryTagInput, entry.tag);
    updateGregorianPreview(editYear, editMonth, editDay, editGregorianPreview);

    const modal = new bootstrap.Modal(editModalEl);
    modal.show();
  }

  // ---- Delete confirm ----
  function openDeleteConfirm(id) {
    pendingDeleteId = id;
    const modal = new bootstrap.Modal(deleteModalEl);
    modal.show();
  }
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener("click", async () => {
      if (!pendingDeleteId) return;
      const id = pendingDeleteId;
      const { deleteDoc, doc } = getFns();
      if (!entriesCollectionRef) {
        entriesData.delete(id);
        renderAll();
      } else {
        try {
          await deleteDoc(doc(db, "entries", id));
          showToast("Entry deleted.", "success");
        } catch (err) {
          console.error("Delete failed:", err);
          showToast("Couldn't delete that entry. Try again.", "error");
        }
      }
      pendingDeleteId = null;
      const modal = bootstrap.Modal.getInstance(deleteModalEl);
      if (modal) modal.hide();
    });
  }

  // ---- Add entry submit ----
  entryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const year = parseInt(ethYear.value, 10);
    const month = parseInt(ethMonth.value, 10);
    const day = parseInt(ethDay.value, 10);
    const note = (document.getElementById("text")?.value || "").trim();
    const tag = entryTagInput.value || "other";

    if (!year || !month || !day || !note) {
      showToast("Please fill in the date and a note.", "error");
      return;
    }

    const { addDoc, serverTimestamp } = getFns();
    const dateLegacy = `${day} ${ethiopianMonths[month - 1]} ${year} EC`;

    if (!entriesCollectionRef) {
      const tempId = `local-${Date.now()}`;
      entriesData.set(tempId, { id: tempId, year, month, day, note, tag, createdAtMs: Date.now() });
      renderAll();
      showToast("Entry saved locally (no cloud connection).", "success");
    } else {
      try {
        await addDoc(entriesCollectionRef, {
          year, month, day, note, tag,
          date: dateLegacy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        showToast("Entry saved.", "success");
      } catch (err) {
        console.error("Add entry failed:", err);
        showToast("Couldn't save that entry. Try again.", "error");
      }
    }

    entryForm.reset();
    populateDays(ethDay, 30);
    const addModal = bootstrap.Modal.getInstance(addModalEl);
    if (addModal) addModal.hide();
  });

  // ---- Edit submit ----
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentEditingId) {
      showToast("No entry selected to update.", "error");
      return;
    }
    const year = parseInt(editYear.value, 10);
    const month = parseInt(editMonth.value, 10);
    const day = parseInt(editDay.value, 10);
    const note = editText.value.trim();
    const tag = editEntryTagInput.value || "other";
    const id = currentEditingId;

    const { updateDoc, doc, serverTimestamp } = getFns();
    const dateLegacy = `${day} ${ethiopianMonths[month - 1]} ${year} EC`;

    if (!entriesCollectionRef) {
      const existing = entriesData.get(id) || {};
      entriesData.set(id, { ...existing, year, month, day, note, tag });
      renderAll();
      showToast("Entry updated locally.", "success");
    } else {
      try {
        await updateDoc(doc(db, "entries", id), {
          year, month, day, note, tag,
          date: dateLegacy,
          updatedAt: serverTimestamp()
        });
        showToast("Entry updated.", "success");
      } catch (err) {
        console.error("Update failed:", err);
        showToast("Couldn't update that entry. Try again.", "error");
      }
    }

    const modal = bootstrap.Modal.getInstance(editModalEl);
    if (modal) modal.hide();
    currentEditingId = null;
  });

  // ---- PDF export (respects current search/filter/sort) ----
  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        showToast("PDF library failed to load.", "error");
        return;
      }
      const list = getFilteredSortedEntries();
      const docPDF = new jsPDF();
      const pageWidth = docPDF.internal.pageSize.getWidth();
      const pageHeight = docPDF.internal.pageSize.getHeight();
      let y = 30;

      function drawHeader() {
        docPDF.setFont("times", "bold");
        docPDF.setFontSize(20);
        docPDF.setTextColor(201, 98, 45);
        docPDF.text("Daily Knows", pageWidth / 2, 16, { align: "center" });
        docPDF.setDrawColor(228, 217, 199);
        docPDF.line(14, 21, pageWidth - 14, 21);
      }
      function drawFooter(pageNum) {
        docPDF.setFont("helvetica", "normal");
        docPDF.setFontSize(9);
        docPDF.setTextColor(150, 140, 125);
        docPDF.text(`Page ${pageNum}`, pageWidth / 2, pageHeight - 10, { align: "center" });
      }

      let pageNum = 1;
      drawHeader();
      drawFooter(pageNum);

      if (list.length === 0) {
        docPDF.setFont("helvetica", "italic");
        docPDF.setFontSize(12);
        docPDF.setTextColor(90, 80, 70);
        docPDF.text("No entries to show for the current filters.", 14, y);
      } else {
        list.forEach((entry) => {
          const greg = ethiopianToGregorian(entry.year, entry.month, entry.day);
          const dateLine = `${dateStr(entry)}   ·   ${formatGregorian(greg)}`;

          if (y > pageHeight - 40) {
            docPDF.addPage();
            pageNum += 1;
            y = 30;
            drawHeader();
            drawFooter(pageNum);
          }

          docPDF.setFont("helvetica", "bold");
          docPDF.setFontSize(11);
          docPDF.setTextColor(27, 20, 16);
          docPDF.text(dateLine, 14, y);

          docPDF.setFont("helvetica", "normal");
          docPDF.setFontSize(9);
          docPDF.setTextColor(63, 110, 82);
          docPDF.text(`[${tagLabel(entry.tag)}]`, pageWidth - 14, y, { align: "right" });

          y += 7;
          docPDF.setFont("helvetica", "normal");
          docPDF.setFontSize(11);
          docPDF.setTextColor(40, 34, 28);
          const splitText = docPDF.splitTextToSize(entry.note, pageWidth - 28);
          docPDF.text(splitText, 14, y);
          y += splitText.length * 6 + 4;

          docPDF.setDrawColor(228, 217, 199);
          docPDF.line(14, y, pageWidth - 14, y);
          y += 8;
        });
      }

      docPDF.save("DailyKnows.pdf");
      showToast("PDF exported.", "success");
    });
  }

  console.log("Daily Knows initialized.");
}
