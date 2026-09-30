// "Ga naar rack": vanuit de patcher naar het Rack-tabblad springen met de
// module geselecteerd. De patcher vraagt het aan, ModularMbApp wisselt van
// tabblad (en actief rack), RackPanel pakt bij het tonen de module op.

const EVENT = 'mmb-goto-rack';
let pending: string | null = null;

/** Vraag aan om naar het rack van deze module te gaan en hem te selecteren. */
export function requestRackFocus(moduleId: string): void {
  pending = moduleId;
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: moduleId }));
}

/** Luister naar aanvragen (ModularMbApp); geeft een opruimfunctie terug. */
export function onRackFocus(fn: (moduleId: string) => void): () => void {
  const h = (e: Event): void => fn((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** De openstaande aanvraag ophalen en wissen (RackPanel). */
export function takeRackFocus(): string | null {
  const id = pending;
  pending = null;
  return id;
}
