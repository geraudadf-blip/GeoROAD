/* ===================================================================
 * GeoROAD TOGO — SIG Data Engine (V3.0 SIG Core)
 *
 * Moteur central de données pour le système SIG ministériel.
 * Toute modification de route passe obligatoirement par ce moteur.
 *
 * Structure RouteFeature :
 * {
 *   id: string,
 *   geometry: { type: "LineString", coordinates: [[lon,lat], ...] },
 *   properties: {
 *     name, code, region, category, length, width, emprise,
 *     state, pavement, origin, destination, population,
 *     pk_start, pk_end, ...
 *   },
 *   metadata: {
 *     createdAt, updatedAt, createdBy, version
 *   }
 * }
 *
 * Architecture PostGIS future :
 *   - addFeature  → INSERT INTO routes (geometry, properties) VALUES (ST_GeomFromGeoJSON($1), $2)
 *   - updateFeature → UPDATE routes SET geometry = ST_GeomFromGeoJSON($1), properties = $2 WHERE id = $3
 *   - deleteFeature → DELETE FROM routes WHERE id = $1
 *   - getFeatureById → SELECT * FROM routes WHERE id = $1
 *   - getAllFeatures  → SELECT * FROM routes ORDER BY created_at DESC
 *
 * Dépend : SIGEventBus, SIGAuditTrail, SIGSpatialCalculator, SIGPersistence
 * =================================================================== */
