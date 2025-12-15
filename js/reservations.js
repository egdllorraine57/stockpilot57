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
  const currentUserName  = sessionStorage.getItem("userName") || "";

  const reservBody = document.getElementById("reservationsBody");
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

  let reservations = [];
  let affaires = [];
  let articles = [];
  let panierLignes = [];
  let draftReservationGroupId = null;
  let articleSelectionCallback = null;
  let statsParArticle = window.statsParArticleGlobal || {};

  const uid = () => crypto.randomUUID();
  const formatDateFR = d => d?.toDate ? d.toDate().toLocaleDateString("fr-FR") : "";
  const formatNombre = n => Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 });

  const genererReservationGroupId = () => `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /* PDF Bon d'achat */
  function genererBonAchatPDF(affaireLibelle, manquants) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Bon d'achat - Articles manquants", 10, 20);
    doc.setFontSize(12);
    doc.text(`Affaire: ${affaireLibelle}`, 10, 35);
    doc.text(`Date: ${new Date().toLocaleString("fr-FR")}`, 10, 45);

    let y = 60;
    doc.text("MARQUE", 10, y);
    doc.text("RÉF", 50, y);
    doc.text("LIBELLÉ", 85, y);
    doc.text("CUMP", 160, y);
    doc.text("QTE", 180, y);
    y += 10;

    manquants.forEach(m => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${m.marque || ""}`, 10, y);
      doc.text(`${m.reference || ""}`, 50, y);
      doc.text(`${(m.libelle || "").slice(0,25)}`, 85, y);
      doc.text(formatNombre(m.cump), 160, y);
      doc.text(formatNombre(m.qteManquante), 180, y);
      y += 8;
    });

    const nom = `bon_achat_${affaireLibelle.replace(/[^a-z0-9]/gi,'_')}.pdf`;
    doc.save(nom);
  }

  /* Chargements */
  async function chargerAffaires() {
    const snap = await getDocs(collection(db, "affaires"));
    affaires = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    selectAffaire.innerHTML = "";
    affaires.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.code || ""} - ${a.libelle || ""}`.trim();
      selectAffaire.appendChild(opt);
    });
  }

  async function chargerArticles() {
    const snap = await getDocs(collection(db, "articles"));
    articles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function chargerReservations() {
    const snap = await getDocs(collection(db, "reservations"));
    reservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderReservations(reservations);
  }

  function renderReservations(data) {
    reservBody.innerHTML = "";
    const groupes = {};
    data.forEach(r => {
      const gid = r.reservationGroupId || r.id;
      groupes[gid] ??= [];
      groupes[gid].push(r);
    });

    Object.entries(groupes).forEach(([gid, lignes]) => {
      const r = lignes[0];
      const tr = document.createElement("tr");
      const totalQte = lignes.reduce((s,l)=>s+(+l.quantite||0),0);
      tr.innerHTML = `
        <td>${r.affaireLibelle || r.codeAffaire || ""}</td>
        <td>${r.articleLabel || `${r.marque||""} ${r.reference||""} ${r.libelle||""}`.trim()}</td>
        <td>${formatNombre(totalQte)}</td>
        <td>${formatDateFR(r.dateDisponibilite)}</td>
        <td style="font-weight:bold;color:${
          r.statut==="brouillon" ? "#fbbf24" :
          r.statut==="en_cours"||r.statut==="valide" ? "#10b981" : "#ef4444"
        }">${r.statut||"N/A"}</td>
        <td></td>
      `;
      if (r.statut === "brouillon" && r.createdBy === currentUserEmail) {
        const btn = document.createElement("button");
        btn.textContent = `✏️ Modifier (${lignes.length})`;
        btn.className = "btn-secondary";
        btn.style.fontSize = "0.75rem";
        btn.style.padding = "4px 8px";
        btn.onclick = () => openPanierModal(gid, true);
        tr.lastElementChild.appendChild(btn);
      }
      reservBody.appendChild(tr);
    });
  }

  /* Modale Panier */
  function openPanierModal(groupId = null, isDraft = false) {
    panierForm.reset();
    panierLignes = [];
    panierBody.innerHTML = "";
    inputDateDispo.valueAsDate = new Date();
    draftReservationGroupId = groupId;

    panierTitle.textContent = isDraft
      ? `Modifier brouillon ${groupId?.slice(-6)}`
      : "Nouvelle réservation";

    if (isDraft) chargerBrouillon(groupId);
    panierModalBackdrop.classList.add("open");
  }

  function closePanierModal() {
    panierModalBackdrop.classList.remove("open");
    draftReservationGroupId = null;
  }

  /* Ajouter Ligne */
  function ajouterLignePanier() {
    const idTemp = uid();
    panierLignes.push({ idTemp, articleId: "", quantite: 0 });

    const tr = document.createElement("tr");
    tr.dataset.id = idTemp;

    const tdArticle = document.createElement("td");
    const span = document.createElement("span");
    span.textContent = "Cliquez pour sélectionner";
    span.style.cursor = "pointer";
    span.style.color = "#3b82f6";
    span.onclick = () => openArticleSelectModal(article => {
      const ligne = panierLignes.find(l => l.idTemp === idTemp);
      if (!ligne) return;
      ligne.articleId = article.id;
      span.textContent = `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`.trim();
      span.style.color = "#fff";
    });
    tdArticle.appendChild(span);

    const tdQte = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.min = "0.01";
    input.oninput = e => {
      const ligne = panierLignes.find(l => l.idTemp === idTemp);
      if (ligne) ligne.quantite = Number(e.target.value) || 0;
    };
    tdQte.appendChild(input);

    const tdActions = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Supprimer";
    btn.className = "btn-secondary";
    btn.onclick = () => {
      panierLignes = panierLignes.filter(l => l.idTemp !== idTemp);
      tr.remove();
    };
    tdActions.appendChild(btn);

    tr.append(tdArticle, tdQte, tdActions);
    panierBody.appendChild(tr);
  }

  /* Modal Sélection Article */
  function openArticleSelectModal(cb) {
    articleSelectionCallback = cb;
    articleSearchInput.value = "";
    renderArticleSearchResults("");
    articleSelectBackdrop.classList.add("open");
  }

  function closeArticleSelectModal() {
    articleSelectBackdrop.classList.remove("open");
    articleSelectionCallback = null;
  }

  function renderArticleSearchResults(q) {
    articleResultsTable.innerHTML = "";
    if (!q?.trim()) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="text-align:center;padding:20px">Tapez pour rechercher...</td>`;
      articleResultsTable.appendChild(tr);
      return;
    }

    const queryText = q.toLowerCase();
    const matches = articles.filter(a =>
      `${a.marque||""} ${a.reference||""} ${a.libelle||""}`.toLowerCase().includes(queryText)
    ).slice(0, 50);

    if (!matches.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" style="text-align:center;padding:20px">Aucun article trouvé</td>`;
      articleResultsTable.appendChild(tr);
      return;
    }

    matches.forEach(a => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.innerHTML = `
        <td>${a.marque || ""}</td>
        <td>${a.reference || ""}</td>
        <td>${a.libelle || ""}</td>
        <td>${formatNombre(a.cump)}</td>
      `;
      tr.onclick = () => {
        articleSelectionCallback?.(a);
        closeArticleSelectModal();
      };
      articleResultsTable.appendChild(tr);
    });
  }

  /* Charger Brouillon */
  async function chargerBrouillon(groupId) {
    const q = query(
      collection(db, "reservations"),
      where("reservationGroupId", "==", groupId),
      where("createdBy", "==", currentUserEmail),
      where("statut", "==", "brouillon")
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      alert("❌ Brouillon introuvable ou accès refusé.");
      return;
    }

    snap.forEach(d => {
      const r = d.data();
      const idTemp = uid();
      panierLignes.push({ idTemp, articleId: r.articleId, quantite: r.quantite || 0 });

      if (!selectAffaire.value) selectAffaire.value = r.affaireId;
      if (!inputDateDispo.value && r.dateDisponibilite) {
        inputDateDispo.value = r.dateDisponibilite.toDate().toISOString().split("T")[0];
      }

      ajouterLignePanierAvecDonnees(idTemp, r.articleId, r.quantite || 0);
    });
    
    panierTitle.textContent += ` (${snap.size} lignes)`;
  }

  function ajouterLignePanierAvecDonnees(idTemp, articleId, quantite) {
    const article = articles.find(a => a.id === articleId);
    if (!article) return;

    const tr = document.createElement("tr");
    tr.dataset.id = idTemp;

    const tdArticle = document.createElement("td");
    tdArticle.textContent = `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`.trim();

    const tdQte = document.createElement("td");
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.min = "0.01";
    input.value = quantite;
    input.oninput = e => {
      const l = panierLignes.find(x => x.idTemp === idTemp);
      if (l) l.quantite = Number(e.target.value) || 0;
    };
    tdQte.appendChild(input);

    const tdActions = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Supprimer";
    btn.className = "btn-secondary";
    btn.onclick = () => {
      panierLignes = panierLignes.filter(l => l.idTemp !== idTemp);
      tr.remove();
    };
    tdActions.appendChild(btn);

    tr.append(tdArticle, tdQte, tdActions);
    panierBody.appendChild(tr);
  }

  /* Sauvegarder Brouillon */
  async function saveDraft() {
    if (!panierLignes.some(l => l.articleId && l.quantite > 0)) {
      alert("Ajoutez au moins une ligne valide.");
      return;
    }

    const groupId = draftReservationGroupId || genererReservationGroupId();
    const affaire = affaires.find(a => a.id === selectAffaire.value);

    try {
      for (const ligne of panierLignes) {
        if (!ligne.articleId || ligne.quantite <= 0) continue;
        const article = articles.find(a => a.id === ligne.articleId);
        if (!article) continue;

        await addDoc(collection(db, "reservations"), {
          reservationGroupId: groupId,
          statut: "brouillon",
          affaireId: selectAffaire.value,
          codeAffaire: affaire?.code || "",
          affaireLibelle: `${affaire?.code || ""} - ${affaire?.libelle || ""}`.trim(),
          articleId: ligne.articleId,
          marque: article.marque || "",
          reference: article.reference || "",
          libelle: article.libelle || "",
          articleLabel: `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`.trim(),
          quantite: ligne.quantite,
          dateDisponibilite: new Date(inputDateDispo.value),
          createdBy: currentUserEmail,
          createdByName: currentUserName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      draftReservationGroupId = groupId;
      alert(`✅ Brouillon sauvegardé (${panierLignes.filter(l => l.articleId && l.quantite > 0).length} lignes) !`);
      await chargerReservations();
      closePanierModal();
    } catch (error) {
      console.error("Erreur saveDraft:", error);
      alert("❌ Erreur sauvegarde.");
    }
  }

  /* Valider Réservation */
  async function validerReservation() {
    if (!panierLignes.some(l => l.articleId && l.quantite > 0)) {
      alert("Panier vide.");
      return;
    }

    const affaire = affaires.find(a => a.id === selectAffaire.value);
    if (!affaire) return alert("Sélectionnez une affaire.");
    const dateDispo = new Date(inputDateDispo.value);
    const lignesValides = panierLignes.filter(l => l.articleId && l.quantite > 0);
    const manquants = [];

    if (draftReservationGroupId) {
      const q = query(
        collection(db, "reservations"),
        where("reservationGroupId", "==", draftReservationGroupId),
        where("statut", "==", "brouillon")
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    for (const ligne of lignesValides) {
      const article = articles.find(a => a.id === ligne.articleId);
      if (!article) continue;

      const stats = statsParArticle[ligne.articleId] || { stock: 0, cump: 0 };
      const stockPhysique = Number(stats.stock) || 0;

      const reserveExistante = reservations
        .filter(r => r.articleId === ligne.articleId &&
                    (r.statut === "en_cours" || r.statut === "valide"))
        .reduce((sum, r) => sum + (Number(r.quantite) || 0), 0);

      const stockDisponible = stockPhysique - reserveExistante;
      const qteDemandee = Number(ligne.quantite);
      const qteReservable = Math.max(0, Math.min(stockDisponible, qteDemandee));
      const qteManquante = qteDemandee - qteReservable;

      if (qteReservable > 0) {
        await addDoc(collection(db, "reservations"), {
          reservationGroupId: draftReservationGroupId || genererReservationGroupId(),
          affaireId: selectAffaire.value,
          codeAffaire: affaire.code || "",
          affaireLibelle: `${affaire.code || ""} - ${affaire.libelle || ""}`.trim(),
          articleId: ligne.articleId,
          marque: article.marque || "",
          reference: article.reference || "",
          libelle: article.libelle || "",
          articleLabel: `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`.trim(),
          articleAllee: article.allee || "",
          articlePlace: article.place || "",
          articleNiveau: article.niveau || "",
          quantite: qteReservable,
          dateDisponibilite: dateDispo,
          statut: "en_cours",
          prixUnitaire: stats.cump || 0,
          createdBy: currentUserName,
          createdAt: serverTimestamp()
        });
      }

      if (qteManquante > 0) {
        manquants.push({
          marque: article.marque || "",
          reference: article.reference || "",
          libelle: article.libelle || "",
          cump: stats.cump || 0,
          qteManquante
        });
      }
    }

    await chargerReservations();
    if (window.rechargerArticlesDepuisReservations) window.rechargerArticlesDepuisReservations();
    if (window.rechargerPreparationsDepuisArticles) window.rechargerPreparationsDepuisArticles();

    if (manquants.length > 0) {
      genererBonAchatPDF(`${affaire.code || ""} - ${affaire.libelle || ""}`, manquants);
    }

    draftReservationGroupId = null;
    panierLignes = [];
    panierBody.innerHTML = "";
    closePanierModal();

    const totalReserve = lignesValides.reduce((sum, l) => sum + (Number(l.quantite) || 0), 0) - manquants.reduce((sum, m) => sum + m.qteManquante, 0);
    const totalManquant = manquants.reduce((sum, m) => sum + m.qteManquante, 0);

    alert(`✅ Réservation validée !\n${totalReserve} réservés\n${totalManquant} à commander`);
  }

  /* Listeners */
  btnNewReservation.onclick = async () => {
    await chargerAffaires();
    await chargerArticles();
    openPanierModal();
  };

  btnPanierAddLine.onclick = ajouterLignePanier;
  btnPanierCancel.onclick = closePanierModal;
  btnPanierClose.onclick = closePanierModal;
  if (btnSaveDraft) btnSaveDraft.onclick = saveDraft;
  panierForm.onsubmit = e => {
    e.preventDefault();
    validerReservation();
  };
  articleSearchInput.oninput = e => renderArticleSearchResults(e.target.value);
  articleSelectClose.onclick = closeArticleSelectModal;
  articleSelectCancel.onclick = closeArticleSelectModal;
  panierModalBackdrop.onclick = e => { if (e.target === panierModalBackdrop) closePanierModal(); };
  articleSelectBackdrop.onclick = e => { if (e.target === articleSelectBackdrop) closeArticleSelectModal(); };

  (async () => { await chargerReservations(); })();
});
