// /js/article.js
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { ajouterArticle, modifierArticle, supprimerArticle } from "./articles-add.js";

console.log("XLSX global = ", window.XLSX);
console.log("type de XLSX =", typeof window.XLSX);

const name = sessionStorage.getItem("userName");
const role = sessionStorage.getItem("userRole");

if (!name) {
  window.location.href = "index.html";
}

// Infos user
document.getElementById("currentUser").textContent = name;
document.getElementById("userRoleLabel").textContent = role ? role : "";

// Date / heure
function updateDateTime() {
  const now = new Date();
  document.getElementById("datetime").textContent = now.toLocaleString("fr-FR");
}
updateDateTime();
setInterval(updateDateTime, 1000);

// Firestore
const { db } = window._firebase;

// DOM
const tbody = document.getElementById("articlesBody");
const searchInput = document.getElementById("searchInput");
const btnAdd = document.getElementById("btnAdd");
const btnEdit = document.getElementById("btnEdit");
const btnDelete = document.getElementById("btnDelete");
const valeurStockTotalEl = document.getElementById("valeurStockTotal");
const btnPrintStock = document.getElementById("btnPrintStock");
const btnImportArticles = document.getElementById("btnImportArticles");
const importFileInput = document.getElementById("importFileInput");

const modalBackdrop = document.getElementById("articleModalBackdrop");
const modalTitle = document.getElementById("articleModalTitle");
const modalForm = document.getElementById("articleForm");
const btnModalCancel = document.getElementById("btnModalCancel");

const inputMarque = document.getElementById("f_marque");
const inputRef = document.getElementById("f_reference");
const inputLibelle = document.getElementById("f_libelle");
const selectUnite = document.getElementById("f_unite");
const inputCategorie = document.getElementById("f_categorie");
const inputAllee = document.getElementById("f_allee");
const inputPlace = document.getElementById("f_place");
const inputNiveau = document.getElementById("f_niveau");

// State
let articles = [];
let mouvements = [];
let reservationsActives = [];
let statsParArticle = {};
let selectedId = null;
let mode = "create";

// Bouton Imprimer visible seulement pour Admin
if (btnPrintStock) {
  btnPrintStock.style.display = role === "admin" ? "inline-flex" : "none";
}

// Bouton Import visible seulement pour Admin
if (btnImportArticles) {
  btnImportArticles.style.display = role === "admin" ? "inline-flex" : "none";
}

/**
 * Calcule les stats d'un article (stock, réserve, dispo, CUMP, valeur)
 */
function calculerStatsArticle(mouvsArticle, reserveQte) {
  const tri = [...mouvsArticle].sort((a, b) => {
    const da = a.date?.toDate ? a.date.toDate() : a.date || new Date(0);
    const db = b.date?.toDate ? b.date.toDate() : b.date || new Date(0);
    return da - db;
  });

  let stockQte = 0;
  let stockValeur = 0;
  let cump = 0;

  tri.forEach((m) => {
    const q = Number(m.quantite) || 0;

    if (m.sens === "entree") {
      const pu = Number(m.prixUnitaire) || 0;
      const valeurEntree = q * pu;
      stockValeur += valeurEntree;
      stockQte += q;
      if (stockQte > 0) cump = stockValeur / stockQte;
    } else if (m.sens === "sortie") {
      stockQte -= q;
      stockValeur -= q * cump;
      if (stockQte <= 0) {
        stockQte = 0;
        stockValeur = 0;
        cump = 0;
      }
    }
  });

  const reserve = Number(reserveQte) || 0;
  const dispo = Math.max(0, stockQte - reserve);
  const valeurStock = stockQte * cump;

  return { stock: stockQte, reserve, dispo, cump, valeur: valeurStock };
}

