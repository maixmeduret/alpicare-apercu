/* ALPICARE — l’assistant de questions et réponses.
   Le widget parle au serveur local (/api/chat), qui interroge le modèle : la clé n’est jamais
   dans le navigateur. Sans JavaScript, sans serveur ou sans clé, le site reste entièrement
   utilisable et l’assistant le dit au lieu de rester muet.
   Aucune dépendance, aucun module, JavaScript compatible ES5. */
(function () {
  'use strict';

  var doc = document;
  if (doc.getElementById('assistant-panneau')) return;

  /* ------------------------------------------------------------------ réglages */

  var SUGGESTIONS = [
    'Quelle différence entre Essentiel, Confort et Premium ?',
    'Ma franchise LAMal de 300 CHF est-elle remboursée ?',
    'Combien coûte Confort pour un couple de 40 ans avec deux enfants ?',
    'Comment suis-je remboursé pour une consultation en Suisse ?'
  ];

  var ACCUEIL = 'Bonjour. Je suis l’assistant d’ALPICARE et je réponds sur les trois formules, '
    + 'sur ce qui est remboursé en France comme en Suisse, sur le prix et sur l’adhésion. '
    + 'Posez votre question, ou choisissez-en une ci-dessous.';

  var ETATS = {
    reflexion: 'Je réfléchis',
    recherche: 'Je cherche le tarif',
    calcul: 'Je calcule le remboursement',
    cotisation: 'Je calcule votre cotisation',
    redaction: 'Je rédige la réponse'
  };

  var NB = ' ';                      /* espace insécable */
  var MEMOIRE = 'alpicare-assistant';   /* clé de sessionStorage */
  var TOURS = 12;                       /* messages conservés, comme le serveur */

  var HORS_SERVICE = 'Je n’ai pas pu joindre le serveur ALPICARE, et sans lui je ne peux pas répondre. '
    + 'Le reste du site fonctionne, et l’équipe vous répond par courrier électronique.';

  /* ------------------------------------------------------------------ état */

  var historique = lireMemoire();
  var serveurVerifie = false;
  var enCours = false;
  var dernierFocus = null;

  function lireMemoire() {
    try {
      var brut = window.sessionStorage.getItem(MEMOIRE);
      var lu = brut ? JSON.parse(brut) : [];
      return Object.prototype.toString.call(lu) === '[object Array]' ? lu : [];
    } catch (e) { return []; }
  }
  function ecrireMemoire() {
    try { window.sessionStorage.setItem(MEMOIRE, JSON.stringify(historique.slice(-TOURS))); } catch (e) { /* navigation privée */ }
  }

  /* ------------------------------------------------------------------ gabarit */

  var bouton = doc.createElement('button');
  bouton.type = 'button';
  bouton.className = 'assistant__btn';
  bouton.id = 'assistant-bouton';
  bouton.setAttribute('aria-controls', 'assistant-panneau');
  bouton.setAttribute('aria-expanded', 'false');
  bouton.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12z"/></svg>'
    + '<span>Une question ?</span>';

  var panneau = doc.createElement('section');
  panneau.id = 'assistant-panneau';
  panneau.className = 'assistant';
  panneau.setAttribute('role', 'dialog');
  panneau.setAttribute('aria-labelledby', 'assistant-titre');
  panneau.hidden = true;
  panneau.innerHTML =
    '<div class="assistant__h">'
      + '<div class="assistant__t">'
        + '<b id="assistant-titre">L’assistant ALPICARE</b>'
        + '<small>Réponses automatiques, sans conseil personnalisé. L’équipe prend le relais par courrier électronique.</small>'
      + '</div>'
      + '<button type="button" class="assistant__eff" hidden>Effacer</button>'
      + '<button type="button" class="assistant__fermer" aria-label="Fermer l’assistant">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" '
        + 'stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>'
      + '</button>'
    + '</div>'
    + '<div class="assistant__fil" tabindex="0" role="region" aria-label="Conversation avec l’assistant"></div>'
    + '<p class="sr" role="status" aria-live="polite"></p>'
    + '<div class="assistant__sugg"></div>'
    + '<form class="assistant__form" autocomplete="off" novalidate>'
      + '<label class="sr" for="assistant-saisie">Votre question</label>'
      + '<textarea id="assistant-saisie" rows="1" maxlength="1500" placeholder="Votre question…"></textarea>'
      + '<button type="submit" class="assistant__envoyer" aria-label="Envoyer la question">'
        + '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" '
        + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
        + '<path d="M5 12h14M13 6l6 6-6 6"/></svg>'
      + '</button>'
    + '</form>'
    + '<p class="assistant__note">Ces réponses vous informent, elles n’engagent pas : le devis qui vous est '
      + 'remis avant l’adhésion fait foi. N’écrivez ici ni facture, ni décompte, ni donnée de santé.</p>';

  doc.body.appendChild(bouton);
  doc.body.appendChild(panneau);

  var fil = panneau.querySelector('.assistant__fil');
  var annonce = panneau.querySelector('[role=status]');
  var sugg = panneau.querySelector('.assistant__sugg');
  var form = panneau.querySelector('.assistant__form');
  var saisie = panneau.querySelector('#assistant-saisie');
  var envoyer = panneau.querySelector('.assistant__envoyer');
  var effacer = panneau.querySelector('.assistant__eff');
  var fermeture = panneau.querySelector('.assistant__fermer');

  /* ------------------------------------------------------------------ rendu */

  function echapper(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function gras(l) { return l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

  /* Mise en forme volontairement minimale et sûre : gras, listes à puces, paragraphes. */
  function formater(texte) {
    var lignes = echapper(texte).split(/\r?\n/);
    var html = '', liste = false, i, m, l;
    for (i = 0; i < lignes.length; i++) {
      l = lignes[i];
      m = l.match(/^\s*[-*•]\s+(.*)$/);
      if (m) {
        if (!liste) { html += '<ul>'; liste = true; }
        html += '<li>' + gras(m[1]) + '</li>';
        continue;
      }
      if (liste) { html += '</ul>'; liste = false; }
      if (l.replace(/\s/g, '') === '') continue;
      html += '<p>' + gras(l) + '</p>';
    }
    if (liste) html += '</ul>';
    return html;
  }

  function auBas() { fil.scrollTop = fil.scrollHeight; }

  function bulle(role, texte, variante) {
    var d = doc.createElement('div');
    d.className = 'assistant__m assistant__m--' + (role === 'user' ? 'vous' : 'lui') + (variante ? ' ' + variante : '');
    d.innerHTML = role === 'user' ? '<p>' + echapper(texte) + '</p>' : formater(texte);
    fil.appendChild(d);
    auBas();
    return d;
  }

  function dire(texte) { annonce.textContent = texte; }

  /* Une information sur l’état du service ne se répète pas deux fois de suite. */
  function informer(texte) {
    var dernier = fil.lastChild;
    if (dernier && dernier.className && dernier.className.indexOf('assistant__m--info') >= 0
      && dernier.textContent === texte) { auBas(); return dernier; }
    var d = bulle('assistant', texte, 'assistant__m--info');
    dire(texte);
    return d;
  }

  function rendreSuggestions() {
    sugg.innerHTML = '';
    if (historique.length) { sugg.hidden = true; return; }
    sugg.hidden = false;
    for (var i = 0; i < SUGGESTIONS.length; i++) {
      (function (question) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'assistant__chip';
        b.textContent = question;
        b.addEventListener('click', function () { poser(question); });
        sugg.appendChild(b);
      })(SUGGESTIONS[i]);
    }
  }

  function rendreTout() {
    fil.innerHTML = '';
    bulle('assistant', ACCUEIL, 'assistant__m--accueil');
    for (var i = 0; i < historique.length; i++) bulle(historique[i].role, historique[i].content);
    rendreSuggestions();
    effacer.hidden = !historique.length;
    auBas();
  }

  /* ------------------------------------------------------------------ ouverture, fermeture, clavier */

  function enFeuille() {
    return !window.matchMedia || window.matchMedia('(max-width: 640px)').matches;
  }

  function focusables() {
    var tous = panneau.querySelectorAll('button, textarea, [href], input, select, [tabindex]');
    var out = [], i;
    for (i = 0; i < tous.length; i++) {
      if (!tous[i].disabled && tous[i].offsetParent !== null) out.push(tous[i]);
    }
    return out;
  }

  function ouvrir() {
    if (!panneau.hidden) { saisie.focus(); return; }
    dernierFocus = doc.activeElement;
    panneau.hidden = false;
    bouton.setAttribute('aria-expanded', 'true');
    doc.body.classList.add('assistant-ouvert');
    panneau.setAttribute('aria-modal', enFeuille() ? 'true' : 'false');
    /* Le fil n’est reconstruit que s’il est vide : refermer puis rouvrir pendant une réponse
       ne doit pas effacer ce qui est en train de s’écrire. */
    if (!fil.firstChild) rendreTout();
    verifierServeur();
    window.setTimeout(function () { saisie.focus(); }, 60);
  }

  function fermer() {
    if (panneau.hidden) return;
    panneau.hidden = true;
    bouton.setAttribute('aria-expanded', 'false');
    doc.body.classList.remove('assistant-ouvert');
    var cible = (dernierFocus && dernierFocus.focus && dernierFocus !== doc.body
      && doc.contains(dernierFocus) && !panneau.contains(dernierFocus)) ? dernierFocus : bouton;
    dernierFocus = null;
    try { cible.focus(); } catch (e) { bouton.focus(); }
  }

  function basculer() { if (panneau.hidden) ouvrir(); else fermer(); }

  bouton.addEventListener('click', basculer);
  fermeture.addEventListener('click', fermer);
  effacer.addEventListener('click', function () {
    historique = [];
    ecrireMemoire();
    rendreTout();
    dire('Conversation effacée.');
    saisie.focus();
  });

  doc.addEventListener('keydown', function (e) {
    if (panneau.hidden) return;
    if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); fermer(); return; }
    /* En pleine page sur petit écran, le panneau se comporte comme une boîte de dialogue : on y garde le focus. */
    if ((e.key === 'Tab' || e.keyCode === 9) && enFeuille()) {
      var liste = focusables();
      if (!liste.length) return;
      var premier = liste[0], dernier = liste[liste.length - 1];
      if (!panneau.contains(doc.activeElement)) { e.preventDefault(); premier.focus(); return; }
      if (e.shiftKey && doc.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && doc.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    }
  });

  /* ------------------------------------------------------------------ état du serveur */

  function verifierServeur() {
    if (serveurVerifie) return;
    serveurVerifie = true;
    if (!window.fetch) {
      informer('Votre navigateur ne permet pas de dialoguer avec l’assistant. Écrivez à l’équipe, '
        + 'dont l’adresse figure en pied de page.');
      return;
    }
    window.fetch('/api/health', { cache: 'no-store' }).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (!j || !j.configured) {
        informer('L’assistant n’est pas encore activé sur ce site. Le reste du site fonctionne, '
          + 'et l’équipe vous répond par courrier électronique.');
      }
    })['catch'](function () { informer(HORS_SERVICE); });
  }

  /* ------------------------------------------------------------------ étapes d’outil */

  function libelleEtape(ev) {
    var base = ETATS[ev.etape] || 'Je travaille';
    var a = ev.args || {};
    if (ev.etape === 'recherche' && a.recherche) return base + ' de « ' + a.recherche + NB + '»';
    if (ev.etape === 'calcul' && a.poste) {
      return base + ' (' + String(a.poste).replace(/_/g, ' ') + (a.formule ? ', ' + a.formule : '') + ')';
    }
    if (ev.etape === 'cotisation' && a.age) {
      return base + ' (' + a.age + ' ans'
        + (Number(a.adultes) === 2 ? ', couple' : '')
        + (a.enfants ? ', ' + a.enfants + ' enfant' + (Number(a.enfants) > 1 ? 's' : '') : '') + ')';
    }
    return base;
  }

  function indicateur() {
    var d = doc.createElement('div');
    d.className = 'assistant__m assistant__m--lui assistant__m--attente';
    d.innerHTML = '<span class="assistant__pts" aria-hidden="true"><i></i><i></i><i></i></span>'
      + '<span class="assistant__etat">' + ETATS.reflexion + '</span>'
      + '<ul class="assistant__journal"></ul>';
    fil.appendChild(d);
    auBas();
    return d;
  }

  function majEtat(ind, ev) {
    var etat = ind.querySelector('.assistant__etat');
    var journal = ind.querySelector('.assistant__journal');
    var precedent = etat.textContent;
    var libelle = libelleEtape(ev);
    if (libelle === precedent) return;
    if (precedent && precedent !== ETATS.reflexion && precedent !== ETATS.redaction) {
      var li = doc.createElement('li');
      li.textContent = precedent;
      journal.appendChild(li);
    }
    etat.textContent = libelle;
    auBas();
  }

  /* ------------------------------------------------------------------ lecture du flux */

  function lireFlux(reponse, ind) {
    var lecteur = reponse.body.getReader();
    var dec = new TextDecoder();
    var tampon = '', texte = '', bulleTexte = null, fini = false;

    function retirerIndicateur() { if (ind.parentNode) ind.parentNode.removeChild(ind); }

    function poserTexte(final) {
      if (!bulleTexte) return;
      bulleTexte.innerHTML = formater(texte) + (final ? '' : '<span class="assistant__curseur" aria-hidden="true"></span>');
      if (final) bulleTexte.className = 'assistant__m assistant__m--lui';
      auBas();
    }

    function conserver() {
      historique.push({ role: 'assistant', content: texte });
      ecrireMemoire();
      effacer.hidden = false;
      dire(texte);
    }

    function traiter(ev) {
      if (ev.etape && !bulleTexte) majEtat(ind, ev);
      if (ev.texte) {
        if (!bulleTexte) {
          retirerIndicateur();
          bulleTexte = bulle('assistant', '', 'assistant__m--flux');
        }
        texte += ev.texte;
        poserTexte(false);
      }
      if (ev.erreur) {
        retirerIndicateur();
        informer(publiable(ev.erreur, GENERIQUE));
      }
      if (ev.reply && !texte) {
        texte = ev.reply;
        retirerIndicateur();
        bulleTexte = bulle('assistant', texte);
      }
      if (ev.fin) {
        fini = true;
        poserTexte(true);
        retirerIndicateur();
        if (texte) conserver();
      }
    }

    function pompe() {
      return lecteur.read().then(function (r) {
        if (r.done) {
          if (!fini) {
            retirerIndicateur();
            if (texte) { poserTexte(true); conserver(); }
            else { informer('La réponse s’est interrompue avant d’arriver. Posez de nouveau votre question.'); }
          }
          return;
        }
        tampon += dec.decode(r.value, { stream: true });
        var blocs = tampon.split('\n\n');
        tampon = blocs.pop();
        for (var i = 0; i < blocs.length; i++) {
          var lignes = blocs[i].split('\n'), charge = '';
          for (var j = 0; j < lignes.length; j++) {
            if (lignes[j].indexOf('data:') === 0) charge += lignes[j].slice(5).replace(/^\s/, '');
          }
          if (!charge) continue;
          try { traiter(JSON.parse(charge)); } catch (e) { /* morceau incomplet ou commentaire */ }
        }
        return pompe();
      });
    }
    return pompe();
  }

  /* ------------------------------------------------------------------ envoi */

  /* Le serveur écrit ses messages pour la personne qui l’exploite, et certains nomment le modèle,
     la clé ou le fichier de configuration. Ceux-là ne sont jamais montrés au visiteur. */
  var INTERNE = /gemini|api[_\s-]?key|\.env|quota|clé|jeton|token|relanc/i;
  var GENERIQUE = 'Je n’ai pas pu répondre pour l’instant. Réessayez dans un moment, ou écrivez à l’équipe, '
    + 'dont l’adresse figure en pied de page.';

  function publiable(message, secours) {
    if (!message || INTERNE.test(message)) return secours;
    return message;
  }

  function messageErreur(statut, corps) {
    var secours = GENERIQUE;
    if (statut === 429) secours = 'Vous avez posé beaucoup de questions en peu de temps. Patientez quelques minutes, puis reprenez.';
    else if (statut === 503) secours = 'L’assistant n’est pas encore activé sur ce site. Le reste du site fonctionne, '
      + 'et l’équipe vous répond par courrier électronique.';
    else if (statut === 400) secours = 'Je n’ai pas compris votre question. Reformulez-la en une phrase.';
    return publiable(corps && corps.message, secours);
  }

  function lireCorps(r) {
    return r.text().then(function (t) {
      try { return JSON.parse(t); } catch (e) { return null; }
    })['catch'](function () { return null; });
  }

  function poser(question) {
    question = String(question || '').replace(/^\s+|\s+$/g, '');
    if (!question || enCours) return;
    if (panneau.hidden) ouvrir();
    if (!window.fetch) { verifierServeur(); return; }

    historique.push({ role: 'user', content: question });
    ecrireMemoire();
    bulle('user', question);
    sugg.innerHTML = '';
    sugg.hidden = true;
    effacer.hidden = false;
    saisie.value = '';
    ajusterHauteur();

    var ind = indicateur();
    enCours = true;
    envoyer.disabled = true;
    panneau.setAttribute('aria-busy', 'true');

    function fin() {
      enCours = false;
      envoyer.disabled = false;
      panneau.removeAttribute('aria-busy');
      if (!panneau.hidden && !enFeuille()) saisie.focus();
    }
    function echouer(texte) {
      if (ind.parentNode) ind.parentNode.removeChild(ind);
      informer(texte);
    }

    window.fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({ messages: historique.slice(-TOURS) })
    }).then(function (r) {
      var type = r.headers.get('content-type') || '';
      /* Le serveur diffuse la réponse quand il le peut ; sinon (429, 503, 400) il renvoie du JSON. */
      if (r.ok && type.indexOf('text/event-stream') >= 0 && r.body && r.body.getReader) {
        return lireFlux(r, ind).then(fin, function () {
          echouer('La réponse s’est interrompue. Posez de nouveau votre question.');
          fin();
        });
      }
      return lireCorps(r).then(function (j) {
        if (ind.parentNode) ind.parentNode.removeChild(ind);
        if (r.ok && j && j.reply) {
          historique.push({ role: 'assistant', content: j.reply });
          ecrireMemoire();
          bulle('assistant', j.reply);
          dire(j.reply);
        } else {
          echouer(messageErreur(r.status, j));
        }
        fin();
      });
    })['catch'](function () {
      echouer(HORS_SERVICE);
      fin();
    });
  }

  function ajusterHauteur() {
    saisie.style.height = 'auto';
    saisie.style.height = Math.min(saisie.scrollHeight, 132) + 'px';
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); poser(saisie.value); });
  saisie.addEventListener('input', ajusterHauteur);
  saisie.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) { e.preventDefault(); poser(saisie.value); }
  });

  /* ------------------------------------------------------------------ points d’entrée depuis les pages */

  function brancher() {
    var ouvrants = doc.querySelectorAll('[data-assistant-open]');
    var demandeurs = doc.querySelectorAll('[data-assistant-ask]');
    var i;
    for (i = 0; i < ouvrants.length; i++) {
      if (ouvrants[i].getAttribute('data-branche')) continue;
      ouvrants[i].setAttribute('data-branche', '1');
      ouvrants[i].addEventListener('click', function (e) { e.preventDefault(); ouvrir(); });
    }
    for (i = 0; i < demandeurs.length; i++) {
      if (demandeurs[i].getAttribute('data-branche')) continue;
      demandeurs[i].setAttribute('data-branche', '1');
      demandeurs[i].addEventListener('click', function (e) {
        e.preventDefault();
        poser(this.getAttribute('data-assistant-ask') || this.textContent);
      });
    }
  }
  brancher();

  window.ALPICARE_ASSISTANT = {
    ouvrir: ouvrir,
    fermer: fermer,
    poser: poser,
    brancher: brancher,
    effacer: function () { historique = []; ecrireMemoire(); rendreTout(); }
  };
})();
