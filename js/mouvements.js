// /js/mouvements.js
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
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

  
// === IMPORT INVENTAIRE (Excel -> mouvements d'entrée) ===
const btnImportInventaire = document.getElementById("btnImportInventaire");
const inventaireFileInput = document.getElementById("inventaireFileInput");

// Optionnel: restreindre à admin comme pour Articles (si tu veux)
const role = sessionStorage.getItem("userRole");
if (btnImportInventaire) {
  btnImportInventaire.style.display = (role === "admin") ? "inline-flex" : "none";
}

function normalizeStr(v) {
  return String(v ?? "").trim().toLowerCase();
}

function parseNumberFR(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function importerInventaireDepuisExcel(file) {
  if (!file) return;
  if (!window.XLSX) {
    alert("Bibliothèque XLSX non chargée.");
    return;
  }

  // S'assure que la liste articles est bien chargée (déjà fait à l'init normalement)
  if (!articles || !articles.length) {
    await loadArticles(); // fonction existante dans mouvements.js [file:3]
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];

      // 1) Tentative avec en-têtes (MARQUE, REFERENCE, Prix, Quantité)
      let rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      // 2) Si pas d'en-têtes pertinents, on lit en mode "array" (colonnes A,B,C,D)
      const looksLikeHeaderMode =
        rows.length &&
        (Object.keys(rows[0]).some(k => normalizeStr(k) === "marque") ||
         Object.keys(rows[0]).some(k => normalizeStr(k) === "reference"));

      if (!looksLikeHeaderMode) {
        const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        // arr[0] = première ligne; on suppose pas d'en-tête => on prend tout
        rows = arr
          .filter(r => r && r.length)
          .map(r => ({
            MARQUE: r[0],
            REFERENCE: r[1],
            Prix: r[2],
            Quantité: r[3],
          }));
      }

      // Mapping robuste (accepte variantes de clés)
      const mapped = rows.map((row) => {
        const keys = Object.keys(row || {});
        const getBy = (...cands) => {
          const k = keys.find(kk => cands.includes(normalizeStr(kk)));
          return k ? row[k] : "";
        };

        const marque = String(getBy("marque", "marque de l'article", "marques", "MARQUE".toLowerCase()) || row.MARQUE || "").trim();
        const reference = String(getBy("reference", "référence", "ref", "rÉfÉrence".toLowerCase()) || row.REFERENCE || "").trim();
        const prixUnitaire = parseNumberFR(getBy("prix", "prix unitaire", "pu") || row.Prix);
        const quantite = parseNumberFR(getBy("quantité", "quantite", "qte") || row.Quantité);

        return { marque, reference, prixUnitaire, quantite };
      }).filter(l => l.marque && l.reference && l.quantite && l.quantite > 0);

      if (!mapped.length) {
        alert("Aucune ligne valide trouvée (attendu: Marque, Référence, Prix, Quantité).");
        return;
      }

      if (!confirm(`Importer ${mapped.length} lignes d'inventaire (mouvements d'entrée) ?`)) return;

      // Index articles par marque+ref
      const index = new Map(
        (articles || []).map(a => [`${normalizeStr(a.marque)}|${normalizeStr(a.reference)}`, a])
      );

      let ok = 0;
      let notFound = 0;

      for (const line of mapped) {
        const key = `${normalizeStr(line.marque)}|${normalizeStr(line.reference)}`;
        const article = index.get(key);

        if (!article) {
          notFound++;
          console.warn("Article introuvable:", line.marque, line.reference);
          continue;
        }

        await addDoc(collection(db, "mouvements"), {
          sens: "entree",
          articleId: article.id,
          quantite: line.quantite,
          prixUnitaire: (line.prixUnitaire ?? null),
          codeAffaire: null,
          date: serverTimestamp(),
        });
        ok++;
      }

      await loadMouvements(); // recharge l'affichage mouvements [file:3]
      if (typeof window.recalculerArticlesDepuisMouvements === "function") {
        await window.recalculerArticlesDepuisMouvements(); // recalc stock côté Articles [file:1][file:3]
      }

      alert(`Import terminé. Créés: ${ok}. Lignes ignorées (articles introuvables): ${notFound}.`);
    } catch (err) {
      console.error("Erreur import inventaire:", err);
      alert("Erreur lors de la lecture/import du fichier Excel.");
    } finally {
      if (inventaireFileInput) inventaireFileInput.value = "";
    }
  };

  reader.readAsArrayBuffer(file);
}

