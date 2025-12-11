// /js/reservations.js
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const { db } = window._firebase;

// Onglets
const tabArticles = document.getElementById("tab-articles");
const tabMouvements = document.getElementById("tab-mouvements");
const tabReservations = document.getElementById("tab-reservations");
const tabPreparations = document.getElementById("tab-preparations");

// Sections
const articlesSection = document.getElementById("articlesSection");
const mouvementsSection = document.getElementById("mouvementsSection");
const reservationsSection = document.getElementById("reservationsSection");
const preparationsSection = document.getElementById("preparationsSection");

// Tableau réservations
const reservBody = document.getElementById("reservationsBody");
const reservSearchInput = document.getElementById("reservSearchInput");
const btnNewReservation = document.getElementById("btnNewReservation");

// Modale panier
const panierModalBackdrop = document.getElementById("panierModalBackdrop");
const panierForm = document.getElementById("panierForm");
const panierTitle = document.getElementById("panierModalTitle");
const selectAffaire = document.getElementById("p_affaire");
const inputDateDispo = document.getElementById("p_date");
const btnPanierAddLine = document.getElementById("btnPanierAddLine");
const panierBody = document.getElementById("panierBody");
const btnPanierCancel = document.getElementById("btnPanierCancel");
const btnPanierClose = document.getElementById("panierModalClose");

// Données
let reservations = [];
let affaires = [];
let articles = [];
let statsParArticle = {}; // récupéré depuis window.statsParArticleGlobal
let panierLignes = []; // {idTemp, articleId, quantite}

// Helpers
function formatDateFR(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : date.toDate ? date.toDate() : null;
  if (!d) return "";
  return d.toLocaleDateString("fr-FR");
}

function formatNombre(n, decimals = 2) {
  if (n == null || isNaN(n)) return "";
  return Number(n).toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// Gestion onglets
function showSection(section) {
  articlesSection.style.display = section === "articles" ? "block" : "none";
  mouvementsSection.style.display = section === "mouvements" ? "block" : "none";
  reservationsSection.style.display = section === "reservations" ? "block" : "none";
  preparationsSection.style.display = section === "preparations" ? "block" : "none";

  tabArticles.classList.toggle("active", section === "articles");
  tabMouvements.classList.toggle("active", section === "mouvements");
  tabReservations.classList.toggle("active", section === "reservations");
  tabPreparations.classList.toggle("active", section === "preparations");
}

if (tabArticles && tabMouvements && tabReservations && tabPreparations) {
  tabArticles.addEventListener("click", () => showSection("articles"));
  tabMouvements.addEventListener("click", () => showSection("mouvements"));
  tabReservations.addEventListener("click", () => showSection("reservations"));
  tabPreparations.addEventListener("click", () => showSection("preparations"));
}

// Chargement données
async function chargerAffaires() {
  const snap = await getDocs(collection(db, "affaires"));
  affaires = [];
  snap.forEach(doc => {
    affaires.push({ id: doc.id, ...doc.data() });
  });

  selectAffaire.innerHTML = "";
  affaires.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    const code = a.code || "";
    const lib = a.libelle || "";
    opt.textContent = code && lib ? `${code} - ${lib}` : (code || lib);
    selectAffaire.appendChild(opt);
  });
}

async function chargerArticlesPourPanier() {
  const snap = await getDocs(collection(db, "articles"));
  articles = [];
  snap.forEach(doc => {
    articles.push({ id: doc.id, ...doc.data() });
  });
}

async function chargerReservations() {
  const snap = await getDocs(collection(db, "reservations"));
  reservations = [];
  snap.forEach(doc => {
    reservations.push({ id: doc.id, ...doc.data() });
  });
  renderReservations(reservations);
}

