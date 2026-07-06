/* ===================================================================
 * GeoROAD TOGO — Module de Synchronisation Temps Réel
 *
 * Propage toute modification (création, édition, suppression)
 * immédiatement vers :
 *   - Carte OL (mise à jour de couche optimisée)
 *   - Tableau des routes (admin)
 *   - Dashboard KPI (admin)
 *   - Statistiques globales
 *
 * Pas de refresh nécessaire.
 *
 * Architecture PostGIS :
 *   - Remplacer les appels locaux par des WebSocket events
 *     ou des appels REST synchrones.
 *
 * Dépend : geoportail.js (lyr_Rseauroutier_6), AdminData
 * =================================================================== */
var RoadSync = (function() {
  'use strict';

  /* ===== ÉTAT ===== */
  var _listeners = [];  /* Callbacks enregistrés pour les événements de modification */

  /* Types d'événements */
  var EVENTS = {
    FEATURE_CREATED: 'feature:created',
    FEATURE_UPDATED: 'feature:updated',
    FEATURE_DELETED: 'feature:deleted',
    GEOMETRY_CHANGED: 'geometry:changed',
    FULL_REFRESH: 'full:refresh'
  };

  /* ===================================================================
   * PROPAGATION CARTOGRAPHIQUE
   * =================================================================== */

  /**
   * Met à jour la couche routière OL de manière optimisée.
   * Ne fait PAS un re-render complet de la carte.
   * Utilise le rafraîchissement de source uniquement.
   *
   * @param {boolean} fullReload - Si true, recharge toute la source
   *                               (utile après ajout/suppression).
   *                               Si false, ne fait que changed() sur
   *                               la feature (optimisé pour les modifs géométriques).
   * @param {number|null} featureId - Index de la feature modifiée (si fullReload=false)
   * @param {ol.Feature|null} olFeature - Feature OL à rafraîchir
   */
  function syncMap(fullReload, featureId, olFeature) {
    if (typeof lyr_Rseauroutier_6 === 'undefined') return;

    if (fullReload || featureId === null) {
      /* Recharger toute la source à partir du GeoJSON global */
      var format = new ol.format.GeoJSON();
      var features = format.readFeatures(json_Rseauroutier_6, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      var source = lyr_Rseauroutier_6.getSource();
      source.clear();
      source.addFeatures(features);
    } else {
      /* Mise à jour ciblée : signaler que la feature a changé */
      if (olFeature) {
        olFeature.changed();
      }
    }

    /* Mettre à jour le badge de compteur dans la sidebar */
    var countBadge = document.querySelector('[data-layer="Rseauroutier_6"]');
    /* Si un compteur existe dans la sidebar */
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      var allCountEls = document.querySelectorAll('.road-count-badge, .lt-count');
      allCountEls.forEach(function(el) {
        el.textContent = json_Rseauroutier_6.features.length;
      });
    }
  }

  /* ===================================================================
   * PROPAGATION ADMIN (Dashboard + Table)
   * =================================================================== */

  /**
   * Met à jour le dashboard si la page admin est ouverte.
   * Détecte automatiquement si les éléments DOM existent.
   */
  function syncDashboard() {
    /* Vérifier si on est sur la page admin et si le dashboard est visible */
    var contentEl = document.getElementById('adminContent');
    if (!contentEl) return;

    /* Vérifier si la page courante est le dashboard */
    var activePage = document.querySelector('.nav-item.active');
    if (activePage && activePage.dataset.page === 'dashboard') {
      /* Re-render uniquement les stats */
      if (typeof AdminData !== 'undefined' && typeof AdminPages !== 'undefined') {
        contentEl.innerHTML = AdminPages.render('dashboard');
      }
    }

    /* Mettre à jour les KPI en temps réel si les éléments existent */
    updateKPIElements();
  }

  /**
   * Met à jour les éléments KPI visibles sur la page.
   */
  function updateKPIElements() {
    if (typeof json_Rseauroutier_6 === 'undefined') return;

    var stats = computeQuickStats();
    var kpiEls = document.querySelectorAll('[data-kpi]');
    kpiEls.forEach(function(el) {
      var key = el.dataset.kpi;
      if (key === 'totalRoutes') el.textContent = stats.totalRoutes;
      if (key === 'totalKm') el.textContent = stats.totalKmStr;
    });
  }

  /**
   * Met à jour le tableau des routes si visible dans l'admin.
   */
  function syncRouteTable() {
    var contentEl = document.getElementById('adminContent');
    if (!contentEl) return;

    /* Si RouteModule est chargé et le tableau est affiché */
    if (typeof RouteModule !== 'undefined') {
      RouteModule.reload();
    }
  }

  /**
   * Met à jour les statistiques globales (modals).
   */
  function syncGlobalStats() {
    /* Mettre à jour le contenu des modals si ouverts */
    var statsModal = document.getElementById('stats-modal');
    if (statsModal && statsModal.classList.contains('active')) {
      if (typeof renderStatsContent === 'function') renderStatsContent();
    }
  }

  /* ===================================================================
   * STATISTIQUES RAPIDES
   * =================================================================== */

  function computeQuickStats() {
    var totalRoutes = 0;
    var totalKm = 0;

    if (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) {
      totalRoutes = json_Rseauroutier_6.features.length;
      json_Rseauroutier_6.features.forEach(function(f) {
        var len = (f.properties && f.properties.LONGEUR) || 0;
        /* Fallback : calculer via ol.sphere si LONGEUR est 0 */
        if (!len && f.geometry && typeof ol !== 'undefined' && ol.sphere) {
          try {
            var fmt = new ol.format.GeoJSON();
            var g = fmt.readGeometry(f.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
            len = ol.sphere.getLength(g);
          } catch(e) {}
        }
        totalKm += len / 1000;
      });
    }

    return {
      totalRoutes: totalRoutes,
      totalKm: totalKm,
      totalKmStr: totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km'
    };
  }

  /* ===================================================================
   * VERSIONNING — Ajoute les métadonnées de version à une route
   * =================================================================== */

  /**
   * Initialise le versionning sur une feature existante.
   * @param {number} featureIdx - Index dans json_Rseauroutier_6
   */
  function initVersioning(featureIdx) {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var feat = json_Rseauroutier_6.features[featureIdx];
    if (!feat || !feat.properties) return;

    var now = new Date().toISOString();
    if (!feat.properties.createdAt) {
      feat.properties.createdAt = now;
      feat.properties.status = feat.properties.status || 'validated';
    }
    feat.properties.lastModified = now;

    var session = null;
    if (typeof AdminAuth !== 'undefined') session = AdminAuth.getSession();
    feat.properties.modifiedBy = session ? (session.name || session.username) : 'Utilisateur';
  }

  /**
   * Met à jour le versionning après modification.
   * @param {number} featureIdx
   * @param {string} newStatus - Optionnel : 'draft' | 'validated' | 'published'
   */
  function touchVersion(featureIdx, newStatus) {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var feat = json_Rseauroutier_6.features[featureIdx];
    if (!feat || !feat.properties) return;

    feat.properties.lastModified = new Date().toISOString();

    var session = null;
    if (typeof AdminAuth !== 'undefined') session = AdminAuth.getSession();
    feat.properties.modifiedBy = session ? (session.name || session.username) : 'Utilisateur';

    if (newStatus) {
      feat.properties.status = newStatus;
    }
  }

  /* ===================================================================
   * ÉVÉNEMENTS (pub/sub pour les modules externes)
   * =================================================================== */

  /**
   * Enregistre un listener pour un événement.
   * @param {string} eventType - Type d'événement (voir EVENTS)
   * @param {function} callback - function(data)
   */
  function on(eventType, callback) {
    _listeners.push({ type: eventType, fn: callback });
  }

  /**
   * Supprime un listener.
   */
  function off(eventType, callback) {
    _listeners = _listeners.filter(function(l) {
      return !(l.type === eventType && l.fn === callback);
    });
  }

  /**
   * Émet un événement.
   * @param {string} eventType
   * @param {Object} data
   */
  function emit(eventType, data) {
    _listeners.forEach(function(l) {
      if (l.type === eventType) {
        try { l.fn(data); } catch(e) { /* RoadSync listener error: silenced */; }
      }
    });
  }

  /* ===================================================================
   * MÉTHODE PRINCIPALE : PROPAGER UNE MODIFICATION
   * =================================================================== */

  /**
   * Propage une modification complète sur toutes les vues.
   *
   * @param {string} action - 'created' | 'updated' | 'deleted' | 'geometry'
   * @param {Object} options
   * @param {number} options.featureId - Index de la feature
   * @param {ol.Feature} [options.olFeature] - Feature OL (pour update ciblé)
   * @param {boolean} [options.fullReload=true] - Rechargement complet de la couche
   */
  function propagate(action, options) {
    options = options || {};
    var featureId = options.featureId;
    var olFeature = options.olFeature;
    var fullReload = options.fullReload !== undefined ? options.fullReload : true;

    /* 1. Versionning */
    if (featureId !== null && featureId !== undefined) {
      if (action === 'created') {
        initVersioning(featureId);
      } else if (action === 'updated' || action === 'geometry') {
        touchVersion(featureId);
      }
    }

    /* 2. Synchroniser la carte */
    syncMap(fullReload, featureId, olFeature);

    /* 3. Émettre l'événement */
    var eventType = EVENTS.FEATURE_UPDATED;
    if (action === 'created') eventType = EVENTS.FEATURE_CREATED;
    else if (action === 'deleted') eventType = EVENTS.FEATURE_DELETED;
    else if (action === 'geometry') eventType = EVENTS.GEOMETRY_CHANGED;
    emit(eventType, { featureId: featureId, olFeature: olFeature });

    /* 4. Synchroniser le dashboard */
    syncDashboard();

    /* 5. Synchroniser le tableau (si visible) */
    syncRouteTable();

    /* 6. Synchroniser les statistiques */
    syncGlobalStats();
  }

  /* ===== INITIALISATION DU VERSIONNING SUR LES ROUTES EXISTANTES ===== */
  function initExistingRoutesVersioning() {
    if (typeof json_Rseauroutier_6 === 'undefined') return;
    var now = new Date().toISOString();
    json_Rseauroutier_6.features.forEach(function(f) {
      if (!f.properties) f.properties = {};
      if (!f.properties.createdAt) {
        f.properties.createdAt = now;
      }
      if (!f.properties.lastModified) {
        f.properties.lastModified = now;
      }
      if (!f.properties.status) {
        f.properties.status = 'published';
      }
      if (!f.properties.modifiedBy) {
        f.properties.modifiedBy = 'Système';
      }
    });
  }

  /* Auto-init au chargement */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExistingRoutesVersioning);
  } else {
    initExistingRoutesVersioning();
  }

  /* ===== API PUBLIQUE ===== */
  return {
    propagate: propagate,
    syncMap: syncMap,
    syncDashboard: syncDashboard,
    syncRouteTable: syncRouteTable,
    syncGlobalStats: syncGlobalStats,
    initVersioning: initVersioning,
    touchVersion: touchVersion,
    computeQuickStats: computeQuickStats,
    on: on,
    off: off,
    emit: emit,
    EVENTS: EVENTS
  };
})();