function formatNombre(n, decimals = 2) {
  if (n == null || isNaN(n)) return "";
  return Number(n).toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Chargement des données Firestore
 */
async function chargerDonnees() {
  const snapArticles = await getDocs(collection(db, "articles"));
  articles = [];
  snapArticles.forEach((doc) => {
    articles.push({ id: doc.id, ...doc.data() });
  });

  const snapMouv = await getDocs(collection(db, "mouvements"));
  mouvements = [];
  snapMouv.forEach((doc) => {
    mouvements.push({ id: doc.id, ...doc.data() });
  });

  const snapRes = await getDocs(collection(db, "reservations"));
  reservationsActives = [];
  snapRes.forEach((doc) => {
    const r = doc.data();
    if (r.articleId && r.statut === "en_cours") {
      reservationsActives.push({ id: doc.id, ...r });
    }
  });

  // Regroupement des mouvements / article
  const parArticle = {};
  mouvements.forEach((m) => {
    if (!m.articleId) return;
    if (!parArticle[m.articleId]) parArticle[m.articleId] = [];
    parArticle[m.articleId].push(m);
  });

  // Réserves par article
  const reserveParArticle = {};
  reservationsActives.forEach((r) => {
    const id = r.articleId;
    const q = Number(r.quantite) || 0;
    if (!reserveParArticle[id]) reserveParArticle[id] = 0;
    reserveParArticle[id] += q;
  });

  statsParArticle = {};
  Object.keys(parArticle).forEach((articleId) => {
    const reserveQte = reserveParArticle[articleId] || 0;
    statsParArticle[articleId] = calculerStatsArticle(parArticle[articleId], reserveQte);
  });

  // Exposition globale pour autres onglets
  window.statsParArticleGlobal = statsParArticle;
  window.rechargerArticlesDepuisReservations = chargerDonnees;
  window.rechargerArticlesDepuisPreparations = chargerDonnees;
  window.rechargerArticlesDepuisMouvements = chargerDonnees;

  renderTable(articles);
  calculerValeurStockTotale();
}

function calculerValeurStockTotale() {
  let total = 0;
  articles.forEach((a) => {
    const stats = statsParArticle[a.id] || { valeur: 0 };
    total += Number(stats.valeur) || 0;
  });
  valeurStockTotalEl.textContent = formatNombre(total, 2);
}

// Fonction appelée depuis mouvements si besoin
window.recalculerArticlesDepuisMouvements = async function () {
  await chargerDonnees();
};

/**
 * Rendu du tableau
 */
function renderTable(data) {
  tbody.innerHTML = "";
  selectedId = null;
  btnEdit.disabled = true;
  btnDelete.disabled = true;

  data.forEach((a) => {
    const tr = document.createElement("tr");
    tr.dataset.id = a.id;

    const tdMarque = document.createElement("td");
    tdMarque.textContent = a.marque || "";

    const tdRef = document.createElement("td");
    tdRef.textContent = a.reference || "";

    const tdLib = document.createElement("td");
    tdLib.className = "libelle";
    tdLib.textContent = a.libelle || "";

    const tdUnite = document.createElement("td");
    const spanUnite = document.createElement("span");
    spanUnite.className = "badge-unite";
    spanUnite.textContent = a.unite || "";
    tdUnite.appendChild(spanUnite);

    const tdCat = document.createElement("td");
    const spanCat = document.createElement("span");
    spanCat.className = "badge-categorie";
    spanCat.textContent = a.categorie || "";
    tdCat.appendChild(spanCat);

    const tdLoc = document.createElement("td");
    tdLoc.className = "location";
    tdLoc.innerHTML = `
      Allée ${a.allee || "-"}<br>
      Place ${a.place || "-"}<br>
      Niveau ${a.niveau || "-"}
    `;

    const stats = statsParArticle[a.id] || { stock: 0, reserve: 0, dispo: 0, cump: 0, valeur: 0 };

    const tdStock = document.createElement("td");
    tdStock.textContent = formatNombre(stats.stock, 2);

    const tdStockDispo = document.createElement("td");
    tdStockDispo.textContent = formatNombre(stats.dispo, 2);

    const tdCump = document.createElement("td");
    tdCump.textContent = formatNombre(stats.cump, 2);

    const tdValeur = document.createElement("td");
    tdValeur.textContent = formatNombre(stats.valeur, 2);

    tr.appendChild(tdMarque);
    tr.appendChild(tdRef);
    tr.appendChild(tdLib);
    tr.appendChild(tdUnite);
    tr.appendChild(tdCat);
    tr.appendChild(tdLoc);
    tr.appendChild(tdStock);
    tr.appendChild(tdStockDispo);
    tr.appendChild(tdCump);
    tr.appendChild(tdValeur);

    tr.addEventListener("click", () => {
      Array.from(tbody.querySelectorAll("tr")).forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      selectedId = a.id;
      btnEdit.disabled = false;
      btnDelete.disabled = false;
    });

    tbody.appendChild(tr);
  });
}

/**
 * Filtre articles
 */
searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    renderTable(articles);
    calculerValeurStockTotale();
    return;
  }

  const filtered = articles.filter((a) => {
    const haystack = [
      a.marque,
      a.reference,
      a.libelle,
      a.unite,
      a.categorie,
      a.allee,
      a.place,
      a.niveau,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });

  renderTable(filtered);
});

