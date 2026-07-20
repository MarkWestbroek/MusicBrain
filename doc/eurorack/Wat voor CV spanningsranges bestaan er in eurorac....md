# **Prompt:**

Wat voor CV spanningsranges bestaan er in eurorack-land?

Ik weet dat het CV voor frequentie (toonhoogte en cutoff freq van filters) wijd kan varieren tussen \-12 en \+12V (+15 in eurorack komt eigenlijk niet voor, begrijp ik).

Maar de andere voltages? PWM, FM, Q, resonance, de CV's op MI Elements, bijv. In welke range liggen die?

Het is vaak lastig te vinden. Kun jij dat eens onderzoeken?

Links:  
https://modulargrid.net/e/modules/browser?SearchName=\&SearchVendor=\&SearchFunction=5\&SearchSecondaryfunction=\&SearchSecondaryfunctionexcl=0\&SearchHeight=\&SearchTe=\&SearchTemethod=max\&SearchBuildtype=\&SearchLifecycle=\&SearchSet=all\&SearchMarketplace=\&SearchIsmodeled=0\&SearchShowothers=0\&SearchShowpanel=1\&order=tag\&direction=asc

Bijv. https://www.doepfer.de/a110.htm 

https://pichenettes.github.io/mutable-instruments-documentation/

https://pichenettes.github.io/mutable-instruments-documentation/modules/yarns/downloads/yarns\_v03.pdf

#  **Antwoord gemini**

Het klopt dat het soms een wilde westen lijkt in Eurorack-land\! Doepfer stelde in 1995 een aantal basisrichtlijnen op, maar doordat er geen keiharde internationale normcommissie over waakt, verschilt de verwachte CV-spanning nogal per merk en per type parameter.  
Toch valt het in te delen in een paar **standaard spanningsranges**, afhankelijk van wat voor signaal het is en hoe het verwerkt wordt.

### **1\. Pitch CV (Toonhoogte / Volts per Octaaf)**

* **Range:** **\-5V tot \+5V** (10 octaven) of **0V tot \+8V** / **0V tot \+10V**.  
* **Waarom:** Dit volgt de **1V/Oct** standaard.  
* **Nuance:** Je ziet inderdaad vrijwel nooit dat er \+12V gevraagd wordt, omdat de rails zelf vaak rond de \+12V/-12V zitten en de op-amps dicht tegen die voedingsspanning aan de grenzen bereiken (headroom). Met \-5V tot \+5V dek je met 10 octaven meer af dan het menselijk gehoor functioneel nodig heeft.

### **2\. Modulatie CV (PWM, FM, Cutoff, Resonance/Q, Mod-Matrix parameters)**

