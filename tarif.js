/* ALPICARE — moteur de prix partagé par les deux maquettes.
   Reprend à l'identique la règle du site ALPICARE (voir README, section « L'échelle de prix ») :
   le prix affiché est le plus petit entier finissant par 9, à défaut 5, à défaut 0, compris entre
   le tarif net et le plafond que nous nous fixons, jamais au-dessus.
   Le foyer est arrondi une seule fois, sur le total, après application des réductions contractuelles. */
(function (global) {
  'use strict';

  var TARIF = {
    ageRef: 30,
    /* Grille de référence 2026, régime CMU, adulte seul de 30 ans */
    pub: { 1: 32.03, 2: 43.11, 3: 53.80, 4: 66.31, 5: 79.53 },
    regime: { lamal: 1, cmu: 1 },
    C_PUB: 0.17
  };
  var BARREAUX = [9, 5, 0];

  /* Courbe d'âge contractuelle : +3 %/an de 20 à 30 ans, +2 % de 31 à 59, +3 % à partir de 60 */
  function cumulAge(a) {
    var f = 1, y;
    for (y = 21; y <= a; y++) f *= (y <= 30 ? 1.03 : (y <= 59 ? 1.02 : 1.03));
    return f;
  }
  function facteurAge(age) {
    var a = Math.min(67, Math.max(18, Math.round(age) || TARIF.ageRef));
    return cumulAge(Math.max(20, a)) / cumulAge(TARIF.ageRef);
  }

  function prixRond(pub) {
    var net = pub * (1 - TARIF.C_PUB);
    var bas = Math.ceil(net - 1e-9), haut = Math.floor(pub + 1e-9), prix = null, i, n;
    for (i = 0; i < BARREAUX.length && prix === null; i++) {
      for (n = bas; n <= haut; n++) { if (n % 10 === BARREAUX[i]) { prix = n; break; } }
    }
    if (prix === null) prix = Math.max(haut, Math.ceil(net));
    return { rond: prix, pub: pub, com: prix > 0 ? Math.round(Math.max(0, 1 - net / prix) * 100) : 0 };
  }

  /* Conjoint 90 %, enfant 60 %, 30 % à partir du 3e enfant de moins de 20 ans */
  function coefFoyer(adultes, enfants) {
    var c = 1 + (adultes === 2 ? 0.9 : 0), i;
    for (i = 1; i <= enfants; i++) c += 0.6 * (i >= 3 ? 0.5 : 1);
    return c;
  }

  function prix(niveau, age, regime, adultes, enfants) {
    var base = TARIF.pub[niveau];
    if (!base) return null;
    var pubAdulte = base * facteurAge(age) * (TARIF.regime[regime] || 1);
    var pubFoyer = pubAdulte * coefFoyer(adultes || 1, enfants || 0);
    var r = prixRond(pubFoyer);
    return { mois: r.rond, an: r.rond * 12, pub: pubFoyer, com: r.com, ecoAn: Math.max(0, Math.round((pubFoyer - r.rond) * 12)) };
  }

  global.ALPICARE_TARIF = { TARIF: TARIF, facteurAge: facteurAge, prixRond: prixRond, coefFoyer: coefFoyer, prix: prix };
})(window);
