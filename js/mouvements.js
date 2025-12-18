// /js/mouvements.js (version DEBUG)

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("mouvements.js chargé (DEBUG)");

document.addEventListener("DOMContentLoaded", () => {
  alert("DOMContentLoaded mouvements.js (DEBUG)");

  // --- Firebase / DB (robuste : window.firebase OU window._firebase) ---
  const firebaseRoot = window.firebase || window._firebase;
  console.log("firebaseRoot:", firebaseRoot);

  if (!firebaseRoot) {
    alert("BLOCK: firebaseRoot absent (window.firebase/window._firebase)");
    return;
  }

  const db = firebaseRoot.db || firebaseRoot; // selon comment tu exposes
  if (!db) {
    alert("BLOCK: db introuvable dans firebaseRoot");
    return;
  }

  alert("OK: db trouvé");

  // ------------------------------------------------------------
  // Table mouvements
  // ------------------------------------------------------------
  const mouvBody = document.getElementById("mouvementsBody");
  const mouvSearchInput = document.getElementById("mouvSearchInput");
  const btnMouvAdd = document.getElementById("btnMouvAdd");

  alert("DOM: btnMouvAdd trouvé ? " + (!!btnMouvAdd));

  // ------------------------------------------------------------
  // Modale Mouvement (IDs d'origine home.html)
  // ------------------------------------------------------------
  const mouvModalBackdrop = document.getElementById("mouvModalBackdrop");
  const mouvForm = document.getElementById("mouvForm");
  const selectSens = document.getElementById("msens");
  const selectArticle = document.getElementById("marticle");
  const inputQuantite = document.getElementById("mquantite");
  const prixGroup = document.getElementById("mprixgroup");
  const inputPrix = document.getElementById("mprix");
  const affaireGroup = document.getElementById("maffairegroup");
  const selectAffaire = document.getElementById("maffaire");
  const btnMouvCancel = document.getElementById("btnMouvCancel");
  const mouvModalClose = document.getElementById("mouvModalClose");

  // Données
  let mouvements = [];
  let articles = [];
  let affaires = [];

  // =========================
  // IMPORT INVENTAIRE (Excel) (inchangé, mais je garde)
  // =========================
  const btnImportInventaire = document.getElementById("btnImportInventaire");
  const inventaireFileInput = document.getElementById("inventaireFileInput");

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
      alert("Bibliothèque XLSX non chargée (SheetJS).");
      return;
    }

    if (!articles || !articles.length) {
      await loadArticles();
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];

        let rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const looksLikeHeaderMode =
          rows.length &&
          (
            Object.keys(rows[0]).some(k => normalizeStr(k) === "marque") ||
            Object.keys(rows[0]).some(k => normalizeStr(k) === "reference") ||
            Object.keys(rows[0]).some(k => normalizeStr(k) === "référence")
          );

        if (!looksLikeHeaderMode) {
          const arr = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          rows = arr
            .filter(r => r && r.length)
            .map(r => ({
              MARQUE: r[0],
              REFERENCE: r[1],
              Prix: r[2],
              Quantité: r[3],
            }));
        }

        const mapped = rows.map((row) => {
          const keys = Object.keys(row || {});
          const getBy = (...cands) => {
            const k = keys.find(kk => cands.includes(normalizeStr(kk)));
            return k ? row[k] : "";
          };

          const marque = String(getBy("marque") || row.MARQUE || "").trim();
          const reference = String(getBy("reference", "référence", "ref") || row.REFERENCE || "").trim();
          const prixUnitaire = parseNumberFR(getBy("prix", "prix unitaire", "pu") || row.Prix);
          const quantite = parseNumberFR(getBy("quantité", "quantite", "qte") || row.Quantité);

          return { marque, reference, prixUnitaire, quantite };
        }).filter(l => l.marque && l.reference && l.quantite && l.quantite > 0);

        if (!mapped.length) {
          alert("Aucune ligne valide trouvée (attendu: Marque, Référence, Prix, Quantité).");
          return;
        }

        if (!confirm(`Importer ${mapped.length} lignes d'inventaire (mouvements d'entrée) ?`)) return;

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

        await loadMouvements();

        if (typeof window.recalculerArticlesDepuisMouvements === "function") {
          await window.recalculerArticlesDepuisMouvements();
        }

        alert(`Import terminé. Créés: ${ok}. Lignes ignorées: ${notFound}.`);
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

  // =========================
  // Firestore loads
  // =========================
  async function loadArticles() {
    alert("loadArticles() start");
    const snap = await getDocs(collection(db, "articles"));
    articles = [];

    if (selectArticle) selectArticle.innerHTML = "";

    snap.forEach((docSnap) => {
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

    alert("loadArticles() OK, count=" + articles.length);
  }

  async function loadAffaires() {
    alert("loadAffaires() start");
    const snap = await getDocs(collection(db, "affaires"));
    affaires = [];

    if (selectAffaire) selectAffaire.innerHTML = "";

    snap.forEach((docSnap) => {
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

    alert("loadAffaires() OK, count=" + affaires.length);
  }

  async function loadMouvements() {
    alert("loadMouvements() start");
    const snap = await getDocs(collection(db, "mouvements"));
    mouvements = [];

    snap.forEach((docSnap) => {
      mouvements.push({ id: docSnap.id, ...docSnap.data() });
    });

    alert("loadMouvements() OK, count=" + mouvements.length);
    renderMouvements(mouvements);
  }

  // =========================
  // Render + filter
  // =========================
  function formatDate(ts) {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : ts;
    return d.toLocaleString("fr-FR");
  }

  function renderMouvements(data) {
    if (!mouvBody) return;

    mouvBody.innerHTML = "";

    data.forEach((m) => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = formatDate(m.date);

      const tdSens = document.createElement("td");
      tdSens.textContent = m.sens === "entree" ? "Entrée" : "Sortie";

      const article = articles.find(a => a.id === m.articleId);

      const tdArt = document.createElement("td");
      tdArt.textContent = article
        ? `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`
        : (m.articleId || "");

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

  if (mouvSearchInput) {
    mouvSearchInput.addEventListener("input", () => {
      const q = mouvSearchInput.value.trim().toLowerCase();

      if (!q) {
        renderMouvements(mouvements);
        return;
      }

      const filtered = mouvements.filter((m) => {
        const article = articles.find(a => a.id === m.articleId);
        const sensStr = m.sens === "entree" ? "entrée" : "sortie";

        const haystack = [
          sensStr,
          m.codeAffaire,
          article && article.marque,
          article && article.reference,
          article && article.libelle
        ].filter(Boolean).join(" ").toLowerCase();

        return haystack.includes(q);
      });

      renderMouvements(filtered);
    });
  }

  // =========================
  // Modale open/close
  // =========================
  function openMouvModal() {
    alert("openMouvModal() ENTER -- VERSION DEBUG 14:14");

    // Vérifie tous les éléments
    alert("openMouvModal check: backdrop=" + (!!mouvModalBackdrop) +
      " form=" + (!!mouvForm) +
      " sens=" + (!!selectSens) +
      " prixGroup=" + (!!prixGroup) +
      " affaireGroup=" + (!!affaireGroup));

    if (!mouvModalBackdrop || !mouvForm || !selectSens || !prixGroup || !affaireGroup) {
      alert("BLOCK: un élément modale est introuvable (voir alert précédente)");
      return;
    }

    mouvForm.reset();
    selectSens.value = "entree";
    prixGroup.style.display = "block";
    affaireGroup.style.display = "none";

    alert("Avant classList.add('open') => class=" + mouvModalBackdrop.className);
    mouvModalBackdrop.classList.add("open");
    alert("Après classList.add('open') => class=" + mouvModalBackdrop.className);

    // Diagnostic: force display (si CSS n'applique pas)
    // (tu pourras enlever après)
    mouvModalBackdrop.style.display = "flex";

    alert("Fin openMouvModal()");
  }

  function closeMouvModal() {
    if (mouvModalBackdrop) mouvModalBackdrop.classList.remove("open");
  }

  // =========================
  // Listener bouton Créer un mouvement
  // =========================
  if (btnMouvAdd) {
    btnMouvAdd.addEventListener("click", async () => {
      alert("CLICK btnMouvAdd (handler start)");

      try {
        alert("avant loadArticles()");
        await loadArticles();
        alert("après loadArticles()");

        alert("avant loadAffaires()");
        await loadAffaires();
        alert("après loadAffaires()");

        alert("avant openMouvModal()");
        openMouvModal();
        alert("après openMouvModal()");
      } catch (err) {
        console.error("Erreur au clic Créer un mouvement:", err);
        alert("CATCH erreur au clic (voir console)");
      }
    });
  } else {
    alert("BLOCK: btnMouvAdd introuvable");
  }

  // Sens => affiche prix OU affaire
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

  if (mouvModalClose) {
    mouvModalClose.addEventListener("click", closeMouvModal);
  }

  if (mouvModalBackdrop) {
    mouvModalBackdrop.addEventListener("click", (e) => {
      if (e.target === mouvModalBackdrop) closeMouvModal();
    });
  }

  // Submit création mouvement
  if (mouvForm) {
    mouvForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      alert("SUBMIT mouvForm");

      const sens = selectSens?.value;
      const articleId = selectArticle?.value;
      const quantite = inputQuantite?.value
        ? parseFloat(inputQuantite.value.replace(",", "."))
        : NaN;

      const prixUnitaire =
        sens === "entree" && inputPrix && inputPrix.value
          ? parseFloat(inputPrix.value.replace(",", "."))
          : null;

      const codeAffaire =
        sens === "sortie" && selectAffaire
          ? (selectAffaire.value || "")
          : "";

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

      alert("addDoc OK");
      await loadMouvements();

      if (typeof window.recalculerArticlesDepuisMouvements === "function") {
        await window.recalculerArticlesDepuisMouvements();
      }

      closeMouvModal();
      alert("Fermeture modale OK");
    });
  }

  // Init
  (async () => {
    try {
      alert("INIT start (loadArticles + loadMouvements)");
      await loadArticles();
      await loadMouvements();
      alert("INIT OK");
    } catch (e) {
      console.error("INIT mouvements error:", e);
      alert("INIT ERROR (voir console)");
    }
  })();
});
