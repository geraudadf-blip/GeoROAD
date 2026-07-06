/* ===================================================================
 * GeoROAD TOGO — SIG Audit Trail (V3.0 SIG Core)
 *
 * Système d'audit obligatoire pour le ministère des Travaux Publics.
 * Enregistre chaque action de modification du SIG avec :
 *   - Utilisateur (depuis la session AdminAuth)
 *   - Type d'action (CREATE, UPDATE, DELETE, EDIT_GEOMETRY)
 *   - Identifiant de la feature modifiée
 *   - Horodatage précis
 *   - État avant/après modification
 *
 * Stockage : localStorage (préparation pour future table PostgreSQL
 *   audit_trail avec colonnes : id, user, action, feature_id,
 *   timestamp, before_json, after_json, ip_address)
 *
 * Dépend : SIGEventBus (pour la propagation des événements d'audit)
 *           AdminAuth (optionnel, pour l'identification de l'utilisateur)
 * =================================================================== */
var SIGAuditTrail = (function() {
  'use strict';

  /* ===== STOCKAGE LOCAL ===== */
  var STORAGE_KEY = 'georoad_audit_trail';
  var MAX_ENTRIES = 500; /* Limiter à 500 entrées pour les performances */

  /* ===== TYPES D'ACTIONS ===== */
  var ACTIONS = {
    CREATE_ROUTE: 'CREATE_ROUTE',
    UPDATE_ROUTE: 'UPDATE_ROUTE',
    DELETE_ROUTE: 'DELETE_ROUTE',
    EDIT_GEOMETRY: 'EDIT_GEOMETRY',
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    EXPORT: 'EXPORT',
    IMPORT: 'IMPORT',
    VALIDATE_ROUTE: 'VALIDATE_ROUTE',
    PUBLISH_ROUTE: 'PUBLISH_ROUTE'
  };

  /* ===================================================================
   * ENREGISTREMENT D'AUDIT
   * =================================================================== */

  /**
   * Ajoute une entrée d'audit.
   *
   * @param {string} action - Type d'action (voir ACTIONS)
   * @param {Object} options
   * @param {string|number} [options.featureId] - ID de la feature concernée
   * @param {string} [options.featureName] - Nom de la route (pour lisibilité)
   * @param {Object} [options.before] - État avant modification (JSON sérialisable)
   * @param {Object} [options.after] - État après modification (JSON sérialisable)
   * @param {string} [options.details] - Description textuelle libre
   * @returns {Object} L'entrée d'audit créée
   */
  function log(action, options) {
    options = options || {};

    /* Identifier l'utilisateur courant */
    var user = 'Anonyme';
    if (typeof AdminAuth !== 'undefined') {
      var session = AdminAuth.getSession();
      if (session) {
        user = session.name || session.user || 'Inconnu';
      }
    }

    var entry = {
      id: generateId(),
      action: action,
      user: user,
      featureId: options.featureId !== undefined ? String(options.featureId) : null,
      featureName: options.featureName || null,
      timestamp: new Date().toISOString(),
      before: options.before || null,
      after: options.after || null,
      details: options.details || ''
    };

    /* Stocker */
    var entries = loadEntries();
    entries.unshift(entry); /* Les plus récentes en premier */

    /* Limiter la taille */
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(0, MAX_ENTRIES);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      /* localStorage plein ou indisponible */
      if (typeof console !== 'undefined') {
        console.warn('[SIGAuditTrail] Impossible de sauvegarder l\'audit :', e);
      }
    }

    /* Émettre l'événement sur le bus */
    if (typeof SIGEventBus !== 'undefined') {
      SIGEventBus.emit(SIGEventBus.EVENTS.AUDIT_LOGGED, entry);
    }

    return entry;
  }

  /* ===================================================================
   * LECTURE DES ENTRÉES
   * =================================================================== */

  /**
   * Retourne toutes les entrées d'audit.
   * @returns {Object[]}
   */
  function getAll() {
    return loadEntries();
  }

  /**
   * Retourne les entrées filtrées par critères.
   *
   * @param {Object} filters
   * @param {string} [filters.action] - Filtrer par type d'action
   * @param {string} [filters.user] - Filtrer par utilisateur
   * @param {string} [filters.featureId] - Filtrer par ID de feature
   * @param {string} [filters.from] - Date ISO de début
   * @param {string} [filters.to] - Date ISO de fin
   * @param {number} [filters.limit] - Nombre max de résultats
   * @returns {Object[]}
   */
  function query(filters) {
    filters = filters || {};
    var entries = loadEntries();

    if (filters.action) {
      entries = entries.filter(function(e) { return e.action === filters.action; });
    }
    if (filters.user) {
      var userLower = filters.user.toLowerCase();
      entries = entries.filter(function(e) { return (e.user || '').toLowerCase().indexOf(userLower) !== -1; });
    }
    if (filters.featureId !== undefined && filters.featureId !== null) {
      entries = entries.filter(function(e) { return e.featureId === String(filters.featureId); });
    }
    if (filters.from) {
      var fromTime = new Date(filters.from).getTime();
      entries = entries.filter(function(e) { return new Date(e.timestamp).getTime() >= fromTime; });
    }
    if (filters.to) {
      var toTime = new Date(filters.to).getTime();
      entries = entries.filter(function(e) { return new Date(e.timestamp).getTime() <= toTime; });
    }
    if (filters.limit) {
      entries = entries.slice(0, filters.limit);
    }

    return entries;
  }

  /**
   * Retourne les entrées d'audit pour une feature spécifique.
   * @param {string|number} featureId
   * @returns {Object[]}
   */
  function getFeatureHistory(featureId) {
    return query({ featureId: featureId });
  }

  /**
   * Retourne le nombre d'entrées par type d'action.
   * @returns {Object} { CREATE_ROUTE: 5, UPDATE_ROUTE: 12, ... }
   */
  function getActionCounts() {
    var entries = loadEntries();
    var counts = {};
    entries.forEach(function(e) {
      counts[e.action] = (counts[e.action] || 0) + 1;
    });
    return counts;
  }

  /**
   * Retourne les N modifications les plus récentes.
   * @param {number} [limit=10]
   * @returns {Object[]}
   */
  function getRecentChanges(limit) {
    return query({ limit: limit || 10 });
  }

  /**
   * Purge toutes les entrées d'audit.
   */
  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  /**
   * Retourne le nombre total d'entrées.
   * @returns {number}
   */
  function count() {
    return loadEntries().length;
  }

  /* ===================================================================
   * FORMATAGE POUR AFFICHAGE
   * =================================================================== */

  /**
   * Retourne le libellé français d'un type d'action.
   * @param {string} action
   * @returns {string}
   */
  function getActionLabel(action) {
    var labels = {
      'CREATE_ROUTE': 'Création de route',
      'UPDATE_ROUTE': 'Modification de route',
      'DELETE_ROUTE': 'Suppression de route',
      'EDIT_GEOMETRY': 'Édition géométrique',
      'LOGIN': 'Connexion',
      'LOGOUT': 'Déconnexion',
      'EXPORT': 'Export de données',
      'IMPORT': 'Import de données',
      'VALIDATE_ROUTE': 'Validation de route',
      'PUBLISH_ROUTE': 'Publication de route'
    };
    return labels[action] || action;
  }

  /**
   * Retourne l'icône Font Awesome pour un type d'action.
   * @param {string} action
   * @returns {string}
   */
  function getActionIcon(action) {
    var icons = {
      'CREATE_ROUTE': 'fa-plus-circle',
      'UPDATE_ROUTE': 'fa-pen',
      'DELETE_ROUTE': 'fa-trash',
      'EDIT_GEOMETRY': 'fa-draw-polygon',
      'LOGIN': 'fa-sign-in-alt',
      'LOGOUT': 'fa-sign-out-alt',
      'EXPORT': 'fa-download',
      'IMPORT': 'fa-upload',
      'VALIDATE_ROUTE': 'fa-check-circle',
      'PUBLISH_ROUTE': 'fa-globe'
    };
    return icons[action] || 'fa-circle';
  }

  /* ===================================================================
   * UTILITAIRES INTERNES
   * =================================================================== */

  function loadEntries() {
    try {
      var data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function generateId() {
    return 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /* ===== API PUBLIQUE ===== */
  return {
    ACTIONS: ACTIONS,
    log: log,
    getAll: getAll,
    query: query,
    getFeatureHistory: getFeatureHistory,
    getActionCounts: getActionCounts,
    getRecentChanges: getRecentChanges,
    clear: clear,
    count: count,
    getActionLabel: getActionLabel,
    getActionIcon: getActionIcon
  };
})();