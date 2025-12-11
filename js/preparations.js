// /js/preparations.js
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  addDoc,
  query,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const { db } = window._firebase;

// Éléments DOM
const tabPrep = document.getElementById("tab-preparations");
const prepSection = document.getElementById("preparationsSection");

const btnPrintPrep = document.getElementById("btnPrintPreparations");
const btnValiderPrep = document.getElementById("btnValiderPreparation");
const prepBody = document.getElementById("preparationsBody");

const inputDateDebut = document.getElementById("prepDateDebut");
const inputDateFin = document.getElementById("prepDateFin");
const btnPrepFiltrer = document.getElementById("btnPrepFiltrer");

// Données
let preparations = [];      // réservations filtrées par dates
let selectedPrepIds = [];

// Helpers
function formatDateFR(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : date.toDate ? date.toDate() : null;
  if (!d) return "";
  return d.toLocaleDateString("fr-FR");
}

// Par défaut : J+1
function initDefaultDates() {
  const d1 = new Date();
  d1.setDate(d1.getDate() + 1);
  const dStr = d1.toISOString().substring(0, 10);
  inputDateDebut.value = dStr;
  inputDateFin.value = dStr;
}

// Chargement des réservations à préparer pour une plage de dates
async function chargerPreparationsParDates() {
  const debStr = inputDateDebut.value;
  const finStr = inputDateFin.value;

  if (!debStr || !finStr) {
    preparations = [];
    renderPreparations();
    return;
  }

  const deb = new Date(debStr);
  deb.setHours(0, 0, 0, 0);
  const fin = new Date(finStr);
  fin.setHours(23, 59, 59, 999);

  // Requête Firestore sur dateDisponibilite et statut en_cours (nécessite un index composite) [web:95][web:520]
  const q = query(
    collection(db, "reservations"),
    where("dateDisponibilite", ">=", Timestamp.fromDate(deb)),
    where("dateDisponibilite", "<=", Timestamp.fromDate(fin)),
    where("statut", "==", "en_cours")
  );

  const snap = await getDocs(q);
  preparations = [];
  snap.forEach(docSnap => {
    preparations.push({ id: docSnap.id, ...docSnap.data() });
  });

  renderPreparations();
}

function renderPreparations() {
  prepBody.innerHTML = "";
  selectedPrepIds = [];
  btnValiderPrep.disabled = true;

  if (preparations.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = "<td colspan='5' style='text-align:center; padding:16px;'>Aucune préparation sur cette période</td>";
    prepBody.appendChild(tr);
    return;
  }

  preparations.forEach(r => {
    const tr = document.createElement("tr");
    tr.dataset.id = r.id;

    const affaireLabel =
      r.affaireLibelle ||
      r.codeAffaire ||
      r.affaireId ||
      "";

    const articleLabel = `${r.marque || ""} ${r.reference || ""} ${r.libelle || ""}`.trim()
      || r.articleLabel || r.articleId || "";

    const tdAffaire = document.createElement("td");
    tdAffaire.textContent = affaireLabel;

    const tdArticle = document.createElement("td");
    tdArticle.textContent = articleLabel;

    const tdQte = document.createElement("td");
    tdQte.textContent = r.quantite || "";

    const tdDate = document.createElement("td");
    tdDate.textContent = formatDateFR(r.dateDisponibilite);

    const tdStatut = document.createElement("td");
    tdStatut.textContent = r.statut || "";

    tr.appendChild(tdAffaire);
    tr.appendChild(tdArticle);
    tr.appendChild(tdQte);
    tr.appendChild(tdDate);
    tr.appendChild(tdStatut);

    tr.addEventListener("click", () => {
      if (tr.classList.contains("selected")) {
        tr.classList.remove("selected");
        selectedPrepIds = selectedPrepIds.filter(id => id !== r.id);
      } else {
        tr.classList.add("selected");
        selectedPrepIds.push(r.id);
      }
      btnValiderPrep.disabled = selectedPrepIds.length === 0;
    });

    prepBody.appendChild(tr);
  });
}

// Bouton Filtrer
if (btnPrepFiltrer) {
  btnPrepFiltrer.addEventListener("click", async () => {
    await chargerPreparationsParDates();
  });
}

