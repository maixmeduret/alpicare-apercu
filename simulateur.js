/* ALPICARE — page « Formules et tarifs » (tarifs.html)
   1. Simulateur « Quel niveau me convient ? » : prix par formule pour le foyer et niveau conseillé
   2. Formulaire « Adhérer en ligne » : envoi du dossier au serveur (POST /api/adhesion) ; parcours entièrement numérique, aucun conseiller
   3. Ouverture d'un accordéon FAQ visé par l'ancre de l'URL
   Vanilla, sans dépendance. Le simulateur calcule tout dans le navigateur ; seul le formulaire d'adhésion envoie des données.
   Chaque module vérifie la présence de ses éléments avant d'agir.

   RÈGLES DE PRIX (strategy/FINAL.md § 3.2, 3.3 et 10) :
   - tarif adulte = devis public Cmonassurance du 05/09/2026 (adulte seul de 30 ans, régime CMU, hors
     cotisation d'association et droit d'entrée), âge calé sur le devis du 06/09/2026 (32 ans + 1 enfant, CMU) ;
   - tarif cible ALPICARE = prix public × r, avec r = (1 − c_pub) / (1 − c_fly), c_pub = 17 % [estimation,
     fourchette 15-20 %], c_fly = 5 % → r ≈ 0,8737, soit −12,6 % ; pour l'adulte seul, on reprend
     les valeurs arrondies de la grille finale (28,0 / 37,7 / 47,0 / 57,9 / 69,5 €) ;
   - conjoint : −10 % sur sa cotisation (réduction « couple » Alptis, lecture ALPICARE) ;
   - enfant : 60 % du tarif adulte (vérifié sur le devis du 06/09/2026, écart < 1 %) ;
     −50 % dès le 3e enfant de moins de 20 ans (réduction Alptis) ;
   - cotisation d'association 2 €/mois par dossier et droit d'entrée 11 € affichés à part ;
   - paiement annuel = 12 × le mensuel (aucun frais de fractionnement sur le devis relevé) ;
   - Alsace-Moselle (57, 67, 68) : niveau 1 fermé ; réduction dès le niveau 2, montant non publié ;
   - niveau 6 : non coté sur le devis relevé → « sur devis ». */
