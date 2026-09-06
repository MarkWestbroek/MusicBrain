# modlink — bedieningsvlakken koppelen

Zet een aanraakvlak op afstand om in modulatie. Een telefoon opent
`/pad-phone.html`, de klank opent zich als "host", en het doorgeefluik in de
dev-server brengt ze bij elkaar.

    telefoon ──ws──┐
    telefoon ──ws──┼── doorgeefluik (Vite-plugin) ──ws── snaarbank
    Wacom, later ──┘                                     editor, later

## Waarom CC-vormige berichten

Over de draad gaan berichten met een CC-nummer en een waarde van 0 tot 1, ook
al is het geen MIDI. Dat is een bewuste keuze: wie het doorgeefluik later
vervangt door een echte virtuele MIDI-poort op de Mac hoeft aan de pagina's
niets te veranderen. De ontvangende kant leest dan gewoon dezelfde nummers
binnen via Web MIDI.

## Nummering

Elk bedieningsvlak krijgt bij het aanmelden een plek en een eigen CC-bereik.

| Vlak | CC-bereik | Assen |
| --- | --- | --- |
| 1 | 40 t/m 45 | punt 1 X/Y, punt 2 X/Y, punt 3 X/Y |
| 2 | 46 t/m 51 | idem |
| 3 | 52 t/m 57 | idem |

De Elements-firmware gebruikt niets boven CC 32, dus deze nummers botsen niet
met de bestaande besturing. Zie `CC_BASE` en `CC_PER_SURFACE` in `relay.ts`.

## Rolverdeling

Het toestel blijft dom en stuurt alleen genummerde assen. De routering van as
naar parameter staat bij de host, op het grote scherm. De host stuurt de
gekozen bestemmingsnamen terug, zodat het toestel op zijn eigen achtergrond
kan tonen wat elke as doet en waar hij staat.

## Onderdelen

| Bestand | Rol |
| --- | --- |
| `modlink/relay.ts` | Vite-plugin met het doorgeefluik; hierin staat het wire-formaat |
| `public/modlink.js` | client zonder afhankelijkheden, voor beide kanten |
| `public/pad-phone.html` | het aanraakvlak voor de telefoon |
| `public/snaarbank-worklet.html` | eerste host, als testlab |

## Naar de editor

De snaarbank is het proeflab. Voor een modulator-tab in de MusicBrain-editor
is `public/modlink.js` het enige dat mee hoeft: dezelfde `connect()` met rol
`host`, en dan per binnenkomend CC-nummer een eigen routering. Wat daar nog
bij komt is een keuze van uitgaande MIDI-poort per bestemming, zodat de tab
telefoon- en Wacom-bewegingen als CC de deur uit stuurt in plaats van ze op
één interne klank toe te passen.