/**
 * Modale
 */
function openModalCreate() {
  mode = "create";
  modalTitle.textContent = "Ajouter un article";
  modalForm.reset();
  selectUnite.value = "u";
  modalBackdrop.classList.add("open");
  inputMarque.focus();
}

function openModalEdit(article) {
  mode = "edit";
  modalTitle.textContent = "Modifier l'article";
  inputMarque.value = article.marque || "";
  inputRef.value = article.reference || "";
  inputLibelle.value = article.libelle || "";
  selectUnite.value = article.unite || "u";
  inputCategorie.value = article.categorie || "";
  inputAllee.value = article.allee || "";
  inputPlace.value = article.place || "";
  inputNiveau.value = article.niveau || "";
  modalBackdrop.classList.add("open");
  inputMarque.focus();
}

function closeModal() {
  modalBackdrop.classList.remove("open");
}

// Boutons modale / CRUD
btnAdd.addEventListener("click", openModalCreate);

btnEdit.addEventListener("click", () => {
  if (!selectedId) return;
  const article = articles.find((a) => a.id === selectedId);
  if (article) openModalEdit(article);
});

btnDelete.addEventListener("click", async () => {
  if (!selectedId) return;
  const article = articles.find((a) => a.id === selectedId);
  if (!article) return;

  if (confirm(`Supprimer "${article.libelle || article.reference}" ?`)) {
    try {
      await supprimerArticle(selectedId);
      articles = articles.filter((a) => a.id !== selectedId);
      delete statsParArticle[selectedId];
      renderTable(articles);
      calculerValeurStockTotale();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la suppression de l'article.");
    }
  }
});

btnModalCancel.addEventListener("click", (e) => {
  e.preventDefault();
  closeModal();
});

document.getElementById("articleModalClose").addEventListener("click", closeModal);

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

modalForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = {
    marque: inputMarque.value.trim(),
    reference: inputRef.value.trim(),
    libelle: inputLibelle.value.trim(),
    unite: selectUnite.value,
    categorie: inputCategorie.value.trim(),
    allee: inputAllee.value.trim(),
    place: inputPlace.value.trim(),
    niveau: inputNiveau.value.trim(),
  };

  try {
    if (mode === "create") {
      const newArticle = await ajouterArticle(data);
      articles.push(newArticle);
    } else if (mode === "edit" && selectedId) {
      const updated = await modifierArticle(selectedId, data);
      const index = articles.findIndex((a) => a.id === selectedId);
      if (index !== -1) articles[index] = updated;
    }

    await chargerDonnees();
    closeModal();
  } catch (err) {
    console.error("Erreur sauvegarde article", err);
    alert("Erreur lors de l'enregistrement de l'article.");
  }
});

/**
 * ===== IMPORT EXCEL ARTICLES (admin uniquement) =====
 * Accepte:
 * - format "attendu": allee, categorie, libelle, marque, niveau, place, reference, unite
 * - ET aussi tes fichiers avec en-têtes du type: Allée, Libelé/Libellé, MARQUE, REF, unite, etc.
 */
