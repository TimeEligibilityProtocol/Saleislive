# Saleis.live — Product & Implementation Blueprint

> Markdown transcript of `saleis-live-blueprint-v1.docx` (source of truth — this file is for searchability, the .docx is canonical). Status: kierunek rekomendowany do discovery, estymacji i budowy MVP.

**White-label SaaS for launching branded live sales in minutes.**

CORE PROMISE: One Excel. One photo source. One brand setup. Three clicks to publish.

- Model: multi-tenant SaaS / white-label branded storefronts
- Publiczny adres: `brand.saleis.live`
- Klient sam uruchamia i obsługuje przestrzeń bez udziału naszego zespołu
- Płatności klient podłącza i rozlicza sam; Saleis.live dostarcza integrację i rekomendacje
- Model przychodowy: stała licencja + setup + płatne rozszerzenia; bez prowizji od sprzedaży

## 1. Decyzja produktowa

**REKOMENDACJA:** Budujemy kontrolowaną platformę SaaS, nie otwarty kreator stron i nie kolejny marketplace.

Saleis.live umożliwia grupom retailowym, markom i sklepom tworzenie odrębnych, pięknych przestrzeni wyprzedażowych na jednej wspólnej infrastrukturze. Każdy storefront ma własny branding, katalog, zasady dostępu, kampanie, zamówienia i adres, ale działa na tym samym silniku produktu.

**Co platforma robi:**
- Tworzy przestrzeń marki pod adresem `brand.saleis.live`.
- Importuje produkty z jednego pliku Excel/CSV oraz zdjęć z folderu, ZIP-u, URL-i lub późniejszej integracji.
- Automatycznie waliduje, uzupełnia i porządkuje katalog.
- Pozwala wybrać bezpieczny motyw wizualny i wdrożyć brand kit bez pracy developerskiej.
- Uruchamia publiczne, prywatne, zaproszeniowe albo czasowe live sales.
- Daje klientowi admina do zarządzania produktami, kampaniami, zamówieniami i użytkownikami.

**Czego świadomie nie robimy:**
- Nie przyjmujemy pieniędzy ze sprzedaży na konto Saleis.live/Quanthio.
- Nie wypłacamy środków markom i nie stajemy się merchant of record.
- Nie pobieramy procentu od obrotu.
- Nie pozwalamy AI generować dowolnego kodu storefrontu w środowisku produkcyjnym.
- Nie budujemy w MVP pełnego odpowiednika Webflow, Shopify Theme Editor, Canvy ani Figmy.

## 2. Użytkownicy i struktura kont

| Poziom | Przykład | Uprawnienia |
|---|---|---|
| Platform owner | Saleis.live | Tenants, plany, limity, bezpieczeństwo, support, globalne szablony |
| Group account | Chalhoub / Al Tayer | Wiele marek, rynków, zespołów, wspólne raportowanie |
| Brand workspace | Marka X | Brand kit, katalog, kampanie, domeny, operator płatności |
| Campaign / live sale | Summer Private Sale | Daty, dostęp, asortyment, ceny, landing page |
| Store staff | Pracownik nietechniczny | Import, poprawki, podgląd, publikacja w ramach roli |
| Customer | Kupujący | Przeglądanie, zakup, zwrot według zasad sprzedawcy |

Każdy rekord musi posiadać `tenant_id` i `brand_id`. Dane, pliki, konfiguracje, zamówienia i dostęp jednej grupy nie mogą być widoczne dla drugiej. Role powinny obejmować co najmniej: Group Owner, Brand Admin, Merchandiser, Order Manager, Analyst i Read-only.

## 3. Najprostszy onboarding: od zera do live sale

