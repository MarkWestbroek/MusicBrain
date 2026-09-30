// LyricModal — een lyricbank maken en bewerken voor de module ZANG: opnemen,
// wav's kiezen of tekst laten inspreken; per opname de lettergrepen intypen,
// de grenzen en de lus bijstellen; en de bank naar bank NN sturen (simulator
// én Teensy) of als bestand bewaren. Een bestaande .mmbl opent als gewone
// opnames en is dus net zo te bewerken.
//
// Het rekenwerk zit in analyze.ts (toonhoogte, pitch marks, lettergrepen),
// tts.ts (de Piper-dienst en grenzen uit foneemtijden), preview.ts (de lus
// laten horen), lyricStore.ts (bewaren in de browser) en lyricBank.ts (het
// .mmbl-formaat); dit bestand is alleen het venster.
// Achtergrond: doc/plans/zingende-stemmen.md.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { WasmModule } from '../runtime';
import { sendBank, useTeensyLink } from '../teensyLink';
import { LYRIC_RATE, analyzeRecording, type Span, type SyllableAnalysis } from './analyze';
import { buildLyricBank, fromAnalysis, parseLyricBank, type LyricBankData } from './lyricBank';
import { deleteSimLyricBank, lyricBanksVersion, setSimLyricBank, simLyricBank, simLyricBanks, subscribeLyricBanks } from './lyricStore';
import { renderSustainLoop } from './preview';
import { SyllableEditor } from './SyllableEditor';
import {
  TTS_DEFAULTS, TTS_LOCAL_ENDPOINT, listVoices, loadTtsSettings, saveTtsSettings, spansFromPhonemes, speak,
  type TtsSettings, type TtsVoice,
} from './tts';

export const ZANG_TYPE_ID = 'tp_mmb_zang';

export interface Take {
  id: number;
  name: string;
  mono: Float32Array;
  rate: number;
  /** Lettergrepen zoals getypt: "zon-ne-tje" of "zon ne tje". */
  text: string;
  /** Grenzen in frames van de opname; null = nog niet bepaald. */
  spans: Span[] | null;
  /** Waar de grenzen vandaan komen. */
  origin: 'auto' | 'hand' | 'tekst' | 'bank';
  /** Met de hand gezette lus per vak, in frames van de opname (relatief aan
   *  het begin van het vak); null = zelf zoeken. */
  sustains: ({ start: number; end: number } | null)[];
  syllables: SyllableAnalysis[];
  note: string;
}

/** "zon-ne-tje" → ["zon", "ne", "tje"]; leeg = zelf laten zoeken. */
export function splitText(text: string): string[] {
  return text.split(/[\s\-·|]+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/** "zon-ne-tje slaap" → "zonnetje slaap": wat de spraakdienst moet uitspreken. */
export function spokenText(text: string): string {
  return text.replace(/[-·|]+/g, '').replace(/\s+/g, ' ').trim();
}

/** De bank in de simulator zetten als bank `bank` (0–15, de Bank-knop van
 *  ZANG) en in de browser bewaren; zie lyricStore.ts. */
export function loadLyricBankIntoSim(buf: ArrayBuffer, name: string, bank = 0, syllables = 0): Promise<boolean> {
  return setSimLyricBank(bank, buf, name, syllables);
}

async function decodeToMono(data: ArrayBuffer): Promise<{ mono: Float32Array; rate: number }> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const b = await ctx.decodeAudioData(data);
  const mono = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c);
    for (let i = 0; i < b.length; i++) mono[i] = mono[i]! + src[i]! / b.numberOfChannels;
  }
  return { mono, rate: b.sampleRate };
}

/**
 * Analyseer een opname. Met `take.spans` liggen de grenzen vast (met de hand
 * gezet of uit de tekst); zonder zoekt de analyse ze zelf en bewaren we wat
 * hij vond, zodat de golfvorm ze toont.
 */
