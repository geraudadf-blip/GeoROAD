/* ==== BEGIN admin-notifications.js ==== */
/* ===================================================================
 * GeoROAD TOGO â€” Centre de Notifications (V4.0)
 *
 * SystÃ¨me de notifications en temps rÃ©el pour l'administration.
 * Chaque action importante (crÃ©ation, modification, suppression,
 * import, export, erreur, synchronisation) gÃ©nÃ¨re une notification.
 *
 * Les notifications sont stockÃ©es en sessionStorage (limitÃ©es Ã  100),
 * avec un compteur automatique et la possibilitÃ© de les marquer comme lues.
 *
 * DÃ©pend : SIGEventBus, SIGAuditTrail (optionnel)
 * =================================================================== */
var NotificationCenter = (function() {
  'use strict';

  var STORAGE_KEY = 'georoad_notifications';
  var MAX_NOTIFICATIONS = 100;
  var _panelOpen = false;

  /* ===== TYPES D'ACTIONS â†’ ICÃ”NES ET COULEURS ===== */
  var ACTION_CONFIG = {
    'create':    { icon: 'fa-plus-circle',       color: '#7A8B6F', label: 'CrÃ©ation' },
    'update':    { icon: 'fa-pen',               color: '#4A7FB5', label: 'Modification' },
    'delete':    { icon: 'fa-trash',             color: '#B85C38', label: 'Suppression' },
    'import':    { icon: 'fa-file-import',       color: '#C8A64B', label: 'Import' },
    'export':    { icon: 'fa-file-export',       color: '#C8A64B', label: 'Export' },
    'error':     { icon: 'fa-exclamation-circle', color: '#B85C38', label: 'Erreur' },
    'sync':      { icon: 'fa-arrows-rotate',     color: '#4A7FB5', label: 'Synchronisation' },
    'info':      { icon: 'fa-info-circle',        color: '#8B8578', label: 'Information' },
    'geometry':  { icon: 'fa-draw-polygon',       color: '#A68A3A', label: 'GÃ©omÃ©trie' },
    'audit':     { icon: 'fa-clipboard-list',     color: '#8B8578', label: 'Audit' }
  };

  /* ===== STOCKAGE ===== */

  function _load() {
    try {
      var data = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      return Array.isArray(data) ? data : [];
    } catch(e) { return []; }
  }

  function _save(notifs) {
    /* Garder seulement les MAX_NOTIFICATIONS plus rÃ©centes */
    if (notifs.length > MAX_NOTIFICATIONS) {
      notifs = notifs.slice(notifs.length - MAX_NOTIFICATIONS);
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifs));
    } catch(e) {
      /* sessionStorage plein â€” purger les 20 plus anciennes */
      notifs = notifs.slice(20);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifs)); } catch(e2) {}
    }
    _updateBadge();
  }

  /* ===== CRÃ‰ATION DE NOTIFICATION ===== */

  /**
   * Ajoute une notification.
   * @param {string} type - Type d'action (create, update, delete, import, export, error, sync, info)
   * @param {string} message - Message descriptif
   * @param {Object} [details] - DÃ©tails supplÃ©mentaires (optionnel, affichÃ©s au survol)
   */
  function add(type, message, details) {
    var config = ACTION_CONFIG[type] || ACTION_CONFIG['info'];
    var notif = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: type,
      icon: config.icon,
      color: config.color,
      label: config.label,
      message: message,
      details: details || null,
      timestamp: new Date().toISOString(),
      read: false
    };

    var notifs = _load();
    notifs.push(notif);
    _save(notifs);
  }

  /* ===== LECTURE ===== */

  function getAll() {
    return _load();
  }

  function getUnreadCount() {
    return _load().filter(function(n) { return !n.read; }).length;
  }

  function getRecent(max) {
    var notifs = _load().reverse();
    return max ? notifs.slice(0, max) : notifs;
  }

  /* ===== MARQUER COMME LU ===== */

  function markAsRead(notifId) {
    var notifs = _load();
    for (var i = 0; i < notifs.length; i++) {
      if (notifs[i].id === notifId) {
        notifs[i].read = true;
        break;
      }
    }
    _save(notifs);
  }

  function markAllAsRead() {
    var notifs = _load();
    for (var i = 0; i < notifs.length; i++) {
      notifs[i].read = true;
    }
    _save(notifs);
    _renderPanel();
  }

  /* ===== SUPPRIMER ===== */

  function clearAll() {
    _save([]);
    _renderPanel();
  }

  function deleteNotification(notifId) {
    var notifs = _load();
    notifs = notifs.filter(function(n) { return n.id !== notifId; });
    _save(notifs);
    _renderPanel();
  }

  /* ===== BADGE COMPTEUR ===== */

  function _updateBadge() {
    var count = getUnreadCount();
    var badge = document.getElementById('notif-badge-count');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
    /* Mettre Ã  jour le dot si pas de badge numÃ©rique */
    var dot = document.querySelector('.badge-dot');
    if (dot && !badge) {
      dot.style.display = count > 0 ? 'block' : 'none';
    }
  }

  /* ===== RENDU DU PANNEAU ===== */

  function togglePanel() {
    _panelOpen = !_panelOpen;
    var panel = document.getElementById('notif-panel');
    if (!panel) {
      _createPanel();
      panel = document.getElementById('notif-panel');
    }
    panel.classList.toggle('show', _panelOpen);
    if (_panelOpen) {
      _renderPanel();
    }
  }

  function closePanel() {
    _panelOpen = false;
    var panel = document.getElementById('notif-panel');
    if (panel) panel.classList.remove('show');
  }

  function _createPanel() {
    /* CrÃ©er le panneau de notifications dans la topbar */
    var topbarActions = document.querySelector('.topbar-actions');
    if (!topbarActions) return;

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative';
    wrapper.innerHTML = ''
      + '<button class="topbar-btn" title="Notifications" onclick="NotificationCenter.togglePanel()" style="position:relative">'
      + '<i class="fas fa-bell"></i>'
      + '<span id="notif-badge-count" style="position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;background:var(--red,#B85C38);color:#fff;font-size:.6rem;font-weight:700;border-radius:8px;display:none;align-items:center;justify-content:center;padding:0 4px"></span>'
      + '</button>'
      + '<div id="notif-panel" style="position:absolute;top:calc(100% + 8px);right:0;width:380px;max-height:480px;background:var(--white);border:1px solid var(--cream-border);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.12);z-index:9999;display:none;flex-direction:column;overflow:hidden">'
      + '</div>';

    /* Remplacer l'ancien bouton notification */
    var oldBtn = topbarActions.querySelector('button[title="Notifications"]');
    if (oldBtn) {
      oldBtn.parentNode.replaceChild(wrapper, oldBtn);
    } else {
      topbarActions.appendChild(wrapper);
    }

    /* Fermer le panneau en cliquant ailleurs â€” guard anti-doublon */
    if (!NotificationCenter._outsideClickBound) {
      NotificationCenter._outsideClickBound = true;
      document.addEventListener('click', function(e) {
        if (_panelOpen && !e.target.closest('#notif-panel') && !e.target.closest('.topbar-btn[title="Notifications"]')) {
          closePanel();
        }
      });
    }
  }

  function _renderPanel() {
    var panel = document.getElementById('notif-panel');
    if (!panel) return;

    var notifs = _load().reverse(); /* Plus rÃ©centes en premier */
    var unreadCount = notifs.filter(function(n) { return !n.read; }).length;

    var html = '';

    /* Header */
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--cream-border)">'
      + '<h3 style="font-size:.88rem;font-weight:700;margin:0"><i class="fas fa-bell" style="color:var(--gold);margin-right:6px"></i> Notifications'
      + (unreadCount > 0 ? ' <span style="font-size:.72rem;color:var(--text-3);font-weight:400">(' + unreadCount + ' non lue' + (unreadCount > 1 ? 's' : '') + ')</span>' : '')
      + '</h3>'
      + '<div style="display:flex;gap:6px">';
    if (notifs.length > 0) {
      html += '<button onclick="NotificationCenter.markAllAsRead()" style="background:none;border:none;cursor:pointer;font-size:.72rem;color:var(--text-3);padding:4px 8px;border-radius:4px;font-family:Outfit,sans-serif;transition:all .15s" onmouseover="this.style.background=\'var(--cream-2)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-check-double"></i> Tout lire</button>';
      html += '<button onclick="NotificationCenter.clearAll()" style="background:none;border:none;cursor:pointer;font-size:.72rem;color:var(--text-3);padding:4px 8px;border-radius:4px;font-family:Outfit,sans-serif;transition:all .15s" onmouseover="this.style.background=\'var(--cream-2)\'" onmouseout="this.style.background=\'none\'"><i class="fas fa-trash"></i></button>';
    }
    html += '</div></div>';

    /* Liste des notifications */
    html += '<div style="flex:1;overflow-y:auto;padding:4px 0">';

    if (notifs.length === 0) {
      html += '<div style="text-align:center;padding:40px 20px;color:var(--text-3)">'
        + '<i class="fas fa-bell-slash" style="font-size:1.5rem;margin-bottom:8px;display:block;opacity:.4"></i>'
        + '<p style="font-size:.82rem;margin:0">Aucune notification</p>'
        + '</div>';
    } else {
      notifs.forEach(function(n) {
        var timeStr = _formatTime(n.timestamp);
        var opacity = n.read ? 'opacity:.55;' : '';
        var bgHover = n.read ? '' : 'background:var(--gold-pale);';
        html += '<div class="notif-item" style="display:flex;gap:10px;padding:10px 16px;cursor:pointer;transition:background .15s;border-left:3px solid transparent;' + opacity + '" '
          + 'onclick="NotificationCenter.markAsRead(\'' + n.id + '\');NotificationCenter._renderPanel()" '
          + 'onmouseover="if(!' + n.read + ')this.style.background=\'var(--cream-2)\';this.style.borderLeftColor=\'' + n.color + '\'" '
          + 'onmouseout="this.style.background=\'transparent\';this.style.borderLeftColor=\'transparent\'">'
          + '<div style="width:28px;height:28px;border-radius:50%;background:' + n.color + '15;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">'
          + '<i class="fas ' + n.icon + '" style="font-size:.7rem;color:' + n.color + '"></i></div>'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:.78rem;font-weight:' + (n.read ? '400' : '600') + ';color:var(--text);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(n.message) + '</div>'
          + '<div style="font-size:.68rem;color:var(--text-3);margin-top:2px">' + n.label + ' â€” ' + timeStr + '</div>'
          + '</div>'
          + '<button onclick="event.stopPropagation();NotificationCenter.deleteNotification(\'' + n.id + '\')" '
          + 'style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:.7rem;padding:4px;flex-shrink:0;margin-top:2px;border-radius:4px;transition:all .15s;line-height:1" '
          + 'onmouseover="this.style.color=\'var(--red,#B85C38)\';this.style.background=\'var(--cream-2)\'" '
          + 'onmouseout="this.style.color=\'var(--text-3)\';this.style.background=\'none\'" '
          + 'title="Supprimer cette notification">'
          + '<i class="fas fa-times"></i></button>'
          + (!n.read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--gold);flex-shrink:0;margin-top:6px"></div>' : '')
          + '</div>';
      });
    }

    html += '</div>';

    panel.innerHTML = html;
    panel.style.display = _panelOpen ? 'flex' : 'none';
  }

  /* ===== UTILITAIRES ===== */

  function _formatTime(isoStr) {
    try {
      var d = new Date(isoStr);
      var now = new Date();
      var diff = now - d;

      if (diff < 60000) return 'Ã€ l\'instant';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' min';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' h';
      if (diff < 604800000) return Math.floor(diff / 86400000) + ' j';
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch(e) { return ''; }
  }

  function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ===== HOOK SIG EVENT BUS ===== */

  /**
   * Connecte le centre de notifications au SIGEventBus.
   * Appeler cette fonction une fois Ã  l'initialisation de l'admin.
   */
  function hookEventBus() {
    if (typeof SIGEventBus === 'undefined') return;

    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, function(data) {
      var name = (data.feature && data.feature.properties && data.feature.properties.Name) || 'Route';
      add('create', name + ' crÃ©Ã©e avec succÃ¨s', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, function(data) {
      var name = (data.feature && data.feature.properties && data.feature.properties.Name) || 'Route';
      add('update', name + ' modifiÃ©e', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      add('delete', 'Ã‰lÃ©ment supprimÃ© (' + (data.featureId || 'ID inconnu') + ')', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.GEOMETRY_UPDATED, function(data) {
      var name = (data.feature && data.feature.properties && data.feature.properties.Name) || 'Route';
      add('geometry', 'GÃ©omÃ©trie de ' + name + ' modifiÃ©e', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.DASHBOARD_REFRESH, function() {
      add('sync', 'Tableau de bord mis Ã  jour', null);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.PERSISTENCE_SAVED, function(data) {
      add('sync', 'DonnÃ©es synchronisÃ©es', data || null);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.STATS_CHANGED, function(data) {
      add('info', 'Statistiques mises Ã  jour', data || null);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.AUDIT_LOGGED, function(data) {
      var label = (data && data.details) || (data && data.action) || 'Action auditÃ©e';
      var detailParts = [];
      if (data && data.featureName) detailParts.push(data.featureName);
      if (data && data.featureId) detailParts.push('ID: ' + data.featureId);
      add('audit', label, { action: data && data.action, summary: detailParts.join(' â€” ') || null });
    });
  }

  /* ===== INITIALISATION ===== */

  function init() {
    /* Remplacer le bouton notification existant */
    setTimeout(function() {
      _createPanel();
      _updateBadge();
      hookEventBus();
    }, 100);
  }

  /* ===== API PUBLIQUE ===== */
  return {
    add: add,
    getAll: getAll,
    getUnreadCount: getUnreadCount,
    getRecent: getRecent,
    markAsRead: markAsRead,
    markAllAsRead: markAllAsRead,
    deleteNotification: deleteNotification,
    clearAll: clearAll,
    togglePanel: togglePanel,
    closePanel: closePanel,
    hookEventBus: hookEventBus,
    init: init,
    /* ExposÃ© pour le onclick inline du panneau */
    _renderPanel: _renderPanel
  };
})();
/* ==== END admin-notifications.js ==== */

/* ==== BEGIN admin-ajout.js ==== */
/* ===================================================================
 * GeoROAD TOGO â€” Module AJOUT (Point d'entrÃ©e unique de crÃ©ation)
 *
 * Ce module est l'interface d'accueil du workflow de crÃ©ation.
 * L'administrateur choisit le type d'objet Ã  crÃ©er via des cartes.
 *
 * Objets disponibles :
 *   - Ajouter une route          â†’ ouvre l'Ã©diteur SIG cartographique
 *   - Ajouter un point kilomÃ©trique â†’ formulaire CRUD
 *   - Ajouter une emprise         â†’ formulaire CRUD
 *
 * Le module AJOUT est rÃ©servÃ© exclusivement Ã  l'administrateur.
 * Le public n'y a jamais accÃ¨s.
 *
 * DÃ©pend : AdminUI (navigation), AdminAuth (vÃ©rification session)
 * =================================================================== */
var AjoutModule = (function() {
  'use strict';

  /* ===== CARTE DE CRÃ‰ATION ===== */
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
   * GÃ©nÃ¨re le HTML complet de la page AJOUT.
   * @returns {string} HTML injectÃ© dans #adminContent
   */
  function render() {
    var html = '';

    /* En-tÃªte de page */
    html += '<div class="page-header">';
    html += '<h1><i class="fas fa-plus-circle" style="color:var(--gold);margin-right:8px"></i>AJOUT</h1>';
    html += '<p>Point d\u2019entr\u00e9e unique de cr\u00e9ation des donn\u00e9es du syst\u00e8me. Choisissez le type d\u2019objet \u00e0 cr\u00e9er.</p>';
    html += '</div>';

    /* Bande d'information */
    html += '<div style="background:var(--gold-pale);border:1px solid rgba(200,166,75,.25);border-radius:12px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">';
    html += '<i class="fas fa-info-circle" style="color:var(--gold-dark);font-size:1.1rem;flex-shrink:0"></i>';
    html += '<div style="font-size:.84rem;color:var(--text-2);line-height:1.5">';
    html += 'Toute cr\u00e9ation passe obligatoirement par le moteur SIG : <strong>SIGDataEngine</strong> â†’ <strong>SIGSpatialCalculator</strong> â†’ <strong>SIGEventBus</strong> â†’ <strong>SIGAuditTrail</strong> â†’ <strong>SIGPersistence</strong>. Aucune modification directe des donn\u00e9es.';
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

    /* IcÃ´ne et badge */
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

    /* FlÃ¨che */
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
   * GÃ¨re le clic sur une carte de crÃ©ation.
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
/* ==== END admin-ajout.js ==== */

/* ==== BEGIN admin.js ==== */
/* ===================================================================
 * GeoROAD TOGO â€” Module d'Administration
 * 
 * Architecture modulaire prÃ©parÃ©e pour l'Ã©volution vers :
 * - Backend REST API (Node.js/Express ou Python/FastAPI)
 * - PostgreSQL/PostGIS pour le stockage spatial
 * - JWT pour l'authentification
 * - RBAC pour les permissions
 * - Audit trail pour l'historique des modifications
 * - Import GPX/Shapefile/GeoJSON
 * - Ã‰dition cartographique (OpenLayers)
 * 
 * Convention de code :
 * - Modules exposÃ©s sur window (pas d'ESM pour compatibilitÃ© locale)
 * - Pattern IIFE pour l'isolation
 * - Documentation JSDoc sur chaque fonction publique
 * =================================================================== */

/* -------------------------------------------------------------------
 * MODULE : AdminAuth
 * Gestion de l'authentification et de la session.
 * Actuellement : sessionStorage cÃ´tÃ© client.
 * Futur : JWT HTTP-only + refresh token via API.
 * ------------------------------------------------------------------- */
var AdminAuth = (function() {
  'use strict';

  var SESSION_KEY = 'georoad_auth';

  function isAdminRole(role) {
    return String(role || '').toLowerCase() === 'administrateur';
  }

  /** VÃ©rifie si l'utilisateur est authentifiÃ©. */
  function isAuthenticated() {
    try {
      var s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      return s && s.authenticated === true && isAdminRole(s.role);
    } catch(e) { return false; }
  }

  /** Retourne les infos de la session courante ou null. */
  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch(e) { return null; }
  }

  /** DÃ©truit la session et redirige vers la page de connexion. */
  function logout() {
    var session = getSession();
    if (session && typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.LOGOUT, {
          user: session.name || session.user || 'Administrateur',
          featureId: session.userId ? String(session.userId) : null,
          featureName: session.user || session.name || 'Administrateur',
          details: 'DÃ©connexion de l\'administration',
          result: 'SUCCESS',
          entityType: 'user'
        });
      } catch(e) {}
    }
    if (session && session.userId && typeof UserAdmin !== 'undefined' && typeof UserAdmin.recordActivity === 'function') {
      try { UserAdmin.recordActivity(session.userId); } catch(e) {}
    }
    sessionStorage.removeItem(SESSION_KEY);
    window.location.href = 'admin-login.html';
  }

  /** Middleware de garde â€” redirige si non authentifiÃ©. */
  function requireAuth() {
    if (!isAuthenticated()) {
      sessionStorage.removeItem(SESSION_KEY);
      window.location.href = 'admin-login.html';
      return false;
    }
    return true;
  }

  return {
    isAuthenticated: isAuthenticated,
    getSession: getSession,
    logout: logout,
    requireAuth: requireAuth
  };
})();


/* -------------------------------------------------------------------
 * MODULE : AdminData
 * Couche d'accÃ¨s aux donnÃ©es.
 * Actuellement : lecture directe des variables globales GeoJSON.
 * Futur : appels fetch() vers l'API REST / PostgreSQL.
 * ------------------------------------------------------------------- */
var AdminData = (function() {
  'use strict';

  /**
   * Calcule des statistiques agrÃ©gÃ©es depuis les donnÃ©es GeoJSON.
   * @returns {Object} Statistiques structurÃ©es pour le dashboard
   */
  function computeDashboardStats() {
    var stats = {
      totalRoutes: 0,
      totalKm: 0,
      byCategory: {},
      byRegion: {},
      byEtat: {},
      byRevetement: {},
      regionFeatures: [],
      empriseCount: 0,
      prefectureCount: 0,
      cantonCount: 0,
      pkCount: 0
    };

    /* Routes */
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      var feats = json_Rseauroutier_6.features || [];
      stats.totalRoutes = feats.length;
      feats.forEach(function(f) {
        var p = f.properties || {};
        var cls = p.CLASSE || 'Inconnu';
        /* Utiliser LONGEUR si disponible, sinon calculer via ol.sphere */
        var lenM = p.LONGEUR || 0;
        if (!lenM && typeof ol !== 'undefined' && ol.sphere && f.geometry) {
          try {
            var fmt = new ol.format.GeoJSON();
            var g = fmt.readGeometry(f.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
            lenM = ol.sphere.getLength(g);
          } catch(e) {}
        }
        var len = (parseFloat(lenM) || 0) / 1000;
        stats.byCategory[cls] = stats.byCategory[cls] || { count: 0, km: 0 };
        stats.byCategory[cls].count++;
        stats.byCategory[cls].km += len;
        stats.totalKm += len;

        var reg = p.REGIONS || 'Non dÃ©fini';
        stats.byRegion[reg] = stats.byRegion[reg] || { count: 0, km: 0 };
        stats.byRegion[reg].count++;
        stats.byRegion[reg].km += len;

        /* PHASE 2 : rÃ©partition par Ã©tat et revÃªtement (depuis les attributs rÃ©els) */
        var etat = p.Etat || 'Non dÃ©fini';
        stats.byEtat[etat] = (stats.byEtat[etat] || 0) + 1;
        var revet = p.Revetement || 'Non dÃ©fini';
        stats.byRevetement[revet] = (stats.byRevetement[revet] || 0) + 1;
      });
    }

    /* Emprises */
    if (typeof json_Emprise_5 !== 'undefined') {
      stats.empriseCount = (json_Emprise_5.features || []).length;
    }

    /* PrÃ©fectures */
    if (typeof json_Prfecture_3 !== 'undefined') {
      stats.prefectureCount = (json_Prfecture_3.features || []).length;
    }

    /* Cantons */
    if (typeof json_Canton_4 !== 'undefined') {
      stats.cantonCount = (json_Canton_4.features || []).length;
    }

    /* RÃ©gions */
    if (typeof json_Rgion_2 !== 'undefined') {
      stats.regionFeatures = json_Rgion_2.features || [];
    }

    /* PK â€” depuis SIGPersistence (PHASE 2) */
    if (typeof SIGPersistence !== 'undefined') {
      try {
        var pkFC = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
        if (pkFC && pkFC.features) stats.pkCount = pkFC.features.length;
      } catch(e) {}
    }

    return stats;
  }

  /**
   * Retourne les donnÃ©es brutes d'une couche GeoJSON.
   * @param {string} layerName - Nom de la variable globale
   * @returns {Object|null} FeatureCollection ou null
   */
  function getLayerData(layerName) {
    var map = {
      'Rseauroutier_6': (typeof window.json_Rseauroutier_6 !== 'undefined') ? window.json_Rseauroutier_6 : null,
      'Emprise_5': (typeof window.json_Emprise_5 !== 'undefined') ? window.json_Emprise_5 : null,
      'Rgion_2': (typeof window.json_Rgion_2 !== 'undefined') ? window.json_Rgion_2 : null,
      'Prfecture_3': (typeof window.json_Prfecture_3 !== 'undefined') ? window.json_Prfecture_3 : null,
      'Canton_4': (typeof window.json_Canton_4 !== 'undefined') ? window.json_Canton_4 : null
    };
    return map[layerName] || null;
  }

  return {
    computeDashboardStats: computeDashboardStats,
    getLayerData: getLayerData
  };
})();


/* -------------------------------------------------------------------
 * MODULE : UserAdmin
 * Gestion complÃ¨te des utilisateurs (CRUD) avec localStorage.
 * ------------------------------------------------------------------- */
var UserAdmin = (function() {
  'use strict';

  var STORAGE_KEY = 'georoad_users';
  var LOGIN_HISTORY_KEY = 'georoad_login_history';
  var ADMIN_USERNAME = 'GeoROAD';
  var ADMIN_NAME = 'GeoROAD';
  var ADMIN_EMAIL = 'admin@georoad.tg';
  var DEFAULT_ADMIN_PASSWORD = 'georoad@2026';
  var LEGACY_ADMIN_PASSWORD = 'georoad2025';
  /* PHASE 8 : uniquement 2 profils autorisÃ©s */
  var ALLOWED_ROLES = ['administrateur', 'utilisateur_public'];
  var DEFAULT_USERS = [
    { id: 1, username: ADMIN_USERNAME, name: ADMIN_NAME, role: 'administrateur', email: ADMIN_EMAIL, password: DEFAULT_ADMIN_PASSWORD, status: 'actif', mustChangePassword: false, lastLogin: null, lastActivity: null, createdAt: '2025-01-01' }
  ];

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cloneUsers(users) {
    try {
      return JSON.parse(JSON.stringify(users || []));
    } catch(e) {
      return users || [];
    }
  }

  function normalizeUsers(users) {
    var list = Array.isArray(users) ? cloneUsers(users) : [];
    var foundAdmin = false;

    list = list.filter(function(user) {
      return user && typeof user === 'object';
    }).map(function(user, idx) {
      if (!user.id) user.id = idx + 1;
      if (!user.username) user.username = 'utilisateur_' + user.id;
      user.username = String(user.username).trim();
      if (!user.name) user.name = user.username;
      if (!user.email) user.email = user.username + '@georoad.tg';
      if (ALLOWED_ROLES.indexOf(user.role) === -1) {
        user.role = 'utilisateur_public';
      }
      if (!user.status) user.status = 'actif';
      if (!user.createdAt) user.createdAt = new Date().toISOString().split('T')[0];
      if (typeof user.mustChangePassword === 'undefined') user.mustChangePassword = false;
      if (typeof user.password === 'undefined') user.password = '';

      /* Migration automatique de l'ancien compte admin */
      if (user.username.toLowerCase() === 'admin') {
        user.username = ADMIN_USERNAME;
      }

      if (user.username.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        foundAdmin = true;
        user.name = ADMIN_NAME;
        user.role = 'administrateur';
        user.status = 'actif';
        user.email = ADMIN_EMAIL;
        if (!user.password || user.password === LEGACY_ADMIN_PASSWORD) {
          user.password = DEFAULT_ADMIN_PASSWORD;
        }
      }

      return user;
    });

    var seenUsernames = {};
    list = list.filter(function(user) {
      var key = String(user.username || '').toLowerCase();
      if (!key) return false;
      if (seenUsernames[key]) return false;
      seenUsernames[key] = true;
      return true;
    });

    if (!foundAdmin) {
      list.unshift(cloneUsers(DEFAULT_USERS)[0]);
    }

    list.sort(function(a, b) { return (a.id || 0) - (b.id || 0); });
    return list;
  }

  function loadUsers() {
    var users = null;
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) users = JSON.parse(data);
    } catch(e) {}

    users = normalizeUsers(users || DEFAULT_USERS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    return cloneUsers(users);
  }

  function saveUsers(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeUsers(users)));
  }

  function findByUsername(username) {
    var uname = String(username || '').trim().toLowerCase();
    if (!uname) return null;
    var users = loadUsers();
    for (var i = 0; i < users.length; i++) {
      if (String(users[i].username || '').toLowerCase() === uname) {
        return users[i];
      }
    }
    return null;
  }

  function authenticate(username, password) {
    var user = findByUsername(username);
    if (!user) {
      return { ok: false, reason: 'not_found', message: 'Identifiants incorrects.' };
    }
    if (user.status !== 'actif') {
      return { ok: false, reason: 'inactive', user: user, message: 'Ce compte est dÃ©sactivÃ©.' };
    }
    if (user.role !== 'administrateur') {
      return { ok: false, reason: 'forbidden', user: user, message: 'Ce compte n\'a pas accÃ¨s Ã  l\'administration.' };
    }
    if (String(user.password || '') !== String(password || '')) {
      return { ok: false, reason: 'invalid_password', user: user, message: 'Identifiants incorrects.' };
    }
    return { ok: true, user: user };
  }

  /** Charge l'historique des connexions (max 200 entrÃ©es). */
  function loadLoginHistory() {
    try {
      var data = localStorage.getItem(LOGIN_HISTORY_KEY);
      if (data) return JSON.parse(data);
    } catch(e) {}
    return [];
  }

  /** Enregistre une connexion dans l'historique. */
  function recordLogin(userId, username, success) {
    var history = loadLoginHistory();
    history.unshift({
      userId: userId,
      username: username,
      timestamp: new Date().toISOString(),
      success: !!success,
      ip: 'local' /* en production : rÃ©cupÃ©rÃ© cÃ´tÃ© serveur */
    });
    /* Limiter Ã  200 entrÃ©es */
    if (history.length > 200) history = history.slice(0, 200);
    localStorage.setItem(LOGIN_HISTORY_KEY, JSON.stringify(history));
    /* Mettre Ã  jour lastLogin et lastActivity de l'utilisateur */
    if (success) {
      var users = loadUsers();
      var u = users.find(function(u) { return u.id === userId; });
      if (u) {
        u.lastLogin = new Date().toISOString();
        u.lastActivity = new Date().toISOString();
        saveUsers(users);
      }
    }
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(success ? SIGAuditTrail.ACTIONS.LOGIN : SIGAuditTrail.ACTIONS.LOGIN_FAILED, {
          user: username || 'Inconnu',
          featureId: userId ? String(userId) : null,
          featureName: username || null,
          details: success ? 'Connexion rÃ©ussie Ã  l\'administration' : 'Tentative de connexion refusÃ©e',
          result: success ? 'SUCCESS' : 'FAILURE',
          entityType: 'user'
        });
      } catch(e) {}
    }
  }

  /** Met Ã  jour la derniÃ¨re activitÃ© d'un utilisateur (Ã  appeler sur chaque action). */
  function recordActivity(userId) {
    var users = loadUsers();
    var u = users.find(function(u) { return u.id === userId; });
    if (u) {
      u.lastActivity = new Date().toISOString();
      saveUsers(users);
    }
  }

  /** RÃ©initialise le mot de passe d'un utilisateur (gÃ©nÃ¨re un mot de passe temporaire). */
  function resetPassword(id) {
    var users = loadUsers();
    var u = users.find(function(u) { return u.id === id; });
    if (!u) return;
    /* GÃ©nÃ©rer un mot de passe temporaire de 10 caractÃ¨res */
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    var tmp = '';
    for (var i = 0; i < 10; i++) tmp += chars.charAt(Math.floor(Math.random() * chars.length));
    u.password = tmp;
    u.mustChangePassword = true;
    saveUsers(users);
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.USER_UPDATED, {
          featureId: String(u.id),
          featureName: u.username,
          details: 'Mot de passe rÃ©initialisÃ© pour ' + (u.name || u.username),
          result: 'SUCCESS',
          entityType: 'user'
        });
      } catch(e) {}
    }
    /* Afficher le mot de passe temporaire */
    alert("Mot de passe rÃ©initialisÃ© pour \"" + u.name + "\".\n\nMot de passe temporaire : " + tmp + "\n\nL'utilisateur devra le changer Ã  la prochaine connexion.");
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('users');
  }

  function getNextId(users) {
    var max = 0;
    users.forEach(function(u) { if (u.id > max) max = u.id; });
    return max + 1;
  }

  function formatDate(d) {
    if (!d) return 'â€”';
    try {
      return new Date(d).toLocaleDateString('fr-FR') + ' ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch(e) { return d; }
  }

  function roleBadge(role) {
    /* PHASE 8 : uniquement 2 profils */
    var label, css;
    if (role === 'administrateur') { label = 'Administrateur'; css = 'active'; }
    else if (role === 'utilisateur_public') { label = 'Utilisateur public'; css = 'pending'; }
    else { label = role; css = 'inactive'; }
    return '<span class="status-badge ' + css + '">' + esc(label) + '</span>';
  }

  function statusBadge(status) {
    var css = status === 'actif' ? 'active' : 'inactive';
    return '<span class="status-badge ' + css + '">' + (status === 'actif' ? 'Actif' : 'Inactif') + '</span>';
  }

  function renderTableRows(users) {
    if (users.length === 0) {
      return '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:30px">Aucun utilisateur trouvÃ©</td></tr>';
    }
    var html = '';
    users.forEach(function(u) {
      html += '<tr>'
        + '<td><strong>' + esc(u.name) + '</strong><br><span style="font-size:.78rem;color:var(--text-3)">' + esc(u.email || u.username) + '</span></td>'
        + '<td>' + roleBadge(u.role) + '</td>'
        + '<td>' + statusBadge(u.status) + '</td>'
        + '<td style="font-size:.85rem">' + formatDate(u.lastLogin) + '</td>'
        + '<td style="font-size:.85rem">' + formatDate(u.lastActivity) + '</td>'
        + '<td>'
        + '<div style="display:flex;gap:4px">'
        + '<button class="btn-sm ghost" title="Modifier" onclick="UserAdmin.openForm(' + u.id + ')"><i class="fas fa-pen"></i></button>'
        + '<button class="btn-sm ghost" title="RÃ©initialiser le mot de passe" onclick="UserAdmin.resetPassword(' + u.id + ')"><i class="fas fa-key"></i></button>'
        + '<button class="btn-sm ghost" title="Historique des connexions" onclick="UserAdmin.showLoginHistory(' + u.id + ')"><i class="fas fa-history"></i></button>'
        + '<button class="btn-sm ghost" title="' + (u.status === 'actif' ? 'DÃ©sactiver' : 'Activer') + '" onclick="UserAdmin.toggleStatus(' + u.id + ')">'
        + '<i class="fas ' + (u.status === 'actif' ? 'fa-ban' : 'fa-check-circle') + '"></i></button>'
        + (u.id !== 1 ? '<button class="btn-sm danger" title="Supprimer" onclick="UserAdmin.deleteUser(' + u.id + ')"><i class="fas fa-trash"></i></button>' : '')
        + '</div></td>'
        + '</tr>';
    });
    return html;
  }

  /** Affiche l'historique des connexions d'un utilisateur dans un modal. */
  function showLoginHistory(userId) {
    var users = loadUsers();
    var u = users.find(function(u) { return u.id === userId; });
    if (!u) return;
    var history = loadLoginHistory().filter(function(h) { return h.userId === userId; }).slice(0, 50);

    var html = '<div class="modal-admin-overlay" id="modal-user-history" onclick="UserAdmin.closeModalOnOverlay(event)">'
      + '<div class="modal-admin" style="max-width:560px">'
      + '<div class="modal-admin-header"><h3>Historique des connexions â€” ' + esc(u.name) + '</h3>'
      + '<button class="modal-admin-close" onclick="UserAdmin.closeModal()"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">';
    if (history.length === 0) {
      html += '<p style="text-align:center;color:var(--text-3);padding:30px">Aucune connexion enregistrÃ©e.</p>';
    } else {
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Date</th><th>Statut</th><th>Adresse</th>'
        + '</tr></thead><tbody>';
      history.forEach(function(h) {
        var d = new Date(h.timestamp).toLocaleDateString('fr-FR') + ' ' + new Date(h.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var st = h.success ? '<span class="status-badge active">RÃ©ussie</span>' : '<span class="status-badge inactive">Ã‰chouÃ©e</span>';
        html += '<tr><td>' + d + '</td><td>' + st + '</td><td style="font-size:.82rem;color:var(--text-3)">' + esc(h.ip || 'â€”') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div><div class="modal-admin-footer">'
      + '<button class="btn-sm ghost" onclick="UserAdmin.closeModal()">Fermer</button>'
      + '</div></div></div>';

    var existing = document.getElementById('modal-user-history');
    if (existing) existing.parentNode.removeChild(existing);
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstChild);
  }

  function render() {
    var users = loadUsers();
    var html = '<div class="page-header"><h1>Gestion des utilisateurs</h1>'
      + '<p>Administration des comptes et des rÃ´les d\'accÃ¨s Ã  la plateforme GeoROAD. Cette section est rÃ©servÃ©e aux administrateurs systÃ¨me du MinistÃ¨re des Travaux Publics pour gÃ©rer les permissions des agents.</p></div>';

    /* Statistiques rapides */
    var actifs = users.filter(function(u) { return u.status === 'actif'; }).length;
    var admins = users.filter(function(u) { return u.role === 'administrateur'; }).length;
    html += '<div class="stats-row">';
    html += '<div class="stat-card-admin"><div class="sc-icon blue"><i class="fas fa-users"></i></div><div class="sc-value">' + users.length + '</div><div class="sc-label">Utilisateurs</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon green"><i class="fas fa-user-check"></i></div><div class="sc-value">' + actifs + '</div><div class="sc-label">Actifs</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-user-shield"></i></div><div class="sc-value">' + admins + '</div><div class="sc-label">Administrateurs</div></div>';
    html += '</div>';

    /* Barre d\'outils : recherche + bouton ajout */
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">'
      + '<div style="position:relative;flex:1;min-width:200px;max-width:360px">'
      + '<i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:.85rem"></i>'
      + '<input type="text" id="user-search" placeholder="Rechercher un utilisateur..." style="width:100%;padding:9px 12px 9px 36px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--white)" oninput="UserAdmin.search(this.value)">'
      + '</div>'
      + '<button class="btn-sm primary" onclick="UserAdmin.openForm(null)"><i class="fas fa-plus"></i> Nouvel utilisateur</button>'
      + '</div>';

    /* Tableau */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-users"></i> Liste des utilisateurs</h3></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Nom</th><th>RÃ´le</th><th>Statut</th><th>DerniÃ¨re connexion</th><th>DerniÃ¨re activitÃ©</th><th>Actions</th>'
      + '</tr></thead><tbody id="users-tbody">'
      + renderTableRows(users)
      + '</tbody></table></div></div></div>';

    return html;
  }

  function search(query) {
    var q = (query || '').toLowerCase().trim();
    var users = loadUsers();
    if (q) {
      users = users.filter(function(u) {
        return (u.name || '').toLowerCase().indexOf(q) !== -1
          || (u.username || '').toLowerCase().indexOf(q) !== -1
          || (u.email || '').toLowerCase().indexOf(q) !== -1
          || (u.role || '').toLowerCase().indexOf(q) !== -1;
      });
    }
    var tbody = document.getElementById('users-tbody');
    if (tbody) tbody.innerHTML = renderTableRows(users);
  }

  function openForm(id) {
    var isEdit = !!id;
    var user = null;
    if (isEdit) {
      var users = loadUsers();
      user = users.find(function(u) { return u.id === id; });
      if (!user) return;
    }

    var title = isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur';
    var formHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px">Nom complet *</label>'
      + '<input type="text" id="uf-name" value="' + esc(user ? user.name : '') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem"></div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px">Nom d\'utilisateur *</label>'
      + '<input type="text" id="uf-username" value="' + esc(user ? user.username : '') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem"></div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px">Email *</label>'
      + '<input type="email" id="uf-email" value="' + esc(user ? user.email : '') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem"></div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px">RÃ´le *</label>'
      + '<select id="uf-role" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--white)">'
      + '<option value="administrateur"' + (user && user.role === 'administrateur' ? ' selected' : '') + '>Administrateur</option>'
      + '<option value="utilisateur_public"' + (user && user.role === 'utilisateur_public' ? ' selected' : '') + '>Utilisateur public</option>'
      + '</select></div>'
      + '<div style="grid-column:1/-1"><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px">Mot de passe' + (isEdit ? ' (laisser vide pour ne pas changer)' : ' *') + '</label>'
      + '<input type="password" id="uf-password" placeholder="' + (isEdit ? 'Ne pas modifier' : 'DÃ©finir un mot de passe') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem"></div>'
      + '</div>'
      + '<div id="uf-error" style="color:var(--red);font-size:.82rem;margin-top:8px;display:none"></div>';

    var modalHtml = '<div id="modal-user-form" class="modal-admin-overlay" onclick="UserAdmin.closeModalOnOverlay(event)">'
      + '<div class="modal-admin" style="max-width:560px">'
      + '<div class="modal-admin-header"><h3>' + title + '</h3>'
      + '<button class="modal-admin-close" onclick="UserAdmin.closeModal()"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">' + formHtml + '</div>'
      + '<div class="modal-admin-footer">'
      + '<button class="btn-sm ghost" onclick="UserAdmin.closeModal()">Annuler</button>'
      + '<button class="btn-sm primary" onclick="UserAdmin.saveForm(' + (id || 'null') + ')"><i class="fas fa-check"></i> ' + (isEdit ? 'Enregistrer' : 'CrÃ©er') + '</button>'
      + '</div></div></div>';

    /* Supprimer un ancien modal s'il existe */
    var existing = document.getElementById('modal-user-form');
    if (existing) existing.parentNode.removeChild(existing);

    var div = document.createElement('div');
    div.innerHTML = modalHtml;
    var modalEl = div.firstChild;
    document.body.appendChild(modalEl);
  }

  function closeModal(id) {
    var ids = id ? [id] : ['modal-user-form', 'modal-user-history'];
    ids.forEach(function(modalId) {
      var modal = document.getElementById(modalId);
      if (modal) modal.parentNode.removeChild(modal);
    });
  }

  function closeModalOnOverlay(event) {
    if (event.target.classList.contains('modal-admin-overlay')) {
      closeModal(event.target.id);
    }
  }

  function saveForm(editId) {
    var name = document.getElementById('uf-name').value.trim();
    var username = document.getElementById('uf-username').value.trim();
    var email = document.getElementById('uf-email').value.trim();
    var role = document.getElementById('uf-role').value;
    var password = document.getElementById('uf-password').value;
    var errorEl = document.getElementById('uf-error');

    /* Validation */
    if (!name || !username || !email) {
      errorEl.textContent = 'Les champs Nom, Nom d\'utilisateur et Email sont obligatoires.';
      errorEl.style.display = 'block';
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errorEl.textContent = 'L\'adresse email n\'est pas valide.';
      errorEl.style.display = 'block';
      return;
    }

    if (!editId && !password) {
      errorEl.textContent = 'Le mot de passe est obligatoire pour un nouvel utilisateur.';
      errorEl.style.display = 'block';
      return;
    }
    if (ALLOWED_ROLES.indexOf(role) === -1) {
      errorEl.textContent = 'Le rÃ´le sÃ©lectionnÃ© n\'est pas autorisÃ©.';
      errorEl.style.display = 'block';
      return;
    }

    var users = loadUsers();
    var currentSession = (typeof AdminAuth !== 'undefined') ? AdminAuth.getSession() : null;
    var currentUser = currentSession ? (currentSession.name || currentSession.user || 'Administrateur') : 'Administrateur';

    /* VÃ©rifier l'unicitÃ© du username */
    var dup = users.find(function(u) { return u.username.toLowerCase() === username.toLowerCase() && u.id !== editId; });
    if (dup) {
      errorEl.textContent = 'Ce nom d\'utilisateur est dÃ©jÃ  pris.';
      errorEl.style.display = 'block';
      return;
    }

    if (editId) {
      var user = users.find(function(u) { return u.id === editId; });
      if (user) {
        var beforeState = cloneUsers([user])[0];
        user.name = name;
        user.username = username;
        user.email = email;
        user.role = role;
        if (password) user.password = password;
        if (typeof SIGAuditTrail !== 'undefined') {
          try {
            SIGAuditTrail.log(SIGAuditTrail.ACTIONS.USER_UPDATED, {
              user: currentUser,
              featureId: String(user.id),
              featureName: user.username,
              before: beforeState,
              after: cloneUsers([user])[0],
              details: 'Utilisateur modifiÃ© : ' + user.username,
              result: 'SUCCESS',
              entityType: 'user'
            });
          } catch(e) {}
        }
      }
    } else {
      var createdUser = {
        id: getNextId(users),
        username: username,
        name: name,
        role: role,
        email: email,
        password: password,
        status: 'actif',
        lastLogin: null,
        createdAt: new Date().toISOString().split('T')[0]
      };
      users.push(createdUser);
      if (typeof SIGAuditTrail !== 'undefined') {
        try {
          SIGAuditTrail.log(SIGAuditTrail.ACTIONS.USER_CREATED, {
            user: currentUser,
            featureId: String(createdUser.id),
            featureName: createdUser.username,
            after: cloneUsers([createdUser])[0],
            details: 'Utilisateur crÃ©Ã© : ' + createdUser.username,
            result: 'SUCCESS',
            entityType: 'user'
          });
        } catch(e) {}
      }
    }

    saveUsers(users);
    closeModal();

    /* RafraÃ®chir la page via AdminUI */
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('users');
  }

  function toggleStatus(id) {
    var users = loadUsers();
    var user = users.find(function(u) { return u.id === id; });
    if (!user || user.id === 1) return;
    var beforeState = cloneUsers([user])[0];
    user.status = user.status === 'actif' ? 'inactif' : 'actif';
    saveUsers(users);
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.USER_UPDATED, {
          featureId: String(user.id),
          featureName: user.username,
          before: beforeState,
          after: cloneUsers([user])[0],
          details: 'Statut utilisateur mis Ã  jour : ' + user.username + ' (' + user.status + ')',
          result: 'SUCCESS',
          entityType: 'user'
        });
      } catch(e) {}
    }
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('users');
  }

  function deleteUser(id) {
    if (id === 1) return;
    var users = loadUsers();
    var user = users.find(function(u) { return u.id === id; });
    if (!user) return;

    var msg = 'Supprimer l\'utilisateur "' + (user.name || user.username) + '" ? Cette action est irrÃ©versible.';
    if (!confirm(msg)) return;

    users = users.filter(function(u) { return u.id !== id; });
    saveUsers(users);
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.USER_DELETED, {
          featureId: String(id),
          featureName: user.username,
          before: cloneUsers([user])[0],
          details: 'Utilisateur supprimÃ© : ' + user.username,
          result: 'SUCCESS',
          entityType: 'user'
        });
      } catch(e) {}
    }
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('users');
  }

  return {
    render: render,
    openForm: openForm,
    closeModal: closeModal,
    closeModalOnOverlay: closeModalOnOverlay,
    saveForm: saveForm,
    toggleStatus: toggleStatus,
    deleteUser: deleteUser,
    search: search,
    /* Nouvelles fonctions PHASE 8 */
    resetPassword: resetPassword,
    showLoginHistory: showLoginHistory,
    recordLogin: recordLogin,
    recordActivity: recordActivity,
    loadLoginHistory: loadLoginHistory,
    ALLOWED_ROLES: ALLOWED_ROLES,
    findByUsername: findByUsername,
    authenticate: authenticate
  };
})();