1. Utwórz przestrzeń marki: nazwa, kraj, waluta, język, proponowany slug.
2. Dodaj logo i brand kit lub wybierz gotowy motyw.
3. Wgraj Excel/CSV i wskaż źródło zdjęć.
4. Przejrzyj raport importu oraz popraw wyłącznie pozycje oznaczone jako problematyczne.
5. Połącz własnego operatora płatności i skonfiguruj dostawę/odbiór.
6. Ustaw nazwę, dostęp, czas trwania i produkty kampanii.
7. Zobacz podgląd mobile/desktop i kliknij Publish.

**DOCELOWY STANDARD:** Pierwsza kampania bez integracji ERP: 10–20 minut pracy. Kolejna kampania z poprawnym plikiem: 3–5 minut.

### Automatyczna subdomena

Saleis.live posiada wildcard DNS `*.saleis.live`. Klient nie dotyka DNS: wybiera slug w panelu, system sprawdza dostępność i przypisuje storefront. Nazwy znanych marek wymagają ręcznej lub korporacyjnej weryfikacji, aby zapobiec podszywaniu się.

| Element | Przykład | Zasada |
|---|---|---|
| Konto grupy | chalhoub (wewnętrzne) | Widoczne w panelu; nie musi pojawiać się publicznie |
| Storefront marki | chanel.saleis.live | Slug rezerwowany po weryfikacji uprawnienia |
| Kampania | chanel.saleis.live/private-48h | Ścieżka lub własny adres kampanii |
| Własna domena | sale.brand.com | Opcja enterprise; jednorazowa zmiana DNS po stronie marki |

## 4. Import: jeden Excel, zero technicznej wiedzy

### Minimalny plik

| Pole | Wymagane | Przykład |
|---|---|---|
| SKU | Tak | CH-1024-BLK-38 |
| Product name | Tak | Leather slingback |
| Price | Tak | 2,900 AED |
| Sale price | Tak | 1,740 AED |
| Stock | Tak | 3 |
| Image | Tak* | URL albo nazwa pliku |
| Brand / category / size / colour | Opcjonalnie | AI może zasugerować |

### Zachowanie systemu przy kolejnym imporcie

- Identyfikuje produkt po SKU/variant SKU, a nie po nazwie.
- Rozróżnia: dodaj, zaktualizuj, pomiń, archiwizuj.
- Nigdy nie duplikuje produktu bez ostrzeżenia.
- Pokazuje różnice przed zatwierdzeniem: cena, stan, opis, zdjęcie, status.
- Pozwala cofnąć import i przechowuje dziennik zmian.
- Nie usuwa automatycznie produktów, które zniknęły z pliku; proponuje archiwizację zgodnie z wybraną regułą.

**RAPORT PRZED PUBLIKACJĄ (przykład):** 486 gotowych • 12 do sprawdzenia • 4 bez zdjęcia • 3 konflikty SKU • 0 zmian opublikowanych bez zgody

## 5. Moduły AI przeniesione i rozwinięte z wearto.you

AI ma skracać pracę merchandisera i poprawiać jakość danych. Nie może wymyślać faktów o produkcie ani publikować zmian bez zatwierdzenia w obszarach ryzyka.

| Moduł AI | Działanie | Kontrola |
|---|---|---|
| Catalog mapping | Rozpoznaje kolumny nawet przy różnych nazwach i mapuje je do schematu Saleis.live. | Użytkownik zatwierdza mapowanie przy pierwszym imporcie. |
| Magic Listing | Tworzy tytuł, krótki opis, cechy, kategorię i tagi z danych oraz zdjęć. | Pola oznaczone jako AI; edytowalne przed publikacją. |
| OCR & label reading | Odczytuje metki, rozmiar, skład, kod produktu i widoczny tekst. | Niska pewność trafia do kolejki review. |
| Image quality check | Wykrywa rozmycie, złą ekspozycję, duplikaty, brak produktu i niespójne proporcje. | Nie modyfikuje oryginału; pokazuje rekomendację. |
| Background & crop | Tworzy spójne tło, kadruje do 4:5 i generuje responsywne warianty. | Oryginał zachowany; zakaz usuwania widocznych wad. |
| Attribute enrichment | Proponuje kolor, materiał, fason, okazję, płeć/unisex i kolekcję. | Wartości o niskiej pewności nie publikują się automatycznie. |
| Condition / anomaly check | Dla sample/returns wykrywa potencjalne ślady, uszkodzenia lub niezgodność zdjęć. | To wsparcie kontroli, nie wiążąca ocena jakości. |
| Translation & tone | Tworzy EN/AR i utrzymuje zatwierdzony ton marki. | Glossary i zakazane sformułowania per brand. |
| Merchandising assistant | Sugeruje kolejność produktów, kolekcje, brakujące dane i bannery. | Nie zmienia cen ani stanów bez reguły i akceptacji. |
| Import anomaly detection | Wychwytuje nietypowe rabaty, ceny zerowe, skoki stocku i błędne waluty. | Blokada publikacji dla krytycznych anomalii. |

