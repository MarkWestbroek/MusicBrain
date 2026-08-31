import numpy as np
from scipy.linalg import eig
from scipy.optimize import brentq

P, N1, N2, B, C = 0, 1, 2, 3, 4
N = 5
VCC = 15.0

def bias(Rc, Rf, Re, beta):
    def f(Ic):
        Vc = VCC - Ic*Rc
        Vb = Ic*Re + 0.65
        return Ic - beta*(Vc - Vb)/Rf
    Ic = brentq(f, 1e-7, VCC/Rc*0.999)
    return Ic, VCC - Ic*Rc

def poles(vr57, vr58=250.0, beta=200.0, C586=82e-9, C587=69e-9, C588=69e-9,
          C585=82e-9, R635=10e3, R636=15e3, R634=71e3, Rf=1.5e6, Rc=10e3):
    Re = 100.0 + vr58
    Ic, Vc = bias(Rc, Rf, Re, beta)
    gm = Ic/0.026
    rpi = beta/gm
    # emitter degeneration -> effective gm and input resistance
    gm_e = gm/(1 + gm*Re)
    rin  = rpi*(1 + gm*Re)

    G = np.zeros((N, N)); Cm = np.zeros((N, N))
    def res(a, b, R):
        g = 1/R
        for n in (a, b):
            if n is not None: G[n, n] += g
        if a is not None and b is not None: G[a, b] -= g; G[b, a] -= g
    def cap(a, b, Cv):
        for n in (a, b):
            if n is not None: Cm[n, n] += Cv
        if a is not None and b is not None: Cm[a, b] -= Cv; Cm[b, a] -= Cv

    res(P, None, R635)          # R635 to ground
    res(P, None, R634)          # R634 + trigger network to ground
    cap(P, C, C585)             # bridging cap
    cap(P, N1, C586)
    res(N1, None, max(vr57, 1.0))   # VR57 tune
    cap(N1, N2, C587)
    res(N2, None, R636)
    cap(N2, B, C588)
    res(B, C, Rf)               # R638 feedback
    res(C, None, Rc)            # R639 to +15V (AC ground)
    res(B, None, rin)
    res(C, None, 100e3)         # Early + output loading
    cap(C, None, 5e-12)
    G[C, B] += gm_e

    w, _ = eig(-G, Cm)
    return [s for s in w if np.isfinite(s) and s.imag > 1e-6], Ic, Vc

print("target (Roland factory spec): 62.5 Hz, decay 100 ms\n")
print(f"{'VR57':>7} {'f0 (Hz)':>9} {'tau (ms)':>9} {'Q':>7}")
for vr in [10, 2500, 5000, 7500, 10000]:
    ps, Ic, Vc = poles(vr)
    if not ps:
        print(f"{vr:7d}   no complex pair"); continue
    s = max(ps, key=lambda p: p.real)
    f0 = abs(s.imag)/(2*np.pi); sig = -s.real
    tau = 1/sig if sig > 0 else float('inf')
    Q = abs(s.imag)/(2*sig) if sig > 0 else float('inf')
    print(f"{vr:7d} {f0:9.1f} {tau*1000:9.1f} {Q:7.1f}")
_, Ic, Vc = poles(5000)
print(f"\nbias: Ic = {Ic*1e3:.2f} mA, Vc = {Vc:.2f} V")