/* -------------------------------------------------------------------
 * MODULE : SettingsAdmin
 * Configuration gÃ©nÃ©rale de la plateforme (localStorage).
 * ------------------------------------------------------------------- */
var SettingsAdmin = (function() {
  'use strict';

  var STORAGE_KEY = 'georoad_settings';

  var DEFAULTS = {
    platformName: 'GeoROAD TOGO',
    language: 'fr',
    projection: 'EPSG:4326',
    distanceUnit: 'km',
    coordFormat: 'DMS',
    autoSaveFreq: 'manual',
    theme: 'light',
    /* PHASE 9 : nouveaux paramÃ¨tres */
    logo: '', /* base64 data URL du logo */
    defaultBaseMap: 'satellite', /* satellite | osm | hybrid | light | topographic */
    backupFrequency: 'manual' /* manual | daily | weekly */
  };

  function loadSettings() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        var parsed = JSON.parse(data);
        /* Merge with defaults for new keys */
        for (var k in DEFAULTS) {
          if (!(k in parsed)) parsed[k] = DEFAULTS[k];
        }
        return parsed;
      }
    } catch(e) {}
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function save(key, value) {
    var settings = loadSettings();
    settings[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function get(key) {
    var settings = loadSettings();
    return settings.hasOwnProperty(key) ? settings[key] : DEFAULTS[key];
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function selectHtml(id, options, current) {
    var html = '<select id="setting-' + id + '" onchange="SettingsAdmin.save(\'' + id + '\', this.value)" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--white)">';
    options.forEach(function(o) {
      var val = typeof o === 'object' ? o.value : o;
      var label = typeof o === 'object' ? o.label : o;
      html += '<option value="' + esc(val) + '"' + (val === current ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
    html += '</select>';
    return html;
  }

  function inputHtml(id, value, type) {
    return '<input type="' + (type || 'text') + '" id="setting-' + id + '" value="' + esc(value) + '" oninput="SettingsAdmin.save(\'' + id + '\', this.value)" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem">';
  }

  function render() {
    var s = loadSettings();
    var html = '<div class="page-header"><h1>ParamÃ¨tres</h1>'
      + '<p>Configuration gÃ©nÃ©rale de la plateforme GeoROAD : systÃ¨me de projection cartographique, sauvegarde, affichage et prÃ©fÃ©rences. Ces paramÃ¨tres sont utilisÃ©s par l\'ensemble des modules de l\'application.</p></div>';

    /* Bouton enregistrer global */
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">'
      + '<button class="btn-sm primary" onclick="SettingsAdmin.saveAll()"><i class="fas fa-check"></i> Enregistrer tous les paramÃ¨tres</button>'
      + '</div>';

    /* Section 1 : ParamÃ¨tres gÃ©nÃ©raux */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-cog"></i> ParamÃ¨tres gÃ©nÃ©raux</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Nom de la plateforme</label>'
      + inputHtml('platformName', s.platformName)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Langue</label>'
      + selectHtml('language', [{value:'fr',label:'FranÃ§ais'},{value:'en',label:'English'}], s.language)
      + '</div>'
      + '</div></div></div>';

    /* Section 1b : Logo (PHASE 9) */
    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-image"></i> Logo de la plateforme</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">'
      + '<div style="flex-shrink:0">';
    if (s.logo) {
      html += '<img src="' + esc(s.logo) + '" alt="Logo" style="max-width:120px;max-height:80px;border:1px solid var(--border);border-radius:8px;padding:4px;background:#fff">';
    } else {
      html += '<div style="width:120px;height:80px;border:1px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:.78rem;text-align:center">Aucun logo<br>(logo par dÃ©faut)</div>';
    }
    html += '</div>'
      + '<div style="flex:1;min-width:200px">'
      + '<input type="file" id="setting-logo-file" accept="image/*" style="display:none" onchange="SettingsAdmin.uploadLogo(this)">'
      + '<button class="btn-sm primary" onclick="document.getElementById(\'setting-logo-file\').click()"><i class="fas fa-upload"></i> Choisir un logo</button> '
      + '<button class="btn-sm ghost" onclick="SettingsAdmin.removeLogo()"><i class="fas fa-trash"></i> Supprimer</button>'
      + '<p style="font-size:.78rem;color:var(--text-3);margin-top:8px">PNG, JPG ou SVG. Taille max recommandÃ©e : 200Ã—80 px.</p>'
      + '</div>'
      + '</div></div></div>';

    /* Section 2 : Cartographie + fond de carte par dÃ©faut (PHASE 9) */
    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-map"></i> Cartographie</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Projection par dÃ©faut</label>'
      + selectHtml('projection', ['EPSG:4326','EPSG:32630','EPSG:32631','EPSG:32632'], s.projection)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">UnitÃ©s de distance</label>'
      + selectHtml('distanceUnit', [{value:'km',label:'KilomÃ¨tres (km)'},{value:'m',label:'MÃ¨tres (m)'}], s.distanceUnit)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Affichage coordonnÃ©es</label>'
      + selectHtml('coordFormat', [{value:'DMS',label:'DMS (degrÃ©s, minutes, secondes)'},{value:'DD',label:'DD (degrÃ©s dÃ©cimaux)'}], s.coordFormat)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Fond de carte par dÃ©faut</label>'
      + selectHtml('defaultBaseMap', [{value:'satellite',label:'Google Satellite'},{value:'osm',label:'OpenStreetMap'},{value:'hybrid',label:'Google Hybrid'}], s.defaultBaseMap)
      + '</div>'
      + '</div></div></div>';

    /* Section 3 : Sauvegarde + frÃ©quence (PHASE 9) */
    var storageSize = 0;
    if (typeof SIGPersistence !== 'undefined') {
      try { storageSize = SIGPersistence.getStorageSize(); } catch(e) {}
    }
    var storageStr = (storageSize / 1024).toFixed(1) + ' Ko';
    if (storageSize > 1048576) storageStr = (storageSize / 1048576).toFixed(2) + ' Mo';

    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-database"></i> Sauvegarde</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">FrÃ©quence de sauvegarde automatique</label>'
      + selectHtml('autoSaveFreq', [
        {value:'onchange',label:'Ã€ chaque modification'},
        {value:'5min',label:'Toutes les 5 minutes'},
        {value:'manual',label:'Manuelle'}
      ], s.autoSaveFreq)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">FrÃ©quence des sauvegardes de sÃ©curitÃ©</label>'
      + selectHtml('backupFrequency', [
        {value:'manual',label:'Manuelle'},
        {value:'daily',label:'Quotidienne'},
        {value:'weekly',label:'Hebdomadaire'}
      ], s.backupFrequency)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Taille du stockage</label>'
      + '<div style="padding:9px 12px;background:var(--bg);border-radius:8px;font-size:.88rem;color:var(--text-2)">' + storageStr + '</div>'
      + '</div>'
      + '</div></div></div>';

    /* Section 4 : Apparence */
    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-palette"></i> Apparence</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">ThÃ¨me</label>'
      + selectHtml('theme', [{value:'light',label:'Clair'}], s.theme)
      + '</div>'
      + '</div></div></div>';

    /* Section 5 : Informations */
    var schemaVersion = 'â€”';
    if (typeof SIGPersistence !== 'undefined') {
      try {
        var desc = SIGPersistence.getSchemaDescription();
        schemaVersion = desc.version || 'â€”';
      } catch(e) {}
    }
    var lastSync = 'â€”';
    if (typeof SIGPersistence !== 'undefined') {
      try {
        var ls = SIGPersistence.getMeta('lastSync');
        if (ls) {
          var d = new Date(ls);
          lastSync = d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        }
      } catch(e) {}
    }

    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-info-circle"></i> Informations</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Version</label>'
      + '<div style="padding:9px 12px;background:var(--bg);border-radius:8px;font-size:.88rem;color:var(--text-2)">3.0</div>'
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">SchÃ©ma de donnÃ©es</label>'
      + '<div style="padding:9px 12px;background:var(--bg);border-radius:8px;font-size:.88rem;color:var(--text-2)">' + esc(schemaVersion) + '</div>'
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">DerniÃ¨re synchronisation</label>'
      + '<div style="padding:9px 12px;background:var(--bg);border-radius:8px;font-size:.88rem;color:var(--text-2)">' + esc(lastSync) + '</div>'
      + '</div>'
      + '</div></div></div>';

    return html;
  }

  function saveAll() {
    var settingsSnapshot = loadSettings();
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.SETTINGS_UPDATED, {
          featureName: 'Configuration GeoROAD TOGO',
          details: 'ParamÃ¨tres de la plateforme enregistrÃ©s',
          after: settingsSnapshot,
          result: 'SUCCESS',
          entityType: 'settings'
        });
      } catch(e) {}
    }
    if (typeof NotificationCenter !== 'undefined') {
      try {
        NotificationCenter.add('update', 'ParamÃ¨tres enregistrÃ©s', 'La configuration de la plateforme a Ã©tÃ© mise Ã  jour.');
      } catch(e) {}
    }
    /* Tous les champs sont dÃ©jÃ  sauvegardÃ©s en temps rÃ©el via onchange/oninput. */
    /* Ce bouton sert de confirmation visuelle. */
    var toast = document.getElementById('settings-toast');
    if (toast) toast.parentNode.removeChild(toast);
    var div = document.createElement('div');
    div.id = 'settings-toast';
    div.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--green);color:#fff;padding:12px 24px;border-radius:10px;font-size:.88rem;font-weight:600;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,.15)';
    div.innerHTML = '<i class="fas fa-check-circle"></i> ParamÃ¨tres enregistrÃ©s avec succÃ¨s';
    document.body.appendChild(div);
    setTimeout(function() { if (div.parentNode) div.parentNode.removeChild(div); }, 3000);
  }

  /** Upload du logo (PHASE 9) : lit le fichier en base64 et le stocke dans les settings. */
  function uploadLogo(input) {
    if (!input.files || input.files.length === 0) return;
    var file = input.files[0];
    /* Limiter Ã  500 Ko */
    if (file.size > 500 * 1024) {
      alert('Le fichier est trop volumineux (max 500 Ko). Choisissez une image plus petite.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
      save('logo', e.target.result);
      /* Recharger la page settings pour afficher le logo */
      if (typeof AdminUI !== 'undefined') AdminUI.navigate('settings');
    };
    reader.onerror = function() {
      alert('Erreur lors de la lecture du fichier.');
    };
    reader.readAsDataURL(file);
  }

  /** Supprime le logo personnalisÃ© (PHASE 9). */
  function removeLogo() {
    if (!confirm('Supprimer le logo personnalisÃ© ? Le logo par dÃ©faut sera utilisÃ©.')) return;
    save('logo', '');
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('settings');
  }

  return {
    render: render,
    save: save,
    get: get,
    saveAll: saveAll,
    /* Nouvelles fonctions PHASE 9 */
    uploadLogo: uploadLogo,
    removeLogo: removeLogo
  };
})();


/* -------------------------------------------------------------------
 * MODULE : AuditAdmin
 * Journal d'audit avec filtres et export CSV.
 * ------------------------------------------------------------------- */
var AuditAdmin = (function() {
  'use strict';

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return 'â€”';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch(e) { return iso; }
  }

  function toLocalDateString(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toISOString().split('T')[0];
    } catch(e) { return ''; }
  }

  function getFilteredEntries() {
    if (typeof SIGAuditTrail === 'undefined') return [];

    var dateFrom = '';
    var dateTo = '';
    var userFilter = '';
    var actionFilter = '';
    var searchQuery = '';

    var elFrom = document.getElementById('audit-date-from');
    var elTo = document.getElementById('audit-date-to');
    var elUser = document.getElementById('audit-user');
    var elAction = document.getElementById('audit-action');
    var elSearch = document.getElementById('audit-search');

    if (elFrom) dateFrom = elFrom.value;
    if (elTo) dateTo = elTo.value;
    if (elUser) userFilter = elUser.value.trim().toLowerCase();
    if (elAction) actionFilter = elAction.value;
    if (elSearch) searchQuery = elSearch.value.trim().toLowerCase();

    /* RÃ©cupÃ©rer toutes les entrÃ©es (large limite) */
    var entries = SIGAuditTrail.getRecentChanges(500);

    /* Filtrer par date */
    if (dateFrom) {
      entries = entries.filter(function(e) { return toLocalDateString(e.timestamp) >= dateFrom; });
    }
    if (dateTo) {
      entries = entries.filter(function(e) { return toLocalDateString(e.timestamp) <= dateTo; });
    }

    /* Filtrer par utilisateur */
    if (userFilter) {
      entries = entries.filter(function(e) { return (e.user || '').toLowerCase().indexOf(userFilter) !== -1; });
    }

    /* Filtrer par type d'action */
    if (actionFilter) {
      entries = entries.filter(function(e) { return e.action === actionFilter; });
    }

    /* Filtrer par recherche texte */
    if (searchQuery) {
      entries = entries.filter(function(e) {
        return (e.details || '').toLowerCase().indexOf(searchQuery) !== -1
          || (e.featureName || '').toLowerCase().indexOf(searchQuery) !== -1
          || (e.featureId || '').toLowerCase().indexOf(searchQuery) !== -1
          || (e.action || '').toLowerCase().indexOf(searchQuery) !== -1;
      });
    }

    return entries;
  }

  function renderTableBody(entries) {
    if (typeof SIGAuditTrail === 'undefined') {
      return '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:30px">Module d\'audit non chargÃ©</td></tr>';
    }

    if (entries.length === 0) {
      return '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:30px">Aucune entrÃ©e ne correspond aux filtres</td></tr>';
    }

    var html = '';
    entries.forEach(function(e) {
      var actionLabel = SIGAuditTrail.getActionLabel(e.action);
      var actionIcon = SIGAuditTrail.getActionIcon(e.action);
      var featName = e.featureName || e.featureId || '';
      /* Bouton "Zoom sur entitÃ©" â€” uniquement pour les actions sur routes/PK/emprises */
      var canZoom = featName && (e.action === 'CREATE_ROUTE' || e.action === 'UPDATE_ROUTE' || e.action === 'DELETE_ROUTE' || e.action === 'EDIT_GEOMETRY');
      /* Encoder le nom pour Ã©viter les soucis d'apostrophes : utilisation de data-* attributes */
      var safeId = String(e.featureId || featName || '').replace(/"/g, '&quot;');
      html += '<tr>'
        + '<td>' + formatDate(e.timestamp) + '</td>'
        + '<td>' + esc(e.user) + '</td>'
        + '<td><i class="fas ' + actionIcon + '" style="margin-right:4px"></i> ' + actionLabel + '</td>'
        + '<td>' + esc(featName || 'â€”') + '</td>'
        + '<td>' + esc(e.details || 'â€”') + '</td>'
        + '<td style="text-align:right;white-space:nowrap">'
        + (canZoom ? '<button class="btn-icon" title="Voir sur le gÃ©oportail" data-zoom-id="' + safeId + '" data-zoom-name="' + esc(featName) + '" onclick="AuditAdmin.zoomToEntity(this.getAttribute(\'data-zoom-id\'),this.getAttribute(\'data-zoom-name\'))"><i class="fas fa-external-link-alt"></i></button>' : '')
        + '</td>'
        + '</tr>';
    });
    return html;
  }

  function render() {
    var html = '<div class="page-header"><h1>Journal d\'audit</h1>'
      + '<p>Historique des modifications du rÃ©seau routier. Chaque action (crÃ©ation, modification, suppression, import, export) est enregistrÃ©e avec l\'utilisateur, la date et les dÃ©tails.</p></div>';

    if (typeof SIGAuditTrail === 'undefined') {
      html += '<div class="admin-panel"><div class="panel-body"><div class="empty-state">'
        + '<i class="fas fa-clipboard-list"></i>'
        + '<h3>Module d\'audit non chargÃ©</h3>'
        + '<p>Le module SIGAuditTrail V3.0 n\'est pas disponible sur cette page.</p>'
        + '</div></div></div>';
      return html;
    }

    /* Statistiques */
    var actionCounts = SIGAuditTrail.getActionCounts();
    var totalEntries = SIGAuditTrail.count();
    html += '<div class="stats-row">';
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-clipboard-list"></i></div><div class="sc-value">' + totalEntries + '</div><div class="sc-label">EntrÃ©es d\'audit</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon green"><i class="fas fa-plus-circle"></i></div><div class="sc-value">' + (actionCounts['CREATE_ROUTE'] || 0) + '</div><div class="sc-label">Routes crÃ©Ã©es</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon blue"><i class="fas fa-pen"></i></div><div class="sc-value">' + ((actionCounts['UPDATE_ROUTE'] || 0) + (actionCounts['EDIT_GEOMETRY'] || 0)) + '</div><div class="sc-label">Modifications</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon red"><i class="fas fa-trash"></i></div><div class="sc-value">' + (actionCounts['DELETE_ROUTE'] || 0) + '</div><div class="sc-label">Suppressions</div></div>';
    html += '</div>';

    /* Barre de filtres */
    var actionOptions = '';
    var ACTIONS = SIGAuditTrail.ACTIONS || {};
    actionOptions += '<option value="">Tous les types</option>';
    for (var key in ACTIONS) {
      var lbl = SIGAuditTrail.getActionLabel(ACTIONS[key]);
      actionOptions += '<option value="' + esc(ACTIONS[key]) + '">' + esc(lbl) + '</option>';
    }

    html += '<div class="admin-panel" style="margin-top:4px"><div class="panel-header">'
      + '<h3><i class="fas fa-filter"></i> Filtres</h3>'
      + '<div style="display:flex;gap:8px">'
      + '<button class="btn-sm primary" onclick="AuditAdmin.applyFilters()"><i class="fas fa-search"></i> Filtrer</button>'
      + '<button class="btn-sm ghost" onclick="AuditAdmin.exportCSV()"><i class="fas fa-file-csv"></i> Exporter CSV</button>'
      + '<button class="btn-sm ghost" onclick="AuditAdmin.exportPDF()"><i class="fas fa-file-pdf"></i> Exporter PDF</button>'
      + '</div></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:12px;align-items:end">'
      + '<div><label style="font-size:.78rem;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px">Date dÃ©but</label>'
      + '<input type="date" id="audit-date-from" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:.84rem"></div>'
      + '<div><label style="font-size:.78rem;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px">Date fin</label>'
      + '<input type="date" id="audit-date-to" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:.84rem"></div>'
      + '<div><label style="font-size:.78rem;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px">Utilisateur</label>'
      + '<input type="text" id="audit-user" placeholder="Filtrer par utilisateur..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:.84rem"></div>'
      + '<div><label style="font-size:.78rem;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px">Type d\'action</label>'
      + '<select id="audit-action" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:.84rem;background:var(--white)">'
      + actionOptions + '</select></div>'
      + '<div><label style="font-size:.78rem;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px">Recherche</label>'
      + '<input type="text" id="audit-search" placeholder="Rechercher..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:.84rem"></div>'
      + '</div></div></div>';

    /* Tableau d'audit */
    var entries = SIGAuditTrail.getRecentChanges(50);
    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-clock-rotate-left"></i> DerniÃ¨res modifications</h3>'
      + '<span style="font-size:.82rem;color:var(--text-3)" id="audit-count-label">' + entries.length + ' rÃ©sultats</span></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet concernÃ©</th><th>DÃ©tails</th><th style="text-align:right">Actions</th>'
      + '</tr></thead><tbody id="audit-tbody">'
      + renderTableBody(entries)
      + '</tbody></table></div></div></div>';

    return html;
  }

  function applyFilters() {
    var entries = getFilteredEntries();
    var tbody = document.getElementById('audit-tbody');
    if (tbody) tbody.innerHTML = renderTableBody(entries);
    var countLabel = document.getElementById('audit-count-label');
    if (countLabel) countLabel.textContent = entries.length + ' rÃ©sultats';
  }

  function exportCSV() {
    var entries = getFilteredEntries();
    if (entries.length === 0) {
      alert('Aucune entrÃ©e Ã  exporter.');
      return;
    }

    var csv = 'Date;Utilisateur;Action;Route;DÃ©tails\n';
    entries.forEach(function(e) {
      var actionLabel = (typeof SIGAuditTrail !== 'undefined') ? SIGAuditTrail.getActionLabel(e.action) : e.action;
      csv += '"' + (e.timestamp || '').replace(/"/g, '""') + '";'
        + '"' + (e.user || '').replace(/"/g, '""') + '";'
        + '"' + actionLabel.replace(/"/g, '""') + '";'
        + '"' + (e.featureName || e.featureId || '').replace(/"/g, '""') + '";'
        + '"' + (e.details || '').replace(/"/g, '""') + '"\n';
    });

    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var filename = 'audit_georoad_' + new Date().toISOString().split('T')[0] + '.csv';
    if (typeof GeoROADDownload !== 'undefined' && typeof GeoROADDownload.downloadBlob === 'function') {
      GeoROADDownload.downloadBlob(blob, filename);
    } else {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(function() {
        if (a.parentNode) a.parentNode.removeChild(a);
        URL.revokeObjectURL(url);
      }, 400);
    }
  }

  /** Export PDF du journal d'audit filtrÃ© (utilise jsPDF + autoTable dÃ©jÃ  chargÃ©s sur admin.html). */
  function exportPDF() {
    var entries = getFilteredEntries();
    if (entries.length === 0) {
      alert('Aucune entrÃ©e Ã  exporter.');
      return;
    }
    if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
      alert('Librairie jsPDF non chargÃ©e.');
      return;
    }
    var doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var now = new Date();
    var dateStr = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    /* En-tÃªte */
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Journal d\'audit â€” GeoROAD TOGO', 14, 14);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Ã‰ditÃ© le ' + dateStr + ' â€” ' + entries.length + ' entrÃ©e(s)', 14, 20);

    /* Tableau */
    var rows = entries.map(function(e) {
      var actionLabel = (typeof SIGAuditTrail !== 'undefined') ? SIGAuditTrail.getActionLabel(e.action) : e.action;
      var d = e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : 'â€”';
      return [d, e.user || 'â€”', actionLabel, e.featureName || e.featureId || 'â€”', (e.details || '').substring(0, 100)];
    });
    if (doc.autoTable) {
      doc.autoTable({
        head: [['Date', 'Utilisateur', 'Action', 'Objet concernÃ©', 'DÃ©tails']],
        body: rows,
        startY: 26,
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [200, 166, 75], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 246, 240] },
        columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 30 }, 2: { cellWidth: 35 }, 3: { cellWidth: 40 }, 4: { cellWidth: 'auto' } }
      });
    } else {
      /* Fallback si autoTable non disponible : liste simple */
      var y = 30;
      doc.setFontSize(7);
      rows.forEach(function(r) {
        doc.text(r.join('  |  '), 14, y);
        y += 4;
        if (y > 200) { doc.addPage(); y = 14; }
      });
    }

    doc.save('audit_georoad_' + new Date().toISOString().split('T')[0] + '.pdf');
  }

  /** Ouvre le gÃ©oportail public en pointant sur l'entitÃ© concernÃ©e par une entrÃ©e d'audit. */
  function zoomToEntity(featureId, featureName) {
    /* On ouvre le gÃ©oportail avec un hash qui sera interprÃ©tÃ© pour centrer la carte */
    var url = 'geoportail.html#feature=' + encodeURIComponent(featureName || featureId || '');
    window.open(url, '_blank');
  }

  return {
    render: render,
    applyFilters: applyFilters,
    exportCSV: exportCSV,
    exportPDF: exportPDF,
    zoomToEntity: zoomToEntity
  };
})();