var SIGDataEngine = (function() {
  'use strict';

  /* ===== ÉTAT INTERNE ===== */
  var _initialized = false;
  var _featureCounter = 0;

  /* ===================================================================
   * INITIALISATION
   * =================================================================== */

  /**
   * Initialise le moteur de données.
   * Charge les données GeoJSON globales et les enrichit avec
   * les métadonnées SIG (metadata).
   */
  function initialize() {
    if (_initialized) return;
    _initialized = true;

    /* Initialiser la persistance localStorage */
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.initialize();
    }

    /* Enrichir les features existantes avec metadata si nécessaire */
    if (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) {
      _featureCounter = json_Rseauroutier_6.features.length;
      var now = new Date().toISOString();

      json_Rseauroutier_6.features.forEach(function(f, idx) {
        if (!f.id) f.id = 'route_' + idx;
        if (!f.properties) f.properties = {};

        /* Initialiser les métadonnées */
        if (!f.properties.createdAt) f.properties.createdAt = now;
        if (!f.properties.lastModified) f.properties.lastModified = now;
        if (!f.properties.status) f.properties.status = 'published';
        if (!f.properties.modifiedBy) f.properties.modifiedBy = 'Système';
        if (!f.properties.version) f.properties.version = 1;
      });

      /* Persister l'état initial */
      if (typeof SIGPersistence !== 'undefined') {
        SIGPersistence.syncFromMemory();
      }
    }

    /* Écouter les événements du bus pour la persistance automatique */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_CREATED, onFeatureChanged);
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_UPDATED, onFeatureChanged);
      SIGEventBus.on(SIGEventBus.EVENTS.FEATURE_DELETED, onFeatureChanged);
      SIGEventBus.on(SIGEventBus.EVENTS.GEOMETRY_UPDATED, onFeatureChanged);
    }
  }

  /**
   * Callback interne : à chaque modification de feature,
   * synchroniser la persistance.
   */
  function onFeatureChanged() {
    if (typeof SIGPersistence !== 'undefined') {
      SIGPersistence.syncFromMemory();
    }
  }

  /* ===================================================================
   * CRUD — CREATE
   * =================================================================== */

  /**
   * Ajoute une nouvelle route au SIG.
   * Passe obligatoirement par ce moteur (pas de modification directe
   * des données UI ou de la variable globale).
   *
   * @param {Object} route - Données de la route
   * @param {Object} route.geometry - Géométrie GeoJSON
   * @param {Object} route.properties - Propriétés de la route
   * @returns {Object} La feature créée (format enrichi)
   */
  function addFeature(route) {
    if (!route || !route.geometry) {
      throw new Error('SIGDataEngine.addFeature : geometry requise.');
    }

    /* Validation géométrique */
    if (typeof SIGSpatialCalculator !== 'undefined') {
      var validation = SIGSpatialCalculator.validateGeometry(route.geometry);
      if (!validation.valid) {
        throw new Error('SIGDataEngine.addFeature : géométrie invalide — ' + validation.errors.join(', '));
      }
    }

    /* Calculer la longueur si non fournie */
    var props = Object.assign({}, route.properties || {});
    if (!props.LONGEUR && typeof SIGSpatialCalculator !== 'undefined') {
      props.LONGEUR = Math.round(SIGSpatialCalculator.calculateLength(route.geometry));
    }

    /* Enrichir les métadonnées */
    var now = new Date().toISOString();
    var user = getCurrentUser();
    var featureId = 'route_' + Date.now() + '_' + (++_featureCounter);

    var feature = {
      type: 'Feature',
      id: featureId,
      geometry: route.geometry,
      properties: Object.assign({}, props, {
        createdAt: now,
        lastModified: now,
        modifiedBy: user,
        status: 'draft',
        version: 1
      })
    };

    /* Ajouter au GeoJSON global */
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      json_Rseauroutier_6.features.push(feature);
    }

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.CREATE_ROUTE, {
        featureId: featureId,
        featureName: props.Name,
        after: { properties: props, geometryType: route.geometry.type }
      });
    }

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_CREATED, {
        featureId: featureId,
        feature: feature
      });
    }

    return feature;
  }

  /* ===================================================================
   * CRUD — READ
   * =================================================================== */

  /**
   * Retourne une feature par son ID.
   * @param {string|number} id - ID de la feature
   * @returns {Object|null} Feature GeoJSON ou null
   */
  function getFeatureById(id) {
    if (typeof json_Rseauroutier_6 === 'undefined') return null;
    var strId = String(id);

    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var f = json_Rseauroutier_6.features[i];
      if (f.id === strId) {
        return f;
      }
    }
    return null;
  }

  /**
   * Retourne l'index d'une feature dans le GeoJSON global par son ID.
   * @param {string|number} id
   * @returns {number} Index ou -1
   */
  function getFeatureIndex(id) {
    if (typeof json_Rseauroutier_6 === 'undefined') return -1;
    var strId = String(id);

    for (var i = 0; i < json_Rseauroutier_6.features.length; i++) {
      var f = json_Rseauroutier_6.features[i];
      if (f.id === strId) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Retourne toutes les features du réseau routier.
   * @returns {Object[]} Array de features GeoJSON
   */
  function getAllFeatures() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      return json_Rseauroutier_6.features || [];
    }
    return [];
  }

  /**
   * Retourne le FeatureCollection complet.
   * @returns {Object}
   */
  function getFeatureCollection() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      return json_Rseauroutier_6;
    }
    return { type: 'FeatureCollection', features: [] };
  }

  /* ===================================================================
   * CRUD — UPDATE
   * =================================================================== */

  /**
   * Met à jour une feature existante.
   * Passe obligatoirement par ce moteur.
   *
   * @param {string|number} id - ID de la feature
   * @param {Object} newData - Nouvelles données (propriétés et/ou géométrie)
   * @param {Object} [newData.properties] - Nouvelles propriétés (fusionnées)
   * @param {Object} [newData.geometry] - Nouvelle géométrie (remplacement)
   * @returns {Object|null} La feature mise à jour ou null si non trouvée
   */
  function updateFeature(id, newData) {
    if (!newData) return null;

    var idx = getFeatureIndex(id);
    if (idx < 0) return null;

    var feature = json_Rseauroutier_6.features[idx];

    /* Sauvegarder l'état avant (pour l'audit) */
    var before = {
      properties: Object.assign({}, feature.properties),
      geometryType: feature.geometry ? feature.geometry.type : null
    };

    /* Mettre à jour les propriétés (fusion) */
    if (newData.properties) {
      Object.keys(newData.properties).forEach(function(key) {
        feature.properties[key] = newData.properties[key];
      });
    }

    /* Mettre à jour la géométrie (remplacement) */
    if (newData.geometry) {
      feature.geometry = newData.geometry;
    }

    /* Recalculer la longueur si la géométrie a changé */
    if (newData.geometry && typeof SIGSpatialCalculator !== 'undefined') {
      feature.properties.LONGEUR = Math.round(
        SIGSpatialCalculator.calculateLength(feature.geometry)
      );
    }

    /* Mettre à jour les métadonnées */
    var now = new Date().toISOString();
    feature.properties.lastModified = now;
    feature.properties.modifiedBy = getCurrentUser();
    feature.properties.version = (feature.properties.version || 1) + 1;

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.UPDATE_ROUTE, {
        featureId: id,
        featureName: feature.properties.Name,
        before: before,
        after: {
          properties: Object.assign({}, feature.properties),
          geometryType: feature.geometry ? feature.geometry.type : null
        }
      });
    }

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_UPDATED, {
        featureId: id,
        feature: feature,
        index: idx
      });
    }

    return feature;
  }

  /* ===================================================================
   * CRUD — DELETE
   * =================================================================== */

  /**
   * Supprime une feature du SIG.
   * Passe obligatoirement par ce moteur.
   *
   * @param {string|number} id - ID de la feature
   * @returns {boolean} true si supprimée
   */
  function deleteFeature(id) {
    var idx = getFeatureIndex(id);
    if (idx < 0) return false;

    var feature = json_Rseauroutier_6.features[idx];

    /* Sauvegarder l'état avant (pour l'audit) */
    var before = {
      properties: Object.assign({}, feature.properties),
      geometryType: feature.geometry ? feature.geometry.type : null
    };

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.DELETE_ROUTE, {
        featureId: id,
        featureName: feature.properties.Name,
        before: before
      });
    }

    /* Supprimer du GeoJSON global */
    json_Rseauroutier_6.features.splice(idx, 1);

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.FEATURE_DELETED, {
        featureId: id,
        index: idx
      });
    }

    return true;
  }

  /* ===================================================================
   * STATISTIQUES SPATIALES
   * =================================================================== */

  /**
   * Calcule les statistiques spatiales globales du réseau.
   * Utilise SIGSpatialCalculator pour les calculs géodésiques.
   *
   * @returns {Object}
   *   - totalLength (km)
   *   - totalFeatures
   *   - byCategory { RN: { count, km }, RR: { count, km }, ... }
   *   - byRegion { Centre: { count, km }, Kara: { count, km }, ... }
   *   - avgLength (km)
   *   - auditCount
   */
  function computeSpatialStats() {
    var stats = {
      totalLength: 0,
      totalFeatures: 0,
      byCategory: {},
      byRegion: {},
      avgLength: 0,
      auditCount: 0
    };

    var features = getAllFeatures();
    stats.totalFeatures = features.length;

    /* Utiliser SIGSpatialCalculator si disponible */
    if (typeof SIGSpatialCalculator !== 'undefined') {
      var agg = SIGSpatialCalculator.computeAggregatedStats(features);
      stats.totalLength = agg.totalLength;
      stats.byCategory = agg.byCategory;
      stats.byRegion = agg.byRegion;
      stats.avgLength = agg.avgLength;
    } else {
      /* Fallback : calcul simple */
      features.forEach(function(f) {
        var len = (f.properties && f.properties.LONGEUR) || 0;
        var lenKm = len / 1000;
        stats.totalLength += lenKm;

        var cls = (f.properties && f.properties.CLASSE) || 'Non défini';
        if (!stats.byCategory[cls]) stats.byCategory[cls] = { count: 0, km: 0 };
        stats.byCategory[cls].count++;
        stats.byCategory[cls].km += lenKm;

        var reg = (f.properties && f.properties.REGIONS) || 'Non défini';
        if (!stats.byRegion[reg]) stats.byRegion[reg] = { count: 0, km: 0 };
        stats.byRegion[reg].count++;
        stats.byRegion[reg].km += lenKm;
      });
      stats.avgLength = stats.totalFeatures > 0 ? stats.totalLength / stats.totalFeatures : 0;
    }

    /* Arrondir */
    stats.totalLength = Math.round(stats.totalLength * 100) / 100;
    stats.avgLength = Math.round(stats.avgLength * 100) / 100;

    /* Nombre d'entrées d'audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      stats.auditCount = SIGAuditTrail.count();
    }

    /* Émettre l'événement de stats */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.STATS_CHANGED, stats);
    }

    return stats;
  }

  /* ===================================================================
   * UTILITAIRES INTERNES
   * =================================================================== */

  /**
   * Retourne le nom de l'utilisateur courant depuis AdminAuth.
   */
  function getCurrentUser() {
    if (typeof AdminAuth !== 'undefined') {
      var session = AdminAuth.getSession();
      if (session) return session.name || session.user || 'Utilisateur';
    }
    return 'Utilisateur';
  }

  /**
   * Génère un ID unique pour une nouvelle feature.
   * @returns {string}
   */
  function generateId() {
    return 'route_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  /* ===================================================================
   * MISE À JOUR DE GÉOMÉTRIE SPÉCIFIQUE
   * =================================================================== */

  /**
   * Met à jour uniquement la géométrie d'une feature.
   * Variante optimisée de updateFeature pour les modifications géométriques.
   *
   * @param {string|number} id - ID de la feature
   * @param {Object} newGeometry - Nouvelle géométrie GeoJSON
   * @returns {Object|null}
   */
  function updateGeometry(id, newGeometry) {
    if (!newGeometry) return null;

    var idx = getFeatureIndex(id);
    if (idx < 0) return null;

    var feature = json_Rseauroutier_6.features[idx];

    /* Sauvegarder l'état avant */
    var beforeGeom = feature.geometry ? JSON.parse(JSON.stringify(feature.geometry)) : null;

    /* Mettre à jour */
    feature.geometry = newGeometry;

    /* Recalculer la longueur */
    if (typeof SIGSpatialCalculator !== 'undefined') {
      feature.properties.LONGEUR = Math.round(
        SIGSpatialCalculator.calculateLength(newGeometry)
      );
    }

    /* Mettre à jour les métadonnées */
    var now = new Date().toISOString();
    feature.properties.lastModified = now;
    feature.properties.modifiedBy = getCurrentUser();
    feature.properties.version = (feature.properties.version || 1) + 1;

    /* Audit */
    if (typeof SIGAuditTrail !== 'undefined') {
      SIGAuditTrail.log(SIGAuditTrail.ACTIONS.EDIT_GEOMETRY, {
        featureId: id,
        featureName: feature.properties.Name,
        before: { geometry: beforeGeom },
        after: { geometry: newGeometry }
      });
    }

    /* Événement */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.GEOMETRY_UPDATED, {
        featureId: id,
        feature: feature,
        index: idx
      });
    }

    return feature;
  }

  /* ===== API PUBLIQUE ===== */
  return {
    initialize: initialize,
    addFeature: addFeature,
    getFeatureById: getFeatureById,
    getFeatureIndex: getFeatureIndex,
    getAllFeatures: getAllFeatures,
    getFeatureCollection: getFeatureCollection,
    updateFeature: updateFeature,
    updateGeometry: updateGeometry,
    deleteFeature: deleteFeature,
    computeSpatialStats: computeSpatialStats,
    generateId: generateId
  };
})();