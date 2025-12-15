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

  /* =========================
     CONTEXTE UTILISATEUR
  ========================= */
  const currentUserEmail = sessionStorage.getItem("userEmail") || "";
  const currentUserName  = sessionStorage.getItem("userName") || "";

  /* =========================
     DOM
  ========================= */
  const reservBody = document.getElementById("reservationsBody");
  const btnNewReservation = document.getElementById("btnNewReservation");

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

  /* =========================
     DONNÉES
  ========================= */
  let reservations = [];
  let affaires = [];
  let articles = [];
  let panierLignes = [];
  let draftReservationGroupId = null;
  let articleSelectionCallback = null;
  let statsParArticle = window.statsParArticleGlobal || {};

  /* =========================
     HELPERS
  ========================= */
  const uid = () => crypto.randomUUID();
  const formatDateFR = d =>
    d?.toDate ? d.toDate().toLocaleDateString("fr-FR") : "";
  const formatNombre = n =>
    Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 });

  const genererReservationGroupId = () =>
    `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /* =========================
     CHARGEMENTS
  ========================= */
  async function chargerAffaires() {
    const snap = await getDocs(collection(db, "affaires"));
    affaires = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    selectAffaire.innerHTML = "";
    affaires.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.id;
      opt.textContent = `${a.code || ""} - ${a.libelle || ""}`;
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

  /* =========================
     TABLE RÉSERVATIONS
  ========================= */
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

      tr.innerHTML = `
        <td>${r.affaireLibelle || ""}</td>
        <td>${r.articleLabel || ""}</td>
        <td>${formatNombre(lignes.reduce((s,l)=>s+(+l.quantite||0),0))}</td>
        <td>${formatDateFR(r.dateDisponibilite)}</td>
        <td style="font-weight:bold;color:${
          r.statut==="brouillon" ? "#fbbf24" :
          r.statut==="en_cours" ? "#10b981" : "#ef4444"
        }">${r.statut}</td>
        <td></td>
      `;

      if (r.statut === "brouillon" && r.createdBy === currentUserEmail) {
        const btn = document.createElement("button");
        btn.textContent = `✏️ Modifier (${lignes.length})`;
        btn.className = "secondary";
        btn.onclick = () => openPanierModal(gid, true);
        tr.lastElementChild.appendChild(btn);
      }

      reservBody.appendChild(tr);
    });
  }

  /* =========================
     MODALE PANIER
  ========================= */
  function openPanierModal(groupId = null, isDraft = false) {
    panierForm.reset();
    panierLignes = [];
    panierBody.innerHTML = "";
    inputDateDispo.valueAsDate = new Date();
    draftReservationGroupId = groupId;

    panierTitle.textContent = isDraft
      ? `Modifier brouillon ${groupId.slice(-6)}`
      : "Nouvelle réservation";

    if (isDraft) chargerBrouillon(groupId);
    panierModalBackdrop.classList.add("open");
  }

  function closePanierModal() {
    panierModalBackdrop.classList.remove("open");
  }

  /* =========================
     AJOUT LIGNE PANIER ✅
  ========================= */
  function ajouterLignePanier() {
    const idTemp = uid();
    panierLignes.push({ idTemp, articleId: "", quantite: 0 });

    const tr = document.createElement("tr");
    tr.dataset.id = idTemp;

    // Article
    const tdArticle = document.createElement("td");
    const span = document.createElement("span");
    span.textContent = "Cliquez pour sélectionner";
    span.style.cursor = "pointer";
    span.style.color = "#3b82f6";

    span.onclick = () => {
      openArticleSelectModal(article => {
        const ligne = panierLignes.find(l => l.idTemp === idTemp);
        if (!ligne) return;
        ligne.articleId = article.id;
        span.textContent = `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`;
        span.style.color = "#fff";
      });
    };

    tdArticle.appendChild(span);

    // Quantité
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

    // Action
    const tdActions = document.createElement("td");
    const btn = document.createElement("button");
    btn.textContent = "Supprimer";
    btn.className = "secondary";
    btn.onclick = () => {
      panierLignes = panierLignes.filter(l => l.idTemp !== idTemp);
      tr.remove();
    };
    tdActions.appendChild(btn);

    tr.append(tdArticle, tdQte, tdActions);
    panierBody.appendChild(tr);
  }

  /* =========================
     MODALE SÉLECTION ARTICLE
  ========================= */
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
    const queryText = q.toLowerCase();

    const matches = articles.filter(a =>
      `${a.marque} ${a.reference} ${a.libelle}`.toLowerCase().includes(queryText)
    ).slice(0, 50);

    matches.forEach(a => {
      const tr = document.createElement("tr");
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

  /* =========================
     BROUILLONS
  ========================= */
  async function chargerBrouillon(groupId) {
    const q = query(
      collection(db, "reservations"),
      where("reservationGroupId", "==", groupId),
      where("createdBy", "==", currentUserEmail)
    );

    const snap = await getDocs(q);
    snap.forEach(d => {
      const r = d.data();
      const idTemp = uid();
      panierLignes.push({ idTemp, articleId: r.articleId, quantite: r.quantite });
      ajouterLignePanierAvecDonnees(idTemp, r.articleId, r.quantite);
      selectAffaire.value = r.affaireId;
      inputDateDispo.value = r.dateDisponibilite.toDate().toISOString().split("T")[0];
    });
  }

  function ajouterLignePanierAvecDonnees(idTemp, articleId, quantite) {
    const article = articles.find(a => a.id === articleId);
    const tr = document.createElement("tr");
    tr.dataset.id = idTemp;

    tr.innerHTML = `
      <td>${article?.marque || ""} ${article?.reference || ""} ${article?.libelle || ""}</td>
      <td><input type="number" step="0.01" value="${quantite}"></td>
      <td><button class="secondary">Supprimer</button></td>
    `;

    tr.querySelector("input").oninput = e => {
      const l = panierLignes.find(x => x.idTemp === idTemp);
      if (l) l.quantite = Number(e.target.value) || 0;
    };

    tr.querySelector("button").onclick = () => {
      panierLignes = panierLignes.filter(l => l.idTemp !== idTemp);
      tr.remove();
    };

    panierBody.appendChild(tr);
  }

  /* =========================
     LISTENERS
  ========================= */
  btnNewReservation.onclick = async () => {
    await chargerAffaires();
    await chargerArticles();
    openPanierModal();
  };

  btnPanierAddLine.onclick = ajouterLignePanier;
  btnPanierCancel.onclick = closePanierModal;
  btnPanierClose.onclick = closePanierModal;

  articleSearchInput.oninput = e =>
    renderArticleSearchResults(e.target.value);
  articleSelectClose.onclick = closeArticleSelectModal;
  articleSelectCancel.onclick = closeArticleSelectModal;

  /* =========================
     INIT
  ========================= */
  (async () => {
    await chargerReservations();
  })();
});
