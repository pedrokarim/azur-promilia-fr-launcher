# Launcher d'Azur Promilia en français

Traduit en français le launcher japonais d'Azur Promilia (`AZUPRO_JP_Gamelauncher`, édité par Yostar). Le jeu lui-même se traduit à part, dans le dépôt `azur-promilia-fr`.

Projet de fans, ni affilié à Manjuu ni à Yostar.

## Utilisation

Il faut [Node.js](https://nodejs.org/) 20 ou plus, rien d'autre. Télécharge ce dépôt (bouton **Code**, puis **Download ZIP**) et décompresse-le où tu veux.

1. Ferme le launcher, y compris son icône près de l'horloge.
2. Double-clique sur `Traduire le launcher.cmd`.
3. Relance le launcher.

Après une mise à jour du launcher, il repasse en japonais : refais les trois étapes. Pour revenir au launcher d'origine, double-clique sur `Restaurer le launcher.cmd`.

Le launcher est cherché dans `YostarGames\AZUPRO_JP_Gamelauncher` sur chaque disque. S'il est ailleurs, glisse son dossier sur le fichier `.cmd`, ou lance :

```sh
node launcher-fr.mjs apply "D:\YostarGames\AZUPRO_JP_Gamelauncher"
node launcher-fr.mjs status                # traduit ou non, et les textes qui manquent
node launcher-fr.mjs restore
```

## Fonctionnement

Le launcher est une application Electron : ses textes sont dans `resources\app.asar`, et il contient déjà l'anglais, le japonais, le coréen et les deux chinois. Il choisit la langue de Windows si elle fait partie de celles qu'il charge, sinon le japonais. Un Windows en français tombe donc sur le japonais.

`apply` :

1. refuse de continuer si le launcher est ouvert (Windows verrouille alors `app.asar`) ;
2. sauvegarde `app.asar` d'origine en `app.asar.original`, ou repart de cette sauvegarde si le launcher est déjà traduit ;
3. retrouve les deux fichiers qui portent du texte par leur contenu, car leur nom change à chaque version : la fenêtre (104 textes) et le menu de la zone de notification (2 textes) ;
4. écrit les textes anglais et japonais du launcher dans `source/en.json` et `source/ja.json`, sur ta machine seulement : ce sont les textes de Yostar, ils ne sont pas versionnés ;
5. ajoute le français tiré de `fr.json` et force cette langue ;
6. vérifie que le code modifié se lit encore (`node --check`), écrit l'archive à côté, la relit, puis la met à la place de l'originale.

Les fichiers modifiés sont ajoutés à la fin de l'archive, et tous les autres restent à leur place d'origine. `restore` remet la sauvegarde, identique à l'octet près au fichier de Yostar.

## Traduire

`fr.json` associe chaque clé du launcher à son texte français. Une clé absente ou vide s'affiche en anglais. Quand une mise à jour ajoute des textes, `apply` et `status` les listent : il suffit de les ajouter à `fr.json` et de relancer `apply`. On traduit depuis le japonais (`source/ja.json`, écrit par le premier `apply`) : l'anglais du launcher se trompe parfois. Par exemple, `message.close-confirm-title` dit « Tips » alors que le japonais (終了設定) parle du réglage de fermeture.

## Essais

`LAUNCHER_FR_SKIP_PROCESS_CHECK=1` saute la vérification du launcher ouvert. Elle ne sert qu'à essayer le script sur une copie du dossier du launcher, pendant que le vrai tourne.