function renderReservations(data) {
  reservBody.innerHTML = "";
  data.forEach(r => {
    const tr = document.createElement("tr");

    const affaireLabel =
      r.affaireLibelle ||
      r.codeAffaire ||
      r.affaireId ||
      "";

    const articleLabel =
      `${r.marque || ""} ${r.reference || ""} ${r.libelle || ""}`.trim() ||
      r.articleLabel ||
      r.articleId ||
      "";

    const tdAffaire = document.createElement("td");
    tdAffaire.textContent = affaireLabel;

    const tdArticle = document.createElement("td");
    tdArticle.textContent = articleLabel;

    const tdQte = document.createElement("td");
    tdQte.textContent = formatNombre(r.quantite, 2);

    const tdDate = document.createElement("td");
    tdDate.textContent = formatDateFR(r.dateDisponibilite || r.dateMiseADisposition);

    const tdStatut = document.createElement("td");
    tdStatut.textContent = r.statut || "";

    tr.appendChild(tdAffaire);
    tr.appendChild(tdArticle);
    tr.appendChild(tdQte);
    tr.appendChild(tdDate);
    tr.appendChild(tdStatut);

    reservBody.appendChild(tr);
  });
}

// Recherche dans la liste des réservations
reservSearchInput.addEventListener("input", () => {
  const q = reservSearchInput.value.trim().toLowerCase();
  if (!q) {
    renderReservations(reservations);
    return;
  }
  const filtered = reservations.filter(r => {
    const affaireLabel =
      r.affaireLibelle ||
      r.codeAffaire ||
      r.affaireId ||
      "";
    const articleLabel =
      `${r.marque || ""} ${r.reference || ""} ${r.libelle || ""}`.trim() ||
      r.articleLabel ||
      r.articleId ||
      "";
    const haystack = `${affaireLabel} ${articleLabel} ${r.statut || ""}`.toLowerCase();
    return haystack.includes(q);
  });
  renderReservations(filtered);
});

// Panier (modale)
function openPanierModal() {
  panierTitle.textContent = "Nouvelle réservation";
  panierForm.reset();
  panierLignes = [];
  panierBody.innerHTML = "";
  inputDateDispo.valueAsDate = new Date();
  panierModalBackdrop.classList.add("open");
}

function closePanierModal() {
  panierModalBackdrop.classList.remove("open");
}

btnNewReservation.addEventListener("click", async () => {
  await chargerAffaires();
  await chargerArticlesPourPanier();
  openPanierModal();
});

btnPanierCancel.addEventListener("click", () => {
  closePanierModal();
});

btnPanierClose.addEventListener("click", () => {
  closePanierModal();
});

panierModalBackdrop.addEventListener("click", (e) => {
  if (e.target === panierModalBackdrop) closePanierModal();
});

btnPanierAddLine.addEventListener("click", () => {
  ajouterLignePanier();
});

