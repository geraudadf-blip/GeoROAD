/* ===================================================================
 * GeoROAD TOGO — SIG Event Bus (V3.0 SIG Core)
 *
 * Bus d'événements global pour la synchronisation cross-modules.
 * Remplace tout rafraîchissement manuel par un système pub/sub
 * centralisé et performant.
 *
 * Events :
 *   - FEATURE_CREATED   : Nouvelle route ajoutée
 *   - FEATURE_UPDATED   : Attributs modifiés
 *   - FEATURE_DELETED   : Route supprimée
 *   - GEOMETRY_UPDATED  : Géométrie modifiée
 *   - AUDIT_LOGGED      : Entrée d'audit ajoutée
 *   - STATS_CHANGED     : Statistiques modifiées
 *   - DASHBOARD_REFRESH : Demande de rafraîchissement dashboard
 *   - PERSISTENCE_SAVED : Données persistées en localStorage
 *
 * Dépend : aucune (module autonome, sans dépendance OL)
 * =================================================================== */
var SIGEventBus = (function() {
  'use strict';

  /* ===== TYPES D'ÉVÉNEMENTS ===== */
  var EVENTS = {
    FEATURE_CREATED: 'sig:feature:created',
    FEATURE_UPDATED: 'sig:feature:updated',
    FEATURE_DELETED: 'sig:feature:deleted',
    GEOMETRY_UPDATED: 'sig:geometry:updated',
    AUDIT_LOGGED: 'sig:audit:logged',
    STATS_CHANGED: 'sig:stats:changed',
    DASHBOARD_REFRESH: 'sig:dashboard:refresh',
    PERSISTENCE_SAVED: 'sig:persistence:saved'
  };

  /* ===== STOCKAGE DES LISTENERS ===== */
  var _listeners = {};

  /* Compteur pour le débogage et la performance */
  var _emitCount = 0;
  var _lastEmitTime = 0;
  var _lastEventType = null;
  var _lastEmitDataId = '';

  /* ===================================================================
   * API PUBLIQUE
   * =================================================================== */

  /**
   * Enregistre un listener pour un événement.
   * @param {string} eventType - Type d'événement (voir EVENTS)
   * @param {function} callback - function(data) appelé à chaque émission
   * @param {string} [id] - Identifiant optionnel pour le retrait ciblé
   * @returns {string} Identifiant du listener (pour off())
   */
  function on(eventType, callback, id) {
    if (!eventType || typeof callback !== 'function') return null;
    if (!_listeners[eventType]) _listeners[eventType] = [];

    var listenerId = id || ('listener_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
    _listeners[eventType].push({ id: listenerId, fn: callback });
    return listenerId;
  }

  /**
   * Enregistre un listener qui s'exécute une seule fois.
   * @param {string} eventType
   * @param {function} callback
   * @returns {string} Identifiant du listener
   */
  function once(eventType, callback) {
    var id = 'once_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    var wrapper = function(data) {
      off(eventType, id);
      callback(data);
    };
    wrapper._originalCallback = callback;
    return on(eventType, wrapper, id);
  }

  /**
   * Supprime un listener par identifiant.
   * @param {string} eventType - Type d'événement
   * @param {string} listenerId - Identifiant retourné par on()
   */
  function off(eventType, listenerId) {
    if (!_listeners[eventType]) return;
    if (listenerId) {
      _listeners[eventType] = _listeners[eventType].filter(function(l) {
        return l.id !== listenerId;
      });
    } else {
      /* Supprimer tous les listeners de ce type */
      delete _listeners[eventType];
    }
  }

  /**
   * Supprime tous les listeners de tous les types.
   */
  function offAll() {
    _listeners = {};
  }

  /**
   * Émet un événement avec des données.
   * Les erreurs dans les callbacks sont capturées pour ne pas
   * casser la chaîne d'émission.
   *
   * @param {string} eventType - Type d'événement
   * @param {Object} [data] - Données associées à l'événement
   */
  function emit(eventType, data) {
    var now = Date.now();
    _emitCount++;

    /* Anti-doublon strict : même type + même identifiant de feature en < 10ms */
    var dataId = (data && data.featureId) ? data.featureId : '';
    if (eventType === _lastEventType && dataId === _lastEmitDataId && now - _lastEmitTime < 10) {
      return;
    }
    _lastEventType = eventType;
    _lastEmitDataId = dataId;
    _lastEmitTime = now;

    var listeners = _listeners[eventType];
    if (!listeners || listeners.length === 0) return;

    /* Copier le tableau pour éviter les problèmes si un callback modifie la liste */
    var snapshot = listeners.slice();
    for (var i = 0; i < snapshot.length; i++) {
      try {
        snapshot[i].fn(data);
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[SIGEventBus] Erreur dans le listener "' + eventType + '":', err);
        }
      }
    }
  }

  /* Anti-doublon state */

  /**
   * Retourne le nombre de listeners enregistrés pour un type.
   * @param {string} eventType
   * @returns {number}
   */
  function listenerCount(eventType) {
    if (!_listeners[eventType]) return 0;
    return _listeners[eventType].length;
  }

  /**
   * Retourne des statistiques sur l'utilisation du bus.
   * @returns {{ totalEvents: number, emitCount: number, byType: Object }}
   */
  function getStats() {
    var byType = {};
    Object.keys(_listeners).forEach(function(evt) {
      byType[evt] = _listeners[evt].length;
    });
    return {
      totalListeners: Object.keys(_listeners).reduce(function(sum, evt) {
        return sum + _listeners[evt].length;
      }, 0),
      emitCount: _emitCount,
      byType: byType
    };
  }

  /* ===== API PUBLIQUE ===== */
  return {
    EVENTS: EVENTS,
    on: on,
    once: once,
    off: off,
    offAll: offAll,
    emit: emit,
    listenerCount: listenerCount,
    getStats: getStats
  };
})();