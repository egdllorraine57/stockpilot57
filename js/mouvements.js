// /js/mouvements.js
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const { db } = window._firebase;

// Onglets et sections
const tabArticles = document.getElementById("tab-articles");
const tabMouvements = document.getElementById("tab-mouvements");
const articlesSection = document.getElementById("articlesSection");
const mouvementsSection = document.getElementById("mouvementsSection");

// Table mouvements
const mouvBody = document.getElementById("mouvementsBody");
const mouvSearchInput = document.getElementById("mouvSearchInput");
const btnMouvAdd = document.getElementById("btnMouvAdd");

// Modale Mouvement
const mouvModalBackdrop = document.getElementById("mouvModalBackdrop");
const mouvForm = document.getElementById("mouvForm");
const selectSens = document.getElementById("m_sens");
const selectArticle = document.getElementById("m_article");
const inputQuantite = document.getElementById("m_quantite");
const prixGroup = document.getElementById("m_prix_group");
const inputPrix = document.getElementById("m_prix");
const affaireGroup = document.getElementById("m_affaire_group");
const selectAffaire = document.getElementById("m_affaire");
const btnMouvCancel = document.getElementById("btnMouvCancel");

// Données
let mouvements = [];
let articles = [];
let affaires = [];

// Gestion onglets
function showArticles() {
  tabArticles.classList.add("active");
  tabMouvements.classList.remove("active");
  articlesSection.style.display = "block";
  mouvementsSection.style.display = "none";
}

function showMouvements() {
  tabMouvements.classList.add("active");
  tabArticles.classList.remove("active");
  articlesSection.style.display = "none";
  mouvementsSection.style.display = "block";
}

tabArticles.addEventListener("click", showArticles);
tabMouvements.addEventListener("click", showMouvements);

// Chargement articles & affaires
async function loadArticles() {
  const snap = await getDocs(collection(db, "articles"));
  articles = [];
  selectArticle.innerHTML = "";
  snap.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    articles.push({ id, ...data });
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${data.marque || ""} - ${data.reference || ""} - ${data.libelle || ""}`;
    selectArticle.appendChild(option);
  });
}

async function loadAffaires() {
  const snap = await getDocs(collection(db, "affaires"));
  affaires = [];
  selectAffaire.innerHTML = "";
  snap.forEach(doc => {
    const data = doc.data();
    const id = doc.id;
    affaires.push({ id, ...data });
    const option = document.createElement("option");
    option.value = data.code;
    option.textContent = `${data.code} - ${data.libelle || ""}`;
    selectAffaire.appendChild(option);
  });
}

// Chargement mouvements
async function loadMouvements() {
  const snap = await getDocs(collection(db, "mouvements"));
  mouvements = [];
  snap.forEach(doc => {
    mouvements.push({ id: doc.id, ...doc.data() });
  });
  renderMouvements(mouvements);
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts;
  return d.toLocaleString("fr-FR");
}

function renderMouvements(data) {
  mouvBody.innerHTML = "";
  data.forEach(m => {
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = formatDate(m.date);

    const tdSens = document.createElement("td");
    tdSens.textContent = m.sens === "entree" ? "Entrée" : "Sortie";

    const article = articles.find(a => a.id === m.articleId);
    const tdArt = document.createElement("td");
    tdArt.textContent = article
      ? `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`
      : m.articleId || "";

    const tdQte = document.createElement("td");
    tdQte.textContent = m.quantite != null ? String(m.quantite) : "";

    const tdPrix = document.createElement("td");
    tdPrix.textContent = m.prixUnitaire != null ? String(m.prixUnitaire) : "";

    const tdAff = document.createElement("td");
    tdAff.textContent = m.codeAffaire || "";

    tr.appendChild(tdDate);
    tr.appendChild(tdSens);
    tr.appendChild(tdArt);
    tr.appendChild(tdQte);
    tr.appendChild(tdPrix);
    tr.appendChild(tdAff);

    mouvBody.appendChild(tr);
  });
}

// Filtre mouvements
mouvSearchInput.addEventListener("input", () => {
  const q = mouvSearchInput.value.trim().toLowerCase();
  if (!q) {
    renderMouvements(mouvements);
    return;
  }
  const filtered = mouvements.filter(m => {
    const article = articles.find(a => a.id === m.articleId);
    const sensStr = m.sens === "entree" ? "entrée" : "sortie";
    const haystack = [
      sensStr,
      m.codeAffaire,
      article && article.marque,
      article && article.reference,
      article && article.libelle
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
  renderMouvements(filtered);
});

// Modale Mouvement
function openMouvModal() {
  mouvForm.reset();
  selectSens.value = "entree";
  prixGroup.style.display = "block";
  affaireGroup.style.display = "none";
  mouvModalBackdrop.classList.add("open");
  inputQuantite.focus();
}

function closeMouvModal() {
  mouvModalBackdrop.classList.remove("open");
}

btnMouvAdd.addEventListener("click", async () => {
  await loadArticles();
  await loadAffaires();
  openMouvModal();
});

selectSens.addEventListener("change", () => {
  if (selectSens.value === "entree") {
    prixGroup.style.display = "block";
    affaireGroup.style.display = "none";
  } else {
    prixGroup.style.display = "none";
    affaireGroup.style.display = "block";
  }
});

btnMouvCancel.addEventListener("click", (e) => {
  e.preventDefault();
  closeMouvModal();
});

document.getElementById("mouvModalClose").addEventListener("click", () => {
  closeMouvModal();
});

mouvModalBackdrop.addEventListener("click", (e) => {
  if (e.target === mouvModalBackdrop) closeMouvModal();
});

// Enregistrement mouvement
mouvForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const sens = selectSens.value;
  const articleId = selectArticle.value;
  const quantite = parseFloat(inputQuantite.value.replace(",", "."));
  const prixUnitaire =
    sens === "entree" && inputPrix.value
      ? parseFloat(inputPrix.value.replace(",", "."))
      : null;
  const codeAffaire =
    sens === "sortie" ? selectAffaire.value || "" : "";

  if (!articleId || !quantite || quantite <= 0) {
    alert("Article et quantité doivent être renseignés.");
    return;
  }

  await addDoc(collection(db, "mouvements"), {
    sens,
    articleId,
    quantite,
    prixUnitaire: sens === "entree" ? prixUnitaire : null,
    codeAffaire: sens === "sortie" ? codeAffaire : null,
    date: serverTimestamp()
  });

  await loadMouvements();

  if (typeof window.recalculerArticlesDepuisMouvements === "function") {
    await window.recalculerArticlesDepuisMouvements();
  }

  closeMouvModal();
});

// Initialisation + tri
(async () => {
  await loadArticles();
  await loadMouvements();

  const tableMouv = document.getElementById("mouvementsTable");
  if (tableMouv && window.makeTableSortable) {
    window.makeTableSortable(tableMouv, [
      "date","string","string","number","number","string"
    ]);
  }
})();
