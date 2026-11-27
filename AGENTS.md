# Launcher d'Azur Promilia en français : brief des agents

Outil qui traduit le launcher japonais (Electron) d'Azur Promilia. Le mode d'emploi et le fonctionnement sont dans `README.md`.

- On traduit depuis `source/ja.json` ; `source/en.json` aide à comprendre. Les deux sont réécrits par `apply` à chaque version du launcher : ne pas les modifier à la main. Ce sont les textes de Yostar : `source/` est ignoré par git et ne doit jamais être commité, le dépôt est public.
- Les textes français vont dans `fr.json`, mêmes clés que `source/en.json`.
- Ne jamais lancer `apply` ou `restore` sur le vrai launcher sans que Karim l'ait demandé, et jamais pendant qu'il tourne. Pour essayer, travailler sur une copie du dossier avec `LAUNCHER_FR_SKIP_PROCESS_CHECK=1`.
- Le vocabulaire du jeu suit le glossaire du dépôt voisin `azur-promilia-fr` (`fr/glossary.tsv`).
- Messages de commit en français, sans signature ni co-auteur d'assistant. Ne jamais toucher à la configuration git.