/* -------------------------------------------------------------------
 * MODULE : AdminPages
 * GÃ©nÃ©rateur du HTML pour chaque page/section de l'administration.
 * Chaque fonction retourne du HTML injectÃ© dans #adminContent.
 * 
 * Architecture : chaque page est une fonction indÃ©pendante,
 * facilitant l'ajout de nouvelles pages Ã  l'avenir.
 * ------------------------------------------------------------------- */
var AdminPages = (function() {
  'use strict';

  /* Labels complets des catÃ©gories de routes */
  var CAT_LABELS = {
    'CU': 'Route Communautaire',
    'RN': 'Route Nationale',
    'RR': 'Route RÃ©gionale',
    'RC': 'Route Communale',
    'RL': 'Route Locale'
  };

  var CAT_CSS = { 'CU': 'cu', 'RN': 'rn', 'RR': 'rr', 'RC': 'rc', 'RL': 'rl' };

  /* ===== PAGE : Tableau de bord (Dashboard) ===== */
  function pageDashboard() {
    var s = AdminData.computeDashboardStats();
    var totalPop = 0, totalRurale = 0;
    s.regionFeatures.forEach(function(f) {
      totalPop += (f.properties.POP_2022 || 0);
      totalRurale += (f.properties.POP_RU_TOT || 0);
    });

    /* Cartes statistiques */
    var html = '<div class="page-header"><h1>Tableau de bord</h1>'
      + '<p>Vue d\'ensemble du rÃ©seau routier national â€” RÃ©gions Centre, Kara et Savanes</p></div>';

    html += '<div class="stats-row">';
    html += statCard('fa-road', 'gold', s.totalRoutes + '', 'TronÃ§ons routiers', 'up');
    html += statCard('fa-ruler-horizontal', 'blue', s.totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km', 'KilomÃ¨tres totaux', 'up');
    html += statCard('fa-users', 'green', totalRurale.toLocaleString('fr-FR'), 'Population rurale', '');
    html += statCard('fa-vector-square', 'red', s.empriseCount + '', 'Emprises dÃ©limitÃ©es', '');
    html += '</div>';

    /* PHASE 2 : ligne supplÃ©mentaire avec PK, cantons, prÃ©f., rÃ©gions */
    html += '<div class="stats-row" style="margin-top:4px">';
    html += statCard('fa-map-pin', 'gold', s.pkCount + '', 'Points kilomÃ©triques', '');
    html += statCard('fa-map', 'blue', s.regionFeatures.length + '', 'RÃ©gions', '');
    html += statCard('fa-map-marker-alt', 'green', s.prefectureCount + '', 'PrÃ©fectures', '');
    html += statCard('fa-location-dot', 'red', s.cantonCount + '', 'Cantons', '');
    html += '</div>';

    /* Graphiques : 2 colonnes */
    html += '<div class="grid-2">';

    /* Panel barres par catÃ©gorie */
    var catOrder = ['CU', 'RN', 'RR', 'RC', 'RL'];
    var maxKm = 0;
    catOrder.forEach(function(c) { if ((s.byCategory[c] || {}).km > maxKm) maxKm = (s.byCategory[c] || {}).km; });

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-road"></i> Routes par catÃ©gorie</h3></div>'
      + '<div class="panel-body"><div class="chart-bars">';
    catOrder.forEach(function(c) {
      var d = s.byCategory[c] || { count: 0, km: 0 };
      var pct = maxKm > 0 ? (d.km / maxKm * 100) : 0;
      html += '<div class="chart-bar-row">'
        + '<span class="chart-bar-label">' + (CAT_LABELS[c] || c) + '</span>'
        + '<div class="chart-bar-track"><div class="chart-bar-fill ' + (CAT_CSS[c] || '') + '" style="width:' + pct + '%">' + d.count + '</div></div>'
        + '<span class="chart-bar-val">' + d.km.toFixed(0) + ' km</span></div>';
    });
    html += '</div></div></div>';

    /* Panel routes par rÃ©gion â€” calculÃ©es exclusivement depuis les donnÃ©es rÃ©elles */
    var regNames = Object.keys(s.byRegion).filter(function(r) { return r !== 'Non dÃ©fini'; });
    if (regNames.length === 0) regNames = ['Aucune donnÃ©e'];
    var maxRegKm = 0;
    regNames.forEach(function(r) { if ((s.byRegion[r] || {}).km > maxRegKm) maxRegKm = (s.byRegion[r] || {}).km; });

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-map"></i> Routes par rÃ©gion</h3></div>'
      + '<div class="panel-body"><div class="chart-bars">';
    regNames.forEach(function(r) {
      var d = s.byRegion[r] || { count: 0, km: 0 };
      var pct = maxRegKm > 0 ? (d.km / maxRegKm * 100) : 0;
      html += '<div class="chart-bar-row">'
        + '<span class="chart-bar-label">' + r + '</span>'
        + '<div class="chart-bar-track"><div class="chart-bar-fill rr" style="width:' + pct + '%">' + d.count + '</div></div>'
        + '<span class="chart-bar-val">' + d.km.toFixed(0) + ' km</span></div>';
    });
    html += '</div></div></div>';
    html += '</div>';

    /* Tableau rÃ©sumÃ© des rÃ©gions */
    html += '<div class="admin-panel" style="margin-top:4px"><div class="panel-header"><h3><i class="fas fa-table"></i> DonnÃ©es rÃ©gionales</h3></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>RÃ©gion</th><th>Population (2022)</th><th>Pop. rurale totale</th><th>Pop. rurale impactÃ©e</th><th>IAR (%)</th><th>Taux urbanisation</th>'
      + '</tr></thead><tbody>';
    s.regionFeatures.forEach(function(f) {
      var p = f.properties;
      html += '<tr><td><strong>' + p.NAME_1 + '</strong></td>'
        + '<td>' + Number(p.POP_2022).toLocaleString('fr-FR') + '</td>'
        + '<td>' + Number(p.POP_RU_TOT).toLocaleString('fr-FR') + '</td>'
        + '<td>' + Number(p.POP_RU_IMP).toLocaleString('fr-FR') + '</td>'
        + '<td>' + p['IAR_%'] + '%</td>'
        + '<td>' + p.TAUX_HUBN + '%</td></tr>';
    });
    html += '</tbody></table></div></div></div>';

    /* Longueur moyenne â€” calculÃ©e depuis les donnÃ©es rÃ©elles des routes */
    var avgLen = s.totalRoutes > 0 ? (s.totalKm / s.totalRoutes) : 0;
    html += '<div class="stats-row" style="margin-top:4px">';
    html += statCard('fa-ruler-combined', 'gold', avgLen.toFixed(1) + ' km', 'Longueur moyenne', '');
    html += '</div>';

    /* DensitÃ© routiÃ¨re par rÃ©gion â€” calculÃ©e depuis les donnÃ©es rÃ©elles */
    /* Superficies officielles des rÃ©gions du Togo (kmÂ²) */
    var regionAreas = { 'Centre': 13329, 'Kara': 11640, 'Savanes': 8602 };
    var regionKeys = Object.keys(s.byRegion).filter(function(r) { return r !== 'Non dÃ©fini' && regionAreas[r]; });
    if (regionKeys.length > 0) {
    html += '<div class="grid-2">';
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-gauge-high"></i> DensitÃ© routiÃ¨re par rÃ©gion</h3></div>'
      + '<div class="panel-body"><div class="chart-bars">';
    var maxDensity = 0;
    var densities = {};
    regionKeys.forEach(function(r) {
      var area = regionAreas[r] || 1;
      var km = (s.byRegion[r] || {}).km || 0;
      var density = area > 0 ? km / area * 100 : 0;
      densities[r] = density;
      if (density > maxDensity) maxDensity = density;
    });
    regionKeys.forEach(function(r) {
      var pct = maxDensity > 0 ? (densities[r] / maxDensity * 100) : 0;
      html += '<div class="chart-bar-row">'
        + '<span class="chart-bar-label">' + r + '</span>'
        + '<div class="chart-bar-track"><div class="chart-bar-fill rr" style="width:' + pct + '%">' + densities[r].toFixed(2) + '</div></div>'
        + '<span class="chart-bar-val">' + densities[r].toFixed(2) + ' km/100kmÂ²</span></div>';
    });
    html += '</div></div></div>';

    /* PHASE 2 : rÃ©partition par Ã©tat (depuis les attributs Etat rÃ©els) */
    var etatKeys = Object.keys(s.byEtat);
    if (etatKeys.length > 0) {
      var maxEtat = 0;
      etatKeys.forEach(function(k) { if (s.byEtat[k] > maxEtat) maxEtat = s.byEtat[k]; });
      html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-traffic-light"></i> RÃ©partition par Ã©tat</h3></div>'
        + '<div class="panel-body"><div class="chart-bars">';
      etatKeys.forEach(function(k) {
        var pct = maxEtat > 0 ? (s.byEtat[k] / maxEtat * 100) : 0;
        var etatCss = k === 'Bon' ? 'rn' : (k === 'Moyen' ? 'rr' : (k === 'Mauvais' ? 'rc' : (k === 'En travaux' ? 'rl' : 'cu')));
        html += '<div class="chart-bar-row">'
          + '<span class="chart-bar-label">' + k + '</span>'
          + '<div class="chart-bar-track"><div class="chart-bar-fill ' + etatCss + '" style="width:' + pct + '%">' + s.byEtat[k] + '</div></div>'
          + '<span class="chart-bar-val">' + s.byEtat[k] + ' route(s)</span></div>';
      });
      html += '</div></div></div>';
    }

    /* PHASE 2 : rÃ©partition par revÃªtement (depuis les attributs Revetement rÃ©els) */
    var revetKeys = Object.keys(s.byRevetement);
    if (revetKeys.length > 0) {
      var maxRevet = 0;
      revetKeys.forEach(function(k) { if (s.byRevetement[k] > maxRevet) maxRevet = s.byRevetement[k]; });
      html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-road-circle-check"></i> RÃ©partition par revÃªtement</h3></div>'
        + '<div class="panel-body"><div class="chart-bars">';
      revetKeys.forEach(function(k) {
        var pct = maxRevet > 0 ? (s.byRevetement[k] / maxRevet * 100) : 0;
        var revetCss = k === 'Bitume' ? 'rn' : (k === 'Terre' ? 'rr' : (k === 'Gravier' ? 'rl' : (k === 'Non revÃªtu' ? 'rc' : 'cu')));
        html += '<div class="chart-bar-row">'
          + '<span class="chart-bar-label">' + k + '</span>'
          + '<div class="chart-bar-track"><div class="chart-bar-fill ' + revetCss + '" style="width:' + pct + '%">' + s.byRevetement[k] + '</div></div>'
          + '<span class="chart-bar-val">' + s.byRevetement[k] + ' route(s)</span></div>';
      });
      html += '</div></div></div>';
    }
    } /* fin du bloc densitÃ© si donnÃ©es disponibles */

    /* Routes rÃ©cemment modifiÃ©es */
    var recentFeatures = [];
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      recentFeatures = json_Rseauroutier_6.features.slice().filter(function(f) {
        return f.properties && f.properties.lastModified;
      }).sort(function(a, b) {
        return new Date(b.properties.lastModified) - new Date(a.properties.lastModified);
      }).slice(0, 5);
    }

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-history"></i> Routes rÃ©cemment modifiÃ©es</h3></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Route</th><th>ModifiÃ© par</th><th>Date</th>'
      + '</tr></thead><tbody>';
    if (recentFeatures.length === 0) {
      html += '<tr><td colspan="3" style="text-align:center;color:var(--text-3);padding:20px">Aucune modification rÃ©cente</td></tr>';
    } else {
      recentFeatures.forEach(function(f) {
        var p = f.properties;
        var dateStr = p.lastModified ? new Date(p.lastModified).toLocaleDateString('fr-FR') + ' ' + new Date(p.lastModified).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'â€”';
        html += '<tr>'
          + '<td><strong>' + esc(p.Name || 'â€”') + '</strong></td>'
          + '<td>' + esc(p.modifiedBy || 'â€”') + '</td>'
          + '<td>' + dateStr + '</td>'
          + '</tr>';
      });
    }
    html += '</tbody></table></div></div></div>';
    html += '</div>';

    return html;
  }

  /* ===== PAGES : Gestion (vides pour le moment) ===== */

  function pageRoutes() {
    if (typeof RouteModule !== 'undefined') return RouteModule.render();
    return pageHeader('Gestion des routes', 'Consultez, modifiez et gÃ©rez l\'ensemble des tronÃ§ons du rÃ©seau routier national. Chaque route dispose d\'attributs dÃ©taillÃ©s : nom, code, catÃ©gorie (RN, RR, RC, RL, CU), rÃ©gion d\'appartenance, longueur et Ã©tat de revÃªtement.')
      + emptyState('fa-road', 'Module non chargÃ©', 'Le module de gestion des routes n\'est pas disponible.', 'â€”');
  }

  function pageEmprises() {
    if (typeof EmpriseModule !== 'undefined') return EmpriseModule.render();
    return pageHeader('Gestion des emprises', 'Gestion des zones d\'emprise routiÃ¨re du domaine public du MinistÃ¨re des Travaux Publics. Les emprises dÃ©limitent la largeur de terrain nÃ©cessaire Ã  la construction, l\'entretien et l\'Ã©largissement des routes.')
      + emptyState('fa-vector-square', 'Module non chargÃ©', 'Le module de gestion des emprises n\'est pas disponible.', 'â€”');
  }

  function pagePK() {
    if (typeof PKModule !== 'undefined') return PKModule.render();
    return pageHeader('Gestion des points kilomÃ©triques', 'RÃ©fÃ©rencement et localisation des points kilomÃ©triques (PK) le long du rÃ©seau routier. Les PK servent de repÃ¨res pour la signalisation, l\'entretien et les interventions sur les routes.')
      + emptyState('fa-map-pin', 'Module non chargÃ©', 'Le module de gestion des PK n\'est pas disponible.', 'â€”');
  }

  function pageSpatial() {
    if (typeof SpatialModule !== 'undefined') return SpatialModule.render();
    /* Fallback dynamique si SpatialModule non chargÃ© â€” utilise les donnÃ©es rÃ©elles */
    var routeCount = (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) ? json_Rseauroutier_6.features.length : 0;
    var empCount = (typeof json_Emprise_5 !== 'undefined' && json_Emprise_5.features) ? json_Emprise_5.features.length : 0;
    var regCount = (typeof json_Rgion_2 !== 'undefined' && json_Rgion_2.features) ? json_Rgion_2.features.length : 0;
    var prefCount = (typeof json_Prfecture_3 !== 'undefined' && json_Prfecture_3.features) ? json_Prfecture_3.features.length : 0;
    var cantCount = (typeof json_Canton_4 !== 'undefined' && json_Canton_4.features) ? json_Canton_4.features.length : 0;
    return pageHeader('Gestion des donnÃ©es spatiales', 'Import et export de donnÃ©es gÃ©ographiques â€” GeoJSON, CSV')
      + '<div class="grid-2">'
      + uploadCard('fa-file-import', 'Importer des donnÃ©es', 'GeoJSON, CSV', 'Importer')
      + uploadCard('fa-file-export', 'Exporter des donnÃ©es', 'GeoJSON, CSV, PDF, Excel', 'Exporter')
      + '</div>'
      + '<div class="admin-panel" style="margin-top:20px"><div class="panel-header"><h3><i class="fas fa-layer-group"></i> Couches disponibles</h3></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Couche</th><th>EntitÃ©s</th><th>Type</th><th>Statut</th>'
      + '</tr></thead><tbody>'
      + layerRow('RÃ©seau routier', routeCount, 'Ligne', routeCount > 0 ? 'active' : 'inactive')
      + layerRow('Emprises', empCount, 'Polygone', empCount > 0 ? 'active' : 'inactive')
      + layerRow('RÃ©gions', regCount, 'Polygone', regCount > 0 ? 'active' : 'inactive')
      + layerRow('PrÃ©fectures', prefCount, 'Polygone', prefCount > 0 ? 'active' : 'inactive')
      + layerRow('Cantons', cantCount, 'Polygone', cantCount > 0 ? 'active' : 'inactive')
      + '</tbody></table></div></div></div>';
  }

  function pageSettings() {
    return pageHeader('ParamÃ¨tres', 'Configuration gÃ©nÃ©rale de la plateforme GeoROAD : systÃ¨me de projection cartographique, base de donnÃ©es, authentification et sÃ©curitÃ©. Ces paramÃ¨tres sont utilisÃ©s par l\'ensemble des modules de l\'application.')
      + '<div class="grid-2">'
      + settingsCard('fa-server', 'Base de donnÃ©es', 'PostgreSQL/PostGIS', 'Connexion non configurÃ©e', 'inactive')
      + settingsCard('fa-key', 'Authentification', 'JWT / Session', 'Non activÃ©e', 'pending')
      + settingsCard('fa-map', 'Projection', 'EPSG:4326 (WGS 84)', 'Active', 'active')
      + settingsCard('fa-shield-halved', 'SÃ©curitÃ©', 'HTTPS / CORS', 'Ã€ configurer', 'pending')
      + '</div>';
  }

  /* ===== PAGE : Journal d'audit (V3.0) ===== */
  function pageAudit() {
    var html = pageHeader('Journal d\'audit', 'Historique des modifications du rÃ©seau routier');

    /* V3.0 SIG Core : utiliser SIGAuditTrail si disponible */
    if (typeof SIGAuditTrail !== 'undefined') {
      var entries = SIGAuditTrail.getRecentChanges(50);
      var actionCounts = SIGAuditTrail.getActionCounts();
      var totalEntries = SIGAuditTrail.count();

      /* RÃ©sumÃ© statistique */
      html += '<div class="stats-row">';
      html += statCard('fa-clipboard-list', 'gold', totalEntries + '', 'EntrÃ©es d\'audit', '');
      var createCount = actionCounts['CREATE_ROUTE'] || 0;
      var updateCount = actionCounts['UPDATE_ROUTE'] || 0;
      var deleteCount = actionCounts['DELETE_ROUTE'] || 0;
      var geomCount = actionCounts['EDIT_GEOMETRY'] || 0;
      html += statCard('fa-plus-circle', 'green', createCount + '', 'Routes crÃ©Ã©es', '');
      html += statCard('fa-pen', 'blue', (updateCount + geomCount) + '', 'Modifications', '');
      html += statCard('fa-trash', 'red', deleteCount + '', 'Suppressions', '');
      html += '</div>';

      /* Tableau d'audit */
      html += '<div class="admin-panel" style="margin-top:4px"><div class="panel-header"><h3><i class="fas fa-clock-rotate-left"></i> DerniÃ¨res modifications</h3></div>'
        + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Date</th><th>Utilisateur</th><th>Action</th><th>Route</th><th>DÃ©tails</th>'
        + '</tr></thead><tbody>';

      if (entries.length === 0) {
        html += '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:30px">Aucune modification enregistrÃ©e</td></tr>';
      } else {
        entries.forEach(function(e) {
          var date = new Date(e.timestamp);
          var dateStr = date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          var actionLabel = SIGAuditTrail.getActionLabel(e.action);
          var actionIcon = SIGAuditTrail.getActionIcon(e.action);
          html += '<tr>'
            + '<td>' + dateStr + '</td>'
            + '<td>' + esc(e.user) + '</td>'
            + '<td><i class="fas ' + actionIcon + '" style="margin-right:4px"></i> ' + actionLabel + '</td>'
            + '<td>' + esc(e.featureName || e.featureId || 'â€”') + '</td>'
            + '<td>' + esc(e.details || 'â€”') + '</td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';
    } else {
      html += '<div class="admin-panel"><div class="panel-body"><div class="empty-state">'
        + '<i class="fas fa-clipboard-list"></i>'
        + '<h3>Module d\'audit non chargÃ©</h3>'
        + '<p>Le module SIGAuditTrail V3.0 n\'est pas disponible sur cette page.</p>'
        + '</div></div></div>';
    }

    return html;
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Alias court utilisÃ© dans les pages */
  function esc(s) { return escHtml(s); }

  /* ===== HELPERS ===== */

  function statCard(icon, color, value, label, trend) {
    var trendHtml = trend === 'up'
      ? '<div class="sc-trend up"><i class="fas fa-arrow-up"></i></div>'
      : (trend === 'down'
        ? '<div class="sc-trend down"><i class="fas fa-arrow-down"></i></div>'
        : '');
    return '<div class="stat-card-admin">'
      + '<div class="sc-icon ' + color + '"><i class="fas ' + icon + '"></i></div>'
      + '<div class="sc-value">' + value + '</div>'
      + '<div class="sc-label">' + label + '</div>'
      + trendHtml
      + '</div>';
  }

  function pageHeader(title, subtitle) {
    return '<div class="page-header"><h1>' + title + '</h1><p>' + subtitle + '</p></div>';
  }

  function emptyState(icon, title, desc, btnText) {
    return '<div class="admin-panel"><div class="panel-body">'
      + '<div class="empty-state">'
      + '<i class="fas ' + icon + '"></i>'
      + '<h3>' + title + '</h3>'
      + '<p>' + desc + '</p>'
      + '<button class="btn-outline" disabled><i class="fas fa-plus"></i> ' + btnText + '</button>'
      + '</div></div></div>';
  }

  function uploadCard(icon, title, desc, btnText) {
    return '<div class="admin-panel"><div class="panel-body" style="text-align:center;padding:40px 24px">'
      + '<div class="sc-icon gold" style="margin:0 auto 14px"><i class="fas ' + icon + '"></i></div>'
      + '<h3 style="font-size:1rem;font-weight:600;margin-bottom:4px">' + title + '</h3>'
      + '<p style="font-size:.82rem;color:var(--text-3);margin-bottom:16px">' + desc + '</p>'
      + '<button class="btn-sm primary" disabled>' + btnText + '</button>'
      + '</div></div>';
  }

  function layerRow(name, count, type, status) {
    return '<tr><td><strong>' + name + '</strong></td><td>' + count + '</td><td>' + type + '</td>'
      + '<td><span class="status-badge ' + status + '">Active</span></td></tr>';
  }

  function settingsCard(icon, title, value, status, statusClass) {
    return '<div class="admin-panel"><div class="panel-body" style="padding:20px 24px">'
      + '<div style="display:flex;align-items:center;gap:14px">'
      + '<div class="sc-icon gold"><i class="fas ' + icon + '"></i></div>'
      + '<div style="flex:1"><div style="font-weight:600;font-size:.92rem">' + title + '</div>'
      + '<div style="font-size:.82rem;color:var(--text-3)">' + value + '</div></div>'
      + '<span class="status-badge ' + statusClass + '">' + status + '</span>'
      + '</div></div></div>';
  }

  /* Mapping page â†’ fonction */
  var pageMap = {
    'dashboard': pageDashboard,
    'ajout': function() { return AjoutModule.render(); },
    'routes': pageRoutes,
    'emprises': pageEmprises,
    'pk': pagePK,
    'spatial': pageSpatial,
    'audit': function() { return AuditAdmin.render(); },
    'users': function() { return UserAdmin.render(); },
    'tableau': pageDashboard,
    'settings': function() { return SettingsAdmin.render(); }
  };

  /* Descriptions d'aide et labels pour chaque module */
  var PAGE_LABELS_HELP = {
    'dashboard':  { label: 'Tableau de bord', help: null },
    'ajout':     { label: 'AJOUT', help: "Point d\u2019entr\u00e9e unique de cr\u00e9ation des donn\u00e9es du syst\u00e8me. Toute cr\u00e9ation passe obligatoirement par le moteur SIG." },
    'routes':     { label: 'Gestion des routes', help: 'Consultez, modifiez et gÃ©rez les tronÃ§ons du rÃ©seau routier national. Chaque route dispose d\'attributs dÃ©taillÃ©s : nom, code, catÃ©gorie (RN, RR, RC, RL, CU), rÃ©gion, longueur et Ã©tat.' },
    'emprises':   { label: 'Gestion des emprises', help: 'Gestion des zones d\'emprise du domaine public routier du MinistÃ¨re des Travaux Publics. Les emprises dÃ©limitent la largeur de terrain nÃ©cessaire Ã  la construction et l\'entretien des routes.' },
    'pk':         { label: 'Points kilomÃ©triques', help: 'RÃ©fÃ©rencement et localisation des points kilomÃ©triques (PK) le long du rÃ©seau. Les PK servent de repÃ¨res pour la signalisation et les interventions d\'entretien.' },
    'spatial':    { label: 'DonnÃ©es spatiales', help: 'Importez et exportez vos donnÃ©es gÃ©ographiques en GeoJSON et CSV. Le moteur dÃ©tecte automatiquement les colonnes de coordonnÃ©es et le systÃ¨me de projection.' },
    'audit':      { label: 'Journal d\'audit', help: 'Historique des modifications apportÃ©es au rÃ©seau routier. Chaque action (crÃ©ation, modification, suppression, import, export) est enregistrÃ©e avec l\'utilisateur, la date et les dÃ©tails.' },
    'users':      { label: 'Gestion des utilisateurs', help: 'Administration des comptes et des rÃ´les d\'accÃ¨s Ã  la plateforme GeoROAD du MinistÃ¨re des Travaux Publics.' },
    'tableau':    { label: 'Tableau de bord', help: null },
    'settings':   { label: 'ParamÃ¨tres', help: 'Configuration gÃ©nÃ©rale de la plateforme : systÃ¨me de projection, base de donnÃ©es, authentification et sÃ©curitÃ©.' }
  };

  /** Retourne le HTML d'une page donnÃ©e. */
  function render(pageKey) {
    var fn = pageMap[pageKey];
    if (fn) return fn();
    return pageHeader('Page non trouvÃ©e', '') + emptyState('fa-circle-exclamation', 'Page en cours de dÃ©veloppement', 'Cette section sera disponible prochainement.', 'Retour');
  }

  /** VÃ©rifie si une page existe. */
  function exists(pageKey) {
    return !!pageMap[pageKey];
  }

  /** Retourne le texte d'aide pour une page. */
  function getHelp(pageKey) {
    var entry = PAGE_LABELS_HELP[pageKey];
    return entry ? entry.help : null;
  }

  /** Retourne le label de page pour le fil d'Ariane et l'aide. */
  function getLabel(pageKey) {
    var entry = PAGE_LABELS_HELP[pageKey];
    return entry ? entry.label : pageKey;
  }

  return {
    render: render,
    exists: exists,
    getHelp: getHelp,
    getLabel: getLabel,
    PAGE_LABELS_HELP: PAGE_LABELS_HELP
  };
})();

/* -------------------------------------------------------------------
 * UTIL : Normalisation d'encodage (correction mojibake)
 * ------------------------------------------------------------------- */
function decodeMojibakeText(text) {
  if (typeof text !== 'string') return text;
  if (text.indexOf('Ãƒ') === -1 && text.indexOf('Ã¢') === -1 && text.indexOf('Ã‚') === -1) {
    return text;
  }
  try {
    return decodeURIComponent(escape(text));
  } catch(e) {
    return text;
  }
}

function normalizeMojibakeInNode(root) {
  if (!root || typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') return;
  var showText = (typeof NodeFilter !== 'undefined' && NodeFilter.SHOW_TEXT) ? NodeFilter.SHOW_TEXT : 4;
  var walker = document.createTreeWalker(root, showText, null, false);
  var node = null;
  while ((node = walker.nextNode())) {
    var fixed = decodeMojibakeText(node.nodeValue || '');
    if (fixed !== node.nodeValue) {
      node.nodeValue = fixed;
    }
  }
}


/* -------------------------------------------------------------------
 * MODULE : AdminUI
 * Gestion de l'interface utilisateur : navigation, sidebar, topbar.
 * ------------------------------------------------------------------- */
var AdminUI = (function() {
  'use strict';

  var currentPage = 'dashboard';
  var sidebarCollapsed = false;

  /* Labels pour le fil d'Ariane et l'aide â€” partagÃ©s avec AdminPages */
  var _labelsRef = function() { return (typeof AdminPages !== 'undefined' && AdminPages.PAGE_LABELS_HELP) ? AdminPages.PAGE_LABELS_HELP : null; };

  function syncCurrentUserActivity() {
    if (typeof UserAdmin === 'undefined' || typeof UserAdmin.recordActivity !== 'function') return;
    var session = AdminAuth.getSession();
    if (!session) return;

    var userId = session.userId;
    if (!userId && typeof UserAdmin.findByUsername === 'function') {
      var matchedUser = UserAdmin.findByUsername(session.user || session.username || session.name);
      if (matchedUser) {
        userId = matchedUser.id;
        session.userId = matchedUser.id;
        session.name = session.name || matchedUser.name;
        session.role = session.role || matchedUser.role;
        sessionStorage.setItem('georoad_auth', JSON.stringify(session));
      }
    }

    if (userId) {
      try { UserAdmin.recordActivity(userId); } catch(e) {}
    }
  }

  /**
   * Initialise l'interface d'administration.
   * VÃ©rifie l'authentification, charge le dashboard, configure le user.
   */
  function init() {
    /* Garde d'authentification */
    if (!AdminAuth.requireAuth()) return;

    /* Charger les donnÃ©es GeoJSON nÃ©cessaires pour le dashboard */
    loadRequiredData();

    /* Initialize SIG Core */
    if (typeof SIGDataEngine !== 'undefined') {
      SIGDataEngine.initialize();
    }

    /* Afficher le user dans la topbar */
    var session = AdminAuth.getSession();
    if (session) {
      var nameEl = document.getElementById('userName');
      var roleEl = document.getElementById('userRole');
      var avatarEl = document.getElementById('userAvatar');
      if (nameEl) nameEl.textContent = session.name || 'Utilisateur';
      if (roleEl) roleEl.textContent = session.role || '';
      if (avatarEl) avatarEl.textContent = (session.name || 'U').charAt(0).toUpperCase();
    }

    syncCurrentUserActivity();

    /* Naviguer vers la page demandÃ©e */
    var initialPage = 'dashboard';
    var hash = window.location.hash.replace('#', '');
    if (hash && AdminPages.exists(hash)) {
      initialPage = hash;
    }
    navigate(initialPage);
    normalizeMojibakeInNode(document.body);
  }

  /**
   * Charge les scripts de donnÃ©es GeoJSON requis.
   * Futur : remplacÃ© par des appels API fetch().
   */
  function loadRequiredData() {
    /* Les donnÃ©es sont dÃ©jÃ  chargÃ©es via <script> sur la page publique.
     * Sur la page admin, on les charge dynamiquement si absentes. */
    var requiredScripts = [
      'layers/Rgion_2.js',
      'layers/Rseauroutier_6.js',
      'layers/Emprise_5.js',
      'layers/Prfecture_3.js',
      'layers/Canton_4.js'
    ];

    var loaded = 0;
    var toLoad = [];

    requiredScripts.forEach(function(src) {
      var varName = 'json_' + src.split('/').pop().replace('.js', '');
      if (typeof window[varName] === 'undefined') {
        toLoad.push(src);
      }
    });

    /* Si toutes les donnÃ©es sont dÃ©jÃ  disponibles, on initialise */
    if (toLoad.length === 0) {
      onAllDataLoaded();
      return;
    }

    /* Charger les scripts manquants en sÃ©quence */
    toLoad.forEach(function(src) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function() {
        loaded++;
        if (loaded === toLoad.length) onAllDataLoaded();
      };
      script.onerror = function() {
        loaded++;
        if (loaded === toLoad.length) onAllDataLoaded();
      };
      document.head.appendChild(script);
    });
  }

  /** Callback quand toutes les donnÃ©es sont prÃªtes. */
  function onAllDataLoaded() {
    /* Les donnÃ©es sont prÃªtes â€” le dashboard est dÃ©jÃ  rendu via navigate() */
  }

  /**
   * Navigue vers une page de l'administration.
   * @param {string} pageKey - ClÃ© de la page (ex: 'dashboard', 'routes')
   */
  function navigate(pageKey) {
    if (!AdminPages.exists(pageKey)) return;
    currentPage = pageKey;

    /* Garder le hash synchronisÃ© pour les modules qui se rafraÃ®chissent sur la page courante */
    try {
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', '#' + pageKey);
      } else {
        window.location.hash = pageKey;
      }
    } catch(e) {}

    /* Mettre Ã  jour le contenu */
    var contentEl = document.getElementById('adminContent');
    if (contentEl) {
      contentEl.innerHTML = AdminPages.render(pageKey);
      contentEl.scrollTop = 0;
      normalizeMojibakeInNode(contentEl);
    }

    /* Mettre Ã  jour le menu actif */
    var items = document.querySelectorAll('.nav-item[data-page]');
    items.forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-page') === pageKey);
    });

    /* Mettre Ã  jour le fil d'Ariane */
    var bc = document.getElementById('breadcrumb-current');
    if (bc) {
      var labels = _labelsRef();
      var label = labels && labels[pageKey] ? labels[pageKey].label : pageKey;
      bc.textContent = label;
    }

    /* Mettre Ã  jour les badges de compteurs dans la sidebar */
    refreshNavBadges();

    /* Fermer le sidebar mobile si ouvert */
    closeMobileSidebar();
    syncCurrentUserActivity();
  }

  /** Met Ã  jour dynamiquement les compteurs de la sidebar depuis les donnÃ©es rÃ©elles. */
  function refreshNavBadges() {
    var routeBadge = document.getElementById('nav-routes-count');
    if (routeBadge && typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) {
      routeBadge.textContent = json_Rseauroutier_6.features.length;
    }
    var empBadge = document.getElementById('nav-emprises-count');
    if (empBadge && typeof json_Emprise_5 !== 'undefined' && json_Emprise_5.features) {
      empBadge.textContent = json_Emprise_5.features.length;
    }
    var pkBadge = document.getElementById('nav-pk-count');
    if (pkBadge) {
      var pkCount = 0;
      if (typeof SIGPersistence !== 'undefined') {
        try {
          var pkFC = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
          if (pkFC && pkFC.features) pkCount = pkFC.features.length;
        } catch(e) {}
      }
      pkBadge.textContent = pkCount;
    }
  }

  /** Bascule la sidebar entre Ã©tendue et rÃ©duite. */
  function toggleSidebar() {
    var sidebar = document.getElementById('adminSidebar');
    if (!sidebar) return;

    /* Sur mobile, on utilise le mode overlay */
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
      var overlay = document.getElementById('sidebarOverlay');
      if (overlay) overlay.classList.toggle('show', sidebar.classList.contains('mobile-open'));
      return;
    }

    /* Sur desktop, on collapse */
    sidebarCollapsed = !sidebarCollapsed;
    sidebar.classList.toggle('collapsed', sidebarCollapsed);
  }

  /** Ferme le sidebar en mode mobile. */
  function closeMobileSidebar() {
    var sidebar = document.getElementById('adminSidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('show');
  }

  /** Affiche l'aide contextuelle pour la page courante. */
  function showHelp() {
    var helpText = AdminPages.getHelp(currentPage);
    if (!helpText) {
      helpText = 'Aide non disponible pour cette page.';
    }
    /* CrÃ©er un modal d'aide simple */
    var existing = document.getElementById('help-modal');
    if (existing) existing.parentNode.removeChild(existing);
    var div = document.createElement('div');
    div.id = 'help-modal';
    div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:20px;';
    div.innerHTML = '<div style="background:var(--white);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);width:100%;max-width:480px;padding:32px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
      + '<h3 style="font-size:1rem;font-weight:700"><i class="fas fa-circle-question" style="color:var(--gold);margin-right:8px"></i>Aide â€” ' + (AdminPages.getLabel(currentPage) || currentPage) + '</h3>'
      + '<button onclick="document.getElementById(\'help-modal\').parentNode.removeChild(document.getElementById(\'help-modal\'))" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--text-3);padding:4px"><i class="fas fa-times"></i></button></div>'
      + '<p style="font-size:.88rem;color:var(--text-2);line-height:1.6">' + helpText + '</p></div>';
    div.addEventListener('click', function(e) { if (e.target === div) div.parentNode.removeChild(div); });
    document.body.appendChild(div);
  }

  return {
    init: init,
    navigate: navigate,
    toggleSidebar: toggleSidebar,
    closeMobileSidebar: closeMobileSidebar,
    showHelp: showHelp,
    refreshNavBadges: refreshNavBadges,
    getCurrentPage: function() { return currentPage; }
  };
})();


/* -------------------------------------------------------------------
 * INITIALISATION AU CHARGEMENT DE LA PAGE
 * ------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
  AdminUI.init();

  /* Abonnement au SIGEventBus pour rafraÃ®chir dynamiquement les compteurs
     et la page courante quand une feature est crÃ©Ã©e/modifiÃ©e/supprimÃ©e. */
  if (typeof SIGEventBus !== 'undefined') {
    var refreshTimer = null;
    var scheduleRefresh = function() {
      /* Debounce : si plusieurs events arrivent en rafale, on ne refresh qu'une fois */
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function() {
        AdminUI.refreshNavBadges();
        /* Re-render la page courante pour reflÃ©ter les changements */
        var contentEl = document.getElementById('adminContent');
        if (contentEl && typeof AdminPages !== 'undefined') {
          var pageKey = (typeof AdminUI !== 'undefined' && typeof AdminUI.getCurrentPage === 'function')
            ? AdminUI.getCurrentPage()
            : (window.location.hash.replace('#', '') || 'dashboard');
          if (AdminPages.exists(pageKey)) {
            contentEl.innerHTML = AdminPages.render(pageKey);
            normalizeMojibakeInNode(contentEl);
          }
        }
      }, 200);
    };
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, scheduleRefresh);
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, scheduleRefresh);
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, scheduleRefresh);
    SIGEventBus.on(SIGEventBus.EVENTS.DASHBOARD_REFRESH, scheduleRefresh);
  }
});