async function importerDepuisExcel(file) {
  if (!file) return;
  if (!window.XLSX) {
    alert("Bibliothèque XLSX non chargée.");
    return;
  }

  const normalizeKey = (s) =>
    String(s ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // retire les accents

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];

      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const withKeyMap = json.map((row) => {
        const keymap = {};
        Object.keys(row).forEach((k) => (keymap[normalizeKey(k)] = k));
        return { ...row, __keymap: keymap };
      });

      const getVal = (row, ...cands) => {
        const map = row.__keymap || {};
        for (const c of cands) {
          const k = map[normalizeKey(c)];
          if (k !== undefined) return row[k];
        }
        return undefined;
      };

      const aInserer = withKeyMap
        .map((row) => ({
          allee: String(getVal(row, "allee", "allée") ?? "").trim(),
          categorie: String(getVal(row, "categorie", "catégorie") ?? "").trim(),
          libelle: String(getVal(row, "libelle", "libellé", "libelé", "designation", "désignation") ?? "").trim(),
          marque: String(getVal(row, "marque", "marque de l'article", "marque article", "MARQUE") ?? "").trim(),
          niveau: String(getVal(row, "niveau") ?? "").trim(),
          place: String(getVal(row, "place", "part", "emplacement", "rack") ?? "").trim(),
          reference: String(getVal(row, "reference", "référence", "ref") ?? "").trim(),
          unite: String(getVal(row, "unite", "unité") ?? "").trim() || "u",
        }))
        .filter((a) => a.reference || a.libelle);

      if (!aInserer.length) {
        alert("Aucune ligne valide trouvée dans le fichier.");
        return;
      }

      if (!confirm(`Importer ${aInserer.length} articles depuis Excel ?`)) return;

      for (const art of aInserer) {
        try {
          await ajouterArticle(art);
        } catch (err) {
          console.error("Erreur import article", art.reference, err);
        }
      }

      await chargerDonnees();
      alert("Import terminé.");
    } catch (err) {
      console.error("Erreur lecture Excel", err);
      alert("Erreur lors de la lecture du fichier Excel.");
    } finally {
      importFileInput.value = "";
    }
  };

  reader.readAsArrayBuffer(file);
}

if (btnImportArticles && importFileInput && role === "admin") {
  btnImportArticles.addEventListener("click", () => {
    importFileInput.click();
  });

  importFileInput.addEventListener("change", () => {
    const file = importFileInput.files[0];
    if (file) importerDepuisExcel(file);
  });
}

/**
 * ===== Impression PDF du stock (Admin) =====
 * Logo: assets/logo.png
 * Footer: infos société
 */
