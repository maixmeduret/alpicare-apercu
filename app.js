/* FLYCARE — comportements de la page (vanilla, sans dépendance)
   1. Apparition .pose        5. Bascule prix mensuel / annuel   6b. Prix ronds selon l'âge et le régime
   2. Menu plein écran        6. Sélecteur de régime LAMal / CMU
   3. FAQ accordéon           7. Curseur du « passage » Annemasse ↔ Genève
   4. Barre collante mobile   8. Jauges du mockup, accordéons du pied, nav courante
   Les pages secondaires peuvent charger ce fichier tel quel : chaque
   module vérifie la présence de ses éléments avant d'agir. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement, body = doc.body;
  html.classList.add('js');

  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }

  /* ---------- 1. Apparition .pose ---------- */
  var poses = $$('.pose');
  if (poses.length) {
    if (!('IntersectionObserver' in window) || reduit) {
      poses.forEach(function (el) { el.classList.add('vu'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('vu'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
      poses.forEach(function (el) { io.observe(el); });
      /* Repli : au défilement, on révèle ce qui est dans la fenêtre (sécurité si l'observateur reste muet) */
      var attente = null;
      function balayer() {
        attente = null;
        var h = window.innerHeight || html.clientHeight;
        poses.forEach(function (el) {
          if (el.classList.contains('vu')) return;
          var r = el.getBoundingClientRect();
          if (r.top < h * 0.96 && r.bottom > 0) { el.classList.add('vu'); io.unobserve(el); }
        });
      }
      window.addEventListener('scroll', function () { if (!attente) attente = requestAnimationFrame(balayer); }, { passive: true });
      window.addEventListener('resize', function () { if (!attente) attente = requestAnimationFrame(balayer); });
      setTimeout(balayer, 400);
    }
  }

  /* ---------- 2. Menu plein écran ---------- */
  var menu = $('#menu'), burger = $('.burger'), fermer = $('.fermer');
  function ouvrirMenu(o) {
    if (!menu) return;
    menu.setAttribute('data-ouvert', o ? '1' : '0');
    if (burger) burger.setAttribute('aria-expanded', o ? 'true' : 'false');
    if (o) { body.setAttribute('data-menu', '1'); setTimeout(function () { if (fermer) fermer.focus(); }, 60); }
    else { body.removeAttribute('data-menu'); if (burger) burger.focus(); }
  }
  if (menu && burger) {
    burger.addEventListener('click', function () { ouvrirMenu(menu.getAttribute('data-ouvert') !== '1'); });
    if (fermer) fermer.addEventListener('click', function () { ouvrirMenu(false); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { ouvrirMenu(false); }); });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.getAttribute('data-ouvert') === '1') ouvrirMenu(false); });
  }

  /* ---------- 3. FAQ accordéon ---------- */
  $$('.faq .q').forEach(function (q) {
    var b = $('button', q);
    if (!b) return;
    b.addEventListener('click', function () {
      var ouvert = q.getAttribute('data-ouvert') === '1';
      q.setAttribute('data-ouvert', ouvert ? '0' : '1');
      b.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
    });
  });

  /* ---------- 4. Barre collante mobile (apparaît quand le hero est sorti) ---------- */
  var collante = $('.collante'), hero = $('.hero');
  if (collante) {
    if (hero && 'IntersectionObserver' in window) {
      var ioHero = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { collante.classList.toggle('vu', !e.isIntersecting && e.boundingClientRect.top < 0); });
      }, { threshold: 0 });
      ioHero.observe(hero);
    } else {
      collante.classList.add('vu');
    }
  }

  /* ---------- 5. Bascule prix mensuel / annuel ---------- */
  function fmt(n) {
    var s = (Math.round(n * 100) / 100).toFixed(2).split('.');
    var ent = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return { ent: ent, dec: s[1] };
  }
  var periodeCourante = 'mois';
  function appliquerPeriode(periode) {
    var an = periode === 'an';
    periodeCourante = periode;
    $$('[data-mois][data-an]').forEach(function (el) {
      var v = parseFloat(an ? el.getAttribute('data-an') : el.getAttribute('data-mois'));
      if (isNaN(v)) return;
      if (el.hasAttribute('data-entier')) {
        var t = Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
        if (el.classList.contains('prix__n')) el.innerHTML = t; else el.textContent = t;
        return;
      }
      var f = fmt(v);
      if (el.classList.contains('prix__n')) {
        el.innerHTML = f.ent + '<i class="prix__v">,</i>' + f.dec + ' €';
      } else {
        el.textContent = f.ent + ',' + f.dec + ' €';
      }
    });
    $$('[data-periode-libelle]').forEach(function (el) {
      el.textContent = an ? el.getAttribute('data-libelle-an') : el.getAttribute('data-libelle-mois');
    });
    $$('.bascule__b[data-periode]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-periode') === periode ? 'true' : 'false'); });
    try { localStorage.setItem('flycare-periode', periode); } catch (e) { /* stockage indisponible */ }
  }
  var boutonsPeriode = $$('.bascule__b[data-periode]');
  if (boutonsPeriode.length) {
    boutonsPeriode.forEach(function (b) { b.addEventListener('click', function () { appliquerPeriode(b.getAttribute('data-periode')); }); });
    var pMem = null;
    try { pMem = localStorage.getItem('flycare-periode'); } catch (e) { /* ignore */ }
    if (pMem === 'an') appliquerPeriode('an');
  }
  /* Économie par an calculée à partir des deux prix mensuels (jamais en dur dans le HTML) */
  function majEco() {
    $$('.eco[data-fly][data-pub]').forEach(function (el) {
      var fly = parseFloat(el.getAttribute('data-fly')), pub = parseFloat(el.getAttribute('data-pub'));
      var cible = $('b', el);
      if (isNaN(fly) || isNaN(pub) || !cible) return;
      var an = Math.round((pub - fly) * 12);
      cible.textContent = 'environ ' + an + ' € par an';
      el.hidden = an <= 0;
    });
  }
  majEco();

  /* ---------- 5c. Replis : une ancre qui vise un <details> l'ouvre ---------- */
  function ouvrirRepli() {
    var id = (location.hash || '').slice(1);
    if (!id) return;
    var c = doc.getElementById(id);
    if (!c) return;
    var d = c.closest ? c.closest('details') : null;
    if (!d) d = c.tagName === 'DETAILS' ? c : (c.nextElementSibling && c.nextElementSibling.tagName === 'DETAILS' ? c.nextElementSibling : null);
    if (d && !d.open) { d.open = true; d.scrollIntoView({ block: 'start' }); }
  }
  window.addEventListener('hashchange', ouvrirRepli);
  ouvrirRepli();

  /* ---------- 6. Sélecteur de régime LAMal / CMU ---------- */
  function appliquerRegime(r) {
    if (r !== 'lamal' && r !== 'cmu') r = 'lamal';
    body.setAttribute('data-regime', r);
    $$('[data-lamal]').forEach(function (el) { el.hidden = r !== 'lamal'; });
    $$('[data-cmu]').forEach(function (el) { el.hidden = r !== 'cmu'; });
    $$('input[name="regime"]').forEach(function (i) { i.checked = i.value === r; });
    $$('[data-regime-libelle]').forEach(function (el) { el.textContent = r === 'lamal' ? el.getAttribute('data-libelle-lamal') : el.getAttribute('data-libelle-cmu'); });
    try { localStorage.setItem('flycare-regime', r); } catch (e) { /* ignore */ }
  }
  var radiosRegime = $$('input[name="regime"]');
  var rMem = null;
  try { rMem = localStorage.getItem('flycare-regime'); } catch (e) { /* ignore */ }
  appliquerRegime(rMem || (body.getAttribute('data-regime') || 'lamal'));
  radiosRegime.forEach(function (i) { i.addEventListener('change', function () { if (i.checked) appliquerRegime(i.value); }); });

  /* ---------- 6b. Prix ronds selon l'âge et le régime ---------- */
  /* Principe : le prix public Alptis dépend de l'âge (courbe contractuelle : +3 %/an de 20 à 30 ans,
     +2 %/an de 31 à 59, +3 %/an dès 60) et du régime. FLYCARE affiche un prix rond (…9 €) : le plus
     petit prix en 9 qui laisse à FLYCARE une commission d'au moins C_MIN, la commission incorporée
     dans le prix public étant estimée à C_PUB. Tout est [estimation] tant qu'Alptis n'a pas confirmé
     que le tarificateur répercute le taux de commission choisi. Référence : devis Cmonassurance du
     05/09/2026 (adulte seul, régime CMU), dont l'âge est calé à 30 ans par un second devis relevé le
     06/09/2026 (32 ans + 1 enfant, CMU : niveau 3 89,86 €, niveau 4 110,93 €, niveau 5 133,20 €,
     retrouvés à moins de 1 % près avec la courbe d'âge et un enfant à 60 %). */
  var TARIF = {
    ageRef: 30,
    pub: { 1: 32.03, 2: 43.11, 3: 53.80, 4: 66.31, 5: 79.53 },
    regime: { lamal: 1, cmu: 1 },   /* devis relevés en régime CMU ; grille LAMal non encore relevée : même base en attendant (une seule constante à changer) */
    C_PUB: 0.17, C_MIN: 0.03, C_MAX: 0.20
  };
  function cumulAge(a) { var f = 1, y; for (y = 21; y <= a; y++) f *= (y <= 30 ? 1.03 : (y <= 59 ? 1.02 : 1.03)); return f; }
  function facteurAge(age) {
    var a = Math.min(67, Math.max(18, Math.round(age) || TARIF.ageRef));
    return cumulAge(Math.max(20, a)) / cumulAge(TARIF.ageRef);
  }
  /* Échelle des prix FLYCARE : un prix affiché se termine par 9, à défaut par 5, à défaut par 0.
     On cherche le plus petit barreau compris entre le net (ce que gardent Alptis et CNP) et le prix public
     Alptis, qu'on ne dépasse jamais. Sur 250 profils (âges 18-67 × niveaux 1-5), 227 tombent sur un 9,
     19 sur un 5, 3 sur un 0, et un seul (21 ans, niveau 1) n'a aucun barreau disponible : on prend alors
     le plus grand entier sous le prix public. */
  var BARREAUX = [9, 5, 0];
  function prixRond(pub) {
    var net = pub * (1 - TARIF.C_PUB);
    var bas = Math.ceil(net - 1e-9), haut = Math.floor(pub + 1e-9), prix = null, i, n;
    for (i = 0; i < BARREAUX.length && prix === null; i++) {
      for (n = bas; n <= haut; n++) { if (n % 10 === BARREAUX[i]) { prix = n; break; } }
    }
    if (prix === null) prix = Math.max(haut, Math.ceil(net));
    var com = prix > 0 ? Math.max(0, 1 - net / prix) : 0;
    return { rond: prix, pub: pub, com: Math.round(com * 100) };
  }

  function prixNiveau(niveau, age, regime) {
    var base = TARIF.pub[niveau];
    if (!base) return null;
    var pub = base * facteurAge(age) * (TARIF.regime[regime] || 1);
    return prixRond(pub);
  }
  window.FLYCARE_TARIF = { TARIF: TARIF, facteurAge: facteurAge, prixRond: prixRond, prixNiveau: prixNiveau };

  var NIV_PAR_CIBLE = { '28.00': 1, '37.70': 2, '47.00': 3, '57.90': 4, '69.50': 5 };
  var cartesPrix = $$('.carte').filter(function (c) {
    var pn = $('.prix__n[data-mois]', c);
    if (!pn) return false;
    var n = c.getAttribute('data-niveau') || NIV_PAR_CIBLE[pn.getAttribute('data-mois')];
    if (!n) return false;
    c.setAttribute('data-niveau', n);
    pn.setAttribute('data-entier', '');
    return true;
  });
  var ageCourant = TARIF.ageRef;
  try { var aMem = parseInt(localStorage.getItem('flycare-age'), 10); if (aMem >= 18 && aMem <= 67) ageCourant = aMem; } catch (e) { /* ignore */ }
  /* Foyer : conjoint = 90 % du prix adulte, enfant = 60 %, 30 % dès le 3e enfant, chacun arrondi à l'euro (même règle que le simulateur) */
  var foyer = { adultes: 1, enfants: 0 };
  try { var fMem = JSON.parse(localStorage.getItem('flycare-foyer') || 'null'); if (fMem && (fMem.adultes === 1 || fMem.adultes === 2)) foyer = { adultes: fMem.adultes, enfants: Math.max(0, Math.min(4, parseInt(fMem.enfants, 10) || 0)) }; } catch (e) { /* ignore */ }
  function sauverFoyer() { try { localStorage.setItem('flycare-foyer', JSON.stringify(foyer)); } catch (e) { /* ignore */ } }
  /* Coefficient contractuel du foyer : conjoint 90 % (réduction couple de 10 %),
     enfant 60 %, 30 % à partir du 3e enfant de moins de 20 ans. */
  function coefFoyer() {
    var c = 1 + (foyer.adultes === 2 ? 0.9 : 0);
    for (var i = 1; i <= foyer.enfants; i++) c += 0.6 * (i >= 3 ? 0.5 : 1);
    return c;
  }
  /* Le prix affiché est celui du foyer entier, arrondi une seule fois sur l'échelle :
     un total de foyer se termine donc lui aussi par 9, 5 ou 0. */
  function prixFoyer(pubAdulte) {
    var pubTotal = pubAdulte * coefFoyer();
    var r = prixRond(pubTotal);
    return { total: r.rond, pub: pubTotal, com: r.com };
  }
  function libelleFoyer() {
    if (foyer.adultes === 1 && foyer.enfants === 0) return '';
    var qui = foyer.adultes === 2 ? 'vous et votre conjoint' : 'vous';
    if (foyer.enfants) qui = (foyer.adultes === 2 ? 'vous, votre conjoint' : 'vous') + ' et ' + foyer.enfants + ' enfant' + (foyer.enfants > 1 ? 's' : '');
    var remises = [];
    if (foyer.adultes === 2) remises.push('10 % pour le conjoint');
    if (foyer.enfants > 2) remises.push('50 % dès le 3ᵉ enfant');
    return 'Prix pour ' + qui + (remises.length ? ', avec une réduction de ' + remises.join(' et de ') : '');
  }

  function rendrePrix() {
    var regime = body.getAttribute('data-regime') || 'lamal';
    cartesPrix.forEach(function (c) {
      var p = prixNiveau(c.getAttribute('data-niveau'), ageCourant, regime);
      if (!p) return;
      var pf = prixFoyer(p.pub), pubFoyer = pf.pub;
      var pn = $('.prix__n', c), pb = $('.prix__pub b', c), eco = $('.eco', c), com = $('.prix__com', c), pm = $('.prix__m', c);
      pn.setAttribute('data-mois', pf.total); pn.setAttribute('data-an', pf.total * 12);
      if (pb) { pb.setAttribute('data-mois', pubFoyer.toFixed(2)); pb.setAttribute('data-an', (pubFoyer * 12).toFixed(2)); }
      if (eco) { eco.setAttribute('data-fly', pf.total); eco.setAttribute('data-pub', pubFoyer.toFixed(2)); }
      if (com) com.textContent = 'Commission FLYCARE incluse : ' + p.com + ' % (estimation)';
      var lf = $('.prix__foyer', c);
      if (!lf && pm) { lf = document.createElement('span'); lf.className = 'prix__foyer'; pm.parentNode.insertBefore(lf, pm.nextSibling); }
      if (lf) { var t = libelleFoyer(); lf.textContent = t; lf.hidden = (t === ''); }
    });
    $$('[data-foyer-adultes]').forEach(function (b) { b.setAttribute('aria-pressed', parseInt(b.getAttribute('data-foyer-adultes'), 10) === foyer.adultes ? 'true' : 'false'); });
    $$('[data-foyer-nb]').forEach(function (el) { el.textContent = foyer.enfants; });
    $$('[data-foyer-mot]').forEach(function (el) { el.textContent = foyer.enfants > 1 ? 'enfants' : 'enfant'; });
    $$('[data-foyer-enfants="-1"]').forEach(function (b) { b.disabled = foyer.enfants <= 0; });
    $$('[data-foyer-enfants="+1"]').forEach(function (b) { b.disabled = foyer.enfants >= 4; });
    /* synchronisation avec le simulateur de la page tarifs, s'il est présent */
    $$('input[name="adultes"]').forEach(function (i) { if (i.type === 'hidden') i.value = foyer.adultes; else i.checked = parseInt(i.value, 10) === foyer.adultes; });
    $$('input[name="enfants"]').forEach(function (i) { if (i.type === 'hidden') i.value = foyer.enfants; else i.checked = parseInt(i.value, 10) === foyer.enfants; });
    $$('input[type="hidden"][name="age"]').forEach(function (i) { i.value = ageCourant; });
    $$('input[type="hidden"][name="regime"]').forEach(function (i) { i.value = regime; });
    declencherSimu();
    appliquerPeriode(periodeCourante);
    majEco();
    var des = prixNiveau(2, 18, regime);
    $$('[data-des]').forEach(function (el) { el.textContent = des.rond + ' €'; });
    $$('[data-age-out]').forEach(function (el) { el.textContent = ageCourant + ' ans'; });
    $$('.reglage__r').forEach(function (r) {
      if (parseInt(r.value, 10) !== ageCourant) r.value = ageCourant;
      r.style.setProperty('--pct', ((ageCourant - 18) / (67 - 18) * 100) + '%');
    });
  $$('[data-regime-btn]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-regime-btn') === regime ? 'true' : 'false'); });
    majResume(regime);
  }

  /* Récapitulatif dans le réglage : les trois prix du foyer, recalculés à chaque geste */
  var NOMS = { 2: 'Essentiel', 3: 'Confort', 4: 'Premium' };
  function majResume(regime) {
    var cibles = $$('[data-resume]');
    if (!cibles.length) return;
    var h = '';
    [2, 3, 4].forEach(function (n) {
      var p = prixNiveau(n, ageCourant, regime);
      if (!p) return;
      h += '<span><i>' + NOMS[n] + '</i> <b>' + prixFoyer(p.pub).total + '&nbsp;€</b></span>';
    });
    cibles.forEach(function (el) { el.innerHTML = h; });
  }
  $$('.reglage__r').forEach(function (r) {
    r.addEventListener('input', function () {
      ageCourant = parseInt(r.value, 10) || TARIF.ageRef;
      try { localStorage.setItem('flycare-age', String(ageCourant)); } catch (e) { /* ignore */ }
      rendrePrix();
    });
  });
  $$('[data-regime-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (typeof appliquerRegime === 'function') appliquerRegime(b.getAttribute('data-regime-btn'));
      rendrePrix();
    });
  });
  $$('input[name="regime"]').forEach(function (i) { i.addEventListener('change', function () { setTimeout(rendrePrix, 0); }); });
  $$('[data-foyer-adultes]').forEach(function (b) {
    b.addEventListener('click', function () { foyer.adultes = parseInt(b.getAttribute('data-foyer-adultes'), 10) === 2 ? 2 : 1; sauverFoyer(); rendrePrix(); declencherSimu(); });
  });
  $$('[data-foyer-enfants]').forEach(function (b) {
    b.addEventListener('click', function () { foyer.enfants = Math.max(0, Math.min(4, foyer.enfants + (b.getAttribute('data-foyer-enfants') === '+1' ? 1 : -1))); sauverFoyer(); rendrePrix(); declencherSimu(); });
  });
  function declencherSimu() { var f = $('#simu-form'); if (f) f.dispatchEvent(new Event('change', { bubbles: true })); }
  /* le simulateur peut aussi piloter le foyer */
  $$('input[name="adultes"], input[name="enfants"]').forEach(function (i) {
    i.addEventListener('change', function () {
      var a = $('input[name="adultes"]:checked'), e = $('input[name="enfants"]:checked');
      var na = a ? parseInt(a.value, 10) : foyer.adultes, ne = e ? parseInt(e.value, 10) : foyer.enfants;
      if (na === foyer.adultes && ne === foyer.enfants) return;
      foyer.adultes = na === 2 ? 2 : 1; foyer.enfants = Math.max(0, Math.min(4, ne)); sauverFoyer(); rendrePrix();
    });
  });
  if (cartesPrix.length || $$('[data-des]').length) rendrePrix();

  /* ---------- 7. Curseur du passage Annemasse ↔ Genève ---------- */
  var passage = $('.passage');
  if (passage && !reduit) {
    var curseur = $('.curseur', passage), bornes = $$('.bornes span', passage);
    var cote = 0, minuterie = null;
    function bouger() {
      cote = cote ? 0 : 1;
      if (curseur) { curseur.style.left = cote ? '100%' : '0%'; curseur.classList.toggle('ch', !!cote); }
      bornes.forEach(function (b, i) { b.classList.toggle('actif', i === cote); });
    }
    function demarrer() { if (!minuterie) { minuterie = setInterval(bouger, 3400); } }
    function arreter() { if (minuterie) { clearInterval(minuterie); minuterie = null; } }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { setTimeout(bouger, 600); demarrer(); } else { arreter(); } });
      }, { threshold: 0.3 }).observe(passage);
    } else { demarrer(); }
  }

  /* ---------- 8a. Jauges du mockup iPhone ---------- */
  var tel = $('.tel');
  if (tel) {
    if ('IntersectionObserver' in window && !reduit) {
      var ioTel = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { tel.classList.add('vu'); ioTel.disconnect(); } });
      }, { threshold: 0.35 });
      ioTel.observe(tel);
    } else { tel.classList.add('vu'); }
  }

  /* ---------- 8b. Accordéons du pied de page (mobile) ---------- */
  $$('.pied__famBtn').forEach(function (b) {
    b.addEventListener('click', function () {
      var fam = b.parentNode, ouvert = fam.hasAttribute('data-ouvert');
      if (ouvert) fam.removeAttribute('data-ouvert'); else fam.setAttribute('data-ouvert', '');
      b.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
    });
  });

  /* ---------- 8c. Lien de navigation courant selon la section visible ---------- */
  var liensNav = $$('.barre__nav a[href^="#"]');
  var sections = liensNav.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
  if (sections.length && 'IntersectionObserver' in window) {
    var ioNav = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        liensNav.forEach(function (a) {
          if (a.getAttribute('href') === '#' + e.target.id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { ioNav.observe(s); });
  }

  /* Barre de progression de lecture */
  (function () {
    var pr = document.querySelector('[data-progres]');
    if (!pr) return;
    var attente = false;
    function majProgres() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      pr.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
      attente = false;
    }
    window.addEventListener('scroll', function () {
      if (!attente) { attente = true; requestAnimationFrame(majProgres); }
    }, { passive: true });
    window.addEventListener('resize', majProgres, { passive: true });
    majProgres();
  })();

})();