> **`Background & crop` is the one module already built and proven in wearto.you** — see `apps/api/src/routes/backgroundRemoval.ts` and `apps/marketplace/src/lib/backgroundRemoval.ts` in that repo. Known gotchas already solved there: Metro can't bundle onnxruntime-web (segmentation must run server-side), EXIF orientation must be normalized before segmentation, near-empty masks need a coverage sanity check, and the model needs ~2GB RAM (crashes on 512MB free-tier hosting).

### Zasady AI

- Każda sugestia ma confidence score i źródło: plik, zdjęcie, OCR lub wygenerowane.
- Stan, cena, SKU, polityka zwrotów i dane prawne nie mogą być „dopowiadane".
- Oryginały zdjęć i plików pozostają dostępne.
- Masowa akceptacja jest możliwa dopiero po przeglądzie próby i ustawieniu progu zaufania.
- Klient może wyłączyć poszczególne moduły AI i ustawić retencję danych.

## 6. Design: piękny, elastyczny, ale kontrolowany

**DECYZJA:** W MVP wdrażamy Theme Studio oparte na tokenach i gotowych komponentach. Nie importujemy dowolnego projektu jako niekontrolowanego kodu.

Pełna swoboda projektowa brzmi atrakcyjnie, ale oznacza problemy z mobile, dostępnością, szybkością, checkoutem i aktualizacjami. Platforma powinna dawać efekt premium bez możliwości zepsucia podstawowych przepływów.

### Trzy poziomy personalizacji

| Poziom | Dla kogo | Zakres |
|---|---|---|
| 1. Quick Brand | Każdy klient | Logo, kolory, font z bezpiecznej listy, hero, zaokrąglenia, 3–5 motywów. |
| 2. AI Brand Composer | Klient bez designera | Wgrywa logo, brand guide, 2–5 referencji lub URL. AI proponuje 2–3 warianty tokenów i layoutu wyłącznie z naszych komponentów. |
| 3. Custom Theme | Enterprise | Zatwierdzony motyw przygotowany przez klienta lub nas; wdrożony raz do bezpiecznego systemu komponentów. |

### Co AI może wygenerować bezpiecznie
- Paletę i role kolorów z kontrolą kontrastu.
- Dobór fontów z listy licencyjnej i bezpiecznych fallbacków.
- Hero oraz bannery kampanii z logo i assetami marki.
- Wariant density: editorial / minimal / high-product-density.
- Kolejność zatwierdzonych sekcji strony.
- Podgląd desktop i mobile przed aktywacją.

### Czego AI nie wdraża automatycznie
- Dowolnego HTML/CSS/JavaScript przesłanego przez klienta.
- Zmiany checkoutu, consentu, informacji prawnej i elementów bezpieczeństwa.
- Fontów bez licencji, obrazów bez praw lub logotypów bez weryfikacji.
- Projektu z Figmy 1:1 bez walidacji responsywności i mapowania na komponenty.

## 7. Canva, Figma czy własny system?

