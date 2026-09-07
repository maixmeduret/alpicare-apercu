/* ALPICARE — le parcours d'adhésion en ligne (adherer.html).
   Trois écrans affichés tour à tour sans rechargement : votre situation, votre formule,
   votre signature. Le prix vient de tarif.js, le même moteur que le reste du site.
   Les cartes de l'accueil et de la page « Ce qui est couvert » mènent ici en nommant la
   formule dans l'adresse : adherer.html?formule=essentiel, ?formule=confort, ?formule=premium.
   L'état est conservé dans sessionStorage, sauf le numéro de sécurité sociale, l'IBAN et
   la signature, qui ne quittent jamais la mémoire de la page. Aucune donnée de santé n'est
   demandée, et rien n'est jamais écrit dans la console. */
(function () {
  'use strict';

  var T = window.ALPICARE_TARIF;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var form = $('#adhesion');
  if (!form) return;

  var CLE = 'alpicare.adhesion.v1';
  var SANS_MEMOIRE = ['nir', 'iban', 'signature'];   /* jamais conservés d'un chargement à l'autre */
  var RADIOS = ['travail', 'residence', 'regime', 'adultes', 'lieu', 'budget', 'formule'];

  var FORMULES = {
    essentiel: { niveau: 2, nom: 'Essentiel', badge: '' },
    confort:   { niveau: 3, nom: 'Confort',   badge: 'La plus choisie' },
    premium:   { niveau: 4, nom: 'Premium',   badge: '' }
  };
  var ORDRE = ['essentiel', 'confort', 'premium'];
  var TITRES = { 1: 'votre situation', 2: 'votre formule', 3: 'vos informations et votre signature' };

  /* Ce que chaque formule rembourse en Suisse dépend du régime : même texte que l'accueil. */
  var SUISSE = {
    essentiel: { lamal: 'Quote-part remboursée à 100 %', cmu: '125 % de la base de remboursement' },
    confort:   { lamal: 'Quote-part remboursée à 100 % et 50 € de transport', cmu: '150 % de la base de remboursement et 20 € par acte' },
    premium:   { lamal: 'Quote-part remboursée à 100 % et 100 € de transport', cmu: '200 % de la base de remboursement et 30 € par acte' }
  };

  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var NOMBRES = ['aucun', 'un', 'deux', 'trois', 'quatre'];
  var DEPARTEMENTS = {
    '01': 'l’Ain', '25': 'le Doubs', '39': 'le Jura', '68': 'le Haut-Rhin', '70': 'la Haute-Saône',
    '74': 'la Haute-Savoie', '88': 'les Vosges', '90': 'le Territoire de Belfort',
    'autre': 'un autre département français'
  };

  var etat = { ecran: 1, v: {}, envoi: false, rendu: false };

  /* =========================================================================
     1. Petits outils de texte et de date
     ========================================================================= */

  function texte(v) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim(); }

  function euros(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
  }

  function sansAccent(s) {
    var t = texte(s).toLowerCase();
    return t.normalize ? t.normalize('NFD').replace(/[\u0300-\u036F]/g, '') : t;
  }

  function dateIso(d) {
    function deux(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + deux(d.getMonth() + 1) + '-' + deux(d.getDate());
  }

  function dateLue(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    var j = Number(m[3]);
    return (j === 1 ? '1ᵉʳ' : String(j)) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1];
  }

  /* Âge révolu à la date du jour, ou null si la date est illisible ou inexistante. */
  function ageDe(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    var an = Number(m[1]), mo = Number(m[2]) - 1, jo = Number(m[3]);
    var d = new Date(an, mo, jo);
    if (d.getFullYear() !== an || d.getMonth() !== mo || d.getDate() !== jo) return null;
    var r = new Date(), a = r.getFullYear() - an, ecart = r.getMonth() - mo;
    if (ecart < 0 || (ecart === 0 && r.getDate() < jo)) a--;
    return a;
  }

  function premierDuMoisSuivant(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), 1);
    if (d.getDate() !== 1) x = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return x;
  }

  /* =========================================================================
     2. Clés de contrôle : sécurité sociale et IBAN
     ========================================================================= */

  /* Numéro de sécurité sociale : treize chiffres et une clé de deux chiffres,
     la clé valant 97 moins le reste de la division du corps par 97. La Corse
     se lit 2A comme 19 et 2B comme 18. */
  function nirValide(valeur) {
    var s = String(valeur || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    var m = /^([12])(\d{2})(\d{2})(\d{2}|2[AB])(\d{3})(\d{3})(\d{2})$/.exec(s);
    if (!m) return false;
    var mois = Number(m[3]);
    var moisPlausible = (mois >= 1 && mois <= 12) || mois === 20 || (mois >= 30 && mois <= 42) || (mois >= 50 && mois <= 99);
    if (!moisPlausible) return false;
    var dep = m[4] === '2A' ? '19' : (m[4] === '2B' ? '18' : m[4]);
    var corps = Number(m[1] + m[2] + m[3] + dep + m[5] + m[6]);
    return Number(m[7]) === 97 - (corps % 97);
  }

  /* IBAN : on déplace les quatre premiers caractères à la fin, on remplace chaque
     lettre par son rang plus neuf, et le reste de la division par 97 doit valoir 1. */
  var IBAN_LONGUEUR = {
    FR: 27, CH: 21, DE: 22, BE: 16, LU: 20, IT: 27, ES: 24, PT: 25, NL: 18,
    MC: 27, AT: 20, GB: 22, IE: 22, DK: 18, SE: 24, FI: 18, PL: 28, LI: 21
  };
  function ibanValide(valeur) {
    var s = String(valeur || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!/^[A-Z]{2}\d{2}[0-9A-Z]{10,30}$/.test(s)) return false;
    var attendue = IBAN_LONGUEUR[s.slice(0, 2)];
    if (attendue && s.length !== attendue) return false;
    var r = s.slice(4) + s.slice(0, 4), reste = 0, i, c;
    for (i = 0; i < r.length; i++) {
      c = r.charAt(i);
      reste = Number(String(reste) + (c >= '0' && c <= '9' ? c : String(c.charCodeAt(0) - 55))) % 97;
    }
    return reste === 1;
  }

  function ibanLisible(valeur) {
    var s = String(valeur || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    return s.replace(/(.{4})/g, '$1 ').trim();
  }

  function ibanMasque(valeur) {
    var s = String(valeur || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (s.length < 8) return '';
    return s.slice(0, 4) + ' •••• ' + s.slice(-4);
  }

  function emailValide(v) { return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(texte(v)); }

  function telValide(v) {
    var s = String(v || '').replace(/[^\d+]/g, '');
    return /^(?:\+33|0033)[1-9]\d{8}$/.test(s) || /^0[1-9]\d{8}$/.test(s) || /^(?:\+41|0041)[1-9]\d{8}$/.test(s);
  }

  /* =========================================================================
     3. Lecture et écriture du formulaire, et mémoire de la session
     ========================================================================= */

  function lireForm() {
    var v = etat.v, i;
    for (i = 0; i < RADIOS.length; i++) { v[RADIOS[i]] = ''; }
    $$('input, select, textarea', form).forEach(function (el) {
      var n = el.name;
      if (!n) { return; }
      if (el.type === 'radio') { if (el.checked) { v[n] = el.value; } }
      else if (el.type === 'checkbox') { if (n !== 'postes') { v[n] = !!el.checked; } }
      else { v[n] = el.value; }
    });
    v.postes = $$('input[name="postes"]', form).filter(function (e) { return e.checked; })
      .map(function (e) { return e.value; });
  }

  function poserForm() {
    var v = etat.v;
    $$('input, select, textarea', form).forEach(function (el) {
      var n = el.name;
      if (!n || !(n in v)) { return; }
      if (el.type === 'radio') { el.checked = (v[n] === el.value); }
      else if (el.type === 'checkbox') {
        el.checked = (n === 'postes') ? (v.postes || []).indexOf(el.value) >= 0 : !!v[n];
      } else if (typeof v[n] === 'string') { el.value = v[n]; }
    });
  }

  function memoriser() {
    try {
      var v = {}, k;
      for (k in etat.v) {
        if (Object.prototype.hasOwnProperty.call(etat.v, k) && SANS_MEMOIRE.indexOf(k) < 0) { v[k] = etat.v[k]; }
      }
      window.sessionStorage.setItem(CLE, JSON.stringify({ ecran: etat.ecran, v: v }));
    } catch (e) { /* navigation privée, quota plein : le parcours continue sans mémoire */ }
  }

  function rappeler() {
    try {
      var brut = window.sessionStorage.getItem(CLE);
      if (!brut) { return; }
      var d = JSON.parse(brut);
      if (d && d.v && typeof d.v === 'object') { etat.v = d.v; }
      if (d && d.ecran >= 1 && d.ecran <= 3) { etat.ecran = d.ecran; }
    } catch (e) { etat.v = {}; }
  }

  function oublier() {
    try { window.sessionStorage.removeItem(CLE); } catch (e) { /* rien à faire */ }
  }

  /* =========================================================================
     4. Validation champ par champ
     ========================================================================= */

  function ctrl(nom) {
    return document.getElementById(nom) || form.querySelector('[name="' + nom + '"]');
  }

  function conteneur(el) {
    var n = el;
    while (n && n !== form) {
      if (n.className && /(^|\s)(choix|pastilles|trio)(\s|$)/.test(n.className)) { return n; }
      n = n.parentNode;
    }
    return null;
  }

  var REGLES = {
    travail: function (v) { return v.travail ? '' : 'Indiquez si vous êtes salarié en Suisse.'; },
    residence: function (v) { return v.residence ? '' : 'Indiquez si vous résidez en France.'; },
    naissance: function (v) {
      if (!texte(v.naissance)) { return 'Indiquez votre date de naissance.'; }
      var a = ageDe(v.naissance);
      if (a === null) { return 'Cette date n’existe pas. Vérifiez le jour et le mois.'; }
      if (a < 18) { return 'Le contrat se souscrit à partir de 18 ans.'; }
      if (a > 67) { return 'Le contrat se souscrit jusqu’à 67 ans.'; }
      return '';
    },
    regime: function (v) { return v.regime ? '' : 'Choisissez votre régime d’assurance maladie.'; },
    adultes: function (v) { return v.adultes ? '' : 'Indiquez combien d’adultes sont à couvrir.'; },
    departement: function (v) { return v.departement ? '' : 'Choisissez votre département de résidence.'; },

    lieu: function (v) { return v.lieu ? '' : 'Dites-nous où vous vous soignez le plus souvent.'; },
    postes: function (v) { return (v.postes || []).length ? '' : 'Choisissez au moins un poste, sans quoi nous ne pouvons pas vous conseiller.'; },
    budget: function (v) { return v.budget ? '' : 'Dites-nous ce que vous attendez d’abord de votre cotisation.'; },
    formule: function (v) { return v.formule ? '' : 'Choisissez l’une des trois formules.'; },

    civilite: function (v) { return v.civilite ? '' : 'Choisissez votre civilité.'; },
    prenom: function (v) { return texte(v.prenom).length >= 2 ? '' : 'Indiquez votre prénom.'; },
    nom: function (v) { return texte(v.nom).length >= 2 ? '' : 'Indiquez votre nom.'; },
    adresse: function (v) { return texte(v.adresse).length >= 5 ? '' : 'Indiquez votre adresse, numéro et voie compris.'; },
    cp: function (v) { return /^\d{5}$/.test(texte(v.cp)) ? '' : 'Le code postal compte cinq chiffres.'; },
    commune: function (v) { return texte(v.commune).length >= 2 ? '' : 'Indiquez votre commune.'; },
    email: function (v) { return emailValide(v.email) ? '' : 'Cette adresse électronique semble incomplète.'; },
    tel: function (v) { return telValide(v.tel) ? '' : 'Indiquez un numéro français ou suisse, par exemple 06 12 34 56 78.'; },
    nir: function (v) {
      if (v['sans-nir']) { return ''; }
      if (!texte(v.nir)) { return 'Indiquez votre numéro de sécurité sociale, ou cochez la case juste en dessous.'; }
      return nirValide(v.nir) ? '' : 'Ce numéro ne passe pas sa clé de contrôle. Recopiez les quinze chiffres de votre carte Vitale.';
    },
    titulaire: function (v) { return texte(v.titulaire).length >= 2 ? '' : 'Indiquez le nom du titulaire du compte.'; },
    iban: function (v) {
      if (!texte(v.iban)) { return 'Indiquez l’IBAN du compte à prélever.'; }
      return ibanValide(v.iban) ? '' : 'Cet IBAN ne passe pas sa clé de contrôle. Recopiez-le depuis votre relevé d’identité bancaire.';
    },
    sepa: function (v) { return v.sepa ? '' : 'Sans mandat de prélèvement, nous ne pouvons pas encaisser votre cotisation.'; },
    effet: function (v) {
      if (!texte(v.effet)) { return 'Choisissez la date à laquelle le contrat prend effet.'; }
      var bornes = bornesEffet();
      if (v.effet < bornes.min) { return 'La date d’effet ne peut pas être antérieure au ' + dateLue(bornes.min) + '.'; }
      if (v.effet > bornes.max) { return 'La date d’effet ne peut pas dépasser le ' + dateLue(bornes.max) + '.'; }
      return '';
    },
    'docs-recus': function (v) { return v['docs-recus'] ? '' : 'Nous devons vous remettre ces documents avant que vous ne signiez.'; },
    'consent-sante': function (v) { return v['consent-sante'] ? '' : 'Sans cet accord, nous ne pouvons pas gérer vos remboursements.'; },
    'accepte-conditions': function (v) { return v['accepte-conditions'] ? '' : 'Il faut accepter les conditions du contrat pour signer.'; },
    signature: function (v) {
      var attendu = sansAccent(texte(v.prenom) + ' ' + texte(v.nom));
      var donne = sansAccent(v.signature);
      if (!donne) { return 'Écrivez vos prénom et nom pour signer.'; }
      if (attendu.length > 2 && donne !== attendu) { return 'La signature doit reprendre exactement les prénom et nom saisis plus haut.'; }
      return '';
    },
    signe: function (v) { return v.signe ? '' : 'Cochez la case pour signer votre bulletin d’adhésion.'; }
  };

  var CHAMPS_ECRAN = {
    1: ['travail', 'residence', 'naissance', 'regime', 'adultes', 'departement'],
    2: ['lieu', 'postes', 'budget', 'formule'],
    3: ['civilite', 'prenom', 'nom', 'adresse', 'cp', 'commune', 'email', 'tel', 'nir',
        'titulaire', 'iban', 'sepa', 'effet', 'docs-recus', 'consent-sante',
        'accepte-conditions', 'signature', 'signe']
  };

  var LIBELLES = {
    travail: 'votre travail en Suisse', residence: 'votre résidence', naissance: 'votre date de naissance',
    regime: 'votre régime', adultes: 'les adultes à couvrir', departement: 'votre département',
    lieu: 'le lieu de vos soins', postes: 'vos postes prioritaires', budget: 'votre attente de cotisation',
    formule: 'votre formule', civilite: 'votre civilité', prenom: 'votre prénom', nom: 'votre nom',
    adresse: 'votre adresse', cp: 'votre code postal', commune: 'votre commune',
    email: 'votre adresse électronique', tel: 'votre téléphone', nir: 'votre numéro de sécurité sociale',
    titulaire: 'le titulaire du compte', iban: 'votre IBAN', sepa: 'le mandat de prélèvement',
    effet: 'la date d’effet', 'docs-recus': 'la remise des documents',
    'consent-sante': 'l’accord sur vos données de santé', 'accepte-conditions': 'l’acceptation des conditions',
    signature: 'votre signature', signe: 'la case de signature'
  };

  function afficherErreur(nom, message) {
    var span = document.getElementById('e-' + nom);
    if (span) { span.textContent = message; }
    var el = ctrl(nom);
    if (el) {
      if (message) { el.setAttribute('aria-invalid', 'true'); } else { el.removeAttribute('aria-invalid'); }
      var c = conteneur(el);
      if (c) {
        if (message) { c.setAttribute('data-invalide', 'oui'); } else { c.removeAttribute('data-invalide'); }
      }
    }
  }

  function valider(nom) {
    var regle = REGLES[nom];
    if (!regle) { return ''; }
    var message = regle(etat.v);
    afficherErreur(nom, message);
    return message;
  }

  function validerEcran(n) {
    var manques = [];
    CHAMPS_ECRAN[n].forEach(function (nom) {
      var m = valider(nom);
      if (m) { manques.push({ nom: nom, message: m }); }
    });
    return manques;
  }

  /* Le même contrôle, mais sans rien afficher : il sert à savoir jusqu'où l'on peut
     aller sans couvrir de rouge un écran que le lecteur n'a pas encore vu. */
  function manquesEcran(n) {
    var manques = [];
    CHAMPS_ECRAN[n].forEach(function (nom) {
      var regle = REGLES[nom];
      if (regle && regle(etat.v)) { manques.push(nom); }
    });
    return manques;
  }

  function afficherResume(n, manques) {
    var boite = document.getElementById('erreurs-' + n);
    if (!boite) { return; }
    var liste = boite.querySelector('ul');
    liste.innerHTML = '';
    if (!manques.length) { boite.hidden = true; return; }
    manques.forEach(function (m) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + (ctrl(m.nom) && ctrl(m.nom).id ? ctrl(m.nom).id : m.nom);
      a.textContent = m.message;
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var el = ctrl(m.nom);
        if (el && el.focus) { el.focus(); }
      });
      li.appendChild(a);
      liste.appendChild(li);
    });
    boite.hidden = false;
  }

  /* =========================================================================
     5. Le prix, le conseil et le récapitulatif
     ========================================================================= */

  function ageRetenu() {
    var a = ageDe(etat.v.naissance);
    if (a !== null) { return a; }
    return (T && T.TARIF && T.TARIF.ageRef) || 30;
  }

  function prixDe(id) {
    if (!T || !FORMULES[id]) { return null; }
    return T.prix(FORMULES[id].niveau, ageRetenu(), etat.v.regime || 'lamal',
                  Number(etat.v.adultes) || 1, Number(etat.v.enfants) || 0);
  }

  function foyerLu() {
    var ad = Number(etat.v.adultes) || 1, en = Number(etat.v.enfants) || 0;
    var t = ad === 2 ? 'Deux adultes' : 'Un adulte';
    if (en === 1) { t += ' et un enfant'; }
    else if (en > 1) { t += ' et ' + NOMBRES[en] + ' enfants'; }
    return t;
  }

  function rendrePrix() {
    $$('.carte--choix', form).forEach(function (carte) {
      var id = carte.getAttribute('data-formule');
      var p = prixDe(id), choisie = (etat.v.formule === id);
      var mois = $('[data-prix-mois]', carte), an = $('[data-prix-an]', carte);
      if (p) {
        if (mois) { mois.textContent = euros(p.mois); }
        if (an) { an.textContent = euros(p.an); }
      }
      var suisse = $('[data-suisse-' + id + ']', carte);
      if (suisse && SUISSE[id]) { suisse.textContent = SUISSE[id][etat.v.regime === 'cmu' ? 'cmu' : 'lamal']; }
      carte.setAttribute('data-choisie', choisie ? 'oui' : 'non');
      var marque = $('[data-etat-formule]', carte);
      if (marque) { marque.textContent = choisie ? 'Formule choisie' : 'Choisir ' + FORMULES[id].nom; }
    });
    var rappel = $('[data-foyer-lu]');
    if (rappel) {
      rappel.textContent = 'Les prix ci-dessous sont ceux de votre foyer — ' + foyerLu().toLowerCase() +
        ', ' + ageRetenu() + ' ans, régime ' + (etat.v.regime === 'cmu' ? 'français' : 'LAMal') +
        ' — tout compris : ni frais de dossier, ni droit d’entrée, ni cotisation d’association.';
    }
  }

  /* Le conseil motivé, affiché avant le choix : un score simple, puis ses raisons en clair. */
  function calculerConseil() {
    var v = etat.v;
    if (!v.lieu || !v.budget || !(v.postes || []).length) { return null; }
    var postes = v.postes || [], score = 0, raisons = [];

    if (v.budget === 'bas') { score -= 3; raisons.push('Vous cherchez d’abord la cotisation la plus basse.'); }
    else if (v.budget === 'large') { score += 2; raisons.push('Vous cherchez d’abord la couverture la plus large.'); }
    else { raisons.push('Vous cherchez un équilibre entre le prix et les garanties.'); }

    if (v.lieu === 'suisse') { score -= 1; raisons.push('Vous vous soignez surtout en Suisse, où les trois formules remboursent la même chose.'); }
    else if (v.lieu === 'france') { score += 1; raisons.push('Vous vous soignez surtout en France, où les formules se distinguent nettement.'); }
    else { raisons.push('Vous vous soignez des deux côtés de la frontière.'); }

    if (postes.indexOf('dentaire') >= 0) { score += 1; }
    if (postes.indexOf('optique') >= 0) { score += 1; }
    if (postes.indexOf('hospitalisation') >= 0) { score += 1; }
    var forts = [];
    if (postes.indexOf('dentaire') >= 0) { forts.push('le dentaire'); }
    if (postes.indexOf('optique') >= 0) { forts.push('l’optique'); }
    if (postes.indexOf('hospitalisation') >= 0) { forts.push('l’hospitalisation'); }
    if (forts.length) {
      raisons.push('Vous placez ' + liste(forts) + ' parmi vos priorités, et c’est précisément là que les formules diffèrent.');
    } else {
      raisons.push('Vos priorités portent sur des postes que les trois formules couvrent de façon proche.');
    }

    var enfants = Number(v.enfants) || 0;
    if (enfants >= 1) {
      score += 1;
      raisons.push('Votre foyer compte ' + (enfants === 1 ? 'un enfant' : NOMBRES[enfants] + ' enfants') +
        ', et les postes optique et dentaire des enfants pèsent vite.');
    }

    var id = score <= 0 ? 'essentiel' : (score >= 4 ? 'premium' : 'confort');
    return { id: id, nom: FORMULES[id].nom, raisons: raisons };
  }

  function liste(mots) {
    if (mots.length === 1) { return mots[0]; }
    return mots.slice(0, -1).join(', ') + ' et ' + mots[mots.length - 1];
  }

  function rendreConseil() {
    var c = calculerConseil();
    var p = $('[data-conseil-texte]'), ul = $('[data-conseil-raisons]'), note = $('[data-conseil-note]');
    ORDRE.forEach(function (id) {
      var carte = $('.carte--choix[data-formule="' + id + '"]', form);
      if (!carte) { return; }
      var badge = $('[data-badge]', carte);
      if (!badge) { return; }
      var conseille = c && c.id === id;
      badge.textContent = conseille ? 'Notre conseil' : FORMULES[id].badge;
      badge.hidden = !conseille && !FORMULES[id].badge;
      badge.setAttribute('data-conseille', conseille ? 'oui' : 'non');
    });
    if (!c) {
      if (p) { p.textContent = 'Répondez aux trois questions ci-dessus et notre conseil s’affiche ici, avec ses raisons.'; }
      if (ul) { ul.hidden = true; ul.innerHTML = ''; }
      if (note) { note.hidden = true; }
      return;
    }
    var prix = prixDe(c.id);
    if (p) {
      p.textContent = 'Compte tenu de ce que vous venez d’indiquer, nous vous conseillons la formule ' + c.nom +
        (prix ? ', à ' + euros(prix.mois) + ' par mois pour votre foyer' : '') + '.';
    }
    if (ul) {
      ul.innerHTML = '';
      c.raisons.forEach(function (r) {
        var li = document.createElement('li');
        li.textContent = r;
        ul.appendChild(li);
      });
      ul.hidden = false;
    }
    if (note) { note.hidden = false; }
  }

  function situationLue() {
    var a = ageDe(etat.v.naissance);
    var dep = DEPARTEMENTS[etat.v.departement] || '';
    return 'Salarié frontalier résidant en France' + (a === null ? '' : ', ' + a + ' ans') +
      ', régime ' + (etat.v.regime === 'cmu' ? 'de la Sécurité sociale française' : 'LAMal suisse') +
      (dep ? ', dans ' + dep : '') + '.';
  }

  function rendreRecap() {
    var v = etat.v, p = v.formule ? prixDe(v.formule) : null;
    function pose(sel, valeur) { var el = $(sel); if (el) { el.textContent = valeur || '—'; } }
    pose('[data-recap-situation]', situationLue());
    pose('[data-recap-foyer]', foyerLu());
    pose('[data-recap-formule]', v.formule ? FORMULES[v.formule].nom : '');
    pose('[data-recap-prix]', p ? euros(p.mois) + ' par mois' : '');
    pose('[data-recap-prix-an]', p ? euros(p.an) + ' par an' : '');
    pose('[data-recap-effet]', dateLue(v.effet));
    var nais = $('[data-naissance-lu]');
    if (nais) { nais.textContent = dateLue(v.naissance) || 'non renseignée'; }
    var jour = $('[data-date-jour]');
    if (jour) { jour.textContent = 'le ' + dateLue(dateIso(new Date())); }
  }

  function rendreAge() {
    var el = $('[data-age-lu]'), a = ageDe(etat.v.naissance);
    if (el) { el.textContent = a === null ? '' : a + ' ans'; }
  }

  /* =========================================================================
     6. Éligibilité : la porte se ferme avec une explication, jamais avec un refus sec
     ========================================================================= */

  var ARRETS = {
    travail: {
      titre: 'Ce contrat est réservé aux salariés frontaliers.',
      texte: 'Nos garanties sont construites autour de la LAMal et du droit d’option, qui ne concernent que les personnes salariées d’un employeur suisse. Nous ne pouvons donc pas vous proposer ce contrat aujourd’hui.',
      suites: [
        ['Si vous êtes indépendant en Suisse', 'Votre situation relève de règles différentes. Écrivez-nous : nous vous dirons franchement si nous savons vous couvrir un jour.'],
        ['Si vous devenez salarié en Suisse', 'Revenez ici le jour de votre embauche : l’adhésion prend quelques minutes et le contrat démarre au premier du mois suivant.']
      ]
    },
    residence: {
      titre: 'Ce contrat suppose que vous résidiez en France.',
      texte: 'La complémentaire vient compléter des soins reçus en France comme en Suisse, mais elle s’adresse aux personnes dont le foyer se trouve en France. Si vous habitez en Suisse, vous relevez des assurances complémentaires suisses.',
      suites: [
        ['Si vous prévoyez de vous installer en France', 'Revenez au moment du déménagement : votre adresse française suffit à ouvrir le contrat.'],
        ['Pour comprendre les deux systèmes', 'Notre guide compare la LAMal et la Sécurité sociale française, et explique ce que chacune laisse à votre charge.']
      ]
    },
    jeune: {
      titre: 'Ce contrat se souscrit à partir de 18 ans.',
      texte: 'Avant 18 ans, on n’adhère pas soi-même : on est rattaché au contrat d’un parent. C’est gratuit à partir du troisième enfant, et cela ouvre exactement les mêmes garanties.',
      suites: [
        ['Si l’un de vos parents est frontalier', 'Demandez-lui d’adhérer et de vous rattacher à son foyer, dès le premier écran.'],
        ['À votre majorité', 'Vous pourrez ouvrir votre propre contrat, dès lors que vous travaillerez en Suisse comme salarié.']
      ]
    },
    age: {
      titre: 'Ce contrat se souscrit jusqu’à 67 ans.',
      texte: 'Au-delà, la logique de la couverture change : la retraite met fin au statut de frontalier salarié, et les garanties que nous proposons ne sont plus adaptées. Nous préférons vous le dire tout de suite plutôt que de vous faire remplir un dossier pour rien.',
      suites: [
        ['Si vous êtes encore salarié en Suisse', 'Écrivez-nous : nous regarderons votre situation au cas par cas.'],
        ['Si vous approchez de la retraite', 'Le guide explique ce qui change pour votre couverture le jour où vous cessez de travailler en Suisse.']
      ]
    }
  };

  function causeArret() {
    var v = etat.v;
    if (v.travail === 'non') { return 'travail'; }
    if (v.residence === 'non') { return 'residence'; }
    /* Un champ de date livre des valeurs complètes mais absurdes pendant qu'on tape
       l'année (0002, 0020, 0200 avant 2007) : on n'arrête personne sur une année
       manifestement inachevée. */
    var an = /^(\d{4})-/.exec(texte(v.naissance));
    if (!an || Number(an[1]) < 1900) { return null; }
    var a = ageDe(v.naissance);
    if (a !== null && a < 18) { return 'jeune'; }
    if (a !== null && a > 67) { return 'age'; }
    return null;
  }

  function montrerArret(cause) {
    var a = ARRETS[cause];
    if (!a) { return; }
    var bloc = $('#arret');
    $('[data-arret-titre]').textContent = a.titre;
    $('[data-arret-texte]').textContent = a.texte;
    var ul = $('[data-arret-suites]');
    ul.innerHTML = '';
    a.suites.forEach(function (s) {
      var li = document.createElement('li'), env = document.createElement('span');
      var b = document.createElement('b'), p = document.createElement('small');
      b.textContent = s[0]; p.textContent = s[1];
      env.appendChild(b); env.appendChild(p); li.appendChild(env); ul.appendChild(li);
    });
    form.hidden = true;
    $('.parcours').hidden = true;
    bloc.hidden = false;
    $('#t-arret').focus();
  }

  function cacherArret() {
    $('#arret').hidden = true;
    form.hidden = false;
    $('.parcours').hidden = false;
  }

  /* =========================================================================
     7. Navigation entre les trois écrans
     ========================================================================= */

  function montrer(n) {
    etat.ecran = n;
    $$('.ecran', form).forEach(function (s) {
      s.hidden = (Number(s.getAttribute('data-ecran')) !== n);
    });
    $$('.parcours li').forEach(function (li) {
      var e = Number(li.getAttribute('data-etape'));
      if (e === n) { li.setAttribute('aria-current', 'step'); } else { li.removeAttribute('aria-current'); }
      if (e < n) { li.setAttribute('data-etat', 'fait'); } else { li.removeAttribute('data-etat'); }
    });
    var compte = $('[data-compte-ecrans]');
    if (compte) { compte.textContent = 'Écran ' + n + ' sur 3.'; }
    if (etat.rendu) { annoncer('Écran ' + n + ' sur 3 : ' + (TITRES[n] || '')); }
    etat.rendu = true;
    if (n === 2) { rendrePrix(); rendreConseil(); }
    if (n === 3) { rendreRecap(); }
    var titre = document.getElementById('t-ecran-' + n);
    if (titre) { titre.focus(); }
    var haut = $('.parcours');
    if (haut && haut.getBoundingClientRect().top < 0) {
      window.scrollTo(0, haut.getBoundingClientRect().top + (window.pageYOffset || 0) - 96);
    }
    memoriser();
  }

  function allerA(n) {
    if (n < 1) { n = 1; }
    if (n > 3) { n = 3; }
    if (n > etat.ecran) {
      /* Une situation qui ferme le contrat doit rester fermée, même après un
         passage par « Modifier mes réponses » où rien n'a changé. */
      var cause = causeArret();
      if (cause) { memoriser(); montrerArret(cause); return; }
      var i, manques;
      for (i = etat.ecran; i < n; i++) {
        manques = validerEcran(i);
        afficherResume(i, manques);
        if (manques.length) {
          montrer(i);
          var el = ctrl(manques[0].nom);
          if (el && el.focus) { el.focus(); }
          annoncer('Il reste ' + manques.length + ' point' + (manques.length > 1 ? 's' : '') + ' à compléter : ' +
            manques.map(function (m) { return LIBELLES[m.nom] || m.nom; }).join(', ') + '.');
          return;
        }
      }
    }
    afficherResume(etat.ecran, []);
    if (location.hash !== '#ecran-' + n) { location.hash = 'ecran-' + n; }
    else { montrer(n); }
  }

  function annoncer(message) {
    var el = $('#annonce');
    if (el) { el.textContent = message || ''; }
  }

  /* Le bouton « précédent » du navigateur et une adresse tapée à la main passent tous
     deux par le hash. Ni l'un ni l'autre ne doit sauter par-dessus un écran incomplet. */
  window.addEventListener('hashchange', function () {
    var m = /^#ecran-([123])$/.exec(location.hash);
    if (!m) { return; }
    var cause = causeArret();
    if (cause) { montrerArret(cause); return; }
    var vise = Number(m[1]), permis = 1;
    while (permis < vise && !manquesEcran(permis).length) { permis++; }
    montrer(permis);
    if (permis !== vise && window.history && history.replaceState) {
      history.replaceState(null, '', '#ecran-' + permis);
    }
  });

  /* =========================================================================
     8. Envoi du dossier
     ========================================================================= */

  function envoyer() {
    if (etat.envoi) { return; }
    var manques = [], n;
    for (n = 1; n <= 3; n++) {
      var m = validerEcran(n);
      afficherResume(n, m);
      manques = manques.concat(m.map(function (x) { x.ecran = n; return x; }));
    }
    if (manques.length) {
      var premier = manques[0];
      /* On change l'adresse sans déclencher hashchange : sinon l'écran se réaffiche
         après coup et reprend le focus au champ fautif. */
      if (window.history && history.replaceState && location.hash !== '#ecran-' + premier.ecran) {
        history.replaceState(null, '', '#ecran-' + premier.ecran);
      }
      montrer(premier.ecran);
      var el = ctrl(premier.nom);
      if (el && el.focus) { el.focus(); }
      messageEnvoi('Votre dossier n’est pas encore complet : ' + (LIBELLES[premier.nom] || premier.nom) + ' reste à revoir.');
      return;
    }

    var v = etat.v, p = prixDe(v.formule), maintenant = new Date();
    var charge = {
      /* Champs que le serveur connaît déjà */
      prenom: texte(v.prenom),
      email: texte(v.email),
      tel: texte(v.tel),
      naissance: texte(v.naissance),
      age: ageDe(v.naissance),
      regime: v.regime,
      formule: v.formule,
      foyer: foyerLu(),
      prix: p ? euros(p.mois) : '',
      page: 'adherer.html',
      consent: !!(v['accepte-conditions'] && v['consent-sante'] && v.signe),
      /* Le dossier complet, que le serveur ignore tant qu'il n'est pas étendu */
      dossier: {
        source: 'adherer',
        situation: {
          travailSuisse: v.travail === 'oui',
          residenceFrance: v.residence === 'oui',
          regime: v.regime,
          departement: v.departement,
          adultes: Number(v.adultes) || 1,
          enfants: Number(v.enfants) || 0
        },
        besoins: { lieuSoins: v.lieu, postes: v.postes || [], attenteCotisation: v.budget },
        conseil: (function () { var c = calculerConseil(); return c ? { formule: c.id, raisons: c.raisons, suivi: c.id === v.formule } : null; })(),
        identite: {
          civilite: v.civilite, prenom: texte(v.prenom), nom: texte(v.nom), naissance: v.naissance
        },
        adresse: {
          voie: texte(v.adresse), complement: texte(v.complement),
          codePostal: texte(v.cp), commune: texte(v.commune)
        },
        secu: v['sans-nir'] ? { fourni: false } : { fourni: true, numero: texte(v.nir).replace(/[^0-9A-Za-z]/g, '') },
        banque: { titulaire: texte(v.titulaire), iban: texte(v.iban).toUpperCase().replace(/[^0-9A-Z]/g, ''), mandatSepa: !!v.sepa },
        contrat: { formule: v.formule, dateEffet: v.effet, cotisationMensuelle: p ? p.mois : null, cotisationAnnuelle: p ? p.an : null },
        accords: {
          documentsRemis: !!v['docs-recus'],
          /* La reconnaissance de remise est horodatée au moment où la case est cochée,
             pas au moment de l'envoi : c'est elle qui prouve l'antériorité sur la signature. */
          documentsRemisLe: v['docs-recus'] ? (etat.horodatageDocs || maintenant.toISOString()) : null,
          consentementDonneesSante: !!v['consent-sante'],
          consentementDonneesSanteLe: v['consent-sante'] ? (etat.horodatageSante || maintenant.toISOString()) : null,
          conditionsAcceptees: !!v['accepte-conditions'],
          delaiRenonciationJours: 14
        },
        signature: { nom: texte(v.signature), horodatage: maintenant.toISOString() }
      }
    };

    etat.envoi = true;
    var bouton = $('[data-envoyer]');
    if (bouton) { bouton.disabled = true; }
    messageEnvoi('Envoi de votre adhésion…');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/adhesion', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 20000;
    xhr.onload = function () {
      etat.envoi = false;
      if (bouton) { bouton.disabled = false; }
      var rep = null;
      try { rep = JSON.parse(xhr.responseText); } catch (e) { rep = null; }
      if (xhr.status === 200 && (!rep || rep.ok !== false)) { reussite(v, p); return; }
      messageEnvoi((rep && rep.message) || 'L’envoi n’a pas abouti. Réessayez dans un instant : rien n’est perdu.');
    };
    xhr.onerror = function () {
      etat.envoi = false;
      if (bouton) { bouton.disabled = false; }
      messageEnvoi('Nous n’arrivons pas à joindre le serveur. Vérifiez votre connexion, puis réessayez : vos réponses sont conservées.');
    };
    xhr.ontimeout = xhr.onerror;
    xhr.send(JSON.stringify(charge));
  }

  function messageEnvoi(m) {
    var el = $('#annonce-envoi');
    if (el) { el.textContent = m || ''; }
  }

  function reussite(v, p) {
    var texteFin = $('[data-fin-texte]');
    if (texteFin) {
      texteFin.textContent = 'Merci ' + texte(v.prenom) + '. Votre adhésion à la formule ' +
        FORMULES[v.formule].nom + (p ? ', à ' + euros(p.mois) + ' par mois pour votre foyer' : '') +
        ', est enregistrée et prend effet le ' + dateLue(v.effet) + '. Votre cotisation sera prélevée '
        + 'chaque mois sur le compte ' + (ibanMasque(v.iban) || 'que vous venez d’indiquer') + '.';
    }
    form.hidden = true;
    $('.parcours').hidden = true;
    $('#fin').hidden = false;
    annoncer('Votre adhésion a bien été enregistrée.');
    messageEnvoi('');
    oublier();
    etat.v = {};
    $('#t-fin').focus();
  }

  /* =========================================================================
     9. Écoutes
     ========================================================================= */

  /* La date d'effet est ramenée au premier jour d'un mois, sans reproche et sans surprise. */
  function bornesEffet() {
    var t = new Date();
    var min = premierDuMoisSuivant(t);
    var max = new Date(min.getFullYear() + 1, min.getMonth(), 1);
    return { min: dateIso(min), max: dateIso(max) };
  }

  function normaliserEffet() {
    var el = $('#effet');
    if (!el || !el.value) { return; }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(el.value);
    if (!m) { return; }
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getDate() === 1) { return; }
    var cible = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    el.value = dateIso(cible);
    etat.v.effet = el.value;
    var dit = 'Le contrat prend effet un premier du mois : nous avons retenu le ' + dateLue(el.value) + '.';
    var note = $('[data-effet-note]');
    if (note) { note.textContent = dit; }
    annoncer(dit);
  }

  form.addEventListener('change', function (ev) {
    lireForm();
    var nom = ev.target && ev.target.name;
    if (nom === 'effet') { normaliserEffet(); lireForm(); }
    if (nom === 'naissance') { rendreAge(); }
    if (nom === 'sans-nir') {
      /* On n'a plus rien à faire d'un numéro que le lecteur nous dit ne pas avoir. */
      if (ev.target.checked) {
        var champNir = $('#nir');
        if (champNir) { champNir.value = ''; }
        lireForm();
      }
      afficherErreur('nir', '');
    }
    if (nom === 'docs-recus') { etat.horodatageDocs = ev.target.checked ? new Date().toISOString() : null; }
    if (nom === 'consent-sante') { etat.horodatageSante = ev.target.checked ? new Date().toISOString() : null; }
    /* La date de naissance n'arrête le parcours qu'à la sortie du champ : voir plus bas. */
    if (['travail', 'residence'].indexOf(nom) >= 0) {
      var cause = causeArret();
      if (cause) { memoriser(); montrerArret(cause); return; }
    }
    if (['regime', 'adultes', 'enfants', 'naissance', 'formule'].indexOf(nom) >= 0) { rendrePrix(); }
    if (['lieu', 'budget', 'postes', 'enfants'].indexOf(nom) >= 0) { rendreConseil(); }
    if (nom && REGLES[nom]) { valider(nom); }
    if (etat.ecran === 3) { rendreRecap(); }
    memoriser();
  });

  /* La validation d'un champ de saisie se fait au moment où on le quitte. */
  form.addEventListener('focusout', function (ev) {
    var el = ev.target;
    if (!el || !el.name || el.type === 'radio' || el.type === 'checkbox') { return; }
    lireForm();
    if (el.name === 'effet') { normaliserEffet(); lireForm(); }
    if (el.name === 'iban' && texte(etat.v.iban) && ibanValide(etat.v.iban)) {
      el.value = ibanLisible(etat.v.iban);
      lireForm();
    }
    if (el.name === 'naissance') {
      rendreAge();
      var cause = causeArret();
      if (cause) { memoriser(); montrerArret(cause); return; }
    }
    if (REGLES[el.name]) { valider(el.name); }
    if (etat.ecran === 3) { rendreRecap(); }
    memoriser();
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    envoyer();
  });

  $$('[data-suivant]').forEach(function (b) {
    b.addEventListener('click', function () { allerA(Number(b.getAttribute('data-suivant'))); });
  });
  $$('[data-precedent]').forEach(function (b) {
    b.addEventListener('click', function () { allerA(Number(b.getAttribute('data-precedent'))); });
  });
  var reprendre = $('[data-reprendre]');
  if (reprendre) {
    reprendre.addEventListener('click', function () {
      cacherArret();
      montrer(1);
      annoncer('Vous pouvez modifier vos réponses.');
    });
  }

  /* =========================================================================
     10. Démarrage
     ========================================================================= */

  /* Les boutons « Choisir Essentiel », « Choisir Confort » et « Choisir Premium » de
     l'accueil et de la page « Ce qui est couvert » mènent ici en nommant la formule
     dans l'adresse, sous la forme adherer.html?formule=confort. On la retient, mais
     on ne saute aucun écran : la personne la confirme au deuxième écran, après le
     conseil, et elle reste libre d'en choisir une autre. Une adresse fantaisiste est
     ignorée sans bruit. */
  function formuleDeLAdresse() {
    var m = /[?&]formule=([^&#]*)/.exec(location.search || '');
    if (!m) { return ''; }
    var lu = sansAccent(decodeURIComponent(m[1].replace(/\+/g, ' ')));
    return ORDRE.indexOf(lu) >= 0 ? lu : '';
  }

  rappeler();
  var venuDe = formuleDeLAdresse();
  if (venuDe) { etat.v.formule = venuDe; }
  poserForm();
  lireForm();

  var bornes = bornesEffet();
  var effet = $('#effet');
  if (effet) {
    effet.min = bornes.min;
    effet.max = bornes.max;
    if (!effet.value) { effet.value = bornes.min; }
  }
  var naissance = $('#naissance');
  if (naissance) { naissance.max = dateIso(new Date()); }
  lireForm();

  rendreAge();
  rendrePrix();
  rendreConseil();
  rendreRecap();

  var demande = /^#ecran-([123])$/.exec(location.hash);
  var depart = demande ? Number(demande[1]) : etat.ecran;
  /* On ne saute pas par-dessus un écran incomplet, même si l'adresse le demande. */
  var borne = 1;
  while (borne < depart && !manquesEcran(borne).length) { borne++; }
  CHAMPS_ECRAN[1].concat(CHAMPS_ECRAN[2]).concat(CHAMPS_ECRAN[3]).forEach(function (nom) {
    afficherErreur(nom, '');
  });
  [1, 2, 3].forEach(function (n) { afficherResume(n, []); });

  etat.ecran = 1;
  montrer(borne);
  /* L'adresse doit dire la vérité sur l'écran affiché, même quand elle demandait plus loin. */
  if (location.hash !== '#ecran-' + borne && window.history && history.replaceState) {
    history.replaceState(null, '', '#ecran-' + borne);
  }
  if (venuDe) {
    annoncer('La formule ' + FORMULES[venuDe].nom + ' est déjà retenue. Vous la confirmerez au deuxième écran, ' +
      'après notre conseil, et vous pouvez encore en changer.');
  }
  if (causeArret()) { montrerArret(causeArret()); }
})();
