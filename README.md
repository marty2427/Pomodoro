# 🍅 Pomodoro

Jednoduchý a moderní Pomodoro časovač pro studium a soustředěnou práci.
Je to webová aplikace (PWA), kterou si z Chromu nainstaluješ do mobilu jako běžnou aplikaci – funguje i offline.

## Funkce

- **Tři režimy:** Soustředění (25 min), Krátká pauza (5 min), Dlouhá pauza (15 min)
- **Automatický cyklus:** po každém pomodoru krátká pauza, po 4 pomodorech dlouhá pauza
- **Jednoduché ovládání:** Spustit/Pozastavit, Restartovat, Přeskočit
- **„Na čem teď pracuješ?“** – úkol se uloží k dokončenému pomodoru
- **Upozornění na konec bloku:** zvuk, vibrace a systémové oznámení
- **Displej nezhasne**, dokud časovač běží (lze vypnout)
- **Statistiky:** dnešní počet, posledních 7 dní, dny v řadě, celkový čas, seznam dnešních bloků
- **Denní cíl** s ukazatelem postupu
- **Nastavení:** délky bloků, počet pomodor v sadě, automatické spouštění, světlý / tmavý motiv
- Časovač přežije zavření aplikace (počítá podle skutečného času, ne podle tiků)
- Na počítači klávesy: `Mezerník` = start/pauza, `R` = restart, `S` = přeskočit

## Jak Pomodoro funguje

1. Vyber si **jeden** úkol.
2. **25 minut** na něm pracuj bez vyrušení (telefon stranou, žádné zprávy).
3. Když tě něco napadne, zapiš si to a pokračuj – vyřešíš to v pauze.
4. **5 minut pauza** – vstaň, protáhni se, napij se.
5. Po **4 pomodorech** si dej **dlouhou pauzu** 15–30 minut.

Přerušené (přeskočené) pomodoro se nepočítá – restartuj ho a začni znovu.

## Nasazení na Cloudflare Pages

Aplikace je čistě statická (HTML + CSS + JS), nepotřebuje žádný build.

1. Přihlas se do [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Vyber repozitář `Pomodoro` a větev.
3. Nastavení buildu:
   - **Framework preset:** None
   - **Build command:** *(prázdné)*
   - **Build output directory:** `/`
4. **Save and Deploy.** Dostaneš adresu typu `https://pomodoro-xxx.pages.dev` (můžeš připojit i vlastní doménu).

Soubor `_headers` zajistí, že se service worker vždy načte v aktuální verzi.

## Instalace do mobilu (Android + Chrome)

1. Otevři adresu aplikace v **Google Chrome**.
2. Klepni na **⋮** (vpravo nahoře) → **Přidat na plochu** / **Instalovat aplikaci**.
3. Aplikace se objeví na ploše a spouští se na celou obrazovku bez lišty prohlížeče.

Na iPhonu: Safari → Sdílet → **Přidat na plochu**.

**Tip:** V nastavení aplikace zapni **Oznámení**, ať tě upozorní na konec bloku, i když máš otevřené něco jiného.
Android může při delším zamčení displeje uspat aplikace na pozadí – nejspolehlivější je nechat aplikaci otevřenou
(volba „Nechat displej zapnutý“). Čas se ale nikdy nerozhodí: po návratu vždy ukáže správný stav.

## Aktualizace

Po úpravě souborů zvyš verzi cache v `sw.js` (`pomodoro-v1` → `pomodoro-v2`).

## Soubory

| Soubor | Popis |
| --- | --- |
| `index.html` | Struktura aplikace |
| `styles.css` | Vzhled (tmavý i světlý motiv) |
| `app.js` | Logika časovače, statistiky, nastavení |
| `sw.js` | Service worker – offline režim a oznámení |
| `manifest.webmanifest` | Údaje pro instalaci jako aplikace |
| `icons/` | Ikony aplikace |
| `_headers` | Hlavičky pro Cloudflare Pages |
