# Warsztat Gwinta

Apka (PWA) do Gwinta: kolekcja kart po polsku, 18 pełnych decków z mety po Radzie Balansu z 1.10.2026, braki w skrawkach i poradnik.

Na telefonie: otwórz stronę w Chrome → menu ⋮ → „Dodaj do ekranu głównego”. Działa offline, kolekcja zapisuje się na urządzeniu.

## Przebudowa
`src/decks.py` – definicje decków, `src/template.html` – interfejs.
```
python3 src/build_data.py cards_v12.11.0.json data.json   # baza z github.com/teddybee-r/GwentOneDB
python3 src/build_site.py
```
