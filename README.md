# Launcher d'Azur Promilia en français

Traduit en français le launcher japonais d'Azur Promilia (`AZUPRO_JP_Gamelauncher`, édité par Yostar). Le jeu lui-même se traduit à part, dans le dépôt `azur-promilia-fr`.

Le français est la langue par défaut. L'outil peut aussi forcer une autre langue : une langue ajoutée dans `locales/`, ou une de celles que le launcher contient déjà (anglais, coréen, chinois…).

Projet de fans, ni affilié à Manjuu ni à Yostar.

## Utilisation

Il faut [Node.js](https://nodejs.org/) 20 ou plus, rien d'autre. Télécharge ce dépôt (bouton **Code**, puis **Download ZIP**) et décompresse-le où tu veux.

1. Ferme le launcher, y compris son icône près de l'horloge.
2. Double-clique sur `Traduire le launcher.cmd`.
3. Relance le launcher.

Pour une autre langue que le français, double-clique à l'étape 2 sur `Choisir la langue du launcher.cmd` : il affiche les langues possibles et demande leur code (`en`, `ko`, `zh_tw`…). Entrée sans rien taper choisit le français.

Après une mise à jour du launcher, il repasse en japonais : refais les trois étapes. Pour revenir au launcher d'origine, double-clique sur `Restaurer le launcher.cmd`.

Le launcher est cherché dans `YostarGames\AZUPRO_JP_Gamelauncher` sur chaque disque. S'il est ailleurs, glisse son dossier sur le fichier `.cmd`, ou lance :

```sh
node launcher-fr.mjs apply "D:\YostarGames\AZUPRO_JP_Gamelauncher"             # français
node launcher-fr.mjs apply --lang en "D:\YostarGames\AZUPRO_JP_Gamelauncher"   # anglais
node launcher-fr.mjs status      # langue forcée, et textes qui manquent dans chaque langue de locales/
node launcher-fr.mjs languages   # langues possibles pour --lang
node launcher-fr.mjs restore
```

Le dossier est facultatif pour chaque commande. Le code de langue s'écrit `zh_tw` ou `zh-TW`, au choix. Une langue inconnue arrête `apply` sans rien modifier et affiche la liste des langues possibles.

## Langues

Deux sortes de langues sont possibles avec `--lang` :

- les langues ajoutées par ce dépôt, une par fichier de `locales/` (`locales/fr.json` pour le français) : `apply` ajoute ses textes au launcher, puis la force ;
- les langues que le launcher contient déjà : `en`, `ja`, `ko`, `zh_cn` et `zh_tw` dans la version actuelle. `apply` se contente de la forcer, sans rien ajouter.

Si un fichier de `locales/` porte le code d'une langue que le launcher a déjà, c'est celle du launcher qui est forcée et le fichier est ignoré.

## Fonctionnement

Le launcher est une application Electron : ses textes sont dans `resources\app.asar`, et il contient déjà l'anglais, le japonais, le coréen et les deux chinois. Il choisit la langue de Windows si elle fait partie de celles qu'il charge, sinon le japonais. Un Windows en français tombe donc sur le japonais.

`apply` :

1. refuse de continuer si le launcher est ouvert (Windows verrouille alors `app.asar`) ;
2. retrouve les deux fichiers qui portent du texte par leur contenu, car leur nom change à chaque version : la fenêtre (104 textes) et le menu de la zone de notification (2 textes) ;
3. vérifie que la langue demandée existe, avant toute écriture ;
4. sauvegarde `app.asar` d'origine en `app.asar.original`, ou repart de cette sauvegarde si le launcher est déjà modifié ;
5. écrit les textes anglais et japonais du launcher dans `source/en.json` et `source/ja.json`, sur ta machine seulement : ce sont les textes de Yostar, ils ne sont pas versionnés ;
6. ajoute la langue tirée de `locales/<code>.json` s'il s'agit d'une langue ajoutée, puis force la langue choisie, dans la fenêtre comme dans le menu ;
7. vérifie que le code modifié se lit encore (`node --check`), écrit l'archive à côté, la relit, puis la met à la place de l'originale.

Les fichiers modifiés sont ajoutés à la fin de l'archive, et tous les autres restent à leur place d'origine. `restore` remet la sauvegarde, identique à l'octet près au fichier de Yostar.

## Traduire

`locales/fr.json` associe chaque clé du launcher à son texte français. Une clé absente ou vide s'affiche en anglais. Quand une mise à jour ajoute des textes, `apply` et `status` les listent : il suffit de les ajouter au fichier et de relancer `apply`. On traduit depuis le japonais (`source/ja.json`, écrit par le premier `apply`) : l'anglais du launcher se trompe parfois. Par exemple, `message.close-confirm-title` dit « Tips » alors que le japonais (終了設定) parle du réglage de fermeture.

## Ajouter une langue

1. Lance une fois `apply` (ou `Traduire le launcher.cmd`) : il écrit `source/en.json` et `source/ja.json`, les textes du launcher avec leurs clés.
2. Crée `locales/<code>.json`, par exemple `locales/de.json` pour l'allemand ou `locales/pt-BR.json` pour le portugais du Brésil. Le nom du fichier est le code de langue : deux ou trois lettres, éventuellement suivies d'une variante (`pt-BR`, `zh_hk`).
3. Recopie les clés de `source/en.json` et traduis chaque texte. Commence par `locales/fr.json` si c'est plus simple : mêmes clés, déjà rangées.
4. `node launcher-fr.mjs status` liste les textes qui manquent encore, langue par langue. Un texte manquant s'affiche en anglais dans le launcher.
5. `node launcher-fr.mjs apply --lang de` force la nouvelle langue.

Aucune autre modification n'est nécessaire : le script lit `locales/` à chaque lancement.

## Essais

`LAUNCHER_FR_SKIP_PROCESS_CHECK=1` saute la vérification du launcher ouvert. Elle ne sert qu'à essayer le script sur une copie du dossier du launcher, pendant que le vrai tourne.
