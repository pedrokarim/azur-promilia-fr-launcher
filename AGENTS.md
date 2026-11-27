# Launcher d'Azur Promilia en français : brief des agents

Outil qui traduit le launcher japonais (Electron) d'Azur Promilia, en français par défaut, ou dans une autre langue avec `apply --lang <code>`. Le mode d'emploi et le fonctionnement sont dans `README.md`.

- On traduit depuis `source/ja.json` ; `source/en.json` aide à comprendre. Les deux sont réécrits par `apply` à chaque version du launcher : ne pas les modifier à la main. Ce sont les textes de Yostar : `source/` est ignoré par git et ne doit jamais être commité, le dépôt est public.
- Les traductions vont dans `locales/<code>.json` (`locales/fr.json` pour le français), mêmes clés que `source/en.json`. Une langue que le launcher contient déjà (`en`, `ja`, `ko`, `zh_cn`, `zh_tw`) n'a pas de fichier : `apply --lang` la force seulement.
- Ne jamais lancer `apply` ou `restore` sur le vrai launcher sans que Karim l'ait demandé, et jamais pendant qu'il tourne. Pour essayer, travailler sur une copie du dossier avec `LAUNCHER_FR_SKIP_PROCESS_CHECK=1`.
- Les `.cmd` sont en UTF-8 avec `chcp 65001`. Après cette ligne, cmd se perd dans le fichier dès qu'il rencontre un caractère accentué : les commentaires vont avant `chcp`, les commandes restent en ASCII, et les questions posées à l'utilisateur passent par le script (commande `choose`).
- Le vocabulaire du jeu suit le glossaire du dépôt voisin `azur-promilia-fr` (`fr/glossary.tsv`).
- Messages de commit en français, sans signature ni co-auteur d'assistant. Ne jamais toucher à la configuration git.
