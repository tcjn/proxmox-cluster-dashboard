# Propozycje zadań po przeglądzie kodu

## 1) Literówka / nazewnictwo
**Zadanie:** Poprawić nazwę pliku w dokumentacji z `proxmox-aggregator-improvements.md` na poprawną (albo usunąć odwołanie, jeśli plik nie istnieje).

**Dlaczego:** W `QUICKSTART.md` pojawia się odwołanie do pliku, którego nie ma w repozytorium. Wygląda to na literówkę lub nieaktualną nazwę artefaktu.

**Kryterium akceptacji:** W dokumentacji nie ma już błędnej nazwy pliku i wszystkie wskazane pliki istnieją.

## 2) Usunięcie błędu
**Zadanie:** Naprawić generowanie listy węzłów w `createNodesHTML`, aby renderowane były tylko istniejące węzły (`node1`, `node2`, `node3`), bez pozycji `undefined`.

**Dlaczego:** Funkcja zawsze tworzy wpisy dla `node1` i `node2`, więc klastry z pojedynczym węzłem mogą renderować błędny link (`https://undefined:8006`) oraz fałszywy status.

**Kryterium akceptacji:** Dla klastra mającego tylko `node1` UI pokazuje wyłącznie jeden węzeł, bez pustych/błędnych linków.

## 3) Korekta komentarza lub rozbieżności dokumentacyjnej
**Zadanie:** Ujednolicić dokumentację modelu danych `clusters.json` pomiędzy `README.md` i implementacją, doprecyzowując że frontend oczekuje pól `node1/node2/node3`.

**Dlaczego:** Kod renderowania opiera się o klucze `node1..node3`, a dokumentacja i przykłady mogą być interpretowane jako elastyczne listy węzłów.

**Kryterium akceptacji:** Sekcja dokumentacji o `clusters.json` jednoznacznie opisuje wymagany format i przypadki 1/2/3 węzłów.

## 4) Ulepszenie testu
**Zadanie:** Dodać test jednostkowy dla `createNodesHTML` i `createNodeHTML` (np. w Vitest/Jest + jsdom), pokrywający przypadki: 1, 2 i 3 węzły oraz brak `node2`.

**Dlaczego:** Ten obszar ma regresyjny potencjał i bez testów łatwo o ponowne wprowadzenie błędu renderowania `undefined`.

**Kryterium akceptacji:** Testy automatyczne przechodzą i wykrywają niepoprawne renderowanie węzła, gdy brakuje `node2`.