| Opcja | Najlepsze zastosowanie | Ocena dla Saleis.live |
|---|---|---|
| Własne Theme Studio | Cały storefront i spójne aktualizacje platformy. | REKOMENDOWANE jako rdzeń. |
| Canva Connect | Bannery, hero, social assets, automatyczne wypełnianie brand templates. | Dobre rozszerzenie v1.5/v2; nie buduje całego storefrontu. |
| Figma | Brand tokens i custom theme przygotowywany przez designerów enterprise. | Kanał profesjonalny; wymaga mapowania i walidacji przez dev/design. |
| Builder.io / podobne | Import Figma i generowanie responsywnych sekcji/kodu. | Możliwy akcelerator wewnętrzny lub pilot enterprise; nie dawać klientowi pełnej swobody w core commerce. |
| AI obrazowe | Tła, kadry, bannery i warianty kampanii. | Tak, z ochroną oryginałów i brand safety. |

Wniosek: klient powinien móc połączyć Canva lub przesłać eksporty/asset pack, ale Canva nie powinna kontrolować layoutu sklepu. Figma może dostarczać tokeny i zatwierdzone komponenty w usłudze Custom Theme. W MVP najprościej przyjąć logo + brand guide + referencje, a AI mapuje je na nasz ograniczony system.

## 8. Płatności: klient jest sprzedawcą i właścicielem środków

**ZASADA:** Saleis.live rekomenduje i technicznie wspiera integrację, ale klient zawiera umowę z operatorem, przechodzi KYC/KYB i otrzymuje pieniądze bezpośrednio.

### Rekomendowany model
1. Klient wybiera wspieranego operatora w Settings → Payments.
2. Loguje się lub rozpoczyna onboarding operatora w bezpiecznym procesie.
3. Klucze i sekrety są przechowywane zaszyfrowane; najlepiej przez OAuth/connected account, jeśli operator to wspiera.
4. Checkout działa we storefrontcie, lecz sprzedawcą na paragonie/wyciągu i stroną regulaminu jest klient.
5. Refund inicjuje uprawniony pracownik klienta; Saleis.live przekazuje dyspozycję do jego operatora.
6. Chargeback, podatki, fiskalizacja i polityka zwrotów pozostają odpowiedzialnością sprzedawcy, zgodnie z umową i prawem.

### Co budujemy, a czego nie

| Saleis.live dostarcza | Klient zapewnia |
|---|---|
| Adapter płatniczy, checkout, webhooki, statusy i panel konfiguracji. | Konto u operatora, dokumenty firmy, rachunek bankowy i akceptację regulaminu. |
| Listę rekomendowanych operatorów i instrukcję wdrożenia. | Wybór operatora i negocjację stawek. |
| Test integracji i alerty o błędach. | Odpowiedzialność za sprzedaż, VAT, zwroty i chargebacki. |
| Możliwość zmiany operatora przez moduł adapterów. | Opłaty operatora oraz koszty wymaganych certyfikacji. |

### Model przychodowy Saleis.live
- Jednorazowy setup/onboarding.
- Miesięczna lub roczna licencja bez względu na wykorzystanie.
- Limity według marek, rynków, adminów, aktywnych kampanii, wolumenu katalogu lub zamówień — nie procentu GMV.
- Dodatkowo płatne: custom theme, ERP/PIM/WMS, SSO, SLA, dodatkowi operatorzy i kurierzy, migracja danych.

## 9. Minimalny zakres MVP

| Obszar | MVP | Później |
|---|---|---|
| Tenancy | Grupy, marki, role, izolacja danych | Zaawansowane jednostki regionalne, delegated admin |
| Storefront | 3 motywy, brand tokens, PWA/responsive | AI Brand Composer, custom sections |
| Import | Excel/CSV, ZIP/URL zdjęć, diff i rollback | SFTP, API, ERP/PIM connectors |
| AI | Mapping, listing, OCR, zdjęcia, kategorie, anomaly check | Merchandising, kampanie, prognozy |
| Sales | Public/private/invite, start/end, stock lock | Segmenty CRM, loyalty, drops |
| Commerce | Koszyk, checkout, zamówienia, refund status | Wiele PSP, split shipment, advanced returns |
| Payments | 1 operator + adapter architecture | Kolejni operatorzy per country |
| Delivery | 1 model dostawy + pickup/manual | Kurierzy i agregatory |
| Domains | brand.saleis.live | Custom domains enterprise |
| Admin | Products, imports, sales, orders, users, settings | Advanced analytics i automations |

