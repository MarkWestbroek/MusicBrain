import ctypes, ctypes.wintypes as W
mm = ctypes.WinDLL('winmm')
class MIDIOUTCAPSW(ctypes.Structure):
    _fields_ = [('wMid',W.WORD),('wPid',W.WORD),('vDriverVersion',W.UINT),('szPname',W.WCHAR*32),
                ('wTechnology',W.WORD),('wVoices',W.WORD),('wNotes',W.WORD),('wChannelMask',W.WORD),('dwSupport',W.DWORD)]
def outputs():
    r=[]
    for i in range(mm.midiOutGetNumDevs()):
        c=MIDIOUTCAPSW(); mm.midiOutGetDevCapsW(i, ctypes.byref(c), ctypes.sizeof(c)); r.append(c.szPname)
    return r
class Out:
    def __init__(self, match='Teensy'):
        names=outputs(); idx=next(i for i,n in enumerate(names) if match.lower() in n.lower())
        self.h=W.HANDLE(); rc=mm.midiOutOpen(ctypes.byref(self.h), idx, 0, 0, 0)
        if rc: raise RuntimeError(f'midiOutOpen {rc}')
        self.name=names[idx]
    def send(self, st, d1, d2=0): mm.midiOutShortMsg(self.h, st | (d1<<8) | (d2<<16))
    def on(self, n, v, ch=0): self.send(0x90|ch, n, v)
    def off(self, n, ch=0): self.send(0x80|ch, n, 0)
    def cc(self, c, v, ch=0): self.send(0xB0|ch, c, v)
    def close(self): mm.midiOutReset(self.h); mm.midiOutClose(self.h)
if __name__=='__main__': print(outputs())
