# Front-borden — mechanische randvoorwaarden + open architectuurbesluit

**Datum:** 2026-07-09 · Context: het twee-PCB-model (generieke *riser* + horizontaal
*front-bord*) uit de "DENKFOUT"-sessie. De riser (`musicbrain-riser`) is af (DRC 0/0).
Bij het bouwen van het eerste front-bord (POT8-front) bleek de mechanische envelope
strakker dan gedacht; dit document legt de harde maten vast en het besluit dat nog
openstaat. **Niet blind dichtrouten — dit is een keuze voor Mark.**

## De harde maten (uit de footprints + spec)

- **Front-bord ligt in het vlak van het paneel** (één kolom van 20 mm breed).
- **Bruikbare hoogte achter de rails ≈ 110 mm** (niet de volle 128,5 mm paneelhoogte —
  de Eurorack-rails eten boven+onder ~9 mm elk op. Dit is precies de project-`B=110`).
- **RK09K-pot (9 mm, verticaal):**
  - courtyard **13,3 mm** in de as-richting → **steek ≥ 13,3 mm** (mijn eerste poging
    met 12 mm liet courtyards overlappen).
  - body/courtyard steekt **13,25 mm** vanaf de pinrij → op een 20 mm-brede kolom vult
    de body vrijwel de hele breedte; de 3 pinnen liggen aan één rand met daarnaast een
    **routekanaal van maar ~4,6 mm**.
- **8 pots @ 13,5 mm = 94,5 mm** as-tot-as-span. Past in 110 mm mét de MCP3208
  (bewezen: `musicbrain-pot8` is 110×80 mm, 8 pots @ 13,5 mm, volledig geroute).
- **Maar: een volledige 2×10 female socket is 22,9 mm lang.** 94,5 (pots) + ~12 (MCP)
  + 22,9 (socket) ≈ **129 mm ≫ 110 mm**. De 2×10 riser-koppeling past dus **niet
  in-lijn** als board-mount socket in de kolom.

## De kern van het probleem

De pot-body domineert de 20 mm-breedte (geen ruimte naast de kolom voor MCP of socket),
én de kolomlengte (110 mm) is net te kort voor pots + MCP + een 2×10-socket in serie.
Eén van de drie moet wijken.

## De opties (besluit nodig)

### Optie A — generieke riser + *slim* front (MCP op het front)
Houdt de zojuist gebouwde generieke riser. Vereist dat de front↔riser-koppeling **kleiner**
wordt dan 2×10, want die past niet in-lijn. Sub-keuzes:
- **A1** — riser presenteert een **subset-connector** (bv. 2×4 = alleen +3V3/GND/SCLK/
  MOSI/MISO/CS/LDAC): ~10 mm, past net (94,5+12+10 ≈ 117 → nipt te lang bij 13,5;
  wél haalbaar bij steek 12,5–13 mm, mits courtyard-overlap geaccepteerd/getrimd).
  Nadeel: riser is dan niet meer "de hele bus"; twee riser-varianten of een kleinere J2.
- **A2** — **plat IDC-lintkabeltje** i.p.v. board-mount socket: geen socket-lengte op het
  front, maar wél handwerk/soldeer en minder "plug-and-play".
- Routing: 8 wipers moeten in het 4,6 mm-kanaal langs de pinrij naar de MCP aan het
  uiteinde waaieren. Kruisingsvrij kán (Manhattan: F-verticalen genest west→oost,
  B-horizontalen; +3V3-rail op de tegenoverliggende laag), maar het is een **strak,
  fiddly blind-route**. Aanzet staat in `scratchpad/gen_pot8front.py` (nog niet schoon).

### Optie B — *slim* verticaal buskaart + *passief* front  ⟵ makkelijkst bouwbaar
De MCP3208 blijft op een **verticale buskaart** (≈ de bestaande `musicbrain-pot8`, al
DRC-schoon). Het front is **passief**: alleen 8 pots + een **kleine centrale connector**
(8 wipers + 3V3 + GND ≈ 2×6 = 14 mm). Connector **in het midden** van de kolom → 4 pots
elke kant → max 4 banen in het 4,6 mm-kanaal → **triviaal, één laag**. Past ruim
(4·13,5 + 14 + 4·13,5 ≈ 122 → met de connector-gap zit alles binnen 110 mm bruikbaar
als de pots iets asymmetrisch staan, of steek 12,5). Nadeel: **laat de generieke riser
los** voor pot/enc — die kaarten krijgen dan hun eigen (bestaande) buskaart + dom front.

## BESLUIT (Mark, 2026-07-09): **Optie B**

Optie B gekozen. Twee belangrijke verduidelijkingen uit het gesprek:

1. **8 pots alléén passen wél in ~110 mm** (@13,3 mm steek ≈ 106 mm courtyard-span, ~4 mm
   marge). Het knelpunt was nooit de pots, maar waar de MCP + connector heen gaan.
   De courtyard (13,3 mm) is bovendien conservatief; de fysieke 9 mm-pot is ~10-11 mm →
   krappere steek kan fysiek werken. **Mark test de echte minimale steek met de pots in huis.**

2. **"Slimme riser"-variant (B-voorkeur):** zet de **MCP3208 op de riser** (die staat
   verticaal in het slot en heeft daar ruimte, net als de 80 mm-kaarten), en houd het
   **front-bord puur dom** (8 pots + een compacte koppeling omlaag: plat soldeer-lintje of
   haakse connector in het ~4,6 mm zijkanaal, met 8 wipers + 3V3 + GND). Zo blijft het
   nette riser+front-model behouden; nadeel is dat de riser dan pot/enc-specifiek wordt
   (pot-riser = +MCP3208, enc-riser = +MCP23017) i.p.v. de ene generieke riser.
   Alternatief blijft: hergebruik simpelweg de bestaande `musicbrain-pot8` (110×80, MCP
   ernaast) als buskaart + een dom front met kabel — functioneel gelijk.

**Openstaand (Mark test + beslist fysiek):** exacte pot-steek + de koppelvorm (lintje vs
haakse connector) op het domme front. Daarna is het front in enkele generate→DRC-rondes af.

## Oorspronkelijke aanbeveling

**Optie B** voor bouwbaarheid en betrouwbaarheid: hergebruikt de al werkende pot8-buskaart,
de front-routing is triviaal (centrale connector), en het schaalt 1-op-1 naar ENC. De
generieke riser blijft nuttig voor eventuele écht generieke doorlussen, maar pot/enc
gebruiken 'm dan niet. **Optie A** blijft de "puurste" (alles op de bus, één generieke
riser) maar kost een subset-connector-herontwerp + een strak blind-route.

Zodra Mark kiest, is het betreffende front in een paar generate→DRC-iteraties te bouwen.
