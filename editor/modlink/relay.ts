// modlink — doorgeefluik tussen bedieningsvlakken en klanken.
//
// Een "surface" is iets waarmee je moduleert: een telefoon, straks een Wacom
// of een ander aanraakvlak. Een "host" is iets dat klinkt: nu de snaarbank,
// later een modulator-tab in de MusicBrain-editor.
//
// Over de draad gaan MIDI-CC-vormige berichten: een nummer en een waarde van
// 0 tot 1. Dat is bewust. Wie dit doorgeefluik later vervangt door een echte
// virtuele MIDI-poort hoeft aan de pagina's niets te veranderen.
//
// Wire-formaat, JSON, beide richtingen:
//   → {t:"hello", role:"surface"|"host", name}   eerste bericht van elke client
//   ← {t:"welcome", id, slot, ccBase, ccCount}   antwoord van het doorgeefluik
//   ← {t:"peers", list:[{id, role, name, slot}]} bij elke verandering
//   → {t:"v", cc, v}        waarde 0..1  — van surfaces, naar alle hosts
//   → {t:"labels", items:[{cc, label}]}  — van hosts, naar alle surfaces
//
// Bedieningsvlak n krijgt CC ccBase..ccBase+ccCount-1. De Elements-firmware
// gebruikt niets boven CC 32, dus vanaf 40 zit niemand elkaar in de weg.

import type { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

export const MODLINK_PATH = '/modlink';
export const CC_BASE = 40;
export const CC_PER_SURFACE = 6;   // 3 aanraakpunten x 2 assen

type Role = 'surface' | 'host';

interface Client {
  id: number;
  role: Role;
  name: string;
  slot: number;          // 0 voor hosts, 1.. voor bedieningsvlakken
  ws: WebSocket;
  alive: boolean;
}

export function ccBaseForSlot(slot: number): number {
  return CC_BASE + (slot - 1) * CC_PER_SURFACE;
}

export function modlinkRelay(): Plugin {
  return {
    name: 'musicbrain-modlink',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const clients = new Map<number, Client>();
      let nextId = 1;

      const send = (ws: WebSocket, msg: unknown) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      };
      const toRole = (role: Role, msg: unknown) => {
        for (const c of clients.values()) if (c.role === role) send(c.ws, msg);
      };

      // Het laagste vrije nummer, zodat een telefoon die opnieuw verbindt
      // meestal zijn oude plek en dus zijn oude CC's terugkrijgt.
      const freeSlot = (): number => {
        const taken = new Set<number>();
        for (const c of clients.values()) if (c.role === 'surface') taken.add(c.slot);
        let s = 1;
        while (taken.has(s)) s++;
        return s;
      };

      const peers = () => ({
        t: 'peers',
        list: [...clients.values()].map((c) => ({
          id: c.id, role: c.role, name: c.name, slot: c.slot,
          ccBase: c.role === 'surface' ? ccBaseForSlot(c.slot) : 0,
          ccCount: c.role === 'surface' ? CC_PER_SURFACE : 0,
        })),
      });
      const announce = () => { const p = peers(); for (const c of clients.values()) send(c.ws, p); };

      wss.on('connection', (ws: WebSocket) => {
        let me: Client | null = null;

        ws.on('message', (raw) => {
          let msg: Record<string, unknown>;
          try { msg = JSON.parse(String(raw)); } catch { return; }

          if (msg.t === 'hello') {
            if (me) return;                            // één keer per verbinding
            const role: Role = msg.role === 'host' ? 'host' : 'surface';
            me = {
              id: nextId++, role,
              name: typeof msg.name === 'string' ? msg.name.slice(0, 40) : role,
              slot: role === 'surface' ? freeSlot() : 0,
              ws, alive: true,
            };
            clients.set(me.id, me);
            send(ws, {
              t: 'welcome', id: me.id, slot: me.slot,
              ccBase: me.role === 'surface' ? ccBaseForSlot(me.slot) : 0,
              ccCount: me.role === 'surface' ? CC_PER_SURFACE : 0,
            });
            announce();
            server.config.logger.info(
              `[modlink] ${me.role} ${me.id} "${me.name}"` +
              (me.role === 'surface' ? ` → CC ${ccBaseForSlot(me.slot)}..${ccBaseForSlot(me.slot) + CC_PER_SURFACE - 1}` : ''),
            );
            return;
          }

          if (!me) return;                             // niets doorgeven vóór hello
          if (msg.t === 'v' && me.role === 'surface') toRole('host', msg);
          else if (msg.t === 'labels' && me.role === 'host') toRole('surface', msg);
        });

        ws.on('pong', () => { if (me) me.alive = true; });
        ws.on('close', () => {
          if (!me) return;
          clients.delete(me.id);
          server.config.logger.info(`[modlink] ${me.role} ${me.id} weg`);
          announce();
        });
        ws.on('error', () => { /* close volgt vanzelf */ });
      });

      // Een telefoon die in slaap valt sluit de verbinding niet netjes af;
      // zonder deze klop blijft zijn plek bezet.
      const beat = setInterval(() => {
        for (const c of clients.values()) {
          if (!c.alive) { c.ws.terminate(); continue; }
          c.alive = false;
          try { c.ws.ping(); } catch { /* terminate volgt */ }
        }
      }, 15000);
      beat.unref?.();

      server.httpServer?.on('upgrade', (req, socket, head) => {
        let path = '';
        try { path = new URL(req.url ?? '', 'http://localhost').pathname; } catch { return; }
        if (path !== MODLINK_PATH) return;             // HMR van Vite ongemoeid laten
        wss.handleUpgrade(req, socket as never, head, (ws) => wss.emit('connection', ws));
      });

      server.httpServer?.on('close', () => { clearInterval(beat); wss.close(); });
    },
  };
}
