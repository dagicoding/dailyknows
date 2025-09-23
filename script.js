const db = window.db;
const {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} = window.firestoreFns || {};

// Wait for DOM ready
document.addEventListener("DOMContentLoaded", () => {
  // DOM elements
  const entryForm = document.getElementById("entryForm");
  const entries = document.getElementById("entries");
  const ethYear = document.getElementById("ethYear");
  const ethMonth = document.getElementById("ethMonth");
  const ethDay = document.getElementById("ethDay");

  const editForm = document.getElementById("editForm");
  const editYear = document.getElementById("editYear");
  const editMonth = document.getElementById("editMonth");
  const editDay = document.getElementById("editDay");
  const editText = document.getElementById("editText");

  const addModalEl = document.getElementById("addModal");
  const editModalEl = document.getElementById("editModal");

  if (!entryForm) {
    console.error("entryForm missing");
    alert("Form initialization failed. Check console.");
    return;
  }

  // Ethiopian months
  const ethiopianMonths = [
    "Meskerem", "Tikimt", "Hidar", "Tahsas",
    "Tir", "Yekatit", "Megabit", "Miyazya",
    "Ginbot", "Sene", "Hamle", "Nehase", "Pagumen"
  ];

  // Compute current Ethiopian year (approx)
  function getCurrentEthiopianYear() {
    const today = new Date();
    const gy = today.getFullYear();
    const gm = today.getMonth() + 1;
    const gd = today.getDate();
    return (gm > 9 || (gm === 9 && gd >= 11)) ? gy - 7 : gy - 8;
  }
  const currentECYear = getCurrentEthiopianYear();

  // Populate helpers
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
    selectEl.innerHTML = "";
    for (let d = 1; d <= days; d++) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      if (d === 1) opt.selected = true;
      selectEl.appendChild(opt);
    }
  }

  // Initialize selects
  populateYears(ethYear);
  populateMonths(ethMonth);
  populateDays(ethDay, 30);
  populateYears(editYear);
  populateMonths(editMonth);
  populateDays(editDay, 30);

  // Month change handlers
  ethMonth.addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    populateDays(ethDay, v === 13 ? 6 : 30);
  });
  editMonth.addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    populateDays(editDay, v === 13 ? 6 : 30);
  });

  // Ensure selects set when modal opens
  if (addModalEl) {
    addModalEl.addEventListener("show.bs.modal", () => {
      populateYears(ethYear);
      populateMonths(ethMonth);
      populateDays(ethDay, parseInt(ethMonth.value, 10) === 13 ? 6 : 30);
      ethYear.value = currentECYear;
      ethMonth.value = 1;
      ethDay.value = 1;
    });
  }
  if (editModalEl) {
    editModalEl.addEventListener("show.bs.modal", () => {
      populateYears(editYear);
      populateMonths(editMonth);
      populateDays(editDay, parseInt(editMonth.value, 10) === 13 ? 6 : 30);
    });
  }

  // Firestore collection ref
  let entriesCollectionRef = null;
  if (db && collection) {
    try {
      entriesCollectionRef = collection(db, "entries");
      console.log("Firestore collection initialized successfully!");
    } catch (err) {
      console.error("Failed to initialize Firestore collection:", err);
      alert("Failed to connect to Firestore. Data will not persist. Check console.");
    }
  } else {
    console.warn("Firestore not available; running local-only.");
    alert("Firestore unavailable. Data will not persist across refreshes.");
  }

  // Render function
  let currentEditingCard = null;
  function renderEntry(id, date, note) {
    const existing = document.querySelector(`[data-id="${id}"]`);
    if (existing) {
      const h6 = existing.querySelector("h6");
      const p = existing.querySelector("p");
      if (h6) h6.textContent = date;
      if (p) p.textContent = note;
      return;
    }

    const col = document.createElement("div");
    col.className = "col-12";
    col.setAttribute("data-id", id);

    col.innerHTML = `
      <div class="card entry-card shadow-sm mb-3">
        <div class="card-body">
          <h6 class="card-subtitle mb-2 text-muted">${date}</h6>
          <p class="card-text">${note}</p>
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button class="btn btn-sm btn-warning edit-btn">Edit</button>
            <button class="btn btn-sm btn-danger delete-btn">Delete</button>
          </div>
        </div>
      </div>
    `;

    // Edit click
    col.querySelector(".edit-btn").addEventListener("click", () => {
      currentEditingCard = col;
      const dateParts = date.split(" ");
      const day = dateParts[0] || "1";
      const monthName = dateParts[1] || ethiopianMonths[0];
      const year = dateParts[2] || currentECYear;

      editYear.value = year;
      editMonth.value = ethiopianMonths.indexOf(monthName) + 1 || 1;
      populateDays(editDay, parseInt(editMonth.value, 10) === 13 ? 6 : 30);
      editDay.value = day;
      editText.value = note || "";
      currentEditingCard.dataset.id = id;

      const modal = new bootstrap.Modal(document.getElementById("editModal"));
      modal.show();
    });

    // Delete click
    col.querySelector(".delete-btn").addEventListener("click", async () => {
      if (!confirm("Delete this entry?")) return;
      if (!entriesCollectionRef) {
        col.remove();
        return;
      }
      try {
        await deleteDoc(doc(db, "entries", id));
      } catch (err) {
        console.error("Delete failed:", err);
        alert("Failed to delete entry. Check console.");
      }
    });

    entries.prepend(col);
  }

  // Real-time listener
  if (entriesCollectionRef && onSnapshot) {
    try {
      onSnapshot(entriesCollectionRef, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const id = change.doc.id;
          const data = change.doc.data() || {};
          if (change.type === "added" || change.type === "modified") {
            renderEntry(id, data.date || "Unknown Date", data.note || "");
          } else if (change.type === "removed") {
            const el = document.querySelector(`[data-id="${id}"]`);
            if (el) el.remove();
          }
        });
      }, (err) => {
        console.error("Firestore listener error:", err);
        alert("Failed to load entries. Check console.");
      });
    } catch (err) {
      console.error("Failed to set up Firestore listener:", err);
      alert("Failed to load entries. Check console.");
    }
  }

  // Add entry submit
  entryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const year = ethYear.value;
    const month = ethiopianMonths[ethMonth.value - 1] || ethiopianMonths[0];
    const day = ethDay.value;
    const note = (document.getElementById("text")?.value || "").trim();
    if (!year || !month || !day || !note) {
      alert("Please fill all fields.");
      return;
    }
    const dateStr = `${day} ${month} ${year} EC`;

    if (!entriesCollectionRef) {
      const tempId = `local-${Date.now()}`;
      renderEntry(tempId, dateStr, note);
    } else {
      try {
        await addDoc(entriesCollectionRef, {
          date: dateStr,
          note: note,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Add entry failed:", err);
        alert("Failed to save entry. Check console.");
      }
    }

    entryForm.reset();
    populateDays(ethDay, 30);
    const addModal = bootstrap.Modal.getInstance(addModalEl);
    if (addModal) addModal.hide();
  });

  // Edit submit
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentEditingCard) {
      alert("No entry selected for editing.");
      return;
    }
    const year = editYear.value;
    const month = ethiopianMonths[editMonth.value - 1] || ethiopianMonths[0];
    const day = editDay.value;
    const note = editText.value.trim();
    const id = currentEditingCard.dataset.id;
    if (!id) {
      alert("Missing entry ID.");
      return;
    }
    const dateStr = `${day} ${month} ${year} EC`;

    if (!entriesCollectionRef) {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) {
        el.querySelector("h6").textContent = dateStr;
        el.querySelector("p").textContent = note;
      }
    } else {
      try {
        await updateDoc(doc(db, "entries", id), {
          date: dateStr,
          note: note,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Update failed:", err);
        alert("Failed to update entry. Check console.");
      }
    }
    const modal = bootstrap.Modal.getInstance(editModalEl);
    if (modal) modal.hide();
    currentEditingCard = null;
  });

  // PDF export
  const pdfBtn = document.getElementById("pdfBtn");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        alert("jsPDF not loaded");
        return;
      }
      const docPDF = new jsPDF();
      let y = 20;
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(16);
      docPDF.text("Daily Knows", 105, 10, { align: "center" });
      docPDF.setFont("helvetica", "normal");
      docPDF.setFontSize(12);

      const allEntries = document.querySelectorAll(".entry-card .card-body");
      if (allEntries.length === 0) {
        docPDF.text("No entries available.", 10, y);
      } else {
        allEntries.forEach((entry) => {
          const date = entry.querySelector("h6")?.textContent || "";
          const text = entry.querySelector("p")?.textContent || "";

          docPDF.setFont("helvetica", "bold");
          docPDF.text(date, 10, y);
          y += 8;

          docPDF.setFont("helvetica", "normal");
          const splitText = docPDF.splitTextToSize(text, 180);
          docPDF.text(splitText, 15, y);
          y += splitText.length * 7 + 5;

          if (y > 270) {
            docPDF.addPage();
            y = 20;
          }
        });
      }
      docPDF.save("DailyKnows.pdf");
    });
  }

  console.log("script.js initialized");
});