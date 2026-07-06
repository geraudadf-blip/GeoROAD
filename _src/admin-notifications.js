/* ===================================================================
 * GeoROAD TOGO — Centre de Notifications (V4.0)
 *
 * Système de notifications en temps réel pour l'administration.
 * Chaque action importante (création, modification, suppression,
 * import, export, erreur, synchronisation) génère une notification.
 *
 * Les notifications sont stockées en sessionStorage (limitées à 100),
 * avec un compteur automatique et la possibilité de les marquer comme lues.
 *
 * Dépend : SIGEventBus, SIGAuditTrail (optionnel)
 * =================================================================== */
var NotificationCenter = (function() {
  'use strict';

  var STORAGE_KEY = 'georoad_notifications';
  var MAX_NOTIFICATIONS = 100;
  var _panelOpen = false;

  /* ===== TYPES D'ACTIONS → ICÔNES ET COULEURS ===== */
  var ACTION_CONFIG = {
    'create':    { icon: 'fa-plus-circle',       color: '#7A8B6F', label: 'Création' },
    'update':    { icon: 'fa-pen',               color: '#4A7FB5', label: 'Modification' },
    'delete':    { icon: 'fa-trash',             color: '#B85C38', label: 'Suppression' },
    'import':    { icon: 'fa-file-import',       color: '#C8A64B', label: 'Import' },
    'export':    { icon: 'fa-file-export',       color: '#C8A64B', label: 'Export' },
    'error':     { icon: 'fa-exclamation-circle', color: '#B85C38', label: 'Erreur' },
    'sync':      { icon: 'fa-arrows-rotate',     color: '#4A7FB5', label: 'Synchronisation' },
    'info':      { icon: 'fa-info-circle',        color: '#8B8578', label: 'Information' },
    'geometry':  { icon: 'fa-draw-polygon',       color: '#A68A3A', label: 'Géométrie' },
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
    /* Garder seulement les MAX_NOTIFICATIONS plus récentes */
    if (notifs.length > MAX_NOTIFICATIONS) {
      notifs = notifs.slice(notifs.length - MAX_NOTIFICATIONS);
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifs));
    } catch(e) {
      /* sessionStorage plein — purger les 20 plus anciennes */
      notifs = notifs.slice(20);
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(notifs)); } catch(e2) {}
    }
    _updateBadge();
  }

  /* ===== CRÉATION DE NOTIFICATION ===== */

  /**
   * Ajoute une notification.
   * @param {string} type - Type d'action (create, update, delete, import, export, error, sync, info)
   * @param {string} message - Message descriptif
   * @param {Object} [details] - Détails supplémentaires (optionnel, affichés au survol)
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
    /* Mettre à jour le dot si pas de badge numérique */
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
    /* Créer le panneau de notifications dans la topbar */
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

    /* Fermer le panneau en cliquant ailleurs — guard anti-doublon */
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

    var notifs = _load().reverse(); /* Plus récentes en premier */
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
          + '<div style="font-size:.68rem;color:var(--text-3);margin-top:2px">' + n.label + ' — ' + timeStr + '</div>'
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

      if (diff < 60000) return 'À l\'instant';
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
   * Appeler cette fonction une fois à l'initialisation de l'admin.
   */
  function hookEventBus() {
    if (typeof SIGEventBus === 'undefined') return;

    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, function(data) {
      var name = (data.feature && data.feature.properties && data.feature.properties.Name) || 'Route';
      add('create', name + ' créée avec succès', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, function(data) {
      var name = (data.feature && data.feature.properties && data.feature.properties.Name) || 'Route';
      add('update', name + ' modifiée', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, function(data) {
      add('delete', 'Élément supprimé (' + (data.featureId || 'ID inconnu') + ')', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.GEOMETRY_UPDATED, function(data) {
      var name = (data.feature && data.feature.properties && data.feature.properties.Name) || 'Route';
      add('geometry', 'Géométrie de ' + name + ' modifiée', data);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.DASHBOARD_REFRESH, function() {
      add('sync', 'Tableau de bord mis à jour', null);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.PERSISTENCE_SAVED, function(data) {
      add('sync', 'Données synchronisées', data || null);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.STATS_CHANGED, function(data) {
      add('info', 'Statistiques mises à jour', data || null);
    });

    SIGEventBus.on(SIGEventBus.EVENTS.AUDIT_LOGGED, function(data) {
      var label = (data && data.details) || (data && data.action) || 'Action auditée';
      var detailParts = [];
      if (data && data.featureName) detailParts.push(data.featureName);
      if (data && data.featureId) detailParts.push('ID: ' + data.featureId);
      add('audit', label, { action: data && data.action, summary: detailParts.join(' — ') || null });
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
    /* Exposé pour le onclick inline du panneau */
    _renderPanel: _renderPanel
  };
})();