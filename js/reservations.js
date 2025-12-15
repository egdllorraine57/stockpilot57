// /js/reservations.js
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
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
  const btnSaveDraft = document.getElementById("btnSaveDraft");

  // Modale sélection article
  const articleSelectBackdrop = document.getElementById("articleSelectModalBackdrop");
  const articleSearchInput = document.getElementById("articleSearchInput");
  const articleResultsTable = document.getElementById("articleResultsTable");
  const articleSelectClose = document.getElementById("articleSelectClose");
  const articleSelectCancel = document.getElementById("articleSelectCancel");

  let articleSelectionCallback = null;

  // Données
  let reservations = [];
  let affaires = [];
  let articles = [];
  let statsParArticle = window.statsParArticleGlobal || {};
  let panierLignes = []; // {idTemp, articleId, quantite}
  let draftReservationId = null; // ID du brouillon en cours
  const currentUserEmail = sessionStorage.getItem('userEmail') || '';

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

  // Gestion onglets locaux
  function showSection(section) {
    if (!articlesSection || !mouvementsSection || !reservationsSection || !preparationsSection) return;

    articlesSection.style.display = section === "articles" ? "block" : "none";
    mouvementsSection.style.display = section === "mouvements" ? "block" : "none";
    reservationsSection.style.display = section === "reservations" ? "block" : "none";
    preparationsSection.style.display = section === "preparations" ? "block" : "none";

    if (tabArticles && tabMouvements && tabReservations && tabPreparations) {
      tabArticles.classList.toggle("active", section === "articles");
      tabMouvements.classList.toggle("active", section === "mouvements");
      tabReservations.classList.toggle("active", section === "reservations");
      tabPreparations.classList.toggle("active", section === "preparations");
    }
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
    snap.forEach((docSnap) => {
      affaires.push({ id: docSnap.id, ...docSnap.data() });
    });
    if (!selectAffaire) return;
    selectAffaire.innerHTML = "";
    affaires.forEach((a) => {
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
    snap.forEach((docSnap) => {
      articles.push({ id: docSnap.id, ...docSnap.data() });
    });
  }

  async function chargerReservations() {
    const snap = await getDocs(collection(db, "reservations"));
    reservations = [];
    snap.forEach((docSnap) => {
      reservations.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderReservations(reservations);
  }

  // ✅ NOUVELLE FONCTION : Rendu tableau avec colonne Actions
  function renderReservations(data) {
    if (!reservBody) return;
    reservBody.innerHTML = "";
    data.forEach((r) => {
      const tr = document.createElement("tr");
      const affaireLabel = `${r.codeAffaire || ''} ${r.affaireLibelle || ''}`.trim();
      const articleLabel = `${r.marque || ''} ${r.reference || ''} ${r.libelle || ''}`.trim();

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
      tdStatut.style.fontWeight = "bold";
      tdStatut.style.color = r.statut === "brouillon" ? "#fbbf24" :
                            r.statut === "valide" ? "#10b981" : "#ef4444";

      // ✅ COLONNE ACTIONS
      const tdActions = document.createElement("td");
      if (r.statut === "brouillon" && r.createdBy === currentUserEmail) {
        const btnEdit = document.createElement("button");
        btnEdit.textContent = "✏️ Modifier";
        btnEdit.className = "btn-secondary btn-add";
        btnEdit.style.fontSize = "0.75rem";
        btnEdit.style.padding = "4px 8px";
        btnEdit.addEventListener("click", () => {
          openPanierModal(r.id, true);
        });
        tdActions.appendChild(btnEdit);
      }

      tr.appendChild(tdAffaire);
      tr.appendChild(tdArticle);
      tr.appendChild(tdQte);
      tr.appendChild(tdDate);
      tr.appendChild(tdStatut);
      tr.appendChild(tdActions);
      reservBody.appendChild(tr);
    });
  }

  // Recherche dans la liste des réservations
  if (reservSearchInput) {
    reservSearchInput.addEventListener("input", () => {
      const q = reservSearchInput.value.trim().toLowerCase();
      if (!q) {
        renderReservations(reservations);
        return;
      }
      const filtered = reservations.filter((r) => {
        const affaireLabel = `${r.codeAffaire || ''} ${r.affaireLibelle || ''}`.trim();
        const articleLabel = `${r.marque || ''} ${r.reference || ''} ${r.libelle || ''}`.trim();
        const haystack = `${affaireLabel} ${articleLabel} ${r.statut || ""}`.toLowerCase();
        return haystack.includes(q);
      });
      renderReservations(filtered);
    });
  }

  // ✅ NOUVELLE FONCTION : Sauvegarder brouillon
  async function saveDraft() {
    if (!panierLignes.length || draftReservationId) {
      alert("Panier vide ou brouillon déjà sauvegardé.");
      return;
    }

    const draftData = {
      statut: "brouillon",
      affaireId: selectAffaire?.value || "",
      dateDisponibilite: inputDateDispo?.value || "",
      lignes: panierLignes.map(l => ({
        articleId: l.articleId,
        quantite: l.quantite || 0
      })),
      createdBy: currentUserEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, "reservations"), draftData);
      draftReservationId = docRef.id;
      panierTitle.textContent = `Brouillon (${docRef.id.slice(-6)}) 💾`;
      alert("✅ Brouillon sauvegardé !");
      await chargerReservations();
    } catch (error) {
      console.error("Erreur sauvegarde brouillon:", error);
      alert("❌ Erreur lors de la sauvegarde.");
    }
  }

  // ✅ FONCTION MODIFIÉE : openPanierModal avec paramètre brouillon
  function openPanierModal(reservationId = null, isDraft = false) {
    if (!panierModalBackdrop || !panierForm || !panierTitle || !inputDateDispo || !panierBody) return;

    panierTitle.textContent = isDraft ? 
      `Modifier brouillon (${reservationId?.slice(-6)})` : 
      "Nouvelle réservation";
      
    panierForm.reset();
    panierLignes = [];
    panierBody.innerHTML = "";
    inputDateDispo.valueAsDate = new Date();
    draftReservationId = reservationId;

    if (isDraft) {
      chargerBrouillon(reservationId);
    }
    
    panierModalBackdrop.classList.add("open");
  }

  // ✅ NOUVELLE FONCTION : Charger brouillon
  async function chargerBrouillon(reservationId) {
    try {
      const docSnap = await getDoc(doc(db, "reservations", reservationId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.statut === "brouillon" && data.createdBy === currentUserEmail) {
          if (data.affaireId) selectAffaire.value = data.affaireId;
          if (data.dateDisponibilite) inputDateDispo.value = data.dateDisponibilite;
          
          // Restaurer les lignes
          data.lignes?.forEach(ligne => {
            const idTemp = crypto.randomUUID();
            panierLignes.push({ 
              idTemp, 
              articleId: ligne.articleId, 
              quantite: ligne.quantite || 0 
            });
            ajouterLignePanierAvecDonnees(idTemp, ligne.articleId, ligne.quantite);
          });
        } else {
          alert("❌ Accès refusé à ce brouillon.");
          closePanierModal();
        }
      }
    } catch (error) {
      console.error("Erreur chargement brouillon:", error);
      alert("❌ Erreur chargement brouillon.");
    }
  }

  // Panier (modale)
  function closePanierModal() {
    if (panierModalBackdrop) panierModalBackdrop.classList.remove("open");
    draftReservationId = null;
  }

  // Modale sélection article
  function openArticleSelectModal(callback) {
    articleSelectionCallback = callback;
    if (articleSearchInput) {
      articleSearchInput.value = "";
      renderArticleSearchResults("");
    }
    if (articleSelectBackdrop) {
      articleSelectBackdrop.classList.add("open");
    }
  }

  function closeArticleSelectModal() {
    if (articleSelectBackdrop) {
      articleSelectBackdrop.classList.remove("open");
    }
    articleSelectionCallback = null;
  }

  function renderArticleSearchResults(query) {
    if (!articleResultsTable) return;
    const q = (query || "").trim().toLowerCase();
    articleResultsTable.innerHTML = "";

    if (!q) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.style.textAlign = "center";
      td.style.padding = "16px";
      td.textContent = "Tapez pour rechercher…";
      tr.appendChild(td);
      articleResultsTable.appendChild(tr);
      return;
    }

    const matches = articles
      .filter((a) => {
        const label = `${a.marque || ""} ${a.reference || ""} ${a.libelle || ""}`.toLowerCase();
        return label.includes(q);
      })
      .slice(0, 50);

    if (!matches.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.style.textAlign = "center";
      td.style.padding = "16px";
      td.textContent = "Aucun article trouvé";
      tr.appendChild(td);
      articleResultsTable.appendChild(tr);
      return;
    }

    matches.forEach((article) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";

      const tdMarque = document.createElement("td");
      tdMarque.textContent = article.marque || "";
      const tdRef = document.createElement("td");
      tdRef.textContent = article.reference || "";
      const tdLib = document.createElement("td");
      tdLib.textContent = article.libelle || "";
      const tdCump = document.createElement("td");
      tdCump.textContent = formatNombre(article.cump, 2);

      tr.appendChild(tdMarque);
      tr.appendChild(tdRef);
      tr.appendChild(tdLib);
      tr.appendChild(tdCump);

      tr.addEventListener("click", () => {
        if (articleSelectionCallback) {
          articleSelectionCallback(article);
          closeArticleSelectModal();
        }
      });
      articleResultsTable.appendChild(tr);
    });
  }

  // ✅ FONCTION AJOUTÉE : ajouterLignePanier avec données pré-remplies (pour brouillon)
  function ajouterLignePanierAvecDonnees(idTemp, articleId = "", quantite = 0) {
    if (!panierBody) return;

    const tr = document.createElement("tr");
    tr.dataset.id = idTemp;

    // Colonne Article
    const tdArticle = document.createElement("td");
    const articleDisplay = document.createElement("span");
    
    if (articleId) {
      const article = articles.find(a => a.id === articleId);
      if (article) {
        articleDisplay.textContent = `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`;
        articleDisplay.style.color = "#fff";
      }
    } else {
      articleDisplay.textContent = "Cliquez pour sélectionner";
      articleDisplay.style.color = "#007bff";
      articleDisplay.style.cursor = "pointer";
      articleDisplay.addEventListener("click", () => {
        openArticleSelectModal((article) => {
          const ligne = panierLignes.find(l => l.idTemp === idTemp);
          if (ligne) {
            ligne.articleId = article.id;
            articleDisplay.textContent = `${article.marque || ""} - ${article.reference || ""} - ${article.libelle || ""}`;
            articleDisplay.style.color = "#fff";
          }
        });
      });
    }
    tdArticle.appendChild(articleDisplay);

    // Colonne Quantité
    const tdQte = document.createElement("td");
    const inputQte = document.createElement("input");
    inputQte.type = "number";
    inputQte.min = "0.01";
    inputQte.step = "0.01";
    inputQte.required = true;
    inputQte.value = quantite;
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

  // Ajout ligne panier (version originale)
  function ajouterLignePanier() {
    const idTemp = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
    panierLignes.push({ idTemp, articleId: "", quantite: 0 });
    ajouterLignePanierAvecDonnees(idTemp);
  }

  // Réservé existant pour un article (en_cours + valide)
  async function chargerReservationsPourCalcul(articleId) {
    const snap = await getDocs(collection(db, "reservations"));
    let totalRes = 0;
    snap.forEach((docSnap) => {
      const r = docSnap.data();
      if (r.articleId === articleId && (r.statut === "en_cours" || r.statut === "valide")) {
        totalRes += Number(r.quantite) || 0;
      }
    });
    return totalRes;
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
    manquants.forEach((m) => {
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

  // ✅ VALIDATION MODIFIÉE : Gestion brouillon + validation complète
  if (panierForm) {
    panierForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const affaireId = selectAffaire ? selectAffaire.value : "";
      if (!affaireId) {
        alert("Sélectionner une affaire.");
        return;
      }

      const affaireObj = affaires.find((a) => a.id === affaireId);
      const codeAffaire = affaireObj?.code || "";
      const libAffaire = affaireObj?.libelle || "";
      const affaireLibelle = codeAffaire && libAffaire
        ? `${codeAffaire} - ${libAffaire}`
        : (codeAffaire || libAffaire || affaireId);

      if (!inputDateDispo || !inputDateDispo.value) {
        alert("Saisir une date de mise à disposition.");
        return;
      }

      const dateDispo = new Date(inputDateDispo.value);
      const lignesValides = panierLignes.filter((l) => l.articleId && l.quantite > 0);

      if (!lignesValides.length) {
        alert("Ajouter au moins une ligne avec article et quantité.");
        return;
      }

      const userName = sessionStorage.getItem("userName") || "";

      // ✅ GESTION BROUILLON
      if (draftReservationId) {
        try {
          await updateDoc(doc(db, "reservations", draftReservationId), {
            statut: "brouillon",
            affaireId,
            dateDisponibilite: inputDateDispo.value,
            lignes: lignesValides.map((l) => ({
              articleId: l.articleId,
              quantite: l.quantite
            })),
            updatedAt: serverTimestamp()
          });
          alert("✅ Brouillon mis à jour !");
          closePanierModal();
          await chargerReservations();
          return;
        } catch (error) {
          console.error("Erreur mise à jour brouillon:", error);
          alert("❌ Erreur mise à jour.");
          return;
        }
      }

      // LOGIQUE VALIDATION COMPLÈTE (stock, etc.)
      statsParArticle = window.statsParArticleGlobal || {};
      const manquants = [];

      for (const ligne of lignesValides) {
        const article = articles.find((a) => a.id === ligne.articleId);
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
      if (panierBody) panierBody.innerHTML = "";
      closePanierModal();
    });
  }

  // Listeners ouvertures/fermetures de modales
  if (btnNewReservation) {
    btnNewReservation.addEventListener("click", async () => {
      await chargerAffaires();
      await chargerArticlesPourPanier();
      openPanierModal();
    });
  }

  if (btnPanierCancel) {
    btnPanierCancel.addEventListener("click", () => {
      closePanierModal();
    });
  }

  if (btnPanierClose) {
    btnPanierClose.addEventListener("click", () => {
      closePanierModal();
    });
  }

  if (panierModalBackdrop) {
    panierModalBackdrop.addEventListener("click", (e) => {
      if (e.target === panierModalBackdrop) closePanierModal();
    });
  }

  // ✅ LISTENER BROUILLON
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener("click", saveDraft);
  }

  // Événements modale article
  if (articleSearchInput) {
    articleSearchInput.addEventListener("input", (e) => {
      renderArticleSearchResults(e.target.value);
    });
  }

  if (articleSelectClose) {
    articleSelectClose.addEventListener("click", () => {
      closeArticleSelectModal();
    });
  }

  if (articleSelectCancel) {
    articleSelectCancel.addEventListener("click", () => {
      closeArticleSelectModal();
    });
  }

  if (articleSelectBackdrop) {
    articleSelectBackdrop.addEventListener("click", (e) => {
      if (e.target === articleSelectBackdrop) {
        closeArticleSelectModal();
      }
    });
  }

  // Ajout ligne panier
  if (btnPanierAddLine) {
    btnPanierAddLine.addEventListener("click", () => {
      ajouterLignePanier();
    });
  }

  // Initialisation + tri
  (async function initReservations() {
    await chargerReservations();
    const tableRes = document.getElementById("reservationsTable");
    if (tableRes && window.makeTableSortable) {
      window.makeTableSortable(tableRes, [
        "string", "string", "number", "date", "string", "string" // ✅ + colonne actions
      ]);
    }
  })();
}); // fin DOMContentLoaded