async function genererPdfStock() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Helpers
  const formatDateCourt = (d) => d.toLocaleString("fr-FR");
  const safe = (v) => String(v ?? "");
  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // Page metrics
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginL = 10;
  const marginR = 10;
  const marginB = 12;

  // Branding / footer
  const logoUrl = "assets/logo.png";
  const footerLine1 = "Siège social – 4 Rue aux Saussaies des Dames  F57950 Montigny lès Metz";
  const footerLine2 = "Code APE 4321A – SAS au capital de 300 000 euros";

  // Table layout (mm)
  const cols = [
    { key: "marque", label: "Marque", w: 28, align: "left" },
    { key: "reference", label: "Référence", w: 28, align: "left" },
    { key: "libelle", label: "Libellé", w: 74, align: "left" },
    { key: "stock", label: "Stock", w: 18, align: "right" },
    { key: "cump", label: "CUMP", w: 18, align: "right" },
    { key: "empl", label: "Empl.", w: 24, align: "right" },
  ];

  // Colors
  const cHeaderBg = [2, 6, 23];
  const cHeaderText = [229, 231, 235];
  const cRowAlt = [248, 250, 252];
  const cRow = [255, 255, 255];
  const cBorder = [226, 232, 240];
  const cText = [15, 23, 42];
  const cMuted = [71, 85, 105];
  const cBrand = [234, 88, 12];

  // Data
  const articlesEnStock = articles.filter((a) => {
    const stats = statsParArticle[a.id] || { stock: 0 };
    return (Number(stats.stock) || 0) > 0;
  });

  articlesEnStock.sort((a, b) => {
    const am = safe(a.marque).localeCompare(safe(b.marque));
    if (am !== 0) return am;
    return safe(a.reference).localeCompare(safe(b.reference));
  });

  async function loadImageAsDataURL(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Logo introuvable: " + url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  let logoDataUrl = null;
  try {
    logoDataUrl = await loadImageAsDataURL(logoUrl);
  } catch (e) {
    console.warn("Logo non chargé, PDF sans logo.", e);
  }

  function drawHeader() {
    doc.setFillColor(...cHeaderBg);
    doc.rect(0, 0, pageWidth, 26, "F");

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "PNG", marginL, 6, 40, 14);
    }

    doc.setTextColor(...cHeaderText);
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.text("Inventaire des articles en stock", pageWidth / 2, 12, { align: "center" });

    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    doc.text(`Généré le : ${formatDateCourt(new Date())}`, pageWidth - marginR, 20, { align: "right" });

    doc.setDrawColor(...cBrand);
    doc.setLineWidth(0.6);
    doc.line(marginL, 26, pageWidth - marginR, 26);

    doc.setTextColor(...cText);
  }

  function drawFooter(pageIndex, totalPages) {
    const y = pageHeight - marginB;

    doc.setDrawColor(...cBorder);
    doc.setLineWidth(0.3);
    doc.line(marginL, y - 6, pageWidth - marginR, y - 6);

    doc.setFontSize(8.5);
    doc.setTextColor(...cMuted);
    doc.text(footerLine1, marginL, y - 2);
    doc.text(footerLine2, marginL, y + 2);
    doc.text(`Page ${pageIndex} / ${totalPages}`, pageWidth - marginR, y + 2, { align: "right" });

    doc.setTextColor(...cText);
  }

  function drawTableHeader(y) {
    const x0 = marginL;
    const h = 8;

    doc.setFillColor(...cHeaderBg);
    doc.rect(x0, y, pageWidth - marginL - marginR, h, "F");

    doc.setTextColor(...cHeaderText);
    doc.setFontSize(8);
    doc.setFont(undefined, "bold");

    let x = x0;
    cols.forEach((col) => {
      const tx = col.align === "right" ? x + col.w - 1.5 : x + 1.5;
      doc.text(col.label, tx, y + 5.5, { align: col.align });
      x += col.w;
    });

    doc.setFont(undefined, "normal");
    doc.setTextColor(...cText);

    doc.setDrawColor(...cBorder);
    doc.setLineWidth(0.3);
    doc.line(x0, y + h, pageWidth - marginR, y + h);

    return y + h;
  }

  function drawRow(y, row, isAlt) {
    const x0 = marginL;
    const h = 7;

    doc.setFillColor(...(isAlt ? cRowAlt : cRow));
    doc.rect(x0, y, pageWidth - marginL - marginR, h, "F");

    doc.setFontSize(8.5);
    doc.setTextColor(...cText);

    let x = x0;
    const cells = {
      marque: truncate(safe(row.marque), 22),
      reference: truncate(safe(row.reference), 22),
      libelle: truncate(safe(row.libelle), 55),
      stock: formatNombre(row.stock, 2),
      cump: formatNombre(row.cump, 2),
      empl: truncate(safe(row.empl), 18),
    };

    cols.forEach((col) => {
      const text = safe(cells[col.key]);
      const tx = col.align === "right" ? x + col.w - 1.5 : x + 1.5;
      doc.text(text, tx, y + 4.8, { align: col.align });
      x += col.w;
    });

    doc.setDrawColor(...cBorder);
    doc.setLineWidth(0.2);
    doc.line(x0, y + h, pageWidth - marginR, y + h);

    return y + h;
  }

  const rows = articlesEnStock.map((a) => {
    const stats = statsParArticle[a.id] || { stock: 0, cump: 0 };
    const location = `A${a.allee || "-"} P${a.place || "-"} N${a.niveau || "-"}`;
    return {
      marque: a.marque || "",
      reference: a.reference || "",
      libelle: a.libelle || "",
      stock: Number(stats.stock) || 0,
      cump: Number(stats.cump) || 0,
      empl: location,
    };
  });

  let page = 1;
  drawHeader();

  let y = 32;
  y = drawTableHeader(y);

  const yMax = pageHeight - marginB - 10;
  rows.forEach((r, i) => {
    if (y + 7 > yMax) {
      doc.addPage();
      page++;
      drawHeader();
      y = 32;
      y = drawTableHeader(y);
    }
    y = drawRow(y, r, i % 2 === 1);
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  doc.save("inventaire_stock.pdf");
}

// Bouton "Imprimer le stock" (Admin) — version robuste
if (btnPrintStock) {
  btnPrintStock.addEventListener("click", async () => {
    try {
      await genererPdfStock();
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      alert("Erreur lors de la génération du PDF (voir console).");
    }
  });
}

// Initialisation + tri
chargerDonnees().then(() => {
  const tableArticles = document.getElementById("articlesTable");
  if (tableArticles && window.makeTableSortable) {
    window.makeTableSortable(tableArticles, [
      "string", "string", "string", "string", "string", "string",
      "number", "number", "number", "number",
    ]);
  }
});