/* ==== END admin.js ==== */

/* ==== BEGIN admin-routes.js ==== */
/* ===================================================================
 * GeoROAD TOGO â€” Module Gestion des Routes
 * 
 * CRUD complet pour les tronÃ§ons routiers.
 * Architecture prÃ©parÃ©e pour PostgreSQL/PostGIS :
 *   - Remplacer RouteStore par des appels fetch('/api/routes')
 *   - Garder la mÃªme interface (getById, getAll, save, remove)
 * =================================================================== */
var RouteModule = (function() {
  'use strict';

  /* ===== CONFIGURATION ===== */
  var PER_PAGE = 10;

  var CAT_LABELS = {
    'CU': 'Route Communautaire',
    'RN': 'Route Nationale',
    'RR': 'Route RÃ©gionale',
    'RC': 'Route Communale',
    'RL': 'Route Locale'
  };

  var CAT_CSS = { 'CU': 'cu', 'RN': 'rn', 'RR': 'rr', 'RC': 'rc', 'RL': 'rl' };

  /* Ã‰tiquettes pour les filtres (valeurs possibles) */
  var ETAT_OPTIONS = ['Bon', 'Moyen', 'Mauvais', 'En travaux'];
  var REVET_OPTIONS = ['Bitume', 'Terre', 'Gravier', 'Non revÃªtu'];

  /* ===== Ã‰TAT INTERNE ===== */
  var state = {
    allRoutes: [],       /* Array de {id, properties, geometry} */
    filtered: [],        /* RÃ©sultat aprÃ¨s filtres */
    page: 1,
    search: '',
    filters: { region: '', classe: '', etat: '', revetement: '' }
  };

  /* ===== DATA ACCESS LAYER =====
   * Couche d'abstraction : les donnÃ©es viennent de la variable globale
   * json_Rseauroutier_6. Futur : remplacer par fetch('/api/routes').
   */
  function loadData() {
    if (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) {
      state.allRoutes = json_Rseauroutier_6.features.map(function(f, idx) {
        return {
          id: (f.id !== undefined && f.id !== null) ? String(f.id) : ('route_' + idx),
          properties: Object.assign({}, f.properties),
          geometry: f.geometry ? JSON.parse(JSON.stringify(f.geometry)) : null
        };
      });
    }
    /* Ajouter les champs manquants avec valeurs par dÃ©faut */
    state.allRoutes.forEach(function(r) {
      if (!r.properties.Code) r.properties.Code = '';
      if (!r.properties.Origine) {
        var parts = (r.properties.Name || '').split('-');
        r.properties.Origine = parts[0] ? parts[0].trim() : '';
        r.properties.Destination = parts[1] ? parts[1].trim() : '';
      }
      if (!r.properties.Destination) {
        var parts2 = (r.properties.Name || '').split('-');
        r.properties.Destination = parts2[1] ? parts2[1].trim() : '';
      }
      if (!r.properties.Largeur) r.properties.Largeur = '';
      if (!r.properties.Etat) r.properties.Etat = '';
      if (!r.properties.Revetement) r.properties.Revetement = '';
      if (!r.properties.Prefecture) r.properties.Prefecture = '';
      if (!r.properties.Communes) r.properties.Communes = '';
      if (!r.properties.Pop_Dessertie) r.properties.Pop_Dessertie = '';
      if (!r.properties.Observations) r.properties.Observations = '';
    });
    applyFilters();
  }

  /** Sauvegarde dans le store local (futur : PUT /api/routes/:id). */
  function saveRoute(routeData) {
    var idx = -1;
    for (var i = 0; i < state.allRoutes.length; i++) {
      if (String(state.allRoutes[i].id) === String(routeData.id)) { idx = i; break; }
    }
    if (idx >= 0) {
      state.allRoutes[idx].properties = Object.assign(state.allRoutes[idx].properties, routeData.properties);
      if (routeData.geometry) state.allRoutes[idx].geometry = routeData.geometry;
      syncToGlobal();
    }
  }

  /** Ajoute une nouvelle route (futur : POST /api/routes). */
  function addRoute(routeData) {
    var newId = routeData.id || ('route_' + Date.now());
    var newRoute = {
      id: newId,
      properties: Object.assign({}, routeData.properties),
      geometry: routeData.geometry || null
    };
    state.allRoutes.push(newRoute);
    syncToGlobal();
    return newId;
  }

  /** Supprime une route (futur : DELETE /api/routes/:id). */
  function removeRoute(id) {
    state.allRoutes = state.allRoutes.filter(function(r) { return String(r.id) !== String(id); });
    syncToGlobal();
  }

  /** Synchronise vers la variable globale (utilisÃ© par le gÃ©oportail public). */
  function syncToGlobal() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      json_Rseauroutier_6.features = state.allRoutes.map(function(r) {
        return { type: 'Feature', id: r.id, properties: r.properties, geometry: r.geometry };
      });
      if (typeof SIGPersistence !== 'undefined') {
        try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6); } catch(e) {}
      }
      /* Mettre Ã  jour le badge dans la sidebar */
      var badge = document.querySelector('.nav-item[data-page="routes"] .nav-badge');
      if (badge) badge.textContent = state.allRoutes.length;
    }
  }

  /* ===== FILTRAGE & RECHERCHE ===== */
  function applyFilters() {
    var s = state.search.toLowerCase();
    var f = state.filters;

    state.filtered = state.allRoutes.filter(function(r) {
      var p = r.properties;
      /* Recherche textuelle */
      if (s) {
        var haystack = ((p.Name || '') + ' ' + (p.Code || '') + ' ' + (p.Origine || '') + ' ' + (p.Destination || '') + ' ' + (p.REGIONS || '')).toLowerCase();
        if (haystack.indexOf(s) === -1) return false;
      }
      /* Filtres */
      if (f.region && p.REGIONS !== f.region) return false;
      if (f.classe && p.CLASSE !== f.classe) return false;
      if (f.etat && p.Etat !== f.etat) return false;
      if (f.revetement && p.Revetement !== f.revetement) return false;
      return true;
    });

    if (state.page > totalPages()) state.page = 1;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / PER_PAGE));
  }

  function getPageData() {
    var start = (state.page - 1) * PER_PAGE;
    return state.filtered.slice(start, start + PER_PAGE);
  }

  function getUniqueValues(key) {
    var vals = {};
    state.allRoutes.forEach(function(r) {
      var v = r.properties[key];
      if (v && v.trim()) vals[v.trim()] = true;
    });
    return Object.keys(vals).sort();
  }

  /* ===== NOTIFICATION TOAST ===== */
  function notify(msg, type) {
    type = type || 'success';
    var existing = document.getElementById('route-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'route-toast';
    toast.className = 'route-toast ' + type;
    var icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    toast.innerHTML = '<i class="fas ' + icon + '"></i> ' + msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3000);
  }

  /* ===== RENDU HTML ===== */

  /** Point d'entrÃ©e principal â€” rend la page complÃ¨te. */
  function render() {
    loadData();
    return buildPage();
  }

  function buildPage() {
    var totalKm = 0;
    state.allRoutes.forEach(function(r) { totalKm += ((r.properties.LONGEUR || 0) / 1000); });

    var html = '<div class="page-header">'
      + '<h1>Gestion des routes</h1>'
      + '<p>Consultation, modification et gestion des ' + state.allRoutes.length + ' tronÃ§ons routiers â€” ' + totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km au total</p>'
      + '</div>';

    /* Barre d'actions : recherche + boutons */
    html += '<div class="routes-toolbar">';
    html += '<div class="routes-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="route-search-input" placeholder="Rechercher par nom, code, origine, destination..." value="' + escapeAttr(state.search) + '" oninput="RouteModule.onSearch(this.value)">';
    html += '</div>';
    html += '<div class="routes-actions">';
    html += '<button class="btn-sm ghost" onclick="RouteModule.exportCSV()"><i class="fas fa-file-csv"></i> Export CSV</button>';
    /* Bouton "Nouvelle route" supprimÃ© â€” sera rÃ©intÃ©grÃ© sous le module "AJOUT" */
    html += '</div></div>';

    /* Filtres */
    html += buildFilters();

    /* Tableau */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-list"></i> TronÃ§ons routiers <span style="font-weight:400;color:var(--text-4);font-size:.82rem;margin-left:8px">(' + state.filtered.length + ' rÃ©sultat' + (state.filtered.length > 1 ? 's' : '') + ')</span></h3></div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>Nom</th><th>Code</th><th>CatÃ©gorie</th><th>RÃ©gion</th><th>Longueur</th><th>Emprise</th><th>Ã‰tat</th><th style="text-align:right">Actions</th>';
    html += '</tr></thead><tbody id="routes-tbody">';

    var rows = getPageData();
    if (rows.length === 0) {
      html += '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-4)">Aucun tronÃ§on trouvÃ©.</td></tr>';
    } else {
      rows.forEach(function(r) {
        html += buildRow(r);
      });
    }

    html += '</tbody></table></div>';

    /* Pagination */
    html += buildPagination();

    html += '</div>';

    return html;
  }

  function buildFilters() {
    var regions = getUniqueValues('REGIONS');
    var classes = ['CU', 'RN', 'RR', 'RC', 'RL'];
    var html = '<div class="routes-filters">';
    html += filterSelect('region', 'RÃ©gion', regions, state.filters.region, '-- Toutes --');
    html += filterSelect('classe', 'CatÃ©gorie', classes, state.filters.classe, '-- Toutes --', CAT_LABELS);
    html += filterSelect('etat', 'Ã‰tat', ETAT_OPTIONS, state.filters.etat, '-- Tous --');
    html += filterSelect('revetement', 'RevÃªtement', REVET_OPTIONS, state.filters.revetement, '-- Tous --');
    html += '<button class="btn-sm ghost" onclick="RouteModule.resetFilters()" style="white-space:nowrap"><i class="fas fa-rotate-left"></i> RÃ©initialiser</button>';
    html += '</div>';
    return html;
  }

  function filterSelect(key, label, options, current, placeholder, labelMap) {
    var html = '<div class="filter-group">';
    html += '<label>' + label + '</label>';
    html += '<select onchange="RouteModule.onFilter(\'' + key + '\', this.value)">';
    html += '<option value="">' + placeholder + '</option>';
    options.forEach(function(o) {
      var sel = o === current ? ' selected' : '';
      var display = labelMap ? (labelMap[o] || o) : o;
      html += '<option value="' + escapeAttr(o) + '"' + sel + '>' + escapeHtml(display) + '</option>';
    });
    html += '</select></div>';
    return html;
  }

  function buildRow(r) {
    var p = r.properties;
    var km = ((p.LONGEUR || 0) / 1000).toFixed(1);
    var catLabel = CAT_LABELS[p.CLASSE] || p.CLASSE || 'â€”';
    var etatClass = !p.Etat ? '' : (p.Etat === 'Bon' ? 'active' : (p.Etat === 'Mauvais' ? 'inactive' : 'pending'));
    var routeId = jsArg(r.id);

    var html = '<tr>';
    html += '<td><strong style="cursor:pointer;color:var(--gold-dark)" onclick="RouteModule.viewRoute(' + routeId + ')" title="Voir la fiche">' + escapeHtml(p.Name || 'â€”') + '</strong></td>';
    html += '<td>' + escapeHtml(p.Code || 'â€”') + '</td>';
    html += '<td><span class="cat-dot cat-' + (CAT_CSS[p.CLASSE] || '') + '"></span> ' + escapeHtml(catLabel) + '</td>';
    html += '<td>' + escapeHtml(p.REGIONS || 'â€”') + '</td>';
    html += '<td>' + km + ' km</td>';
    html += '<td>' + (p.EMPRISE || 'â€”') + ' m</td>';
    html += '<td>' + (p.Etat ? '<span class="status-badge ' + etatClass + '">' + escapeHtml(p.Etat) + '</span>' : '<span style="color:var(--text-4)">â€”</span>') + '</td>';
    html += '<td style="text-align:right;white-space:nowrap">';
    html += '<button class="btn-icon" title="Voir" onclick="RouteModule.viewRoute(' + routeId + ')"><i class="fas fa-eye"></i></button>';
    html += '<button class="btn-icon" title="Modifier" onclick="RouteModule.openEditForm(' + routeId + ')"><i class="fas fa-pen"></i></button>';
    html += '<button class="btn-icon danger" title="Supprimer" onclick="RouteModule.confirmDelete(' + routeId + ')"><i class="fas fa-trash"></i></button>';
    html += '</td></tr>';
    return html;
  }

  function buildPagination() {
    var tp = totalPages();
    if (tp <= 1) return '';
    var html = '<div class="routes-pagination">';
    html += '<span class="pag-info">Page ' + state.page + ' / ' + tp + ' (' + state.filtered.length + ' rÃ©sultat' + (state.filtered.length > 1 ? 's' : '') + ')</span>';
    html += '<div class="pag-buttons">';
    html += '<button class="btn-sm ghost" ' + (state.page <= 1 ? 'disabled' : '') + ' onclick="RouteModule.goPage(' + (state.page - 1) + ')"><i class="fas fa-chevron-left"></i></button>';
    /* Page numbers (max 7 visible) */
    var pages = getPaginationRange(state.page, tp);
    pages.forEach(function(pg) {
      if (pg === '...') {
        html += '<span class="pag-dots">...</span>';
      } else {
        var cls = pg === state.page ? 'primary' : 'ghost';
        html += '<button class="btn-sm ' + cls + '" onclick="RouteModule.goPage(' + pg + ')">' + pg + '</button>';
      }
    });
    html += '<button class="btn-sm ghost" ' + (state.page >= tp ? 'disabled' : '') + ' onclick="RouteModule.goPage(' + (state.page + 1) + ')"><i class="fas fa-chevron-right"></i></button>';
    html += '</div></div>';
    return html;
  }

  function getPaginationRange(current, total) {
    if (total <= 7) {
      var arr = [];
      for (var i = 1; i <= total; i++) arr.push(i);
      return arr;
    }
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  /* ===== MODALES ===== */

  /** Modale de visualisation (fiche complÃ¨te). */
  function viewRoute(id) {
    var route = findRoute(id);
    if (!route) return;
    closeModal('modal-route-view');
    var p = route.properties;
    var km = ((p.LONGEUR || 0) / 1000).toFixed(2);

    var html = '<div class="modal-admin-overlay" id="modal-route-view" onclick="RouteModule.closeModalOnOverlay(event, \'modal-route-view\')">';
    html += '<div class="modal-admin">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-road" style="color:var(--gold);margin-right:8px"></i> Fiche route</h2><button class="modal-admin-close" onclick="RouteModule.closeModal(\'modal-route-view\')"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body">';
    html += '<div class="detail-grid">';
    html += detailField('Nom de la route', p.Name);
    html += detailField('Code', p.Code || 'â€”');
    html += detailField('Origine', p.Origine || 'â€”');
    html += detailField('Destination', p.Destination || 'â€”');
    html += detailField('CatÃ©gorie', CAT_LABELS[p.CLASSE] || p.CLASSE || 'â€”');
    html += detailField('Longueur', km + ' km');
    html += detailField('Largeur', p.Largeur ? p.Largeur + ' m' : 'â€”');
    html += detailField('Emprise', (p.EMPRISE || 'â€”') + ' m');
    html += detailField('Type de revÃªtement', p.Revetement || 'â€”');
    html += detailField('Ã‰tat', p.Etat || 'â€”');
    html += detailField('RÃ©gion', p.REGIONS || 'â€”');
    html += detailField('PrÃ©fecture', p.Prefecture || 'â€”');
    html += detailField('Communes', p.Communes || 'â€”');
    html += detailField('Population desservie', p.Pop_Dessertie ? Number(p.Pop_Dessertie).toLocaleString('fr-FR') + ' hab' : 'â€”');
    html += detailField('PK DÃ©but', p.PK_DEB_X ? p.PK_DEB_X + ', ' + p.PK_DEB_Y : 'â€”');
    html += detailField('PK Fin', p.PK_FIN_X ? p.PK_FIN_X + ', ' + p.PK_FIN_Y : 'â€”');
    html += '</div>';
    html += detailField('Observations', p.Observations || 'â€”', true);
    html += '</div>';
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="RouteModule.closeModal(\'modal-route-view\')">Fermer</button>';
    html += '<button class="btn-sm primary" onclick="RouteModule.closeModal(\'modal-route-view\');RouteModule.openEditForm(' + jsArg(id) + ')"><i class="fas fa-pen"></i> Modifier</button></div>';
    html += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Formulaire d'ajout. */
  function openAddForm() {
    openForm(null);
  }

  /** Formulaire de modification. */
  function openEditForm(id) {
    var route = findRoute(id);
    if (!route) return;
    openForm(route);
  }

  function openForm(route) {
    var isEdit = !!route;
    var p = route ? route.properties : {};
    var title = isEdit ? 'Modifier la route' : 'Ajouter une route';
    var formId = 'route-form-' + safeDomId(isEdit ? route.id : 'new');

    closeModal('modal-route-form');

    var html = '<div class="modal-admin-overlay" id="modal-route-form" onclick="RouteModule.closeModalOnOverlay(event, \'modal-route-form\')">';
    html += '<div class="modal-admin" style="max-width:720px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-' + (isEdit ? 'pen' : 'plus') + '" style="color:var(--gold);margin-right:8px"></i> ' + title + '</h2><button class="modal-admin-close" onclick="RouteModule.closeModal(\'modal-route-form\')"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><form id="' + formId + '" onsubmit="return RouteModule.saveForm(event, ' + (isEdit ? jsArg(route.id) : 'null') + ')">';

    /* Ligne 1 */
    html += formRow(
      formGroup('Nom de la route *', '<input type="text" name="Name" required value="' + escapeAttr(p.Name || '') + '" placeholder="Ex: LomÃ©-SokodÃ©">'),
      formGroup('Code', '<input type="text" name="Code" value="' + escapeAttr(p.Code || '') + '" placeholder="Ex: RN1">')
    );

    /* Ligne 2 */
    html += formRow(
      formGroup('Origine', '<input type="text" name="Origine" value="' + escapeAttr(p.Origine || '') + '" placeholder="Ex: LomÃ©">'),
      formGroup('Destination', '<input type="text" name="Destination" value="' + escapeAttr(p.Destination || '') + '" placeholder="Ex: SokodÃ©">')
    );

    /* Ligne 3 */
    html += formRow(
      formGroup('CatÃ©gorie *', formSelect('CLASSE', [['CU','Route Communautaire'],['RN','Route Nationale'],['RR','Route RÃ©gionale'],['RC','Route Communale'],['RL','Route Locale']], p.CLASSE || 'CU')),
      formGroup('RÃ©gion *', formSelect('REGIONS', getRegionOptions(), p.REGIONS || ''))
    );

    /* Ligne 4 */
    html += formRow(
      formGroup('Longueur (m) *', '<input type="number" name="LONGEUR" step="any" required value="' + escapeAttr(formatNumericInputValue(p.LONGEUR)) + '" placeholder="Ex: 52197">'),
      formGroup('Largeur (m)', '<input type="number" name="Largeur" step="any" value="' + escapeAttr(formatNumericInputValue(p.Largeur)) + '" placeholder="Ex: 7">')
    );

    /* Ligne 5 */
    html += formRow(
      formGroup('Emprise (m)', '<input type="number" name="EMPRISE" step="any" value="' + escapeAttr(formatNumericInputValue(p.EMPRISE)) + '" placeholder="Ex: 70">'),
      formGroup('Type de revÃªtement', formSelect('Revetement', REVET_OPTIONS.map(function(e) { return [e, e]; }).concat([['','Non dÃ©fini']]), p.Revetement || ''))
    );

    /* Ligne 6 */
    html += formRow(
      formGroup('Ã‰tat', formSelect('Etat', ETAT_OPTIONS.map(function(e) { return [e, e]; }).concat([['','Non dÃ©fini']]), p.Etat || '')),
      formGroup('PrÃ©fecture', '<input type="text" name="Prefecture" value="' + escapeAttr(p.Prefecture || '') + '" placeholder="Ex: Tchamba">')
    );

    /* Ligne 7 */
    html += formRow(
      formGroup('Communes', '<input type="text" name="Communes" value="' + escapeAttr(p.Communes || '') + '" placeholder="Ex: Tchamba, Soudou">'),
      formGroup('Population desservie', '<input type="number" name="Pop_Dessertie" value="' + escapeAttr(p.Pop_Dessertie || '') + '" placeholder="Ex: 15000">')
    );

    /* Ligne 8 : CoordonnÃ©es */
    html += formRow(
      formGroup('PK DÃ©but X', '<input type="number" name="PK_DEB_X" value="' + (p.PK_DEB_X || '') + '">'),
      formGroup('PK DÃ©but Y', '<input type="number" name="PK_DEB_Y" value="' + (p.PK_DEB_Y || '') + '">')
    );

    html += formRow(
      formGroup('PK Fin X', '<input type="number" name="PK_FIN_X" value="' + (p.PK_FIN_X || '') + '">'),
      formGroup('PK Fin Y', '<input type="number" name="PK_FIN_Y" value="' + (p.PK_FIN_Y || '') + '">')
    );

    /* Observations */
    html += '<div class="form-row-single">';
    html += formGroup('Observations', '<textarea name="Observations" rows="3" placeholder="Remarques, notes...">' + escapeHtml(p.Observations || '') + '</textarea>');
    html += '</div>';

    html += '</form></div>';
    html += '<div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="RouteModule.closeModal(\'modal-route-form\')">Annuler</button>';
    html += '<button class="btn-sm primary" type="submit" form="' + formId + '"><i class="fas fa-save"></i> ' + (isEdit ? 'Enregistrer' : 'Ajouter') + '</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Confirmation de suppression. */
  function confirmDelete(id) {
    var route = findRoute(id);
    if (!route) return;
    closeModal('modal-route-delete');
    var name = route.properties.Name || 'cette route';

    var html = '<div class="modal-admin-overlay" id="modal-route-delete">';
    html += '<div class="modal-admin" style="max-width:440px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-exclamation-triangle" style="color:var(--red);margin-right:8px"></i> Confirmer la suppression</h2><button class="modal-admin-close" onclick="RouteModule.closeModal(\'modal-route-delete\')"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body">';
    html += '<p style="font-size:.92rem;margin-bottom:8px">Vous Ãªtes sur le point de supprimer :</p>';
    html += '<p style="font-weight:700;font-size:1rem;color:var(--red);margin-bottom:16px">' + escapeHtml(name) + '</p>';
    html += '<p style="font-size:.84rem;color:var(--text-3)">Cette action est irrÃ©versible. La route sera retirÃ©e de la carte et des statistiques.</p>';
    html += '</div>';
    html += '<div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="RouteModule.closeModal(\'modal-route-delete\')">Annuler</button>';
    html += '<button class="btn-sm" style="background:var(--red);color:#fff" onclick="RouteModule.doDelete(' + jsArg(id) + ')"><i class="fas fa-trash"></i> Supprimer dÃ©finitivement</button>';
    html += '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /* ===== ACTIONS ===== */

  function doDelete(id) {
    var route = findRoute(id);
    var name = route ? (route.properties.Name || 'Route') : 'Route';
    var beforeState = route ? JSON.parse(JSON.stringify(route.properties)) : null;
    var deleted = false;

    if (route && typeof SIGDataEngine !== 'undefined') {
      deleted = !!SIGDataEngine.deleteFeature(route.id);
      if (deleted) {
        removeRoute(route.id);
      }
      if (deleted && typeof RoadSync !== 'undefined') {
        RoadSync.propagate('deleted', { fullReload: true, featureId: null });
      }
    } else {
      removeRoute(id);
      deleted = true;
      if (typeof SIGEventBus !== 'undefined') {
        SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_DELETED, { featureId: id, layer: 'routes' });
      }
      if (typeof SIGAuditTrail !== 'undefined') {
        try {
          SIGAuditTrail.log(SIGAuditTrail.ACTIONS.DELETE_ROUTE, {
            featureId: String(id),
            featureName: name,
            user: (typeof AdminAuth !== 'undefined' && AdminAuth.getSession()) ? (AdminAuth.getSession().name || 'admin') : 'admin',
            details: 'Route supprimÃ©e : ' + name,
            before: beforeState,
            after: null,
            result: 'SUCCESS'
          });
        } catch(e) {}
      }
    }

    if (!deleted) {
      notify('Impossible de supprimer cette route.', 'error');
      return;
    }

    closeModal('modal-route-delete');
    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.add('delete', 'Route supprimÃ©e', name);
    }
    notify('"' + name + '" supprimÃ©e avec succÃ¨s.', 'success');
    refresh();
  }

  function saveForm(event, id) {
    if (event) event.preventDefault();
    var form = event && event.target && event.target.tagName && event.target.tagName.toUpperCase() === 'FORM'
      ? event.target
      : document.querySelector('#modal-route-form form');
    if (!form) return false;
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) return false;

    var data = getFormData(form);
    if (typeof data.Observations === 'string') {
      data.Observations = data.Observations.trim();
    }
    if (!data.Name || !data.Name.trim()) {
      notify('Le nom de la route est obligatoire.', 'error');
      return false;
    }
    if (!data.CLASSE) {
      notify('La catÃ©gorie de la route est obligatoire.', 'error');
      return false;
    }
    if (!data.REGIONS) {
      notify('La rÃ©gion de la route est obligatoire.', 'error');
      return false;
    }
    if (!data.LONGEUR || parseFloat(data.LONGEUR) <= 0) {
      notify('La longueur de la route doit Ãªtre supÃ©rieure Ã  0.', 'error');
      return false;
    }

    var currentUser = (typeof AdminAuth !== 'undefined' && AdminAuth.getSession()) ? (AdminAuth.getSession().name || 'admin') : 'admin';

    if (id !== null) {
      /* Modification */
      var route = findRoute(id);
      if (route) {
        var updated = null;
        if (typeof SIGDataEngine !== 'undefined' && route.geometry) {
          updated = SIGDataEngine.updateFeature(route.id, {
            properties: data
          });
          if (updated) {
            saveRoute({
              id: route.id,
              properties: Object.assign({}, updated.properties),
              geometry: updated.geometry || route.geometry
            });
            updated = findRoute(route.id);
          }
          if (updated && typeof RoadSync !== 'undefined') {
            RoadSync.propagate('updated', {
              fullReload: true,
              featureId: (typeof SIGDataEngine.getFeatureIndex === 'function') ? SIGDataEngine.getFeatureIndex(route.id) : null
            });
          }
        } else {
          var beforeState = JSON.parse(JSON.stringify(route.properties));
          saveRoute({ id: id, properties: data });
          updated = findRoute(id);
          /* EventBus + Audit */
          if (typeof SIGEventBus !== 'undefined') {
            SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_UPDATED, { featureId: id, layer: 'routes' });
          }
          if (typeof SIGAuditTrail !== 'undefined') {
            try {
              SIGAuditTrail.log(SIGAuditTrail.ACTIONS.UPDATE_ROUTE, {
                featureId: String(id),
                featureName: data.Name,
                user: currentUser,
                details: 'Route modifiÃ©e : ' + (data.Name || 'Sans nom'),
                before: beforeState,
                after: data,
                result: 'SUCCESS'
              });
            } catch(e) {}
          }
        }
        if (!updated) {
          notify('La mise Ã  jour de la route a Ã©chouÃ©.', 'error');
          return false;
        }
        notify('"' + data.Name + '" modifiÃ©e avec succÃ¨s.', 'success');
        if (typeof NotificationCenter !== 'undefined') {
          NotificationCenter.add('update', 'Route modifiÃ©e', data.Name);
        }
      }
    } else {
      /* Ajout */
      var newId = addRoute({ properties: data, geometry: null });
      notify('"' + data.Name + '" ajoutÃ©e avec succÃ¨s.', 'success');
      /* EventBus + Audit */
      if (typeof SIGEventBus !== 'undefined') {
        SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_CREATED, { featureId: newId, layer: 'routes' });
      }
      if (typeof SIGAuditTrail !== 'undefined') {
        try {
          SIGAuditTrail.log(SIGAuditTrail.ACTIONS.CREATE_ROUTE, {
            featureId: String(newId),
            featureName: data.Name,
            user: currentUser,
            details: 'Route crÃ©Ã©e : ' + (data.Name || 'Sans nom'),
            before: null,
            after: data,
            result: 'SUCCESS'
          });
        } catch(e) {}
      }
      if (typeof NotificationCenter !== 'undefined') {
        NotificationCenter.add('create', 'Route ajoutÃ©e', data.Name);
      }
    }

    closeModal('modal-route-form');
    refresh();
    return false;
  }

  function exportCSV() {
    var headers = ['Nom', 'Code', 'Origine', 'Destination', 'CatÃ©gorie', 'Longueur (m)', 'Largeur (m)', 'Emprise (m)', 'RevÃªtement', 'Ã‰tat', 'RÃ©gion', 'PrÃ©fecture', 'Communes', 'Population desservie', 'PK DÃ©but X', 'PK DÃ©but Y', 'PK Fin X', 'PK Fin Y', 'Observations'];
    var keys = ['Name', 'Code', 'Origine', 'Destination', 'CLASSE', 'LONGEUR', 'Largeur', 'EMPRISE', 'Revetement', 'Etat', 'REGIONS', 'Prefecture', 'Communes', 'Pop_Dessertie', 'PK_DEB_X', 'PK_DEB_Y', 'PK_FIN_X', 'PK_FIN_Y', 'Observations'];
    var csv = headers.join(';') + '\n';
    state.filtered.forEach(function(r) {
      var row = keys.map(function(k) {
        var v = (r.properties[k] !== undefined && r.properties[k] !== null) ? String(r.properties[k]) : '';
        return '"' + v.replace(/"/g, '""') + '"';
      });
      csv += row.join(';') + '\n';
    });

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var filename = 'routes_georoad_' + new Date().toISOString().slice(0, 10) + '.csv';
    if (typeof GeoROADDownload !== 'undefined' && typeof GeoROADDownload.downloadBlob === 'function') {
      GeoROADDownload.downloadBlob(blob, filename);
    } else {
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      (document.body || document.documentElement).appendChild(link);
      link.click();
      setTimeout(function() {
        if (link.parentNode) link.parentNode.removeChild(link);
        URL.revokeObjectURL(link.href);
      }, 400);
    }
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.EXPORT, {
          details: 'Export CSV du module routes (' + state.filtered.length + ' route(s))',
          after: { format: 'csv', count: state.filtered.length, source: 'routes' },
          result: 'SUCCESS',
          entityType: 'routes'
        });
      } catch(e) {}
    }
    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.add('export', 'Routes exportÃ©es', state.filtered.length + ' route(s) exportÃ©e(s) en CSV');
    }
    notify('Export CSV tÃ©lÃ©chargÃ© (' + state.filtered.length + ' routes).', 'success');
  }

  /* ===== EVENT HANDLERS (appelÃ©s par le HTML) ===== */

  function onSearch(val) {
    state.search = val;
    state.page = 1;
    applyFilters();
    refresh();
  }

  function onFilter(key, val) {
    state.filters[key] = val;
    state.page = 1;
    applyFilters();
    refresh();
  }

  function resetFilters() {
    state.search = '';
    state.filters = { region: '', classe: '', etat: '', revetement: '' };
    state.page = 1;
    applyFilters();
    refresh();
  }

  function goPage(p) {
    state.page = p;
    refresh();
  }

  function closeModal(id) {
    document.querySelectorAll('[id="' + id + '"]').forEach(function(el) {
      el.remove();
    });
  }

  function closeModalOnOverlay(event, id) {
    if (event.target.id === id) closeModal(id);
  }

  /** RafraÃ®chit le contenu de la page routes. */
  function refresh() {
    applyFilters();
    var el = document.getElementById('adminContent');
    if (el) {
      el.innerHTML = buildPage();
      el.scrollTop = 0;
    }
  }

  /* ===== HELPERS ===== */

  function findRoute(id) {
    for (var i = 0; i < state.allRoutes.length; i++) {
      if (String(state.allRoutes[i].id) === String(id)) return state.allRoutes[i];
    }
    return null;
  }

  function getFormData(form) {
    var data = {};
    var inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(function(el) {
      var v = el.value;
      if (el.type === 'number' && v !== '') v = parseFloat(v);
      data[el.name] = v;
    });
    /* Auto-fill CLASSE label */
    if (data.Name && !data.Origine) {
      var parts = data.Name.split('-');
      data.Origine = parts[0] ? parts[0].trim() : '';
      data.Destination = parts[1] ? parts[1].trim() : '';
    }
    return data;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function jsArg(str) {
    return '\'' + String(str).replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\'';
  }

  function safeDomId(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'item';
  }

  function formatNumericInputValue(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number') return isFinite(value) ? String(value) : '';
    var normalized = String(value).trim().replace(',', '.');
    return normalized !== '' && !isNaN(Number(normalized)) ? normalized : '';
  }

  function formGroup(label, inputHtml) {
    return '<div class="fm-group"><label>' + label + '</label>' + inputHtml + '</div>';
  }

  function formRow(left, right) {
    return '<div class="form-row">' + left + right + '</div>';
  }

  function formRowSingle(content) {
    return '<div class="form-row-single">' + content + '</div>';
  }

  function formSelect(name, options, current) {
    var html = '<select name="' + name + '">';
    options.forEach(function(o) {
      var sel = String(o[0]) === String(current) ? ' selected' : '';
      html += '<option value="' + escapeAttr(o[0]) + '"' + sel + '>' + escapeHtml(o[1]) + '</option>';
    });
    html += '</select>';
    return html;
  }

  function detailField(label, value, full) {
    var cls = full ? 'detail-item detail-full' : 'detail-item';
    return '<div class="' + cls + '"><div class="detail-label">' + escapeHtml(label) + '</div><div class="detail-value">' + escapeHtml(value || 'â€”') + '</div></div>';
  }

  /** Renvoie la liste des rÃ©gions depuis json_Rgion_2 (toutes les rÃ©gions du Togo prÃ©sentes dans la couche).
      Fallback : les 3 rÃ©gions historiques si la couche n'est pas chargÃ©e. */
  function getRegionOptions() {
    var regions = [];
    if (typeof json_Rgion_2 !== 'undefined' && json_Rgion_2.features) {
      var seen = {};
      json_Rgion_2.features.forEach(function(f) {
        var n = f.properties && f.properties.NAME_1;
        if (n && !seen[n]) { seen[n] = true; regions.push([n, n]); }
      });
    }
    if (regions.length === 0) {
      regions = [['Centre','Centre'], ['Kara','Kara'], ['Savanes','Savanes'],
                 ['Plateaux','Plateaux'], ['Maritime','Maritime']];
    }
    return regions;
  }

  /* ===== Ã‰COUTE SIGEventBus POUR SYNCHRONISATION ENTRANTE ===== */
  /* Quand une route est crÃ©Ã©e/modifiÃ©e/supprimÃ©e par un autre module
     (admin-ajout, admin-spatial, gÃ©oportail), on recharge la liste. */
  if (typeof SIGEventBus !== 'undefined') {
    var _routeRefreshTimer = null;
    var _scheduleRouteRefresh = function() {
      if (_routeRefreshTimer) clearTimeout(_routeRefreshTimer);
      _routeRefreshTimer = setTimeout(function() {
        /* Recharger les donnÃ©es depuis la variable globale */
        loadData();
        /* Si on est sur la page routes, re-rendre */
        var currentHash = window.location.hash.replace('#', '');
        if (currentHash === 'routes') {
          var el = document.getElementById('adminContent');
          if (el) el.innerHTML = buildPage();
        }
      }, 200);
    };
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, function(data) {
      if (!data || data.layer === 'routes' || data.layer === 'Rseauroutier_6') _scheduleRouteRefresh();
    });
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, function(data) {
      if (!data || data.layer === 'routes' || data.layer === 'Rseauroutier_6') _scheduleRouteRefresh();
    });
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      if (!data || data.layer === 'routes' || data.layer === 'Rseauroutier_6') _scheduleRouteRefresh();
    });
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render,
    reload: function() { render(); },
    onSearch: onSearch,
    onFilter: onFilter,
    resetFilters: resetFilters,
    goPage: goPage,
    viewRoute: viewRoute,
    openAddForm: openAddForm,
    openEditForm: openEditForm,
    confirmDelete: confirmDelete,
    doDelete: doDelete,
    saveForm: saveForm,
    exportCSV: exportCSV,
    closeModal: closeModal,
    closeModalOnOverlay: closeModalOnOverlay
  };
})();