if (btnImportInventaire && inventaireFileInput) {
  btnImportInventaire.addEventListener("click", () => inventaireFileInput.click());
  inventaireFileInput.addEventListener("change", () => {
    const file = inventaireFileInput.files?.[0];
    if (file) importerInventaireDepuisExcel(file);
  });
}

  // Gestion onglets locaux (si tu les utilises encore)
  function showArticles() {
    if (!articlesSection || !mouvementsSection || !tabArticles || !tabMouvements) return;
    tabArticles.classList.add("active");
    tabMouvements.classList.remove("active");
    articlesSection.style.display = "block";
    mouvementsSection.style.display = "none";
  }

  function showMouvements() {
    if (!articlesSection || !mouvementsSection || !tabArticles || !tabMouvements) return;
    tabMouvements.classList.add("active");
    tabArticles.classList.remove("active");
    articlesSection.style.display = "none";
    mouvementsSection.style.display = "block";
  }

  if (tabArticles) tabArticles.addEventListener("click", showArticles);
  if (tabMouvements) tabMouvements.addEventListener("click", showMouvements);

  // Chargement articles & affaires
  async function loadArticles() {
    const snap = await getDocs(collection(db, "articles"));
    articles = [];
    if (selectArticle) selectArticle.innerHTML = "";
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      articles.push({ id, ...data });
      if (selectArticle) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = `${data.marque || ""} - ${data.reference || ""} - ${data.libelle || ""}`;
        selectArticle.appendChild(option);
      }
    });
  }

  async function loadAffaires() {
    const snap = await getDocs(collection(db, "affaires"));
    affaires = [];
    if (selectAffaire) selectAffaire.innerHTML = "";
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      affaires.push({ id, ...data });
      if (selectAffaire) {
        const option = document.createElement("option");
        option.value = data.code;
        option.textContent = `${data.code} - ${data.libelle || ""}`;
        selectAffaire.appendChild(option);
      }
    });
  }

  // Chargement mouvements
  async function loadMouvements() {
    const snap = await getDocs(collection(db, "mouvements"));
    mouvements = [];
    snap.forEach(docSnap => {
      mouvements.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderMouvements(mouvements);
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : ts;
    return d.toLocaleString("fr-FR");
  }

  function renderMouvements(data) {
    if (!mouvBody) return;
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
  if (mouvSearchInput) {
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
  }

  // Modale Mouvement
  function openMouvModal() {
    if (!mouvForm || !selectSens || !prixGroup || !affaireGroup || !mouvModalBackdrop) return;
    mouvForm.reset();
    selectSens.value = "entree";
    prixGroup.style.display = "block";
    affaireGroup.style.display = "none";
    mouvModalBackdrop.classList.add("open");
    if (inputQuantite) inputQuantite.focus();
  }

  function closeMouvModal() {
    if (mouvModalBackdrop) mouvModalBackdrop.classList.remove("open");
  }

  if (btnMouvAdd) {
    btnMouvAdd.addEventListener("click", async () => {
      await loadArticles();
      await loadAffaires();
      openMouvModal();
    });
  }

  if (selectSens) {
    selectSens.addEventListener("change", () => {
      if (selectSens.value === "entree") {
        if (prixGroup) prixGroup.style.display = "block";
        if (affaireGroup) affaireGroup.style.display = "none";
      } else {
        if (prixGroup) prixGroup.style.display = "none";
        if (affaireGroup) affaireGroup.style.display = "block";
      }
    });
  }

  if (btnMouvCancel) {
    btnMouvCancel.addEventListener("click", (e) => {
      e.preventDefault();
      closeMouvModal();
    });
  }

  const mouvModalClose = document.getElementById("mouvModalClose");
  if (mouvModalClose) {
    mouvModalClose.addEventListener("click", () => {
      closeMouvModal();
    });
  }

  if (mouvModalBackdrop) {
    mouvModalBackdrop.addEventListener("click", (e) => {
      if (e.target === mouvModalBackdrop) closeMouvModal();
    });
  }

  // Enregistrement mouvement
  if (mouvForm) {
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
  }

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

}); // fin DOMContentLoaded

