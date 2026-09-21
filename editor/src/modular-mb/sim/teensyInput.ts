// Welke audio-ingang is de Teensy? Los van de engine, zodat het zonder
// browser te testen is.
//
// Windows geeft hetzelfde apparaat drie keer door: als "Default - …", als
// "Communications - …" en onder zijn eigen naam. De twee aliassen volgen wat
// Windows op dat moment als standaard ziet — prik je op "default" en iemand
// zet morgen een headset als standaard, dan vergelijk je ineens met de
// headset. Dus: het echte apparaat, op naam. Voor Windows heet de Teensy
// "Digital Audio Interface (2- Teensy MIDI/Audio)"; op de Mac "Teensy MIDI/Audio".

/** Het minimum van een MediaDeviceInfo dat we nodig hebben. */
export interface InputDevice { deviceId: string; kind: string; label: string }

const ALIASES = new Set(['default', 'communications']);

export function pickTeensyInput<T extends InputDevice>(devices: readonly T[]): T | undefined {
  return devices.find((d) => d.kind === 'audioinput'
    && /teensy/i.test(d.label)
    && !ALIASES.has(d.deviceId));
}
