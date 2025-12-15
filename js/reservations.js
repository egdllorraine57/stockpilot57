// /js/reservations.js
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const { db } = window._firebase;

  const currentUserEmail = sessionStorage.getItem("userEmail") || "";
  const currentUserName = sessionStorage.getItem("userName") || "";

  // DOM
  const reservBody = document.getElementById("reservationsBody");
  const reservSearchInput = document.getElementById("reservSearchInput");

  const btnNewReservation = document.getElementById("btnNewReservation");
  const btnSaveDraft = document.getElementById("btnSaveDraft");

  const panierModalBackdrop = document.getElementById("panierModalBackdrop");
  const panierForm = document.getElementById("panierForm");
  const panierTitle = document.getElementById("panierModalTitle");
  const selectAffaire = document.getElementById("p_affaire");
  const inputDateDispo = document.getElementById("p_date");
  const btnPanierAddLine = document.getElementById("btnPanierAddLine");
  const panierBody = document.getElementById("panierBody");
  const btnPanierCancel = document.getElementById("btnPanierCancel");
  const btnPanierClose = document.getElementById("panierModalClose");

  const articleSelectBackdrop = document.getElementById("articleSelectModalBackdrop");
  const articleSearchInput = document.getElementById("articleSearchInput");
  const articleResultsTable = document.getElementById("articleResultsTable");
  const articleSelectClose = document.getElementById("articleSelectClose");
  const articleSelectCancel = document.getElementById("articleSelectCancel");

  // State
  let reservations = [];
  let affaires = [];
  let articles = [];
  let panierLignes = [];
  let draftReservationGroupId = null;

  let articleSelectionCallback = null;

  // Stock stats (recalculés depuis Firestore)
  let statsParArticle = {};

  const uid = () => crypto.randomUUID();
  const genererReservationGroupId = () =>
    `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const safeNumber = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  };

  const formatDateFR = (d) => (d?.toDate ? d.toDate().toLocaleDateString("fr-FR") : "");
  const formatNombre = (n) =>
    Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* =========================
     PDF Bon d'achat (manquants)
     ========================= */
  function genererBonAchatPDF(affaireLibelle, manquants) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Bon d'achat - Articles manquants", 10, 20);

    doc.setFontSize(12);
    doc.text(`Affaire: ${affaireLibelle}`, 10, 35);
    doc.text(`Date: ${new Date().toLocaleString("fr-FR")}`, 10, 45);

    let y = 60;
    doc.setFontSize(10);
    doc.text("MARQUE", 10, y);
    doc.text("RÉF", 50, y);
    doc.text("LIBELLÉ", 85, y);
    doc.text("CUMP", 160, y);
    doc.text("QTE", 180, y);
    y += 10;

    doc.setFontSize(10);
    manquants.forEach((m) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${m.marque || ""}`, 10, y);
      doc.text(`${m.reference || ""}`, 50, y);
      doc.text(`${(m.libelle || "").slice(0, 25)}`, 85, y);
      doc.text(formatNombre(m.cump), 160, y);
      doc.text(formatNombre(m.qteManquante), 180, y);
      y += 8;
    });

    const nom = `bon_achat_${String(affaireLibelle || "affaire").replace(/[^a-z0-9]/gi, "_")}.pdf`;
    doc.save(nom);
  }

  /* =========================
     Calcul stock dispo
     dispo = (entrées-sorties) - réservations en_cours
     ========================= */

  function calculerStatsArticle(mouvsArticle, reserveQte) {
    // Tri chronologique pour un CUMP cohérent
    const tri = [...(mouvsArticle || [])].sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : a.date || new Date(0);
      const db = b.date?.toDate ? b.date.toDate() : b.date || new Date(0);
      return da - db;
    });

    let stockQte = 0;
    let stockValeur = 0;
    let cump = 0;

    tri.forEach((m) => {
      const q = safeNumber(m.quantite);

      if (m.sens === "entree") {
        const pu = safeNumber(m.prixUnitaire);
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

    const reserve = safeNumber(reserveQte);
    const dispo = Math.max(0, stockQte - reserve);
    const valeurStock = stockQte * cump;

    return { stock: stockQte, reserve, dispo, cump, valeur: valeurStock };
  }

  async function recalculerStatsParArticleDepuisFirestore() {
    // 1) Mouvements
    const snapMouv = await getDocs(collection(db, "mouvements"));
    const mouvements = snapMouv.docs.map((d) => ({ id: d.id, ...d.data() }));

    // 2) Réservations en_cours (seules celles-ci “réservent” le stock)
    const snapResEnCours = await getDocs(query(collection(db, "reservations"), where("statut", "==", "en_cours")));
    const reservationsEnCours = snapResEnCours.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Groupement mouvements par article
    const parArticle = {};
    mouvements.forEach((m) => {
      if (!m.articleId) return;
      parArticle[m.articleId] ??= [];
      parArticle[m.articleId].push(m);
    });

    // Somme réservée par article
    const reserveParArticle = {};
    reservationsEnCours.forEach((r) => {
      if (!r.articleId) return;
      reserveParArticle[r.articleId] = safeNumber(reserveParArticle[r.articleId]) + safeNumber(r.quantite);
    });

    // Union des ids (articles avec mouv + articles réservés)
    const ids = new Set([...Object.keys(parArticle), ...Object.keys(reserveParArticle)]);

    const stats = {};
    ids.forEach((articleId) => {
      stats[articleId] = calculerStatsArticle(parArticle[articleId] || [], reserveParArticle[articleId] || 0);
    });

    statsParArticle = stats;
    // Optionnel: exposer pour debug / autres onglets
    window.statsParArticleGlobal = statsParArticle;
  }

  /* =========================
     Chargements Firestore
     ========================= */
  async function chargerAffaires() {
    const snap = await getDocs(collection(db, "affaires"));
    affaires = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (selectAffaire) {
      selectAffaire.innerHTML = "";
      affaires.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = `${a.code || ""} - ${a.libelle || ""}`.trim();
        selectAffaire.appendChild(opt);
      });
    }
  }

  async function chargerArticles() {
    const snap = await getDocs(collection(db, "articles"));
    articles = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function chargerReservations() {
    const snap = await getDocs(collection(db, "reservations"));
    reservations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    renderReservations(reservations);
  }

  /* =========================
     Rendu tableau Reservations
     (affaire, article, qte, date, statut, actions)
     ========================= */
  function renderReservations(data) {
    if (!reservBody) return;

    const q = (reservSearchInput?.value || "").trim().toLowerCase();

    const filtered = !q
      ? data
      : data.filter((r) => {
          const haystack = [
            r.affaireLibelle,
            r.codeAffaire,
            r.articleLabel,
            r.marque,
            r.reference,
            r.libelle,
            r.statut
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        });

    reservBody.innerHTML = "";

    // Regroupement par reservationGroupId (un panier validé = un groupe)
    const groupes = {};
    filtered.forEach((r) => {
      const gid = r.reservationGroupId || r.id;
      groupes[gid] ??= [];
      groupes[gid].push(r);
    });

    Object.entries(groupes).forEach(([gid, lignes]) => {
      const r0 = lignes[0];
      const totalQte = lignes.reduce((s, l) => s + safeNumber(l.quantite), 0);

      const articleCol =
        lignes.length === 1
          ? (r0.articleLabel || `${r0.marque || ""} ${r0.reference || ""} ${r0.libelle || ""}`.trim())
          : `${lignes.length} articles`;

      const statut = r0.statut || "N/A";
      const statutColor =
        statut === "brouillon" ? "#fbbf24" :
        statut === "en_cours" ? "#10b981" :
        statut === "clos" ? "#ef4444" :
        "#6b7280";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r0.affaireLibelle || r0.codeAffaire || ""}</td>
        <td>${articleCol || ""}</td>
        <td>${formatNombre(totalQte)}</td>
        <td>${formatDateFR(r0.dateDisponibilite)}</td>
        <td style="font-weight:bold; color:${statutColor}">${statut}</td>
        <td style="text-align:center"></td>
      `;

      // Actions: modification uniquement des brouillons créés par l'utilisateur
      const actionsTd = tr.lastElementChild;

      if (statut === "brouillon" && r0.createdBy === currentUserEmail) {
        const btn = document.createElement("button");
        btn.textContent = `Modifier (${lignes.length})`;
        btn.className = "btn-secondary";
        btn.style.fontSize = "0.75rem";
        btn.style.padding = "4px 8px";
        btn.onclick = () => openPanierModal(gid, true);
        actionsTd.appendChild(btn);
      } else {
        actionsTd.textContent = "";
      }

      reservBody.appendChild(tr);
    });
  }

  /* =========================
     Modale Panier
     ========================= */
  function openPanierModal(groupId = null, isDraft = false) {
    if (!panierModalBackdrop || !panierForm || !panierBody) return;

    panierForm.reset();
    panierLignes = [];
    panierBody.innerHTML = "";

    if (inputDateDispo) inputDateDispo.valueAsDate = new Date();

    draftReservationGroupId = groupId;

    if (panierTitle) {
      panierTitle.textContent = isDraft
        ? `Modifier brouillon (${String(groupId || "").slice(-6)})`
        : "Nouvelle réservation";
    }

    if (isDraft && groupId) chargerBrouillon(groupId);
    panierModalBackdrop.classList.add("open");
  }

  function closePanierModal() {
    if (panierModalBackdrop) panierModalBackdrop.classList.remove("open");
    draftReservationGroupId = null;
  }

  /* =========================
     Lignes panier
     ========================= */
  function ajouterLignePanier() {
    if (!panierBody) return;

    const idTemp = uid();
    panierLignes.push({ idTemp, articleId: "", quantite: 0 });

    const tr = document.createElement("tr");
    tr.dataset.id = idTemp;

    // Article (clic)
    const tdArticle = document.createElement("td");
    const span = document.createElement("span");
    span.textContent = "Cliquez pour sélectionner";
    span.style.cursor = "pointer";
    span.style.color = "#3b82f6";
    span.onclick = () => openArticleSelectModal((article) => {
      const ligne = panierLignes.find((l) => l.idTemp === idTemp);
      if (!ligne) return;

      ligne.articleId = article.id;
      span.textContent = `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`.trim();
      span.style.color = "#111827";
    });

    tdArticle.appendChild(span);

    // Quantité
    const tdQte = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.min = "0.01";
    input.oninput = (e) => {
      const ligne = panierLignes.find((l) => l.idTemp === idTemp);
      if (ligne) ligne.quantite = safeNumber(e.target.value);
    };
    tdQte.appendChild(input);

    // Actions
    const tdActions = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Supprimer";
    btn.className = "btn-secondary";
    btn.onclick = () => {
      panierLignes = panierLignes.filter((l) => l.idTemp !== idTemp);
      tr.remove();
    };
    tdActions.appendChild(btn);

    tr.append(tdArticle, tdQte, tdActions);
    panierBody.appendChild(tr);
  }

  function ajouterLignePanierAvecDonnees(idTemp, articleId, quantite) {
    if (!panierBody) return;

    const article = articles.find((a) => a.id === articleId);
    if (!article) return;

    const tr = document.createElement("tr");
    tr.dataset.id = idTemp;

    const tdArticle = document.createElement("td");
    tdArticle.textContent = `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`.trim();

    const tdQte = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.min = "0.01";
    input.value = safeNumber(quantite);
    input.oninput = (e) => {
      const l = panierLignes.find((x) => x.idTemp === idTemp);
      if (l) l.quantite = safeNumber(e.target.value);
    };
    tdQte.appendChild(input);

    const tdActions = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Supprimer";
    btn.className = "btn-secondary";
    btn.onclick = () => {
      panierLignes = panierLignes.filter((l) => l.idTemp !== idTemp);
      tr.remove();
    };
    tdActions.appendChild(btn);

    tr.append(tdArticle, tdQte, tdActions);
    panierBody.appendChild(tr);
  }

  /* =========================
     Modal sélection article
     ========================= */
  function openArticleSelectModal(cb) {
    articleSelectionCallback = cb;
    if (articleSearchInput) articleSearchInput.value = "";
    renderArticleSearchResults("");
    if (articleSelectBackdrop) articleSelectBackdrop.classList.add("open");
  }

  function closeArticleSelectModal() {
    if (articleSelectBackdrop) articleSelectBackdrop.classList.remove("open");
    articleSelectionCallback = null;
  }

  function renderArticleSearchResults(q) {
    if (!articleResultsTable) return;

    articleResultsTable.innerHTML = "";

    if (!q?.trim()) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="text-align:center; padding:20px;">Tapez pour rechercher...</td>`;
      articleResultsTable.appendChild(tr);
      return;
    }

    const queryText = q.toLowerCase();
    const matches = articles
      .filter((a) => {
        const hay = [a.marque, a.reference, a.libelle].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(queryText);
      })
      .slice(0, 50);

    if (!matches.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="text-align:center; padding:20px;">Aucun article trouvé</td>`;
      articleResultsTable.appendChild(tr);
      return;
    }

    matches.forEach((a) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";

      const stats = statsParArticle[a.id] || { cump: 0 };

      tr.innerHTML = `
        <td>${a.marque || ""}</td>
        <td>${a.reference || ""}</td>
        <td>${a.libelle || ""}</td>
        <td>${formatNombre(stats.cump || 0)}</td>
      `;

      tr.onclick = () => {
        articleSelectionCallback?.(a);
        closeArticleSelectModal();
      };

      articleResultsTable.appendChild(tr);
    });
  }

  /* =========================
     Charger / Sauver Brouillon
     ========================= */
  async function chargerBrouillon(groupId) {
    const q = query(
      collection(db, "reservations"),
      where("reservationGroupId", "==", groupId),
      where("createdBy", "==", currentUserEmail),
      where("statut", "==", "brouillon")
    );

    const snap = await getDocs(q);
    if (snap.empty) {
      alert("Brouillon introuvable ou accès refusé.");
      return;
    }

    panierLignes = [];
    panierBody.innerHTML = "";

    snap.forEach((d) => {
      const r = d.data();
      const idTemp = uid();

      panierLignes.push({
        idTemp,
        articleId: r.articleId,
        quantite: safeNumber(r.quantite)
      });

      if (selectAffaire && !selectAffaire.value) selectAffaire.value = r.affaireId;
      if (inputDateDispo && !inputDateDispo.value && r.dateDisponibilite?.toDate) {
        inputDateDispo.value = r.dateDisponibilite.toDate().toISOString().split("T")[0];
      }

      ajouterLignePanierAvecDonnees(idTemp, r.articleId, r.quantite);
    });

    if (panierTitle) panierTitle.textContent = `Modifier brouillon (${snap.size} lignes)`;
  }

  async function supprimerBrouillonSiExiste(groupId) {
    if (!groupId) return;

    const q = query(
      collection(db, "reservations"),
      where("reservationGroupId", "==", groupId),
      where("createdBy", "==", currentUserEmail),
      where("statut", "==", "brouillon")
    );

    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }

  async function saveDraft() {
    const lignesValides = panierLignes.filter((l) => l.articleId && safeNumber(l.quantite) > 0);
    if (!lignesValides.length) {
      alert("Ajoutez au moins une ligne valide.");
      return;
    }

    const affaire = affaires.find((a) => a.id === selectAffaire?.value);
    if (!affaire) {
      alert("Sélectionnez une affaire.");
      return;
    }

    const dateDispo = inputDateDispo?.value ? new Date(inputDateDispo.value) : new Date();

    const groupId = draftReservationGroupId || genererReservationGroupId();

    try {
      // évite les doublons si on re-sauvegarde le même brouillon
      await supprimerBrouillonSiExiste(groupId);

      for (const ligne of lignesValides) {
        const article = articles.find((a) => a.id === ligne.articleId);
        if (!article) continue;

        await addDoc(collection(db, "reservations"), {
          reservationGroupId: groupId,
          statut: "brouillon",

          affaireId: selectAffaire.value,
          codeAffaire: affaire.code || "",
          affaireLibelle: `${affaire.code || ""} - ${affaire.libelle || ""}`.trim(),

          articleId: ligne.articleId,
          marque: article.marque || "",
          reference: article.reference || "",
          libelle: article.libelle || "",
          articleLabel: `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`.trim(),
          articleAllee: article.allee || "",
          articlePlace: article.place || "",
          articleNiveau: article.niveau || "",

          quantite: safeNumber(ligne.quantite),
          dateDisponibilite: dateDispo,

          createdBy: currentUserEmail,
          createdByName: currentUserName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      draftReservationGroupId = groupId;
      alert("Brouillon sauvegardé.");
      await chargerReservations();
      closePanierModal();
    } catch (error) {
      console.error("Erreur saveDraft", error);
      alert("Erreur lors de la sauvegarde du brouillon.");
    }
  }

  /* =========================
     Valider Panier
     - réserve ce qui est dispo => en_cours
     - génère PDF si manquants
     ========================= */
  async function validerReservation() {
    const lignesValides = panierLignes.filter((l) => l.articleId && safeNumber(l.quantite) > 0);
    if (!lignesValides.length) {
      alert("Panier vide.");
      return;
    }

    const affaire = affaires.find((a) => a.id === selectAffaire?.value);
    if (!affaire) {
      alert("Sélectionnez une affaire.");
      return;
    }

    if (!inputDateDispo?.value) {
      alert("Sélectionnez une date de mise à disposition.");
      return;
    }
    const dateDispo = new Date(inputDateDispo.value);

    const groupId = draftReservationGroupId || genererReservationGroupId();
    const manquants = [];
    let totalReserve = 0;
    let totalManquant = 0;

    try {
      // Recalcule des stocks “au moment de valider”
      await recalculerStatsParArticleDepuisFirestore();

      // Si on valide un brouillon existant: suppression des lignes brouillon du groupe
      await supprimerBrouillonSiExiste(draftReservationGroupId);

      for (const ligne of lignesValides) {
        const article = articles.find((a) => a.id === ligne.articleId);
        if (!article) continue;

        const stats = statsParArticle[ligne.articleId] || { dispo: 0, cump: 0 };
        const stockDisponible = safeNumber(stats.dispo);
        const qteDemandee = safeNumber(ligne.quantite);

        const qteReservable = Math.max(0, Math.min(stockDisponible, qteDemandee));
        const qteManquante = Math.max(0, qteDemandee - qteReservable);

        if (qteReservable > 0) {
          await addDoc(collection(db, "reservations"), {
            reservationGroupId: groupId,

            affaireId: selectAffaire.value,
            codeAffaire: affaire.code || "",
            affaireLibelle: `${affaire.code || ""} - ${affaire.libelle || ""}`.trim(),

            articleId: ligne.articleId,
            marque: article.marque || "",
            reference: article.reference || "",
            libelle: article.libelle || "",
            articleLabel: `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`.trim(),
            articleAllee: article.allee || "",
            articlePlace: article.place || "",
            articleNiveau: article.niveau || "",

            quantite: qteReservable,
            dateDisponibilite: dateDispo,
            statut: "en_cours",

            prixUnitaire: safeNumber(stats.cump),

            createdBy: currentUserEmail,
            createdByName: currentUserName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          totalReserve += qteReservable;
        }

        if (qteManquante > 0) {
          manquants.push({
            marque: article.marque || "",
            reference: article.reference || "",
            libelle: article.libelle || "",
            cump: safeNumber(stats.cump),
            qteManquante
          });
          totalManquant += qteManquante;
        }
      }

      // Rafraîchissements UI
      await chargerReservations();
      if (typeof window.rechargerArticlesDepuisReservations === "function") {
        await window.rechargerArticlesDepuisReservations();
      }

      if (manquants.length > 0) {
        genererBonAchatPDF(`${affaire.code || ""} - ${affaire.libelle || ""}`.trim(), manquants);
      }

      draftReservationGroupId = null;
      panierLignes = [];
      if (panierBody) panierBody.innerHTML = "";
      closePanierModal();

      alert(`Réservation validée !\n${formatNombre(totalReserve)} réservé(s)\n${formatNombre(totalManquant)} manquant(s) à commander`);
    } catch (error) {
      console.error("Erreur validerReservation", error);
      alert("Erreur lors de la validation.");
    }
  }

  /* =========================
     Listeners
     ========================= */
  if (reservSearchInput) {
    reservSearchInput.addEventListener("input", () => renderReservations(reservations));
  }

  if (btnNewReservation) {
    btnNewReservation.addEventListener("click", async () => {
      await chargerAffaires();
      await chargerArticles();
      await recalculerStatsParArticleDepuisFirestore();
      openPanierModal(null, false);
    });
  }

  if (btnPanierAddLine) btnPanierAddLine.addEventListener("click", ajouterLignePanier);
  if (btnPanierCancel) btnPanierCancel.addEventListener("click", closePanierModal);
  if (btnPanierClose) btnPanierClose.addEventListener("click", closePanierModal);

  if (btnSaveDraft) btnSaveDraft.addEventListener("click", saveDraft);

  if (panierForm) {
    panierForm.addEventListener("submit", (e) => {
      e.preventDefault();
      validerReservation();
    });
  }

  if (articleSearchInput) {
    articleSearchInput.addEventListener("input", (e) => renderArticleSearchResults(e.target.value));
  }

  if (articleSelectClose) articleSelectClose.addEventListener("click", closeArticleSelectModal);
  if (articleSelectCancel) articleSelectCancel.addEventListener("click", closeArticleSelectModal);

  if (panierModalBackdrop) {
    panierModalBackdrop.addEventListener("click", (e) => {
      if (e.target === panierModalBackdrop) closePanierModal();
    });
  }

  if (articleSelectBackdrop) {
    articleSelectBackdrop.addEventListener("click", (e) => {
      if (e.target === articleSelectBackdrop) closeArticleSelectModal();
    });
  }

  // Init
  (async () => {
    await chargerArticles();
    await chargerAffaires();
    await recalculerStatsParArticleDepuisFirestore();
    await chargerReservations();
  })();
});
