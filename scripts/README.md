# scripts/

Hulpscripts voor het MusicBrain-project.

## export-copilot-chats.py

Exporteert VS Code Copilot Chat-sessies naar leesbare Markdown bestanden in
`doc/copilot-chats/exports/`.

### Gebruik

```powershell
# Exporteer nieuwe/gewijzigde sessies
python scripts/export-copilot-chats.py

# Exporteer alles opnieuw (ook ongewijzigde sessies)
python scripts/export-copilot-chats.py --force
```

Of via de VS Code Task: **Export Copilot Chats**.

### Ondersteunde JSONL-formaten

Het script verwerkt twee VS Code chat-opslagformaten:

| Formaat | Beschrijving |
|---|---|
| **Compact-snapshot** | Verse sessies: `kind=null` snapshot + `kind=list` patches |
| **Oud incrementeel** | Gecomprimeerde sessies: `kind=0/1/2` met k/v patches |

#### Streaming-respons reconstructie (oud formaat)

In het oude formaat worden respons-items via `kind=2` streaming-patches aangeleverd.
Deze patches zijn **delta-patches** (elke patch bevat alleen de nieuw toegevoegde
items, niet de volledige respons opnieuw). De strategie:

1. **Geconsolideerde response** (`requestId`-item): bevat de embedded respons die
   aanwezig is op het moment dat het verzoek in de journal staat. Wordt als
   fallback gebruikt als er geen streaming-patches zijn.
2. **Streaming-patches** (`k=['requests', N, 'response']`): worden geaccumuleerd
   met `current_response_parts.extend(...)`.
3. **Flush**: bij een nieuwe request wordt de lopende respons afgerond.
   - Als streaming-patches aanwezig zijn: die worden gebruikt (meest compleet).
   - Anders: de geconsolideerde response als fallback.
4. **`_cons_has_text`-vlag**: als de geconsolideerde response echte tekst bevat
   (niet alleen tool-statusregels), worden streaming-patches genegeerd om
   dubbeling van inhoud te voorkomen.

#### Tool-statusregels

Afgeronde tool-aanroepen (`toolInvocationSerialized`, `isComplete=True`) worden
getoond als cursieve statusregels:

```
*Read foo.py · Read bar.py*                     (≤4 tools)

<details>
<summary><em>Read foo.py</em> (+7 meer)</summary>  (>4 tools)
- Read foo.py
- ...
</details>
```

#### Inline bestandsreferenties

`inlineReference`-items worden getoond als `\`bestandsnaam\`` inline.

### Lege code-block artefacten

`textEditGroup`- en `codeblockUri`-items worden overgeslagen. Ze zijn omgeven
door ` ``` `- fences in de response-tekst. Na het samenvoegen worden overblijvende
lege code-blocks verwijderd door `_remove_empty_fences()`.

---

## run-chat-backup.ps1

PowerShell-wrapper die `export-copilot-chats.py` aanroept.

```powershell
.\scripts\run-chat-backup.ps1              # normaal exporteren
.\scripts\run-chat-backup.ps1 -Force       # alles opnieuw exporteren
.\scripts\run-chat-backup.ps1 -OpenExports # open exports-map na afloop
```

---

## install-chat-hook.ps1

Installeert `pre-commit-chat-export` als git pre-commit hook, zodat de export
automatisch wordt bijgewerkt bij elke commit.

```powershell
.\scripts\install-chat-hook.ps1
```

---

## pre-commit-chat-export

Git pre-commit hook (shell-script). Wordt geïnstalleerd naar `.git/hooks/`.
Roept `export-copilot-chats.py` aan en voegt gewijzigde export-bestanden toe
aan de commit.
