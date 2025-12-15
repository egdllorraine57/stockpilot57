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

  /* =======================
     VARIABLES DOM
  ======================= */
  const reservBody = document.getElementById("reservationsBody");
  const reservSearchInput = document.getElementById("reservSearchInput");
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

  /* =======================
     DONNÉES
  ======================= */
  let reservations = [];
  let affaires = [];
  let articles = [];
  let panierLignes = [];
  let draftReservationGroupId = null;
  let articleSelectionCallback = null;
  let statsParArticle = window.statsParArticleGlobal || {};

  /* =======================
     HELPERS
  ======================= */
  const uid = () => crypto.randomUUID();
  const formatDateFR = d => d?.toDate ? d.toDate().toLocaleDateString("fr-FR") : "";
  const formatNombre = n => Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 });

  const genererReservationGroupId = () =>
    `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /* =======================
     CHARGEMENTS
  ======================= */
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

  /* =======================
     RENDU TABLEAU
  ======================= */
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
        <td style="font-weight:bold;color:${r.statut==="brouillon"?"#fbbf24":r.statut==="en_cours"?"#10b981":"#ef4444"}">
          ${r.statut}
        </td>
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

  /* =======================
     PANIER
  ======================= */
  function openPanierModal(groupId = null, isDraft = false) {
    panierForm.reset();
    panierLignes = [];
    panierBody.innerHTML = "";
    inputDateDispo.valueAsDate = new Date();
    draftReservationGroupId = groupId;

    panierTitle.textContent = isDraft ? `Modifier brouillon ${groupId.slice(-6)}` : "Nouvelle réservation";
    if (isDraft) chargerBrouillon(groupId);

    panierModalBackdrop.classList.add("open");
  }

  function closePanierModal() {
    panierModalBackdrop.classList.remove("open");
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
      if (l) l.quantite = +e.target.value || 0;
    };

    tr.querySelector("button").onclick = () => {
      panierLignes = panierLignes.filter(l => l.idTemp !== idTemp);
      tr.remove();
    };

    panierBody.appendChild(tr);
  }

  /* =======================
     BROUILLONS
  ======================= */
  async function saveDraft() {
    const groupId = draftReservationGroupId || genererReservationGroupId();
    const affaire = affaires.find(a => a.id === selectAffaire.value);

    for (const l of panierLignes.filter(l=>l.articleId && l.quantite>0)) {
      const art = articles.find(a=>a.id===l.articleId);
      await addDoc(collection(db,"reservations"),{
        reservationGroupId: groupId,
        statut:"brouillon",
        affaireId: selectAffaire.value,
        affaireLibelle:`${affaire.code} - ${affaire.libelle}`,
        articleId:l.articleId,
        articleLabel:`${art.marque} ${art.reference} ${art.libelle}`,
        quantite:l.quantite,
        dateDisponibilite:new Date(inputDateDispo.value),
        createdBy:currentUserEmail,
        createdByName:currentUserName,
        createdAt:serverTimestamp()
      });
    }

    await chargerReservations();
    closePanierModal();
    alert("✅ Brouillon sauvegardé");
  }

  async function chargerBrouillon(groupId) {
    const q = query(
      collection(db,"reservations"),
      where("reservationGroupId","==",groupId),
      where("createdBy","==",currentUserEmail)
    );

    const snap = await getDocs(q);
    snap.forEach(d=>{
      const r=d.data();
      const idTemp=uid();
      panierLignes.push({idTemp,articleId:r.articleId,quantite:r.quantite});
      ajouterLignePanierAvecDonnees(idTemp,r.articleId,r.quantite);
      selectAffaire.value=r.affaireId;
      inputDateDispo.value=r.dateDisponibilite.toDate().toISOString().split("T")[0];
    });
  }

  /* =======================
     INIT
  ======================= */
  btnNewReservation.onclick = async () => {
    await chargerAffaires();
    await chargerArticles();
    openPanierModal();
  };

  btnPanierCancel.onclick = closePanierModal;
  btnPanierClose.onclick = closePanierModal;

  (async () => {
    await chargerReservations();
  })();
});
