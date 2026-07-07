/* ===================================================================
 * GeoROAD TOGO — Module d'Administration
 * 
 * Architecture modulaire préparée pour l'évolution vers :
 * - Backend REST API (Node.js/Express ou Python/FastAPI)
 * - PostgreSQL/PostGIS pour le stockage spatial
 * - JWT pour l'authentification
 * - RBAC pour les permissions
 * - Audit trail pour l'historique des modifications
 * - Import GPX/Shapefile/GeoJSON
 * - Édition cartographique (OpenLayers)
 * 
 * Convention de code :
 * - Modules exposés sur window (pas d'ESM pour compatibilité locale)
 * - Pattern IIFE pour l'isolation
 * - Documentation JSDoc sur chaque fonction publique
 * =================================================================== */

/* -------------------------------------------------------------------
 * MODULE : AdminAuth
 * Gestion de l'authentification et de la session.
 * Actuellement : sessionStorage côté client.
 * Futur : JWT HTTP-only + refresh token via API.
 * ------------------------------------------------------------------- */
var AdminAuth = (function() {
  'use strict';

  var SESSION_KEY = 'georoad_auth';

  function isAdminRole(role) {
    return String(role || '').toLowerCase() === 'administrateur';
  }

  /** Vérifie si l'utilisateur est authentifié. */
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

  /** Détruit la session et redirige vers la page de connexion. */
  function logout() {
    var session = getSession();
    if (session && typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.LOGOUT, {
          user: session.name || session.user || 'Administrateur',
          featureId: session.userId ? String(session.userId) : null,
          featureName: session.user || session.name || 'Administrateur',
          details: 'Déconnexion de l\'administration',
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

  /** Middleware de garde — redirige si non authentifié. */
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
 * Couche d'accès aux données.
 * Actuellement : lecture directe des variables globales GeoJSON.
 * Futur : appels fetch() vers l'API REST / PostgreSQL.
 * ------------------------------------------------------------------- */
var AdminData = (function() {
  'use strict';

  /**
   * Calcule des statistiques agrégées depuis les données GeoJSON.
   * @returns {Object} Statistiques structurées pour le dashboard
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

        var reg = p.REGIONS || 'Non défini';
        stats.byRegion[reg] = stats.byRegion[reg] || { count: 0, km: 0 };
        stats.byRegion[reg].count++;
        stats.byRegion[reg].km += len;

        /* PHASE 2 : répartition par état et revêtement (depuis les attributs réels) */
        var etat = p.Etat || 'Non défini';
        stats.byEtat[etat] = (stats.byEtat[etat] || 0) + 1;
        var revet = p.Revetement || 'Non défini';
        stats.byRevetement[revet] = (stats.byRevetement[revet] || 0) + 1;
      });
    }

    /* Emprises */
    if (typeof json_Emprise_5 !== 'undefined') {
      stats.empriseCount = (json_Emprise_5.features || []).length;
    }

    /* Préfectures */
    if (typeof json_Prfecture_3 !== 'undefined') {
      stats.prefectureCount = (json_Prfecture_3.features || []).length;
    }

    /* Cantons */
    if (typeof json_Canton_4 !== 'undefined') {
      stats.cantonCount = (json_Canton_4.features || []).length;
    }

    /* Régions */
    if (typeof json_Rgion_2 !== 'undefined') {
      stats.regionFeatures = json_Rgion_2.features || [];
    }

    /* PK — depuis SIGPersistence (PHASE 2) */
    if (typeof SIGPersistence !== 'undefined') {
      try {
        var pkFC = SIGPersistence.loadLayer(SIGPersistence.LAYERS.PK);
        if (pkFC && pkFC.features) stats.pkCount = pkFC.features.length;
      } catch(e) {}
    }

    return stats;
  }

  /**
   * Retourne les données brutes d'une couche GeoJSON.
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
 * Gestion complète des utilisateurs (CRUD) avec localStorage.
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
  /* PHASE 8 : uniquement 2 profils autorisés */
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
      return { ok: false, reason: 'inactive', user: user, message: 'Ce compte est désactivé.' };
    }
    if (user.role !== 'administrateur') {
      return { ok: false, reason: 'forbidden', user: user, message: 'Ce compte n\'a pas accès à l\'administration.' };
    }
    if (String(user.password || '') !== String(password || '')) {
      return { ok: false, reason: 'invalid_password', user: user, message: 'Identifiants incorrects.' };
    }
    return { ok: true, user: user };
  }

  /** Charge l'historique des connexions (max 200 entrées). */
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
      ip: 'local' /* en production : récupéré côté serveur */
    });
    /* Limiter à 200 entrées */
    if (history.length > 200) history = history.slice(0, 200);
    localStorage.setItem(LOGIN_HISTORY_KEY, JSON.stringify(history));
    /* Mettre à jour lastLogin et lastActivity de l'utilisateur */
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
          details: success ? 'Connexion réussie à l\'administration' : 'Tentative de connexion refusée',
          result: success ? 'SUCCESS' : 'FAILURE',
          entityType: 'user'
        });
      } catch(e) {}
    }
  }

  /** Met à jour la dernière activité d'un utilisateur (à appeler sur chaque action). */
  function recordActivity(userId) {
    var users = loadUsers();
    var u = users.find(function(u) { return u.id === userId; });
    if (u) {
      u.lastActivity = new Date().toISOString();
      saveUsers(users);
    }
  }

  /** Réinitialise le mot de passe d'un utilisateur (génère un mot de passe temporaire). */
  function resetPassword(id) {
    var users = loadUsers();
    var u = users.find(function(u) { return u.id === id; });
    if (!u) return;
    /* Générer un mot de passe temporaire de 10 caractères */
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
          details: 'Mot de passe réinitialisé pour ' + (u.name || u.username),
          result: 'SUCCESS',
          entityType: 'user'
        });
      } catch(e) {}
    }
    /* Afficher le mot de passe temporaire */
    alert("Mot de passe réinitialisé pour \"" + u.name + "\".\n\nMot de passe temporaire : " + tmp + "\n\nL'utilisateur devra le changer à la prochaine connexion.");
    if (typeof AdminUI !== 'undefined') AdminUI.navigate('users');
  }

  function getNextId(users) {
    var max = 0;
    users.forEach(function(u) { if (u.id > max) max = u.id; });
    return max + 1;
  }

  function formatDate(d) {
    if (!d) return '—';
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
      return '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:30px">Aucun utilisateur trouvé</td></tr>';
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
        + '<button class="btn-sm ghost" title="Réinitialiser le mot de passe" onclick="UserAdmin.resetPassword(' + u.id + ')"><i class="fas fa-key"></i></button>'
        + '<button class="btn-sm ghost" title="Historique des connexions" onclick="UserAdmin.showLoginHistory(' + u.id + ')"><i class="fas fa-history"></i></button>'
        + '<button class="btn-sm ghost" title="' + (u.status === 'actif' ? 'Désactiver' : 'Activer') + '" onclick="UserAdmin.toggleStatus(' + u.id + ')">'
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
      + '<div class="modal-admin-header"><h3>Historique des connexions — ' + esc(u.name) + '</h3>'
      + '<button class="modal-admin-close" onclick="UserAdmin.closeModal()"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">';
    if (history.length === 0) {
      html += '<p style="text-align:center;color:var(--text-3);padding:30px">Aucune connexion enregistrée.</p>';
    } else {
      html += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Date</th><th>Statut</th><th>Adresse</th>'
        + '</tr></thead><tbody>';
      history.forEach(function(h) {
        var d = new Date(h.timestamp).toLocaleDateString('fr-FR') + ' ' + new Date(h.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var st = h.success ? '<span class="status-badge active">Réussie</span>' : '<span class="status-badge inactive">Échouée</span>';
        html += '<tr><td>' + d + '</td><td>' + st + '</td><td style="font-size:.82rem;color:var(--text-3)">' + esc(h.ip || '—') + '</td></tr>';
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
      + '<p>Administration des comptes et des rôles d\'accès à la plateforme GeoROAD. Cette section est réservée aux administrateurs système du Ministère des Travaux Publics pour gérer les permissions des agents.</p></div>';

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
      + '<th>Nom</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Dernière activité</th><th>Actions</th>'
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
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px">Rôle *</label>'
      + '<select id="uf-role" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;background:var(--white)">'
      + '<option value="administrateur"' + (user && user.role === 'administrateur' ? ' selected' : '') + '>Administrateur</option>'
      + '<option value="utilisateur_public"' + (user && user.role === 'utilisateur_public' ? ' selected' : '') + '>Utilisateur public</option>'
      + '</select></div>'
      + '<div style="grid-column:1/-1"><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:4px">Mot de passe' + (isEdit ? ' (laisser vide pour ne pas changer)' : ' *') + '</label>'
      + '<input type="password" id="uf-password" placeholder="' + (isEdit ? 'Ne pas modifier' : 'Définir un mot de passe') + '" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem"></div>'
      + '</div>'
      + '<div id="uf-error" style="color:var(--red);font-size:.82rem;margin-top:8px;display:none"></div>';

    var modalHtml = '<div id="modal-user-form" class="modal-admin-overlay" onclick="UserAdmin.closeModalOnOverlay(event)">'
      + '<div class="modal-admin" style="max-width:560px">'
      + '<div class="modal-admin-header"><h3>' + title + '</h3>'
      + '<button class="modal-admin-close" onclick="UserAdmin.closeModal()"><i class="fas fa-times"></i></button></div>'
      + '<div class="modal-admin-body">' + formHtml + '</div>'
      + '<div class="modal-admin-footer">'
      + '<button class="btn-sm ghost" onclick="UserAdmin.closeModal()">Annuler</button>'
      + '<button class="btn-sm primary" onclick="UserAdmin.saveForm(' + (id || 'null') + ')"><i class="fas fa-check"></i> ' + (isEdit ? 'Enregistrer' : 'Créer') + '</button>'
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
      errorEl.textContent = 'Le rôle sélectionné n\'est pas autorisé.';
      errorEl.style.display = 'block';
      return;
    }

    var users = loadUsers();
    var currentSession = (typeof AdminAuth !== 'undefined') ? AdminAuth.getSession() : null;
    var currentUser = currentSession ? (currentSession.name || currentSession.user || 'Administrateur') : 'Administrateur';

    /* Vérifier l'unicité du username */
    var dup = users.find(function(u) { return u.username.toLowerCase() === username.toLowerCase() && u.id !== editId; });
    if (dup) {
      errorEl.textContent = 'Ce nom d\'utilisateur est déjà pris.';
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
              details: 'Utilisateur modifié : ' + user.username,
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
            details: 'Utilisateur créé : ' + createdUser.username,
            result: 'SUCCESS',
            entityType: 'user'
          });
        } catch(e) {}
      }
    }

    saveUsers(users);
    closeModal();

    /* Rafraîchir la page via AdminUI */
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
          details: 'Statut utilisateur mis à jour : ' + user.username + ' (' + user.status + ')',
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

    var msg = 'Supprimer l\'utilisateur "' + (user.name || user.username) + '" ? Cette action est irréversible.';
    if (!confirm(msg)) return;

    users = users.filter(function(u) { return u.id !== id; });
    saveUsers(users);
    if (typeof SIGAuditTrail !== 'undefined') {
      try {
        SIGAuditTrail.log(SIGAuditTrail.ACTIONS.USER_DELETED, {
          featureId: String(id),
          featureName: user.username,
          before: cloneUsers([user])[0],
          details: 'Utilisateur supprimé : ' + user.username,
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
 * Configuration générale de la plateforme (localStorage).
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
    /* PHASE 9 : nouveaux paramètres */
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
    var html = '<div class="page-header"><h1>Paramètres</h1>'
      + '<p>Configuration générale de la plateforme GeoROAD : système de projection cartographique, sauvegarde, affichage et préférences. Ces paramètres sont utilisés par l\'ensemble des modules de l\'application.</p></div>';

    /* Bouton enregistrer global */
    html += '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">'
      + '<button class="btn-sm primary" onclick="SettingsAdmin.saveAll()"><i class="fas fa-check"></i> Enregistrer tous les paramètres</button>'
      + '</div>';

    /* Section 1 : Paramètres généraux */
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-cog"></i> Paramètres généraux</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Nom de la plateforme</label>'
      + inputHtml('platformName', s.platformName)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Langue</label>'
      + selectHtml('language', [{value:'fr',label:'Français'},{value:'en',label:'English'}], s.language)
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
      html += '<div style="width:120px;height:80px;border:1px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:.78rem;text-align:center">Aucun logo<br>(logo par défaut)</div>';
    }
    html += '</div>'
      + '<div style="flex:1;min-width:200px">'
      + '<input type="file" id="setting-logo-file" accept="image/*" style="display:none" onchange="SettingsAdmin.uploadLogo(this)">'
      + '<button class="btn-sm primary" onclick="document.getElementById(\'setting-logo-file\').click()"><i class="fas fa-upload"></i> Choisir un logo</button> '
      + '<button class="btn-sm ghost" onclick="SettingsAdmin.removeLogo()"><i class="fas fa-trash"></i> Supprimer</button>'
      + '<p style="font-size:.78rem;color:var(--text-3);margin-top:8px">PNG, JPG ou SVG. Taille max recommandée : 200×80 px.</p>'
      + '</div>'
      + '</div></div></div>';

    /* Section 2 : Cartographie + fond de carte par défaut (PHASE 9) */
    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-map"></i> Cartographie</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Projection par défaut</label>'
      + selectHtml('projection', ['EPSG:4326','EPSG:32630','EPSG:32631','EPSG:32632'], s.projection)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Unités de distance</label>'
      + selectHtml('distanceUnit', [{value:'km',label:'Kilomètres (km)'},{value:'m',label:'Mètres (m)'}], s.distanceUnit)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Affichage coordonnées</label>'
      + selectHtml('coordFormat', [{value:'DMS',label:'DMS (degrés, minutes, secondes)'},{value:'DD',label:'DD (degrés décimaux)'}], s.coordFormat)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Fond de carte par défaut</label>'
      + selectHtml('defaultBaseMap', [{value:'satellite',label:'Google Satellite'},{value:'osm',label:'OpenStreetMap'},{value:'hybrid',label:'Google Hybrid'}], s.defaultBaseMap)
      + '</div>'
      + '</div></div></div>';

    /* Section 3 : Sauvegarde + fréquence (PHASE 9) */
    var storageSize = 0;
    if (typeof SIGPersistence !== 'undefined') {
      try { storageSize = SIGPersistence.getStorageSize(); } catch(e) {}
    }
    var storageStr = (storageSize / 1024).toFixed(1) + ' Ko';
    if (storageSize > 1048576) storageStr = (storageSize / 1048576).toFixed(2) + ' Mo';

    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-database"></i> Sauvegarde</h3></div>'
      + '<div class="panel-body">'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Fréquence de sauvegarde automatique</label>'
      + selectHtml('autoSaveFreq', [
        {value:'onchange',label:'À chaque modification'},
        {value:'5min',label:'Toutes les 5 minutes'},
        {value:'manual',label:'Manuelle'}
      ], s.autoSaveFreq)
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Fréquence des sauvegardes de sécurité</label>'
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
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Thème</label>'
      + selectHtml('theme', [{value:'light',label:'Clair'}], s.theme)
      + '</div>'
      + '</div></div></div>';

    /* Section 5 : Informations */
    var schemaVersion = '—';
    if (typeof SIGPersistence !== 'undefined') {
      try {
        var desc = SIGPersistence.getSchemaDescription();
        schemaVersion = desc.version || '—';
      } catch(e) {}
    }
    var lastSync = '—';
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
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Schéma de données</label>'
      + '<div style="padding:9px 12px;background:var(--bg);border-radius:8px;font-size:.88rem;color:var(--text-2)">' + esc(schemaVersion) + '</div>'
      + '</div>'
      + '<div><label style="font-size:.82rem;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">Dernière synchronisation</label>'
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
          details: 'Paramètres de la plateforme enregistrés',
          after: settingsSnapshot,
          result: 'SUCCESS',
          entityType: 'settings'
        });
      } catch(e) {}
    }
    if (typeof NotificationCenter !== 'undefined') {
      try {
        NotificationCenter.add('update', 'Paramètres enregistrés', 'La configuration de la plateforme a été mise à jour.');
      } catch(e) {}
    }
    /* Tous les champs sont déjà sauvegardés en temps réel via onchange/oninput. */
    /* Ce bouton sert de confirmation visuelle. */
    var toast = document.getElementById('settings-toast');
    if (toast) toast.parentNode.removeChild(toast);
    var div = document.createElement('div');
    div.id = 'settings-toast';
    div.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--green);color:#fff;padding:12px 24px;border-radius:10px;font-size:.88rem;font-weight:600;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,.15)';
    div.innerHTML = '<i class="fas fa-check-circle"></i> Paramètres enregistrés avec succès';
    document.body.appendChild(div);
    setTimeout(function() { if (div.parentNode) div.parentNode.removeChild(div); }, 3000);
  }

  /** Upload du logo (PHASE 9) : lit le fichier en base64 et le stocke dans les settings. */
  function uploadLogo(input) {
    if (!input.files || input.files.length === 0) return;
    var file = input.files[0];
    /* Limiter à 500 Ko */
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

  /** Supprime le logo personnalisé (PHASE 9). */
  function removeLogo() {
    if (!confirm('Supprimer le logo personnalisé ? Le logo par défaut sera utilisé.')) return;
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
    if (!iso) return '—';
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

    /* Récupérer toutes les entrées (large limite) */
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
      return '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:30px">Module d\'audit non chargé</td></tr>';
    }

    if (entries.length === 0) {
      return '<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:30px">Aucune entrée ne correspond aux filtres</td></tr>';
    }

    var html = '';
    entries.forEach(function(e) {
      var actionLabel = SIGAuditTrail.getActionLabel(e.action);
      var actionIcon = SIGAuditTrail.getActionIcon(e.action);
      var featName = e.featureName || e.featureId || '';
      /* Bouton "Zoom sur entité" — uniquement pour les actions sur routes/PK/emprises */
      var canZoom = featName && (e.action === 'CREATE_ROUTE' || e.action === 'UPDATE_ROUTE' || e.action === 'DELETE_ROUTE' || e.action === 'EDIT_GEOMETRY');
      /* Encoder le nom pour éviter les soucis d'apostrophes : utilisation de data-* attributes */
      var safeId = String(e.featureId || featName || '').replace(/"/g, '&quot;');
      html += '<tr>'
        + '<td>' + formatDate(e.timestamp) + '</td>'
        + '<td>' + esc(e.user) + '</td>'
        + '<td><i class="fas ' + actionIcon + '" style="margin-right:4px"></i> ' + actionLabel + '</td>'
        + '<td>' + esc(featName || '—') + '</td>'
        + '<td>' + esc(e.details || '—') + '</td>'
        + '<td style="text-align:right;white-space:nowrap">'
        + (canZoom ? '<button class="btn-icon" title="Voir sur le géoportail" data-zoom-id="' + safeId + '" data-zoom-name="' + esc(featName) + '" onclick="AuditAdmin.zoomToEntity(this.getAttribute(\'data-zoom-id\'),this.getAttribute(\'data-zoom-name\'))"><i class="fas fa-external-link-alt"></i></button>' : '')
        + '</td>'
        + '</tr>';
    });
    return html;
  }

  function render() {
    var html = '<div class="page-header"><h1>Journal d\'audit</h1>'
      + '<p>Historique des modifications du réseau routier. Chaque action (création, modification, suppression, import, export) est enregistrée avec l\'utilisateur, la date et les détails.</p></div>';

    if (typeof SIGAuditTrail === 'undefined') {
      html += '<div class="admin-panel"><div class="panel-body"><div class="empty-state">'
        + '<i class="fas fa-clipboard-list"></i>'
        + '<h3>Module d\'audit non chargé</h3>'
        + '<p>Le module SIGAuditTrail V3.0 n\'est pas disponible sur cette page.</p>'
        + '</div></div></div>';
      return html;
    }

    /* Statistiques */
    var actionCounts = SIGAuditTrail.getActionCounts();
    var totalEntries = SIGAuditTrail.count();
    html += '<div class="stats-row">';
    html += '<div class="stat-card-admin"><div class="sc-icon gold"><i class="fas fa-clipboard-list"></i></div><div class="sc-value">' + totalEntries + '</div><div class="sc-label">Entrées d\'audit</div></div>';
    html += '<div class="stat-card-admin"><div class="sc-icon green"><i class="fas fa-plus-circle"></i></div><div class="sc-value">' + (actionCounts['CREATE_ROUTE'] || 0) + '</div><div class="sc-label">Routes créées</div></div>';
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
      + '<div><label style="font-size:.78rem;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px">Date début</label>'
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
    html += '<div class="admin-panel" style="margin-top:16px"><div class="panel-header"><h3><i class="fas fa-clock-rotate-left"></i> Dernières modifications</h3>'
      + '<span style="font-size:.82rem;color:var(--text-3)" id="audit-count-label">' + entries.length + ' résultats</span></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Date</th><th>Utilisateur</th><th>Action</th><th>Objet concerné</th><th>Détails</th><th style="text-align:right">Actions</th>'
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
    if (countLabel) countLabel.textContent = entries.length + ' résultats';
  }

  function exportCSV() {
    var entries = getFilteredEntries();
    if (entries.length === 0) {
      alert('Aucune entrée à exporter.');
      return;
    }

    var csv = 'Date;Utilisateur;Action;Route;Détails\n';
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

  /** Export PDF du journal d'audit filtré (utilise jsPDF + autoTable déjà chargés sur admin.html). */
  function exportPDF() {
    var entries = getFilteredEntries();
    if (entries.length === 0) {
      alert('Aucune entrée à exporter.');
      return;
    }
    if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
      alert('Librairie jsPDF non chargée.');
      return;
    }
    var doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var now = new Date();
    var dateStr = now.toLocaleDateString('fr-FR') + ' ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    /* En-tête */
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Journal d\'audit — GeoROAD TOGO', 14, 14);
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text('Édité le ' + dateStr + ' — ' + entries.length + ' entrée(s)', 14, 20);

    /* Tableau */
    var rows = entries.map(function(e) {
      var actionLabel = (typeof SIGAuditTrail !== 'undefined') ? SIGAuditTrail.getActionLabel(e.action) : e.action;
      var d = e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR') : '—';
      return [d, e.user || '—', actionLabel, e.featureName || e.featureId || '—', (e.details || '').substring(0, 100)];
    });
    if (doc.autoTable) {
      doc.autoTable({
        head: [['Date', 'Utilisateur', 'Action', 'Objet concerné', 'Détails']],
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

  /** Ouvre le géoportail public en pointant sur l'entité concernée par une entrée d'audit. */
  function zoomToEntity(featureId, featureName) {
    /* On ouvre le géoportail avec un hash qui sera interprété pour centrer la carte */
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
 * Générateur du HTML pour chaque page/section de l'administration.
 * Chaque fonction retourne du HTML injecté dans #adminContent.
 * 
 * Architecture : chaque page est une fonction indépendante,
 * facilitant l'ajout de nouvelles pages à l'avenir.
 * ------------------------------------------------------------------- */
var AdminPages = (function() {
  'use strict';

  /* Labels complets des catégories de routes */
  var CAT_LABELS = {
    'CU': 'Route Communautaire',
    'RN': 'Route Nationale',
    'RR': 'Route Régionale',
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
      + '<p>Vue d\'ensemble du réseau routier national — Régions Centre, Kara et Savanes</p></div>';

    html += '<div class="stats-row">';
    html += statCard('fa-road', 'gold', s.totalRoutes + '', 'Tronçons routiers', 'up');
    html += statCard('fa-ruler-horizontal', 'blue', s.totalKm.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km', 'Kilomètres totaux', 'up');
    html += statCard('fa-users', 'green', totalRurale.toLocaleString('fr-FR'), 'Population rurale', '');
    html += statCard('fa-vector-square', 'red', s.empriseCount + '', 'Emprises délimitées', '');
    html += '</div>';

    /* PHASE 2 : ligne supplémentaire avec PK, cantons, préf., régions */
    html += '<div class="stats-row" style="margin-top:4px">';
    html += statCard('fa-map-pin', 'gold', s.pkCount + '', 'Points kilométriques', '');
    html += statCard('fa-map', 'blue', s.regionFeatures.length + '', 'Régions', '');
    html += statCard('fa-map-marker-alt', 'green', s.prefectureCount + '', 'Préfectures', '');
    html += statCard('fa-location-dot', 'red', s.cantonCount + '', 'Cantons', '');
    html += '</div>';

    /* Graphiques : 2 colonnes */
    html += '<div class="grid-2">';

    /* Panel barres par catégorie */
    var catOrder = ['CU', 'RN', 'RR', 'RC', 'RL'];
    var maxKm = 0;
    catOrder.forEach(function(c) { if ((s.byCategory[c] || {}).km > maxKm) maxKm = (s.byCategory[c] || {}).km; });

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-road"></i> Routes par catégorie</h3></div>'
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

    /* Panel routes par région — calculées exclusivement depuis les données réelles */
    var regNames = Object.keys(s.byRegion).filter(function(r) { return r !== 'Non défini'; });
    if (regNames.length === 0) regNames = ['Aucune donnée'];
    var maxRegKm = 0;
    regNames.forEach(function(r) { if ((s.byRegion[r] || {}).km > maxRegKm) maxRegKm = (s.byRegion[r] || {}).km; });

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-map"></i> Routes par région</h3></div>'
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

    /* Tableau résumé des régions */
    html += '<div class="admin-panel" style="margin-top:4px"><div class="panel-header"><h3><i class="fas fa-table"></i> Données régionales</h3></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Région</th><th>Population (2022)</th><th>Pop. rurale totale</th><th>Pop. rurale impactée</th><th>IAR (%)</th><th>Taux urbanisation</th>'
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

    /* Longueur moyenne — calculée depuis les données réelles des routes */
    var avgLen = s.totalRoutes > 0 ? (s.totalKm / s.totalRoutes) : 0;
    html += '<div class="stats-row" style="margin-top:4px">';
    html += statCard('fa-ruler-combined', 'gold', avgLen.toFixed(1) + ' km', 'Longueur moyenne', '');
    html += '</div>';

    /* Densité routière par région — calculée depuis les données réelles */
    /* Superficies officielles des régions du Togo (km²) */
    var regionAreas = { 'Centre': 13329, 'Kara': 11640, 'Savanes': 8602 };
    var regionKeys = Object.keys(s.byRegion).filter(function(r) { return r !== 'Non défini' && regionAreas[r]; });
    if (regionKeys.length > 0) {
    html += '<div class="grid-2">';
    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-gauge-high"></i> Densité routière par région</h3></div>'
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
        + '<span class="chart-bar-val">' + densities[r].toFixed(2) + ' km/100km²</span></div>';
    });
    html += '</div></div></div>';

    /* PHASE 2 : répartition par état (depuis les attributs Etat réels) */
    var etatKeys = Object.keys(s.byEtat);
    if (etatKeys.length > 0) {
      var maxEtat = 0;
      etatKeys.forEach(function(k) { if (s.byEtat[k] > maxEtat) maxEtat = s.byEtat[k]; });
      html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-traffic-light"></i> Répartition par état</h3></div>'
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

    /* PHASE 2 : répartition par revêtement (depuis les attributs Revetement réels) */
    var revetKeys = Object.keys(s.byRevetement);
    if (revetKeys.length > 0) {
      var maxRevet = 0;
      revetKeys.forEach(function(k) { if (s.byRevetement[k] > maxRevet) maxRevet = s.byRevetement[k]; });
      html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-road-circle-check"></i> Répartition par revêtement</h3></div>'
        + '<div class="panel-body"><div class="chart-bars">';
      revetKeys.forEach(function(k) {
        var pct = maxRevet > 0 ? (s.byRevetement[k] / maxRevet * 100) : 0;
        var revetCss = k === 'Bitume' ? 'rn' : (k === 'Terre' ? 'rr' : (k === 'Gravier' ? 'rl' : (k === 'Non revêtu' ? 'rc' : 'cu')));
        html += '<div class="chart-bar-row">'
          + '<span class="chart-bar-label">' + k + '</span>'
          + '<div class="chart-bar-track"><div class="chart-bar-fill ' + revetCss + '" style="width:' + pct + '%">' + s.byRevetement[k] + '</div></div>'
          + '<span class="chart-bar-val">' + s.byRevetement[k] + ' route(s)</span></div>';
      });
      html += '</div></div></div>';
    }
    } /* fin du bloc densité si données disponibles */

    /* Routes récemment modifiées */
    var recentFeatures = [];
    if (typeof json_Rseauroutier_6 !== 'undefined') {
      recentFeatures = json_Rseauroutier_6.features.slice().filter(function(f) {
        return f.properties && f.properties.lastModified;
      }).sort(function(a, b) {
        return new Date(b.properties.lastModified) - new Date(a.properties.lastModified);
      }).slice(0, 5);
    }

    html += '<div class="admin-panel"><div class="panel-header"><h3><i class="fas fa-history"></i> Routes récemment modifiées</h3></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Route</th><th>Modifié par</th><th>Date</th>'
      + '</tr></thead><tbody>';
    if (recentFeatures.length === 0) {
      html += '<tr><td colspan="3" style="text-align:center;color:var(--text-3);padding:20px">Aucune modification récente</td></tr>';
    } else {
      recentFeatures.forEach(function(f) {
        var p = f.properties;
        var dateStr = p.lastModified ? new Date(p.lastModified).toLocaleDateString('fr-FR') + ' ' + new Date(p.lastModified).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
        html += '<tr>'
          + '<td><strong>' + esc(p.Name || '—') + '</strong></td>'
          + '<td>' + esc(p.modifiedBy || '—') + '</td>'
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
    return pageHeader('Gestion des routes', 'Consultez, modifiez et gérez l\'ensemble des tronçons du réseau routier national. Chaque route dispose d\'attributs détaillés : nom, code, catégorie (RN, RR, RC, RL, CU), région d\'appartenance, longueur et état de revêtement.')
      + emptyState('fa-road', 'Module non chargé', 'Le module de gestion des routes n\'est pas disponible.', '—');
  }

  function pageEmprises() {
    if (typeof EmpriseModule !== 'undefined') return EmpriseModule.render();
    return pageHeader('Gestion des emprises', 'Gestion des zones d\'emprise routière du domaine public du Ministère des Travaux Publics. Les emprises délimitent la largeur de terrain nécessaire à la construction, l\'entretien et l\'élargissement des routes.')
      + emptyState('fa-vector-square', 'Module non chargé', 'Le module de gestion des emprises n\'est pas disponible.', '—');
  }

  function pagePK() {
    if (typeof PKModule !== 'undefined') return PKModule.render();
    return pageHeader('Gestion des points kilométriques', 'Référencement et localisation des points kilométriques (PK) le long du réseau routier. Les PK servent de repères pour la signalisation, l\'entretien et les interventions sur les routes.')
      + emptyState('fa-map-pin', 'Module non chargé', 'Le module de gestion des PK n\'est pas disponible.', '—');
  }

  function pageSpatial() {
    if (typeof SpatialModule !== 'undefined') return SpatialModule.render();
    /* Fallback dynamique si SpatialModule non chargé — utilise les données réelles */
    var routeCount = (typeof json_Rseauroutier_6 !== 'undefined' && json_Rseauroutier_6.features) ? json_Rseauroutier_6.features.length : 0;
    var empCount = (typeof json_Emprise_5 !== 'undefined' && json_Emprise_5.features) ? json_Emprise_5.features.length : 0;
    var regCount = (typeof json_Rgion_2 !== 'undefined' && json_Rgion_2.features) ? json_Rgion_2.features.length : 0;
    var prefCount = (typeof json_Prfecture_3 !== 'undefined' && json_Prfecture_3.features) ? json_Prfecture_3.features.length : 0;
    var cantCount = (typeof json_Canton_4 !== 'undefined' && json_Canton_4.features) ? json_Canton_4.features.length : 0;
    return pageHeader('Gestion des données spatiales', 'Import et export de données géographiques — GeoJSON, CSV')
      + '<div class="grid-2">'
      + uploadCard('fa-file-import', 'Importer des données', 'GeoJSON, CSV', 'Importer')
      + uploadCard('fa-file-export', 'Exporter des données', 'GeoJSON, CSV, PDF, Excel', 'Exporter')
      + '</div>'
      + '<div class="admin-panel" style="margin-top:20px"><div class="panel-header"><h3><i class="fas fa-layer-group"></i> Couches disponibles</h3></div>'
      + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
      + '<th>Couche</th><th>Entités</th><th>Type</th><th>Statut</th>'
      + '</tr></thead><tbody>'
      + layerRow('Réseau routier', routeCount, 'Ligne', routeCount > 0 ? 'active' : 'inactive')
      + layerRow('Emprises', empCount, 'Polygone', empCount > 0 ? 'active' : 'inactive')
      + layerRow('Régions', regCount, 'Polygone', regCount > 0 ? 'active' : 'inactive')
      + layerRow('Préfectures', prefCount, 'Polygone', prefCount > 0 ? 'active' : 'inactive')
      + layerRow('Cantons', cantCount, 'Polygone', cantCount > 0 ? 'active' : 'inactive')
      + '</tbody></table></div></div></div>';
  }

  function pageSettings() {
    return pageHeader('Paramètres', 'Configuration générale de la plateforme GeoROAD : système de projection cartographique, base de données, authentification et sécurité. Ces paramètres sont utilisés par l\'ensemble des modules de l\'application.')
      + '<div class="grid-2">'
      + settingsCard('fa-server', 'Base de données', 'PostgreSQL/PostGIS', 'Connexion non configurée', 'inactive')
      + settingsCard('fa-key', 'Authentification', 'JWT / Session', 'Non activée', 'pending')
      + settingsCard('fa-map', 'Projection', 'EPSG:4326 (WGS 84)', 'Active', 'active')
      + settingsCard('fa-shield-halved', 'Sécurité', 'HTTPS / CORS', 'À configurer', 'pending')
      + '</div>';
  }

  /* ===== PAGE : Journal d'audit (V3.0) ===== */
  function pageAudit() {
    var html = pageHeader('Journal d\'audit', 'Historique des modifications du réseau routier');

    /* V3.0 SIG Core : utiliser SIGAuditTrail si disponible */
    if (typeof SIGAuditTrail !== 'undefined') {
      var entries = SIGAuditTrail.getRecentChanges(50);
      var actionCounts = SIGAuditTrail.getActionCounts();
      var totalEntries = SIGAuditTrail.count();

      /* Résumé statistique */
      html += '<div class="stats-row">';
      html += statCard('fa-clipboard-list', 'gold', totalEntries + '', 'Entrées d\'audit', '');
      var createCount = actionCounts['CREATE_ROUTE'] || 0;
      var updateCount = actionCounts['UPDATE_ROUTE'] || 0;
      var deleteCount = actionCounts['DELETE_ROUTE'] || 0;
      var geomCount = actionCounts['EDIT_GEOMETRY'] || 0;
      html += statCard('fa-plus-circle', 'green', createCount + '', 'Routes créées', '');
      html += statCard('fa-pen', 'blue', (updateCount + geomCount) + '', 'Modifications', '');
      html += statCard('fa-trash', 'red', deleteCount + '', 'Suppressions', '');
      html += '</div>';

      /* Tableau d'audit */
      html += '<div class="admin-panel" style="margin-top:4px"><div class="panel-header"><h3><i class="fas fa-clock-rotate-left"></i> Dernières modifications</h3></div>'
        + '<div class="panel-body"><div class="admin-table-wrap"><table class="admin-table"><thead><tr>'
        + '<th>Date</th><th>Utilisateur</th><th>Action</th><th>Route</th><th>Détails</th>'
        + '</tr></thead><tbody>';

      if (entries.length === 0) {
        html += '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:30px">Aucune modification enregistrée</td></tr>';
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
            + '<td>' + esc(e.featureName || e.featureId || '—') + '</td>'
            + '<td>' + esc(e.details || '—') + '</td>'
            + '</tr>';
        });
      }
      html += '</tbody></table></div></div></div>';
    } else {
      html += '<div class="admin-panel"><div class="panel-body"><div class="empty-state">'
        + '<i class="fas fa-clipboard-list"></i>'
        + '<h3>Module d\'audit non chargé</h3>'
        + '<p>Le module SIGAuditTrail V3.0 n\'est pas disponible sur cette page.</p>'
        + '</div></div></div>';
    }

    return html;
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Alias court utilisé dans les pages */
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

  /* Mapping page → fonction */
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
    'routes':     { label: 'Gestion des routes', help: 'Consultez, modifiez et gérez les tronçons du réseau routier national. Chaque route dispose d\'attributs détaillés : nom, code, catégorie (RN, RR, RC, RL, CU), région, longueur et état.' },
    'emprises':   { label: 'Gestion des emprises', help: 'Gestion des zones d\'emprise du domaine public routier du Ministère des Travaux Publics. Les emprises délimitent la largeur de terrain nécessaire à la construction et l\'entretien des routes.' },
    'pk':         { label: 'Points kilométriques', help: 'Référencement et localisation des points kilométriques (PK) le long du réseau. Les PK servent de repères pour la signalisation et les interventions d\'entretien.' },
    'spatial':    { label: 'Données spatiales', help: 'Importez et exportez vos données géographiques en GeoJSON et CSV. Le moteur détecte automatiquement les colonnes de coordonnées et le système de projection.' },
    'audit':      { label: 'Journal d\'audit', help: 'Historique des modifications apportées au réseau routier. Chaque action (création, modification, suppression, import, export) est enregistrée avec l\'utilisateur, la date et les détails.' },
    'users':      { label: 'Gestion des utilisateurs', help: 'Administration des comptes et des rôles d\'accès à la plateforme GeoROAD du Ministère des Travaux Publics.' },
    'tableau':    { label: 'Tableau de bord', help: null },
    'settings':   { label: 'Paramètres', help: 'Configuration générale de la plateforme : système de projection, base de données, authentification et sécurité.' }
  };

  /** Retourne le HTML d'une page donnée. */
  function render(pageKey) {
    var fn = pageMap[pageKey];
    if (fn) return fn();
    return pageHeader('Page non trouvée', '') + emptyState('fa-circle-exclamation', 'Page en cours de développement', 'Cette section sera disponible prochainement.', 'Retour');
  }

  /** Vérifie si une page existe. */
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
  if (text.indexOf('Ã') === -1 && text.indexOf('â') === -1 && text.indexOf('Â') === -1) {
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

  /* Labels pour le fil d'Ariane et l'aide — partagés avec AdminPages */
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
   * Vérifie l'authentification, charge le dashboard, configure le user.
   */
  function init() {
    /* Garde d'authentification */
    if (!AdminAuth.requireAuth()) return;

    /* Charger les données GeoJSON nécessaires pour le dashboard */
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

    /* Naviguer vers la page demandée */
    var initialPage = 'dashboard';
    var hash = window.location.hash.replace('#', '');
    if (hash && AdminPages.exists(hash)) {
      initialPage = hash;
    }
    navigate(initialPage);
    normalizeMojibakeInNode(document.body);
  }

  /**
   * Charge les scripts de données GeoJSON requis.
   * Futur : remplacé par des appels API fetch().
   */
  function loadRequiredData() {
    /* Les données sont déjà chargées via <script> sur la page publique.
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

    /* Si toutes les données sont déjà disponibles, on initialise */
    if (toLoad.length === 0) {
      onAllDataLoaded();
      return;
    }

    /* Charger les scripts manquants en séquence */
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

  /** Callback quand toutes les données sont prêtes. */
  function onAllDataLoaded() {
    /* Les données sont prêtes — le dashboard est déjà rendu via navigate() */
  }

  /**
   * Navigue vers une page de l'administration.
   * @param {string} pageKey - Clé de la page (ex: 'dashboard', 'routes')
   */
  function navigate(pageKey) {
    if (!AdminPages.exists(pageKey)) return;
    currentPage = pageKey;

    /* Garder le hash synchronisé pour les modules qui se rafraîchissent sur la page courante */
    try {
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', '#' + pageKey);
      } else {
        window.location.hash = pageKey;
      }
    } catch(e) {}

    /* Mettre à jour le contenu */
    var contentEl = document.getElementById('adminContent');
    if (contentEl) {
      contentEl.innerHTML = AdminPages.render(pageKey);
      contentEl.scrollTop = 0;
      normalizeMojibakeInNode(contentEl);
    }

    /* Mettre à jour le menu actif */
    var items = document.querySelectorAll('.nav-item[data-page]');
    items.forEach(function(el) {
      el.classList.toggle('active', el.getAttribute('data-page') === pageKey);
    });

    /* Mettre à jour le fil d'Ariane */
    var bc = document.getElementById('breadcrumb-current');
    if (bc) {
      var labels = _labelsRef();
      var label = labels && labels[pageKey] ? labels[pageKey].label : pageKey;
      bc.textContent = label;
    }

    /* Mettre à jour les badges de compteurs dans la sidebar */
    refreshNavBadges();

    /* Fermer le sidebar mobile si ouvert */
    closeMobileSidebar();
    syncCurrentUserActivity();
  }

  /** Met à jour dynamiquement les compteurs de la sidebar depuis les données réelles. */
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

  /** Bascule la sidebar entre étendue et réduite. */
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
    /* Créer un modal d'aide simple */
    var existing = document.getElementById('help-modal');
    if (existing) existing.parentNode.removeChild(existing);
    var div = document.createElement('div');
    div.id = 'help-modal';
    div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:20px;';
    div.innerHTML = '<div style="background:var(--white);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);width:100%;max-width:480px;padding:32px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
      + '<h3 style="font-size:1rem;font-weight:700"><i class="fas fa-circle-question" style="color:var(--gold);margin-right:8px"></i>Aide — ' + (AdminPages.getLabel(currentPage) || currentPage) + '</h3>'
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

  /* Abonnement au SIGEventBus pour rafraîchir dynamiquement les compteurs
     et la page courante quand une feature est créée/modifiée/supprimée. */
  if (typeof SIGEventBus !== 'undefined') {
    var refreshTimer = null;
    var scheduleRefresh = function() {
      /* Debounce : si plusieurs events arrivent en rafale, on ne refresh qu'une fois */
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function() {
        AdminUI.refreshNavBadges();
        /* Re-render la page courante pour refléter les changements */
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