(function () {
  'use strict';
  var doc = document;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }

  /* ---------- Grille et hypothèses ---------- */
  var GRILLE = {
    1: { nom: 'Niveau 1', formule: '', pub: 32.03, fly: 28.00 },
    2: { nom: 'Niveau 2', formule: 'Essentiel', pub: 43.11, fly: 37.70 },
    3: { nom: 'Niveau 3', formule: 'Confort', pub: 53.80, fly: 47.00 },
    4: { nom: 'Niveau 4', formule: 'Premium', pub: 66.31, fly: 57.90 },
    5: { nom: 'Niveau 5', formule: '', pub: 79.53, fly: 69.50 },
    6: { nom: 'Niveau 6', formule: '', pub: null, fly: null }
  };
  var C_PUB = 0.17, C_FLY = 0.05;
  var R = (1 - C_PUB) / (1 - C_FLY);          /* ≈ 0,8737 → −12,6 % */
  var CONJOINT = 0.90;                          /* −10 % sur la cotisation du conjoint */
  var ENFANT = 0.60;                            /* [estimation dérivée de la grille Radiance 2026 : enfant 36,06 € / adulte ≈ 59,6 € au N3 ≈ 0,60 ; 0,60 au N1, 0,61 au N5] */
  var ENFANT3 = 0.50;                           /* −50 % dès le 3e enfant < 20 ans */
  var ASSO = 2, ENTREE = 11;
  var ALSACE = { '57': 1, '67': 1, '68': 1 };
  /* Repères publiés : grille Radiance 2026, régime Sécu, 2 adultes de 40 ans (hors association, lecture FINAL.md) */
  var REPERES = { '2-0-1': 69.42, '2-0-3': 115.34, '2-0-5': 169.60, '2-1-1': 90.57, '2-1-3': 151.40, '2-1-5': 223.27 };

  /* Ce que chaque niveau ajoute au précédent (descriptif des prestations, notice SF_Suisses 04/2025) */
  var AJOUTE = {
    2: 'honoraires 150 % au lieu de 125 %, chambre particulière 30 € par jour, verres simples 125 €, prothèses 150 % avec bonus fidélité, implantologie 300 € par an, médecines complémentaires 30 € par séance',
    3: 'honoraires 200 % au lieu de 150 %, chambre 50 € par jour, verres simples 225 € et complexes 325 €, prothèses 175 %, plafond dentaire 1 100 € (1 650 € dès la troisième année), implantologie 400 € par an, médecines complémentaires 40 € par séance',
    4: 'honoraires 250 % au lieu de 200 %, chambre 70 € par jour, verres 325 ou 450 €, prothèses 225 %, plafond de 1 200 €, orthodontie non remboursée 100 € par an, implantologie 500 € par an, médecines complémentaires 50 € par séance',
    5: 'honoraires 300 % au lieu de 250 %, chambre 100 € par jour, verres 420 ou 550 €, prothèses 275 % avec un bonus fidélité de 100 % en plus, plafond de 1 300 €, implantologie 600 € par an, aides auditives 250 %',
    6: 'honoraires d’hospitalisation 400 %, chambre 120 € par jour, verres 420 ou 600 €, prothèses 325 %, plafond de 1 600 € puis de 2 500 €, implantologie 700 € par an, médecines complémentaires 60 € par séance'
  };
  var AJOUTE_CH = {
    lamal: { 3: 'forfait transport LAMal de 50 € par an', 4: 'forfait transport de 100 € par an', 5: 'forfait transport de 150 € par an', 6: 'forfait transport de 200 € par an' },
    cmu: { 2: 'soins en Suisse remboursés 125 % BRSS', 3: '150 % BRSS et 20 € par acte en marge du travail', 4: '200 % BRSS et 30 € par acte', 5: '250 % BRSS et 40 € par acte', 6: '300 % BRSS et 50 € par acte' }
  };

  /* ---------- Outils ---------- */
  function arrondi(n, d) { var m = Math.pow(10, d); return Math.round(n * m) / m; }
  function eur(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    dec = (dec === undefined) ? 2 : dec;
    var s = n.toFixed(dec).split('.');
    var ent = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return ent + (dec ? ',' + s[1] : '') + ' €';
  }
  function coef(a, e) {
    var c = 1;
    if (a === 2) c += CONJOINT;
    for (var i = 1; i <= e; i++) c += ENFANT * (i >= 3 ? ENFANT3 : 1);
    return c;
  }
  var CTX = { age: 30, regime: 'lamal' };
  var T = window.ALPICARE_TARIF;   /* moteur de prix ronds partagé (app.js) */
  function prix(niv, a, e) {
    /* Le prix public du foyer applique les réductions contractuelles (conjoint 90 %, enfant 60 %,
       3e enfant 30 %), puis il est arrondi UNE SEULE FOIS sur l'échelle ALPICARE : le total affiché
       se termine donc par 9, à défaut 5, à défaut 0, sans jamais dépasser le prix public. */
    var g = GRILLE[niv];
    if (!g || !g.pub) return null;
    var f = T ? T.facteurAge(CTX.age) * (T.TARIF.regime[CTX.regime] || 1) : 1;
    var pubAdulte = arrondi(g.pub * f, 2);
    var pub = arrondi(pubAdulte * coef(a, e), 2);
    var r = T ? T.prixRond(pub) : { rond: Math.round(pub * R), com: Math.round(C_FLY * 100) };
    var adulte = T ? T.prixRond(pubAdulte).rond : Math.round(pubAdulte * R);
    return { pub: pub, fly: r.rond, adulte: adulte, com: r.com, ecoAn: Math.round((pub - r.rond) * 12) };
  }
  function prix_niveau(niv) {
    var f = { adultes: 1, enfants: 0 };
    try { var m = JSON.parse(localStorage.getItem('alpicare-foyer') || 'null'); if (m) f = m; } catch (e) { /* ignore */ }
    var p = prix(niv, f.adultes, f.enfants);
    return p ? p.fly : null;
  }
  function valeur(form, nom) {
    var el = form.querySelector('input[name="' + nom + '"]:checked')
          || form.querySelector('select[name="' + nom + '"]')
          || form.querySelector('input[type="hidden"][name="' + nom + '"]');
    return el ? el.value : '';
  }
  function libFoyer(a, e) {
    var s = a === 2 ? '2 adultes' : '1 adulte';
    if (e === 1) s += ' et 1 enfant';
    else if (e > 1) s += ' et ' + e + ' enfants';
    return s;
  }
  function tick() {
    return '<svg class="tick" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  }

  /* ---------- Table de décision (FINAL.md § 4.2) ---------- */
  function conseil(v) {
    var lamal = v.regime === 'lamal', raisons = [], nsp = 0, plus1 = false, base;
    if (v.lieu === 'nsp') nsp++;
    if (lamal && v.lieu === 'ch' && !v.alsace) {
      base = 1; raisons.push('Vous êtes affilié à la LAMal et vous vous soignez surtout en Suisse : or la garantie qui joue en Suisse, quote-part et contribution journalière à 100 %, est la même du niveau 1 au niveau 6.');
    } else if (!lamal && v.lieu === 'ch') {
      base = 1; raisons.push('En CMU, hors urgence, une consultation en Suisse vous est remboursée sur la base française, soit environ 20 € sur 250 CHF, et cela à tous les niveaux ; le forfait par acte « en marge du travail » ne commence qu’au niveau 3, à 20 € par acte. Si vous consultez souvent en Suisse en marge du travail, la formule Confort est mieux adaptée.');
      if (v.alsace) raisons.push('Comme vous êtes rattaché à une CPAM d’Alsace-Moselle, le niveau 1 ne vous est pas ouvert ; nous devons le confirmer avec Alptis pour un affilié CMU.');
    } else {
      base = 2;
      if (v.alsace) raisons.push(lamal ? 'Vous résidez en Alsace-Moselle et vous êtes affilié à la LAMal : le régime local couvre déjà 90 à 100 % de vos soins en France, et le niveau 1 n’est pas ouvert aux assurés rattachés à une CPAM d’Alsace-Moselle.' : 'Comme vous êtes rattaché à une CPAM d’Alsace-Moselle, le niveau 1 ne vous est pas ouvert. Le critère tient à la CPAM ; nous devons le confirmer avec Alptis pour un affilié CMU, qui relève du régime général.');
      else raisons.push('Comme vous vous soignez en France, ou des deux côtés de la frontière, nous partons du niveau 2.');
    }
    if (v.optique === 'simple') { plus1 = true; raisons.push('Si vous portez des lunettes simples ou des lentilles, nous montons d’un niveau : le forfait passe de 125 € au niveau 2 à 225 € au niveau 3 pour les verres simples, et de 100 à 125 € par an pour les lentilles.'); }
    if (v.optique === 'nsp') nsp++;
    if (v.bienetre === 'osteo') { plus1 = true; raisons.push('Vous consultez un ostéopathe ou un psychologue : nous montons d’un niveau, et le forfait passe de 30 à 40 € par séance, quatre séances par an, en France comme en Suisse.'); }
    if (v.bienetre === 'nsp') nsp++;
    if (v.dentaire === 'nsp') nsp++;
    if (v.hospi === 'nsp') nsp++;

    var niv = base + (plus1 ? 1 : 0), plancher = 0;
    if (v.optique === 'complexe') { plancher = Math.max(plancher, 3); raisons.push('Si vous portez des verres complexes ou progressifs, il vous faut au moins le niveau 3, qui rembourse 325 € contre 200 € au niveau 2.'); }
    if (v.dentaire === 'prothese') { plancher = Math.max(plancher, 3); raisons.push('Vous prévoyez une prothèse ou un implant d’ici trois ans : nous conseillons de garder le niveau 3 pendant au moins deux ans, pour le bonus fidélité de 50 % BRSS et le plafond de 1 650 € dès la troisième année, plutôt que de passer au niveau 4 tout de suite.'); }
    if (v.dentaire === 'plusieurs') { plancher = Math.max(plancher, 4); raisons.push('Vous attendez plusieurs prothèses dans l’année : le niveau 4 s’impose, avec 225 % BRSS et un plafond de 1 200 €.'); }
    if (v.dentaire === 'implants') { plancher = Math.max(plancher, 5); raisons.push('Vous attendez plusieurs implants dans l’année : le niveau 5 s’impose, avec 600 € par an d’implantologie et un bonus fidélité de 100 % en plus.'); }
    if (v.hospi === 'chambre') { plancher = Math.max(plancher, 3); raisons.push('La chambre particulière compte pour vous : le niveau 3 la couvre 50 € par jour, contre 30 € au niveau 2.'); }
    if (v.hospi === 'secteur2') { plancher = Math.max(plancher, 4); raisons.push('Vos praticiens exercent en secteur 2 et une chirurgie non OPTAM est probable : nous conseillons le niveau 4, qui rembourse 200 % BRSS hors OPTAM. Au niveau 2, le reste à charge d’une chirurgie non OPTAM peut atteindre plusieurs centaines d’euros.'); }
    if (v.hospi === 'programmee') { plancher = Math.max(plancher, 3); raisons.push('Vous avez une hospitalisation programmée en France : il vous faut au moins le niveau 3. Le renfort Hospitalisation, en option, ne devient utile qu’une fois passé son délai d’attente de trois mois.'); }
    if (v.bienetre === 'audio') { plancher = Math.max(plancher, 4); raisons.push('Vous portez des aides auditives : le niveau 4 les rembourse 200 % BRSS en classe II, la classe I du 100 % Santé restant sans reste à charge à tous les niveaux.'); }
    if (v.ortho === 'deux') { plancher = Math.max(plancher, 4); raisons.push('Deux enfants ou plus suivent un traitement d’orthodontie en même temps : nous conseillons le niveau 4, qui rembourse 225 % BRSS et ajoute 100 € par an et par enfant d’orthodontie non remboursée.'); }
    if (v.ortho === 'un') { raisons.push('Un enfant en orthodontie ne justifie pas, à lui seul, de monter de niveau : l’écart de remboursement, d’environ 190 € par an entre les niveaux 3 et 4 sur l’exemple UNOCAM, reste inférieur au surcoût pour la famille.'); }
    niv = Math.max(niv, plancher);
    if (nsp) { niv += nsp; raisons.push(nsp > 1 ? 'Vous avez répondu « je ne sais pas » à ' + nsp + ' questions : par prudence, nous remontons de ' + nsp + ' niveaux. Un conseiller affinera cette recommandation avant la signature.' : 'Vous avez répondu « je ne sais pas » à une question : par prudence, nous remontons d’un niveau. Un conseiller affinera cette recommandation avant la signature.'); }
    if (v.alsace && niv < 2) niv = 2;
    niv = Math.min(niv, 5);
    var n0 = lamal && v.lieu === 'ch' && !v.alsace && v.optique === 'aucune' && v.dentaire === 'rien' && v.hospi === 'non' && v.bienetre === 'non';
    return { niv: niv, raisons: raisons, n0: n0 };
  }

  /* ---------- Simulateur ---------- */
  var form = $('#simu-form'), res = $('#simu-res');
  if (form && res) {
    var champOrtho = $('#champ-ortho');

    function lire() {
      var a = parseInt(valeur(form, 'adultes'), 10) || 1;
      var e = parseInt(valeur(form, 'enfants'), 10) || 0;
      var dept = valeur(form, 'dept');
      var ageEl = form.querySelector('input[name="age"]');
      CTX.age = ageEl ? (parseInt(ageEl.value, 10) || 30) : 30;
      CTX.regime = valeur(form, 'regime') === 'cmu' ? 'cmu' : 'lamal';
      var v = {
        age: CTX.age,
        regime: valeur(form, 'regime') === 'cmu' ? 'cmu' : 'lamal',
        adultes: a, enfants: e, dept: dept, alsace: !!ALSACE[dept],
        fract: valeur(form, 'fract') === 'an' ? 'an' : 'mois',
        flytel: valeur(form, 'flytel') === 'oui',
        lieu: valeur(form, 'lieu'), optique: valeur(form, 'optique'), dentaire: valeur(form, 'dentaire'),
        hospi: valeur(form, 'hospi'), bienetre: valeur(form, 'bienetre'),
        ortho: e >= 2 ? valeur(form, 'ortho') : 'non',
        propose: parseInt(valeur(form, 'propose'), 10) || 0
      };
      v.repondu = ['lieu', 'optique', 'dentaire', 'hospi', 'bienetre'].filter(function (k) { return !!v[k]; }).length;
      return v;
    }

    function montant(p, v) { var entier = Math.abs(p - Math.round(p)) < 1e-9; return v.fract === 'an' ? eur(p * 12, entier ? 0 : 2) : eur(p, entier ? 0 : 2); }
    function unite(v) { return v.fract === 'an' ? 'par an' : 'par mois'; }

    function carteResultat(v, c) {
      var h = '<div class="simu__r grain"><span class="sur">Votre résultat</span>';
      var foyer = libFoyer(v.adultes, v.enfants);
      if (v.repondu < 5) {
        var cible = prix(3, v.adultes, v.enfants);
        h += '<p class="simu__niv">Le prix pour votre foyer<small>' + foyer + ' · ' + (v.regime === 'lamal' ? 'affilié LAMal' : 'affilié CMU') + (v.alsace ? ' · Alsace-Moselle' : '') + '. Répondez aux cinq questions « Vos soins » (' + v.repondu + ' sur 5) pour obtenir un niveau conseillé.</small></p>';
        h += '<div class="simu__prix"><b>' + montant(cible.fly, v) + '</b><span>' + unite(v) + ' en formule Confort (niveau 3), tarif 2026</span></div>';
        h += '<div class="simu__msg">Il faut y ajouter ' + eur(ASSO, 0) + ' par mois de cotisation d’association et ' + eur(ENTREE, 0) + ' de droit d’entrée, une seule fois, dans tous les canaux. Les trois formules pour votre foyer sont détaillées ci-dessous.</div>';
        h += '<a class="btn btn--creme" href="#adherer">Adhérer en ligne</a></div>';
        return h;
      }

      var g = GRILLE[c.niv], p = prix(c.niv, v.adultes, v.enfants);
      var titre = g.formule ? 'ALPICARE ' + g.formule + ' <small style="display:inline;color:inherit">· Alptis ' + g.nom + '</small>' : 'Alptis ' + g.nom + ' <small style="display:inline;color:inherit">· « voir aussi »</small>';
      h += '<p class="simu__niv">Niveau conseillé : ' + titre + '<small>' + foyer + ' · ' + (v.regime === 'lamal' ? 'affilié LAMal' : 'affilié CMU') + (v.alsace ? ' · Alsace-Moselle' : '') + '</small></p>';
      h += '<div class="simu__prix"><b>' + montant(p.fly, v) + '</b><span>' + unite(v) + ', tarif 2026</span></div>';
      h += '<div class="simu__msg">Il faut y ajouter ' + eur(ASSO, 0) + ' par mois de cotisation d’association, soit ' + eur(ASSO * 12, 0) + ' par an, et ' + eur(ENTREE, 0) + ' de droit d’entrée, une seule fois. La première année vous revient donc, tout compris, à environ ' + eur(Math.round(p.fly * 12 + ASSO * 12 + ENTREE), 0) + '.</div>';

      if (c.n0) {
        var p1 = prix(1, v.adultes, v.enfants);
        h += '<div class="simu__msg simu__msg--alerte"><b>Vous n’avez peut-être besoin d’aucune complémentaire.</b> Dans votre situation, le niveau 1 revient à environ ' + eur(Math.round(p1.fly * 12), 0) + ' par an au tarif que nous visons, auxquels s’ajoutent ' + eur(ASSO * 12, 0) + ' de cotisation d’association et ' + eur(ENTREE, 0) + ' de droit d’entrée. En face, la quote-part d’un adulte en bonne santé se situe de l’ordre de 100 à 250 CHF par an [estimation : 10 % des coûts au-delà de la franchise, à vérifier], à quoi s’ajoutent 15 CHF par jour d’hôpital. Le contrat vaut donc surtout pour l’hospitalisation, où il prend en charge jusqu’à 700 CHF de quote-part et 15 CHF par jour, ainsi que pour les soins en France. Si votre principal reste à charge est la franchise de 300 CHF, sachez que MMA et La Frontalière la couvrent, mais que nous ne distribuons pas leurs contrats.</div>';
      }

      if (v.propose) {
        var pp = prix(v.propose, v.adultes, v.enfants);
        if (v.propose > c.niv) {
          h += '<div class="simu__msg simu__msg--alerte"><b>Nous vous conseillons un niveau plus bas.</b> Un autre distributeur vous proposait le ' + GRILLE[v.propose].nom + ' ; d’après vos réponses, le ' + g.nom + ' suffit' + (pp ? ' : votre foyer paierait environ ' + eur(Math.round((pp.fly - p.fly) * 12), 0) + ' de moins par an, soit ' + eur(p.fly) + ' par mois au lieu de ' + eur(pp.fly) : ', et comme le niveau 6 n’est pas coté sur le devis public, l’écart se lira dans le tarificateur') + '. Le niveau supérieur reste sélectionnable ci-dessous.</div>';
        } else if (v.propose === c.niv) {
          h += '<div class="simu__msg">Le niveau qu’un autre distributeur vous proposait, le ' + g.nom + ', est aussi celui que nous conseillons.</div>';
        } else {
          h += '<div class="simu__msg">Un autre distributeur vous proposait le ' + GRILLE[v.propose].nom + ' ; d’après vos réponses, nous irions plutôt au ' + g.nom + (pp ? ', soit ' + eur(Math.round((p.fly - pp.fly) * 12), 0) + ' de plus par an' : '') + '. Nous en listons les raisons ci-dessous.</div>';
        }
      }

      h += '<ul class="simu__list">';
      c.raisons.forEach(function (r) { h += '<li>' + tick() + '<span>' + r + '</span></li>'; });
      h += '</ul>';

      var dessus = c.niv + 1;
      if (dessus <= 6) {
        var pd = prix(dessus, v.adultes, v.enfants), gd = GRILLE[dessus];
        var ajoute = AJOUTE[dessus] + (AJOUTE_CH[v.regime][dessus] ? ', ' + AJOUTE_CH[v.regime][dessus] : '');
        h += '<div class="simu__msg"><b>Le niveau supérieur reste toujours visible.</b> Il s’agit de ' + (gd.formule ? 'ALPICARE ' + gd.formule + ' (' + gd.nom + ')' : gd.nom) + (pd ? ', soit ' + (v.fract === 'an' ? eur(Math.round((pd.fly - p.fly) * 12), 0) + ' de plus par an' : eur(arrondi(pd.fly - p.fly, 2)) + ' de plus par mois') + ' au tarif ALPICARE (' + montant(pd.fly, v) + ' ' + unite(v) + ')' : ', proposé sur devis, car il n’est pas coté sur le devis public') + '. Il ajoute : ' + ajoute + '.</div>';
      }
      h += '<a class="btn btn--creme" href="#adherer" data-choix="' + (g.formule ? g.formule.toLowerCase() : 'niveau-' + c.niv) + '">' + (g.formule ? 'Adhérer en formule ' + g.formule : 'Adhérer au ' + g.nom.toLowerCase()) + '</a></div>';
      return h;
    }

    function carteFormules(v, c) {
      var h = '<div class="simu__c"><h3>Les formules pour votre foyer</h3><p>Voici les tarifs 2026 pour ' + libFoyer(v.adultes, v.enfants) + ', ' + unite(v) + ', hors cotisation d’association et droit d’entrée.</p><div class="simu__f">';
      [2, 3, 4].forEach(function (n) {
        var g = GRILLE[n], p = prix(n, v.adultes, v.enfants), on = c && c.niv === n;
        h += '<div class="simu__fc' + (on ? ' simu__fc--on' : '') + '"><b>' + g.formule + '<i>' + g.nom + (on ? ' · conseillé' : '') + '</i></b><span class="n">' + montant(p.fly, v) + '<small>par mois</small></span></div>';
      });
      [1, 5].forEach(function (n) {
        var g = GRILLE[n], on = c && c.niv === n;
        if (n === 1 && v.alsace) {
          h += '<div class="simu__fc simu__fc--mini"><b>' + g.nom + '<i>voir aussi</i></b><small>Ce niveau n’est pas ouvert aux assurés rattachés à une CPAM d’Alsace-Moselle</small><span class="n" style="color:var(--gris)">—</span></div>';
          return;
        }
        var p = prix(n, v.adultes, v.enfants);
        h += '<div class="simu__fc simu__fc--mini' + (on ? ' simu__fc--on' : '') + '"><b>' + g.nom + '<i>voir aussi' + (on ? ' · conseillé' : '') + '</i></b><span class="n">' + montant(p.fly, v) + '<small>par mois</small></span></div>';
      });
      h += '<div class="simu__fc simu__fc--mini"><b>Niveau 6<i>voir aussi</i></b><small>Ce niveau n’est pas coté sur le devis public relevé</small><span class="n" style="font-size:1rem">Sur devis</span></div>';
      h += '</div>';

      /* Hypothèses et réserves, toujours affichées */
      h += '<p class="simu__hyp"><b>Voici comment ce prix est obtenu.</b> Le contrat, l’assureur et la gestion sont exactement les mêmes qu’en direct. Notre commission est de ' + (function () { var q = c ? prix(c.niv, v.adultes, v.enfants) : prix(3, v.adultes, v.enfants); return q && q.com !== undefined ? q.com : '3 à 10'; })() + ' % au lieu des ' + Math.round(C_PUB * 100) + ' % estimés dans le prix public, et le total est arrondi à un prix rond. Si Alptis ne répercute pas ce taux, vous payez le prix public et ALPICARE ne facture aucuns frais. Nous nous appuyons sur les devis publics d’Alptis des 5 et 6 septembre 2026, ajustés à ' + CTX.age + ' ans.</p>';
      if (v.adultes === 2 || v.enfants > 0) {
        h += '<p class="simu__hyp"><b>Voici comment le prix du foyer est calculé.</b> Les réductions prévues au contrat Alptis s’appliquent d’abord au prix public : 10 % de moins pour le conjoint, 60 % du prix adulte pour un enfant — proportion vérifiée sur le devis public du 6 septembre 2026, à moins de 1 % près — et 50 % de moins dès le 3<sup>e</sup> enfant de moins de 20 ans. Le total est ensuite arrondi une seule fois sur notre échelle : il se termine par 9, à défaut par 5.';
        var cle3 = v.adultes + '-' + Math.min(v.enfants, 1) + '-3';
        if (v.adultes === 2 && v.enfants <= 1 && REPERES[cle3]) {
          h += ' Un repère publié le confirme : dans la grille Radiance 2026, pour deux adultes de 40 ans en régime Sécurité sociale, le prix public s’élève à ' + eur(REPERES[v.adultes + '-' + v.enfants + '-1']) + ' par mois au niveau 1, à ' + eur(REPERES[cle3]) + ' au niveau 3 et à ' + eur(REPERES[v.adultes + '-' + v.enfants + '-5']) + ' au niveau 5, soit environ ' + eur(arrondi(REPERES[cle3] * R, 1), 1) + ' au niveau 3 dans le tarif que nous visons. L’écart avec le calcul ci-dessus tient à l’âge des adultes, 40 ans contre 30 à 35 ans, et à l’hypothèse retenue sur le prix de l’enfant.';
        }
        h += '</p>';
      }
      if (v.regime === 'lamal') {
        h += '<p class="simu__hyp"><b>Nous n’avons pas encore relevé la grille du régime LAMal.</b> Les montants ci-dessus ont été relevés en régime CMU. Comme Alptis tarifie selon le régime, Sécurité sociale ou LAMal, ils ne constituent qu’un repère non contractuel : le tarif établi en régime LAMal fait foi.</p>';
      }
      if (v.alsace) {
        h += '<p class="simu__hyp"><b>En Alsace-Moselle, Alptis applique une réduction dès le niveau 2</b>, dont le montant n’est pas publié : les prix ci-dessus sont donc des maximums, et le tarif du contrat tiendra compte de cette réduction. Le critère retenu est le rattachement à une CPAM d’Alsace-Moselle (57, 67, 68) ; pour un affilié CMU qui réside en Alsace, nous devons le confirmer avec Alptis.</p>';
      }
      if (v.fract === 'an') {
        h += '<p class="simu__hyp"><b>Le paiement annuel vaut douze fois le montant mensuel.</b> La cotisation est payable d’avance pour l’année et peut être fractionnée par mois ; aucun frais de fractionnement n’apparaît sur le devis relevé, et payer à l’année ne revient donc pas moins cher.</p>';
      }
      h += '<p class="simu__hyp">Ce calcul reste une estimation : c’est le tarif du contrat, établi sur votre âge exact, votre régime et la composition de votre foyer, qui fait foi. Les tarifs que nous visons sont en cours de validation auprès d’Alptis.</p>';
      h += '</div>';
      return h;
    }

    function carteFlytel(v) {
      if (!v.flytel) return '';
      return '<div class="simu__c"><h3>Abonné Flytel : un avantage à l’étude</h3><p>Un avantage sur votre forfait mobile Flytel est à l’étude, financé par Flytel. Il ne modifiera pas la cotisation d’assurance et ne conditionnera jamais votre formule. Le forfait et l’assurance peuvent être souscrits séparément, au même prix.</p></div>';
    }

    function rendre() {
      var v = lire();
      if (champOrtho) champOrtho.hidden = v.enfants < 2;
      var c = v.repondu === 5 ? conseil(v) : null;
      res.innerHTML = carteResultat(v, c) + carteFormules(v, c) + carteFlytel(v);
    }

    form.addEventListener('change', rendre);
    form.addEventListener('input', function (e) {
      if (e.target && e.target.name === 'age') {
        var o = form.querySelector('[data-age-out]'); if (o) o.textContent = e.target.value + ' ans';
        e.target.style.setProperty('--pct', ((e.target.value - 18) / 49 * 100) + '%');
        rendre();
      }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); rendre(); });
    /* Le sélecteur de régime du tableau des garanties (mêmes radios name="regime") est synchronisé par app.js : on recalcule aussi */
    doc.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'regime' && !form.contains(e.target)) setTimeout(rendre, 0);
    });
    rendre();
  }

  /* ---------- Formulaire « Adhérer en ligne » ---------- */
  var adh = $('#adhesion-form');
  if (adh) {
    var aErr = $('#adhesion-err'), aOk = $('#adhesion-ok'), aBtn = adh.querySelector('button[type="submit"]');
    function choisirFormule(f) {
      var r = adh.querySelector('input[name="formule"][value="' + f + '"]');
      if (r) { r.checked = true; return; }
      /* niveaux 1, 5 et 6 : pas de bouton radio, on garde le choix pour l'envoi */
      adh.setAttribute('data-niveau', f);
    }
    var qs = /[?&]formule=([a-z0-9-]+)/.exec(location.search);
    if (qs) choisirFormule(qs[1]);
    doc.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('[data-choix]') : null;
      if (a) choisirFormule(a.getAttribute('data-choix'));
    });
    adh.addEventListener('submit', function (e) {
      e.preventDefault();
      var prenom = (($('#prenom', adh) || {}).value || '').trim();
      var email = (($('#email', adh) || {}).value || '').trim();
      var naissance = (($('#naissance', adh) || {}).value || '').trim();
      var consent = adh.querySelector('input[name="consent"]');
      var pb = [];
      if (!prenom) pb.push('votre prénom');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) pb.push('une adresse électronique valide');
      if (consent && !consent.checked) pb.push('votre accord pour préparer l’adhésion');
      if (pb.length) {
        if (aErr) aErr.textContent = 'Merci d’indiquer ' + pb.join(', ').replace(/, ([^,]*)$/, ' et $1') + '.';
        if (aOk) aOk.textContent = '';
        var premier = !prenom ? $('#prenom', adh) : (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? $('#email', adh) : consent);
        if (premier && premier.focus) premier.focus();
        return;
      }
      var fSel = adh.querySelector('input[name="formule"]:checked');
      var formule = adh.getAttribute('data-niveau') || (fSel ? fSel.value : '');
      var foyer = '', age = CTX.age, prix = '';
      try { var fm = JSON.parse(localStorage.getItem('alpicare-foyer') || 'null'); if (fm) foyer = (fm.adultes === 2 ? '2 adultes' : '1 adulte') + (fm.enfants ? ' + ' + fm.enfants + ' enfant' + (fm.enfants > 1 ? 's' : '') : ''); } catch (err) { /* ignore */ }
      try { var am = parseInt(localStorage.getItem('alpicare-age'), 10); if (am >= 18 && am <= 67) age = am; } catch (err) { /* ignore */ }
      if (naissance) { var an = parseInt(naissance.slice(0, 4), 10); if (an > 1900) age = new Date().getFullYear() - an; }
      var niv = { essentiel: 2, confort: 3, premium: 4, 'niveau-1': 1, 'niveau-5': 5 }[formule];
      if (niv) { CTX.age = age; var p = prix_niveau(niv); if (p) prix = p + ' € par mois'; }
      var corps = { prenom: prenom, email: email, naissance: naissance, regime: valeur(adh, 'regime') || CTX.regime,
                    formule: formule, age: age, foyer: foyer, prix: prix, page: location.pathname, consent: true };
      if (aErr) aErr.textContent = '';
      if (aBtn) { aBtn.disabled = true; aBtn.textContent = 'Un instant…'; }
      fetch('/api/adhesion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j && j.ok, j: j || {} }; }); })
        .catch(function () { return { ok: false, j: {} }; })
        .then(function (res) {
          if (aBtn) { aBtn.disabled = false; aBtn.textContent = 'Commencer mon adhésion'; }
          if (res.ok) {
            if (aOk) aOk.textContent = 'Merci ' + prenom + '. Votre dossier ' + (formule ? 'en formule ' + formule.replace('niveau-', 'niveau ') + ' ' : '') + 'est ouvert' + (prix ? ' à ' + prix : '') + '. Vous recevez à ' + email + ' la notice, l’IPID et votre bulletin à signer électroniquement ; la signature vous prendra cinq minutes, sans rendez-vous.';
            adh.reset();
          } else if (aErr) {
            aErr.textContent = res.j.message || 'Envoi impossible pour le moment. Réessayez dans un instant.';
          }
        });
    });
  }

  /* ---------- Ancre vers un accordéon FAQ ---------- */
  function ouvrirAncre() {
    var id = (location.hash || '').slice(1);
    if (!id) return;
    var cible = doc.getElementById(id);
    if (!cible) return;
    var q = cible.closest ? cible.closest('.faq .q') : null;
    if (q && q.getAttribute('data-ouvert') !== '1') {
      q.setAttribute('data-ouvert', '1');
      var b = q.querySelector('button');
      if (b) b.setAttribute('aria-expanded', 'true');
    }
  }
  window.addEventListener('hashchange', ouvrirAncre);
  ouvrirAncre();
})();
