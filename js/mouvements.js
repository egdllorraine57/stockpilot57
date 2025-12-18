// /js/mouvements.js (FIXED)

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

console.log("mouvements.js chargé (FIXED)");

document.addEventListener("DOMContentLoaded", () => {
  // --- Firebase DB (dans ton projet c'est window.firebase, cf login.js / article.js) ---
  const firebaseRoot = window.firebase || window._firebase;
  if (!firebaseRoot) {
    console.error("Firebase root introuvable (window.firebase/window._firebase).");
    return;
  }
  const db = firebaseRoot.db || firebaseRoot;

  // ------------------------------------------------------------
  // DOM (table + toolbar)
  // ------------------------------------------------------------
  const mouvBody = document.getElementById("mouvementsBody");
  const mouvSearchInput = document.getElementById("mouvSearchInput");
  const btnMouvAdd = document.getElementById("btnMouvAdd");

  // ------------------------------------------------------------
  // DOM (modale mouvement)
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

  // ------------------------------------------------------------
  // DOM (import inventaire)
  // ------------------------------------------------------------
  const btnImportInventaire = document.getElementById("btnImportInventaire");
  const inventaireFileInput = document.getElementById("inventaireFileInput");

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  let mouvements = [];
  let articles = [];
  let affaires = [];

  // =========================
  // Helpers
  // =========================
  function normalizeStr(v) {
    return String(v ?? "").trim().toLowerCase();
  }

  function parseNumberFR(v) {
    if (v === null || v === undefined || v === "") return null;
    const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : ts;
    return d.toLocaleString("fr-FR");
  }

  // =========================
  // Firestore loads
  // =========================
  async function loadArticles() {
    const snap = await getDocs(collection(db, "articles"));
    articles = [];

    if (selectArticle) selectArticle.innerHTML = "";

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      articles.push({ id, ...data });

      if (selectArticle) {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = `${data.marque || ""} - ${data.reference || ""} - ${data.libelle || ""}`;
        selectArticle.appendChild(opt);
      }
    });
  }

  async function loadAffaires() {
    const snap = await getDocs(collection(db, "affaires"));
    affaires = [];

    if (selectAffaire) selectAffaire.innerHTML = "";

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      affaires.push({ id, ...data });

      if (selectAffaire) {
        const opt = document.createElement("option");
        opt.value = data.code;
        opt.textContent = `${data.code} - ${data.libelle || ""}`;
        selectAffaire.appendChild(opt);
      }
    });
  }

  async function loadMouvements() {
    const snap = await getDocs(collection(db, "mouvements"));
    mouvements = [];

    snap.forEach((docSnap) => {
      mouvements.push({ id: docSnap.id, ...docSnap.data() });
    });

    renderMouvements(mouvements);
  }

  // =========================
  // Render mouvements
  // =========================
  function renderMouvements(data) {
    if (!mouvBody) return;

    mouvBody.innerHTML = "";

    data.forEach((m) => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = formatDate(m.date);

      const tdSens = document.createElement("td");
      tdSens.textContent = m.sens === "entree" ? "Entrée" : "Sortie";

      const art = articles.find(a => a.id === m.articleId);

      const tdArt = document.createElement("td");
      tdArt.textContent = art
        ? `${art.marque || ""} - ${art.reference || ""} - ${art.libelle || ""}`
        : (m.articleId || "");

      const tdQte = document.createElement("td");
      tdQte.textContent = m.quantite != null ? String(m.quantite) : "";

      const tdPrix = document.createElement("td");
      tdPrix.textContent = m.prixUnitaire != null ? String(m.prixUnitaire) : "";

      const tdAff = document.createElement("td");
      tdAff.textContent = m.codeAffaire || "";

      tr.append(tdDate, tdSens, tdArt, tdQte, tdPrix, tdAff);
      mouvBody.appendChild(tr);
    });
  }

  if (mouvSearchInput) {
    mouvSearchInput.addEventListener("input", () => {
      const q = mouvSearchInput.value.trim().toLowerCase();
      if (!q) return renderMouvements(mouvements);

      const filtered = mouvements.filter((m) => {
        const art = articles.find(a => a.id === m.articleId);
        const sensStr = m.sens === "entree" ? "entrée" : "sortie";

        const hay = [
          sensStr,
          m.codeAffaire,
          art?.marque,
          art?.reference,
          art?.libelle
        ].filter(Boolean).join(" ").toLowerCase();

        return hay.includes(q);
      });

      renderMouvements(filtered);
    });
  }

  // =========================
  // Modal open/close
  // =========================
  function openMouvModal() {
    // IMPORTANT : si un de ces éléments est null, on ne pourra pas ouvrir
    if (!mouvModalBackdrop || !mouvForm || !selectSens || !prixGroup || !affaireGroup) {
      console.error("Modale introuvable:", {
        mouvModalBackdrop, mouvForm, selectSens, prixGroup, affaireGroup
      });
      return;
    }

    mouvForm.reset();
    selectSens.value = "entree";
    prixGroup.style.display = "block";
    affaireGroup.style.display = "none";

    mouvModalBackdrop.classList.add("open");
  }

  function closeMouvModal() {
    if (mouvModalBackdrop) mouvModalBackdrop.classList.remove("open");
  }

  // Affichage champs prix/affaire
  if (selectSens) {
    selectSens.addEventListener("change", () => {
      const entree = (selectSens.value === "entree");
      if (prixGroup) prixGroup.style.display = entree ? "block" : "none";
      if (affaireGroup) affaireGroup.style.display = entree ? "none" : "block";
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

  // =========================
  // Create mouvement
  // =========================
  if (btnMouvAdd) {
    btnMouvAdd.addEventListener("click", async () => {
      try {
        // charge les listes puis ouvre
        await loadArticles();
        await loadAffaires();
        openMouvModal();
      } catch (e) {
        console.error("Erreur ouverture modale mouvement:", e);
        alert("Erreur ouverture modale (voir console).");
      }
    });
  }

  // Submit
  if (mouvForm) {
    mouvForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const sens = selectSens?.value;
      const articleId = selectArticle?.value;

      const quantite = inputQuantite?.value
        ? parseFloat(inputQuantite.value.replace(",", "."))
        : NaN;

      const prixUnitaire =
        sens === "entree" && inputPrix?.value
          ? parseFloat(inputPrix.value.replace(",", "."))
          : null;

      const codeAffaire =
        sens === "sortie"
          ? (selectAffaire?.value || "")
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

      await loadMouvements();

      if (typeof window.recalculerArticlesDepuisMouvements === "function") {
        await window.recalculerArticlesDepuisMouvements();
      }

      closeMouvModal();
    });
  }

  // =========================
  // Import inventaire Excel (isolé + safe)
  // =========================
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
        const headerMode =
          rows.length &&
          (
            Object.keys(rows[0]).some(k => normalizeStr(k) === "marque") ||
            Object.keys(rows[0]).some(k => normalizeStr(k) === "reference") ||
            Object.keys(rows[0]).some(k => normalizeStr(k) === "référence")
          );

        if (!headerMode) {
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
          articles.map(a => [`${normalizeStr(a.marque)}|${normalizeStr(a.reference)}`, a])
        );

        let ok = 0;
        let notFound = 0;

        for (const line of mapped) {
          const key = `${normalizeStr(line.marque)}|${normalizeStr(line.reference)}`;
          const art = index.get(key);

          if (!art) {
            notFound++;
            console.warn("Article introuvable:", line.marque, line.reference);
            continue;
          }

          await addDoc(collection(db, "mouvements"), {
            sens: "entree",
            articleId: art.id,
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

        alert(`Import terminé. Créés: ${ok}. Ignorés (articles introuvables): ${notFound}.`);
      } catch (err) {
        console.error("Erreur import inventaire:", err);
        alert("Erreur lors de la lecture/import du fichier Excel.");
      } finally {
        if (inventaireFileInput) inventaireFileInput.value = "";
      }
    };

    reader.readAsArrayBuffer(file);
  }

  // Affiche le bouton import uniquement admin + hook events
  if (btnImportInventaire) {
    btnImportInventaire.style.display = (role === "admin") ? "inline-flex" : "none";
  }
  if (btnImportInventaire && inventaireFileInput) {
    btnImportInventaire.addEventListener("click", () => inventaireFileInput.click());
    inventaireFileInput.addEventListener("change", () => {
      const file = inventaireFileInput.files?.[0];
      if (file) importerInventaireDepuisExcel(file);
    });
  }

  // =========================
  // Init
  // =========================
  (async () => {
    try {
      await loadArticles();
      await loadMouvements();

      const tableMouv = document.getElementById("mouvementsTable");
      if (tableMouv && window.makeTableSortable) {
        window.makeTableSortable(tableMouv, [
          "date", "string", "string", "number", "number", "string"
        ]);
      }
    } catch (e) {
      console.error("Init mouvements error:", e);
    }
  })();
});
