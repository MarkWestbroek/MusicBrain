// FrontPanel — tekent een patch-front als virtueel paneel met `ModulePanel`
// en schrijft knopbewegingen via het ene schrijfpad (setPatchControl) naar
// de patch, met poly-fan-out en live naar de Teensy. De simulator hoort de
// wijziging via de store; de live waarden van engine of Teensy komen hier
// als overlay terug, zoals in de patcher.

import { useMemo } from 'react';

import { ModulePanel } from './ModulePanel';
import { buildFrontModule, frontControlState } from './frontPanel';
import { setPatchControl } from './setPatchControl';
import { useEngineStatus } from './sim/engineSingleton';
import type { ControlValue, ModularProject, Patch, PatchFront, Port } from './types';

export function FrontPanel({ front, patch, project, pxPerMm = 3, onPortClick }: {
  front: PatchFront; patch: Patch; project: ModularProject; pxPerMm?: number;
  /** Klik op een jack van de black box; krijgt de echte (module, poort). */
  onPortClick?: (moduleId: string, portId: string, port: Port) => void;
}): JSX.Element {
  const fm = useMemo(() => buildFrontModule(front, patch, project), [front, patch.controlLabels, project.modules, project.moduleTypes]);
  const live = useEngineStatus().liveControls;
  const controlState = frontControlState(fm, patch, live);

  function onControlChange(vid: string, value: ControlValue): void {
    const t = fm.map[vid];
    if (!t || t.kind !== 'control') return;
    setPatchControl(patch.id, t.moduleId, t.controlId, value);
  }

  return (
    <div className="mb-front" style={{ width: fm.widthMm * pxPerMm, maxWidth: '100%' }}>
      <style>{`.mb-front > svg { width: 100%; height: auto; }`}</style>
      <ModulePanel
      module={fm.module}
      types={[fm.type]}
      controlState={controlState}
      onControlChange={onControlChange}
      onPortClick={onPortClick ? (vid, port) => {
        const t = fm.map[vid];
        if (t?.kind === 'port') onPortClick(t.moduleId, t.portId, port);
      } : undefined}
      pxPerMm={pxPerMm}
      />
    </div>
  );
}