// Génération PDF des bons de préparation pour la période affichée
btnPrintPrep.addEventListener("click", async () => {
  if (preparations.length === 0) {
    alert("Aucune préparation à imprimer sur cette période.");
    return;
  }

  // Grouper par affaire
  const parAffaire = {};
  preparations.forEach(r => {
    const aff = r.affaireLibelle || r.codeAffaire || r.affaireId || "Sans affaire";
    if (!parAffaire[aff]) parAffaire[aff] = [];
    parAffaire[aff].push(r);
  });

  let htmlPDF = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
        .bon { page-break-after: always; padding: 20px; margin: 20px 0; border: 1px solid #333; }
        h1 { text-align: center; margin: 0 0 10px 0; font-size: 18px; }
        .date-prep { text-align: center; font-size: 12px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        th { background-color: #f0f0f0; font-weight: bold; }
        .signature { margin-top: 40px; text-align: center; font-size: 12px; }
      </style>
    </head>
    <body>
  `;

  const debStr = inputDateDebut.value;
  const finStr = inputDateFin.value;
  const titrePeriode = debStr === finStr
    ? debStr
    : `${debStr} au ${finStr}`;

  Object.keys(parAffaire).forEach(affaire => {
    const lignes = parAffaire[affaire];
    htmlPDF += `
      <div class="bon">
        <h1>BON DE PRÉPARATION</h1>
        <p class="date-prep">
          Affaire: <strong>${affaire}</strong><br>
          Période : <strong>${titrePeriode}</strong>
        </p>
        <table>
          <thead>
            <tr>
              <th>Article</th>
              <th>Référence</th>
              <th>Quantité</th>
              <th>Emplacement</th>
              <th>✓</th>
            </tr>
          </thead>
          <tbody>
    `;

    lignes.forEach(r => {
      const articleLabel = `${r.marque || ""} ${r.reference || ""} ${r.libelle || ""}`.trim()
        || r.articleLabel || r.articleId || "";
      htmlPDF += `
        <tr>
          <td>${articleLabel}</td>
          <td>${r.reference || ""}</td>
          <td>${r.quantite}</td>
          <td>A${r.articleAllee || "-"} P${r.articlePlace || "-"} N${r.articleNiveau || "-"}</td>
          <td style="text-align: center;">☐</td>
        </tr>
      `;
    });

    htmlPDF += `
          </tbody>
        </table>
        <div class="signature">
          <p>Préparé par: ________________</p>
          <p>Date: ____________</p>
        </div>
      </div>
    `;
  });

  htmlPDF += `
    </body>
    </html>
  `;

  const element = document.createElement("div");
  element.innerHTML = htmlPDF;

  const opt = {
    margin: 5,
    filename: `bons-preparation-${titrePeriode}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: "portrait", unit: "mm", format: "a4" }
  };

  html2pdf().set(opt).from(element).save();
});

// Valider préparations sélectionnées
btnValiderPrep.addEventListener("click", async () => {
  if (selectedPrepIds.length === 0) {
    alert("Sélectionne au moins une préparation.");
    return;
  }

  const confirmVal = confirm(`Valider ${selectedPrepIds.length} préparation(s) ? Les articles seront sortis du stock.`);
  if (!confirmVal) return;

  try {
    const batch = writeBatch(db);

    for (const prepId of selectedPrepIds) {
      const prep = preparations.find(p => p.id === prepId);
      if (!prep) continue;

      const mouvData = {
        date: Timestamp.now(),
        sens: "sortie",
        articleId: prep.articleId,
        quantite: prep.quantite,
        prixUnitaire: prep.prixUnitaire || 0,
        codeAffaire: prep.codeAffaire || ""
      };
      await addDoc(collection(db, "mouvements"), mouvData);

      batch.update(doc(db, "reservations", prepId), {
        statut: "clos"
      });
    }

    await batch.commit();

    // recharger cette période
    await chargerPreparationsParDates();

    // recharger articles (stock & dispo)
    if (window.rechargerArticlesDepuisPreparations) {
      await window.rechargerArticlesDepuisPreparations();
    }

    alert("Préparation validée et articles sortis du stock.");
  } catch (e) {
    console.error("Erreur validation préparation", e);
    alert("Erreur lors de la validation.");
  }
});

// Clic onglet Préparations : affiche la section + charge J+1 par défaut
tabPrep.addEventListener("click", async () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  tabPrep.classList.add("active");

  document.querySelectorAll("main > section").forEach(s => s.style.display = "none");
  prepSection.style.display = "block";

  if (!inputDateDebut.value || !inputDateFin.value) {
    initDefaultDates();
  }

  await chargerPreparationsParDates();
});

// Exposition globale pour rechargement depuis d’autres modules
window.rechargerPreparationsDepuisArticles = chargerPreparationsParDates;

// Initialisation au chargement + tri
initDefaultDates();
chargerPreparationsParDates().then(() => {
  const tablePrep = document.getElementById("preparationsTable");
  if (tablePrep && window.makeTableSortable) {
    window.makeTableSortable(tablePrep, [
      "string","string","number","date","string"
    ]);
  }
});

tabPrep.addEventListener("click", async () => {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  tabPrep.classList.add("active");

  document.querySelectorAll("main > section").forEach(s => s.style.display = "none");
  prepSection.style.display = "block";

  if (!inputDateDebut.value || !inputDateFin.value) {
    initDefaultDates();
  }

  await chargerPreparationsParDates();

  const tablePrep = document.getElementById("preparationsTable");
  if (tablePrep && window.makeTableSortable) {
    window.makeTableSortable(tablePrep, [
      "string","string","number","date","string"
    ]);
  }
});

window.rechargerPreparationsDepuisArticles = chargerPreparationsParDates;