/* ==== END admin-routes.js ==== */

/* ==== BEGIN admin-emprises.js ==== */
/* ===================================================================
 * GeoROAD TOGO â€” Module Gestion des Emprises
 *
 * Formulaire avec selecteur de route, definition emprise.
 * Synchronisation globale apres chaque enregistrement.
 * =================================================================== */
var EmpriseModule = (function() {
  "use strict";

  var PER_PAGE = 10;
  var CAT_LABELS = { "CU": "Route Communautaire", "RN": "Route Nationale", "RR": "Route R\u00e9gionale", "RC": "Route Communale", "RL": "Route Locale" };
  var CAT_CSS = { "CU": "cu", "RN": "rn", "RR": "rr", "RC": "rc", "RL": "rl" };

  var state = { allEmprises: [], filtered: [], page: 1, search: "", filters: { region: "", classe: "", empriseMin: "", empriseMax: "" } };

  function esc(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") : ""; }
  function ea(s) { return s ? String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : ""; }
  function isAdmin() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s && (s.role === "administrateur" || s.role === "Administrateur"); } catch(e) { return false; } }
  function canEdit() { return isAdmin(); }
  function getSessionName() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s ? (s.name || s.user || "Inconnu") : "Inconnu"; } catch(e) { return "Inconnu"; } }

  /* ===== DATA ===== */
  function loadData() {
    if (typeof json_Emprise_5 !== "undefined" && json_Emprise_5.features) {
      state.allEmprises = json_Emprise_5.features.map(function(f, idx) {
        return { id: idx, properties: Object.assign({}, f.properties || {}), geometry: f.geometry ? Object.assign({}, f.geometry) : null };
      });
    }
    state.allEmprises.forEach(function(e) {
      if (!e.properties.Name) e.properties.Name = "";
      if (!e.properties.CLASSE) e.properties.CLASSE = "";
      if (!e.properties.EMPRISE) e.properties.EMPRISE = 0;
    });
    applyFilters();
  }

  function findEmprise(id) {
    for (var i = 0; i < state.allEmprises.length; i++) { if (state.allEmprises[i].id === id) return state.allEmprises[i]; }
    return null;
  }

  function getRouteList() {
    if (typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return [];
    return json_Rseauroutier_6.features.map(function(f, idx) {
      var p = f.properties || {};
      return { index: idx, name: p.Name || ("Route " + idx), classe: p.CLASSE || "", longueur: p.LONGEUR || 0, region: p.REGIONS || "", emprise: p.EMPRISE || 0 };
    });
  }

  function findAssociatedRoute(empriseName) {
    if (!empriseName || typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return null;
    var name = String(empriseName).trim().toLowerCase();
    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var rn = (json_Rseauroutier_6.features[i].properties && json_Rseauroutier_6.features[i].properties.Name);
      if (rn && rn.trim().toLowerCase() === name) return json_Rseauroutier_6.features[i];
    }
    for (var j = 0; j < json_Rseauroutier_6.features.length; j++) {
      var r2 = (json_Rseauroutier_6.features[j].properties && json_Rseauroutier_6.features[j].properties.Name) || "";
      if (r2.toLowerCase().indexOf(name) !== -1 || name.indexOf(r2.toLowerCase()) !== -1) return json_Rseauroutier_6.features[j];
    }
    return null;
  }

  function getEmpriseRegion(e) {
    var route = findAssociatedRoute(e.properties.Name);
    if (route && route.properties && route.properties.REGIONS) return route.properties.REGIONS;
    return (e.properties && e.properties.REGIONS) || "";
  }

  function persistAndNotify(eventType, detail) {
    if (typeof json_Emprise_5 !== "undefined") {
      json_Emprise_5.features = state.allEmprises.map(function(e) { return { type: "Feature", properties: e.properties, geometry: e.geometry }; });
    }
    if (typeof SIGPersistence !== "undefined") SIGPersistence.saveLayer(SIGPersistence.LAYERS.EMPRISES, json_Emprise_5);
    /* Utiliser les constantes SIGEventBus.EVENTS */
    if (typeof SIGEventBus !== "undefined") {
      var evMap = {
        "sig:feature:created": SIGEventBus.EVENTS.FEATURE_CREATED,
        "sig:feature:updated": SIGEventBus.EVENTS.FEATURE_UPDATED,
        "sig:feature:deleted": SIGEventBus.EVENTS.FEATURE_DELETED,
        "sig:stats:changed": SIGEventBus.EVENTS.STATS_CHANGED,
        "sig:dashboard:refresh": SIGEventBus.EVENTS.DASHBOARD_REFRESH
      };
      var ev = evMap[eventType] || eventType;
      SIGEventBus.emit(ev, { featureId: (detail && detail.id) || null, layer: 'emprises', name: detail && detail.name });
      if (SIGEventBus.EVENTS.STATS_CHANGED) SIGEventBus.emit(SIGEventBus.EVENTS.STATS_CHANGED, { source: 'emprises' });
      if (SIGEventBus.EVENTS.DASHBOARD_REFRESH) SIGEventBus.emit(SIGEventBus.EVENTS.DASHBOARD_REFRESH, {});
    }
    /* Audit avec signature correcte log(action, options) */
    if (typeof SIGAuditTrail !== "undefined") {
      try {
        var a = (eventType === "sig:feature:created" ? "CREATE" : (eventType === "sig:feature:deleted" ? "DELETE" : "UPDATE"));
        var actionConst;
        if (a === "CREATE") actionConst = SIGAuditTrail.ACTIONS.CREATE_EMPRISE || SIGAuditTrail.ACTIONS.CREATE_ROUTE;
        else if (a === "DELETE") actionConst = SIGAuditTrail.ACTIONS.DELETE_EMPRISE || SIGAuditTrail.ACTIONS.DELETE_ROUTE;
        else actionConst = SIGAuditTrail.ACTIONS.UPDATE_EMPRISE || SIGAuditTrail.ACTIONS.UPDATE_ROUTE;
        SIGAuditTrail.log(actionConst, {
          featureId: (detail && detail.id) ? String(detail.id) : null,
          featureName: (detail && detail.name) || 'Emprise',
          user: getSessionName(),
          details: 'Emprise ' + ((detail && detail.name) || '') + ' â€” action ' + a + ' (couche Emprises)',
          before: null,
          after: null,
          result: 'SUCCESS',
          entityType: 'emprise'
        });
      } catch(e) {}
    }
  }

  /* ===== STATS ===== */
  function computeStats() {
    var total = state.allEmprises.length, te = 0, ts = 0;
    state.allEmprises.forEach(function(e) {
      var ev = parseFloat(e.properties.EMPRISE) || 0;
      te += ev;
      var route = findAssociatedRoute(e.properties.Name);
      if (route && route.properties && route.properties.LONGEUR) { ts += (ev * parseFloat(route.properties.LONGEUR)) / 10000; }
    });
    return { total: total, avgEmprise: total > 0 ? (te / total) : 0, totalSurfaceHa: ts };
  }

  /* ===== FILTRES ===== */
  function applyFilters() {
    var s = state.search.toLowerCase();
    var f = state.filters;
    state.filtered = state.allEmprises.filter(function(e) {
      var p = e.properties;
      if (s) { var r = getEmpriseRegion(e); var h = ((p.Name || "") + " " + (p.CLASSE || "") + " " + (p.EMPRISE || "") + " " + r).toLowerCase(); if (h.indexOf(s) === -1) return false; }
      if (f.classe && p.CLASSE !== f.classe) return false;
      if (f.region) { var er = getEmpriseRegion(e); if (er !== f.region) return false; }
      if (f.empriseMin !== "" && f.empriseMin !== undefined) { var ev = parseFloat(p.EMPRISE) || 0; var mv = parseFloat(f.empriseMin); if (!isNaN(mv) && ev < mv) return false; }
      if (f.empriseMax !== "" && f.empriseMax !== undefined) { var ev2 = parseFloat(p.EMPRISE) || 0; var xv = parseFloat(f.empriseMax); if (!isNaN(xv) && ev2 > xv) return false; }
      return true;
    });
    if (state.page > totalPages()) state.page = 1;
  }
  function totalPages() { return Math.max(1, Math.ceil(state.filtered.length / PER_PAGE)); }
  function getPageData() { var s = (state.page - 1) * PER_PAGE; return state.filtered.slice(s, s + PER_PAGE); }
  function getUniqueRegions() {
    var v = {};
    state.allEmprises.forEach(function(e) { var r = getEmpriseRegion(e); if (r && r.trim()) v[r.trim()] = true; });
    if (typeof json_Rseauroutier_6 !== "undefined" && json_Rseauroutier_6.features)
      json_Rseauroutier_6.features.forEach(function(r) { var reg = (r.properties && r.properties.REGIONS) || ""; if (reg && reg.trim()) v[reg.trim()] = true; });
    return Object.keys(v).sort();
  }

  /* ===== TOAST ===== */
  function notify(msg, type) {
    type = type || "success";
    var ex = document.getElementById("emprise-toast");
    if (ex) ex.remove();
    var t = document.createElement("div");
    t.id = "emprise-toast";
    t.className = "route-toast " + type;
    var ic = type === "success" ? "fa-check-circle" : (type === "error" ? "fa-exclamation-circle" : "fa-info-circle");
    t.innerHTML = '<i class="fas ' + ic + '"></i> ' + esc(msg);
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add("show"); }, 10);
    setTimeout(function() { t.classList.remove("show"); setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 3000);
  }

  /* ===== RENDER ===== */
  function render() { loadData(); return buildPage(); }

  function buildPage() {
    var stats = computeStats();
    var html = '<div class="page-header"><h1>Gestion des emprises</h1>'
      + '<p>Consultation et gestion des ' + stats.total + " zones d\u2019emprise \u2014 "
      + stats.totalSurfaceHa.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
      + " ha estim\u00e9s</p></div>";

    html += '<div class="stats-row">';
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-vector-square"></i></div><div class="sc-value">' + stats.total + '</div><div class="sc-label">Emprises</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon blue"><i class="fas fa-ruler-horizontal"></i></div><div class="sc-value">' + stats.avgEmprise.toFixed(1) + ' m</div><div class="sc-label">Emprise moyenne</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon green"><i class="fas fa-expand"></i></div><div class="sc-value">' + stats.totalSurfaceHa.toFixed(1) + ' ha</div><div class="sc-label">Surface totale</div></div>';
    html += "</div>";

    html += '<div class="routes-toolbar"><div class="routes-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="emprise-search-input" placeholder="Rechercher..." value="' + ea(state.search) + '" oninput="EmpriseModule.onSearch(this.value)"></div>';
    html += '<div class="routes-actions">';
    if (canEdit()) html += '<button class="btn-sm primary" onclick="EmpriseModule.openAddModal()"><i class="fas fa-plus"></i> Ajouter une emprise</button>';
    html += "</div></div>";

    html += buildFilters();

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-draw-polygon"></i> Zones d\u2019emprise <span style="font-weight:400;color:var(--text-4);font-size:.82rem;margin-left:8px">(' + state.filtered.length + ")</span></h3></div>";
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>Nom</th><th>Cat\u00e9gorie</th><th>Emprise (m)</th><th>Route associ\u00e9e</th><th style="text-align:right">Actions</th>';
    html += "</tr></thead><tbody>";

    var rows = getPageData();
    if (rows.length === 0) {
      html += '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-4)"><div class="empty-state"><i class="fas fa-vector-square"></i><h3>Aucune emprise</h3></div></td></tr>';
    } else { rows.forEach(function(e) { html += buildRow(e); }); }

    html += "</tbody></table></div>";
    html += buildPagination();
    html += "</div>";
    return html;
  }

  function buildFilters() {
    var regions = getUniqueRegions();
    var classes = ["CU", "RN", "RR", "RC", "RL"];
    var f = state.filters;
    var html = '<div class="routes-filters">';
    html += fSel("classe", "Cat\u00e9gorie", classes, f.classe, "-- Toutes --", CAT_LABELS);
    html += fSel("region", "R\u00e9gion", regions, f.region, "-- Toutes --");
    html += '<div class="filter-group"><label>Min (m)</label><input type="number" placeholder="Min" value="' + ea(f.empriseMin) + '" onchange="EmpriseModule.onFilter(&#39;empriseMin&#39;, this.value)" style="min-width:90px"></div>';
    html += '<div class="filter-group"><label>Max (m)</label><input type="number" placeholder="Max" value="' + ea(f.empriseMax) + '" onchange="EmpriseModule.onFilter(&#39;empriseMax&#39;, this.value)" style="min-width:90px"></div>';
    html += '<button class="btn-sm ghost" onclick="EmpriseModule.resetFilters()" style="white-space:nowrap"><i class="fas fa-rotate-left"></i> R\u00e9initialiser</button>';
    html += "</div>";
    return html;
  }

  function fSel(key, label, opts, cur, ph, lm) {
    var html = '<div class="filter-group"><label>' + label + '</label>';
    html += '<select onchange="EmpriseModule.onFilter(&#39;' + key + '&#39;, this.value)"><option value="">' + ph + "</option>";
    opts.forEach(function(o) {
      var s = o === cur ? " selected" : "";
      var d = lm ? (lm[o] || o) : o;
      html += '<option value="' + ea(o) + '"' + s + ">" + esc(d) + "</option>";
    });
    html += "</select></div>";
    return html;
  }

  function buildRow(e) {
    var p = e.properties;
    var catLabel = CAT_LABELS[p.CLASSE] || p.CLASSE || "\u2014";
    var ev = parseFloat(p.EMPRISE) || 0;
    var route = findAssociatedRoute(p.Name);
    var rl = route ? (route.properties.Name || "\u2014") : '<span style="color:var(--text-4)">Non associ\u00e9e</span>';
    var html = "<tr>";
    html += '<td><strong style="cursor:pointer;color:var(--gold-dark)" onclick="EmpriseModule.viewEmprise(' + e.id + ')">' + esc(p.Name || "\u2014") + "</strong></td>";
    html += '<td><span class="cat-dot cat-' + (CAT_CSS[p.CLASSE] || "") + '"></span> ' + esc(catLabel) + "</td>";
    html += "<td>" + ev.toLocaleString("fr-FR") + "</td><td>" + rl + "</td>";
    html += '<td style="text-align:right;white-space:nowrap">';
    html += '<button class="btn-icon" title="Voir" onclick="EmpriseModule.viewEmprise(' + e.id + ')"><i class="fas fa-eye"></i></button>';
    if (canEdit()) html += '<button class="btn-icon" title="Modifier" onclick="EmpriseModule.openEditModal(' + e.id + ')"><i class="fas fa-pen"></i></button>';
    if (isAdmin()) html += '<button class="btn-icon danger" title="Supprimer" onclick="EmpriseModule.confirmDelete(' + e.id + ')"><i class="fas fa-trash"></i></button>';
    html += "</td></tr>";
    return html;
  }

  function buildPagination() {
    var tp = totalPages();
    if (tp <= 1) return "";
    var html = '<div class="routes-pagination"><span class="pag-info">Page ' + state.page + "/" + tp + " (" + state.filtered.length + ")</span><div class=\"pag-buttons\">";
    html += '<button class="btn-sm ghost" ' + (state.page <= 1 ? "disabled" : "") + " onclick=\"EmpriseModule.goPage(" + (state.page - 1) + ")\"><i class=\"fas fa-chevron-left\"></i></button>";
    var pgs = pagR(state.page, tp);
    pgs.forEach(function(pg) {
      if (pg === "...") { html += '<span class="pag-dots">...</span>'; }
      else { var c = pg === state.page ? "primary" : "ghost"; html += '<button class="btn-sm ' + c + '" onclick="EmpriseModule.goPage(' + pg + ')">' + pg + "</button>"; }
    });
    html += '<button class="btn-sm ghost" ' + (state.page >= tp ? "disabled" : "") + " onclick=\"EmpriseModule.goPage(" + (state.page + 1) + ")\"><i class=\"fas fa-chevron-right\"></i></button>";
    html += "</div></div>";
    return html;
  }

  function pagR(c, t) {
    if (t <= 7) { var a = []; for (var i = 1; i <= t; i++) a.push(i); return a; }
    if (c <= 4) return [1, 2, 3, 4, 5, "...", t];
    if (c >= t - 3) return [1, "...", t - 4, t - 3, t - 2, t - 1, t];
    return [1, "...", c - 1, c, c + 1, "...", t];
  }

  /* ===== MODALS ===== */

  function viewEmprise(id) {
    var e = findEmprise(id);
    if (!e) return;
    closeModal("modal-emprise-view");
    var p = e.properties;
    var ev = parseFloat(p.EMPRISE) || 0;
    var cl = CAT_LABELS[p.CLASSE] || p.CLASSE || "\u2014";
    var route = findAssociatedRoute(p.Name);
    var rn = route ? (route.properties.Name || "\u2014") : "Non associ\u00e9e";
    var rl = route ? (parseFloat(route.properties.LONGEUR) || 0) : 0;
    var reg = getEmpriseRegion(e);
    var sh = (ev * rl) / 10000;

    var html = '<div class="modal-admin-overlay" id="modal-emprise-view" onclick="EmpriseModule.closeModalOnOverlay(event, &#39;modal-emprise-view&#39;)">';
    html += '<div class="modal-admin" style="max-width:560px"><div class="modal-admin-header"><h2><i class="fas fa-vector-square" style="color:var(--gold);margin-right:8px"></i> Fiche emprise</h2><button class="modal-admin-close" onclick="EmpriseModule.closeModal(&#39;modal-emprise-view&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><div class="detail-grid">';
    html += df("Nom", p.Name);
    html += df("Cat\u00e9gorie", cl);
    html += df("Emprise", ev.toLocaleString("fr-FR") + " m");
    html += df("Route", rn);
    html += df("R\u00e9gion", reg || "\u2014");
    html += df("Longueur route", rl > 0 ? (rl / 1000).toFixed(2) + " km" : "\u2014");
    html += df("Surface estim\u00e9e", sh > 0 ? sh.toFixed(2) + " ha" : "\u2014");
    html += "</div></div>";
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="EmpriseModule.closeModal(&#39;modal-emprise-view&#39;)">Fermer</button>';
    if (canEdit()) html += '<button class="btn-sm primary" onclick="EmpriseModule.closeModal(&#39;modal-emprise-view&#39;);EmpriseModule.openEditModal(' + id + ')"><i class="fas fa-pen"></i> Modifier</button>';
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function openAddModal() { openFormModal(null); }
  function openEditModal(id) { var e = findEmprise(id); if (e) openFormModal(e); }

  function openFormModal(emprise) {
    var isEdit = !!emprise;
    var p = emprise ? emprise.properties : {};
    var title = isEdit ? "Modifier l\u2019emprise" : "Ajouter une emprise";
    var routes = getRouteList();
    var formId = "emprise-form-" + safeDomId(isEdit ? emprise.id : "new");

    closeModal("modal-emprise-form");

    var html = '<div class="modal-admin-overlay" id="modal-emprise-form" onclick="EmpriseModule.closeModalOnOverlay(event, &#39;modal-emprise-form&#39;)">';
    html += '<div class="modal-admin" style="max-width:560px"><div class="modal-admin-header"><h2><i class="fas fa-' + (isEdit ? "pen" : "plus") + '" style="color:var(--gold);margin-right:8px"></i> ' + title + '</h2><button class="modal-admin-close" onclick="EmpriseModule.closeModal(&#39;modal-emprise-form&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><form id="' + formId + '" onsubmit="return EmpriseModule.saveEmprise(event, ' + (isEdit ? emprise.id : "null") + ')">';

    /* Route selector */
    html += '<div class="form-row-single"><div class="fm-group"><label>Route associ\u00e9e *</label>';
    html += '<select name="route" required id="emprise-form-route" onchange="EmpriseModule.onRouteSelect(this.value)">';
    html += '<option value="">-- S\u00e9lectionner une route --</option>';
    routes.forEach(function(r) {
      var sel = isEdit && p.route_associee === r.name ? " selected" : "";
      html += '<option value="' + ea(r.name) + '" data-classe="' + ea(r.classe) + '" data-emprise="' + r.emprise + '" data-longueur="' + r.longueur + '" data-region="' + ea(r.region) + '"' + sel + ">" + esc(r.name) + " (" + (CAT_LABELS[r.classe] || r.classe) + ")</option>";
    });
    html += "</select></div></div>";

    /* Nom + CLASSE */
    html += '<div class="form-row"><div class="fm-group"><label>Nom de l\u2019emprise *</label>';
    html += '<input type="text" name="Name" required id="emprise-form-name" value="' + ea(p.Name || "") + '" placeholder="Ex: Lom\u00e9-Sokod\u00e9"></div>';

    html += '<div class="fm-group"><label>Cat\u00e9gorie (CLASSE) *</label>';
    html += '<select name="CLASSE" required id="emprise-form-classe">';
    html += '<option value="">-- S\u00e9lectionner --</option>';
    [["CU", "Route Communautaire"], ["RN", "Route Nationale"], ["RR", "Route R\u00e9gionale"], ["RC", "Route Communale"], ["RL", "Route Locale"]].forEach(function(o) {
      var sel = String(o[0]) === String(p.CLASSE) ? " selected" : "";
      html += '<option value="' + ea(o[0]) + '"' + sel + ">" + esc(o[1]) + "</option>";
    });
    html += "</select></div></div>";

    /* EMPRISE + Info route */
    html += '<div class="form-row"><div class="fm-group"><label>Emprise (m) *</label>';
    html += '<input type="number" name="EMPRISE" step="1" min="0" required id="emprise-form-emp" value="' + (p.EMPRISE || "") + '" placeholder="Ex: 70"></div>';

    html += '<div class="fm-group"><label>Info route</label>';
    html += '<div id="emprise-route-info" style="padding:8px 10px;background:var(--bg-2);border-radius:6px;font-size:.82rem;color:var(--text-3);min-height:38px;display:flex;align-items:center">';
    html += '<span style="color:var(--text-4)">S\u00e9lectionnez une route ci-dessus</span></div></div></div>';

    /* Info box */
    html += '<div style="padding:10px 12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-4);margin-top:4px">';
    html += '<i class="fas fa-info-circle" style="margin-right:6px;color:var(--blue)"></i>';
    html += "S\u00e9lectionnez une route pour remplir automatiquement le nom, la cat\u00e9gorie et l\u2019emprise. Apr\u00e8s enregistrement, la base se met \u00e0 jour.";
    html += "</div>";

    html += '</form></div><div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="EmpriseModule.closeModal(&#39;modal-emprise-form&#39;)">Annuler</button>';
    html += '<button class="btn-sm primary" type="submit" form="' + formId + '"><i class="fas fa-save"></i> ' + (isEdit ? "Enregistrer" : "Ajouter") + "</button>";
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);

    if (isEdit && p.route_associee) {
      setTimeout(function() { onRouteSelect(p.route_associee); }, 50);
    }
  }

  function confirmDelete(id) {
    if (!isAdmin()) { notify("Permissions insuffisantes.", "error"); return; }
    var e = findEmprise(id);
    if (!e) return;
    closeModal("modal-emprise-delete");
    var name = e.properties.Name || "cette emprise";
    var html = '<div class="modal-admin-overlay" id="modal-emprise-delete"><div class="modal-admin" style="max-width:440px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-exclamation-triangle" style="color:var(--red);margin-right:8px"></i> Confirmer</h2><button class="modal-admin-close" onclick="EmpriseModule.closeModal(&#39;modal-emprise-delete&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><p>Supprimer <strong style="color:var(--red)">' + esc(name) + "</strong> ?</p></div>";
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="EmpriseModule.closeModal(&#39;modal-emprise-delete&#39;)">Annuler</button>';
    html += '<button class="btn-sm" style="background:var(--red);color:#fff" onclick="EmpriseModule.deleteEmprise(' + id + ')"><i class="fas fa-trash"></i> Supprimer</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
  }

  /* ===== CRUD ===== */
  function saveEmprise(event, id) {
    if (event) event.preventDefault();
    var form = event && event.target && event.target.tagName && event.target.tagName.toUpperCase() === "FORM"
      ? event.target
      : document.querySelector('#modal-emprise-form form');
    if (!form) return false;
    if (!canEdit()) { notify("Permissions insuffisantes.", "error"); return false; }
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) return false;

    var data = {};
    form.querySelectorAll("input,select,textarea").forEach(function(el) {
      var v = el.value;
      if (el.type === "number" && v !== "") v = parseFloat(v);
      data[el.name] = v;
    });

    if (!data.Name || !data.Name.trim()) { notify("Le nom est obligatoire.", "error"); return false; }
    if (!data.route || !data.route.trim()) { notify("La route associÃ©e est obligatoire.", "error"); return false; }
    if (!data.CLASSE) { notify("La cat\u00e9gorie est obligatoire.", "error"); return false; }
    if (!data.EMPRISE || parseFloat(data.EMPRISE) <= 0) { notify("L\u2019emprise doit \u00eatre positive.", "error"); return false; }

    var now = new Date().toISOString();
    var userName = getSessionName();

    if (id !== null && id !== undefined) {
      var e = findEmprise(id);
      if (e) {
        var previousRoute = e.properties.route_associee || "";
        e.properties.Name = data.Name.trim();
        e.properties.CLASSE = data.CLASSE;
        e.properties.EMPRISE = parseFloat(data.EMPRISE);
        e.properties.route_associee = data.route || "";
        /* Conservation de l'identifiant unique de la route (PHASE 4) */
        var routeObj = findAssociatedRoute(data.route || data.Name);
        e.properties.route_id = routeObj && routeObj.id ? String(routeObj.id) : '';
        e.properties.lastModified = now;
        e.properties.modifiedBy = userName;
        if (previousRoute && previousRoute !== e.properties.route_associee) {
          clearEmpriseFromRouteIfUnused(previousRoute, id);
        }
        syncEmpriseToRoute(e.properties.route_associee, e.properties.EMPRISE, userName);
        persistAndNotify("sig:feature:updated", { id: id, name: data.Name, type: "emprise", action: "update" });
        closeModal("modal-emprise-form");
        notify('"' + data.Name + '" modifi\u00e9e.', "success");
      }
    } else {
      var newId = state.allEmprises.length > 0 ? Math.max.apply(null, state.allEmprises.map(function(e) { return e.id; })) + 1 : 0;
      var newE = {
        id: newId,
        properties: (function() {
          var r = findAssociatedRoute(data.route || data.Name.trim());
          return {
            Name: data.Name.trim(), CLASSE: data.CLASSE, EMPRISE: parseFloat(data.EMPRISE),
            route_associee: data.route || "",
            /* Conservation de l'identifiant unique de la route (PHASE 4) */
            route_id: r && r.id ? String(r.id) : '',
            status: "active",
            createdAt: now, lastModified: now, modifiedBy: userName
          };
        })(),
        geometry: null
      };
      state.allEmprises.push(newE);
      syncEmpriseToRoute(newE.properties.route_associee, newE.properties.EMPRISE, userName);
      persistAndNotify("sig:feature:created", { id: newId, name: data.Name, type: "emprise", action: "create" });
      closeModal("modal-emprise-form");
      notify('"' + data.Name + '" ajout\u00e9e.', "success");
    }
    refresh();
    return false;
  }

  function deleteEmprise(id) {
    if (!isAdmin()) { notify("Permissions insuffisantes.", "error"); return; }
    var e = findEmprise(id);
    var name = e ? (e.properties.Name || "Emprise") : "Emprise";
    var routeName = e && e.properties ? e.properties.route_associee : "";
    state.allEmprises = state.allEmprises.filter(function(e) { return e.id !== id; });
    if (routeName) clearEmpriseFromRouteIfUnused(routeName, id);
    persistAndNotify("sig:feature:deleted", { id: id, name: name, type: "emprise", action: "delete" });
    closeModal("modal-emprise-delete");
    notify('"' + name + '" supprim\u00e9e.', "success");
    refresh();
  }

  function syncEmpriseToRoute(routeName, empriseValue, userName) {
    if (!routeName || typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return;
    json_Rseauroutier_6.features.forEach(function(feat) {
      var p = feat.properties || {};
      if (p.Name === routeName) {
        p.EMPRISE = parseFloat(empriseValue) || 0;
        p.lastModified = new Date().toISOString();
        p.modifiedBy = userName || 'EmpriseModule';
      }
    });
    if (typeof SIGPersistence !== "undefined") {
      try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6); } catch(e) {}
    }
  }

  function clearEmpriseFromRouteIfUnused(routeName, excludeId) {
    if (!routeName || typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return;
    var stillLinked = state.allEmprises.some(function(item) {
      return item.id !== excludeId && item.properties && item.properties.route_associee === routeName;
    });
    if (stillLinked) return;

    json_Rseauroutier_6.features.forEach(function(feat) {
      var p = feat.properties || {};
      if (p.Name === routeName) {
        p.EMPRISE = null;
        p.lastModified = new Date().toISOString();
        p.modifiedBy = 'EmpriseModule';
      }
    });
    if (typeof SIGPersistence !== "undefined") {
      try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6); } catch(e) {}
    }
  }

  /* ===== EVENT HANDLERS ===== */
  function onRouteSelect(routeName) {
    var sel = document.getElementById("emprise-form-route");
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return;

    var nameInput = document.getElementById("emprise-form-name");
    var classeSelect = document.getElementById("emprise-form-classe");
    var empInput = document.getElementById("emprise-form-emp");
    var infoDiv = document.getElementById("emprise-route-info");

    if (nameInput) nameInput.value = routeName;
    if (classeSelect) classeSelect.value = opt.getAttribute("data-classe") || "";
    var defEmp = opt.getAttribute("data-emprise") || "";
    if (empInput && defEmp) empInput.value = defEmp;

    if (infoDiv) {
      var lg = opt.getAttribute("data-longueur") || 0;
      var rg = opt.getAttribute("data-region") || "";
      var cl = opt.getAttribute("data-classe") || "";
      var clLabel = CAT_LABELS[cl] || cl;
      var lenKm = parseFloat(lg) > 0 ? (parseFloat(lg) / 1000).toFixed(2) + " km" : "\u2014";
      infoDiv.innerHTML = "<div><strong>" + esc(routeName) + "</strong><br><span style=\"color:var(--text-4)\">" + esc(clLabel) + " \u00b7 " + esc(rg) + " \u00b7 " + lenKm + "</span></div>";
    }
  }

  function onSearch(val) { state.search = val; state.page = 1; applyFilters(); refresh(); }
  function onFilter(key, val) { state.filters[key] = val; state.page = 1; applyFilters(); refresh(); }
  function resetFilters() { state.search = ""; state.filters = { region: "", classe: "", empriseMin: "", empriseMax: "" }; state.page = 1; applyFilters(); refresh(); }
  function goPage(p) { state.page = p; refresh(); }
  function closeModal(id) { document.querySelectorAll('[id="' + id + '"]').forEach(function(el) { el.remove(); }); }
  function closeModalOnOverlay(event, id) { if (event.target.id === id) closeModal(id); }

  function safeDomId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_") || "item";
  }
  function refresh() {
    applyFilters();
    var el = document.getElementById("adminContent");
    if (el) { el.innerHTML = buildPage(); el.scrollTop = 0; }
    var badge = document.querySelector('.nav-item[data-page="emprises"] .nav-badge');
    if (badge) badge.textContent = state.allEmprises.length;
  }

  function df(l, v) { return '<div class="detail-item"><div class="detail-label">' + esc(l) + "</div><div class=\"detail-value\">" + esc(v || "\u2014") + "</div></div>"; }

  /**
   * Calcule la surface rÃ©elle d'une emprise si elle possÃ¨de une gÃ©omÃ©trie polygonale.
   * Sinon, fallback estimation : largeur (EMPRISE) Ã— longueur route (LONGEUR).
   * @returns {Object} { surface_m2, surface_ha, source } ou null si impossible
   */
  function computeEmpriseSurface(e) {
    if (!e) return null;
    var p = e.properties || {};
    /* Si l'emprise a une gÃ©omÃ©trie polygonale, calculer la surface rÃ©elle */
    if (e.geometry && (e.geometry.type === 'Polygon' || e.geometry.type === 'MultiPolygon')) {
      if (typeof ol !== 'undefined' && ol.sphere && ol.sphere.getArea) {
        try {
          var fmt = new ol.format.GeoJSON();
          var g = fmt.readGeometry(e.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
          var areaM2 = ol.sphere.getArea(g);
          if (areaM2 > 0) {
            return { surface_m2: areaM2, surface_ha: areaM2 / 10000, source: 'polygone' };
          }
        } catch(err) {}
      }
    }
    /* Fallback : estimation largeur Ã— longueur route */
    var ev = parseFloat(p.EMPRISE) || 0;
    if (ev > 0) {
      var route = findAssociatedRoute(p.Name);
      var rl = route && route.properties ? (parseFloat(route.properties.LONGEUR) || 0) : 0;
      if (rl > 0) {
        var surf = ev * rl;
        return { surface_m2: surf, surface_ha: surf / 10000, source: 'estimation (largeur Ã— longueur route)' };
      }
    }
    return null;
  }

  /**
   * Calcule la largeur moyenne d'une emprise.
   * Si polygone : surface / longueur concernÃ©e.
   * Sinon : valeur EMPRISE stockÃ©e.
   */
  function computeEmpriseLargeurMoyenne(e) {
    if (!e) return 0;
    var p = e.properties || {};
    var surf = computeEmpriseSurface(e);
    if (surf && surf.source === 'polygone') {
      var route = findAssociatedRoute(p.Name);
      var rl = route && route.properties ? (parseFloat(route.properties.LONGEUR) || 0) : 0;
      if (rl > 0) return surf.surface_m2 / rl;
    }
    return parseFloat(p.EMPRISE) || 0;
  }

  /* ===== Ã‰COUTE SIGEventBus : supprimer les emprises orphelines quand une route est supprimÃ©e ===== */
  if (typeof SIGEventBus !== "undefined") {
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      if (!data) return;
      if (data.layer === 'routes' || data.layer === 'Rseauroutier_6') {
        var routeName = data.featureName;
        if (!routeName) return;
        var before = state.allEmprises.length;
        /* On ne supprime pas les emprises (elles peuvent concerner d'autres routes)
           mais on marque route_associee = null pour signaler l'orphelinat */
        state.allEmprises.forEach(function(e) {
          if ((e.properties || {}).Name === routeName) {
            e.properties.route_associee_orpheline = true;
          }
        });
        if (state.allEmprises.length !== before) {
          persistAndNotify("sig:feature:updated", { id: null, name: routeName });
        }
      }
    });
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render, onSearch: onSearch, onFilter: onFilter, resetFilters: resetFilters, goPage: goPage,
    viewEmprise: viewEmprise, openAddModal: openAddModal, openEditModal: openEditModal,
    saveEmprise: saveEmprise, confirmDelete: confirmDelete, deleteEmprise: deleteEmprise,
    closeModal: closeModal, closeModalOnOverlay: closeModalOnOverlay, onRouteSelect: onRouteSelect,
    /* Nouvelles fonctions PHASE 4 */
    computeEmpriseSurface: computeEmpriseSurface,
    computeEmpriseLargeurMoyenne: computeEmpriseLargeurMoyenne
  };
})();

