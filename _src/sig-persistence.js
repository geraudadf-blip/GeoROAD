/* ===================================================================
 * GeoROAD TOGO — SIG Persistence Layer (V3.0 SIG Core)
 *
 * Couche de persistance localStorage structurée comme une future
 * base de données PostgreSQL/PostGIS.
 *
 * Structure de stockage (clés localStorage) :
 *   georoad_sig.layers.routes      → FeatureCollection routes
 *   georoad_sig.layers.emprises    → FeatureCollection emprises
 *   georoad_sig.layers.pk          → FeatureCollection points kilométriques
 *   georoad_sig.meta.version       → Version du schéma
 *   georoad_sig.meta.lastSync      → Dernière synchronisation
 *   georoad_sig.meta.schema        → Description du schéma de données
 *
 * Architecture PostGIS future :
 *   - Remplacer les appels localStorage par des requêtes
 *     SQL via un backend REST API
 *   - La structure JSON reste identique pour la compatibilité
 *
 * Dépend : SIGEventBus (pour émettre PERSISTENCE_SAVED)
 * =================================================================== */
var SIGPersistence = (function() {
  'use strict';

  /* ===== PRÉFIXE DE STOCKAGE ===== */
  var PREFIX = 'georoad_sig.';

  /* ===== VERSION DU SCHÉMA ===== */
  var SCHEMA_VERSION = '3.0';
  var SCHEMA_KEY = PREFIX + 'meta.version';

  /* ===== COUCHES GÉRÉES ===== */
  var LAYERS = {
    ROUTES: 'layers.routes',
    EMPRISES: 'layers.emprises',
    PK: 'layers.pk',
  };

  /* ===================================================================
   * SAUVEGARDE
   * =================================================================== */

  /**
   * Sauvegarde un FeatureCollection dans une couche.
   *
   * @param {string} layerKey - Clé de la couche (LAYERS.ROUTES, etc.)
   * @param {Object} featureCollection - GeoJSON FeatureCollection
   * @returns {boolean} true si succès
   */
  function saveLayer(layerKey, featureCollection) {
    var fullKey = PREFIX + layerKey;
    try {
      localStorage.setItem(fullKey, JSON.stringify(featureCollection));

      /* Émettre l'événement de persistance */
      if (typeof SIGEventBus !== 'undefined') {
        SIGEventBus.emit(SIGEventBus.EVENTS.PERSISTENCE_SAVED, {
          layer: layerKey,
          featureCount: (featureCollection && featureCollection.features) ? featureCollection.features.length : 0,
          timestamp: new Date().toISOString()
        });
      }

      return true;
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('[SIGPersistence] Erreur de sauvegarde ' + layerKey + ':', e);
      }
      return false;
    }
  }

  /**
   * Sauvegarde l'état complet du SIG (toutes les couches).
   * Appelé automatiquement après chaque modification.
   *
   * @param {Object} data
   * @param {Object} [data.routes] - FeatureCollection des routes
   * @param {Object} [data.emprises] - FeatureCollection des emprises
   * @param {Object} [data.pk] - FeatureCollection des PK
   * @returns {{ routes: boolean, emprises: boolean, pk: boolean }}
   */
  function saveAll(data) {
    data = data || {};
    var results = {};

    results.routes = saveLayer(LAYERS.ROUTES, data.routes);
    results.emprises = saveLayer(LAYERS.EMPRISES, data.emprises);
    results.pk = saveLayer(LAYERS.PK, data.pk);

    /* Mettre à jour le timestamp de dernière synchronisation */
    setMeta('lastSync', new Date().toISOString());

    return results;
  }

  /**
   * Sauvegarde une feature individuelle dans une couche.
   * Si la feature existe (même id), elle est remplacée.
   *
   * @param {string} layerKey - Clé de la couche
   * @param {Object} feature - GeoJSON Feature
   * @returns {boolean}
   */
  function saveFeature(layerKey, feature) {
    var fc = loadLayer(layerKey);
    if (!fc) {
      fc = { type: 'FeatureCollection', features: [] };
    }

    var existingIdx = -1;
    if (feature.id !== undefined) {
      for (var i = 0; i < fc.features.length; i++) {
        if (fc.features[i].id === feature.id) {
          existingIdx = i;
          break;
        }
      }
    }

    if (existingIdx >= 0) {
      fc.features[existingIdx] = feature;
    } else {
      fc.features.push(feature);
    }

    return saveLayer(layerKey, fc);
  }

  /* ===================================================================
   * CHARGEMENT
   * =================================================================== */

  /**
   * Charge un FeatureCollection depuis une couche.
   *
   * @param {string} layerKey - Clé de la couche
   * @returns {Object|null} FeatureCollection ou null si inexistant
   */
  function loadLayer(layerKey) {
    var fullKey = PREFIX + layerKey;
    try {
      var data = localStorage.getItem(fullKey);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Charge l'état complet du SIG.
   *
   * @returns {{ routes: Object|null, emprises: Object|null, pk: Object|null, meta: Object }}
   */
  function loadAll() {
    return {
      routes: loadLayer(LAYERS.ROUTES),
      emprises: loadLayer(LAYERS.EMPRISES),
      pk: loadLayer(LAYERS.PK),
      meta: {
        version: getMeta('version'),
        lastSync: getMeta('lastSync'),
        schema: getMeta('schema')
      }
    };
  }

  /**
   * Supprime une couche complète.
   * @param {string} layerKey
   */
  function deleteLayer(layerKey) {
    try {
      localStorage.removeItem(PREFIX + layerKey);
    } catch (e) {}
  }

  /**
   * Supprime toutes les données SIG du localStorage.
   */
  function deleteAll() {
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(function(key) {
      localStorage.removeItem(key);
    });
  }

  /* ===================================================================
   * MÉTADONNÉES
   * =================================================================== */

  /**
   * Stocke une métadonnée.
   * @param {string} key
   * @param {string} value
   */
  function setMeta(key, value) {
    try {
      localStorage.setItem(PREFIX + 'meta.' + key, String(value));
    } catch (e) {}
  }

  /**
   * Lit une métadonnée.
   * @param {string} key
   * @returns {string|null}
   */
  function getMeta(key) {
    try {
      return localStorage.getItem(PREFIX + 'meta.' + key);
    } catch (e) {
      return null;
    }
  }

  /* ===================================================================
   * INITIALISATION
   * =================================================================== */

  /**
   * Initialise le schéma de persistance.
   * Sauvegarde les données en mémoire (variables globales GeoJSON)
   * vers localStorage pour la première fois.
   */
  function initialize() {
    /* Vérifier si le schéma est déjà initialisé */
    var version = getMeta('version');
    if (version === SCHEMA_VERSION) return;

    /* Sauvegarder le schéma */
    setMeta('version', SCHEMA_VERSION);
    setMeta('schema', JSON.stringify(getSchemaDescription()));

    /* Sauvegarder les données GeoJSON existantes vers localStorage */
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      saveLayer(LAYERS.ROUTES, json_Rseauroutier_6);
    }
    if (typeof json_Emprise_5 !== 'undefined') {
      saveLayer(LAYERS.EMPRISES, json_Emprise_5);
    }
    /* Initialiser PK vide si non existant */
    if (!loadLayer(LAYERS.PK)) {
      saveLayer(LAYERS.PK, { type: 'FeatureCollection', features: [] });
    }

    setMeta('lastSync', new Date().toISOString());
  }

  /**
   * Retourne la description du schéma de données.
   * Préparation pour la future migration vers PostgreSQL/PostGIS.
   */
  function getSchemaDescription() {
    return {
      version: SCHEMA_VERSION,
      layers: {
        routes: {
          type: 'FeatureCollection',
          geometryType: 'LineString|MultiLineString',
          description: 'Réseau routier national du Togo',
          properties: [
            'id', 'Name', 'Code', 'CLASSE', 'REGIONS', 'Prefecture',
            'LONGEUR', 'Largeur', 'EMPRISE', 'Etat', 'Revetement',
            'Origine', 'Destination', 'Pop_Dessertie', 'Communes',
            'PK_DEB_X', 'PK_DEB_Y', 'PK_FIN_X', 'PK_FIN_Y',
            'Observations', 'status', 'createdAt', 'lastModified', 'modifiedBy'
          ]
        },
        emprises: {
          type: 'FeatureCollection',
          geometryType: 'Polygon',
          description: 'Zones tampon d\'emprise routière'
        },
        pk: {
          type: 'FeatureCollection',
          geometryType: 'Point',
          description: 'Points kilométriques de référence'
        }
      },
      audit: {
        table: 'audit_trail',
        columns: ['id', 'user', 'action', 'feature_id', 'timestamp', 'before_json', 'after_json']
      }
    };
  }

  /**
   * Synchronise les données GeoJSON globales vers le localStorage.
   * À appeler après chaque modification via SIGDataEngine.
   */
  function syncFromMemory() {
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      saveLayer(LAYERS.ROUTES, json_Rseauroutier_6);
    }
    setMeta('lastSync', new Date().toISOString());
  }

  /**
   * Vérifie si des données persistées existent et sont plus récentes
   * que les données en mémoire (pour restauration future).
   * @returns {boolean}
   */
  function hasPersistedData() {
    var routes = loadLayer(LAYERS.ROUTES);
    return routes && routes.features && routes.features.length > 0;
  }

  /**
   * Retourne la taille estimée du stockage en octets.
   * @returns {number}
   */
  function getStorageSize() {
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(PREFIX) === 0) {
        total += (localStorage.getItem(key) || '').length * 2; /* UTF-16 = 2 octets/char */
      }
    }
    return total;
  }

  /* ===== API PUBLIQUE ===== */
  return {
    LAYERS: LAYERS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    saveLayer: saveLayer,
    saveAll: saveAll,
    saveFeature: saveFeature,
    loadLayer: loadLayer,
    loadAll: loadAll,
    deleteLayer: deleteLayer,
    deleteAll: deleteAll,
    setMeta: setMeta,
    getMeta: getMeta,
    initialize: initialize,
    syncFromMemory: syncFromMemory,
    hasPersistedData: hasPersistedData,
    getStorageSize: getStorageSize,
    getSchemaDescription: getSchemaDescription
  };
})();