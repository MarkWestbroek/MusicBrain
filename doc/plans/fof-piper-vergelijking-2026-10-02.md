# FOF tegenover Piper: formantvergelijking (2026-10-02)

Gemaakt met `node tools/mmb-wasm/render-fof-syllables.mjs` en
`python tools/mmb-wasm/formant-compare.py` na de kalibratie van de
klinkertabel (aa, a, o, schwa) en de medeklinkerduren. Dit is een
meetinstrument, geen oordeel: LPC-formantschatting op synthetische spraak
is ruw (±50-100 Hz) en loopt in bursts en nasalen soms helemaal mis; Piper
spreekt, FOF zingt op 165 Hz. Lees vooral de klinkerkernen (F1/F2) en de
foneemduren. Wat hieruit al in de tabel is verwerkt staat in
[fof-voice-overdracht.md](fof-voice-overdracht.md).

Piper-stem: `nl_NL-alex-medium`, FOF op 165 Hz. Formanten via LPC (ruw, ±50-100 Hz). Klinker = mediaan over het middelste derde van de klinker (Piper) of 150-300 ms na de gate (FOF). Overgang = F1/F2 op 10/30/50 ms na het begin van de stemhebbende klinker.

| # | lettergreep | bron | F1 | F2 | F3 | F0 | F0 aanzet | F1/F2 @10 ms | @30 ms | @50 ms | fonemen (ms) |
|--:|---|---|--:|--:|--:|--:|--:|---|---|---|---|
| 0 | Vowel | FOF | 682 | 1321 | 2567 | 164 | 164 | 685/1353 | 676/1283 | 688/1344 | |
| | | Piper | 724 | 1463 | 2513 | 152 | 154 | 712/1374 | 708/1388 | 723/1470 | a23 |
| 1 | doo | FOF | 333 | 1054 | 2406 | 165 | 166 | 1568/2852 | 321/1438 | 337/1236 | |
| | | Piper | – | – | – | 188 | 187 | 488/1156 | 458/1253 | 451/1250 | d46 u70 |
| 2 | da | FOF | 685 | 1327 | 2570 | 164 | 166 | 1585/2838 | 547/1277 | 698/1542 | |
| | | Piper | 760 | 1439 | 2251 | 156 | 155 | 729/1309 | 728/1347 | 715/1303 | d58 a70 |
| 3 | va | FOF | 683 | 1331 | 2569 | 164 | 162 | 1637/2710 | 1361/2381 | 1772/2509 | |
| | | Piper | 691 | 1400 | 2288 | 141 | 142 | 715/1268 | 713/1280 | 716/1297 | v58 a81 |
| 4 | der | FOF | 440 | 1573 | 2775 | 165 | 165 | 181/1592 | 365/1330 | 440/1896 | |
| | | Piper | 466 | 1607 | 2443 | 184 | 184 | 543/1594 | 466/1530 | 652/1574 | d58 ɛ58 r116 |
| 5 | ja | FOF | 688 | 1322 | 2709 | 164 | 165 | 331/1731 | 327/1245 | 335/2019 | |
| | | Piper | 800 | 1552 | 2488 | 142 | 144 | 740/1352 | 724/1351 | 688/1375 | j46 a58 |
| 6 | cob | FOF | 493 | 1098 | 2438 | 165 | 165 | 504/1136 | 493/1071 | 496/1128 | |
| | | Piper | 482 | 745 | 2951 | 179 | 179 | 372/725 | 526/1219 | 557/755 | k46 ɔ104 p116 |
| 7 | slaapt | FOF | 682 | 1323 | 2560 | 164 | – | 942/1659 | 970/1830 | 1031/2097 | |
| | | Piper | 665 | 1303 | 2237 | 202 | 197 | 739/1303 | 743/1395 | 675/1296 | s58 l46 a70 p46 t46 |
| 8 | gij | FOF | 600 | 1349 | 2526 | 165 | 165 | 1323/1814 | 1142/2062 | 1506/2486 | |
| | | Piper | 577 | 1737 | 2534 | 147 | 144 | 651/1523 | 611/1610 | 575/1763 | ɣ70 ɛ93 ɪ93 |
| 9 | nog | FOF | 492 | 1092 | 2397 | 165 | 165 | 499/1066 | 494/1104 | 492/1096 | |
| | | Piper | 633 | 1318 | 2657 | 141 | 142 | 362/935 | 666/1325 | 590/1049 | n81 ɔ70 x128 |
| 10 | al | FOF | 581 | 1028 | 2507 | 164 | 164 | 584/1031 | 574/1019 | 585/1018 | |
| | | Piper | 474 | 922 | 3031 | 146 | 147 | 500/911 | 466/917 | 446/932 | ɑ58 l93 |
| 11 | le | FOF | 442 | 1551 | 2820 | 165 | 165 | 357/1394 | 354/1266 | 353/1220 | |
| | | Piper | 250 | 1363 | 2976 | 134 | 133 | 383/1246 | 267/1330 | 428/1412 | l93 ə70 |
| 12 | klo | FOF | 494 | 1123 | 2472 | 165 | 165 | 359/1303 | 353/1330 | 353/1539 | |
| | | Piper | 700 | 1437 | 2676 | 128 | 127 | 496/1009 | 482/910 | 555/1194 | k46 l46 o46 |
| 13 | ken | FOF | 443 | 1591 | 2795 | 165 | 165 | 468/1782 | 438/1676 | 445/1609 | |
| | | Piper | 286 | 1261 | 2079 | 155 | 160 | 643/1584 | 1262/1752 | 252/1240 | k35 ɛ70 n128 |
| 14 | lui | FOF | 496 | 1543 | 2813 | 165 | 165 | 353/1394 | 346/1259 | 355/1656 | |
| | | Piper | 489 | 1492 | 2474 | 163 | 161 | 598/1408 | 492/1473 | 484/1492 | l58 œ81 y151 |
| 15 | den | FOF | 440 | 1573 | 2775 | 165 | 165 | 181/1592 | 365/1330 | 440/1896 | |
| | | Piper | 283 | 1328 | 2057 | 181 | 181 | 294/1328 | 214/1481 | 209/1448 | d58 ɛ23 n128 |
| 16 | bim | FOF | 407 | 912 | 2431 | 165 | 166 | 1483/2256 | 373/1943 | 420/2014 | |
| | | Piper | 183 | 1346 | 2128 | 168 | 168 | 1255/2100 | 158/1322 | 174/1320 | b46 ɪ70 m104 |
| 17 | bam | FOF | 579 | 1026 | 2451 | 164 | 165 | 201/1392 | 550/1343 | 594/1048 | |
| | | Piper | 776 | 2066 | 3053 | 119 | 119 | 659/915 | 777/2059 | 843/2138 | b23 ɑ70 m116 |
| 18 | bom | FOF | 492 | 1074 | 2430 | 165 | 165 | 223/1400 | 483/1422 | 496/1092 | |
| | | Piper | 505 | 1493 | 2772 | 135 | 134 | 586/2090 | 237/822 | 799/2108 | b46 ɔ70 m104 |
| 19 | de | FOF | 440 | 1573 | 2775 | 165 | 165 | 181/1592 | 365/1330 | 440/1896 | |
| | | Piper | 399 | 1609 | 2719 | 139 | 140 | 415/1567 | 390/1619 | 413/1647 | d93 ə93 |

Lezing: vergelijk per lettergreep de klinkerkern (F1/F2) en de richting van de overgang; een verschil van meer dan ~150 Hz in F1 of ~250 Hz in F2 is een kandidaat voor de tabel. De foneemduren van Piper geven de maat voor sluiting, burst en nasaal.