export function analyzeTake(take: Take): Take {
  const want = splitText(take.text);
  try {
    if (take.spans && take.spans.length > 0) {
      const texts = take.spans.map((_, i) => want[i] ?? '');
      const syllables = analyzeRecording(take.mono, take.rate, { syllables: texts, spans: take.spans, sustains: take.sustains });
      const note = want.length && want.length !== take.spans.length
        ? `${want.length} lettergrepen getypt, ${take.spans.length} vakken in de golfvorm`
        : '';
      return { ...take, syllables, note };
    }
    const syllables = analyzeRecording(take.mono, take.rate, want.length ? { syllables: want } : {});
    const k = take.rate / LYRIC_RATE;
    const spans = syllables.map((s) => ({
      start: Math.round(s.sourceStart * k), end: Math.round(s.sourceEnd * k), wordEnd: s.wordEnd,
    }));
    // Buren binnen een woord delen hun grens, ook na het afronden.
    for (let i = 1; i < spans.length; i++) if (!spans[i - 1]!.wordEnd) spans[i]!.start = spans[i - 1]!.end;
    const note = want.length && syllables.length !== want.length
      ? `${want.length} lettergrepen getypt, ${syllables.length} gevonden`
      : '';
    return { ...take, spans, origin: 'auto', syllables, note };
  } catch (err) {
    return { ...take, syllables: [], note: `analyse mislukt: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Een bestaande bank als opnames: per woord één opname (de lettergrepen
 * achter elkaar), met de grenzen en lussen uit de bank. Zo is een geopende
 * bank precies zo te bewerken als een verse opname.
 */
export function takesFromBank(bank: LyricBankData, firstId: number): Take[] {
  const takes: Take[] = [];
  let word: LyricBankData['syllables'] = [];
  const flush = (): void => {
    if (word.length === 0) return;
    const total = word.reduce((n, s) => n + s.data.length, 0);
    const mono = new Float32Array(total);
    const spans: Span[] = [];
    const sustains: ({ start: number; end: number } | null)[] = [];
    let at = 0;
    for (const s of word) {
      for (let i = 0; i < s.data.length; i++) mono[at + i] = s.data[i]! / 32768;
      spans.push({ start: at, end: at + s.data.length, wordEnd: s.wordEnd });
      sustains.push(s.sustainEnd > s.sustainStart && s.marks[s.sustainEnd]
        ? { start: s.marks[s.sustainStart]!.frame, end: s.marks[s.sustainEnd]!.frame }
        : null);
      at += s.data.length;
    }
    takes.push(analyzeTake({
      id: firstId + takes.length, name: word.map((s) => s.text || '·').join(''), mono, rate: bank.rate,
      text: word.map((s) => s.text).join('-'), spans, origin: 'bank', sustains, syllables: [], note: '',
    }));
    word = [];
  };
  for (const s of bank.syllables) { word.push(s); if (s.wordEnd) flush(); }
  flush();
  return takes;
}

export interface LyricModalProps {
  open: boolean;
  onClose: () => void;
  /** Stand van de Bank-knop van de ZANG-module in de patch, als startwaarde. */
  defaultBank?: number;
}

export function LyricModal({ open, onClose, defaultBank }: LyricModalProps): JSX.Element | null {
  const link = useTeensyLink();
  const linked = link.status.kind === 'connected';
  const cardNames = linked ? link.lastStatus?.lyricNames : undefined;
  useSyncExternalStore(subscribeLyricBanks, lyricBanksVersion);
  const stored = simLyricBanks();
  const [takes, setTakes] = useState<Take[]>([]);
  const [name, setName] = useState('Mijn liedje');
  const [bankNo, setBankNo] = useState(0);
  const [status, setStatus] = useState('');
  const [recording, setRecording] = useState(false);
  const [tts, setTts] = useState<TtsSettings>(() => loadTtsSettings());
  const [ttsText, setTtsText] = useState('');
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsSetup, setTtsSetup] = useState(false);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const nextId = useRef(1);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const player = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Bij openen: het banknummer van de knop in de patch overnemen.
  useEffect(() => {
    if (open && defaultBank !== undefined && Number.isFinite(defaultBank)) setBankNo(Math.max(0, Math.min(15, Math.round(defaultBank))));
  }, [open, defaultBank]);

  // Welke stemmen heeft de dienst? Stil falen: zonder dienst werkt de rest gewoon.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    listVoices(tts).then((v) => { if (alive) setVoices(v); }).catch(() => { if (alive) setVoices([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tts.endpoint, tts.code]);

  if (!open) return null;

  const fail = (what: string, err: unknown): void =>
    setStatus(`mislukt (${what}): ${err instanceof Error ? err.message : String(err)}`);
  const changeTts = (patch: Partial<TtsSettings>): void => {
    setTts((s) => { const n = { ...s, ...patch }; saveTtsSettings(n); return n; });
  };

  function addTake(take: Omit<Take, 'id' | 'syllables' | 'note'>): Take {
    const t = analyzeTake({ ...take, id: nextId.current++, syllables: [], note: '' });
    setTakes((list) => [...list, t]);
    return t;
  }

  async function addAudio(data: ArrayBuffer, label: string): Promise<void> {
    const { mono, rate } = await decodeToMono(data);
    const t = addTake({ name: label, mono, rate, text: '', spans: null, origin: 'auto', sustains: [] });
    setStatus(`${label}: ${(mono.length / rate).toFixed(2)} s, ${t.syllables.length} lettergrepen gevonden`);
  }

  async function addFiles(files: FileList): Promise<void> {
    for (const f of Array.from(files)) {
      try { await addAudio(await f.arrayBuffer(), f.name); } catch (err) { fail(f.name, err); }
    }
  }

  async function toggleRecord(): Promise<void> {
    if (recording) { recorder.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      } });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        void blob.arrayBuffer()
          .then((buf) => addAudio(buf, `opname ${nextId.current}`))
          .catch((err) => fail('opname', err));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setStatus('opnemen… spreek het woord rustig en duidelijk in, en klik dan op Stop');
    } catch (err) {
      fail('microfoon', err);
    }
  }

  async function sayIt(): Promise<void> {
    const typed = ttsText.trim();
    if (!typed) return;
    setTtsBusy(true);
    try {
      setStatus('inspreken…');
      const r = await speak(tts, spokenText(typed));
      const mono = new Float32Array(r.pcm.length);
      for (let i = 0; i < mono.length; i++) mono[i] = r.pcm[i]! / 32768;
      const syl = splitText(typed);
      const spans = spansFromPhonemes(syl, r.phonemes, r.rate);
      const t = addTake({
        name: `${spokenText(typed)} (${r.voice.split('-')[1] ?? r.voice}${tts.speaker ? ` ${tts.speaker}` : ''})`, mono, rate: r.rate,
        text: typed, spans, origin: spans ? 'tekst' : 'auto', sustains: [],
      });
      setTtsText('');
      setStatus(spans
        ? `ingesproken: ${t.syllables.length} lettergrepen, grenzen uit de tekst`
        : `ingesproken: ${t.syllables.length} lettergrepen — het aantal klinkers klopte niet met wat je typte, dus de grenzen zijn geschat`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTtsSetup(true);
      setStatus(`mislukt (inspreken): ${/Failed to fetch|NetworkError|404/.test(msg) ? 'de spraakdienst is niet bereikbaar — zie ⚙' : msg}`);
    } finally {
      setTtsBusy(false);
    }
  }

  const update = (id: number, fn: (t: Take) => Take): void =>
    setTakes((list) => list.map((x) => (x.id === id ? fn(x) : x)));
  const setText = (id: number, text: string): void =>
    setTakes((list) => list.map((x) => (x.id === id ? { ...x, text } : x)));
  /** Tekst toepassen: met vaste grenzen alleen de labels, anders opnieuw zoeken. */
  const applyText = (id: number): void => update(id, (t) => analyzeTake(t));
  /** Grenzen (en lussen) weggooien en opnieuw laten zoeken. */
  const redetect = (id: number): void => update(id, (t) => analyzeTake({ ...t, spans: null, origin: 'auto', sustains: [] }));
  /** Nieuwe grenzen: de lussen van vakken die niet veranderden blijven staan. */
  const setSpans = (id: number, spans: Span[]): void =>
    update(id, (t) => analyzeTake({
      ...t, spans, origin: 'hand',
      sustains: spans.map((sp) => {
        const k = t.spans?.findIndex((o) => o.start === sp.start && o.end === sp.end) ?? -1;
        return k >= 0 ? t.sustains[k] ?? null : null;
      }),
    }));
  /** De lus van vak `index` met de hand gezet (frames van de opname, absoluut). */
  const setSustain = (id: number, index: number, start: number, end: number): void =>
    update(id, (t) => {
      const sp = t.spans?.[index];
      if (!sp) return t;
      const sustains = (t.spans ?? []).map((_, i) => t.sustains[i] ?? null);
      sustains[index] = { start: start - sp.start, end: end - sp.start };
      return analyzeTake({ ...t, sustains });
    });
  const remove = (id: number): void => setTakes((t) => t.filter((x) => x.id !== id));
  function move(id: number, dir: -1 | 1): void {
    setTakes((t) => {
      const i = t.findIndex((x) => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= t.length) return t;
      const c = t.slice();
      [c[i], c[j]] = [c[j]!, c[i]!];
      return c;
    });
  }

  function playBuffer(part: Float32Array, rate: number): void {
    void player.current?.close();
    if (part.length < 2) return;
    const ctx = new AudioContext();
    player.current = ctx;
    const b = ctx.createBuffer(1, part.length, rate);
    b.copyToChannel(part as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.connect(ctx.destination);
    src.onended = () => { if (player.current === ctx) { player.current = null; void ctx.close(); } };
    src.start();
  }
  const play = (take: Take, start = 0, end = take.mono.length): void =>
    playBuffer(take.mono.slice(Math.max(0, start), Math.min(take.mono.length, end)), take.rate);
  /** De lus van lettergreep `index` horen zoals ZANG hem aanhoudt (op de gesproken toonhoogte). */
  function playLoop(take: Take, index: number): void {
    const syl = take.syllables[index];
    const sp = take.spans?.[index];
    if (!syl || !sp) return;
    if (syl.sustainEnd <= syl.sustainStart) {
      setStatus('deze lettergreep heeft geen lus: hij speelt één keer af');
      play(take, sp.start, sp.end);
      return;
    }
    playBuffer(renderSustainLoop(syl, 1.5), syl.rate);
  }

  /** De bank zoals hij nu in het venster staat, of null als er niets is. */
  function currentBank(): { data: LyricBankData; bytes: ArrayBuffer } | null {
    const data = fromAnalysis(name.trim() || 'Liedje', takes.flatMap((t) => t.syllables));
    if (data.syllables.length === 0) { setStatus('er zijn nog geen lettergrepen'); return null; }
    return { data, bytes: buildLyricBank(data) };
  }

  /** Naar bank NN: in de simulator (en bewaard in de browser), en op de Teensy als die verbonden is. */
  async function toBank(): Promise<void> {
    const b = currentBank();
    if (!b) return;
    const nn = String(bankNo).padStart(2, '0');
    const parts: string[] = [];
    const saved = await loadLyricBankIntoSim(b.bytes, b.data.name, bankNo, b.data.syllables.length);
    parts.push(saved ? 'in de simulator, bewaard in deze browser' : 'in de simulator (bewaren lukte niet: privévenster?)');
    if (linked) {
      try {
        setStatus(`bank ${nn}: naar de Teensy…`);
        await sendBank(bankNo, new Uint8Array(b.bytes),
          (done, size) => setStatus(`bank ${nn}: naar de Teensy… ${(done / 1024).toFixed(0)} van ${(size / 1024).toFixed(0)} KB`), 'lyric');
        parts.push('op de SD-kaart van de Teensy');
      } catch (err) {
        parts.push(`Teensy mislukt: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const n = WasmModule.count(ZANG_TYPE_ID);
    setStatus(`bank ${nn} "${b.data.name}", ${b.data.syllables.length} lettergrepen: ${parts.join(' en ')}`
      + ` — zet de Bank-knop van ZANG op ${bankNo}` + (n === 0 ? ' (zet een ZANG-module in het rack: Poly ▾ → Zingende stem)' : ''));
  }

  function download(): void {
    const b = currentBank();
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([b.bytes], { type: 'application/octet-stream' }));
    a.download = `${String(bankNo).padStart(2, '0')}.mmbl`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(`${a.download} bewaard — hoort op de SD-kaart in /mmb/lyrics/`);
  }

  /** Een .mmbl openen: de lettergrepen worden gewone opnames, per woord één. */
  async function openBank(file: File): Promise<void> {
    try {
      const data = parseLyricBank(await file.arrayBuffer());
      const fresh = takesFromBank(data, nextId.current);
      nextId.current += fresh.length;
      setTakes((list) => [...list, ...fresh]);
      if (takes.length === 0) setName(data.name);
      setStatus(`${file.name} geopend: ${data.syllables.length} lettergrepen in ${fresh.length} woorden — bewerk ze en stuur de bank opnieuw`);
    } catch (err) {
      fail(file.name, err);
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const panel: React.CSSProperties = {
    background: '#fff', borderRadius: 8, padding: 18, width: 820, maxWidth: '94vw', maxHeight: '90vh',
    overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', fontSize: 13,
  };
  const chip: React.CSSProperties = {
    display: 'inline-block', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px',
    margin: '2px 4px 2px 0', fontFamily: 'monospace', fontSize: 12, background: '#f8fafc',
  };
  const box: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, marginBottom: 8 };
  const originLabel: Record<Take['origin'], string> = {
    auto: 'grenzen geschat', hand: 'grenzen met de hand gezet', tekst: 'grenzen uit de tekst', bank: 'uit een bank',
  };

  const total = takes.reduce((n, t) => n + t.syllables.length, 0);
  const local = tts.endpoint.startsWith('http://127.0.0.1') || tts.endpoint.startsWith('http://localhost');

  // Overzicht per banknummer: simulator en Teensy naast elkaar.
  const rows: { nn: number; sim: string | null; card: string | null }[] = [];
  for (let nn = 0; nn < 16; nn++) {
    const sim = simLyricBank(nn)?.name ?? null;
    const card = cardNames ? (cardNames[nn] || null) : null;
    if (sim || card) rows.push({ nn, sim, card });
  }
  void stored;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ margin: 0 }}>🎤 Zang — woorden om te zingen</h3>
          <span style={{ color: '#64748b' }}>lyricbank voor de module ZANG</span>
          <button onClick={onClose} style={{ marginLeft: 'auto' }}>✕</button>
        </div>
        <p style={{ color: '#475569', margin: '8px 0 12px' }}>
          Spreek een woord in, kies een wav, of laat tekst inspreken. Typ de lettergrepen met streepjes —
          <code> zon-ne-tje</code> — en de module ZANG zingt ze op de noten die je speelt: elke aanslag de
          volgende lettergreep, en de klinker blijft klinken zolang je de toets vasthoudt. In de golfvorm sleep
          je de grenzen (rood) en de lus (groen); klik op de groene balk om de lus te horen zoals ZANG hem
          aanhoudt. Een bestaande <code>.mmbl</code> opent als gewone opnames en is net zo te bewerken.
        </p>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <button onClick={() => void toggleRecord()} style={recording ? { color: '#b91c1c', fontWeight: 600 } : undefined}>
            {recording ? '⏹ Stop' : '⏺ Opnemen'}
          </button>
          <label>of wav's:{' '}
            <input type="file" multiple accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a"
              onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.currentTarget.value = ''; }} />
          </label>
          <label style={{ marginLeft: 'auto' }}>bestaande bank:{' '}
            <input type="file" accept=".mmbl"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void openBank(f); e.currentTarget.value = ''; }} />
          </label>
        </div>

        <div style={{ ...box, background: '#f8fafc' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span title="Tekst naar spraak met Piper">🗣 Laat inspreken</span>
            <input value={ttsText} placeholder="zon-ne-tje  (streepjes tussen de lettergrepen)" style={{ flex: 1, minWidth: 220 }}
              onChange={(e) => setTtsText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !ttsBusy) void sayIt(); }} />
            <select value={tts.voice} onChange={(e) => changeTts({ voice: e.target.value, speaker: 0 })} title="Stem">
              {(voices.length ? voices : [{ id: tts.voice, name: tts.voice.split('-')[1] ?? tts.voice, language: '' } as TtsVoice])
                .map((v) => <option key={v.id} value={v.id}>{v.name}{v.language ? ` (${v.language})` : ''}{v.speakers > 1 ? ` · ${v.speakers} sprekers` : ''}</option>)}
            </select>
            {(voices.find((v) => v.id === tts.voice)?.speakers ?? 1) > 1 && (
              <label title="Welke van de sprekers van dit model (0 = de eerste)">
                spreker <input type="number" min={0} max={(voices.find((v) => v.id === tts.voice)?.speakers ?? 1) - 1} value={tts.speaker} style={{ width: 48 }}
                  onChange={(e) => changeTts({ speaker: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
            )}
            <label title="Spreektempo: hoger is trager, met langere klinkers die beter aan te houden zijn">
              tempo <input type="number" min={0.7} max={2.5} step={0.1} value={tts.lengthScale} style={{ width: 52 }}
                onChange={(e) => changeTts({ lengthScale: Math.max(0.5, Math.min(3, Number(e.target.value) || 1)) })} />
            </label>
            <button onClick={() => void sayIt()} disabled={ttsBusy || !ttsText.trim()}>{ttsBusy ? '…' : 'Spreek in'}</button>
            <button onClick={() => setTtsSetup((v) => !v)} title="Waar draait de spraakdienst?">⚙</button>
          </div>
          {ttsSetup && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: '#475569' }}>
              <label>dienst <input value={tts.endpoint} style={{ width: 210 }}
                onChange={(e) => changeTts({ endpoint: e.target.value.trim() })} /></label>
              <button onClick={() => changeTts({ endpoint: TTS_DEFAULTS.endpoint })}>MusicBrain-server</button>
              <button onClick={() => changeTts({ endpoint: TTS_LOCAL_ENDPOINT, code: '' })}>eigen computer</button>
              {!local && (
                <label>toegangscode <input value={tts.code} type="password" style={{ width: 150 }}
                  placeholder="dezelfde als voor de AI"
                  onChange={(e) => changeTts({ code: e.target.value.trim() })} /></label>
              )}
              <span style={{ fontSize: 12, width: '100%' }}>
                {voices.length
                  ? `verbonden: ${voices.length} stemmen`
                  : 'geen verbinding met de spraakdienst. Op je eigen computer start je hem met tools/piper-tts/start.cmd (zie de README daar).'}
              </span>
            </div>
          )}
        </div>

        {takes.map((t, i) => (
          <div key={t.id} style={box}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => play(t)} title="De hele opname afspelen">▶</button>
              <strong>{t.name}</strong>
              <span style={{ color: '#94a3b8' }}>{(t.mono.length / t.rate).toFixed(2)} s · {originLabel[t.origin]}</span>
              <input value={t.text} placeholder="lettergrepen: zon-ne-tje" style={{ flex: 1, minWidth: 160 }}
                onChange={(e) => setText(t.id, e.target.value)}
                onBlur={() => applyText(t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyText(t.id); }} />
              <button onClick={() => redetect(t.id)} title="Grenzen en lussen weggooien en opnieuw laten zoeken">Zoek opnieuw</button>
              <button onClick={() => move(t.id, -1)} disabled={i === 0} title="Eerder in het liedje">↑</button>
              <button onClick={() => move(t.id, 1)} disabled={i === takes.length - 1} title="Later in het liedje">↓</button>
              <button onClick={() => remove(t.id)} title="Weggooien">🗑</button>
            </div>
            {t.spans && t.spans.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <SyllableEditor
                  mono={t.mono} rate={t.rate} spans={t.spans}
                  texts={t.syllables.map((s) => s.text)}
                  sustain={t.syllables.map((s, k) => {
                    const sp = t.spans![k];
                    if (!sp || s.sustainEnd <= s.sustainStart) return null;
                    const f = t.rate / s.rate;
                    return {
                      start: sp.start + s.marks[s.sustainStart]!.frame * f,
                      end: sp.start + s.marks[s.sustainEnd]!.frame * f,
                    };
                  })}
                  onChange={(spans) => setSpans(t.id, spans)}
                  onSustainChange={(k, a, b) => setSustain(t.id, k, a, b)}
                  onPlay={(a, b) => play(t, a, b)}
                  onPlayLoop={(k) => playLoop(t, k)} />
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              {t.syllables.map((s, k) => {
                const sustain = s.sustainEnd > s.sustainStart;
                const rough = sustain && (s.sustainQuality < 0.8 || (s.pitchHz > 0 && s.pitchHz < 75));
                const ms = (s.data.length / s.rate) * 1000;
                const why = !sustain ? 'geen klinkerkern: speelt één keer af'
                  : rough ? `de lus is krakerig (${s.pitchHz > 0 && s.pitchHz < 75 ? 'krakende stem, ' : ''}gelijkenis ${(s.sustainQuality * 100).toFixed(0)} %): spreek de klinker vlakker en luider in`
                  : `aan te houden (lus ${(s.sustainQuality * 100).toFixed(0)} %) — klik om de lus te horen`;
                return (
                  <span key={k} style={{ ...chip, borderColor: sustain && !rough ? '#cbd5e1' : '#f59e0b', marginRight: s.wordEnd ? 14 : 4, cursor: 'pointer' }}
                    title={`${ms.toFixed(0)} ms · ${s.pitchHz > 0 ? `${s.pitchHz.toFixed(0)} Hz gesproken` : 'stemloos'} · ${why}`}
                    onClick={() => playLoop(t, k)}>
                    {s.text || '·'} <span style={{ color: '#94a3b8' }}>{ms.toFixed(0)}</span>{sustain && !rough ? '' : rough ? ' ⚠ lus' : ' ⚠'}
                  </span>
                );
              })}
            </div>
            {t.note && <div style={{ color: '#b45309', marginTop: 4 }}>⚠ {t.note}</div>}
          </div>
        ))}
        {takes.length > 0 && (
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 8px' }}>
            Golfvorm: sleep een rode grens · dubbelklik splitst · shift-klik op een rode grens voegt samen · klik in een vak
            speelt dat vak af · de groene balk is de lus: sleep de uiteinden, klik erop (of op de lettergreep eronder)
            om hem te horen zoals ZANG hem aanhoudt.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <label>Naam <input value={name} maxLength={27} style={{ width: 160 }}
            onChange={(e) => setName(e.target.value)} /></label>
          <span style={{ color: '#64748b' }}>{total} lettergrepen</span>
          <label style={{ marginLeft: 'auto' }}>bank <input type="number" min={0} max={15} value={bankNo} style={{ width: 48 }}
            onChange={(e) => setBankNo(Math.max(0, Math.min(15, Number(e.target.value))))} /></label>
          <button onClick={() => void toBank()} disabled={total === 0}
            title={linked
              ? 'In de simulator (bewaard in deze browser) én op de SD-kaart van de Teensy, onder dit nummer'
              : 'In de simulator, bewaard in deze browser, onder dit nummer. Met een Teensy aan de kabel gaat hij ook naar de SD-kaart.'}>
            → Bank {String(bankNo).padStart(2, '0')}{linked ? ' (sim + Teensy)' : ''}
          </button>
          <button onClick={download} disabled={total === 0}
            title="Als NN.mmbl bewaren, om mee te nemen of op de SD-kaart in /mmb/lyrics te zetten">⤓ .mmbl</button>
        </div>

        <div style={{ minHeight: 18, marginTop: 8, color: status.startsWith('mislukt') ? '#b91c1c' : '#334155' }}>{status}</div>
        {rows.length > 0 && (
          <table style={{ marginTop: 8, fontSize: 12, color: '#475569', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: '#94a3b8' }}>
              <th style={{ paddingRight: 12 }}>bank</th><th style={{ paddingRight: 12 }}>simulator</th>{cardNames && <th style={{ paddingRight: 12 }}>Teensy (SD-kaart)</th>}<th />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nn} style={{ background: r.nn === bankNo ? '#fef3c7' : undefined }}>
                  <td style={{ paddingRight: 12, fontFamily: 'monospace' }}>{String(r.nn).padStart(2, '0')}</td>
                  <td style={{ paddingRight: 12 }}>{r.sim ?? <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                  {cardNames && <td style={{ paddingRight: 12 }}>
                    {r.card ?? <span style={{ color: '#cbd5e1' }}>—</span>}
                    {r.sim && r.card && r.sim !== r.card && <span style={{ color: '#b45309' }} title="De simulator en de Teensy hebben onder dit nummer een andere bank"> ≠</span>}
                  </td>}
                  <td>
                    <button onClick={() => setBankNo(r.nn)} title="Dit nummer kiezen" style={{ fontSize: 11 }}>kies</button>{' '}
                    {r.sim && <button onClick={() => void deleteSimLyricBank(r.nn)} title="Uit de simulator en de browseropslag halen" style={{ fontSize: 11 }}>✕ sim</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ color: '#94a3b8', marginTop: 10, marginBottom: 0, fontSize: 12 }}>
          Eén nummer voor beide kanten: <strong>→ Bank</strong> zet de bank onder dat nummer in de simulator (bewaard in
          deze browser) en, als de Teensy verbonden is, ook op de SD-kaart als <code>/mmb/lyrics/NN.mmbl</code>. De knop
          <strong> Bank</strong> van ZANG kiest het nummer en het paneel toont de naam. In de patch staat alleen het
          nummer; het bestand (⤓ .mmbl) is wat je bewaart en meeneemt.
        </p>
      </div>
    </div>
  );
}