// === Combobox article + ligne de panier ===
function ajouterLignePanier() {
  const idTemp = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  panierLignes.push({ idTemp, articleId: "", quantite: 0 });

  const tr = document.createElement("tr");
  tr.dataset.id = idTemp;

  // Colonne Article : combobox filtrable
  const tdArticle = document.createElement("td");
  const comboWrapper = document.createElement("div");
  comboWrapper.style.position = "relative";

  const inputArticle = document.createElement("input");
  inputArticle.type = "text";
  inputArticle.placeholder = "Rechercher un article…";
  inputArticle.autocomplete = "off";
  inputArticle.style.width = "100%";

  const resultsBox = document.createElement("div");
  resultsBox.style.position = "absolute";
  resultsBox.style.left = "0";
  resultsBox.style.right = "0";
  resultsBox.style.top = "100%";
  resultsBox.style.zIndex = "10";
  resultsBox.style.maxHeight = "220px";
  resultsBox.style.overflowY = "auto";
  resultsBox.style.background = "#18181c";
  resultsBox.style.border = "1px solid #2b2b33";
  resultsBox.style.borderRadius = "8px";
  resultsBox.style.boxShadow = "0 18px 40px rgba(0,0,0,0.7)";
  resultsBox.style.display = "none";

  function renderArticleResults(query) {
    const q = query.trim().toLowerCase();
    resultsBox.innerHTML = "";

    if (!q) {
      resultsBox.style.display = "none";
      return;
    }

    const matches = articles
      .filter(a => {
        const label = `${a.marque || ""} ${a.reference || ""} ${a.libelle || ""}`.toLowerCase();
        return label.includes(q);
      })
      .slice(0, 30);

    if (!matches.length) {
      resultsBox.style.display = "none";
      return;
    }

    matches.forEach(a => {
      const item = document.createElement("div");
      item.textContent = `${a.marque || ""} - ${a.reference || ""} - ${a.libelle || ""}`;
      item.style.padding = "6px 10px";
      item.style.cursor = "pointer";
      item.style.fontSize = "12px";

      item.addEventListener("mouseenter", () => {
        item.style.background = "#262635";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });

      item.addEventListener("click", () => {
        inputArticle.value = item.textContent;
        const ligne = panierLignes.find(l => l.idTemp === idTemp);
        if (ligne) ligne.articleId = a.id;
        resultsBox.style.display = "none";
      });

      resultsBox.appendChild(item);
    });

    resultsBox.style.display = "block";
  }

  inputArticle.addEventListener("input", () => {
    renderArticleResults(inputArticle.value);
  });

  document.addEventListener("click", (e) => {
    if (!comboWrapper.contains(e.target)) {
      resultsBox.style.display = "none";
    }
  });

  comboWrapper.appendChild(inputArticle);
  comboWrapper.appendChild(resultsBox);
  tdArticle.appendChild(comboWrapper);

  // Colonne Quantité
  const tdQte = document.createElement("td");
  const inputQte = document.createElement("input");
  inputQte.type = "number";
  inputQte.min = "0.01";
  inputQte.step = "0.01";
  inputQte.required = true;
  inputQte.addEventListener("input", () => {
    const ligne = panierLignes.find(l => l.idTemp === idTemp);
    if (ligne) ligne.quantite = Number(inputQte.value) || 0;
  });
  tdQte.appendChild(inputQte);

  // Colonne actions
  const tdActions = document.createElement("td");
  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.textContent = "Supprimer";
  btnDel.classList.add("secondary");
  btnDel.addEventListener("click", () => {
    panierLignes = panierLignes.filter(l => l.idTemp !== idTemp);
    tr.remove();
  });
  tdActions.appendChild(btnDel);

  tr.appendChild(tdArticle);
  tr.appendChild(tdQte);
  tr.appendChild(tdActions);

  panierBody.appendChild(tr);
}

// Réservé existant pour un article (en_cours + valide)
async function chargerReservationsPourCalcul(articleId) {
  const snap = await getDocs(collection(db, "reservations"));
  let totalRes = 0;
  snap.forEach(doc => {
    const r = doc.data();
    if (r.articleId === articleId && (r.statut === "en_cours" || r.statut === "valide")) {
      totalRes += Number(r.quantite) || 0;
    }
  });
  return totalRes;
}

// Récupérer statsParArticle calculé dans article.js
if (window.statsParArticleGlobal) {
  statsParArticle = window.statsParArticleGlobal;
}

// PDF bons d'achat (jsPDF)
function genererBonAchatPDF(affaireLibelle, manquants) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const titre = "Bon d'achat - Articles manquants";
  doc.setFontSize(14);
  doc.text(titre, 10, 10);
  doc.setFontSize(10);
  doc.text(`Affaire : ${affaireLibelle}`, 10, 18);
  doc.text(`Date : ${new Date().toLocaleString("fr-FR")}`, 10, 24);

  let y = 32;
  doc.setFontSize(10);
  doc.text("MARQUE", 10, y);
  doc.text("REFERENCE", 50, y);
  doc.text("LIBELLE", 90, y);
  doc.text("CUMP", 150, y);
  doc.text("QTE MANQ.", 175, y);
  y += 6;

  manquants.forEach(m => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(m.marque || "", 10, y);
    doc.text(m.reference || "", 50, y);
    doc.text((m.libelle || "").substring(0, 35), 90, y);
    doc.text(formatNombre(m.cump, 2), 150, y);
    doc.text(formatNombre(m.qteManquante, 2), 175, y);
    y += 5;
  });

  const nomFichier = `bon_achat_${affaireLibelle || ""}.pdf`.replace(/\s+/g, "_");
  doc.save(nomFichier || "bon_achat.pdf");
}

