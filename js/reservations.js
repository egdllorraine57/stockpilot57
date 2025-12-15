// /js/reservations.js
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  updateDoc,
  getDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const { db } = window._firebase;

  // ... [garder TOUTES les variables existantes jusqu'à currentUserEmail]

  let reservations = [];
  let affaires = [];
  let articles = [];
  let statsParArticle = window.statsParArticleGlobal || {};
  let panierLignes = [];
  let draftReservationGroupId = null; // ✅ NOUVEAU : ID groupe brouillon
  const currentUserEmail = sessionStorage.getItem('userEmail') || '';

  // ... [garder TOUTES les fonctions helpers + onglets + chargement données]

  // ✅ NOUVEAU : Créer un ID unique pour grouper les lignes brouillon
  function genererReservationGroupId() {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ✅ RENDU TABLEAU - Grouper par reservationGroupId
  function renderReservations(data) {
    if (!reservBody) return;
    reservBody.innerHTML = "";

    // Grouper par reservationGroupId ou ligne individuelle
    const grouped = {};
    data.forEach(r => {
      const groupId = r.reservationGroupId || r.id;
      if (!grouped[groupId]) grouped[groupId] = [];
      grouped[groupId].push(r);
    });

    Object.entries(grouped).forEach(([groupId, lignes]) => {
      const firstLigne = lignes[0];
      const tr = document.createElement("tr");
      
      const tdAffaire = document.createElement("td");
      tdAffaire.textContent = firstLigne.affaireLibelle || firstLigne.codeAffaire || "";

      const tdArticle = document.createElement("td");
      tdArticle.textContent = `${firstLigne.marque || ''} ${firstLigne.reference || ''} ${firstLigne.libelle || ''}`.trim();

      const tdQte = document.createElement("td");
      const totalQte = lignes.reduce((sum, l) => sum + (Number(l.quantite) || 0), 0);
      tdQte.textContent = formatNombre(totalQte, 2);

      const tdDate = document.createElement("td");
      tdDate.textContent = formatDateFR(firstLigne.dateDisponibilite);

      const tdStatut = document.createElement("td");
      tdStatut.textContent = firstLigne.statut || "N/A";
      tdStatut.style.fontWeight = "bold";
      const color = firstLigne.statut === "brouillon" ? "#fbbf24" : 
                   firstLigne.statut === "valide" ? "#10b981" : "#ef4444";
      tdStatut.style.color = color;

      // ✅ ACTIONS - Seulement brouillon du user
      const tdActions = document.createElement("td");
      if (firstLigne.statut === "brouillon" && firstLigne.createdBy === currentUserEmail) {
        const btnEdit = document.createElement("button");
        btnEdit.textContent = `✏️ Modifier (${lignes.length} lignes)`;
        btnEdit.className = "btn-secondary";
        btnEdit.style.fontSize = "0.75rem";
        btnEdit.style.padding = "4px 8px";
        btnEdit.addEventListener("click", () => openPanierModal(groupId, true));
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

  // ✅ SAUVEGARDER BROUILLON - Même structure que en_cours
  async function saveDraft() {
    if (!panierLignes.some(l => l.articleId && l.quantite > 0)) {
      alert("Ajoutez au moins une ligne valide.");
      return;
    }

    const reservationGroupId = draftReservationGroupId || genererReservationGroupId();
    const affaireObj = affaires.find(a => a.id === selectAffaire?.value);
    const userName = sessionStorage.getItem("userName") || "";

    try {
      // Sauvegarder chaque ligne individuellement
      for (const ligne of panierLignes) {
        if (!ligne.articleId || ligne.quantite <= 0) continue;

        const article = articles.find(a => a.id === ligne.articleId);
        if (!article) continue;

        await addDoc(collection(db, "reservations"), {
          reservationGroupId, // ✅ GROUPE LES LIGNES
          statut: "brouillon",
          affaireId: selectAffaire?.value || "",
          codeAffaire: affaireObj?.code || "",
          affaireLibelle: `${affaireObj?.code || ""} - ${affaireObj?.libelle || ""}`.trim(),
          articleId: ligne.articleId,
          marque: article.marque || "",
          reference: article.reference || "",
          libelle: article.libelle || "",
          articleLabel: `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`.trim(),
          articleAllee: article.allee || "",
          articlePlace: article.place || "",
          articleNiveau: article.niveau || "",
          quantite: ligne.quantite,
          dateDisponibilite: new Date(inputDateDispo?.value || Date.now()),
          createdBy: currentUserEmail,
          createdByName: userName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      draftReservationGroupId = reservationGroupId;
      panierTitle.textContent = `Brouillon ${reservationGroupId.slice(-8)} 💾`;
      alert(`✅ Brouillon sauvegardé (${panierLignes.filter(l => l.articleId && l.quantite > 0).length} lignes) !`);
      await chargerReservations();
      closePanierModal(); // ✅ FERME APRÈS SAUVEGARDE
    } catch (error) {
      console.error("Erreur:", error);
      alert("❌ Erreur sauvegarde.");
    }
  }

  // ✅ CHARGER BROUILLON - TOUTES les lignes du groupe
  async function chargerBrouillon(reservationGroupId) {
    try {
      const q = query(collection(db, "reservations"), 
        where("reservationGroupId", "==", reservationGroupId),
        where("createdBy", "==", currentUserEmail)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        alert("❌ Brouillon introuvable.");
        return;
      }

      const lignes = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.statut === "brouillon") {
          lignes.push({
            id: docSnap.id,
            ...data,
            articleId: data.articleId,
            quantite: data.quantite || 0
          });
        }
      });

      if (lignes.length === 0) return;

      // Précharger affaire et date
      const firstLigne = lignes[0];
      if (firstLigne.affaireId) selectAffaire.value = firstLigne.affaireId;
      if (firstLigne.dateDisponibilite) {
        inputDateDispo.value = firstLigne.dateDisponibilite.toISOString().split('T')[0];
      }

      // Restaurer lignes
      lignes.forEach(ligne => {
        const idTemp = crypto.randomUUID();
        panierLignes.push({ idTemp, articleId: ligne.articleId, quantite: ligne.quantite });
        ajouterLignePanierAvecDonnees(idTemp, ligne.articleId, ligne.quantite);
      });

      draftReservationGroupId = reservationGroupId;
      panierTitle.textContent = `Modifier brouillon ${reservationGroupId.slice(-8)} (${lignes.length} lignes)`;
    } catch (error) {
      console.error("Erreur chargement:", error);
      alert("❌ Erreur chargement brouillon.");
    }
  }

  // ✅ VALIDATION - Convertit brouillon → en_cours
  if (panierForm) {
    panierForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      // Si brouillon existant, supprimer les anciennes lignes
      if (draftReservationGroupId) {
        const q = query(collection(db, "reservations"), 
          where("reservationGroupId", "==", draftReservationGroupId),
          where("statut", "==", "brouillon")
        );
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
      }

      // Logique validation complète (identique à l'originale)
      const affaireId = selectAffaire?.value;
      if (!affaireId) return alert("Sélectionner une affaire.");

      const affaireObj = affaires.find(a => a.id === affaireId);
      const affaireLibelle = `${affaireObj?.code || ""} - ${affaireObj?.libelle || ""}`.trim();
      if (!inputDateDispo?.value) return alert("Saisir une date.");

      const dateDispo = new Date(inputDateDispo.value);
      const lignesValides = panierLignes.filter(l => l.articleId && l.quantite > 0);
      if (!lignesValides.length) return alert("Lignes invalides.");

      const userName = sessionStorage.getItem("userName") || "";
      const manquants = [];

      for (const ligne of lignesValides) {
        const article = articles.find(a => a.id === ligne.articleId);
        if (!article) continue;

        const stats = statsParArticle[ligne.articleId] || { stock: 0, cump: 0 };
        const stockPhysique = Number(stats.stock) || 0;
        const reserveExistante = await chargerReservationsPourCalcul(ligne.articleId);
        const stockDisponible = stockPhysique - reserveExistante;
        const qDemandee = Number(ligne.quantite) || 0;
        let qReserve = 0, qManquante = 0;

        if (stockDisponible >= qDemandee) {
          qReserve = qDemandee; qManquante = 0;
        } else if (stockDisponible > 0) {
          qReserve = stockDisponible; qManquante = qDemandee - stockDisponible;
        } else {
          qReserve = 0; qManquante = qDemandee;
        }

        // Créer réservation (sans reservationGroupId pour validation finale)
        if (qReserve > 0) {
          await addDoc(collection(db, "reservations"), {
            affaireId, codeAffaire: affaireObj?.code || "",
            affaireLibelle, articleId: ligne.articleId,
            marque: article.marque || "", reference: article.reference || "",
            libelle: article.libelle || "",
            articleLabel: `${article.marque || ""} ${article.reference || ""} ${article.libelle || ""}`.trim(),
            articleAllee: article.allee || "", articlePlace: article.place || "",
            articleNiveau: article.niveau || "", quantite: qReserve,
            dateDisponibilite: dateDispo, statut: "en_cours",
            prixUnitaire: stats.cump || 0, createdBy: userName,
            createdAt: serverTimestamp()
          });
        }

        if (qManquante > 0) {
          manquants.push({
            marque: article.marque, reference: article.reference,
            libelle: article.libelle, cump: stats.cump || 0,
            qteManquante: qManquante
          });
        }
      }

      // Finalisation
      await chargerReservations();
      if (window.rechargerArticlesDepuisReservations) await window.rechargerArticlesDepuisReservations();
      if (window.rechargerPreparationsDepuisArticles) await window.rechargerPreparationsDepuisArticles();
      if (manquants.length > 0) genererBonAchatPDF(affaireLibelle, manquants);

      draftReservationGroupId = null;
      panierLignes = []; panierBody.innerHTML = "";
      closePanierModal();
      alert("✅ Réservation validée !");
    });
  }

  // ... [garder TOUTES les autres fonctions : openPanierModal, ajouterLignePanier, etc.]
  function openPanierModal(reservationGroupId = null, isDraft = false) {
    if (!panierModalBackdrop || !panierForm || !panierTitle || !inputDateDispo || !panierBody) return;

    panierTitle.textContent = isDraft ? 
      `Modifier brouillon (${reservationGroupId?.slice(-8)})` : "Nouvelle réservation";
      
    panierForm.reset();
    panierLignes = [];
    panierBody.innerHTML = "";
    inputDateDispo.valueAsDate = new Date();
    draftReservationGroupId = reservationGroupId;

    if (isDraft) {
      chargerBrouillon(reservationGroupId);
    }
    
    panierModalBackdrop.classList.add("open");
  }

  // ... [fin du fichier identique]
});
