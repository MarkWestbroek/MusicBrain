"""MusicBrain VCF8-kern (rev 0.1) - 8-stemmige multimode VCF-kernkaart.

Poly-analog-spoor (doc/poly-analog-spec.md, VCF8 + B3/B7/B10). Staande
kernkaart (kernslot-contract v1.1, B7) achter de VCF8-backbone. 110x92,
4-laags, DUBBELZIJDIG bestukt (besluit 2026-07-21: passieven-helft op B.Cu
via JLC PCBA; SSI2140 blijft top = zelf solderen), passieven 0603.

Kern (per stem, 8x):
  SSI2140 4-pole cascade (datasheet Fig 3, SSOP-20). Correcte pinout (agent-
  geverifieerd 2026-07-20, buildspec pins 1-6 waren verwisseld):
  IN1(6)->gm1->OUT1(4)->IN2(3)->gm2->OUT2(1)->IN3(19)->gm3->OUT3(17)->
  IN4(16)->gm4->OUT4(14). Per trap 15k serie-in + 15k feedback + 200R shunt
  + 1nF C0G op CAPx. Q VCA OUT (pin9, stroom) direct op IN1-knoop =
  resonantie om de hele keten (SSM2040-karakter). Elke cel inverteert ->
  pole-mix-tekens gratis.

  Pole-mixing (Fig 20 + AN701 Table 1): 5 taps E0=AINB (gebufferde ingang),
  E1..E4 = OUT1..OUT4. 8 modes via passieve gewogen-som-ster per mode ->
  4051 (MODE0..2-select) -> uitgangsbuffer. R_ref = 75k (Fig-20 RF);
  gewicht w -> R = 75k/w. Passieve normalisatie egaliseert modeniveaus.

CV:
  cutoff = 2x AD5754 (daisy op CS, 16-bit, ADR421-ref) -> 54.9k -> EXPO(pin7),
  1k pin7->GND, pin8 open (tempco uit, B10-tuning); FMCV (kernslot pin5) sumt
  via 100k op EXPO. Q = DAC128S085 (octaal 12-bit, 0-3V3) -> 13k -> QCTRL(12);
  input-gain-Q-comp (Fig 14): AINB -> 16.2k -> QVCAIN(13), 1k pin13->GND.

Tune (B10): OUT4 van elke stem -> 4051 (TSEL0..2) -> LM311 comparator ->
  open-drain TOUT (backbone pull-up); TEN geografisch via 2N7002 op de
  emitter (TEN hoog = deze kaart drijft TOUT).

Audio: J2 IN / J3 UIT 1x10 (jack8-contract, 1=GND 2-9=CH 10=GND).
DNP-trimvoetjes: (rev 0.1) niet in v0.1 gelegd - firmware centreert de
DAC-ranges; per-stem instelpots bewust weggelaten (B10-trimmerbeleid).

Doel deze sessie: ERC 0 + netcheck OK + 0 courtyard-overlappen. Routing volgt.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schlib import (Sch, conn_symbol, conn1_symbol, box_symbol, R_SYM, C_SYM,
                    CP_SYM, FLAG_SYM, power_symbol)
from cardlib import Board

OUT_DIR = r"d:\Git\Muziek\MusicBrain\hardware\schematics\musicbrain-vcf8kern"
os.makedirs(OUT_DIR, exist_ok=True)
DATE = "2026-07-20"
REV = "0.1"

POWER = {'GND', '+12V', '-12V', '+3V3'}

# ---- kernslot-contract v1.1 (poly-analog-spec B7) ----
KERNSLOT = {
    1: 'GND',    2: '+12V',
    3: 'GND',    4: '-12V',
    5: 'FMCV',   6: '+3V3',
    7: 'SCLK',   8: 'GND',
    9: 'SDIN',   10: 'SDO',
    11: 'CS',    12: 'LDAC',
    13: 'SCLK2', 14: 'SDIN2',
    15: 'SDO2',  16: 'CS2',
    17: 'MODE0', 18: 'MODE1',
    19: 'MODE2', 20: 'TSEL0',
    21: 'TSEL1', 22: 'TSEL2',
    23: 'TEN',   24: 'TOUT',
}

# ---- pole-mixing modes (AN701 Table 1); tap 0=E0(AINB) 1..4=OUT1..OUT4 ----
# tap-zuinig 8-mode menu (=spec ~15-R-budget): 4 progressieve LP-hellingen +
# 2HP + 2/4-pole BP + notch. 15 mix-R/stem.
MODES = [
    ("4LP",   {4: 1}),
    ("3LP",   {3: 1}),
    ("2LP",   {2: 1}),
    ("1LP",   {1: 1}),
    ("2HP",   {0: 1, 1: 2, 2: 1}),
    ("BP2",   {1: 1, 2: 1}),
    ("BP4",   {2: 1, 3: 2, 4: 1}),
    ("NOTCH", {0: 1, 1: 2, 2: 2}),
]
W2R = {1: '75k', 2: '37.4k', 4: '18.7k', 6: '12.4k'}
TAPNAME = {0: 'AINB', 1: 'OUT1', 2: 'OUT2', 3: 'OUT3', 4: 'OUT4'}


def Vn(name, k):
    return f"{name}{k}"


def MN(k, m):
    return f"MN{k}_{m}"


# ================= netmaps (gedeeld door schema + PCB) =================
def ssi_nm(k):
    return {'1': Vn('OUT2', k), '2': Vn('CAP2', k), '3': Vn('IN2', k),
            '4': Vn('OUT1', k), '5': Vn('CAP1', k), '6': Vn('IN1', k),
            '7': Vn('EXPO', k), '8': None, '9': Vn('IN1', k), '10': 'GND',
            '11': '-12V', '12': Vn('QCTRL', k), '13': Vn('QVCAIN', k),
            '14': Vn('OUT4', k), '15': Vn('CAP4', k), '16': Vn('IN4', k),
            '17': Vn('OUT3', k), '18': Vn('CAP3', k), '19': Vn('IN3', k),
            '20': '+12V'}


def mux_nm(k):
    # 74HC4051: Y0=13 Y1=14 Y2=15 Y3=12 Y4=1 Y5=5 Y6=2 Y7=4; Z=3; S0=11 S1=10 S2=9
    return {'1': MN(k, 4), '2': MN(k, 6), '3': Vn('MOUT', k), '4': MN(k, 7),
            '5': MN(k, 5), '6': 'GND', '7': '-12V', '8': 'GND', '9': 'MODE2',
            '10': 'MODE1', '11': 'MODE0', '12': MN(k, 3), '13': MN(k, 0),
            '14': MN(k, 1), '15': MN(k, 2), '16': '+3V3'}


def tune_nm():
    # Y-pinnen GEOGRAFISCH (routing-TODO 2026-07-21): linker fysieke pinnen
    # (1/2/4/5) = helft-L (stem 1-4), rechter (15/14/13/12) = helft-R (stem
    # 5-8); bovenste rijen = bovenste stemmen. TSEL->stem is firmware-
    # flexibel; resulterende tabel (TSEL-code n = Yn -> stem):
    # Y0=6 Y1=7 Y2=5 Y3=8 Y4=1 Y5=4 Y6=3 Y7=2  (zie README).
    o = lambda k: Vn('OUT4', k)
    return {'1': o(1), '2': o(3), '3': 'TCOM', '4': o(2), '5': o(4), '6': 'GND',
            '7': '-12V', '8': 'GND', '9': 'TSEL2', '10': 'TSEL1', '11': 'TSEL0',
            '12': o(8), '13': o(6), '14': o(7), '15': o(5), '16': '+3V3'}


def ad_nm(cA, cB, cC, cD, sdin, sdo):
    return {'1': '-12V', '2': None, '3': cA, '4': cB, '5': '+3V3', '6': None,
            '7': 'CS', '8': 'SCLK', '9': sdin, '10': 'LDAC', '11': 'CLR',
            '12': None, '13': None, '14': '+3V3', '15': 'GND', '16': sdo,
            '17': 'VREF', '18': 'GND', '19': 'GND', '20': 'GND', '21': 'GND',
            '22': cD, '23': cC, '24': '+12V', '25': '-12V'}


def dac_nm():
    return {'1': 'SDIN2', '2': 'SDO2', '3': 'VQ1', '4': 'VQ2', '5': 'VQ3',
            '6': 'VQ4', '7': '+3V3', '8': '+3V3', '9': '+3V3', '10': 'GND',
            '11': 'VQ8', '12': 'VQ7', '13': 'VQ6', '14': 'VQ5', '15': 'CS2',
            '16': 'SCLK2'}


ADR_NM = {'2': '+12V', '4': 'GND', '8': 'VREF'}
LM311_NM = {'1': 'TG', '2': 'TIN', '3': 'GND', '4': '-12V', '5': None,
            '6': None, '7': 'TOUT', '8': '+12V'}
Q1_NM = {'1': 'TEN', '2': 'GND', '3': 'TG'}


def opa_pair_nm(v1, v2):
    """1 TL074 bedient 2 naburige stemmen (elk 2 kanalen: in-buffer +
    uit-buffer) -> de 074 staat tussen zijn 2 stem-tiles (Marks efficiency).
    amp1=v1-in (follower), amp2=v1-uit (gain), amp3=v2-in, amp4=v2-uit."""
    return {'4': '+12V', '11': '-12V',
            '3': Vn('DIV', v1), '2': Vn('AINB', v1), '1': Vn('AINB', v1),
            '5': Vn('MOUT', v1), '6': Vn('FB', v1), '7': Vn('AOUT', v1),
            '10': Vn('DIV', v2), '9': Vn('AINB', v2), '8': Vn('AINB', v2),
            '12': Vn('MOUT', v2), '13': Vn('FB', v2), '14': Vn('AOUT', v2)}


OPA_AUX_NM = {'4': '+12V', '11': '-12V',
              '3': 'FMCV', '2': 'FMCVB', '1': 'FMCVB',
              '5': 'GND', '6': 'SPARE1', '7': 'SPARE1',
              '10': 'GND', '9': 'SPARE2', '8': 'SPARE2',
              '12': 'GND', '13': 'SPARE3', '14': 'SPARE3'}


def voice_passives(k):
    """Alle passieven van stem k als (ref, 'R'/'C', waarde, netA, netB)."""
    P = []
    a = P.append
    # serie-in (stage1 vanuit AINB, 2..4 vanuit vorige OUTx)
    a((f'R{k}01', 'R', '15k', Vn('AINB', k), Vn('IN1', k)))
    a((f'R{k}02', 'R', '15k', Vn('OUT1', k), Vn('IN2', k)))
    a((f'R{k}03', 'R', '15k', Vn('OUT2', k), Vn('IN3', k)))
    a((f'R{k}04', 'R', '15k', Vn('OUT3', k), Vn('IN4', k)))
    # feedback (eigen OUTx -> eigen INx-knoop)
    a((f'R{k}05', 'R', '15k', Vn('OUT1', k), Vn('IN1', k)))
    a((f'R{k}06', 'R', '15k', Vn('OUT2', k), Vn('IN2', k)))
    a((f'R{k}07', 'R', '15k', Vn('OUT3', k), Vn('IN3', k)))
    a((f'R{k}08', 'R', '15k', Vn('OUT4', k), Vn('IN4', k)))
    # 200R shunts
    a((f'R{k}09', 'R', '200R', Vn('IN1', k), 'GND'))
    a((f'R{k}10', 'R', '200R', Vn('IN2', k), 'GND'))
    a((f'R{k}11', 'R', '200R', Vn('IN3', k), 'GND'))
    a((f'R{k}12', 'R', '200R', Vn('IN4', k), 'GND'))
    # integrator-caps 1nF C0G
    a((f'C{k}01', 'C', '1n', Vn('CAP1', k), 'GND'))
    a((f'C{k}02', 'C', '1n', Vn('CAP2', k), 'GND'))
    a((f'C{k}03', 'C', '1n', Vn('CAP3', k), 'GND'))
    a((f'C{k}04', 'C', '1n', Vn('CAP4', k), 'GND'))
    # EXPO-drive
    a((f'R{k}13', 'R', '54.9k', Vn('VCUT', k), Vn('EXPO', k)))
    a((f'R{k}14', 'R', '1k', Vn('EXPO', k), 'GND'))
    a((f'R{k}15', 'R', '100k', 'FMCVB', Vn('EXPO', k)))
    # Q-drive + input-gain-comp
    a((f'R{k}16', 'R', '13k', Vn('VQ', k), Vn('QCTRL', k)))
    a((f'R{k}17', 'R', '16.2k', Vn('AINB', k), Vn('QVCAIN', k)))
    a((f'R{k}18', 'R', '1k', Vn('QVCAIN', k), 'GND'))
    # ingangsbuffer-deler (~/5) + uitgangsbuffer-gain (~x5)
    a((f'R{k}19', 'R', '75k', Vn('AIN', k), Vn('DIV', k)))
    a((f'R{k}20', 'R', '18.7k', Vn('DIV', k), 'GND'))
    a((f'R{k}21', 'R', '15k', Vn('FB', k), 'GND'))
    a((f'R{k}22', 'R', '60.4k', Vn('AOUT', k), Vn('FB', k)))
    # ontkoppeling
    a((f'C{k}05', 'C', '100n', '+12V', 'GND'))
    a((f'C{k}06', 'C', '100n', '-12V', 'GND'))
    a((f'C{k}07', 'C', '100n', '+3V3', 'GND'))   # 4051 VDD
    # pole-mix-ster (per mode)
    ri = 30
    for m, (_nm, wts) in enumerate(MODES):
        for tap, w in wts.items():
            a((f'R{k}{ri:02d}', 'R', W2R[w], Vn(TAPNAME[tap], k), MN(k, m)))
            ri += 1
    return P


SHARED_PASSIVES = [
    ('R901', 'R', '10k', 'CLR', '+3V3'),          # AD5754 CLR-pullup
    ('R902', 'R', '1M', 'TIN', 'GND'),            # comparator bias
    ('R903', 'R', '1M', 'TOUT', 'TIN'),           # comparator hysterese
    ('C915', 'C', '10n', 'TCOM', 'TIN'),          # tune AC-koppel
    # ontkoppeling AD5754 x2 + DAC + ADR + refs
    ('C901', 'C', '100n', '+12V', 'GND'), ('C902', 'C', '100n', '-12V', 'GND'),
    ('C903', 'C', '100n', '+3V3', 'GND'),
    ('C904', 'C', '100n', '+12V', 'GND'), ('C905', 'C', '100n', '-12V', 'GND'),
    ('C906', 'C', '100n', '+3V3', 'GND'),
    ('C907', 'C', '100n', 'VREF', 'GND'), ('C908', 'C', '100n', '+12V', 'GND'),
    ('C909', 'C', '100n', '+3V3', 'GND'),         # DAC VA
    ('C916', 'C', '100n', '+12V', 'GND'), ('C917', 'C', '100n', '-12V', 'GND'),
    # opamp-ontkoppeling (5x TL074)
    ('C920', 'C', '100n', '+12V', 'GND'), ('C921', 'C', '100n', '-12V', 'GND'),
    ('C922', 'C', '100n', '+12V', 'GND'), ('C923', 'C', '100n', '-12V', 'GND'),
    ('C924', 'C', '100n', '+12V', 'GND'), ('C925', 'C', '100n', '-12V', 'GND'),
    ('C926', 'C', '100n', '+12V', 'GND'), ('C927', 'C', '100n', '-12V', 'GND'),
    ('C928', 'C', '100n', '+12V', 'GND'), ('C929', 'C', '100n', '-12V', 'GND'),
    # bulk per rail
    ('C911', 'CP', '10u', '+12V', 'GND'), ('C912', 'CP', '10u', '-12V', 'GND'),
    ('C913', 'CP', '10u', '+3V3', 'GND'), ('C914', 'CP', '10u', 'VREF', 'GND'),
]

# ---- symbool-pinlijsten (box_symbol) ----
SSI_L = [("1", "OUT2", "output"), ("2", "CAP2", "passive"), ("3", "IN2", "input"),
         ("4", "OUT1", "output"), ("5", "CAP1", "passive"), ("6", "IN1", "input"),
         ("7", "EXPO", "input"), ("8", "TEMPCO", "passive"),
         ("9", "QVCAOUT", "output"), ("10", "GND", "power_in")]
SSI_R = [("20", "V+", "power_in"), ("19", "IN3", "input"), ("18", "CAP3", "passive"),
         ("17", "OUT3", "output"), ("16", "IN4", "input"), ("15", "CAP4", "passive"),
         ("14", "OUT4", "output"), ("13", "QVCAIN", "input"),
         ("12", "QCTRL", "input"), ("11", "V-", "power_in")]
MUX_L = [("1", "Y4", "passive"), ("2", "Y6", "passive"), ("3", "Z", "passive"),
         ("4", "Y7", "passive"), ("5", "Y5", "passive"), ("6", "~{INH}", "input"),
         ("7", "VEE", "power_in"), ("8", "VSS", "power_in")]
MUX_R = [("16", "VDD", "power_in"), ("15", "Y2", "passive"), ("14", "Y1", "passive"),
         ("13", "Y0", "passive"), ("12", "Y3", "passive"), ("11", "S0", "input"),
         ("10", "S1", "input"), ("9", "S2", "input")]
AD_L = [("1", "AVSS", "power_in"), ("2", "NC", "no_connect"), ("3", "VOUTA", "output"),
        ("4", "VOUTB", "output"), ("5", "BIN", "input"), ("6", "NC", "no_connect"),
        ("7", "~{SYNC}", "input"), ("8", "SCLK", "input"), ("9", "SDIN", "input"),
        ("10", "~{LDAC}", "input"), ("11", "~{CLR}", "input"), ("12", "NC", "no_connect"),
        ("25", "EP", "passive")]
AD_R = [("24", "AVDD", "power_in"), ("23", "VOUTC", "output"), ("22", "VOUTD", "output"),
        ("21", "SGND", "power_in"), ("20", "SGND", "power_in"), ("19", "SGND", "power_in"),
        ("18", "SGND", "power_in"), ("17", "REFIN", "input"), ("16", "SDO", "output"),
        ("15", "DGND", "power_in"), ("14", "DVCC", "power_in"), ("13", "NC", "no_connect")]
DAC_L = [("1", "DIN", "input"), ("2", "DOUT", "output"), ("3", "VOUTA", "output"),
         ("4", "VOUTB", "output"), ("5", "VOUTC", "output"), ("6", "VOUTD", "output"),
         ("7", "VA", "power_in"), ("8", "VREF1", "input")]
DAC_R = [("16", "SCLK", "input"), ("15", "~{SYNC}", "input"), ("14", "VOUTE", "output"),
         ("13", "VOUTF", "output"), ("12", "VOUTG", "output"), ("11", "VOUTH", "output"),
         ("10", "GND", "power_in"), ("9", "VREF2", "input")]
LM_L = [("1", "EMIT", "output"), ("2", "IN+", "input"), ("3", "IN-", "input"),
        ("4", "V-", "power_in")]
LM_R = [("8", "V+", "power_in"), ("7", "OUT", "output"), ("6", "STRB", "input"),
        ("5", "BAL", "passive")]
TL_L = [("1", "OUT1", "output"), ("2", "IN1-", "input"), ("3", "IN1+", "input"),
        ("4", "V+", "power_in"), ("5", "IN2+", "input"), ("6", "IN2-", "input"),
        ("7", "OUT2", "output")]
TL_R = [("14", "OUT4", "output"), ("13", "IN4-", "input"), ("12", "IN4+", "input"),
        ("11", "V-", "power_in"), ("10", "IN3+", "input"), ("9", "IN3-", "input"),
        ("8", "OUT3", "output")]
ADR_L = [("2", "VIN", "power_in"), ("4", "GND", "power_in")]
ADR_R = [("8", "VOUT", "output")]
Q_L = [("1", "G", "input"), ("2", "S", "passive")]
Q_R = [("3", "D", "passive")]


SSOP20_FP = "Package_SO:SSOP-20_3.9x8.7mm_P0.635mm"
MUX_FP = "Package_SO:TSSOP-16_4.4x5mm_P0.65mm"
AD_FP = "Package_SO:HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm"
DAC_FP = "Package_SO:TSSOP-16_4.4x5mm_P0.65mm"
LM_FP = "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm"
TL_FP = "Package_SO:TSSOP-14_4.4x5mm_P0.65mm"
ADR_FP = "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm"
Q_FP = "Package_TO_SOT_SMD:SOT-23"

# ================= HIERARCHISCH SCHEMA =================
# Root + gedeelde IO/DAC-pagina + 1 gepagineerde pagina per stem. Alles
# verbonden via GLOBALE labels (vlakke netnamen = kale PCB-netten) + power-
# symbolen. Elke stempagina toont zijn SSI2140 + gegroepeerde, bedrade
# passieven; de 7 andere stemmen zijn identiek (alleen andere ref/net-suffix).
import schlib_hier as SH

ROOT_UUID = "efc80000-0000-4000-8000-000000000000"
PROJ = "musicbrain-vcf8kern"
SHEET_UUID = {'io': "efc80000-0000-4000-8000-0000000000a0",
              **{f'v{k}': f"efc80000-0000-4000-8000-0000000000a{k}" for k in range(1, 9)}}
FILE_UUID = {'io': "efc80000-0000-4000-8000-0000000000b0",
             **{f'v{k}': f"efc80000-0000-4000-8000-0000000000b{k}" for k in range(1, 9)}}
SFILE = {'io': "musicbrain-vcf8kern-io.kicad_sch",
         **{f'v{k}': f"musicbrain-vcf8kern-voice{k}.kicad_sch" for k in range(1, 9)}}

LIBS_COMMON = [R_SYM, C_SYM, CP_SYM, FLAG_SYM,
               power_symbol("GND", False), power_symbol("+3V3", True),
               power_symbol("+12V", True), power_symbol("-12V", False)]
LIB = {'SSI': box_symbol("SSI2140", SSI_L, SSI_R),
       'MUX': box_symbol("HC4051", MUX_L, MUX_R),
       'AD': box_symbol("AD5754", AD_L, AD_R, width=20.32),
       'DAC': box_symbol("DAC128S085", DAC_L, DAC_R),
       'LM': box_symbol("LM311", LM_L, LM_R),
       'TL': box_symbol("TL074", TL_L, TL_R),
       'ADR': box_symbol("ADR421", ADR_L, ADR_R),
       'Q': box_symbol("2N7002", Q_L, Q_R),
       'C2x12': conn_symbol("Conn_02x12", 12),
       'C1x10': conn1_symbol("Conn_01x10", 10)}
FPS = {'SSI': SSOP20_FP, 'MUX': MUX_FP, 'AD': AD_FP, 'DAC': DAC_FP,
       'LM': LM_FP, 'TL': TL_FP, 'ADR': ADR_FP, 'Q': Q_FP}


def ebox(d, key, ref, val, left, right, ux, uy, nmap, width=17.78):
    d.comp(f"Custom:{box_symbol_name(key)}", ref, val, ux, uy, 0, FPS[key])
    for num, (px, py, side) in SH.box_pins(left, right, ux, uy, width).items():
        net = nmap.get(num)
        dx = -3.2 if side == 'L' else 3.2
        if net is None:
            d.nc(px, py)
        else:
            d.wire(px, py, px + dx, py)
            d.pin_term(px + dx, py, net, rot=(0 if side == 'L' else 180))


def box_symbol_name(key):
    return {'SSI': 'SSI2140', 'MUX': 'HC4051', 'AD': 'AD5754', 'DAC': 'DAC128S085',
            'LM': 'LM311', 'TL': 'TL074', 'ADR': 'ADR421', 'Q': '2N7002'}[key]


def epass(d, ref, kind, val, na, nb, x, y):
    if kind == 'C':
        d.res_h(ref, val, x, y, na, nb, lib="Device:C",
                fp="Capacitor_SMD:C_0603_1608Metric")
    elif kind == 'CP':
        d.res_h(ref, val, x, y, na, nb, lib="Device:C_Polarized",
                fp="Capacitor_SMD:CP_Elec_4x5.3")
    else:
        d.res_h(ref, val, x, y, na, nb)


def voice_sheet(k):
    """Bedraad stem-schema (TD-12-stijl): echte lijnen voor de lokale
    subcircuits (gm-trap-knopen, caps, expo, Q, pole-mix->mux); globale labels
    alleen voor de tap-bus (AINB, OUT1..OUT4) en cross-pagina-netten."""
    d = SH.Doc(FILE_UUID[f'v{k}'], PROJ, f"MusicBrain VCF8-kern - stem {k}", REV,
               DATE, 2 + k, root_uuid=ROOT_UUID, sheet_uuid=SHEET_UUID[f'v{k}'])
    d.libs = [LIB['SSI'], LIB['MUX']] + LIBS_COMMON
    UX, UY = 150.0, 118.0
    d.comp("Custom:SSI2140", f"U{k}", "SSI2140", UX, UY, 0, SSOP20_FP)
    Pn = SH.box_pins(SSI_L, SSI_R, UX, UY)
    d.nc(*Pn['8'][:2])                 # TEMPCO open (tempco uit, B10-tuning)

    def pin(n):
        px, py, _s = Pn[str(n)]
        return px, py

    def nodex(px, py, sgn):            # knoop-x, gestaggerd per rij-pariteit
        i = int(round((py - (UY - 11.43)) / 2.54))
        return px + sgn * (6 + (i % 2) * 5)

    def T(name):                       # tap-net van deze stem
        return Vn(name, k)
    gnc = []                           # GND-knopen te bundelen

    # OUT-taps benoemen (pole-mix-bus + cross-page voor OUT4->tune)
    for opin, tap, sd in ((4, 'OUT1', 'L'), (1, 'OUT2', 'L'),
                          (17, 'OUT3', 'R'), (14, 'OUT4', 'R')):
        px, py = pin(opin)
        ex = px + (-4 if sd == 'L' else 4)
        d.wire(px, py, ex, py)
        d.glabel(T(tap), ex, py, rot=(0 if sd == 'L' else 180), shape='output')

    # gm-trappen: node = INx-pin; series (van vorige tap) + feedback (eigen OUT)
    #  + 200R shunt naar GND + 1nF cap op CAPx. Stage1 krijgt ook QVCAOUT.
    STAGES = [  # (in_pin, cap_pin, Rser, ser_tap, Rfb, fb_tap, Rsh, Ccap, side, colx)
        (6, 5, f'R{k}01', T('AINB'), f'R{k}05', T('OUT1'), f'R{k}09', f'C{k}01', 'L', 118),
        (3, 2, f'R{k}02', T('OUT1'), f'R{k}06', T('OUT2'), f'R{k}10', f'C{k}02', 'L', 96),
        (19, 18, f'R{k}03', T('OUT2'), f'R{k}07', T('OUT3'), f'R{k}11', f'C{k}03', 'R', 184),
        (16, 15, f'R{k}04', T('OUT3'), f'R{k}08', T('OUT4'), f'R{k}12', f'C{k}04', 'R', 206),
    ]
    GNDL, GNDR = 96.0, 204.0
    for (ip, cp, Rser, stap, Rfb, ftap, Rsh, Ccap, side, colx) in STAGES:
        sgn = -1 if side == 'L' else 1
        ix, iy = pin(ip)
        nx = nodex(ix, iy, sgn)
        d.wire(ix, iy, nx, iy); d.junction(nx, iy)
        d.glabel({6: T('IN1'), 3: T('IN2'), 19: T('IN3'), 16: T('IN4')}[ip],
                 nx, iy, rot=(180 if side == 'L' else 0))
        rr = 90 if side == 'L' else 270
        tapx = colx + sgn * 12
        # series R (pin1=tap, pin2=node)
        p1, p2 = d.R2(Rser, '15k', colx, iy, rot=rr)
        d.wjog(p2, (nx, iy)); d.wire(p1[0], p1[1], tapx, iy)
        d.glabel(stap, tapx, iy, rot=(0 if side == 'L' else 180))
        # feedback R (pin1=own OUT tap, pin2=node), 1 rij naar de OUT-pin toe
        oy = iy - 2.54 * sgn * 0 - 3.0     # net boven/onder de IN-rij
        p1, p2 = d.R2(Rfb, '15k', colx, iy - 3.0, rot=rr)
        d.wjog(p2, (nx, iy), jx=nx)
        d.wire(p1[0], p1[1], tapx, iy - 3.0)
        d.glabel(ftap, tapx, iy - 3.0, rot=(0 if side == 'L' else 180))
        # shunt 200R (pin1=node, pin2=GND) rot omgekeerd -> pin1 richting chip
        rr2 = 270 if side == 'L' else 90
        p1, p2 = d.R2(Rsh, '200R', colx, iy + 3.0, rot=rr2)
        d.wjog(p1, (nx, iy), jx=nx)
        gnd_x = GNDL if side == 'L' else GNDR
        d.wire(p2[0], p2[1], gnd_x, p2[1]); gnc.append((gnd_x, p2[1]))
        # cap 1nF (pin1=CAPx-pin, pin2=GND)
        cx, cy = pin(cp)
        cnx = nodex(cx, cy, sgn)
        d.wire(cx, cy, cnx, cy)
        d.glabel({5: T('CAP1'), 2: T('CAP2'), 18: T('CAP3'), 15: T('CAP4')}[cp],
                 cnx, cy, rot=(180 if side == 'L' else 0))
        p1, p2 = d.C2(Ccap, '1n', colx, cy, rot=rr2)
        d.wjog(p1, (cnx, cy), jx=cnx)
        d.wire(p2[0], p2[1], gnd_x, p2[1]); gnc.append((gnd_x, p2[1]))

    # QVCAOUT(9) -> IN1-knoop (zelfde net): jog links langs de knopenkolom
    qx, qy = pin(9)
    n1 = nodex(pin(6)[0], pin(6)[1], -1), pin(6)[1]
    d.wjog((qx, qy), n1, jx=n1[0] - 4)

    # EXPO(7): VCUT -[54.9k]- EXPO -[1k]- GND ; FMCVB -[100k]- EXPO
    ex, ey = pin(7)
    enx = nodex(ex, ey, -1)
    d.wire(ex, ey, enx, ey); d.junction(enx, ey)
    d.glabel(T('EXPO'), enx, ey, rot=180)
    p1, p2 = d.R2(f'R{k}13', '54.9k', 122, ey + 4, rot=90)   # VCUT->EXPO
    d.wjog(p2, (enx, ey)); d.wire(p1[0], p1[1], 108, ey + 4)
    d.glabel(T('VCUT'), 108, ey + 4, rot=0)
    p1, p2 = d.R2(f'R{k}15', '100k', 122, ey + 7, rot=90)    # FMCVB->EXPO
    d.wjog(p2, (enx, ey), jx=enx); d.wire(p1[0], p1[1], 108, ey + 7)
    d.glabel('FMCVB', 108, ey + 7, rot=0)
    p1, p2 = d.R2(f'R{k}14', '1k', 122, ey + 10, rot=270)    # EXPO->GND
    d.wjog(p1, (enx, ey), jx=enx)
    d.wire(p2[0], p2[1], GNDL, p2[1]); gnc.append((GNDL, p2[1]))

    # Q: VQ -[13k]- QCTRL(12) ; AINB -[16.2k]- QVCAIN(13) -[1k]- GND
    qcx, qcy = pin(12)
    qnx = nodex(qcx, qcy, 1)
    d.wire(qcx, qcy, qnx, qcy); d.glabel(T('QCTRL'), qnx, qcy, rot=0)
    p1, p2 = d.R2(f'R{k}16', '13k', 178, qcy, rot=270)       # VQ->QCTRL
    d.wjog(p2, (qnx, qcy)); d.wire(p1[0], p1[1], 190, qcy)
    d.glabel(T('VQ'), 190, qcy, rot=180)
    qvx, qvy = pin(13)
    qvnx = nodex(qvx, qvy, 1)
    d.wire(qvx, qvy, qvnx, qvy); d.junction(qvnx, qvy)
    d.glabel(T('QVCAIN'), qvnx, qvy, rot=0)
    p1, p2 = d.R2(f'R{k}17', '16.2k', 184, qvy - 3, rot=270)  # AINB->QVCAIN
    d.wjog(p2, (qvnx, qvy), jx=qvnx); d.wire(p1[0], p1[1], 196, qvy - 3)
    d.glabel(T('AINB'), 196, qvy - 3, rot=180)
    p1, p2 = d.R2(f'R{k}18', '1k', 184, qvy + 3, rot=90)      # QVCAIN->GND
    d.wjog(p1, (qvnx, qvy), jx=qvnx)
    d.wire(p2[0], p2[1], GNDR, p2[1]); gnc.append((GNDR, p2[1]))

    # power: V+(20)=+12V, V-(11)=-12V, GND(10)
    vpx, vpy = pin(20); d.wire(vpx, vpy, vpx + 5, vpy)
    d.pin_term(vpx + 5, vpy, '+12V', rot=180)
    vmx, vmy = pin(11); d.wire(vmx, vmy, vmx + 5, vmy)
    d.pin_term(vmx + 5, vmy, '-12V', rot=180)
    gx, gy = pin(10); gnc.append((GNDL, gy)); d.wire(gx, gy, GNDL, gy)
    # GND-rails bundelen
    dl = [p for p in gnc if abs(p[0] - GNDL) < 0.1]
    dr = [p for p in gnc if abs(p[0] - GNDR) < 0.1]
    if dl:
        d.rail(dl, GNDL - 4, 'GND')
    if dr:
        d.rail(dr, GNDR + 4, 'GND')

    # ---- pole-mix-som-ster + mode-mux ----
    # Matrix: elke mode-R staat tussen een tap (pin1, links) en zijn MN-knoop
    # (pin2, rechts). De 4051 Y-pinnen dragen dezelfde MN-namen (via ebox),
    # dus mode-R -> MN -> mux is verbonden. MODE0..2 kiest de mode -> MOUT.
    ebox(d, 'MUX', f"U1{k}", "74HC4051", MUX_L, MUX_R, 300, 118, mux_nm(k))
    Mp = SH.box_pins(MUX_L, MUX_R, 300, 118)
    ri = 30
    for m, (_nm, wts) in enumerate(MODES):
        for tap, w in wts.items():
            ryy = 88 + (ri - 30) * 4.4
            p1, p2 = d.R2(f'R{k}{ri:02d}', W2R[w], 236, ryy, rot=90)
            d.wire(p1[0], p1[1], 228, ryy)
            d.glabel(T(TAPNAME[tap]), 228, ryy, rot=0)
            d.wire(p2[0], p2[1], 246, ryy)
            d.glabel(MN(k, m), 246, ryy, rot=180)
            ri += 1
    d.text("pole-mix som-ster (75k/w): tap -> R -> MN -> 4051 Y", 224, 84, size=1.0)
    # MOUT (Z, pin3) -> cross-page (uitgangsbuffer op IO)
    zx, zy, _s = Mp['3']; d.wire(zx, zy, zx - 5, zy)
    d.glabel(T('MOUT'), zx - 5, zy, rot=0, shape='output')

    d.text(f"STEM {k} - SSI2140 4-pole cascade (Fig 3) + pole-mixing (Fig 20/AN701).", 60, 40)
    d.text("Signaalketen via de tap-bus AINB/OUT1..OUT4 (globale labels); de lokale", 60, 44)
    d.text("subcircuits (gm-trap-knopen, caps, EXPO, Q, pole-mix) zijn met lijnen bedraad.", 60, 47.5)
    d.write(OUT_DIR + "\\" + SFILE[f'v{k}'])


def io_sheet():
    d = SH.Doc(FILE_UUID['io'], PROJ, "MusicBrain VCF8-kern - in/uit + DACs + buffers",
               REV, DATE, 2, root_uuid=ROOT_UUID, sheet_uuid=SHEET_UUID['io'])
    d.libs = [LIB['AD'], LIB['ADR'], LIB['DAC'], LIB['TL'], LIB['MUX'], LIB['LM'],
              LIB['Q'], LIB['C1x10']] + LIBS_COMMON
    d.text("IN/UIT + DACs + buffers. Audio in/uit = jack8-contract (1=GND,2-9=stem,10=GND).", 25, 24)
    d.text("cutoff: MOSI->U31.SDIN->ADAISY->U32.SDIN->SDO (2x AD5754 daisy, CS+LDAC gedeeld).", 25, 28)
    d.text("Q: DAC128S085 op de 2e SPI (SCLK2/SDIN2/CS2). buffers: in /5, uit x5, FMCV, tune.", 25, 31.5)

    # audio-connectoren
    def econn1x10(ref, name, jx, jy, pins):
        d.comp("Custom:Conn_01x10", ref, name, jx, jy, 0, "")
        for i in range(10):
            y = jy - 11.43 + 2.54 * i
            d.wire(jx - 7.62, y, jx - 11.5, y); d.pin_term(jx - 11.5, y, pins[i])
    econn1x10("J2", "AUDIO IN", 40, 60, ["GND"] + [f"AIN{k}" for k in range(1, 9)] + ["GND"])
    econn1x10("J3", "AUDIO UIT", 40, 100, ["GND"] + [f"AOUT{k}" for k in range(1, 9)] + ["GND"])

    ebox(d, 'AD', "U31", "AD5754BREZ", AD_L, AD_R, 90, 60,
         ad_nm('VCUT1', 'VCUT2', 'VCUT3', 'VCUT4', 'SDIN', 'ADAISY'), width=20.32)
    ebox(d, 'AD', "U32", "AD5754BREZ", AD_L, AD_R, 150, 60,
         ad_nm('VCUT5', 'VCUT6', 'VCUT7', 'VCUT8', 'ADAISY', 'SDO'), width=20.32)
    ebox(d, 'ADR', "U33", "ADR421", ADR_L, ADR_R, 200, 60, ADR_NM)
    ebox(d, 'DAC', "U34", "DAC128S085CIMTX", DAC_L, DAC_R, 240, 60, dac_nm())
    ebox(d, 'TL', "U21", "TL074", TL_L, TL_R, 90, 120, opa_pair_nm(1, 2))
    ebox(d, 'TL', "U22", "TL074", TL_L, TL_R, 140, 120, opa_pair_nm(3, 4))
    ebox(d, 'TL', "U23", "TL074", TL_L, TL_R, 190, 120, opa_pair_nm(5, 6))
    ebox(d, 'TL', "U24", "TL074", TL_L, TL_R, 240, 120, opa_pair_nm(7, 8))
    ebox(d, 'TL', "U25", "TL074", TL_L, TL_R, 290, 120, OPA_AUX_NM)
    ebox(d, 'MUX', "U35", "74HC4051", MUX_L, MUX_R, 320, 60, tune_nm())
    ebox(d, 'LM', "U36", "LM311", LM_L, LM_R, 360, 60, LM311_NM)
    ebox(d, 'Q', "Q1", "2N7002", Q_L, Q_R, 360, 95, Q1_NM)

    # per-stem buffer-steun (in-deler R19/20, uit-gain R21/22) + ontkoppeling
    # (C05-07) horen bij de buffers -> op deze pagina, in een raster.
    iopass = list(SHARED_PASSIVES)
    bref = lambda k: {f'R{k}19', f'R{k}20', f'R{k}21', f'R{k}22',
                      f'C{k}05', f'C{k}06', f'C{k}07'}
    for k in range(1, 9):
        iopass += [r for r in voice_passives(k) if r[0] in bref(k)]
    d.text("gedeelde passieven + per-stem buffer-steun (R19/20 in-deler, "
           "R21/22 uit-gain) + ontkoppeling", 25, 165, size=1.0)
    for j, (ref, kind, val, na, nb) in enumerate(iopass):
        gx = 25 + (j % 14) * 21
        gy = 172 + (j // 14) * 11
        epass(d, ref, kind, val, na, nb, gx, gy)
    d.write(OUT_DIR + "\\" + SFILE['io'])


def root_sheet():
    d = SH.Doc(ROOT_UUID, PROJ, "MusicBrain VCF8-kern (rev 0.1)", REV, DATE, 1,
               ("Kernkaart 110x70, kernslot-contract v1.1 (poly-analog-spec B7)",
                "8x SSI2140 cascade + pole-mixing (Fig20/AN701) - 1 pagina per stem",
                "cutoff 2x AD5754 daisy; Q DAC128S085; tune LM311+4051; audio jack8"))
    d.libs = [LIB['C2x12']] + LIBS_COMMON
    # kernslot J1 (2x12), pinnen naar globale labels/power
    jx, jy = 60, 90
    d.comp("Custom:Conn_02x12", "J1", "KERNSLOT (2x12)", jx, jy, 0, "")
    for q in range(1, 25):
        row = (q - 1) // 2
        west = (q % 2 == 1)
        y = jy - 13.97 + 2.54 * row
        x = jx + (-7.62 if west else 7.62)
        xe = jx + (-12.0 if west else 12.0)
        d.wire(x, y, xe, y)
        d.pin_term(xe, y, KERNSLOT[q], rot=(0 if west else 180))
    # PWR_FLAGs
    for i, rail in enumerate(("+12V", "-12V", "+3V3", "GND")):
        x1 = 40 + 12 * i
        d.wire(x1, 130, x1, 134); d.power(rail, x1, 134,
                                          rot=(0 if rail.startswith('+') else 180))
        d.flag(x1, 130)
    # sheet-symbolen (io + 8 stemmen)
    d.sheet("in-uit-DACs", SFILE['io'], 110, 45, 45, 20, ROOT_UUID, SHEET_UUID['io'], 2)
    for k in range(1, 9):
        col = (k - 1) % 4
        rr = (k - 1) // 4
        d.sheet(f"stem{k}", SFILE[f'v{k}'], 110 + col * 55, 80 + rr * 35,
                45, 20, ROOT_UUID, SHEET_UUID[f'v{k}'], 2 + k)
    d.text("VCF8-kern: root. Zie de pagina's 'stem1..8' (identiek, andere ref/net) en", 25, 25)
    d.text("'in-uit-DACs'. Netten verbinden via GLOBALE labels (= kale PCB-netnamen).", 25, 28.5)
    d.write(OUT_DIR + "\\" + PROJ + ".kicad_sch")


def build_schematic():
    root_sheet()
    io_sheet()
    for k in range(1, 9):
        voice_sheet(k)


build_schematic()


# ================= PCB =================
def build_nets():
    n = ['', '+12V', '-12V', '+3V3', 'GND']
    ctrl = ['SCLK', 'SDIN', 'SDO', 'CS', 'LDAC', 'SCLK2', 'SDIN2', 'SDO2', 'CS2',
            'FMCV', 'FMCVB', 'MODE0', 'MODE1', 'MODE2', 'TSEL0', 'TSEL1', 'TSEL2',
            'TEN', 'TOUT', 'ADAISY', 'CLR', 'VREF', 'TCOM', 'TIN', 'TG',
            'SPARE1', 'SPARE2', 'SPARE3']
    n += list(ctrl)
    for k in range(1, 9):
        pv = ['AIN', 'AINB', 'DIV', 'IN1', 'IN2', 'IN3', 'IN4', 'OUT1', 'OUT2',
              'OUT3', 'OUT4', 'CAP1', 'CAP2', 'CAP3', 'CAP4', 'EXPO', 'QCTRL',
              'QVCAIN', 'VCUT', 'VQ', 'MOUT', 'AOUT', 'FB']
        n += [f'{p}{k}' for p in pv]
        n += [f'MN{k}_{m}' for m in range(8)]
    return n


NETS = build_nets()
BX0, BY0, BX1, BY1 = 100.0, 100.0, 210.0, 192.0     # 110 x 92 (dieper: tile-layout)
CX = (BX0 + BX1) / 2                                 # 155
b = Board("MusicBrain VCF8-kern - 8x multimode VCF", REV,
          (155.0, 176.0, 0), BX0, BY0, BX1, BY1, NETS, DATE)   # silk vrij van conns
b.silk_name = 'vcf8kern'
b.paper = "A3"
# 4-laags (audio: scheiding + betere aarding): In1+In2 = massieve GND-planes,
# F+B vrij voor signaal+voeding. GND-zones op ALLE 4 lagen (2026-07-21): met
# --keep-gnd bleef GND een 196-pins freerouting-net -> plateau ~300 unrouted
# (GND+rails-residu). Nu: GND volledig uit de DSN (standaard prep-strip),
# F/B-zones + planes + gnd_stitch/gnd_bridge verbinden de GND-pads (zoals de
# 2-laags borden); freerouting legt alleen signalen + de 3 voedingsrails.
b.copper = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu']
b.gnd_zone_layers = None    # None = zones op alle koperlagen
# strakkere zone-vulling (bordminimum is 0.15 sinds de smalle afmaak-routes):
# bereikt GND-pads in de dichte tiles die 0.3/0.2 liet liggen
b.zone_clearance = 0.2
b.zone_min_thickness = 0.15


def bnm(m):
    return b.nm({p: n for p, n in m.items() if n is not None})


# footprint (relpath, lib_id)
FP = {
    'SSI': ('Package_SO.pretty\\SSOP-20_3.9x8.7mm_P0.635mm.kicad_mod', SSOP20_FP),
    'MUX': ('Package_SO.pretty\\TSSOP-16_4.4x5mm_P0.65mm.kicad_mod', MUX_FP),
    'AD': ('Package_SO.pretty\\HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm.kicad_mod', AD_FP),
    'DAC': ('Package_SO.pretty\\TSSOP-16_4.4x5mm_P0.65mm.kicad_mod', DAC_FP),
    'LM': ('Package_SO.pretty\\SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod', LM_FP),
    'TL': ('Package_SO.pretty\\TSSOP-14_4.4x5mm_P0.65mm.kicad_mod', TL_FP),
    'ADR': ('Package_SO.pretty\\SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod', ADR_FP),
    'Q': ('Package_TO_SOT_SMD.pretty\\SOT-23.kicad_mod', Q_FP),
    'R': ('Resistor_SMD.pretty\\R_0603_1608Metric.kicad_mod',
          'Resistor_SMD:R_0603_1608Metric'),
    'C': ('Capacitor_SMD.pretty\\C_0603_1608Metric.kicad_mod',
          'Capacitor_SMD:C_0603_1608Metric'),
    'CP': ('Capacitor_SMD.pretty\\CP_Elec_4x5.3.kicad_mod',
           'Capacitor_SMD:CP_Elec_4x5.3'),
}

# --- connectoren ---
HDR_BUS = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_2x12_P2.54mm_Horizontal.kicad_mod',
           'Connector_PinHeader_2.54mm:PinHeader_2x12_P2.54mm_Horizontal')
HDR_1x10 = ('Connector_PinHeader_2.54mm.pretty\\PinHeader_1x10_P2.54mm_Vertical.kicad_mod',
            'Connector_PinHeader_2.54mm:PinHeader_1x10_P2.54mm_Vertical')

# courtyard-maten (X,Y bij rot 0) - gemeten uit de .kicad_mod's 2026-07-20
CY = {'SSI': (6.9, 9.3), 'MUX': (7.7, 5.5), 'AD': (7.8, 8.3), 'DAC': (7.7, 5.5),
      'LM': (7.4, 5.4), 'TL': (7.7, 5.5), 'ADR': (7.4, 5.4), 'Q': (3.86, 3.4),
      'R': (2.96, 1.46), 'C': (2.96, 1.46), 'CP': (6.7, 4.8),
      'J1': (14.86, 31.48), 'J2': (3.54, 26.40), 'J3': (3.54, 26.40)}
OBST = []      # (x0,y0,x1,y1) courtyards van vaste footprints (0.25 marge), F-zijde
OBST_B = []    # idem B-zijde (THT-connectors steken door beide zijden)


def _bb(w, h, x, y, rot, m=0.0):
    if rot % 180:
        w, h = h, w
    return (x - w / 2 - m, y - h / 2 - m, x + w / 2 + m, y + h / 2 + m)


def _inter(a, c):
    return not (a[2] <= c[0] or c[2] <= a[0] or a[3] <= c[1] or c[3] <= a[1])


def place(key, ref, val, x, y, rot, nmap):
    b.fp(*FP[key], ref, val, x, y, rot, bnm(nmap))
    w, h = CY[key]
    OBST.append(_bb(w, h, x, y, rot, 0.25))


def place_conn(fp, ref, val, place_x, place_y, rot, real_cx, real_cy, w, h, nmap):
    """Headers hebben een pin-1-anker (niet-gecentreerd). place_x/y = de
    anker-plaatsing; real_cx/cy + (w,h) = de ECHTE courtyard-bbox voor OBST.
    THT: pinnen steken door -> blokkeert ook de B-zijde."""
    b.fp(*fp, ref, val, place_x, place_y, rot, nmap)
    bb = (real_cx - w / 2 - 0.3, real_cy - h / 2 - 0.3,
          real_cx + w / 2 + 0.3, real_cy + h / 2 + 0.3)
    OBST.append(bb)
    OBST_B.append(bb)


# ---- KERNSLOT onderaan (SPI-entry, midden) ----
J1_MAP = b.nm({str(q): net for q, net in KERNSLOT.items()})
place_conn(HDR_BUS, 'J1', 'KERNSLOT', CX + 13.97, BY1 - 6.58, 270,
           155.0, BY1 - 0.92, 31.48, 14.86, J1_MAP)


def audio_map(pfx):
    m = {'1': 'GND', '10': 'GND'}
    for k in range(1, 9):
        m[str(k + 1)] = Vn(pfx, k)
    return b.nm(m)


# Audio = verticale 1x10 op de bovenrand (van bovenaf geplugd, keepout eronder)
def place_audio(ref, val, cx, pfx):
    b.fp(*HDR_1x10, ref, val, cx - 11.43, 102.0, 90, audio_map(pfx))
    OBST.append((cx - 14.0, 99.7, cx + 14.0, 111.0))
    OBST_B.append((cx - 14.0, 99.7, cx + 14.0, 111.0))    # THT


place_audio('J2', 'AUDIO IN', 128.0, 'AIN')
place_audio('J3', 'AUDIO UIT', 182.0, 'AOUT')

# ---- MIDDEN-RUGGEGRAAT (SPI-spine): 2x AD5754 (helft-L/R) + DAC128(Q) +
#      ref + tune-mux + comparator + aux-074. SPI komt van de kernslot omhoog. ----
place('AD', 'U31', 'AD5754BREZ', 155.0, 116.0, 0,
      ad_nm('VCUT1', 'VCUT2', 'VCUT3', 'VCUT4', 'SDIN', 'ADAISY'))   # -> helft L
place('AD', 'U32', 'AD5754BREZ', 155.0, 127.0, 0,
      ad_nm('VCUT5', 'VCUT6', 'VCUT7', 'VCUT8', 'ADAISY', 'SDO'))    # -> helft R
place('DAC', 'U34', 'DAC128S085CIMTX', 155.0, 138.0, 0, dac_nm())
place('DAC', 'U35', '74HC4051', 155.0, 147.0, 0, tune_nm())         # tune-mux
place('ADR', 'U33', 'ADR421', 149.0, 155.0, 0, ADR_NM)
place('LM', 'U36', 'LM311', 161.0, 155.0, 0, LM311_NM)
place('Q', 'Q1', '2N7002', 149.0, 162.0, 0, Q1_NM)
place('TL', 'U25', 'TL074', 158.0, 164.0, 0, OPA_AUX_NM)            # FMCV/tune-buffer

# ---- 8 STEMMEN in 4 kolommen (2 per helft), gespiegeld om de spine.
# Kolom (van boven naar onder): SSI-A / 4051-A / 074(paar) / 4051-B / SSI-B.
# 074 tussen de 2 stemmen; 4051 tussen SSI en 074 (Marks sketch). ----
COLS = [(112.0, 1, 2, 'U21'), (135.0, 3, 4, 'U22'),
        (175.0, 5, 6, 'U23'), (198.0, 7, 8, 'U24')]
VCELL = {}
for (cx, vA, vB, o74) in COLS:
    place('SSI', f'U{vA}', 'SSI2140', cx, 116.0, 0, ssi_nm(vA))
    place('MUX', f'U1{vA}', '74HC4051', cx, 130.0, 0, mux_nm(vA))
    place('TL', o74, 'TL074', cx, 143.0, 0, opa_pair_nm(vA, vB))
    place('MUX', f'U1{vB}', '74HC4051', cx, 156.0, 0, mux_nm(vB))
    place('SSI', f'U{vB}', 'SSI2140', cx, 170.0, 0, ssi_nm(vB))
    VCELL[vA] = (cx - 11.5, 108.0, cx + 11.5, 138.0)   # stem A: rond SSI-A/4051-A
    VCELL[vB] = (cx - 11.5, 148.0, cx + 11.5, 178.0)   # stem B: rond 4051-B/SSI-B

# bulk-elco's (CP): onderrand-hoeken (naast de kernslot)
CP_XY = {'C911': (106.0, 180.0), 'C912': (114.0, 180.0),
         'C913': (196.0, 180.0), 'C914': (204.0, 180.0)}
for cref, (cx, cy) in CP_XY.items():
    OBST.append(_bb(*CY['CP'], cx, cy, 0, 0.25))
OBST.append((138.0, 174.0, 172.0, 178.0))              # silk-strook (155,176)

# ---- passieven-placer: DUBBELZIJDIG (besluit Mark 2026-07-21). De tiles
# waren met 44 0603's/stem enkelzijdig onrouteerbaar (freerouting-plateau
# ~130 unrouted). Split per stem: cascade-kern (R01-R18 + C01-C04, 22 st.)
# blijft op F.Cu bij de SSI; pole-mix-ster (R30-R44), buffer-steun (R19-R22)
# en ontkoppeling (C05-C07) gaan naar B.Cu recht onder de eigen tile
# (bottom = JLC PCBA; SSI blijft top = handsoldeer). ----
def build_cells(obst):
    # Rasterspek 3.7 x 2.2 (2026-07-21, was 3.3 x 1.7): tussen buurpassieven
    # moet een 0.25-spoor + 2x 0.2 clearance passen (0.65 mm koperruimte;
    # binnenlagen zijn GND-planes, dus F/B moeten door de clusters heen).
    # Bij 3.3/1.7 waren de clusters ondoordringbare muren -> freerouting-
    # plateau ~225; ruimte is er zat (~180 van ~500 cellen per zijde nodig).
    cells = []
    gx = 101.9
    while gx <= 208.1:
        gy = 101.2
        while gy <= 190.8:
            cb = (gx - 1.55, gy - 0.78, gx + 1.55, gy + 0.78)
            if (cb[0] >= 100.5 and cb[2] <= 209.5 and cb[1] >= 100.5
                    and cb[3] <= 191.5 and not any(_inter(cb, o) for o in obst)):
                cells.append([gx, gy, False])
            gy += 2.2
        gx += 3.7
    return cells


def take_region(cells, x0, y0, x1, y1, n):
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    idx = [i for i in range(len(cells)) if not cells[i][2]
           and x0 <= cells[i][0] <= x1 and y0 <= cells[i][1] <= y1]
    idx.sort(key=lambda i: (cells[i][0] - xc) ** 2 + (cells[i][1] - yc) ** 2)
    out = idx[:n]
    for i in out:
        cells[i][2] = True
    return [(cells[i][0], cells[i][1]) for i in out]


def take_near(cells, xc, yc, n):
    idx = sorted((i for i in range(len(cells)) if not cells[i][2]),
                 key=lambda i: (cells[i][0] - xc) ** 2 + (cells[i][1] - yc) ** 2)
    out = idx[:n]
    for i in out:
        cells[i][2] = True
    return [(cells[i][0], cells[i][1]) for i in out]


def put_pass(ref, kind, val, na, nb, x, y, bottom=False, rot=0):
    b.fp(*FP['CP' if kind == 'CP' else kind], ref, val, x, y, rot,
         b.rc(na, nb), flip=bottom)


# ---- stem-passieven: NET-BEWUST naast de eigen pin (v3, 2026-07-21).
# Grid-clusters (ook met ruime steek) hielden freerouting op een plateau;
# de winnende vorm: elk onderdeel in een rij naast zijn IC-pin, met de
# pin-net-pad naar het IC gericht (rot 180 waar nodig). Top: cascade + CV
# in 2 kolommen naast de SSI (kolommen x = +-5.5/+-8.8, rijen 1.7);
# bottom: mode-ster onder de mux-Y-pinnen (links m=4/6/7/5, rechts
# m=3/0/1/2 - zelfde geografie als mux_nm), buffer-steun + ontkoppeling
# onder de TL074. Stem B spiegelt zijn SSI-rijen omhoog (silk/CP-ruimte).
LEFT_ROWS = [['C02'], ['R02', 'R06'], ['R10'], ['C01'],
             ['R01', 'R05'], ['R09'], ['R13', 'R15'], ['R14']]
RIGHT_ROWS = [['R03', 'R07'], ['R11'], ['C03'], ['R04', 'R08'],
              ['R12'], ['C04'], ['R16', 'R17'], ['R18']]
ICN_NA = {'R09', 'R10', 'R11', 'R12', 'C01', 'C02', 'C03', 'C04', 'R14', 'R18'}


def _mode_refs(k):
    out, ri = {}, 30
    for m, (_nm, wts) in enumerate(MODES):
        out[m] = [f'R{k}{ri + j:02d}' for j in range(len(wts))]
        ri += len(wts)
    return out


def place_voice_passives(k, cx, top):
    ssi_y, mux_y = (116.0, 130.0) if top else (170.0, 156.0)
    pv = {p[0]: p for p in voice_passives(k)}
    out = []                        # (ref, x, y, bottom, rot)

    def stack(rows, sgn, y0, refs_pfx=True, bottom=False, icn_na=None):
        for i, row in enumerate(rows):
            for j, short in enumerate(row):
                ref = f'{short[0]}{k}{short[1:]}' if refs_pfx else short
                x = cx + sgn * (5.5 + j * 3.3)
                y = y0 + i * 1.7
                na_side = (icn_na is not None and short in icn_na)
                # pin-net-pad naar het IC: links (IC op +x) nb->rot0;
                # rechts (IC op -x) nb->rot180
                icnb = not na_side
                rot = (0 if icnb else 180) if sgn < 0 else (180 if icnb else 0)
                out.append((ref, x, y, bottom, rot))

    # SSI-stacks (top). Stem B: rijen omhoog gespiegeld (start -7.6 -> +...).
    y0 = ssi_y - 4.2 if top else ssi_y - 7.6
    stack(LEFT_ROWS, -1, y0, icn_na=ICN_NA)
    stack(RIGHT_ROWS, +1, y0, icn_na=ICN_NA)
    # mode-ster (bottom, onder de mux): links Y4/Y6/Y7/Y5, rechts Y3/Y0/Y1/Y2
    mr = _mode_refs(k)
    lmode = [[mr[4][0], mr[4][1]], [mr[4][2]], [mr[6][0], mr[6][1]],
             [mr[6][2]], [mr[7][0], mr[7][1]], [mr[7][2]],
             [mr[5][0], mr[5][1]]]
    rmode = [[mr[3][0]], [mr[0][0]], [mr[1][0]], [mr[2][0]]]
    stack(lmode, -1, mux_y - 4.2, refs_pfx=False, bottom=True)
    stack(rmode, +1, mux_y - 2.55, refs_pfx=False, bottom=True)
    # mode-R rot: nb=MN naar de mux -> links rot0, rechts rot180 (= default
    # via icnb=True in stack())
    # buffer-steun + ontkoppeling (bottom, onder de TL074-band)
    buf = [f'R{k}19', f'R{k}20', f'R{k}21', f'R{k}22',
           f'C{k}05', f'C{k}06', f'C{k}07']
    y0b = 138.0 if top else 144.8
    for i, ref in enumerate(buf):
        out.append((ref, cx - 1.7 + (i % 2) * 3.4, y0b + (i // 2) * 1.7,
                    True, 0))
    return [(pv[ref], x, y, bot, rot) for (ref, x, y, bot, rot) in out]


VOICE_PLACE = []
for (cx, vA, vB, _o74) in COLS:
    VOICE_PLACE += place_voice_passives(vA, cx, True)
    VOICE_PLACE += place_voice_passives(vB, cx, False)
for ((ref, kind, val, na, nb), x, y, bot, rot) in VOICE_PLACE:
    (OBST_B if bot else OBST).append(_bb(2.96, 1.46, x, y, 0, 0.25))
    put_pass(ref, kind, val, na, nb, x, y, bottom=bot, rot=rot)

# shared passieven: ontkoppel-100n's naar B.Cu onder de spine; de signaal-
# passieven (CLR-pullup, tune-bias/hysterese/AC-koppel) top bij hun IC's;
# CP-elco's (top-only, hoog) op de vaste hoekplekken. Rasters NA de
# expliciete stem-plaatsing bouwen (OBST/OBST_B zijn dan compleet).
CELLS_T = build_cells(OBST)
CELLS_B = build_cells(OBST_B)
sh_small = [p for p in SHARED_PASSIVES if p[1] != 'CP']
sh_top = [p for p in sh_small if p[0] in ('R901', 'R902', 'R903', 'C915')]
sh_bot = [p for p in sh_small if p[0] not in ('R901', 'R902', 'R903', 'C915')]
for (ref, kind, val, na, nb), (px, py) in zip(
        sh_top, take_near(CELLS_T, CX, 152.0, len(sh_top))):
    put_pass(ref, kind, val, na, nb, px, py)
sh_cells_b = take_region(CELLS_B, 143.0, 108.0, 167.0, 172.0, len(sh_bot))
if len(sh_cells_b) < len(sh_bot):
    sh_cells_b += take_near(CELLS_B, CX, 140.0, len(sh_bot) - len(sh_cells_b))
for (ref, kind, val, na, nb), (px, py) in zip(sh_bot, sh_cells_b):
    put_pass(ref, kind, val, na, nb, px, py, bottom=True)
for (ref, kind, val, na, nb) in [p for p in SHARED_PASSIVES if p[1] == 'CP']:
    put_pass(ref, kind, val, na, nb, *CP_XY[ref])

print(f"cellen F: {len(CELLS_T)} (gebruikt {sum(1 for c in CELLS_T if c[2])}), "
      f"B: {len(CELLS_B)} (gebruikt {sum(1 for c in CELLS_B if c[2])})")

# GND-hechtvia's EERST (hoeken/randen + eiland-via's uit gnd_stitch.json):
# de afmaker moet ze kennen — anders routeert hij eroverheen (MODE0-short +
# hole-to-hole-regen, 2026-07-21) en missen zijn via<->pad-joins de ankers.
for x, y in ((BX0 + 2, BY0 + 2), (BX1 - 2, BY0 + 2), (BX0 + 2, BY1 - 2),
             (BX1 - 2, BY1 - 2), (BX0 + 2, 135), (BX1 - 2, 135),
             (CX - 20, BY0 + 2), (CX + 20, BY0 + 2)):
    b.V('GND', x, y)
import json as _json
_sf = os.path.join(OUT_DIR, 'gnd_stitch.json')
if os.path.exists(_sf):
    _st = _json.load(open(_sf))
    for _sx, _sy in _st:
        b.V('GND', _sx, _sy)
    print('gnd_stitch-via\'s:', len(_st))

# signalen via freerouting (SES); GND via de vlakken + gnd_stitch.
# Daarna de deterministische afmaker (finish_routes.py): purge van
# freerouting/snap-conflicten + maze-router voor de reststaart (freerouting
# plateaut ~88 op dit bord en de hybride narun crasht op protected-import).
from seslib import apply_ses
ses = os.path.join(OUT_DIR, "musicbrain-vcf8kern.ses")
if os.path.exists(ses):
    nt, nv = apply_ses(b, ses)
    print(f"SES: {nt} sporen, {nv} vias overgenomen")
    print(f"snap_stubs: {b.snap_stubs()} stubs aangevuld")
    # ---- HANDFIXES (chirurgisch, gemeten 2026-07-21): SES-artefacten bij
    # J1/J2/J3 en de AD5754-EP's die generiek niet te vangen bleken.
    _delv = {(175.0, 102.0), (135.0, 102.0)}     # via's op THT-gaten (hole2hole)
    b.vias[:] = [v for v in b.vias
                 if (round(v[1], 1), round(v[2], 1)) not in _delv]
    _dels = {((193.7252, 159.1313), (196.5234, 159.1313)),
             ((196.5234, 159.1313), (198.6797, 156.975))}   # dode MODE0-tak

    def _seg_in(a, c):
        key = ((round(a[0], 4), round(a[1], 4)), (round(c[0], 4), round(c[1], 4)))
        return key in _dels or (key[1], key[0]) in _dels
    b.tracks[:] = [(n, l, w, pts) for (n, l, w, pts) in b.tracks
                   if not (len(pts) == 2 and _seg_in(pts[0], pts[1]))]
    b.T('CS', 'F.Cu', 0.25, (155.6, 184.6), b.P['J1']['11'])
    b.T('AOUT2', 'B.Cu', 0.25, (175.0, 102.8), b.P['J3']['3'])
    b.T('AIN7', 'F.Cu', 0.25, (135.0, 102.8), b.P['J2']['8'])
    b.T('-12V', 'F.Cu', 0.25, (153.2, 116.0), (154.2, 116.0))  # kolom -> EP-U31
    b.V('-12V', 154.5648, 119.5132)   # ontbrekende laagwissels EP-keten
    b.V('-12V', 153.9354, 123.5489)
    import finish_routes as FR
    # ENKELE doorloop. NIET in een fixpoint-lus zetten (poging 2026-07-21):
    # weld_gaps stapelt per iteratie duplicaten (het gat blijft bestaan naast
    # de lasnaad) -> kwadratische opblazing, run van >1 uur zonder einde.
    FR.purge_conflicts(b)
    FR.weld_gaps(b)                 # micro-gaatjes dichtlassen (merge/purge)
    FR.trim_dangles(b)              # stubs weg; de router herstelt echt werk
    # GND-via-ankers VOORAAN: force_gnd_via heeft geen web-ankers nodig
    # (elke legale via-plek raakt de In1/In2-planes) en zijn soft-stub-
    # slachtoffers helen vanzelf in de signaal-pass hieronder.
    _of = os.path.join(OUT_DIR, 'gnd_orphans.json')
    if os.path.exists(_of):
        FR.force_gnd_via(b, _json.load(open(_of)))
    FR.finish_routes(b, rip=True)   # rip: alleen veilig bij een kleine staart
    # GND-web (zonder rip - rip divergeert op de dichte GND-fase)
    FR.finish_routes(b, skip=(), rip=False, max_rounds=3)
    # na-snap op via-ankers (hard-only; via's = gegarandeerd hoofdnet)
    if os.path.exists(_of):
        FR.force_gnd_links(b, _json.load(open(_of)))
    FR.trim_dangles(b)              # rip-puin (redundante halve sporen) weg
    # zone-wees-pads (gemeten met gnd_orphans.py; union-find zonder
    # zone-kennis acht ze verbonden): forceer een link naar een GND-via


b.write(OUT_DIR + r"\musicbrain-vcf8kern.kicad_pcb")
print("written musicbrain-vcf8kern (rev 0.1)")