// Validation panier
panierForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const affaireId = selectAffaire.value;
  if (!affaireId) {
    alert("Sélectionner une affaire.");
    return;
  }

  const affaireObj = affaires.find(a => a.id === affaireId);
  const codeAffaire = affaireObj?.code || "";
  const libAffaire = affaireObj?.libelle || "";
  const affaireLibelle = codeAffaire && libAffaire
    ? `${codeAffaire} - ${libAffaire}`
    : (codeAffaire || libAffaire || affaireId);

  if (!inputDateDispo.value) {
    alert("Saisir une date de mise à disposition.");
    return;
  }

  const dateDispo = new Date(inputDateDispo.value);
  const lignesValides = panierLignes.filter(l => l.articleId && l.quantite > 0);
  if (!lignesValides.length) {
    alert("Ajouter au moins une ligne avec article et quantité.");
    return;
  }

  const userName = sessionStorage.getItem("userName") || "";

  statsParArticle = window.statsParArticleGlobal || {};
  const manquants = [];

  for (const ligne of lignesValides) {
    const article = articles.find(a => a.id === ligne.articleId);
    if (!article) continue;

    const stats = statsParArticle[ligne.articleId] || { stock: 0, cump: 0 };
    const stockPhysique = Number(stats.stock) || 0;
    const reserveExistante = await chargerReservationsPourCalcul(ligne.articleId);
    const stockDisponible = stockPhysique - reserveExistante;
    const qDemandee = Number(ligne.quantite) || 0;

    let qReserve = 0;
    let qManquante = 0;

    if (stockDisponible >= qDemandee) {
      qReserve = qDemandee;
      qManquante = 0;
    } else if (stockDisponible > 0) {
      qReserve = stockDisponible;
      qManquante = qDemandee - stockDisponible;
    } else {
      qReserve = 0;
      qManquante = qDemandee;
    }

    // réservation pour la partie disponible
    if (qReserve > 0) {
      await addDoc(collection(db, "reservations"), {
        affaireId,
        codeAffaire,
        affaireLibelle,
        articleId: ligne.articleId,
        marque: article.marque || "",
        reference: article.reference || "",
        libelle: article.libelle || "",
        articleLabel: `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`.trim(),
        articleAllee: article.allee || "",
        articlePlace: article.place || "",
        articleNiveau: article.niveau || "",
        quantite: qReserve,
        dateDisponibilite: dateDispo,
        statut: "en_cours",
        prixUnitaire: stats.cump || 0,
        createdBy: userName,
        createdAt: serverTimestamp()
      });
    }

    // partie manquante pour bon d'achat
    if (qManquante > 0) {
      manquants.push({
        marque: article.marque || "",
        reference: article.reference || "",
        libelle: article.libelle || "",
        cump: stats.cump || 0,
        qteManquante: qManquante
      });
    }
  }

  // recharger réservations
  await chargerReservations();

  // recharger articles (stock et stock dispo)
  if (window.rechargerArticlesDepuisReservations) {
    await window.rechargerArticlesDepuisReservations();
  }

  // recharger préparations (J+1)
  if (window.rechargerPreparationsDepuisArticles) {
    await window.rechargerPreparationsDepuisArticles();
  }

  // générer bon d'achat si manquants
  if (manquants.length > 0) {
    genererBonAchatPDF(affaireLibelle, manquants);
  }

  panierLignes = [];
  panierBody.innerHTML = "";
  closePanierModal();
});

// Initialisation + tri
(async function initReservations() {
  await chargerReservations();

  const tableRes = document.getElementById("reservationsTable");
  if (tableRes && window.makeTableSortable) {
    window.makeTableSortable(tableRes, [
      "string", "string", "number", "date", "string"
    ]);
  }
})();
