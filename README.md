# GeoROAD TOGO — Déploiement GitHub Pages

## Déploiement automatique (recommandé)

1. **Créer un dépôt GitHub** (public ou private)
2. **Uploader le contenu de `deploy.zip`** à la racine du dépôt
   - Soit via l'interface web GitHub (Add file → Upload files)
   - Soit via git :
     ```bash
     git init
     git add .
     git commit -m "GeoROAD TOGO — version finale"
     git branch -M main
     git remote add origin https://github.com/<user>/georoad-togo.git
     git push -u origin main
     ```
3. **Activer GitHub Pages** : Settings → Pages → Source = **GitHub Actions**
4. Le workflow `.github/workflows/deploy.yml` se déclenche automatiquement à chaque push
5. Le site sera accessible à `https://<user>.github.io/<repo>/`

## Déploiement manuel (sans Actions)

1. Uploader les fichiers sur la branche `main`
2. Settings → Pages → Source = **Deploy from a branch** → Branch: `main` / `/root`
3. Le site sera accessible à `https://<user>.github.io/<repo>/`

## Fichiers importants pour le déploiement

| Fichier | Rôle |
|---------|------|
| `.nojekyll` | Désactive Jekyll — indispensable car le projet contient des dossiers comme `bundle/` et des fichiers CSS que Jekylltraiterait autrement |
| `.github/workflows/deploy.yml` | Workflow GitHub Actions pour déploiement automatique |
| `index.html` | Page d'accueil publique (doit être à la racine) |
| `admin.html` | Interface d'administration (login : `admin`) |
| `geoportail.html` | Géoportail cartographique public |

## Dépannage

### "Deployment failed, try again later"
- Vérifier que `.nojekyll` est bien à la racine du dépôt
- Vérifier que `index.html` est bien à la racine (pas dans un sous-dossier)
- Vérifier dans Settings → Pages que Source = "GitHub Actions"
- Attendre 2-3 minutes et relancer le workflow (Actions → Re-run workflow)

### "Artifact not found"
- Vérifier que le workflow utilise `actions/upload-pages-artifact@v3` avec `path: '.'`
- Vérifier que `index.html` existe à la racine

### Page blanche
- Ouvrir la console développeur (F12) pour voir les erreurs
- Vérifier que tous les chemins sont relatifs (pas de `/` au début)
- Si le site est dans un sous-dossier (`/<repo>/`), les chemins relatifs fonctionnent automatiquement

### Erreur 404 sur les ressources
- Vérifier que les dossiers `bundle/`, `layers/`, `resources/`, `styles/` sont bien uploadés
- Vérifier la casse des noms de fichiers (GitHub Pages est sensible à la casse)

## Structure du projet

```
/
├── .github/workflows/deploy.yml   ← Workflow Actions
├── .nojekyll                      ← Désactive Jekyll
├── index.html                     ← Page d'accueil publique
├── admin.html                     ← Interface admin
├── admin-login.html               ← Connexion admin
├── admin-route-editor.html        ← Éditeur de routes
├── geoportail.html                ← Géoportail public
├── admin.css / geoportail.css     ← Styles
├── admin-route-editor.js          ← Script éditeur routes
├── admin-ouvrages.js              ← Module ouvrages (orphelin)
├── geoportail.js                  ← Script géoportail
├── bundle/                        ← Bundles JS
│   ├── sig-core.js
│   ├── sig-editor.js
│   ├── admin-bundle.js
│   └── utils.js
├── layers/                        ← Couches GeoJSON (5)
├── styles/                        ← Styles OpenLayers (5)
├── resources/                     ← Librairies + images
└── webfonts/                      ← Polices
```

## Compte administrateur par défaut

- **Login :** `admin`
- **Mot de passe :** (aucun — première connexion définit le mot de passe)

Pour réinitialiser : vider le `localStorage` du navigateur.