## 10. Architektura rekomendowana developerom

Celem jest prostota obsługi po stronie klienta i wymienialność integracji po stronie kodu. Konkretne technologie można dobrać do zespołu, ale granice modułów powinny pozostać stabilne.

| Warstwa | Odpowiedzialność |
|---|---|
| Web/PWA | Admin i storefront; responsywne obrazy; dostępność; lokalizacja EN/AR i RTL. |
| Tenant router | Rozpoznaje host/subdomenę, tenant, brand, kampanię i theme. |
| Core API | Katalog, kampanie, zamówienia, role, konfiguracja. |
| Import service | Pliki, mapowanie, walidacja, staging, diff, commit, rollback. |
| AI orchestration | Kolejki zadań, confidence, źródła, human review, koszty i limity. |
| Media pipeline | Oryginał, crop 4:5, thumbnails, WebP/AVIF, CDN i cache. |
| Commerce services | Inventory reservation, order state machine, refunds, audit log. |
| Adapters | Payments, delivery, e-mail/SMS/WhatsApp, ERP/PIM. |
| Data & security | Relacyjna baza, object storage, encryption, logs, backups, monitoring. |

### Kluczowe wzorce techniczne
- **Staging import:** plik nigdy nie zapisuje zmian bez etapu Preview → Commit.
- **Idempotency:** ponowienie importu, webhooka lub płatności nie może tworzyć duplikatu.
- **Inventory lock:** ostatnia sztuka jest rezerwowana na ograniczony czas podczas checkoutu.
- **Adapter pattern:** operator płatności i kurier nie są zaszyci w core.
- **Theme schema:** design zapisany jako tokeny i dozwolone warianty komponentów, nie dowolny kod.
- **Audit trail:** kto, kiedy i co opublikował, zmienił, usunął lub zrefundował.
- **Async jobs:** import zdjęć, OCR, generacja AI i przetwarzanie mediów działają w tle z widocznym statusem.

## 11. Bezpieczeństwo, compliance i odpowiedzialność

- Ścisła izolacja tenantów oraz testy prób dostępu między kontami.
- MFA/SSO dla administratorów enterprise; zasada least privilege.
- Szyfrowanie sekretów operatorów oraz rotacja kluczy.
- Brak danych kartowych w systemie Saleis.live; użycie tokenizacji/hosted fields operatora.
- Pełny audit log działań o skutku finansowym lub publikacyjnym.
- DPA, polityka retencji i usuwania danych; lokalizacja danych według wymogów rynku.
- Skanowanie uploadów, limity typów/rozmiarów, bezpieczne parsowanie CSV/XLSX/ZIP.
- Rate limiting, bot protection, monitoring, backup i test odtwarzania.
- Jasny podział ról prawnych: Saleis.live jako dostawca oprogramowania; klient jako sprzedawca/merchant.
- Weryfikacja praw do nazwy brandu i logo przed aktywacją rozpoznawalnej subdomeny.

## 12. Kryteria akceptacji „trzech kliknięć"

