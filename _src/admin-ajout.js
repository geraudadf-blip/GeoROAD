/* ===================================================================
 * GeoROAD TOGO — Module AJOUT (Point d'entrée unique de création)
 *
 * Ce module est l'interface d'accueil du workflow de création.
 * L'administrateur choisit le type d'objet à créer via des cartes.
 *
 * Objets disponibles :
 *   - Ajouter une route          → ouvre l'éditeur SIG cartographique
 *   - Ajouter un point kilométrique → formulaire CRUD
 *   - Ajouter une emprise         → formulaire CRUD
 *
 * Le module AJOUT est réservé exclusivement à l'administrateur.
 * Le public n'y a jamais accès.
 *
 * Dépend : AdminUI (navigation), AdminAuth (vérification session)
 * =================================================================== */
var AjoutModule = (function() {
  'use strict';

  /* ===== CARTE DE CRÉATION ===== */
  var creationCards = [
    {
      id: 'route',
      icon: 'fa-road',
      iconColor: '#C8A64B',
      title: 'Ajouter une route',
      description: 'Dessinez une nouvelle route directement sur la carte avec l\u2019\u00e9diteur SIG. Tracez librement la g\u00e9om\u00e9trie, validez, puis remplissez les attributs (nom, code, cat\u00e9gorie, r\u00e9gion, \u00e9tat, rev\u00eatement, etc.).',
      action: 'openRouteEditor',
      enabled: true,
      badge: 'SIG',
      badgeColor: '#C8A64B'
    },
    {
      id: 'pk',
      icon: 'fa-map-pin',
      iconColor: '#4a9eff',
      title: 'Ajouter un point kilom\u00e9trique',
      description: 'Placez un point de r\u00e9f\u00e9rence (PK) le long d\u2019une route existante. Les PK servent de rep\u00e8res pour la signalisation et les interventions d\u2019entretien.',
      action: 'openPKCreator',
      enabled: true,
      badge: 'CRUD',
      badgeColor: '#4a9eff'
    },
    {
      id: 'emprise',
      icon: 'fa-vector-square',
      iconColor: '#2ed573',
      title: 'Ajouter une emprise',
      description: 'Cr\u00e9ez une zone d\u2019emprise du domaine public routier. Les emprises d\u00e9limitent la largeur de terrain n\u00e9cessaire \u00e0 la construction et \u00e0 l\u2019entretien des routes.',
      action: 'openEmpriseCreator',
      enabled: true,
      badge: 'CRUD',
      badgeColor: '#2ed573'
    }
  ];

  /* ===================================================================
   * RENDU PRINCIPAL
   * =================================================================== */

  /**
   * Génère le HTML complet de la page AJOUT.
   * @returns {string} HTML injecté dans #adminContent
   */
  function render() {
    var html = '';

    /* En-tête de page */
    html += '<div class="page-header">';
    html += '<h1><i class="fas fa-plus-circle" style="color:var(--gold);margin-right:8px"></i>AJOUT</h1>';
    html += '<p>Point d\u2019entr\u00e9e unique de cr\u00e9ation des donn\u00e9es du syst\u00e8me. Choisissez le type d\u2019objet \u00e0 cr\u00e9er.</p>';
    html += '</div>';

    /* Bande d'information */
    html += '<div style="background:var(--gold-pale);border:1px solid rgba(200,166,75,.25);border-radius:12px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">';
    html += '<i class="fas fa-info-circle" style="color:var(--gold-dark);font-size:1.1rem;flex-shrink:0"></i>';
    html += '<div style="font-size:.84rem;color:var(--text-2);line-height:1.5">';
    html += 'Toute cr\u00e9ation passe obligatoirement par le moteur SIG : <strong>SIGDataEngine</strong> → <strong>SIGSpatialCalculator</strong> → <strong>SIGEventBus</strong> → <strong>SIGAuditTrail</strong> → <strong>SIGPersistence</strong>. Aucune modification directe des donn\u00e9es.';
    html += '</div></div>';

    /* Grille de cartes */
    html += '<div class="ajout-grid">';

    creationCards.forEach(function(card) {
      html += renderCard(card);
    });

    html += '</div>';

    /* Section workflow */
    html += renderWorkflowSection();

    return html;
  }

  /* ===================================================================
   * CARTE INDIVIDUELLE
   * =================================================================== */

  function renderCard(card) {
    var disabledClass = card.enabled ? '' : 'ajout-card-disabled';
    var cursorStyle = card.enabled ? 'cursor:pointer' : 'cursor:not-allowed;opacity:.55';
    var onclickAttr = card.enabled ? ' onclick="AjoutModule.handleCardClick(\'' + card.id + '\')"' : '';

    var html = '<div class="ajout-card ' + disabledClass + '" ' + onclickAttr + ' style="' + cursorStyle + '">';

    /* Icône et badge */
    html += '<div class="ajout-card-icon" style="background:' + card.iconColor + '15;color:' + card.iconColor + '">';
    html += '<i class="fas ' + card.icon + '"></i>';
    html += '</div>';

    if (card.badge) {
      html += '<span class="ajout-card-badge" style="background:' + card.badgeColor + ';color:#fff">' + card.badge + '</span>';
    }

    /* Contenu */
    html += '<div class="ajout-card-content">';
    html += '<h3>' + card.title + '</h3>';
    html += '<p>' + card.description + '</p>';
    html += '</div>';

    /* Flèche */
    if (card.enabled) {
      html += '<div class="ajout-card-arrow"><i class="fas fa-chevron-right"></i></div>';
    }

    html += '</div>';
    return html;
  }

  /* ===================================================================
   * SECTION WORKFLOW
   * =================================================================== */

  function renderWorkflowSection() {
    var html = '';
    html += '<div class="admin-panel" style="margin-top:24px">';
    html += '<div class="panel-header"><h3><i class="fas fa-sitemap" style="color:var(--gold);margin-right:6px"></i> Workflow de cr\u00e9ation d\u2019une route</h3></div>';
    html += '<div class="panel-body">';

    html += '<div class="ajout-workflow">';

    var steps = [
      { icon: 'fa-mouse-pointer', label: 'S\u00e9lection', desc: 'Cliquer sur \u00ab Ajouter une route \u00bb' },
      { icon: 'fa-draw-polygon', label: 'Dessin SIG', desc: 'Tracer librement la route sur la carte' },
      { icon: 'fa-check-double', label: 'Validation', desc: 'Double-clic, Entr\u00e9e ou bouton Terminer' },
      { icon: 'fa-file-pen', label: 'Attributs', desc: 'Remplir le formulaire complet' },
      { icon: 'fa-floppy-disk', label: 'Enregistrement', desc: 'Passage par SIGDataEngine' },
      { icon: 'fa-arrows-rotate', label: 'Synchronisation', desc: 'Mise \u00e0 jour automatique globale' }
    ];

    steps.forEach(function(step, i) {
      html += '<div class="ajout-wf-step">';
      html += '<div class="ajout-wf-num">' + (i + 1) + '</div>';
      html += '<div class="ajout-wf-icon"><i class="fas ' + step.icon + '"></i></div>';
      html += '<div class="ajout-wf-label">' + step.label + '</div>';
      html += '<div class="ajout-wf-desc">' + step.desc + '</div>';
      html += '</div>';
      if (i < steps.length - 1) {
        html += '<div class="ajout-wf-arrow"><i class="fas fa-arrow-right"></i></div>';
      }
    });

    html += '</div>'; /* fin ajout-workflow */
    html += '</div></div>';

    return html;
  }

  /* ===================================================================
   * ACTIONS
   * =================================================================== */

  /**
   * Gère le clic sur une carte de création.
   * @param {string} cardId - Identifiant de la carte
   */
  function handleCardClick(cardId) {
    switch (cardId) {
      case 'route':
        openRouteEditor();
        break;
      case 'pk':
        openPKCreator();
        break;
      case 'emprise':
        openEmpriseCreator();
        break;
    }
  }

  function openRouteEditor() {
    /* Audit trail */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log('AJOUT_OPEN_ROUTE_EDITOR', 'admin-ajout', 'Ouverture de l\u2019\u00e9diteur SIG depuis le module AJOUT');
    }
    window.location.href = 'admin-route-editor.html';
  }

  function openPKCreator() {
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log('AJOUT_OPEN_PK_CREATOR', 'admin-ajout', 'Ouverture du formulaire PK depuis le module AJOUT');
    }
    if (typeof AdminUI !== 'undefined') {
      AdminUI.navigate('pk');
      setTimeout(function() {
        if (typeof PKModule !== 'undefined' && typeof PKModule.openCreateModal === 'function') {
          PKModule.openCreateModal();
        }
      }, 150);
    }
  }

  function openEmpriseCreator() {
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log('AJOUT_OPEN_EMPRISE_CREATOR', 'admin-ajout', 'Ouverture du formulaire emprise depuis le module AJOUT');
    }
    if (typeof AdminUI !== 'undefined') {
      AdminUI.navigate('emprises');
      setTimeout(function() {
        if (typeof EmpriseModule !== 'undefined' && typeof EmpriseModule.openAddModal === 'function') {
          EmpriseModule.openAddModal();
        }
      }, 150);
    }
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render,
    handleCardClick: handleCardClick
  };
})();