/* ALPICARE — maquette « mouvement ».
   Prix en direct (tarif.js, moteur identique à FLYCARE) et animations pilotées par le défilement :
   barre de progression, apparitions, titre mot à mot, compteurs, parallaxe légère, section épinglée.
   Toutes les animations se coupent si l'utilisateur préfère moins de mouvement. */
(function () {
  'use strict';
  var T = window.ALPICARE_TARIF;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Prix ---------- */
  var etat = { age: 30, regime: 'lamal', adultes: 1, enfants: 0 };
  var SUISSE = {
    2: { lamal: 'Quote-part remboursée à 100 %', cmu: '125 % de la base de remboursement' },
    3: { lamal: 'Quote-part remboursée à 100 % et 50 € de transport', cmu: '150 % de la base de remboursement et 20 € par acte' },
    4: { lamal: 'Quote-part remboursée à 100 % et 100 € de transport', cmu: '200 % de la base de remboursement et 30 € par acte' }
  };
  function euros(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'; }
  function eurosDec(n) { return n.toFixed(2).replace('.', ',') + ' €'; }

  function rendre() {
    if (!T) return;
    $$('.carte[data-niveau]').forEach(function (c) {
      var niv = parseInt(c.getAttribute('data-niveau'), 10);
      var p = T.prix(niv, etat.age, etat.regime, etat.adultes, etat.enfants);
      if (!p) return;
      var pn = $('[data-prix]', c), s = $('[data-suisse-' + niv + ']', c);
      if (pn) pn.textContent = euros(p.mois);
      if (s && SUISSE[niv]) s.textContent = SUISSE[niv][etat.regime];
    });
    var e = T.prix(2, 18, etat.regime, 1, 0);
    $$('[data-des]').forEach(function (x) { x.textContent = euros(e.mois); });
    $$('[data-age-out]').forEach(function (x) { x.textContent = etat.age + ' ans'; });
    $$('[data-regime]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-regime') === etat.regime ? 'true' : 'false'); });
    $$('[data-adultes]').forEach(function (b) { b.setAttribute('aria-pressed', parseInt(b.getAttribute('data-adultes'), 10) === etat.adultes ? 'true' : 'false'); });
    $$('[data-nb]').forEach(function (x) { x.textContent = etat.enfants; });
    $$('[data-mot]').forEach(function (x) { x.textContent = etat.enfants > 1 ? 'enfants' : 'enfant'; });
    $$('[data-enfants="-1"]').forEach(function (b) { b.disabled = etat.enfants <= 0; });
    $$('[data-enfants="1"]').forEach(function (b) { b.disabled = etat.enfants >= 4; });
  }
  var sl = $('#age');
  if (sl) sl.addEventListener('input', function () { etat.age = parseInt(sl.value, 10) || 30; rendre(); });
  $$('[data-regime]').forEach(function (b) { b.addEventListener('click', function () { etat.regime = b.getAttribute('data-regime'); rendre(); }); });
  $$('[data-adultes]').forEach(function (b) { b.addEventListener('click', function () { etat.adultes = parseInt(b.getAttribute('data-adultes'), 10) === 2 ? 2 : 1; rendre(); }); });
  $$('[data-enfants]').forEach(function (b) {
    b.addEventListener('click', function () {
      etat.enfants = Math.max(0, Math.min(4, etat.enfants + parseInt(b.getAttribute('data-enfants'), 10)));
      rendre();
    });
  });
  rendre();

  /* ---------- 2. Titre mot à mot ---------- */
  var titre = $('[data-mots]');
  if (titre && !calme) {
    $$('span', titre).forEach(function (ligne, i) {
      ligne.classList.add('mot');
      ligne.style.transitionDelay = (0.08 + i * 0.11) + 's';
      setTimeout(function () { ligne.classList.add('vu'); }, 60);
    });
  }

  /* ---------- 3. Apparitions ---------- */
  var poses = $$('.pose');
  if (calme || !('IntersectionObserver' in window)) {
    poses.forEach(function (p) { p.classList.add('vu'); });
  } else {
    var io = new IntersectionObserver(function (ent) {
      ent.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('vu'); io.unobserve(x.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    poses.forEach(function (p) { io.observe(p); });
  }

  /* ---------- 4. Compteurs ---------- */
  function compter(el) {
    var cible = parseInt(el.getAttribute('data-compte'), 10) || 0;
    var suffixe = el.getAttribute('data-suffixe') || '';
    var fixe = el.getAttribute('data-texte');
    if (fixe) { el.textContent = fixe; return; }
    if (calme) { el.textContent = euros(cible).replace(' €', '') + suffixe; return; }
    var debut = null, duree = 1100;
    function pas(t) {
      if (debut === null) debut = t;
      var p = Math.min(1, (t - debut) / duree);
      var v = Math.round(cible * (1 - Math.pow(1 - p, 3)));
      el.textContent = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + suffixe;
      if (p < 1) requestAnimationFrame(pas);
    }
    requestAnimationFrame(pas);
  }
  var compteurs = $$('[data-compte]');
  if ('IntersectionObserver' in window) {
    var ioc = new IntersectionObserver(function (ent) {
      ent.forEach(function (x) { if (x.isIntersecting) { compter(x.target); ioc.unobserve(x.target); } });
    }, { threshold: 0.5 });
    compteurs.forEach(function (c) { ioc.observe(c); });
  } else { compteurs.forEach(compter); }

  /* ---------- 5. Section épinglée : l'image suit l'étape lue ---------- */
  var etapes = $$('[data-etapes] .etape'), visuels = $$('.epingle__v img');
  if (etapes.length && visuels.length && 'IntersectionObserver' in window) {
    var ioe = new IntersectionObserver(function (ent) {
      ent.forEach(function (x) {
        if (!x.isIntersecting) return;
        var i = parseInt(x.target.getAttribute('data-img'), 10) || 0;
        etapes.forEach(function (e) { e.classList.remove('on'); });
        x.target.classList.add('on');
        visuels.forEach(function (v, k) { v.classList.toggle('on', k === i); });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    etapes.forEach(function (e) { ioe.observe(e); });
  }

  /* ---------- 6. Progression et barre ---------- */
  var pr = $('[data-progres]'), barre = $('[data-barre]'), parallaxes = $$('[data-parallaxe]');
  var tic = false;
  function auDefilement() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    if (pr) pr.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    if (barre) barre.classList.toggle('barre--pose', h.scrollTop > 40);
    if (!calme) {
      parallaxes.forEach(function (img) {
        var r = img.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var d = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        img.style.transform = 'translate3d(0,' + (d * -18).toFixed(2) + 'px,0) scale(1.06)';
      });
    }
    tic = false;
  }
  window.addEventListener('scroll', function () { if (!tic) { tic = true; requestAnimationFrame(auDefilement); } }, { passive: true });
  window.addEventListener('resize', auDefilement, { passive: true });
  auDefilement();
})();
