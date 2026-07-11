"""SES-import voor de generator-pijplijn: parse freerouting-uitvoer en geef
(tracks, vias) terug in bord-coordinaten, zodat de generator ze native emit
(geen pcbnew-hersave nodig; netcheck/DRC blijven op generator-uitvoer draaien).

SES-geometrie: um, y-as gespiegeld t.o.v. KiCad (y_kicad = -y_ses/1000).
"""
import re


def _tok(text):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in ' \t\r\n':
            i += 1
        elif c in '()':
            yield c; i += 1
        elif c == '"':
            j = i + 1
            while text[j] != '"':
                j += 1
            yield text[i+1:j]; i = j + 1
        else:
            j = i
            while j < n and text[j] not in ' \t\r\n()':
                j += 1
            yield text[i:j]; i = j


def _parse(text):
    stack = [[]]
    for t in _tok(text):
        if t == '(':
            stack.append([])
        elif t == ')':
            done = stack.pop(); stack[-1].append(done)
        else:
            stack[-1].append(t)
    return stack[0][0]


def _walk(node, name):
    if isinstance(node, list):
        if node and node[0] == name:
            yield node
        for ch in node:
            yield from _walk(ch, name)


def load_ses(path):
    """-> (tracks, vias): tracks = [(net, layer, breedte_mm, [(x,y), ...])],
    vias = [(net, x, y)]. Schaal komt uit de (resolution <unit> <n>)-header."""
    tree = _parse(open(path, encoding='utf-8').read())
    div = 10000.0   # default: resolution um 10 -> 10 eenheden per um
    for res in _walk(tree, 'resolution'):
        unit = res[1]
        per = float(res[2])
        div = per * {'um': 1000.0, 'mil': 39.3701, 'mm': 1.0, 'cm': 0.1}.get(unit, 1000.0)
        break
    tracks, vias = [], []
    for net in _walk(tree, 'net'):
        name = net[1]
        for wire in _walk(net, 'wire'):
            for pathn in _walk(wire, 'path'):
                layer = pathn[1]
                width = float(pathn[2]) / div
                coords = [float(v) for v in pathn[3:] if not isinstance(v, list)]
                pts = [(coords[i] / div, -coords[i+1] / div)
                       for i in range(0, len(coords), 2)]
                if len(pts) >= 2:
                    tracks.append((name, layer, width, pts))
        for vian in _walk(net, 'via'):
            coords = [v for v in vian[2:] if not isinstance(v, list)]
            if len(coords) >= 2:
                vias.append((name, float(coords[0]) / div, -float(coords[1]) / div))
    return tracks, vias


def apply_ses(board, path, net_prefix=''):
    """Zet SES-routing op een cardlib.Board. Netnamen moeten in board.NI staan."""
    tracks, vias = load_ses(path)
    nt = nv = 0
    for name, layer, width, pts in tracks:
        if name not in board.NI:
            name = net_prefix + name
        if name not in board.NI:
            continue
        board.T(name, layer, max(width, 0.2), *pts)
        nt += 1
    for name, x, y in vias:
        if name not in board.NI:
            name = net_prefix + name
        if name not in board.NI:
            continue
        board.V(name, x, y)
        nv += 1
    return nt, nv