Voor algemene parameters (zoals de CV-inputs op Mutable Instruments Elements, of parameters als FM, Q en PWM op filters en VCO's) maken fabrikanten onderscheid tussen twee hoofdcategorieën:

#### **A. Bipolaire Modulatie (LFO's, FM, attenuverted inputs)**

* **Range:** **\-5V tot \+5V** (of soms **\-2.5V tot \+2.5V**).  
* **Werking:** Een parameter knop staat bijvoorbeeld halverwege (de *offset*). Een bipolair CV-signaal trekt de parameter zowel naar beneden (bij negatieve volt) als naar boven (bij positieve volt).  
* **Voorbeeld (PWM & FM):** Een LFO is standaard bipolair (-5V tot \+5V). Als je dit rechtstreeks in een PWM-input prikt zonder attenuator, zwaait de pulsbreedte van minimaal naar maximaal.

#### **B. Unipolaire Modulatie (Envelopes, Sequencers, Knop-vervangers)**

* **Range:** **0V tot \+5V** of **0V tot \+10V**.  
* **Werking:** Verhoogt de waarde alleen vanaf de ingestelde beginpositie.  
* **Voorbeeld (Q / Resonance):** Omdat resonantie of een hoeveelheid effect (zoals Reverb/Space op Elements) geen "negatieve" stand kent, verwachten deze ingangen intern vaak een positieve spanning tussen **0V en \+5V**.

### **3\. De CV-inputs op Mutable Instruments (o.a. Elements, Clouds, Rings)**

Emilie Gillet (de ontwikkelaar van Mutable Instruments) ontwierp haar digitale modules heel doordacht en documenteerde dit nauwkeurig:

* **Inkomende Range op Parameters:** De CV-ingangen voor parameters (zoals *Geometry*, *Brightness*, *Damping*, *Position* op Elements) verwachten/accepteren een **bereik van \-5V tot \+5V**.  
* **Interne scaling / Attenuverters:**  
  * Binnenin de code van Mutable modules worden deze spanningen omgezet naar een digitaal bereik van 0.0 tot 1.0.  
  * Wanneer er een potmeter (attenuverter) bij de CV-input zit, werkt de knop als een vermenigvuldiger. Een spanning van \-5V tot \+5V kan zo exact over de volledige range van de parameter worden geschaald.  
  * Geef je meer dan \+5V of minder dan \-5V (bijv. \+10V), dan clippen de op-amps of de ADC van de module het signaal simpelweg veilig af op de maximale digitale waarde.

### **4\. Gates, Triggers en Clocks**

* **Range:** **0V tot \+5V** (soms **0V tot \+10V**).  
* **Werking:** Dit zijn binaire (aan/uit) signalen.  
* **Tolerantie:** Vrijwel alle Eurorack-modules met een Gate-, Trigger- of Clock-input gebruiken een interne *Schmitt-trigger* of comparator. Die ziet alles boven de **\~1.5V tot 2.5V** al als een "HIGH" (AAN) en alles eronder als "LOW" (UIT).

### **Overzicht per signal type**

| Signaal Type | Gebruikelijke Range | Opmerking |
| :---- | :---- | :---- |
| **Pitch CV** | \-5V tot \+5V / 0V tot 8V | Strict 1V/Oct standaard. |
| **Audio** | \-5V tot \+5V (10Vpp) | AC-gekoppeld, beweegt rond de 0V. |
| **LFO / Bipolaire CV** | \-5V tot \+5V | Schommelt rond 0V. |
| **Envelope / Unipolair** | 0V tot \+5V of 0V tot \+10V | Start bij 0V. |
| **Gates / Triggers / Clock** | 0V tot \+5V (puls) | Schakelt bij drempelwaarde (\~2V). |
| **Digitaal (MI, Ne, etc.)** | Acceptatie: \-5V tot \+5V | Wordt intern geschaald/afgetopt. |

### **Wat gebeurt er als je de "verkeerde" range insteekt?**

In Eurorack is de hardware bijna altijd beschermd tegen over- en onderspanning binnen de railmarges (-12V tot \+12V).

* Stuur je **\+10V** in een ingang die **0V tot \+5V** verwacht? Het reageert simpelweg maximaal zodra je de \+5V passeert (saturatie/clipping).  
* Stuur je **\-5V** (van een LFO) in een ingang die alleen een positieve respons kent? De module negeert de helft van de golfvorm (het gedeelte onder de 0V), tenzij je er een offset bij optelt.

*Een attenuverter-module of offset-generator (zoals een Shades, Maths of Samara) is daarom hét hulpmiddel om elke CV-range passend te maken voor elke ingang.*

[Eurorack CV Standards](https://www.youtube.com/watch?v=_O7wKoaFl7o)  
Deze video legt duidelijk uit dat alle signalen in Eurorack in de basis gewoon spanningen zijn en hoe verschillende modules omgaan met audio, CV en modulatieranges.In de Eurorack-wereld is er helaas **geen absolute universele standaard** voor Control Voltage (CV) spanningsbereiken, wat voor ontwerpers en gebruikers soms behoorlijk verwarrend is. Doepfer heeft in de basis de richtlijnen neergezet, maar doordat fabrikanten verschillende ontwerpkeuzes maken (zoals het wel of niet ondersteunen van negatieve spanningen), verschilt de range per signaaltype en module.

### **Overzicht per CV-type**

#### **1\. Pitch / V/Oct & Cutoff (Pitch-CV)**

Zoals je zelf al opmerkte, draait dit om de 1 Volt per Octaaf ($1\\text{V/Oct}$) standaard.

* **Typisch bereik:** **$-5\\text{V}$ tot $+5\\text{V}$** (10 octaven) of **$0\\text{V}$ tot $+10\\text{V}$**.  
* **Extremen:** Sommige digitale modules of precisie-LFO's/VCO's accepteren **$-12\\text{V}$ tot $+12\\text{V}$** zonder schade, al verwerken ze meestal niet het hele bereik muzikaal.  
* *Let op:* Hoewel Eurorack voedingen op $+12\\text{V}$ en $-12\\text{V}$ draaien, kunnen de op-amps in modules spanningen dicht bij die voedingsrails (de zogenaamde *headroom*) niet altijd verwerken zonder te "clippen". Een signaal boven $+10.5\\text{V}$ of onder $-10.5\\text{V}$ wordt in veel analoge circuits simpelweg afgeplat.

#### **2\. Modulatiesignalen (LFO's, Envelopes)**

* **Unipolair (Envelopes / ADSR):** **$0\\text{V}$ tot $+8\\text{V}$** (Doepfer standaard) of **$0\\text{V}$ tot $+5\\text{V}$** / **$0\\text{V}$ tot $+10\\text{V}$**. Envelopes zijn vrijwel altijd positief.  
* **Bipolair (LFO's):** **$-5\\text{V}$ tot $+5\\text{V}$** ($\\pm 5\\text{V}$ peak-to-peak \= $10\\text{V}\_{pp}$) is de de-facto norm. Sommige LFO's leveren $\\pm 2.5\\text{V}$ of $\\pm 10\\text{V}$.

#### **3\. Parameter Control (PWM, Resonance/Q, FM-depth, Wavefolding)**

Voor algemene parameters (zoals PWM op een VCO of de Resonance op een VCF) verwerken modules de inkomende spanning vrijwel altijd via een interne attenuator of optelling met een draaiknop.

* **Invoerbereik:** Vrijwel alle modules verwachten een signaal binnen **$-5\\text{V}$ tot $+5\\text{V}$** of **$0\\text{V}$ tot $+5\\text{V}$**.  
* **Verwerking:** Interne circuits schalen dit signaal vaak terug naar een interne referentie (bijvoorbeeld $0\\text{V}$ tot $+3.3\\text{V}$ of $0\\text{V}$ tot $+5\\text{V}$ richting een microcontroller of VCA-stuurspanning).  
* Als je bijvoorbeeld $+10\\text{V}$ op een PWM-input zet die $+5\\text{V}$ verwacht voor $100\\%$ duty cycle, zal de pulsbreedte simpelweg vasthangen op de maximale waarde (of $0\\%$ afhankelijk van de polariteit).

#### **4\. Gate, Trigger & Clock**

* **Bereik:** Unipolair, **$0\\text{V}$ tot $+5\\text{V}$** (digitale standaard) of **$0\\text{V}$ tot $+10\\text{V}$** (Doepfer analoog).  
* **Drempelwaarde (Threshold):** De meeste modules zien een spanning vanaf **$+1.5\\text{V}$ tot $+2.5\\text{V}$** al als een "HIGH" (logic 1). Negatieve spanning op een trigger-input wordt simpelweg genegeerd of afgekapt via een beveiligingsdiode.

### **Specifiek: Mutable Instruments (bijv. Elements)**

Emilie Gillet (de ontwikkelaar van Mutable Instruments) heeft zeer helder gedocumenteerd hoe haar modules omgaan met spanningen. Omdat MI-modules op een STM32 ARM-processor draaien op **3.3V logica**, moeten alle analoge ingangen beveiligd en geschaald worden.  
Voor **Elements**, **Rings**, **Braids**, etc. geldt het volgende voor de ingangen:

| Ingangstype | Verwacht / Veilig bereik | Wat doet de ADC / hardware? |
| :---- | :---- | :---- |
| **V/Oct** | $-3\\text{V}$ tot $+7\\text{V}$ (10 octaven) | Wordt via op-amps geschaald en gefilterd naar het $0-3.3\\text{V}$ bereik van de interne ADC. |
| **CV-inputs** (FM, Geometry, Brightness, Damping, Space, etc.) | **$-5\\text{V}$ tot $+5\\text{V}$** | De offset-knop optellen bij de inkomende CV. Het resultaat wordt geclipt op de digitale grenzen. Spanningen buiten $-5\\text{V}/+5\\text{V}$ richten geen schade aan (beveiligd tot $\\pm 12\\text{V}$), maar het digitale bereik is verzadigd. |
| **Gate / Trigger** | $0\\text{V}$ tot $+5\\text{V}$ (drempel $\\approx \+1.5\\text{V}$) | Beschermd tegen negatieve spanningen en pieken tot $+12\\text{V}$. |

*Voorbeeld uit de MI-codebase/schematiq:* De CV-inputs op MI-modules gebruiken op-amp somatieve versterkers die een $-5\\text{V}\\text{ tot }+5\\text{V}$ ingangssignaal attenuëren naar een bereik van $0\\text{V}\\text{ tot }3.3\\text{V}$ op de ADC-pin.

### **Doepfer A-100 Standaard (Analoge referentie)**

Dieter Doepfer formuleerde de oorspronkelijke normen voor Eurorack zo:

* **Audio:** $10\\text{V}\_{pp}$ ($\\pm 5\\text{V}$)  
* **Control Voltage (Pitch):** $0\\text{V}\\text{ tot }+10\\text{V}$ (of $-5\\text{V}\\text{ tot }+5\\text{V}$)  
* **LFO:** $10\\text{V}\_{pp}$ ($\\pm 5\\text{V}$)  
* **Envelope:** $0\\text{V}\\text{ tot }+8\\text{V}$  
* **Triggers/Gates:** $0\\text{V}\\text{ tot }+8\\text{V}$ (minimale stijging om te triggeren is $+3\\text{V}$)

### **Praktische samenvatting voor (zelfbouw)ontwerp**

Als je zelf circuits of digitale modules ontwerpt voor Eurorack, kun je de volgende regels hanteren voor optimale compatibiliteit:

> 1. **Invoerbeveiliging:** Zorg dat *elke* CV-ingang bestand is tegen minimaal **$-12\\text{V}$ tot $+12\\text{V}$** zonder kapot te gaan (gebruik beveiligingsdiodes of op-amp clippers).  
> 2. **Dynamisch bereik vangen:**  
   * Voor **Pitch / V/Oct**: Accepteer een bereik van minimaal **$-3\\text{V}$ tot $+7\\text{V}$** of **$-5\\text{V}$ tot $+5\\text{V}$**.  
   * Voor **Algemene CV (PWM, Q, Morph, etc.)**: Ontwerp voor **$-5\\text{V}$ tot $+5\\text{V}$** bipoalair en **$0\\text{V}$ tot $+5\\text{V}$** unipolair. Zorg dat een interne knop als attenuator/offset werkt.  
   * Voor **Triggers/Clocks**: Maak de comparator-drempelwaarde rond **$+1.5\\text{V}\\text{ tot }+2.0\\text{V}$**, zodat zowel $+3.3\\text{V}$, $+5\\text{V}$ als $+10\\text{V}$ triggers betrouwbaar werken.