/* ==== END admin-emprises.js ==== */

/* ==== BEGIN admin-pk.js ==== */
/* ===================================================================
 * GeoROAD TOGO â€” Module Gestion des Points KilomÃ©triques (PK)
 *
 * Chaque PK a un point de DÃ‰BUT (X, Y) et un point de FIN (X, Y).
 * SynchronisÃ© avec les routes existantes (PK_DEB_X/Y, PK_FIN_X/Y).
 * =================================================================== */
var PKModule = (function() {
  "use strict";

  var PER_PAGE = 10;
  var state = { allPKs: [], filtered: [], page: 1, search: "", filters: { route: "" } };

  function esc(s) { return s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") : ""; }
  function ea(s) { return s ? String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : ""; }
  function fc(v) { if (v===undefined||v===null||v==="") return "\u2014"; var n=parseFloat(v); return isNaN(n)? "\u2014":n.toLocaleString("fr-FR",{maximumFractionDigits:2}); }
  function isAdmin() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s && (s.role === "administrateur" || s.role === "Administrateur"); } catch(e) { return false; } }
  function canEdit() { return isAdmin(); }
  function getSessionName() { try { var s = typeof AdminAuth !== "undefined" ? AdminAuth.getSession() : null; return s ? (s.name || s.user || "Inconnu") : "Inconnu"; } catch(e) { return "Inconnu"; } }

  /* ===== DATA ===== */
  function loadData() {
    var fc = null;
    if (typeof SIGPersistence !== "undefined") fc = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
    if (fc && fc.type === "FeatureCollection" && fc.features && fc.features.length > 0) {
      state.allPKs = fc.features;
    } else {
      state.allPKs = [];
      fc = { type: "FeatureCollection", features: [] };
    }
    window.json_PK = fc;
    /* Synchroniser les PK existants des routes */
    syncFromRoutes();
  }

  /**
   * Synchronise les PK Ã  partir des donnÃ©es des routes existantes.
   * Chaque route qui possÃ¨de PK_DEB_X/Y et PK_FIN_X/Y gÃ©nÃ¨re un PK
   * s'il n'existe pas dÃ©jÃ  dans state.allPKs.
   * N'invente aucune donnÃ©e â€” utilise uniquement les propriÃ©tÃ©s des routes.
   */
  function syncFromRoutes() {
    if (typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return;
    var added = false;
    var baseTime = Date.now();
    /* Index des routes dÃ©jÃ  prÃ©sentes dans les PK (par nom de route) */
    var existingRoutes = {};
    state.allPKs.forEach(function(pk) {
      var r = (pk.properties || {}).route || "";
      if (r) existingRoutes[r] = true;
    });

    json_Rseauroutier_6.features.forEach(function(feat, idx) {
      var props = feat.properties || {};
      var routeName = props.Name || "";
      /* VÃ©rifier que la route a des coordonnÃ©es PK valides */
      var debX = props.PK_DEB_X;
      var debY = props.PK_DEB_Y;
      var finX = props.PK_FIN_X;
      var finY = props.PK_FIN_Y;
      if (!routeName) return;
      if (debX === null || debX === undefined || finX === null || finX === undefined) return;
      if (debX === 0 && debY === 0 && finX === 0 && finY === 0) return;
      /* Ne pas dupliquer si un PK existe dÃ©jÃ  pour cette route */
      if (existingRoutes[routeName]) return;

      /* CrÃ©er le PK Ã  partir des donnÃ©es existantes de la route */
      var pkProps = {
        numero: "PK 0+000",
        route: routeName,
        PK_DEB_X: parseFloat(debX),
        PK_DEB_Y: parseFloat(debY),
        PK_FIN_X: parseFloat(finX),
        PK_FIN_Y: parseFloat(finY),
        classe: props.CLASSE || "",
        longueur: props.LONGEUR || 0,
        source: "route",
        observations: "",
        lastModified: new Date().toISOString(),
        modifiedBy: "SystÃ¨me (sync route)"
      };
      var geom = {
        type: "LineString",
        coordinates: [[pkProps.PK_DEB_X, pkProps.PK_DEB_Y], [pkProps.PK_FIN_X, pkProps.PK_FIN_Y]]
      };
      var newPK = {
        type: "Feature",
        id: "pk_route_" + idx + "_" + (baseTime + idx),
        geometry: geom,
        properties: pkProps
      };
      state.allPKs.push(newPK);
      existingRoutes[routeName] = true;
      added = true;
    });

    /* Persister uniquement si de nouveaux PK ont Ã©tÃ© ajoutÃ©s */
    if (added) {
      var fc2 = { type: "FeatureCollection", features: state.allPKs };
      window.json_PK = fc2;
      if (typeof SIGPersistence !== "undefined") SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, fc2);
    }
  }

  function getRouteList() {
    if (typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return [];
    return json_Rseauroutier_6.features.map(function(f, idx) {
      var p = f.properties || {};
      return {
        index: idx, name: p.Name || ("Route " + idx), classe: p.CLASSE || "",
        pkDebX: p.PK_DEB_X || 0, pkDebY: p.PK_DEB_Y || 0,
        pkFinX: p.PK_FIN_X || 0, pkFinY: p.PK_FIN_Y || 0, longueur: p.LONGEUR || 0
      };
    });
  }

  function findPK(id) {
    for (var i = 0; i < state.allPKs.length; i++) {
      if (String(state.allPKs[i].id) === String(id)) return state.allPKs[i];
    }
    return null;
  }

  function persistAndNotify(eventType, detail) {
    var fc2 = { type: "FeatureCollection", features: state.allPKs };
    window.json_PK = fc2;
    if (typeof SIGPersistence !== "undefined") SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, fc2);
    /* Utiliser les constantes SIGEventBus.EVENTS si disponibles, sinon fallback string */
    if (typeof SIGEventBus !== "undefined") {
      var evMap = {
        "sig:feature:created": SIGEventBus.EVENTS.FEATURE_CREATED,
        "sig:feature:updated": SIGEventBus.EVENTS.FEATURE_UPDATED,
        "sig:feature:deleted": SIGEventBus.EVENTS.FEATURE_DELETED,
        "sig:stats:changed": SIGEventBus.EVENTS.STATS_CHANGED,
        "sig:dashboard:refresh": SIGEventBus.EVENTS.DASHBOARD_REFRESH
      };
      var ev = evMap[eventType] || eventType;
      SIGEventBus.emit(ev, { featureId: (detail && detail.id) || null, layer: 'pk', numero: detail && detail.numero });
      if (SIGEventBus.EVENTS.STATS_CHANGED) SIGEventBus.emit(SIGEventBus.EVENTS.STATS_CHANGED, { source: 'pk' });
      if (SIGEventBus.EVENTS.DASHBOARD_REFRESH) SIGEventBus.emit(SIGEventBus.EVENTS.DASHBOARD_REFRESH, {});
    }
    /* Audit avec signature correcte log(action, options) */
    if (typeof SIGAuditTrail !== "undefined") {
      try {
        var action = (detail && detail.action) ? detail.action : "UPDATE";
        var actionConst;
        if (action === "CREATE") actionConst = SIGAuditTrail.ACTIONS.CREATE_PK || SIGAuditTrail.ACTIONS.CREATE_ROUTE;
        else if (action === "DELETE") actionConst = SIGAuditTrail.ACTIONS.DELETE_PK || SIGAuditTrail.ACTIONS.DELETE_ROUTE;
        else actionConst = SIGAuditTrail.ACTIONS.UPDATE_PK || SIGAuditTrail.ACTIONS.UPDATE_ROUTE;
        SIGAuditTrail.log(actionConst, {
          featureId: (detail && detail.id) ? String(detail.id) : null,
          featureName: (detail && detail.numero) || 'PK',
          user: getSessionName(),
          details: 'PK ' + ((detail && detail.numero) || '') + ' â€” action ' + action + ' (couche PK)',
          before: null,
          after: null,
          result: 'SUCCESS',
          entityType: 'pk'
        });
      } catch(e) {}
    }
  }

  /* ===== STATS ===== */
  function computeStats() {
    var total = state.allPKs.length;
    var rs = {};
    state.allPKs.forEach(function(pk) { rs[(pk.properties || {}).route || "Non associ\u00e9"] = true; });
    var rc = Object.keys(rs).length;
    return { total: total, routeCount: rc, avgPerRoute: rc > 0 ? (total / rc) : 0 };
  }

  /* ===== FILTRES ===== */
  function applyFilters() {
    var s = state.search.toLowerCase();
    var f = state.filters;
    state.filtered = state.allPKs.filter(function(pk) {
      var p = pk.properties || {};
      if (s) {
        var h = ((p.numero || "") + " " + (p.route || "") + " " + (p.observations || "") + " " + (p.PK_DEB_X || "") + " " + (p.PK_FIN_X || "")).toLowerCase();
        if (h.indexOf(s) === -1) return false;
      }
      if (f.route && p.route !== f.route) return false;
      return true;
    });
    if (state.page > totalPages()) state.page = 1;
  }
  function totalPages() { return Math.max(1, Math.ceil(state.filtered.length / PER_PAGE)); }
  function getPageData() { var s = (state.page - 1) * PER_PAGE; return state.filtered.slice(s, s + PER_PAGE); }

  /* ===== TOAST ===== */
  function notify(msg, type) {
    type = type || "success";
    var ex = document.getElementById("pk-toast");
    if (ex) ex.remove();
    var t = document.createElement("div");
    t.id = "pk-toast";
    t.className = "route-toast " + type;
    var ic = type === "success" ? "fa-check-circle" : (type === "error" ? "fa-exclamation-circle" : "fa-info-circle");
    t.innerHTML = '<i class="fas ' + ic + '"></i> ' + esc(msg);
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add("show"); }, 10);
    setTimeout(function() { t.classList.remove("show"); setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 3000);
  }

  /* ===== RENDER ===== */
  function render() { loadData(); applyFilters(); return buildPage(); }

  function buildPage() {
    var stats = computeStats();
    var html = '<div class="page-header"><h1>Gestion des points kilom\u00e9triques</h1>'
      + '<p>Consultation, cr\u00e9ation et gestion des ' + stats.total + ' points kilom\u00e9triques du r\u00e9seau</p></div>';

    html += '<div class="stats-row grid-2">';
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-map-marker-alt"></i></div><div class="sc-value">' + stats.total + '</div><div class="sc-label">PKs totaux</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon blue"><i class="fas fa-road"></i></div><div class="sc-value">' + stats.routeCount + '</div><div class="sc-label">Routes avec PK</div></div>';
    html += '</div>';

    /* Toolbar */
    html += '<div class="routes-toolbar"><div class="routes-search"><i class="fas fa-search"></i>';
    html += '<input type="text" id="pk-search-input" placeholder="Rechercher..." value="' + ea(state.search) + '" oninput="PKModule.onSearch(this.value)"></div>';
    html += '<div class="routes-actions">';

    var routes = getRouteList();
    html += '<select id="pk-filter-route" onchange="PKModule.onFilter(&#39;route&#39;, this.value)" style="background:var(--bg-3,#111);border:1px solid var(--border,#333);color:var(--text,#e0e0e0);padding:8px 12px;border-radius:6px;min-width:180px;margin-right:8px;font-size:.85rem">';
    html += '<option value="">-- Toutes les routes --</option>';
    routes.forEach(function(r) {
      var sel = String(r.name) === String(state.filters.route) ? " selected" : "";
      html += '<option value="' + ea(r.name) + '"' + sel + '>' + esc(r.name) + '</option>';
    });
    html += '</select>';

    if (canEdit()) {
      html += '<button class="btn-sm primary" onclick="PKModule.openCreateModal()"><i class="fas fa-plus"></i> Ajouter un PK</button>';
    }
    html += '</div></div>';

    if (state.search || state.filters.route) {
      html += '<div style="padding:0 0 8px;display:flex;align-items:center;gap:8px">';
      html += '<button class="btn-sm ghost" onclick="PKModule.resetFilters()"><i class="fas fa-rotate-left"></i> R\u00e9initialiser</button>';
      html += '<span style="font-size:.82rem;color:var(--text-3)">' + state.filtered.length + ' r\u00e9sultat' + (state.filtered.length > 1 ? "s" : "") + '</span>';
      html += '</div>';
    }

    /* Table */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-map-marker-alt"></i> Points kilom\u00e9triques <span style="font-weight:400;color:var(--text-4);font-size:.82rem;margin-left:8px">(' + state.filtered.length + ')</span></h3></div>';
    html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>';
    html += '<th>Num\u00e9ro</th><th>Route</th><th>Classe</th><th>D\u00e9but (X, Y)</th><th>Fin (X, Y)</th><th style="text-align:right">Actions</th>';
    html += '</tr></thead><tbody>';

    var rows = getPageData();
    if (rows.length === 0) {
      html += '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-4)"><div class="empty-state"><i class="fas fa-map-marker-alt"></i><h3>Aucun PK</h3><p>Ajoutez un PK ou modifiez vos filtres.</p>';
      if (canEdit()) html += '<button class="btn-sm primary" onclick="PKModule.openCreateModal()" style="margin-top:12px"><i class="fas fa-plus"></i> Ajouter</button>';
      html += '</div></td></tr>';
    } else {
      rows.forEach(function(pk) { html += buildRow(pk); });
    }

    html += '</tbody></table></div>';
    html += buildPagination();
    html += '</div>';
    return html;
  }

  function buildRow(pk) {
    var p = pk.properties || {};
    var html = "<tr>";
    html += '<td><strong style="cursor:pointer;color:var(--gold-dark)" onclick="PKModule.openViewModal(&#39;' + ea(pk.id) + '&#39;)">' + esc(p.numero || "\u2014") + "</strong></td>";
    html += "<td>" + esc(p.route || "\u2014") + "</td>";
    html += '<td><span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:.78rem;font-weight:600;background:' + (p.classe === "RN" ? "var(--red,.c44)" : p.classe === "CU" ? "var(--gold-dark,#b8860b)" : p.classe === "RR" ? "var(--blue,.48c)" : p.classe === "RC" ? "var(--green,.4a4)" : "var(--text-4,#666)") + ';color:#fff">' + esc(p.classe || "\u2014") + "</span></td>";
    html += '<td style="font-size:.82rem;font-family:monospace;color:var(--text-3)">' + fc(p.PK_DEB_X) + ", " + fc(p.PK_DEB_Y) + "</td>";
    html += '<td style="font-size:.82rem;font-family:monospace;color:var(--text-3)">' + fc(p.PK_FIN_X) + ", " + fc(p.PK_FIN_Y) + "</td>";
    html += '<td style="text-align:right;white-space:nowrap">';
    html += '<button class="btn-icon" title="Voir" onclick="PKModule.openViewModal(&#39;' + ea(pk.id) + '&#39;)"><i class="fas fa-eye"></i></button>';
    if (canEdit()) html += '<button class="btn-icon" title="Modifier" onclick="PKModule.openEditModal(&#39;' + ea(pk.id) + '&#39;)"><i class="fas fa-pen"></i></button>';
    if (isAdmin()) html += '<button class="btn-icon danger" title="Supprimer" onclick="PKModule.confirmDelete(&#39;' + ea(pk.id) + '&#39;)"><i class="fas fa-trash"></i></button>';
    html += "</td></tr>";
    return html;
  }

  function buildPagination() {
    var tp = totalPages();
    if (tp <= 1) return "";
    var html = '<div class="routes-pagination"><span class="pag-info">Page ' + state.page + "/" + tp + " (" + state.filtered.length + ")</span><div class=\"pag-buttons\">";
    html += '<button class="btn-sm ghost" ' + (state.page <= 1 ? "disabled" : "") + " onclick=\"PKModule.goPage(" + (state.page - 1) + ")\"><i class=\"fas fa-chevron-left\"></i></button>";
    var pgs = pagRange(state.page, tp);
    pgs.forEach(function(pg) {
      if (pg === "...") { html += '<span class="pag-dots">...</span>'; }
      else { var cls = pg === state.page ? "primary" : "ghost"; html += '<button class="btn-sm ' + cls + '" onclick="PKModule.goPage(' + pg + ')">' + pg + "</button>"; }
    });
    html += '<button class="btn-sm ghost" ' + (state.page >= tp ? "disabled" : "") + " onclick=\"PKModule.goPage(" + (state.page + 1) + ")\"><i class=\"fas fa-chevron-right\"></i></button>";
    html += "</div></div>";
    return html;
  }
  function pagRange(c, t) {
    if (t <= 7) { var a = []; for (var i = 1; i <= t; i++) a.push(i); return a; }
    if (c <= 4) return [1, 2, 3, 4, 5, "...", t];
    if (c >= t - 3) return [1, "...", t - 4, t - 3, t - 2, t - 1, t];
    return [1, "...", c - 1, c, c + 1, "...", t];
  }

  /* ===== MODALS ===== */

  function openViewModal(id) {
    var pk = findPK(id);
    if (!pk) return;
    closeModal("modal-pk-view");
    var p = pk.properties || {};

    var html = '<div class="modal-admin-overlay" id="modal-pk-view" onclick="PKModule.closeModalOnOverlay(event, &#39;modal-pk-view&#39;)">';
    html += '<div class="modal-admin"><div class="modal-admin-header"><h2><i class="fas fa-map-marker-alt" style="color:var(--gold);margin-right:8px"></i> Fiche PK</h2><button class="modal-admin-close" onclick="PKModule.closeModal(&#39;modal-pk-view&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><div class="detail-grid">';
    html += df("Num\u00e9ro", p.numero);
    html += df("Route", p.route);
    html += df("Classe", p.classe || "\u2014");
    if (p.longueur) html += df("Longueur (m)", fc(p.longueur));
    html += df("Source", p.source === "route" ? "Donn\u00e9es route" : "Saisie manuelle");
    html += "</div>";

    /* Point de dÃ©but */
    html += '<div style="margin-top:16px;padding:12px;background:var(--bg-2);border-radius:8px"><div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-play" style="margin-right:6px"></i> Point de d\u00e9but</div><div class="detail-grid">';
    html += df("X (PK_DEB_X)", fc(p.PK_DEB_X));
    html += df("Y (PK_DEB_Y)", fc(p.PK_DEB_Y));
    html += "</div></div>";

    /* Point de fin */
    html += '<div style="margin-top:8px;padding:12px;background:var(--bg-2);border-radius:8px"><div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-flag-checkered" style="margin-right:6px"></i> Point de fin</div><div class="detail-grid">';
    html += df("X (PK_FIN_X)", fc(p.PK_FIN_X));
    html += df("Y (PK_FIN_Y)", fc(p.PK_FIN_Y));
    html += "</div></div>";

    if (p.observations) html += dff("Observations", p.observations);
    html += df("Cr\u00e9\u00e9 par", p.modifiedBy);
    html += df("Date", p.createdAt ? new Date(p.createdAt).toLocaleString("fr-FR") : "\u2014");
    html += "</div><div class=\"modal-admin-footer\">";
    html += '<button class="btn-sm ghost" onclick="PKModule.closeModal(&#39;modal-pk-view&#39;)">Fermer</button>';
    if (canEdit()) html += '<button class="btn-sm primary" onclick="PKModule.closeModal(&#39;modal-pk-view&#39;);PKModule.openEditModal(&#39;' + ea(id) + '&#39;)"><i class="fas fa-pen"></i> Modifier</button>';
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function openCreateModal() { openFormModal(null); }
  function openEditModal(id) { var pk = findPK(id); if (pk) openFormModal(pk); }

  function openFormModal(pk) {
    var isEdit = !!pk;
    var p = pk ? (pk.properties || {}) : {};
    var title = isEdit ? "Modifier le PK" : "Ajouter un PK";
    var editId = isEdit ? pk.id : null;
    var routes = getRouteList();
    var formId = "pk-form-" + safeDomId(editId !== null ? editId : "new");

    closeModal("modal-pk-form");

    var html = '<div class="modal-admin-overlay" id="modal-pk-form" onclick="PKModule.closeModalOnOverlay(event, &#39;modal-pk-form&#39;)">';
    html += '<div class="modal-admin"><div class="modal-admin-header"><h2><i class="fas fa-' + (isEdit ? "pen" : "plus") + '" style="color:var(--gold);margin-right:8px"></i> ' + esc(title) + '</h2><button class="modal-admin-close" onclick="PKModule.closeModal(&#39;modal-pk-form&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><form id="' + formId + '" onsubmit="return PKModule.savePK(event, ' + (editId !== null ? "&#39;" + ea(editId) + "&#39;" : "null") + ')">';

    /* NumÃ©ro */
    html += '<div class="form-row-single"><div class="fm-group"><label>Num\u00e9ro PK *</label>';
    html += '<input type="text" name="numero" required value="' + ea(p.numero || "") + '" placeholder="Ex: PK 0+000"></div></div>';

    /* Route */
    html += '<div class="form-row-single"><div class="fm-group"><label>Route associ\u00e9e *</label>';
    html += '<select name="route" required id="pk-form-route" onchange="PKModule.onRouteChange(this.value)">';
    html += '<option value="">-- S\u00e9lectionner une route --</option>';
    routes.forEach(function(r) {
      var sel = String(r.name) === String(p.route) ? " selected" : "";
      var badge = (r.pkDebX && r.pkFinX) ? " \u2705" : "";
      html += '<option value="' + ea(r.name) + '" data-deb-x="' + r.pkDebX + '" data-deb-y="' + r.pkDebY + '" data-fin-x="' + r.pkFinX + '" data-fin-y="' + r.pkFinY + '"' + sel + ">" + esc(r.name) + badge + "</option>";
    });
    html += "</select></div></div>";

    /* Point de dÃ©but */
    html += '<div style="margin-top:12px;padding:10px 12px;background:var(--bg-2);border-radius:8px">';
    html += '<div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-play" style="margin-right:6px"></i> Point de d\u00e9but</div>';
    html += '<div class="form-row"><div class="fm-group"><label>X (PK_DEB_X) *</label>';
    html += '<input type="number" step="any" name="PK_DEB_X" required id="pk-deb-x" value="' + (p.PK_DEB_X !== undefined && p.PK_DEB_X !== null && p.PK_DEB_X !== "" ? p.PK_DEB_X : "") + '" placeholder="Coordonn\u00e9e X d\u00e9but"></div>';
    html += '<div class="fm-group"><label>Y (PK_DEB_Y) *</label>';
    html += '<input type="number" step="any" name="PK_DEB_Y" required id="pk-deb-y" value="' + (p.PK_DEB_Y !== undefined && p.PK_DEB_Y !== null && p.PK_DEB_Y !== "" ? p.PK_DEB_Y : "") + '" placeholder="Coordonn\u00e9e Y d\u00e9but"></div>';
    html += "</div></div>";

    /* Point de fin */
    html += '<div style="margin-top:8px;padding:10px 12px;background:var(--bg-2);border-radius:8px">';
    html += '<div style="font-size:.78rem;font-weight:600;color:var(--gold-dark);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px"><i class="fas fa-flag-checkered" style="margin-right:6px"></i> Point de fin</div>';
    html += '<div class="form-row"><div class="fm-group"><label>X (PK_FIN_X) *</label>';
    html += '<input type="number" step="any" name="PK_FIN_X" required id="pk-fin-x" value="' + (p.PK_FIN_X !== undefined && p.PK_FIN_X !== null && p.PK_FIN_X !== "" ? p.PK_FIN_X : "") + '" placeholder="Coordonn\u00e9e X fin"></div>';
    html += '<div class="fm-group"><label>Y (PK_FIN_Y) *</label>';
    html += '<input type="number" step="any" name="PK_FIN_Y" required id="pk-fin-y" value="' + (p.PK_FIN_Y !== undefined && p.PK_FIN_Y !== null && p.PK_FIN_Y !== "" ? p.PK_FIN_Y : "") + '" placeholder="Coordonn\u00e9e Y fin"></div>';
    html += "</div></div>";

    /* Observations */
    html += '<div class="form-row-single" style="margin-top:12px"><div class="fm-group"><label>Observations</label>';
    html += '<textarea name="observations" rows="3" placeholder="Observations...">' + esc(p.observations || "") + "</textarea></div></div>";

    /* Info */
    html += '<div style="padding:10px 12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-4);margin-top:4px">';
    html += '<i class="fas fa-info-circle" style="margin-right:6px;color:var(--blue)"></i>';
    html += "La s\u00e9lection d\u2019une route remplit automatiquement les coordonn\u00e9es de d\u00e9but et fin. Les routes avec PK existant sont marqu\u00e9es \u2705.";
    html += "</div>";

    html += '</form></div><div class="modal-admin-footer">';
    html += '<button class="btn-sm ghost" onclick="PKModule.closeModal(&#39;modal-pk-form&#39;)">Annuler</button>';
    html += '<button class="btn-sm primary" type="submit" form="' + formId + '"><i class="fas fa-save"></i> ' + (isEdit ? "Enregistrer" : "Ajouter") + "</button>";
    html += "</div></div></div>";
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function confirmDelete(id) {
    if (!isAdmin()) { notify("Seul un Administrateur peut supprimer.", "error"); return; }
    var pk = findPK(id);
    if (!pk) return;
    closeModal("modal-pk-delete");
    var name = (pk.properties && pk.properties.numero) || "ce PK";
    var html = '<div class="modal-admin-overlay" id="modal-pk-delete"><div class="modal-admin" style="max-width:440px">';
    html += '<div class="modal-admin-header"><h2><i class="fas fa-exclamation-triangle" style="color:var(--red);margin-right:8px"></i> Confirmer</h2><button class="modal-admin-close" onclick="PKModule.closeModal(&#39;modal-pk-delete&#39;)"><i class="fas fa-times"></i></button></div>';
    html += '<div class="modal-admin-body"><p>Supprimer <strong style="color:var(--red)">' + esc(name) + "</strong> ?</p><p style=\"font-size:.84rem;color:var(--text-4);margin-top:8px\">Action irr\u00e9versible.</p></div>";
    html += '<div class="modal-admin-footer"><button class="btn-sm ghost" onclick="PKModule.closeModal(&#39;modal-pk-delete&#39;)">Annuler</button>';
    html += '<button class="btn-sm danger" onclick="PKModule.deletePK(&#39;' + ea(id) + '&#39;)"><i class="fas fa-trash"></i> Supprimer</button></div></div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
  }

  /* ===== CRUD ===== */
  function savePK(event, id) {
    if (event) event.preventDefault();
    var form = event && event.target && event.target.tagName && event.target.tagName.toUpperCase() === "FORM"
      ? event.target
      : document.querySelector('#modal-pk-form form');
    if (!form) return false;
    if (!canEdit()) { notify("Permissions insuffisantes.", "error"); return false; }
    if (typeof form.reportValidity === 'function' && !form.reportValidity()) return false;

    var data = {};
    form.querySelectorAll("input,select,textarea").forEach(function(el) {
      var v = el.value;
      if (el.type === "number" && v !== "") v = parseFloat(v);
      data[el.name] = v;
    });

    if (!data.numero || !data.numero.trim()) { notify("Le num\u00e9ro PK est obligatoire.", "error"); return false; }
    if (!data.route || !data.route.trim()) { notify("La route est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_DEB_X)) { notify("La coordonn\u00e9e X de d\u00e9but est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_DEB_Y)) { notify("La coordonn\u00e9e Y de d\u00e9but est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_FIN_X)) { notify("La coordonn\u00e9e X de fin est obligatoire.", "error"); return false; }
    if (isNaN(data.PK_FIN_Y)) { notify("La coordonn\u00e9e Y de fin est obligatoire.", "error"); return false; }

    var now = new Date().toISOString();
    var userName = getSessionName();
    var props = {
      numero: data.numero.trim(), route: data.route.trim(),
      PK_DEB_X: parseFloat(data.PK_DEB_X), PK_DEB_Y: parseFloat(data.PK_DEB_Y),
      PK_FIN_X: parseFloat(data.PK_FIN_X), PK_FIN_Y: parseFloat(data.PK_FIN_Y),
      observations: data.observations || "",
      lastModified: now, modifiedBy: userName
    };
    var geom = { type: "LineString", coordinates: [[props.PK_DEB_X, props.PK_DEB_Y], [props.PK_FIN_X, props.PK_FIN_Y]] };

    if (id !== null && id !== undefined) {
      var pk = findPK(id);
      if (pk) {
        var previousRoute = (pk.properties && pk.properties.route) || "";
        /* Conserver createdAt si prÃ©sent (PHASE 5) */
        if (pk.properties && pk.properties.createdAt) props.createdAt = pk.properties.createdAt;
        if (pk.properties) { for (var k in props) pk.properties[k] = props[k]; }
        else { pk.properties = props; }
        pk.geometry = geom;
        if (previousRoute && previousRoute !== props.route) {
          clearPKFromRoute(previousRoute);
        }
        /* Synchroniser les PK_DEB_X/Y et PK_FIN_X/Y de la route associÃ©e (sync PKâ†’route) */
        syncPKToRoute(props.route, props);
        persistAndNotify("sig:feature:updated", { id: id, numero: data.numero, type: "pk", action: "UPDATE" });
        closeModal("modal-pk-form");
        notify('"' + data.numero + '" modifiÃ©.', "success");
      }
    } else {
      props.createdAt = now;
      var newId = "pk_" + Date.now();
      var newPK = { type: "Feature", id: newId, geometry: geom, properties: props };
      state.allPKs.push(newPK);
      /* Synchroniser les PK_DEB_X/Y et PK_FIN_X/Y de la route associÃ©e (sync PKâ†’route) */
      syncPKToRoute(props.route, props);
      persistAndNotify("sig:feature:created", { id: newId, numero: data.numero, type: "pk", action: "CREATE" });
      closeModal("modal-pk-form");
      notify('"' + data.numero + '" ajoutÃ©.', "success");
    }
    refresh();
    return false;
  }

  function deletePK(id) {
    if (!isAdmin()) { notify("Permissions insuffisantes.", "error"); return; }
    var pk = findPK(id);
    var name = pk ? ((pk.properties && pk.properties.numero) || "PK") : "PK";
    var routeName = pk && pk.properties ? pk.properties.route : "";
    if (routeName) clearPKFromRoute(routeName);
    state.allPKs = state.allPKs.filter(function(p) { return String(p.id) !== String(id); });
    persistAndNotify("sig:feature:deleted", { id: id, numero: name, type: "pk", action: "DELETE" });
    closeModal("modal-pk-delete");
    notify('"' + name + '" supprim\u00e9.', "success");
    refresh();
  }

  /**
   * Synchronise les coordonnÃ©es du PK vers la route associÃ©e dans json_Rseauroutier_6.
   * Met Ã  jour PK_DEB_X/Y et PK_FIN_X/Y de la route. Sync bidirectionnelle PKâ†’route.
   */
  function syncPKToRoute(routeName, pkProps) {
    if (!routeName || typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return;
    json_Rseauroutier_6.features.forEach(function(feat) {
      var p = feat.properties || {};
      if (p.Name === routeName) {
        p.PK_DEB_X = pkProps.PK_DEB_X;
        p.PK_DEB_Y = pkProps.PK_DEB_Y;
        p.PK_FIN_X = pkProps.PK_FIN_X;
        p.PK_FIN_Y = pkProps.PK_FIN_Y;
        p.lastModified = new Date().toISOString();
        p.modifiedBy = 'PKModule (sync PKâ†’route)';
      }
    });
    /* Persister la mise Ã  jour de la route */
    if (typeof SIGPersistence !== "undefined") {
      try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6); } catch(e) {}
    }
  }

  /**
   * Calcule le chaÃ®nage d'un PK sous la forme "PK X+YYY" (km+ mÃ¨tres)
   * depuis la longueur connue de la route ou la distance haversine entre dÃ©but et fin.
   * @param {Object} pkProps - propriÃ©tÃ©s du PK (route, PK_DEB_X/Y, PK_FIN_X/Y, longueur)
   * @returns {string} chaÃ®nage formatÃ©, ex: "PK 12+450"
   */
  function computeChainage(pkProps) {
    if (!pkProps) return "â€”";
    /* Si on a la longueur explicite de la route, l'utiliser comme chaÃ®nage total */
    var longueur = parseFloat(pkProps.longueur);
    if (!isNaN(longueur) && longueur > 0) {
      var km = Math.floor(longueur / 1000);
      var m = Math.round(longueur - km * 1000);
      return "PK " + km + "+" + (m < 10 ? "00" + m : m < 100 ? "0" + m : m);
    }
    /* Sinon, calculer la distance haversine entre dÃ©but et fin */
    if (pkProps.PK_DEB_X !== undefined && pkProps.PK_FIN_X !== undefined) {
      var d = haversineDistance(pkProps.PK_DEB_X, pkProps.PK_DEB_Y, pkProps.PK_FIN_X, pkProps.PK_FIN_Y);
      if (!isNaN(d) && d > 0) {
        var km2 = Math.floor(d / 1000);
        var m2 = Math.round(d - km2 * 1000);
        return "PK " + km2 + "+" + (m2 < 10 ? "00" + m2 : m2 < 100 ? "0" + m2 : m2);
      }
    }
    return pkProps.numero || "â€”";
  }

  /**
   * Distance haversine (en mÃ¨tres) entre deux points [x=lon, y=lat].
   */
  function haversineDistance(x1, y1, x2, y2) {
    var R = 6371000; /* rayon Terre en mÃ¨tres */
    var toRad = function(d) { return d * Math.PI / 180; };
    var dLat = toRad(y2 - y1);
    var dLon = toRad(x2 - x1);
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(y1)) * Math.cos(toRad(y2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calcule la distance entre deux PKs donnÃ©s (par ID).
   * @returns {Object} { distance, formatted } ou { error } si PK introuvable
   */
  function computeDistanceBetweenPKs(id1, id2) {
    var pk1 = findPK(id1);
    var pk2 = findPK(id2);
    if (!pk1 || !pk2) return { error: "PK introuvable" };
    var p1 = pk1.properties || {};
    var p2 = pk2.properties || {};
    /* Distance entre le point de fin de pk1 et le point de dÃ©but de pk2 (chaÃ®nage consÃ©cutif) */
    var d = haversineDistance(p1.PK_FIN_X, p1.PK_FIN_Y, p2.PK_DEB_X, p2.PK_DEB_Y);
    if (isNaN(d)) return { error: "CoordonnÃ©es manquantes" };
    var km = (d / 1000).toFixed(2);
    return {
      distance: d,
      formatted: d.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " m (" + km + " km)",
      pk1Numero: p1.numero,
      pk2Numero: p2.numero
    };
  }

  /* ===== Ã‰COUTE SIGEventBus : supprimer les PK orphelins quand une route est supprimÃ©e ===== */
  if (typeof SIGEventBus !== "undefined") {
    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      if (!data) return;
      /* Si l'Ã©vÃ©nement concerne une route (pas un PK), supprimer les PK orphelins */
      if (data.layer === 'routes' || data.layer === 'Rseauroutier_6') {
        var routeName = data.featureName;
        if (!routeName) return;
        var before = state.allPKs.length;
        state.allPKs = state.allPKs.filter(function(pk) {
          return !((pk.properties || {}).route === routeName);
        });
        if (state.allPKs.length !== before) {
          var fc2 = { type: "FeatureCollection", features: state.allPKs };
          window.json_PK = fc2;
          if (typeof SIGPersistence !== "undefined") {
            try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, fc2); } catch(e) {}
          }
        }
      }
    });
  }

  function clearPKFromRoute(routeName) {
    if (!routeName || typeof json_Rseauroutier_6 === "undefined" || !json_Rseauroutier_6.features) return;
    json_Rseauroutier_6.features.forEach(function(feat) {
      var p = feat.properties || {};
      if (p.Name === routeName) {
        p.PK_DEB_X = null;
        p.PK_DEB_Y = null;
        p.PK_FIN_X = null;
        p.PK_FIN_Y = null;
        p.lastModified = new Date().toISOString();
        p.modifiedBy = 'PKModule (clear PK)';
      }
    });
    if (typeof SIGPersistence !== "undefined") {
      try { SIGPersistence.saveLayer(SIGPersistence.LAYERS.ROUTES, json_Rseauroutier_6); } catch(e) {}
    }
  }

  /* ===== EVENT HANDLERS ===== */
  function onRouteChange(routeName) {
    var sel = document.getElementById("pk-form-route");
    if (!sel) return;
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return;
    var debX = document.getElementById("pk-deb-x");
    var debY = document.getElementById("pk-deb-y");
    var finX = document.getElementById("pk-fin-x");
    var finY = document.getElementById("pk-fin-y");
    if (debX) debX.value = opt.getAttribute("data-deb-x") || "";
    if (debY) debY.value = opt.getAttribute("data-deb-y") || "";
    if (finX) finX.value = opt.getAttribute("data-fin-x") || "";
    if (finY) finY.value = opt.getAttribute("data-fin-y") || "";
  }

  function onSearch(val) { state.search = val; state.page = 1; applyFilters(); refresh(); }
  function onFilter(key, val) { state.filters[key] = val; state.page = 1; applyFilters(); refresh(); }
  function resetFilters() { state.search = ""; state.filters = { route: "" }; state.page = 1; applyFilters(); refresh(); }
  function goPage(p) { state.page = p; refresh(); }
  function closeModal(id) { document.querySelectorAll('[id="' + id + '"]').forEach(function(el) { el.remove(); }); }
  function closeModalOnOverlay(event, id) { if (event.target.id === id) closeModal(id); }

  function safeDomId(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_") || "item";
  }
  function refresh() { applyFilters(); var el = document.getElementById("adminContent"); if (el) { el.innerHTML = buildPage(); el.scrollTop = 0; } }

  function df(l, v) { return '<div class="detail-item"><div class="detail-label">' + esc(l) + "</div><div class=\"detail-value\">" + esc(v || "\u2014") + "</div></div>"; }
  function dff(l, v) { return '<div class="detail-item detail-full"><div class="detail-label">' + esc(l) + "</div><div class=\"detail-value\">" + esc(v || "\u2014") + "</div></div>"; }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render, onSearch: onSearch, onFilter: onFilter, resetFilters: resetFilters, goPage: goPage,
    openViewModal: openViewModal, openEditModal: openEditModal, openCreateModal: openCreateModal,
    savePK: savePK, confirmDelete: confirmDelete, deletePK: deletePK, onRouteChange: onRouteChange,
    closeModal: closeModal, closeModalOnOverlay: closeModalOnOverlay,
    /* Nouvelles fonctions PHASE 5 */
    computeChainage: computeChainage,
    computeDistanceBetweenPKs: computeDistanceBetweenPKs
  };
})();