| Scenariusz | Warunek zaliczenia |
|---|---|
| Nowa marka | Pracownik tworzy brand workspace, dodaje logo i otrzymuje podgląd bez kontaktu z supportem. |
| Import 500 SKU | System mapuje kolumny, raportuje błędy i nie publikuje żadnej zmiany przed zatwierdzeniem. |
| Ponowny import | Aktualizuje istniejące SKU bez duplikatów i pokazuje pełny diff. |
| Zdjęcia | Każdy produkt ma responsywne warianty; oryginał jest zachowany; błędy mają status. |
| Design | Storefront pozostaje poprawny na 360, 390, 768, 1024 i 1440 px. |
| Subdomena | Zatwierdzony slug zaczyna działać automatycznie z HTTPS. |
| Płatność | Środki trafiają do konta klienta u jego operatora; Saleis.live otrzymuje wyłącznie status. |
| Ostatnia sztuka | Dwa równoległe checkouty nie sprzedają tej samej jednostki. |
| Wycofanie | Admin może zamknąć kampanię i cofnąć ostatni import bez ingerencji dev. |
| Audit | Każda publikacja, zmiana ceny i refund wskazuje użytkownika oraz czas. |

## 13. Kolejność budowy

1. Discovery i definicja danych: realne przykłady plików od 3 typów klientów, proces płatności, zwrotów i dostawy.
2. Design system i klikalny prototyp admina/storefrontu; test z nietechnicznymi pracownikami.
3. Fundament multi-tenant, role, brand workspace, wildcard routing i theme schema.
4. Import staging + katalog + media pipeline + podstawowe AI.
5. Kampanie, storefront, inventory lock, zamówienia i jeden operator płatności.
6. Panel operacyjny, monitoring, security review, testy wydajności i pilotaż z jedną marką.
7. Dopiero po pilotażu: AI Brand Composer, Canva, custom domains i integracje ERP/PIM.

**NIE NEGOCJOWAĆ W DÓŁ:** Automatyzacja importu, izolacja danych, płatności i inventory lock są rdzeniem. Można ograniczyć liczbę szablonów i integracji, ale nie bezpieczeństwo ani spójność danych.

## 14. Otwarte decyzje przed estymacją

- Pierwszy rynek i waluta: UAE only czy od początku multi-country?
- Pierwszy operator płatności i jego model connected accounts/API w UAE.
- Kto jest merchant of record i kto wystawia dokument sprzedaży.
- Pierwsza metoda dostawy oraz zakres zwrotów.
- Czy katalog dotyczy wyłącznie nowego excess inventory, czy także samples/returns/defects.
- Czy każda marka ma osobny operator płatności, czy operator jest wspólny dla grupy.
- Minimalny zestaw kolumn oraz trzy rzeczywiste formaty Excela do obsłużenia.
- Poziom arabskiego i RTL w MVP.
- Reguły weryfikacji nazw marek i zatwierdzania subdomen.
- Limit automatycznej obróbki zdjęć i miesięczny budżet AI per plan.

## 15. Ostateczna rekomendacja

**PRODUKT:** Saleis.live ma być najprostszą drogą od nadmiarowego inventory do kontrolowanej, markowej live sale — bez budowy kolejnego sklepu.

Najlepszy pierwszy produkt to jeden piękny, spójny system z trzema premium themes, brand tokens, inteligentnym importem i modułami AI znanymi z wearto.you. Canva może zasilać bannery i assety, a Figma może obsługiwać custom themes dla enterprise. Nie powinny jednak zastępować rdzenia design systemu ani pozwalać klientom wdrażać dowolnego kodu.

Płatności pozostają po stronie klienta: my oferujemy adapter, rekomendowany proces i test techniczny. Klient wybiera operatora, przechodzi onboarding i otrzymuje środki. Saleis.live zarabia na przewidywalnej licencji, setupie i rozszerzeniach — nie na procencie od obrotu.

---

### Źródła techniczne sprawdzone 3 sierpnia 2026
- Canva Developers — Connect APIs, Brand Templates i Autofill: https://www.canva.dev/docs/connect/
- Figma Developer Docs — REST API, components, styles i variables: https://developers.figma.com/docs/rest-api/
- Builder.io — Figma Plugin i Visual Editor AI: https://www.builder.io/c/docs/builder-figma-plugin
- Cloudflare — wildcard DNS records: https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/
