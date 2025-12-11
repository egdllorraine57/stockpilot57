// /js/article.js
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ajouterArticle,
  modifierArticle,
  supprimerArticle
} from "./articles-add.js";

document.addEventListener("DOMContentLoaded", () => {

  const name = sessionStorage.getItem("userName");
  const role = sessionStorage.getItem("userRole");

  if (!name) {
    window.location.href = "index.html";
    return;
  }

  const currentUserEl = document.getElementById("currentUser");
  const userRoleLabelEl = document.getElementById("userRoleLabel");
  if (currentUserEl) currentUserEl.textContent = name;
  if (userRoleLabelEl) userRoleLabelEl.textContent = role ? role : "";

  // Date / heure
  function updateDateTime() {
    const now = new Date();
    const dtEl = document.getElementById("datetime");
    if (dtEl) dtEl.textContent = now.toLocaleString("fr-FR");
  }
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Firestore
  const { db } = window._firebase;

  const tbody = document.getElementById("articlesBody");
  const searchInput = document.getElementById("searchInput");
  const btnAdd = document.getElementById("btnAdd");
  const btnEdit = document.getElementById("btnEdit");
  const btnDelete = document.getElementById("btnDelete");
  const valeurStockTotalEl = document.getElementById("valeurStockTotal");
  const btnPrintStock = document.getElementById("btnPrintStock");

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

  function calculerStatsArticle(mouvsArticle, reserveQte) {
    const tri = [...mouvsArticle].sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : a.date || new Date(0);
      const db = b.date?.toDate ? b.date.toDate() : b.date || new Date(0);
      return da - db;
    });

    let stockQte = 0;
    let stockValeur = 0;
    let cump = 0;

    tri.forEach(m => {
      const q = Number(m.quantite) || 0;
      if (m.sens === "entree") {
        const pu = Number(m.prixUnitaire) || 0;
        const valeurEntree = q * pu;
        stockValeur += valeurEntree;
        stockQte += q;
        if (stockQte > 0) {
          cump = stockValeur / stockQte;
        }
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

    return {
      stock: stockQte,
      reserve,
      dispo,
      cump,
      valeur: valeurStock
    };
  }

  function formatNombre(n, decimals = 2) {
    if (n == null || isNaN(n)) return "";
    return Number(n).toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  async function chargerDonnees() {
    const snapArticles = await getDocs(collection(db, "articles"));
    articles = [];
    snapArticles.forEach(doc => {
      articles.push({ id: doc.id, ...doc.data() });
    });

    const snapMouv = await getDocs(collection(db, "mouvements"));
    mouvements = [];
    snapMouv.forEach(doc => {
      mouvements.push({ id: doc.id, ...doc.data() });
    });

    const snapRes = await getDocs(collection(db, "reservations"));
    reservationsActives = [];
    snapRes.forEach(doc => {
      const r = doc.data();
      if (r.articleId && (r.statut === "en_cours" || r.statut === "valide")) {
        reservationsActives.push({ id: doc.id, ...r });
      }
    });

    const parArticle = {};
    mouvements.forEach(m => {
      if (!m.articleId) return;
      if (!parArticle[m.articleId]) parArticle[m.articleId] = [];
      parArticle[m.articleId].push(m);
    });

    const reserveParArticle = {};
    reservationsActives.forEach(r => {
      const id = r.articleId;
      const q = Number(r.quantite) || 0;
      if (!reserveParArticle[id]) reserveParArticle[id] = 0;
      reserveParArticle[id] += q;
    });

    statsParArticle = {};
    Object.keys(parArticle).forEach(articleId => {
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
    articles.forEach(a => {
      const stats = statsParArticle[a.id] || { valeur: 0 };
      total += Number(stats.valeur) || 0;
    });
    if (valeurStockTotalEl) {
      valeurStockTotalEl.textContent = formatNombre(total, 2);
    }
  }

  window.recalculerArticlesDepuisMouvements = async function () {
    await chargerDonnees();
  };

  function renderTable(data) {
    if (!tbody) return;

    tbody.innerHTML = "";
    selectedId = null;
    if (btnEdit) btnEdit.disabled = true;
    if (btnDelete) btnDelete.disabled = true;

    data.forEach(a => {
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
Allée ${a.allee || "-"} 
Place ${a.place || "-"} 
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
        Array.from(tbody.querySelectorAll("tr")).forEach(r => r.classList.remove("selected"));
        tr.classList.add("selected");
        selectedId = a.id;
        if (btnEdit) btnEdit.disabled = false;
        if (btnDelete) btnDelete.disabled = false;
      });

      tbody.appendChild(tr);
    });
  }

  // Filtre articles
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        renderTable(articles);
        calculerValeurStockTotale();
        return;
      }

      const filtered = articles.filter(a => {
        const haystack = [
          a.marque, a.reference, a.libelle, a.unite,
          a.categorie, a.allee, a.place, a.niveau
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      });

      renderTable(filtered);
    });
  }

  function openModalCreate() {
    if (!modalBackdrop || !modalForm || !selectUnite || !inputMarque) return;
    mode = "create";
    if (modalTitle) modalTitle.textContent = "Ajouter un article";
    modalForm.reset();
    selectUnite.value = "u";
    modalBackdrop.classList.add("open");
    inputMarque.focus();
  }

  function openModalEdit(article) {
    if (!modalBackdrop || !inputMarque) return;
    mode = "edit";
    if (modalTitle) modalTitle.textContent = "Modifier l'article";
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
    if (modalBackdrop) modalBackdrop.classList.remove("open");
  }

  if (btnAdd) {
    btnAdd.addEventListener("click", openModalCreate);
  }

  if (btnEdit) {
    btnEdit.addEventListener("click", () => {
      if (!selectedId) return;
      const article = articles.find(a => a.id === selectedId);
      if (article) openModalEdit(article);
    });
  }

  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      if (!selectedId) return;
      const article = articles.find(a => a.id === selectedId);
      if (!article) return;
      if (confirm(`Supprimer "${article.libelle || article.reference}" ?`)) {
        try {
          await supprimerArticle(selectedId);
          articles = articles.filter(a => a.id !== selectedId);
          delete statsParArticle[selectedId];
          renderTable(articles);
          calculerValeurStockTotale();
        } catch (e) {
          console.error(e);
        }
      }
    });
  }

  if (btnModalCancel) {
    btnModalCancel.addEventListener("click", (e) => {
      e.preventDefault();
      closeModal();
    });
  }

  const articleModalClose = document.getElementById("articleModalClose");
  if (articleModalClose) {
    articleModalClose.addEventListener("click", closeModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  if (modalForm) {
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
        niveau: inputNiveau.value.trim()
      };

      try {
        if (mode === "create") {
          const newArticle = await ajouterArticle(data);
          articles.push(newArticle);
        } else if (mode === "edit" && selectedId) {
          const updated = await modifierArticle(selectedId, data);
          const index = articles.findIndex(a => a.id === selectedId);
          if (index !== -1) articles[index] = updated;
        }

        await chargerDonnees();
        closeModal();
      } catch (err) {
        console.error("Erreur sauvegarde article", err);
      }
    });
  }

  // ===== Impression PDF du stock (Admin) =====
  function genererPdfStock() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const marginLeft = 10;
    let y = 15;

    doc.setFontSize(14);
    doc.text("Inventaire des articles en stock", marginLeft, y);
    y += 8;

    const now = new Date();
    doc.setFontSize(10);
    doc.text(`Généré le : ${now.toLocaleString("fr-FR")}`, marginLeft, y);
    y += 8;

    doc.setFontSize(9);
    doc.text("Marque", marginLeft, y);
    doc.text("Référence", marginLeft + 35, y);
    doc.text("Libellé", marginLeft + 75, y);
    doc.text("Stock", marginLeft + 140, y, { align: "right" });
    doc.text("Empl.", marginLeft + 190, y, { align: "right" });
    y += 5;

    doc.setLineWidth(0.2);
    doc.line(marginLeft, y, 200, y);
    y += 4;

    const articlesEnStock = articles.filter(a => {
      const stats = statsParArticle[a.id] || { stock: 0 };
      return (Number(stats.stock) || 0) > 0;
    });

    doc.setFontSize(9);

    articlesEnStock.forEach(a => {
      const stats = statsParArticle[a.id] || { stock: 0 };
      const stockQte = Number(stats.stock) || 0;

      if (y > 270) {
        doc.addPage();
        y = 15;
      }

      const marque = a.marque || "";
      const reference = a.reference || "";
      const libelle = a.libelle || "";
      const location = `A${a.allee || "-"} P${a.place || "-"} N${a.niveau || "-"}`;

      doc.text(marque.substring(0, 20), marginLeft, y);
      doc.text(reference.substring(0, 20), marginLeft + 35, y);
      doc.text(libelle.substring(0, 50), marginLeft + 75, y);
      doc.text(formatNombre(stockQte, 2), marginLeft + 140, y, { align: "right" });
      doc.text(location, marginLeft + 190, y, { align: "right" });

      y += 5;
    });

    if (y > 250) {
      doc.addPage();
      y = 20;
    } else {
      y += 10;
    }

    doc.setLineWidth(0.2);
    doc.line(marginLeft, y, 200, y);
    y += 8;

    doc.setFontSize(10);
    doc.text(`Document généré le : ${now.toLocaleString("fr-FR")}`, marginLeft, y);
    y += 8;
    doc.text("Certifié conforme, signature : ___________________________", marginLeft, y);

    doc.save("inventaire_stock.pdf");
  }

  if (btnPrintStock) {
    btnPrintStock.addEventListener("click", genererPdfStock);
  }

  // Initialisation + tri
  chargerDonnees().then(() => {
    const tableArticles = document.getElementById("articlesTable");
    if (tableArticles && window.makeTableSortable) {
      window.makeTableSortable(tableArticles, [
        "string", "string", "string", "string", "string", "string",
        "number", "number", "number", "number"
      ]);
    }
  });

}); // fin DOMContentLoaded