/* ==== END admin-pk.js ==== */

/* ==== BEGIN admin-spatial.js ==== */
/* ===================================================================
 * GeoROAD TOGO â€” Module Gestion des DonnÃ©es Spatiales
 *
 * Import : GeoJSON, CSV (avec dÃ©tection automatique des colonnes de coordonnÃ©es)
 * Export : GeoJSON, CSV, PDF (fiche), Excel
 *
 * L'import affiche un aperÃ§u complet avant validation :
 *   - Nombre d'entitÃ©s
 *   - Projection dÃ©tectÃ©e
 *   - Types de gÃ©omÃ©trie
 *   - Ã‰tendue (bbox)
 *   - Erreurs Ã©ventuelles
 *   - Choix de la couche de destination
 *   - Annuler / Confirmer
 *
 * AprÃ¨s validation :
 *   - Import via SIGDataEngine
 *   - DÃ©clenche EventBus
 *   - Met Ã  jour carte, statistiques, dashboard, journal d'audit
 *
 * DÃ©pend : SIGEventBus, SIGAuditTrail, SIGPersistence, AdminAuth
 * =================================================================== */
var SpatialModule = (function() {
  'use strict';

  /* ===== COUCHES DE DESTINATION ===== */
  var DESTINATION_LAYERS = [
    { key: 'routes', label: 'RÃ©seau routier', icon: 'fa-road', geomTypes: ['LineString', 'MultiLineString'] },
    { key: 'emprises', label: 'Emprises', icon: 'fa-vector-square', geomTypes: ['Polygon', 'MultiPolygon'] },
    { key: 'pk', label: 'Points kilomÃ©triques', icon: 'fa-map-pin', geomTypes: ['Point'] }
  ];

  /* ===== COORDINATE COLUMN PATTERNS ===== */
  var COORD_PATTERNS = [
    { lat: ['latitude', 'lat'], lon: ['longitude', 'lon', 'lng'], crs: 'EPSG:4326' },
    { lat: ['lat'], lon: ['lon'], crs: 'EPSG:4326' },
    { lat: ['y'], lon: ['x'], crs: 'EPSG:4326' },
    { lat: ['northing'], lon: ['easting'], crs: 'EPSG:32631' },
    { lat: ['nord'], lon: ['est'], crs: 'EPSG:32631' },
    { lat: ['coord_y'], lon: ['coord_x'], crs: 'EPSG:4326' },
    { lat: ['utm_n', 'utm_y', 'y_utm'], lon: ['utm_e', 'utm_x', 'x_utm'], crs: 'EPSG:32631' },
    { lat: ['pk_deb_y'], lon: ['pk_deb_x'], crs: 'EPSG:4326' }
  ];

  function detectCoordColumns(headers) {
    var lowerHeaders = headers.map(function(h) { return h.toLowerCase().trim(); });
    for (var p = 0; p < COORD_PATTERNS.length; p++) {
      var pat = COORD_PATTERNS[p];
      var latIdx = -1, lonIdx = -1;
      for (var i = 0; i < lowerHeaders.length; i++) {
        if (latIdx === -1) {
          for (var li = 0; li < pat.lat.length; li++) {
            if (lowerHeaders[i] === pat.lat[li]) { latIdx = i; break; }
          }
        }
        if (lonIdx === -1) {
          for (var lo = 0; lo < pat.lon.length; lo++) {
            if (lowerHeaders[i] === pat.lon[lo]) { lonIdx = i; break; }
          }
        }
      }
      if (latIdx !== -1 && lonIdx !== -1) {
        return { latIdx: latIdx, lonIdx: lonIdx, crs: pat.crs, latHeader: headers[latIdx], lonHeader: headers[lonIdx] };
      }
    }
    return null;
  }

  /* ===== CRS HELPERS ===== */
  var CRS_LABELS = {
    'EPSG:4326': 'WGS 84 (gÃ©ographique)',
    'EPSG:32630': 'UTM Zone 30N',
    'EPSG:32631': 'UTM Zone 31N',
    'EPSG:32632': 'UTM Zone 32N'
  };

  function reprojectToWGS84(x, y, fromCRS) {
    if (fromCRS === 'EPSG:4326') return [x, y];
    if (typeof SIGSpatialCalculator !== 'undefined' && typeof SIGSpatialCalculator.reproject === 'function') {
      return SIGSpatialCalculator.reproject([x, y], fromCRS, 'EPSG:4326');
    }
    if (typeof ol !== 'undefined' && ol.proj && ol.proj.transform) {
      return ol.proj.transform([x, y], fromCRS, 'EPSG:4326');
    }
    /* Fallback: simple approximation (less accurate) */
    var lon = (x - 500000) / 111319.488 + 0;
    var lat = y / 110546.466;
    return [lon, lat];
  }

  function isUTMCoord(x, y) {
    /* UTM coordinates: Easting ~100k-900k, Northing ~0-10M for zone 31N (Togo) */
    return x > 100000 && x < 900000 && y > 0 && y < 10000000;
  }

  function detectCRSFromBBox(bbox) {
    /* If all X coords are in UTM range, likely UTM */
    if (isUTMCoord(bbox.minX, bbox.minY) && isUTMCoord(bbox.maxX, bbox.maxY)) {
      return 'EPSG:32631';
    }
    /* If coords look like geographic (lon/lat in reasonable ranges) */
    if (bbox.minX >= -180 && bbox.maxX <= 180 && bbox.minY >= -90 && bbox.maxY <= 90) {
      return 'EPSG:4326';
    }
    return 'EPSG:4326'; /* default */
  }

  /* ===== HELPER ===== */
  function esc(s) {
    return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : '';
  }

  /* ===== RENDER ===== */
  function render() {
    var html = '<div class="page-header"><h1>Gestion des donnÃ©es spatiales</h1>'
      + '<p>Importez et exportez vos donnÃ©es gÃ©ographiques â€” GeoJSON, CSV</p></div>';

    /* Import / Export cards */
    html += '<div class="grid-2">';
    html += '<div class="admin-panel"><div class="panel-body" style="text-align:center;padding:40px 24px">'
      + '<div class="sc-icon gold" style="margin:0 auto 14px"><i class="fas fa-file-import"></i></div>'
      + '<h3 style="font-size:1rem;font-weight:600;margin-bottom:4px">Importer des donnÃ©es</h3>'
      + '<p style="font-size:.82rem;color:var(--text-3);margin-bottom:16px">GeoJSON (.geojson, .json) et CSV (.csv)</p>'
      + '<button class="btn-sm primary" onclick="SpatialModule.openImportDialog()"><i class="fas fa-upload"></i> Importer</button>'
      + '</div></div>';

    html += '<div class="admin-panel"><div class="panel-body" style="text-align:center;padding:40px 24px">'
      + '<div class="sc-icon blue" style="margin:0 auto 14px"><i class="fas fa-file-export"></i></div>'
      + '<h3 style="font-size:1rem;font-weight:600;margin-bottom:4px">Exporter des donnÃ©es</h3>'
      + '<p style="font-size:.82rem;color:var(--text-3);margin-bottom:16px">GeoJSON, CSV, PDF, Excel</p>'
      + '<button class="btn-sm primary" onclick="SpatialModule.openExportDialog()"><i class="fas fa-download"></i> Exporter</button>'
      + '</div></div>';
    html += '</div>';

    /* Layers table â€” vue enrichie PHASE 6 */
    html += '<div class="admin-panel" style="margin-top:20px"><div class="panel-header"><h3><i class="fas fa-layer-group"></i> Couches disponibles</h3>'
      + '<button class="btn-sm ghost" style="margin-left:auto" onclick="SpatialModule.refreshLayers()"><i class="fas fa-rotate"></i> RafraÃ®chir</button></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Couche</th><th>Type gÃ©om.</th><th>EntitÃ©s</th><th>Projection</th><th>Date mise Ã  jour</th><th>Ã‰tat</th><th>SantÃ©</th><th style="text-align:right">Actions</th>'
      + '</tr></thead><tbody>';

    var layers = getLayerInfo();
    layers.forEach(function(l) {
      var sante = l.health;
      var santeBadge = sante.errors === 0
        ? '<span class="status-badge active" title="' + sante.errors + ' erreur(s), ' + sante.warnings + ' avertissement(s)"><i class="fas fa-circle-check"></i> OK</span>'
        : '<span class="status-badge inactive" title="' + sante.errors + ' erreur(s), ' + sante.warnings + ' avertissement(s)"><i class="fas fa-circle-exclamation"></i> ' + sante.errors + ' erreur(s)</span>';
      html += '<tr>'
        + '<td><strong><i class="fas ' + l.icon + '" style="margin-right:6px;color:var(--gold)"></i>' + l.name + '</strong></td>'
        + '<td>' + l.geomType + '</td>'
        + '<td>' + l.count + '</td>'
        + '<td style="font-family:monospace;font-size:.8rem">' + l.projection + '</td>'
        + '<td style="font-size:.8rem">' + l.lastModified + '</td>'
        + '<td><span class="status-badge ' + l.status + '">' + l.statusLabel + '</span></td>'
        + '<td>' + santeBadge + '</td>'
        + '<td style="text-align:right;white-space:nowrap">'
        + '<button class="btn-icon" title="Exporter" onclick="SpatialModule.exportLayer(\'' + l.key + '\')"><i class="fas fa-download"></i></button>'
        + '<button class="btn-icon" title="Informations" onclick="SpatialModule.showLayerInfo(\'' + l.key + '\')"><i class="fas fa-circle-info"></i></button>'
        + '<button class="btn-icon" title="VÃ©rification gÃ©omÃ©trique" onclick="SpatialModule.validateLayerGeometry(\'' + l.key + '\')"><i class="fas fa-clipboard-check"></i></button>'
        + '<a class="btn-icon" title="Voir sur le gÃ©oportail" href="geoportail.html" target="_blank" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:inherit"><i class="fas fa-external-link-alt"></i></a>'
        + '</td></tr>';
    });
    html += '</tbody></table></div></div></div>';

    /* Storage info */
    if (typeof SIGPersistence !== 'undefined') {
      var size = SIGPersistence.getStorageSize();
      var sizeStr = size > 1048576 ? (size / 1048576).toFixed(2) + ' Mo' : (size / 1024).toFixed(1) + ' Ko';
      html += '<div class="admin-panel" style="margin-top:4px"><div class="panel-body" style="display:flex;align-items:center;gap:14px">'
        + '<div class="sc-icon green"><i class="fas fa-database"></i></div>'
        + '<div><div style="font-weight:600;font-size:.92rem">Stockage local</div>'
        + '<div style="font-size:.82rem;color:var(--text-3)">' + sizeStr + ' utilisÃ©s â€” DerniÃ¨re synchro : '
        + (SIGPersistence.getMeta('lastSync') ? new Date(SIGPersistence.getMeta('lastSync')).toLocaleString('fr-FR') : 'Jamais')
        + '</div></div></div></div>';
    }

    return html;
  }

  function getLayerInfo() {
    var info = [
      { name: 'RÃ©seau routier', varName: 'json_Rseauroutier_6', icon: 'fa-road', geomType: 'Ligne', key: 'routes', storageKey: 'routes' },
      { name: 'Emprises', varName: 'json_Emprise_5', icon: 'fa-vector-square', geomType: 'Polygone', key: 'emprises', storageKey: 'emprises' },
      { name: 'RÃ©gions', varName: 'json_Rgion_2', icon: 'fa-map', geomType: 'Polygone', key: 'regions', storageKey: null },
      { name: 'PrÃ©fectures', varName: 'json_Prfecture_3', icon: 'fa-map-marker-alt', geomType: 'Polygone', key: 'prefectures', storageKey: null },
      { name: 'Cantons', varName: 'json_Canton_4', icon: 'fa-location-dot', geomType: 'Polygone', key: 'cantons', storageKey: null }
    ];
    info.forEach(function(l) {
      var data = window[l.varName];
      l.count = (data && data.features) ? data.features.length : 0;
      l.status = l.count > 0 ? 'active' : 'inactive';
      l.statusLabel = l.count > 0 ? 'Active' : 'Vide';
      /* Projection â€” dÃ©duite du CRS de la couche */
      l.projection = 'EPSG:4326';
      if (data && data.crs && data.crs.properties && data.crs.properties.name) {
        var n = data.crs.properties.name;
        if (n.indexOf('CRS84') !== -1 || n.indexOf('4326') !== -1) l.projection = 'EPSG:4326';
        else if (n.indexOf('32630') !== -1) l.projection = 'EPSG:32630';
        else if (n.indexOf('32631') !== -1) l.projection = 'EPSG:32631';
        else if (n.indexOf('32632') !== -1) l.projection = 'EPSG:32632';
        else if (n.indexOf('3857') !== -1) l.projection = 'EPSG:3857';
      }
      /* Date mise Ã  jour â€” depuis les propriÃ©tÃ©s lastModified des features, ou meta SIGPersistence */
      l.lastModified = 'â€”';
      if (data && data.features) {
        var latest = null;
        data.features.forEach(function(f) {
          var lm = f.properties && (f.properties.lastModified || f.properties.createdAt);
          if (lm && (!latest || new Date(lm) > new Date(latest))) latest = lm;
        });
        if (latest) {
          try { l.lastModified = new Date(latest).toLocaleDateString('fr-FR'); } catch(e) {}
        }
      }
      if (l.lastModified === 'â€”' && l.storageKey && typeof SIGPersistence !== 'undefined') {
        try {
          var ls = SIGPersistence.getMeta('lastSync_' + l.storageKey);
          if (ls) l.lastModified = new Date(ls).toLocaleDateString('fr-FR');
        } catch(e) {}
      }
      /* Indicateur de santÃ© â€” validitÃ© gÃ©omÃ©trique + doublons */
      l.health = computeLayerHealth(data, l.key);
    });
    /* PK depuis localStorage */
    if (typeof SIGPersistence !== 'undefined') {
      var pkData = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
      if (pkData && pkData.features && pkData.features.length > 0) {
        info.push({
          name: 'Points kilomÃ©triques', varName: null, icon: 'fa-map-pin', geomType: 'Point', key: 'pk',
          count: pkData.features.length, status: 'active', statusLabel: 'Active',
          projection: 'EPSG:4326',
          lastModified: (function() {
            var latest = null;
            pkData.features.forEach(function(f) {
              var lm = f.properties && (f.properties.lastModified || f.properties.createdAt);
              if (lm && (!latest || new Date(lm) > new Date(latest))) latest = lm;
            });
            return latest ? new Date(latest).toLocaleDateString('fr-FR') : 'â€”';
          })(),
          health: computeLayerHealth(pkData, 'pk')
        });
      }
    }
    return info;
  }

  /**
   * Calcule l'indicateur de santÃ© d'une couche : { errors, warnings, details }
   * - errors : gÃ©omÃ©tries invalides (null, type inconnu, self-intersections)
   * - warnings : doublons potentiels (mÃªme Name), features sans gÃ©omÃ©trie
   */
  function computeLayerHealth(data, layerKey) {
    var result = { errors: 0, warnings: 0, details: [] };
    if (!data || !data.features) return result;
    var seen = {};
    data.features.forEach(function(f, idx) {
      /* VÃ©rifier que la feature a une gÃ©omÃ©trie */
      if (!f.geometry) {
        result.warnings++;
        return;
      }
      /* VÃ©rifier le type de gÃ©omÃ©trie */
      var validTypes = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];
      if (validTypes.indexOf(f.geometry.type) === -1) {
        result.errors++;
        result.details.push('Feature ' + idx + ' : type gÃ©omÃ©trique inconnu ' + f.geometry.type);
        return;
      }
      /* VÃ©rifier les coordonnÃ©es */
      if (!f.geometry.coordinates && f.geometry.type !== 'GeometryCollection') {
        result.errors++;
        result.details.push('Feature ' + idx + ' : coordonnÃ©es manquantes');
        return;
      }
      /* Si SIGSpatialCalculator est disponible, valider la gÃ©omÃ©trie */
      if (typeof SIGSpatialCalculator !== 'undefined' && typeof SIGSpatialCalculator.validateGeometry === 'function') {
        try {
          var v = SIGSpatialCalculator.validateGeometry(f.geometry);
          if (v && v.errors && v.errors.length > 0) {
            result.errors += v.errors.length;
            v.errors.forEach(function(err) { result.details.push('Feature ' + idx + ' : ' + err); });
          }
          if (v && v.warnings && v.warnings.length > 0) {
            result.warnings += v.warnings.length;
          }
        } catch(e) {}
      }
      /* DÃ©tecter doublons potentiels (mÃªme Name) */
      var name = f.properties && f.properties.Name;
      if (name) {
        if (seen[name]) result.warnings++;
        else seen[name] = true;
      }
    });
    return result;
  }

  /** RafraÃ®chit l'affichage des couches. */
  function refreshLayers() {
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('spatial');
  }

  /** Affiche les informations dÃ©taillÃ©es d'une couche dans un modal. */
  function showLayerInfo(layerKey) {
    var layers = getLayerInfo();
    var l = null;
    for (var i = 0; i < layers.length; i++) { if (layers[i].key === layerKey) { l = layers[i]; break; } }
    if (!l) return;
    var html = '<div class="modal-admin-overlay" id="modal-layer-info" onclick="if(event.target.id===\'modal-layer-info\')SpatialModule.closeModal(\'modal-layer-info\')">'
      + '<div class="modal-admin" style="max-width:560px">'
      + '<div class="modal-admin-header"><h2><i class="fas ' + l.icon + '" style="color:var(--gold);margin-right:8px"></i>' + l.name + '</h2>'
      + '<button class="modal-admin-close" onclick="SpatialModule.closeModal(\'modal-layer-info\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">'
      + '<div class="detail-grid">'
      + '<div class="detail-item"><div class="detail-label">Type gÃ©omÃ©trique</div><div class="detail-value">' + l.geomType + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">Nombre d\'entitÃ©s</div><div class="detail-value">' + l.count + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">Projection</div><div class="detail-value" style="font-family:monospace">' + l.projection + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">Date de mise Ã  jour</div><div class="detail-value">' + l.lastModified + '</div></div>'
      + '<div class="detail-item"><div class="detail-label">Ã‰tat</div><div class="detail-value"><span class="status-badge ' + l.status + '">' + l.statusLabel + '</span></div></div>'
      + '<div class="detail-item"><div class="detail-label">SantÃ© gÃ©omÃ©trique</div><div class="detail-value">' + l.health.errors + ' erreur(s), ' + l.health.warnings + ' avertissement(s)</div></div>'
      + '</div>';
    if (l.health.details.length > 0) {
      html += '<div style="margin-top:14px;padding:12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-3);max-height:160px;overflow-y:auto">'
        + '<strong>DÃ©tails :</strong><ul style="margin:6px 0 0 18px;padding:0">';
      l.health.details.slice(0, 20).forEach(function(d) { html += '<li>' + esc(d) + '</li>'; });
      if (l.health.details.length > 20) html += '<li>... et ' + (l.health.details.length - 20) + ' autre(s)</li>';
      html += '</ul></div>';
    }
    html += '</div><div class="modal-admin-footer">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'modal-layer-info\')">Fermer</button>'
      + '<button class="btn-sm primary" onclick="SpatialModule.closeModal(\'modal-layer-info\');SpatialModule.validateLayerGeometry(\'' + l.key + '\')"><i class="fas fa-clipboard-check"></i> VÃ©rification gÃ©omÃ©trique</button>'
      + '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Lance une vÃ©rification gÃ©omÃ©trique complÃ¨te et affiche le rapport. */
  function validateLayerGeometry(layerKey) {
    var layers = getLayerInfo();
    var l = null;
    for (var i = 0; i < layers.length; i++) { if (layers[i].key === layerKey) { l = layers[i]; break; } }
    if (!l) return;
    /* Recalculer la santÃ© en temps rÃ©el */
    var data = l.varName ? window[l.varName] : (function() {
      if (typeof SIGPersistence !== 'undefined' && layerKey === 'pk') {
        return SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
      }
      return null;
    })();
    var health = computeLayerHealth(data, layerKey);
    var html = '<div class="modal-admin-overlay" id="modal-layer-validate" onclick="if(event.target.id===\'modal-layer-validate\')SpatialModule.closeModal(\'modal-layer-validate\')">'
      + '<div class="modal-admin" style="max-width:560px">'
      + '<div class="modal-admin-header"><h2><i class="fas fa-clipboard-check" style="color:var(--gold);margin-right:8px"></i> VÃ©rification gÃ©omÃ©trique â€” ' + l.name + '</h2>'
      + '<button class="modal-admin-close" onclick="SpatialModule.closeModal(\'modal-layer-validate\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">'
      + '<div style="text-align:center;padding:20px 0">'
      + '<div style="font-size:2.5rem;font-weight:700;color:' + (health.errors === 0 ? 'var(--green)' : 'var(--red)') + '">' + health.errors + '</div>'
      + '<div style="font-size:.85rem;color:var(--text-3)">erreur(s) gÃ©omÃ©trique(s)</div>'
      + '<div style="font-size:1.5rem;font-weight:600;color:var(--gold);margin-top:8px">' + health.warnings + '</div>'
      + '<div style="font-size:.85rem;color:var(--text-3)">avertissement(s)</div>'
      + '</div>';
    if (health.details.length === 0) {
      html += '<div style="padding:14px;background:var(--cream);border-radius:8px;text-align:center;color:var(--green)"><i class="fas fa-circle-check"></i> Aucun problÃ¨me dÃ©tectÃ© sur les ' + l.count + ' entitÃ©s.</div>';
    } else {
      html += '<div style="margin-top:14px;padding:12px;background:var(--cream);border-radius:8px;font-size:.82rem;color:var(--text-3);max-height:200px;overflow-y:auto"><strong>DÃ©tails :</strong><ul style="margin:6px 0 0 18px;padding:0">';
      health.details.forEach(function(d) { html += '<li>' + esc(d) + '</li>'; });
      html += '</ul></div>';
    }
    html += '</div><div class="modal-admin-footer">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'modal-layer-validate\')">Fermer</button>'
      + '</div></div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  /** Export rapide d'une couche individuelle en GeoJSON. */
  function exportLayer(layerKey) {
    var layers = getLayerInfo();
    var l = null;
    for (var i = 0; i < layers.length; i++) { if (layers[i].key === layerKey) { l = layers[i]; break; } }
    if (!l) return;
    var data = l.varName ? window[l.varName] : null;
    if (!data && layerKey === 'pk' && typeof SIGPersistence !== 'undefined') {
      data = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
    }
    if (!data) { alert('Couche introuvable'); return; }
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/geo+json' });
    downloadBlob(blob, l.name.replace(/\s/g, '_') + '.geojson');
  }

  /* ===================================================================
   * IMPORT SYSTEM
   * =================================================================== */

  var _pendingImport = null; /* { fileName, features, errors, warnings } */

  function openImportDialog() {
    var html = '<div class="modal-header"><h2><i class="fas fa-file-import"></i> Importer des donnÃ©es spatiales</h2>'
      + '<button class="modal-close" onclick="SpatialModule.closeModal(\'spatial-import-modal\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-body">'
      + '<div style="border:2px dashed var(--cream-border);border-radius:16px;padding:40px;text-align:center;margin-bottom:20px;transition:all .3s;cursor:pointer" '
      + 'id="import-drop-zone" onclick="document.getElementById(\'import-file-input\').click()" '
      + 'ondragover="event.preventDefault();this.style.borderColor=\'var(--gold)\';this.style.background=\'var(--gold-pale)\'" '
      + 'ondragleave="this.style.borderColor=\'var(--cream-border)\';this.style.background=\'transparent\'" '
      + 'ondrop="event.preventDefault();this.style.borderColor=\'var(--cream-border)\';this.style.background=\'transparent\';SpatialModule.handleFileDrop(event)">'
      + '<i class="fas fa-cloud-arrow-up" style="font-size:2.5rem;color:var(--gold);margin-bottom:12px"></i>'
      + '<p style="font-weight:600;margin-bottom:4px">Glissez un fichier ici ou cliquez pour parcourir</p>'
      + '<p style="font-size:.82rem;color:var(--text-3)">Formats acceptÃ©s : .geojson, .json, .csv</p>'
      + '<input type="file" id="import-file-input" accept=".geojson,.json,.csv" style="display:none" onchange="SpatialModule.handleFileSelect(event)">'
      + '</div>'
      + '<div id="import-preview-area"></div>'
      + '</div>';
    showModal('spatial-import-modal', html, 'max-width:760px');
  }

  function handleFileDrop(e) {
    var files = e.dataTransfer.files;
    if (files.length > 0) processFile(files[0]);
  }

  function handleFileSelect(e) {
    var files = e.target.files;
    if (files.length > 0) processFile(files[0]);
  }

  function processFile(file) {
    var ext = file.name.split('.').pop().toLowerCase();
    var previewArea = document.getElementById('import-preview-area');
    if (!previewArea) return;

    previewArea.innerHTML = '<div style="text-align:center;padding:30px"><div class="gp-spinner" style="margin:0 auto 14px"></div><p>Analyse du fichier...</p></div>';

    var reader = new FileReader();

    if (ext === 'geojson' || ext === 'json') {
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          var fc = normalizeToFeatureCollection(data);
          showImportPreview(fc, file.name, ext);
        } catch (err) {
          showImportError('Fichier GeoJSON invalide : ' + err.message);
        }
      };
      reader.readAsText(file);
    } else if (ext === 'csv') {
      reader.onload = function(e) {
        parseCSV(e.target.result, file.name);
      };
      reader.readAsText(file);
    } else {
      showImportError('Format non supportÃ© : .' + ext + '. Formats acceptÃ©s : GeoJSON (.geojson, .json) et CSV (.csv)');
    }
  }

  /* ===== REPROJECT FEATURE COLLECTION ===== */
  function reprojectFeatures(fc, fromCRS, toCRS) {
    if (typeof ol === 'undefined' || !ol.proj || !ol.proj.transform) return;
    (fc.features || []).forEach(function(f) {
      if (!f.geometry || !f.geometry.coordinates) return;
      reprojectCoords(f.geometry.coordinates, f.geometry.type, fromCRS, toCRS);
    });
  }

  function reprojectCoords(coords, geomType, fromCRS, toCRS) {
    if (geomType === 'Point') {
      var reproj = ol.proj.transform(coords, fromCRS, toCRS);
      coords[0] = reproj[0];
      coords[1] = reproj[1];
    } else if (geomType === 'LineString' || geomType === 'MultiPoint') {
      coords.forEach(function(c) {
        var r = ol.proj.transform(c, fromCRS, toCRS);
        c[0] = r[0]; c[1] = r[1];
      });
    } else if (geomType === 'Polygon' || geomType === 'MultiLineString') {
      coords.forEach(function(ring) {
        ring.forEach(function(c) {
          var r = ol.proj.transform(c, fromCRS, toCRS);
          c[0] = r[0]; c[1] = r[1];
        });
      });
    } else if (geomType === 'MultiPolygon') {
      coords.forEach(function(poly) {
        poly.forEach(function(ring) {
          ring.forEach(function(c) {
            var r = ol.proj.transform(c, fromCRS, toCRS);
            c[0] = r[0]; c[1] = r[1];
          });
        });
      });
    }
  }

  function parseCSV(text, fileName) {
    var lines = text.trim().split('\n');
    if (lines.length < 2) {
      showImportError('Le fichier CSV est vide ou ne contient pas assez de lignes.');
      return;
    }

    var headers = lines[0].split(/[,;\t]/).map(function(h) { return h.trim().replace(/^"|"$/g, ''); });

    /* Auto-detect coordinate columns using pattern matching */
    var detected = detectCoordColumns(headers);

    if (!detected) {
      /* Show manual column mapping assistant */
      showCSVColumnMapper(headers, text, fileName);
      return;
    }

    buildCSVFeatures(headers, lines, detected, fileName);
  }

  /* ===== CSV MANUAL COLUMN MAPPER ===== */
  function showCSVColumnMapper(headers, csvText, fileName) {
    var area = document.getElementById('import-preview-area');
    if (!area) return;

    var h = '<div style="background:rgba(184,92,56,.08);border:1px solid rgba(184,92,56,.2);border-radius:12px;padding:16px;margin-bottom:16px">'
      + '<h4 style="color:var(--gold-dark);margin-bottom:8px"><i class="fas fa-columns"></i> Colonnes de coordonnÃ©es non dÃ©tectÃ©es automatiquement</h4>'
      + '<p style="font-size:.82rem;color:var(--text-2);margin-bottom:12px">SÃ©lectionnez manuellement les colonnes contenant la latitude (Y) et la longitude (X) :</p>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      + '<div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">Latitude / Y / Northing</label>'
      + '<select id="csv-map-lat" style="width:100%;padding:8px 10px;border:1.5px solid var(--cream-border);border-radius:8px;font-family:Outfit,sans-serif;font-size:.85rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="-1">â€” Choisir â€”</option>';
    headers.forEach(function(hdr, idx) {
      h += '<option value="' + idx + '">' + esc(hdr) + '</option>';
    });
    h += '</select></div>'
      + '<div><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">Longitude / X / Easting</label>'
      + '<select id="csv-map-lon" style="width:100%;padding:8px 10px;border:1.5px solid var(--cream-border);border-radius:8px;font-family:Outfit,sans-serif;font-size:.85rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="-1">â€” Choisir â€”</option>';
    headers.forEach(function(hdr, idx) {
      h += '<option value="' + idx + '">' + esc(hdr) + '</option>';
    });
    h += '</select></div></div>'
      + '<div style="margin-top:12px"><label style="font-size:.82rem;font-weight:600;display:block;margin-bottom:4px">SystÃ¨me de coordonnÃ©es (CRS)</label>'
      + '<select id="csv-map-crs" style="width:100%;padding:8px 10px;border:1.5px solid var(--cream-border);border-radius:8px;font-family:Outfit,sans-serif;font-size:.85rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="EPSG:4326">WGS 84 (lat/lon gÃ©ographiques)</option>'
      + '<option value="EPSG:32630">UTM Zone 30N</option>'
      + '<option value="EPSG:32631">UTM Zone 31N (Togo)</option>'
      + '<option value="EPSG:32632">UTM Zone 32N</option>'
      + '</select></div>'
      + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'spatial-import-modal\')"><i class="fas fa-times"></i> Annuler</button>'
      + '<button class="btn-sm primary" onclick="SpatialModule.confirmCSVMapping()"><i class="fas fa-check"></i> Appliquer et continuer</button>'
      + '</div></div>';

    area.innerHTML = h;

    /* Store the CSV data for later use when user confirms mapping */
    _pendingCSVData = { headers: headers, lines: csvText.trim().split('\n'), fileName: fileName };
  }

  var _pendingCSVData = null;

  function confirmCSVMapping() {
    if (!_pendingCSVData) return;

    var latIdx = parseInt(document.getElementById('csv-map-lat').value);
    var lonIdx = parseInt(document.getElementById('csv-map-lon').value);
    var crs = document.getElementById('csv-map-crs').value;

    if (latIdx < 0 || lonIdx < 0 || latIdx === lonIdx) {
      showImportError('Veuillez sÃ©lectionner deux colonnes diffÃ©rentes pour la latitude et la longitude.');
      return;
    }

    var detected = {
      latIdx: latIdx,
      lonIdx: lonIdx,
      crs: crs,
      latHeader: _pendingCSVData.headers[latIdx],
      lonHeader: _pendingCSVData.headers[lonIdx]
    };

    buildCSVFeatures(_pendingCSVData.headers, _pendingCSVData.lines, detected, _pendingCSVData.fileName);
    _pendingCSVData = null;
  }

  /* ===== BUILD CSV FEATURES (shared by auto-detect and manual mapping) ===== */
  function buildCSVFeatures(headers, lines, detected, fileName) {
    var latIdx = detected.latIdx;
    var lonIdx = detected.lonIdx;
    var srcCRS = detected.crs;
    var needReproject = (srcCRS !== 'EPSG:4326');
    var errors = [];
    var warnings = [];
    var features = [];

    if (needReproject) {
      warnings.push('DonnÃ©es en ' + (CRS_LABELS[srcCRS] || srcCRS) + ' â€” reprojection automatique vers WGS 84 (EPSG:4326).');
    }

    for (var i = 1; i < lines.length; i++) {
      var vals = lines[i].split(/[,;\t]/).map(function(v) { return v.trim().replace(/^"|"$/g, ''); });
      var latVal = parseFloat(vals[latIdx]);
      var lonVal = parseFloat(vals[lonIdx]);

      if (isNaN(latVal) || isNaN(lonVal)) {
        errors.push('Ligne ' + (i + 1) + ' : coordonnÃ©es invalides (' + vals[latIdx] + ', ' + vals[lonIdx] + ')');
        continue;
      }

      var lon, lat;
      if (needReproject) {
        /* Use universal reprojection engine */
        var reproj = reprojectToWGS84(lonVal, latVal, srcCRS);
        lon = reproj[0];
        lat = reproj[1];
      } else {
        lon = lonVal;
        lat = latVal;
        /* Validate geographic ranges */
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
          /* Possibly UTM data mis-detected as WGS84 â€” try UTM reproj */
          if (isUTMCoord(lonVal, latVal)) {
            var reproj2 = reprojectToWGS84(lonVal, latVal, 'EPSG:32631');
            lon = reproj2[0];
            lat = reproj2[1];
            warnings.push('Ligne ' + (i + 1) + ' : coordonnÃ©es hors plage gÃ©ographique, reprojection UTM 31N appliquÃ©e.');
            srcCRS = 'EPSG:32631';
          } else {
            errors.push('Ligne ' + (i + 1) + ' : coordonnÃ©es hors plage (' + vals[latIdx] + ', ' + vals[lonIdx] + ')');
            continue;
          }
        }
      }

      var props = {};
      headers.forEach(function(h, j) {
        if (j !== latIdx && j !== lonIdx) props[h] = vals[j] || '';
      });

      features.push({
        type: 'Feature',
        id: 'import_' + i,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: props
      });
    }

    /* If we have enough points and destination supports lines, also create a LineString */
    var allErrors = errors.concat(warnings);
    var fc = { type: 'FeatureCollection', features: features };

    showImportPreview(fc, fileName, 'csv', allErrors, srcCRS);
  }

  function normalizeToFeatureCollection(data) {
    if (data.type === 'FeatureCollection') return data;
    if (data.type === 'Feature') return { type: 'FeatureCollection', features: [data] };
    if (data.type && data.coordinates) {
      return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: data, properties: {} }] };
    }
    if (Array.isArray(data)) {
      return { type: 'FeatureCollection', features: data.map(function(f, i) {
        if (f.type === 'Feature') return f;
        if (f.type && f.coordinates) return { type: 'Feature', id: 'import_' + i, geometry: f, properties: {} };
        return null;
      }).filter(Boolean) };
    }
    return { type: 'FeatureCollection', features: [] };
  }

  /* ===== IMPORT PREVIEW ===== */
  function showImportPreview(fc, fileName, format, parseErrors, sourceCRS) {
    parseErrors = parseErrors || [];
    sourceCRS = sourceCRS || 'EPSG:4326';
    var features = fc.features || [];
    var geomTypes = {};
    var bbox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

    features.forEach(function(f) {
      if (!f.geometry) return;
      var gt = f.geometry.type;
      geomTypes[gt] = (geomTypes[gt] || 0) + 1;
      extractBBox(f.geometry, bbox);
    });

    if (bbox.minX === Infinity) bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    /* Determine compatible destination layers */
    var primaryGeomType = Object.keys(geomTypes).sort(function(a, b) { return geomTypes[b] - geomTypes[a]; })[0] || '';
    var compatibleLayers = DESTINATION_LAYERS.filter(function(l) {
      return l.geomTypes.some(function(g) { return primaryGeomType.indexOf(g) >= 0 || g.indexOf(primaryGeomType) >= 0; });
    });
    if (compatibleLayers.length === 0) compatibleLayers = DESTINATION_LAYERS; /* Allow all as fallback */

    _pendingImport = { fileName: fileName, features: features, format: format, errors: parseErrors };

    /* Build CRS display string */
    var crsDisplay = (CRS_LABELS[sourceCRS] || sourceCRS);
    if (sourceCRS !== 'EPSG:4326') {
      crsDisplay += ' <i class="fas fa-arrow-right" style="font-size:.7rem;margin:0 4px;color:var(--text-3)"></i> WGS 84 (EPSG:4326)';
    } else {
      crsDisplay += ' (WGS 84)';
    }

    var html = '<div style="background:var(--gold-pale);border:1px solid var(--gold);border-radius:12px;padding:16px;margin-bottom:20px">'
      + '<h4 style="margin-bottom:10px;color:var(--gold-dark)"><i class="fas fa-eye"></i> AperÃ§u de l\'import</h4>'
      + '<div class="grid-2" style="gap:8px">'
      + previewStat('Fichier', esc(fileName))
      + previewStat('Format', format.toUpperCase())
      + previewStat('EntitÃ©s', features.length + '')
      + previewStat('GÃ©omÃ©tries', Object.keys(geomTypes).map(function(g) { return g + ' (' + geomTypes[g] + ')'; }).join(', ') || 'Aucune')
      + previewStat('Projection dÃ©tectÃ©e', crsDisplay)
      + previewStat('Ã‰tendue', bbox.minX.toFixed(4) + ', ' + bbox.minY.toFixed(4) + ' â†’ ' + bbox.maxX.toFixed(4) + ', ' + bbox.maxY.toFixed(4))
      + '</div></div>';

    /* Errors */
    if (parseErrors.length > 0) {
      html += '<div style="background:var(--red-light,#f8f0eb);border:1px solid rgba(184,92,56,.2);border-radius:12px;padding:16px;margin-bottom:20px">'
        + '<h4 style="color:var(--red);margin-bottom:8px"><i class="fas fa-exclamation-triangle"></i> ' + parseErrors.length + ' avertissement(s)</h4>'
        + '<ul style="max-height:120px;overflow-y:auto;font-size:.82rem;color:var(--text-2)">';
      parseErrors.forEach(function(e) { html += '<li>' + esc(e) + '</li>'; });
      html += '</ul></div>';
    }

    /* Destination layer selection */
    html += '<div style="margin-bottom:20px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:8px">Couche de destination</label>'
      + '<select id="import-destination" style="width:100%;padding:10px 14px;border:1.5px solid var(--cream-border);border-radius:10px;font-family:Outfit,sans-serif;font-size:.9rem;background:var(--white);color:var(--text);outline:none">';
    compatibleLayers.forEach(function(l) {
      html += '<option value="' + l.key + '">' + l.label + ' (' + l.geomTypes.join(', ') + ')</option>';
    });
    html += '</select></div>';

    /* Action buttons */
    html += '<div style="display:flex;gap:10px;justify-content:flex-end">'
      + '<button class="btn-sm ghost" onclick="SpatialModule.closeModal(\'spatial-import-modal\')"><i class="fas fa-times"></i> Annuler</button>'
      + '<button class="btn-sm primary" onclick="SpatialModule.confirmImport()"><i class="fas fa-check"></i> Confirmer l\'import (' + features.length + ' entitÃ©s)</button>'
      + '</div>';

    var area = document.getElementById('import-preview-area');
    if (area) area.innerHTML = html;
  }

  function previewStat(label, value) {
    return '<div style="padding:6px 0"><div style="font-size:.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px">' + label + '</div>'
      + '<div style="font-weight:600;font-size:.88rem">' + value + '</div></div>';
  }

  function showImportError(msg) {
    var area = document.getElementById('import-preview-area');
    if (area) {
      area.innerHTML = '<div style="background:rgba(184,92,56,.08);border:1px solid rgba(184,92,56,.2);border-radius:12px;padding:20px;text-align:center">'
        + '<i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--red);margin-bottom:8px"></i>'
        + '<p style="color:var(--red);font-weight:500">' + esc(msg) + '</p></div>';
    }
  }

  function normalizePKImportFeature(feature, idx, timestamp) {
    var geom = feature.geometry || {};
    var start = [0, 0];
    var end = [0, 0];

    if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      start = [parseFloat(geom.coordinates[0]) || 0, parseFloat(geom.coordinates[1]) || 0];
      end = start.slice();
    } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
      start = [parseFloat(geom.coordinates[0][0]) || 0, parseFloat(geom.coordinates[0][1]) || 0];
      end = [parseFloat(geom.coordinates[geom.coordinates.length - 1][0]) || 0, parseFloat(geom.coordinates[geom.coordinates.length - 1][1]) || 0];
    }

    var props = Object.assign({}, feature.properties || {});
    return {
      type: 'Feature',
      id: feature.id || ('pk_import_' + Date.now() + '_' + idx),
      geometry: { type: 'LineString', coordinates: [start, end] },
      properties: Object.assign({}, props, {
        numero: props.numero || props.Numero || props.Name || ('PK import ' + (idx + 1)),
        route: props.route || props.Route || props.Name || 'Non associÃ©e',
        PK_DEB_X: start[0],
        PK_DEB_Y: start[1],
        PK_FIN_X: end[0],
        PK_FIN_Y: end[1],
        source: 'import',
        createdAt: timestamp,
        lastModified: timestamp,
        modifiedBy: 'Import spatial'
      })
    };
  }

  function confirmImport() {
    if (!_pendingImport || !_pendingImport.features.length) return;

    var destKey = document.getElementById('import-destination');
    if (!destKey) return;
    var destination = destKey.value;

    var imported = 0;
    var now = new Date().toISOString();
    var pkCollection = null;

    _pendingImport.features.forEach(function(f, idx) {
      if (!f.properties) f.properties = {};
      f.properties.importedAt = now;
      f.properties.importSource = _pendingImport.fileName;
      f.id = f.id || ('import_' + Date.now() + '_' + idx);

      if (destination === 'routes' && typeof SIGDataEngine !== 'undefined') {
        try {
          SIGDataEngine.addFeature({
            geometry: f.geometry,
            properties: f.properties
          });
          imported++;
        } catch (err) {}
      } else if (destination === 'routes' && typeof json_Rseauroutier_6 !== 'undefined') {
        json_Rseauroutier_6.features.push(f);
        imported++;
      } else if (destination === 'emprises' && typeof json_Emprise_5 !== 'undefined') {
        json_Emprise_5.features.push(f);
        imported++;
      } else if (destination === 'pk' && typeof SIGPersistence !== 'undefined') {
        if (!pkCollection) {
          pkCollection = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK) || { type: 'FeatureCollection', features: [] };
        }
        pkCollection.features.push(normalizePKImportFeature(f, idx, now));
        imported++;
      } else if (typeof SIGPersistence !== 'undefined') {
        var existing = SIGPersistence.loadLayer('layers.' + destination);
        if (!existing) existing = { type: 'FeatureCollection', features: [] };
        existing.features.push(f);
        SIGPersistence.saveLayer('layers.' + destination, existing);
        imported++;
      }
    });

    if (pkCollection && typeof SIGPersistence !== 'undefined') {
      SIGPersistence.saveLayer(SIGPersistence.LAYERS.PK, pkCollection);
      window.json_PK = pkCollection;
    }

    /* Refresh OL layer on map */
    if (destination === 'routes' && typeof lyr_Rseauroutier_6 !== 'undefined') {
      var fmt = new ol.format.GeoJSON();
      var newFeatures = fmt.readFeatures(json_Rseauroutier_6, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      lyr_Rseauroutier_6.getSource().clear();
      lyr_Rseauroutier_6.getSource().addFeatures(newFeatures);
    } else if (destination === 'emprises' && typeof lyr_Emprise_5 !== 'undefined') {
      var fmt2 = new ol.format.GeoJSON();
      var newFeatures2 = fmt2.readFeatures(json_Emprise_5, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      lyr_Emprise_5.getSource().clear();
      lyr_Emprise_5.getSource().addFeatures(newFeatures2);
    }

    /* Refresh pk layers if imported via persistence */
    if (destination === 'pk' && typeof SIGMapLayers !== 'undefined' && typeof SIGMapLayers.reloadPK === 'function') {
      SIGMapLayers.reloadPK();
    }
    if (destination === 'routes' && typeof RoadSync !== 'undefined') {
      RoadSync.propagate('created', { fullReload: true, featureId: null });
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.IMPORT, {
        details: 'Import de ' + imported + ' entitÃ©s depuis ' + _pendingImport.fileName + ' vers ' + destination,
        after: { format: _pendingImport.format, destination: destination, count: imported },
        result: imported > 0 ? 'SUCCESS' : 'FAILURE'
      });
    }

    /* EventBus */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_CREATED, {
        source: 'import',
        fileName: _pendingImport.fileName,
        destination: destination,
        layer: destination,
        count: imported
      });
      SIGEventBus.emit(SIGEventBus.EVENTS.DASHBOARD_REFRESH, {});
    }

    /* Persistence sync */
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.syncFromMemory();
    }

    closeModal('spatial-import-modal');
    if (typeof NotificationCenter !== 'undefined') {
      NotificationCenter.add('import', 'Import terminÃƒÂ©', imported + ' entitÃƒÂ©(s) importÃƒÂ©e(s) vers ' + destination);
    }
    _pendingImport = null;

    /* Refresh the spatial page */
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('spatial');
  }

  /* ===================================================================
   * EXPORT SYSTEM
   * =================================================================== */

  function openExportDialog() {
    var html = '<div class="modal-header"><h2><i class="fas fa-file-export"></i> Exporter les donnÃ©es</h2>'
      + '<button class="modal-close" onclick="SpatialModule.closeModal(\'spatial-export-modal\')"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-body">';

    /* Layer selection */
    html += '<div style="margin-bottom:20px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:8px">Couche Ã  exporter</label>'
      + '<select id="export-layer-select" style="width:100%;padding:10px 14px;border:1.5px solid var(--cream-border);border-radius:10px;font-family:Outfit,sans-serif;font-size:.9rem;background:var(--white);color:var(--text);outline:none">'
      + '<option value="Rseauroutier_6">RÃ©seau routier</option>'
      + '<option value="Emprise_5">Emprises</option>'
      + '<option value="Rgion_2">RÃ©gions</option>'
      + '<option value="Prfecture_3">PrÃ©fectures</option>'
      + '<option value="Canton_4">Cantons</option>';

    /* Add PK from persistence if available */
    if (typeof SIGPersistence !== 'undefined') {
      if (SIGPersistence.loadLayer('layers.pk')) html += '<option value="pk_persistence">Points kilomÃ©triques</option>';
    }
    html += '</select></div>';

    /* Export format options */
    html += '<div style="margin-bottom:20px"><label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:10px">Format d\'export</label>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">';

    html += exportFormatCard('geojson', 'fa-code', 'GeoJSON', 'Format standard SIG');
    html += exportFormatCard('csv', 'fa-table', 'CSV', 'Tableur');
    html += exportFormatCard('pdf', 'fa-file-pdf', 'PDF', 'Fiche rÃ©capitulative');
    html += exportFormatCard('excel', 'fa-file-excel', 'Excel', 'Classeur .xlsx');

    html += '</div></div>';
    html += '</div>';
    showModal('spatial-export-modal', html, 'max-width:640px');
  }

  function exportFormatCard(format, icon, title, desc) {
    return '<div class="export-card" onclick="SpatialModule.executeExport(\'' + format + '\')" style="padding:16px;border:1.5px solid var(--cream-border);border-radius:12px;cursor:pointer;text-align:center;transition:all .3s">'
      + '<i class="fas ' + icon + '" style="font-size:1.3rem;color:var(--gold);margin-bottom:8px"></i>'
      + '<div style="font-weight:600;font-size:.85rem;margin-bottom:2px">' + title + '</div>'
      + '<div style="font-size:.75rem;color:var(--text-3)">' + desc + '</div></div>';
  }

  function getExportData() {
    var select = document.getElementById('export-layer-select');
    if (!select) return null;
    var val = select.value;

    if (val === 'pk_persistence' && typeof SIGPersistence !== 'undefined') {
      return { data: SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK), name: 'points_kilometriques' };
    }
    var varMap = {
      'Rseauroutier_6': { varName: 'json_Rseauroutier_6', name: 'reseau_routier' },
      'Emprise_5': { varName: 'json_Emprise_5', name: 'emprises' },
      'Rgion_2': { varName: 'json_Rgion_2', name: 'regions' },
      'Prfecture_3': { varName: 'json_Prfecture_3', name: 'prefectures' },
      'Canton_4': { varName: 'json_Canton_4', name: 'cantons' }
    };
    var cfg = varMap[val];
    if (!cfg) return null;
    return { data: window[cfg.varName], name: cfg.name };
  }

  function executeExport(format) {
    var exportInfo = getExportData();
    if (!exportInfo || !exportInfo.data) {
      alert('Aucune donnÃ©e Ã  exporter pour cette couche.');
      return;
    }

    switch (format) {
      case 'geojson': exportGeoJSON(exportInfo); break;
      case 'csv': exportCSV(exportInfo); break;
      case 'pdf': exportPDF(exportInfo); break;
      case 'excel': exportExcel(exportInfo); break;
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.EXPORT, {
        details: 'Export ' + format.toUpperCase() + ' â€” ' + exportInfo.name + ' (' + (exportInfo.data.features || []).length + ' entitÃ©s)',
        after: { format: format, layer: exportInfo.name }
      });
    }
  }

  function downloadBlob(blob, filename) {
    if (typeof GeoROADDownload !== 'undefined' && typeof GeoROADDownload.downloadBlob === 'function') {
      GeoROADDownload.downloadBlob(blob, filename);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function() {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  }

  function exportGeoJSON(info) {
    var json = JSON.stringify(info.data, null, 2);
    var blob = new Blob([json], { type: 'application/geo+json' });
    downloadBlob(blob, info.name + '.geojson');
    closeModal('spatial-export-modal');
    if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'DonnÃ©es exportÃ©es en GeoJSON', info.name + ' (' + (info.data.features || []).length + ' entitÃ©s)');
  }

  function exportCSV(info) {
    var features = info.data.features || [];
    if (features.length === 0) { alert('Aucune donnÃ©e Ã  exporter.'); return; }

    /* Collect all property keys */
    var allKeys = [];
    features.forEach(function(f) {
      if (f.properties) {
        Object.keys(f.properties).forEach(function(k) {
          if (allKeys.indexOf(k) === -1) allKeys.push(k);
        });
      }
    });

    var lines = [allKeys.join(',')];
    features.forEach(function(f) {
      var row = allKeys.map(function(k) {
        var v = (f.properties && f.properties[k]) || '';
        v = String(v).replace(/"/g, '""');
        return '"' + v + '"';
      });
      lines.push(row.join(','));
    });

    /* Add geometry column */
    lines[0] += ',geometry_wkt';
    for (var i = 1; i < lines.length; i++) {
      var f = features[i - 1];
      lines[i] += ',"' + (f.geometry ? geometryToWKT(f.geometry) : '') + '"';
    }

    var csv = lines.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, info.name + '.csv');
    closeModal('spatial-export-modal');
    if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'DonnÃ©es exportÃ©es en CSV', info.name + ' (' + features.length + ' entitÃ©s)');
  }

  function geometryToWKT(geom) {
    if (!geom) return '';
    switch (geom.type) {
      case 'Point': return 'POINT(' + geom.coordinates[0] + ' ' + geom.coordinates[1] + ')';
      case 'LineString': return 'LINESTRING(' + geom.coordinates.map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + ')';
      case 'Polygon': return 'POLYGON((' + geom.coordinates[0].map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + '))';
      case 'MultiLineString':
        return 'MULTILINESTRING(' + geom.coordinates.map(function(ring) { return '(' + ring.map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + ')'; }).join(',') + ')';
      case 'MultiPolygon':
        return 'MULTIPOLYGON(' + geom.coordinates.map(function(poly) { return '((' + poly[0].map(function(c) { return c[0] + ' ' + c[1]; }).join(',') + '))'; }).join(',') + ')';
      default: return geom.type;
    }
  }

  function exportShapefile(info) {
    /* Convert GeoJSON to ESRI Shapefile format using shp.js write */
    if (typeof shp !== 'undefined' && shp.writeFile) {
      try {
        var geojson = info.data;
        /* shp.writeFile returns a ZIP blob */
        shp.writeFile(geojson).then(function(blob) {
          downloadBlob(blob, info.name + '.zip');
          closeModal('spatial-export-modal');
          if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'DonnÃ©es exportÃ©es en Shapefile', info.name + '.zip');
        }).catch(function(err) {
          alert('Erreur lors de la gÃ©nÃ©ration du Shapefile : ' + (err.message || err));
        });
      } catch (e) {
        /* Fallback: export as GeoJSON and notify */
        alert('Export Shapefile non disponible. Un fichier GeoJSON sera exportÃ© Ã  la place.');
        exportGeoJSON(info);
      }
    } else {
      alert('La bibliothÃ¨que shp.js n\'est pas chargÃ©e. Export en GeoJSON Ã  la place.');
      exportGeoJSON(info);
    }
  }

  function exportPDF(info) {
    if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
      try {
        var doc = new jspdf.jsPDF('landscape', 'mm', 'a4');
        var features = info.data.features || [];

        /* Header */
        doc.setFontSize(18);
        doc.text('GeoROAD TOGO â€” Export de donnÃ©es', 14, 20);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('Couche : ' + info.name + ' | ' + features.length + ' entitÃ©s | ' + new Date().toLocaleString('fr-FR'), 14, 28);
        doc.setTextColor(0);

        /* Collect property keys */
        var allKeys = [];
        features.forEach(function(f) {
          if (f.properties) Object.keys(f.properties).forEach(function(k) {
            if (allKeys.indexOf(k) === -1) allKeys.push(k);
          });
        });
        /* Limit to 12 columns for readability */
        var cols = allKeys.slice(0, 12);

        if (typeof doc.autoTable !== 'undefined') {
          var body = features.slice(0, 100).map(function(f) {
            return cols.map(function(k) {
              var v = (f.properties && f.properties[k]) || 'â€”';
              return String(v).substring(0, 40);
            });
          });

          doc.autoTable({
            head: [cols],
            body: body,
            startY: 34,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [200, 166, 75] },
            alternateRowStyles: { fillColor: [248, 246, 240] }
          });
        } else {
          /* Fallback: simple text table */
          doc.setFontSize(8);
          var y = 38;
          cols.forEach(function(k) { doc.text(k.substring(0, 15), 14 + cols.indexOf(k) * 22, y); });
          y += 5;
          features.slice(0, 50).forEach(function(f) {
            if (y > 190) { doc.addPage(); y = 20; }
            cols.forEach(function(k, i) {
              var v = String((f.properties && f.properties[k]) || 'â€”').substring(0, 15);
              doc.text(v, 14 + i * 22, y);
            });
            y += 5;
          });
        }

        /* Footer */
        var pageCount = doc.internal.getNumberOfPages();
        for (var p = 1; p <= pageCount; p++) {
          doc.setPage(p);
          doc.setFontSize(7);
          doc.setTextColor(150);
          doc.text('GeoROAD TOGO â€” MinistÃ¨re des Travaux Publics â€” Page ' + p + '/' + pageCount, 14, 200);
        }

        doc.save(info.name + '.pdf');
        closeModal('spatial-export-modal');
        if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'DonnÃ©es exportÃ©es en PDF', info.name + ' (' + features.length + ' entitÃ©s)');
      } catch (e) {
        alert('Erreur lors de la gÃ©nÃ©ration du PDF : ' + e.message);
      }
    } else {
      alert('La bibliothÃ¨que jsPDF n\'est pas chargÃ©e.');
    }
  }

  function exportExcel(info) {
    if (typeof XLSX !== 'undefined') {
      try {
        var features = info.data.features || [];
        if (features.length === 0) { alert('Aucune donnÃ©e Ã  exporter.'); return; }

        /* Build worksheet data */
        var allKeys = [];
        features.forEach(function(f) {
          if (f.properties) Object.keys(f.properties).forEach(function(k) {
            if (allKeys.indexOf(k) === -1) allKeys.push(k);
          });
        });

        var wsData = [allKeys];
        features.forEach(function(f) {
          var row = allKeys.map(function(k) { return (f.properties && f.properties[k]) || ''; });
          wsData.push(row);
        });

        var ws = XLSX.utils.aoa_to_sheet(wsData);

        /* Column widths */
        ws['!cols'] = allKeys.map(function(k) { return { wch: Math.max(k.length + 2, 12) }; });

        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, info.name.substring(0, 31));
        XLSX.writeFile(wb, info.name + '.xlsx');
        closeModal('spatial-export-modal');
        if (typeof NotificationCenter !== 'undefined') NotificationCenter.add('export', 'DonnÃ©es exportÃ©es en Excel', info.name + ' (' + features.length + ' entitÃ©s)');
      } catch (e) {
        alert('Erreur lors de la gÃ©nÃ©ration Excel : ' + e.message);
      }
    } else {
      alert('La bibliothÃ¨que XLSX n\'est pas chargÃ©e.');
    }
  }

  /* ===== BBOX EXTRACTION ===== */
  function extractBBox(geom, bbox) {
    if (!geom || !geom.coordinates) return;
    function processCoord(c) {
      if (c[0] < bbox.minX) bbox.minX = c[0];
      if (c[1] < bbox.minY) bbox.minY = c[1];
      if (c[0] > bbox.maxX) bbox.maxX = c[0];
      if (c[1] > bbox.maxY) bbox.maxY = c[1];
    }
    switch (geom.type) {
      case 'Point': processCoord(geom.coordinates); break;
      case 'LineString': case 'MultiPoint':
        geom.coordinates.forEach(processCoord); break;
      case 'Polygon': case 'MultiLineString':
        geom.coordinates.forEach(function(ring) { ring.forEach(processCoord); }); break;
      case 'MultiPolygon':
        geom.coordinates.forEach(function(poly) { poly.forEach(function(ring) { ring.forEach(processCoord); }); }); break;
    }
  }

  /* ===== MODAL HELPERS ===== */
  function showModal(id, content, style) {
    /* Remove existing if any */
    var existing = document.getElementById(id);
    if (existing) existing.parentNode.removeChild(existing);

    var div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = id;
    div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:20px;';
    div.innerHTML = '<div class="modal-content" style="background:var(--white);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);width:100%;max-height:90vh;overflow-y:auto;' + (style || '') + '">'
      + content + '</div>';
    div.addEventListener('click', function(e) { if (e.target === div) closeModal(id); });
    document.body.appendChild(div);
  }

  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  }

  /* ===== API PUBLIQUE ===== */
  return {
    render: render,
    openImportDialog: openImportDialog,
    openExportDialog: openExportDialog,
    handleFileDrop: handleFileDrop,
    handleFileSelect: handleFileSelect,
    confirmImport: confirmImport,
    confirmCSVMapping: confirmCSVMapping,
    executeExport: executeExport,
    closeModal: closeModal,
    /* Nouvelles fonctions PHASE 6 */
    refreshLayers: refreshLayers,
    showLayerInfo: showLayerInfo,
    validateLayerGeometry: validateLayerGeometry,
    exportLayer: exportLayer
  };
})();

/* ==== END admin-spatial.js ==== */

