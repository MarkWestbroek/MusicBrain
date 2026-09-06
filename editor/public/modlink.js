// modlink-client — gedeeld door de snaarbank en de telefoonpagina.
//
// Bewust een los ES-modulebestand zonder afhankelijkheden: de pagina's in
// public/ hebben geen bouwstap, en een toekomstige modulator-tab in de
// MusicBrain-editor kan hem er net zo goed bij laden. Het protocol staat
// beschreven in editor/modlink/relay.ts.

export const MODLINK_PATH = "/modlink";

/**
 * Verbind met het doorgeefluik. Valt vanzelf terug op opnieuw proberen, want
 * een telefoon die in slaap valt of even van netwerk wisselt is normaal.
 *
 * @param {object} o
 * @param {"surface"|"host"} o.role
 * @param {string}   o.name        naam die de anderen te zien krijgen
 * @param {function} [o.onWelcome] (info) — eigen id, slot en CC-bereik
 * @param {function} [o.onPeers]   (list) — wie er nog meer verbonden zijn
 * @param {function} [o.onValue]   ({cc, v}) — alleen bij role "host"
 * @param {function} [o.onLabels]  (items)  — alleen bij role "surface"
 * @param {function} [o.onState]   ("verbinden"|"verbonden"|"weg")
 */
export function connect(o) {
  var ws = null, closed = false, tries = 0, timer = null;
  var api = { id: 0, slot: 0, ccBase: 0, ccCount: 0, peers: [], state: "verbinden" };

  function setState(s) {
    if (api.state === s) return;
    api.state = s;
    if (o.onState) o.onState(s);
  }

  function open() {
    if (closed) return;
    setState("verbinden");
    var proto = location.protocol === "https:" ? "wss" : "ws";
    try { ws = new WebSocket(proto + "://" + location.host + MODLINK_PATH); }
    catch (err) { return retry(); }

    ws.onopen = function () {
      tries = 0;
      ws.send(JSON.stringify({ t: "hello", role: o.role, name: o.name }));
    };
    ws.onmessage = function (e) {
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.t === "welcome") {
        api.id = m.id; api.slot = m.slot; api.ccBase = m.ccBase; api.ccCount = m.ccCount;
        setState("verbonden");
        if (o.onWelcome) o.onWelcome(m);
      } else if (m.t === "peers") {
        api.peers = m.list || [];
        if (o.onPeers) o.onPeers(api.peers);
      } else if (m.t === "v" && o.onValue) {
        o.onValue(m);
      } else if (m.t === "labels" && o.onLabels) {
        o.onLabels(m.items || []);
      }
    };
    ws.onclose = function () { ws = null; setState("weg"); retry(); };
    ws.onerror = function () { if (ws) try { ws.close(); } catch (err) { /* onclose volgt */ } };
  }

  function retry() {
    if (closed || timer) return;
    tries++;
    // Snel bij een hik, rustig als de server echt weg is.
    var wait = Math.min(8000, 300 * Math.pow(1.7, Math.min(tries, 8)));
    timer = setTimeout(function () { timer = null; open(); }, wait);
  }

  function send(msg) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  api.sendValue = function (cc, v) { return send({ t: "v", cc: cc, v: v }); };
  api.sendLabels = function (items) { return send({ t: "labels", items: items }); };
  api.close = function () {
    closed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (ws) try { ws.close(); } catch (err) { /* al dicht */ }
  };

  open();
  return api;
}
