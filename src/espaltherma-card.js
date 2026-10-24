// ESPAltherma card and dashboard for Home Assistant: the live drawing of the heating installation of the
// ESPAltherma web page, fed by the entities ESPAltherma publishes through MQTT discovery.
//   card:      type: custom:espaltherma-card   (options: climate, entities: {key: entity_id})
//   dashboard: strategy: {type: custom:espaltherma}   (options: climate)
const VERSION = "1.0.16";

// Entities, by the ids ESPAltherma's discovery gives them (built from the English labels, the same everywhere);
// the Rotex definition names the leaving water and the 3-way valve its own way, the Hybrid, EBLQ 5-7kW and EWAQ ones
// the leaving water (and the Hybrid the room temperature), the ECH2O ones the water temperatures ("[HPSU] Tv inflow
// Temp (R1T)", "[HPSU] Tvbh inflow Temp after Buffer/BUH (R2T)", "[HPSU] Tr return Temp (R4T)")
const FIND = {
  out: /^sensor\.espaltherma_.*outdoor_air_temp/, lw1: /^sensor\.espaltherma_(leaving_water_temp_before_buh|outlet_water_temp|outlet_water_heat_exch_temp|hpsu_tv_inflow_temp)/,
  lw2: /^sensor\.espaltherma_(leaving_water_temp_after_buh|outlet_water_buh_temp|hpsu_tvbh_inflow_temp)/, r3t: /^sensor\.espaltherma_refrig_temp_liquid_side/,
  inlet: /^sensor\.espaltherma_(inlet_water_temp|hpsu_tr_return_temp)/, tank: /^sensor\.espaltherma_dhw_tank_temp/,
  room: /^sensor\.espaltherma_(indoor_ambient_temp|rt_temp$)/, dhwSp: /^sensor\.espaltherma_dhw_setpoint$/,
  lwSp: /^sensor\.espaltherma_lw_setpoint_main/, rtSp: /^sensor\.espaltherma_rt_setpoint$/,
  inv: /^sensor\.espaltherma_inv_frequency/, amp: /^sensor\.espaltherma_inv_primary_current/,
  v3: /^binary_sensor\.espaltherma_(3way_valve|priority_to_domestic_water)/, pump: /^binary_sensor\.espaltherma_water_pump_operation/,
  flow: /^sensor\.espaltherma_flow_sensor/, bar: /^sensor\.espaltherma_water_pressure$/,
  // "Error type" of the outdoor unit, named "O/U Error type" once told apart from the indoor unit's "I/U Error type"
  // (ESPAltherma #617)
  mode: /^sensor\.espaltherma_operation_mode$/, err: /^sensor\.espaltherma_(ou_)?error_type$/, iuErr: /^sensor\.espaltherma_iu_error_type$/,
  defrost: /^binary_sensor\.espaltherma_defrost_operation$/,
  // two-zone units: the mixed zone's temperature after its valve, its pump, the direct zone's pump and target
  mixed: /^sensor\.espaltherma_mixed_water_temp/, mainPump: /^binary_sensor\.espaltherma_main_pump$/,
  addPump: /^binary_sensor\.espaltherma_add_pump$/, lwSpAdd: /^sensor\.espaltherma_lw_setpoint_add/,
  // the hot water and leaving water targets, when the unit allows setting them (experimental options of ESPAltherma)
  dhwSet: /^number\.[a-z0-9_]*hot_water_target$/, lwtSet: /^number\.[a-z0-9_]*leaving_water_target$/,
  // the Altherma 4 has its refrigerant liquid side in the outdoor unit: the liquid pipe, when there is no R3T
  r6t: /^sensor\.espaltherma_liquid_pipe_tempr6t/,
};

const I18N = /*I18N*/{};
// Texts of the dashboard that the web page does not have
const OWN = {
  fr: {"Mode": "Mode", "Error": "Erreur", "Current": "Courant", "Open the web interface": "Ouvrir l'interface web",
    "Lower the hot water target": "Baisser la consigne d'eau chaude", "Raise the hot water target": "Monter la consigne d'eau chaude",
    "Lower the leaving water target": "Baisser la consigne de départ d'eau", "Raise the leaving water target": "Monter la consigne de départ d'eau"},
  de: {"Mode": "Betriebsart", "Error": "Fehler", "Current": "Strom", "Open the web interface": "Weboberfläche öffnen",
    "Lower the hot water target": "Warmwasser-Sollwert senken", "Raise the hot water target": "Warmwasser-Sollwert anheben",
    "Lower the leaving water target": "Vorlauf-Sollwert senken", "Raise the leaving water target": "Vorlauf-Sollwert anheben"},
  it: {"Mode": "Modalità", "Error": "Errore", "Current": "Corrente", "Open the web interface": "Aprire l'interfaccia web",
    "Lower the hot water target": "Abbassare la temperatura desiderata dell'acqua calda", "Raise the hot water target": "Alzare la temperatura desiderata dell'acqua calda",
    "Lower the leaving water target": "Abbassare la temperatura di mandata desiderata", "Raise the leaving water target": "Alzare la temperatura di mandata desiderata"},
  es: {"Mode": "Modo", "Error": "Error", "Current": "Corriente", "Open the web interface": "Abrir la interfaz web",
    "Lower the hot water target": "Bajar la consigna de agua caliente", "Raise the hot water target": "Subir la consigna de agua caliente",
    "Lower the leaving water target": "Bajar la consigna de impulsión", "Raise the leaving water target": "Subir la consigna de impulsión"},
  nl: {"Mode": "Modus", "Error": "Fout", "Current": "Stroom", "Open the web interface": "Webinterface openen",
    "Lower the hot water target": "Warmwater-setpoint verlagen", "Raise the hot water target": "Warmwater-setpoint verhogen",
    "Lower the leaving water target": "Aanvoer-setpoint verlagen", "Raise the leaving water target": "Aanvoer-setpoint verhogen"},
};

// Shrinks an SVG text to max units wide (translations can be longer than the English the drawing was made for)
const fit = (el, max) => { el.style.fontSize = ''; const w = el.getComputedTextLength ? el.getComputedTextLength() : 0;
  if (w > max) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * max / w).toFixed(1) + 'px'; };

function tr(hass, s, p) {
  const lang = ((hass && (hass.locale && hass.locale.language || hass.language)) || "en").slice(0, 2);
  let r = (I18N[lang] && I18N[lang][s]) || (OWN[lang] && OWN[lang][s]) || s;
  if (p) r = r.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m));
  return r;
}

function findEntities(hass, config) {
  const ids = Object.keys(hass.states);
  const e = {};
  for (const [k, re] of Object.entries(FIND)) e[k] = ids.find(id => re.test(id));
  if (!e.r3t && e.r6t) e.r3t = e.r6t;
  Object.assign(e, (config && config.entities) || {});
  return e;
}

function defaultClimate(hass) {
  if (hass.states["climate.altherma"]) return "climate.altherma";
  // Daikin's own integration also exposes "leaving water offset" climates: not room thermostats
  const ids = Object.keys(hass.states).filter(id => id.startsWith("climate.") && /altherma|heat_?pump|daikin/i.test(id) && !/offset|leaving_?water/i.test(id));
  return ids.find(id => /room/i.test(id)) || ids[0];
}

// Water colour: blue (15°) to red (55°), the scale of the ESPAltherma web page
const SCALE = {light: ["#2e86de", "#737fb9", "#9e7494", "#c1626c", "#e0433a"], dark: ["#4f9cf0", "#8995ce", "#b18aaa", "#d37b85", "#f2645a"]};
function tcol(v, dark) {
  if (v == null || isNaN(v)) return "var(--divider-color)";
  const s = SCALE[dark ? "dark" : "light"].map(h => [1, 3, 5].map(j => parseInt(h.slice(j, j + 2), 16)));
  const x = Math.max(0, Math.min(1, (v - 15) / 40)) * 4, i = Math.min(3, Math.floor(x));
  return "rgb(" + s[i].map((c, j) => Math.round(c + (s[i + 1][j] - c) * (x - i))) + ")";
}

const TAGS = [["Outside", "out", 40, 118, 84], ["Heat pump out", "lw1", 342, 172, 110], ["Leaving", "lw2", 340, 38, 84],
  ["Refrigerant", "r3t", 156, 342, 96], ["Return", "inlet", 312, 418, 84], ["Flow", "flow", 316, 468, 98]];

const STYLE = `
:host{--ea-card:var(--ha-card-background,var(--card-background-color,#fff));--ea-ink:var(--primary-text-color);--ea-ink2:var(--secondary-text-color);
--ea-line:var(--divider-color);--ea-soft:var(--secondary-background-color);--ea-soft:color-mix(in srgb,var(--ea-ink) 7%,var(--ea-card));--ea-hot:#e0433a;--ea-cold:#2e86de;--ea-refr:#7d8597}
:host([dark]){--ea-hot:#f2645a;--ea-cold:#4f9cf0;--ea-refr:#979dac}
ha-card{padding:8px;overflow:hidden;position:relative}
.lnk{position:absolute;top:10px;right:14px;font-size:12px;color:var(--ea-ink2);text-decoration:none;opacity:.75}.lnk:hover{opacity:1;text-decoration:underline}
.wrap{overflow-x:auto}
svg{display:block;width:100%;height:auto;min-width:min(480px,100vw - 32px)} /* fits a phone's width instead of being cut */
.pipe{fill:none;stroke-width:7;stroke-linecap:round;stroke-linejoin:round;transition:stroke .8s}
.fl{fill:none;stroke:var(--ea-card);stroke-width:2.4;stroke-dasharray:2 16;stroke-linecap:round;opacity:0}
.flowing .act .fl{opacity:.95;animation:fl .9s linear infinite}
@keyframes fl{to{stroke-dashoffset:-18}}
.br{transition:opacity .6s}.br:not(.act){opacity:.28}
#gZones,.bz{display:none}svg.bizone #gZones,svg.bizone .bz{display:block}
svg.bizone #pSpace,svg.bizone #pSpace+.fl,svg.bizone #bSpace,svg.bizone #pLoop,svg.bizone #pLoop+.fl,svg.bizone .sz{display:none}svg.bizone #gGauge{transform:translate(-48px,-435px)}
#gZones .zoff{opacity:.3}#gZones .zoff .fl{animation:none;opacity:0}
/* no hot water tank or no room thermostat (none of their entities): left out, the supply joins the house */
svg.nodhw .dhw,svg.noroom .room,#pJoin,#pJoin+.fl{display:none}svg.nodhw #pJoin,svg.nodhw #pJoin+.fl{display:block}
.eq{fill:var(--ea-card);stroke:var(--ea-ink2);stroke-width:1.6}
.ln{fill:none;stroke:var(--ea-ink2);stroke-width:1.5}
.area{fill:var(--ea-soft);stroke:none}
.tag rect{fill:var(--ea-card);stroke:var(--ea-line);stroke-width:1.2}
.tag,.click,.btn{cursor:pointer}
.step rect{fill:var(--ea-card);stroke:var(--ea-line);stroke-width:1.2}.step .half{fill:transparent}.btn:hover .half{fill:var(--ea-soft)}.btn:active .half{fill:var(--ea-line)}
.step .sep{stroke:var(--ea-line);stroke-width:1}.step .sym{stroke:var(--ea-ink2);stroke-width:1.6;fill:none;stroke-linecap:round}
#gDhwSet,#gLwtSet,.eff{display:none}svg.cansetdhw #gDhwSet,svg.cansetlwt #gLwtSet,.eff.on{display:block}
svg.bizone #gLwtSet{display:none}
.step .half{transition:fill .15s}
.tl{font:600 12px var(--paper-font-body1_-_font-family,sans-serif);fill:var(--ea-ink2)}
.tv{font:600 18px var(--paper-font-body1_-_font-family,sans-serif);fill:var(--ea-ink)}
.tb{font:600 38px var(--paper-font-body1_-_font-family,sans-serif);fill:var(--ea-ink)}
.ts{font:500 13px var(--paper-font-body1_-_font-family,sans-serif);fill:var(--ea-ink2)}
#fan{transform-origin:95px 238px;animation:drift 26s ease-in-out infinite}
.fanon #fan{animation:spin 1.6s linear infinite}
@keyframes drift{0%{transform:rotate(0)}10%{transform:rotate(8deg)}18%{transform:rotate(6deg)}34%{transform:rotate(38deg)}42%{transform:rotate(44deg)}50%{transform:rotate(41deg)}68%{transform:rotate(82deg)}80%{transform:rotate(96deg)}90%{transform:rotate(104deg)}100%{transform:rotate(120deg)}}
@keyframes spin{to{transform:rotate(360deg)}}
.valve path{fill:var(--ea-card);stroke:var(--ea-ink2);stroke-width:1.5}.valve path.shut{fill:var(--ea-ink2)}
.comp #comp{fill:var(--primary-color);stroke:var(--primary-color)}
.sens{fill:var(--ea-ink2)}
@media (prefers-reduced-motion:reduce){.flowing .act .fl,#fan{animation:none!important}}`;

const SVG = `<svg viewBox="0 0 800 560" role="img">
<defs><linearGradient id="lg"><stop offset="0" class="s0"/><stop offset=".25" class="s1"/><stop offset=".5" class="s2"/><stop offset=".75" class="s3"/><stop offset="1" class="s4"/></linearGradient></defs>
<rect class="area" x="190" y="30" width="340" height="515" rx="26"/>
<text class="tl" x="210" y="56" data-t="Indoor unit"></text>
<text class="tl" x="95" y="392" text-anchor="middle" data-t="Outdoor unit"></text>
<rect class="eq" x="20" y="170" width="150" height="190" rx="18"/>
<circle class="ln" cx="95" cy="238" r="48"/>
<g id="fan" style="fill:var(--ea-cold);opacity:.8"><ellipse cx="95" cy="215" rx="8" ry="20"/><ellipse cx="95" cy="215" rx="8" ry="20" transform="rotate(120 95 238)"/><ellipse cx="95" cy="215" rx="8" ry="20" transform="rotate(240 95 238)"/></g>
<circle cx="95" cy="238" r="5" class="eq"/>
<g class="click" data-key="inv"><rect class="eq" x="33" y="310" width="13" height="30" rx="6.5"/><path class="ln" d="M46 331H52"/>
<rect class="eq" id="comp" x="52" y="300" width="30" height="50" rx="12"/>
<text class="tl" x="92" y="318" id="lComp" data-t="Compressor"></text>
<text class="tv" x="92" y="340" id="sInv"></text></g>
<path d="M170 240H230M170 330H230" style="stroke:var(--ea-refr);stroke-width:7;fill:none;stroke-linecap:round"/>
<path d="M170 240H230M170 330H230" style="stroke:var(--ea-card);stroke-width:3;fill:none"/>
<circle class="sens" cx="206" cy="330" r="4.5"/>
<rect class="eq" x="230" y="200" width="40" height="160" rx="8"/>
<path class="ln" d="M234 212l32 12-32 12 32 12-32 12 32 12-32 12 32 12-32 12 32 12-32 12 32 12"/>
<text class="tl" x="250" y="192" text-anchor="middle" data-t="Heat exchanger"></text>
<g id="gMain" class="br act"><path class="pipe" id="pSup" d="M270 220H330V90H470"/><path class="pipe" id="pRet" d="M572 525H300V340H270"/></g>
<rect class="eq" x="318" y="108" width="24" height="54" rx="8"/>
<path class="ln" d="M330 114v4l-6 4 12 6-12 6 12 6-12 6 6 4v6" style="stroke:var(--ea-hot)"/>
<text class="tl" x="310" y="140" text-anchor="end" data-t="Backup heater"></text>
<g class="click dhw" data-key="tank"><rect class="eq" x="590" y="28" width="150" height="236" rx="34"/>
<rect id="tankFill" x="594" y="32" width="142" height="228" rx="31" style="opacity:.2"/></g>
<path class="eq" d="M580 360L685 292L790 360V540H580Z" style="stroke-linejoin:round"/>
<path class="ln bz" d="M580 452H790"/>
<g id="gDhw" class="br dhw"><path class="pipe" id="pDhw" d="M494 90H598"/>
<path class="pipe" id="pCoil" style="stroke-width:4.5" d="M598 90l40 10-36 14 36 14-36 14 36 14-36 14 36 14-36 14 36 14-36 14-12 4"/>
<path class="pipe" id="pDhwR" d="M590 232H555V525"/></g>
<path id="bSpace" class="dhw" d="M547 400H563" style="stroke:var(--ea-card);stroke-width:14"/>
<path class="bz dhw" d="M547 380H563M547 424H563M547 470H563" style="stroke:var(--ea-card);stroke-width:14"/>
<g id="gSp" class="br act"><path class="pipe" id="pJoin" d="M470 90H482V102"/><path class="pipe" id="pSpace" d="M482 102V400H600V485"/><path class="pipe" id="pLoop" style="stroke-width:4.5" d="M600 485H770V498H612V511H770V525H572"/>
<g id="gZones"><path class="pipe" id="pTrunk" d="M482 102V415"/>
<g id="gDirect" class="click" data-key="addPump"><path class="pipe" id="pDirect" d="M482 380H598"/>
<rect class="eq" x="598" y="372" width="50" height="40" rx="4"/><path class="ln" d="M607 378V406M615 378V406M623 378V406M631 378V406M639 378V406"/>
<path class="pipe" id="pDirectR" d="M598 402H572V525"/></g>
<path d="M565 424H579M565 470H579" style="stroke:var(--ea-card);stroke-width:14"/>
<g id="gMixed"><g class="click" data-key="mainPump"><path class="pipe" id="pMixed" d="M494 424H600V476"/>
<path class="pipe" id="pLoopM" style="stroke-width:4.5" d="M600 476H686V490H612V504H686V518H600"/>
<path class="pipe" id="pMixedR" d="M600 518H588V470H464V525"/>
<path class="pipe" id="pBypass" d="M482 470V433"/>
<circle class="sens" cx="528" cy="424" r="4.5"/>
<circle class="eq" cx="525" cy="470" r="9"/><path d="M516 470l13-7.5v15z" style="fill:var(--ea-ink2)"/>
<g class="valve"><path d="M473 415H491L482 424Z"/><path d="M473 433H491L482 424Z"/><path d="M494 415V433L482 424Z"/></g></g>
<g class="click" data-key="mixed"><text class="tl" x="474" y="386" text-anchor="end" data-t="Mixed water"></text>
<text class="tv" x="474" y="404" text-anchor="end"><tspan id="sMixed"></tspan><tspan class="ts" dx="6" id="sLwSpMix"></tspan></text></g></g></g></g>
<g class="valve dhw"><path id="vL" d="M470 81V99L482 90Z"/><path id="vR" class="shut" d="M494 81V99L482 90Z"/><path id="vB" d="M473 102H491L482 90Z"/></g>
<text class="tl dhw" x="494" y="128" data-t="3-way valve"></text><text class="ts dhw" x="494" y="145" id="sV3"></text>
<circle class="eq" cx="440" cy="525" r="16"/><path d="M425 525l21-12v24z" style="fill:var(--ea-ink2)"/>
<text class="tl" x="440" y="556" text-anchor="middle" id="sPump"></text>
<g class="click" id="gGauge" data-key="bar"><path class="ln" d="M500 506V525"/><circle class="eq" cx="500" cy="492" r="14"/><path id="needle" class="ln" style="stroke:var(--ea-hot);stroke-width:2.2" d="M500 492L491 499"/>
<text class="tv" x="500" y="468" text-anchor="middle" id="sBar"></text></g>
<rect x="346" y="519" width="14" height="12" rx="3" style="fill:var(--ea-ink2)"/>
<circle class="sens" cx="330" cy="190" r="4.5"/><circle class="sens" cx="390" cy="90" r="4.5"/><circle class="sens" cx="300" cy="440" r="4.5"/>
<g id="tags"></g>
<g id="gLwtSet" class="step"><rect x="438" y="45" width="124" height="26" rx="13"/><path class="sep" d="M466 51v14M534 51v14"/><g class="btn" data-act="lwt-"><title data-t="Lower the leaving water target"></title><path class="half" d="M451 45h15v26h-15a13 13 0 0 1 0 -26z"/><path class="sym" d="M448 58h8"/></g><g class="btn" data-act="lwt+"><title data-t="Raise the leaving water target"></title><path class="half" d="M534 45h15a13 13 0 0 1 0 26h-15z"/><path class="sym" d="M544 58h8M548 54v8"/></g></g>
<text class="ts sz" x="500" y="62" text-anchor="middle" id="sLwSp" style="pointer-events:none"></text>
<text class="ts eff" x="500" y="82" text-anchor="middle" id="sLwtEff"><title id="tLwtEff"></title><tspan id="vLwtEff"></tspan></text>
<g id="gDhwSet" class="step"><rect x="603" y="155" width="124" height="26" rx="13"/><path class="sep" d="M631 161v14M699 161v14"/><g class="btn" data-act="dhw-"><title data-t="Lower the hot water target"></title><path class="half" d="M616 155h15v26h-15a13 13 0 0 1 0 -26z"/><path class="sym" d="M613 168h8"/></g><g class="btn" data-act="dhw+"><title data-t="Raise the hot water target"></title><path class="half" d="M699 155h15a13 13 0 0 1 0 26h-15z"/><path class="sym" d="M709 168h8M713 164v8"/></g></g>
<g class="click dhw" data-key="tank"><text class="tl" x="665" y="104" text-anchor="middle" data-t="Hot water"></text>
<text class="tb" x="665" y="148" text-anchor="middle" id="sTank"></text>
<text class="ts" x="665" y="172" text-anchor="middle" id="sDhwSp"></text></g>
<text class="ts eff" x="665" y="192" text-anchor="middle" id="sDhwEff"><title id="tDhwEff"></title><tspan id="vDhwEff"></tspan></text>
<g class="click room sz" data-key="room"><text class="tl" x="685" y="390" text-anchor="middle" data-t="Living room"></text>
<text class="tb" x="685" y="432" text-anchor="middle" id="sRoom"></text>
<text class="ts" x="685" y="456" text-anchor="middle" id="sRtSp"></text></g>
<text class="tl bz" x="718" y="392" text-anchor="middle" data-t="Direct zone"></text>
<text class="ts bz" x="718" y="414" text-anchor="middle" id="sZoneDir"></text>
<text class="tl bz" x="738" y="474" text-anchor="middle" data-t="Mixed zone"></text>
<g class="click room bz" data-key="room"><text class="tb" x="738" y="507" text-anchor="middle" id="sRoomB" style="font-size:30px"></text>
<text class="ts" x="738" y="528" text-anchor="middle" id="sRtSpB"></text></g>
<rect x="24" y="488" width="136" height="7" rx="3.5" fill="url(#lg)"/>
<text class="ts" x="24" y="512">15°</text><text class="ts" x="92" y="512" text-anchor="middle">35°</text><text class="ts" x="160" y="512" text-anchor="end">55°</text>
<text class="tl" x="24" y="478" data-t="Water temperature"></text>
</svg>`;

class EspalthermaCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) this._build();
    this._paint();
  }

  _build() {
    this._root = this.attachShadow({mode: "open"});
    this._root.innerHTML = `<style>${STYLE}</style><ha-card${this._config.title ? ` header="${this._config.title}"` : ""}><a class="lnk" id="lnk" target="_blank" rel="noopener" hidden>ESPAltherma ↗</a><div class="wrap">${SVG}</div></ha-card>`;
    const q = s => this._root.querySelector(s);
    q("#tags").innerHTML = TAGS.map(g => `<g class="tag" data-key="${g[1]}" transform="translate(${g[2]},${g[3]})"><rect width="${g[4]}" height="46" rx="14"/><text class="tl" x="12" y="18" style="font-size:11.5px" data-t="${g[0]}"></text><text class="tv" x="12" y="38" id="g_${g[1]}"></text></g>`).join("");
    this._root.querySelectorAll(".pipe").forEach(p => { const c = p.cloneNode(); c.removeAttribute("id"); c.setAttribute("class", "fl"); p.after(c); });
    // A tap on a reading opens its history; the hot water buttons change the target
    this._root.addEventListener("click", ev => {
      const path = ev.composedPath();
      const b = path.find(n => n.dataset && n.dataset.act);
      if (b) { this._nudge(b.dataset.act.slice(0, 3) + "Set", b.dataset.act.endsWith("+") ? 1 : -1); return; }
      const g = path.find(n => n.dataset && n.dataset.key);
      if (!g) return;
      const k = g.dataset.key;
      const id = (k === "room" && this._climate) ? this._climate : this._ent && this._ent[k];
      if (id) this.dispatchEvent(new CustomEvent("hass-more-info", {bubbles: true, composed: true, detail: {entityId: id}}));
    });
  }

  // One step warmer or colder on a target (key "dhwSet" or "lwtSet"). The heat pump takes a few seconds to
  // confirm, so the asked value is shown meanwhile, and another tap starts from it.
  _nudge(key, dir) {
    const hass = this._hass, id = this._ent && this._ent[key], s = id && hass.states[id];
    if (!s) return;
    const asked = this._asked || (this._asked = {}), at = this._askedAt || (this._askedAt = {});
    const a = s.attributes, step = parseFloat(a.step) || 1;
    const from = asked[key] != null ? asked[key] : parseFloat(s.state);
    if (isNaN(from)) return;
    let v = from + dir * step;
    if (a.min != null) v = Math.max(parseFloat(a.min), v);
    if (a.max != null) v = Math.min(parseFloat(a.max), v);
    if (v === from) return;
    asked[key] = v;
    at[key] = Date.now();
    hass.callService("number", "set_value", {entity_id: id, value: v});
    this._paint();
    clearTimeout(this._askedTimer);
    this._askedTimer = setTimeout(() => this._paint(), 31000); // drops the asked values if nothing comes back
  }

  // The target to show for a settable entity: the asked value until the heat pump reports it back
  _shown(key, s) {
    const v = s ? parseFloat(s.state) : NaN;
    const asked = this._asked || {}, at = this._askedAt || {};
    if (asked[key] != null && (v === asked[key] || Date.now() - at[key] > 30000)) asked[key] = null;
    return asked[key] != null ? asked[key] : v;
  }

  // The effective target line under a target: what the thermostat really aims for, explained on hover
  _effective(key, s, idEff, idVal, idTip) {
    const hass = this._hass, q = x => this._root.querySelector(x), a = s && s.attributes;
    const eff = a && a.effective != null ? parseFloat(a.effective) : NaN;
    q(idEff).classList.toggle("on", !isNaN(eff) && eff >= 0);
    if (isNaN(eff) || eff < 0) return;
    const ceiling = a.ceiling != null ? parseFloat(a.ceiling) : -1, target = parseFloat(s.state);
    const capped = ceiling >= 0 && eff < target && eff === ceiling;
    q(idVal).textContent = tr(hass, "Aims for {n} °C", {n: eff});
    q(idTip).textContent = key === "dhwSet"
      ? (capped ? tr(hass, "What the thermostat really aims for: at this outdoor temperature the heat pump reaches {n} °C on its own, the rest would need the booster heater.", {n: ceiling})
                : tr(hass, "What the thermostat really aims for, after the limits of the unit."))
      : tr(hass, "What the heat pump follows right now: the target, plus the shift and the room modulation set on the unit.");
  }

  _paint() {
    const hass = this._hass, root = this._root, q = s => root.querySelector(s);
    const ent = this._ent = findEntities(hass, this._config);
    this._climate = this._config.climate || defaultClimate(hass);
    const dark = !!(hass.themes && hass.themes.darkMode);
    this.toggleAttribute("dark", dark);
    root.querySelectorAll("#lg stop").forEach((s, i) => s.setAttribute("stop-color", SCALE[dark ? "dark" : "light"][i]));
    root.querySelectorAll("[data-t]").forEach(n => { n.textContent = tr(hass, n.dataset.t); });
    const st = k => ent[k] && hass.states[ent[k]];
    const n = k => { const s = st(k); const v = s ? parseFloat(s.state) : NaN; return isNaN(v) ? null : v; };
    // A link to the board's web interface: its address is an attribute of the readings sensor
    // (the AlthermaSensors entity, whatever its id: the one with ESPAltherma's IP and WifiRSSI attributes)
    const withIp = Object.values(hass.states).find(s => s.attributes && s.attributes.IP && s.attributes.WifiRSSI !== undefined);
    const ip = withIp && withIp.attributes.IP, lnk = q("#lnk");
    lnk.hidden = !ip;
    if (ip) { lnk.href = "http://" + ip + "/"; lnk.title = tr(hass, "Open the web interface"); }
    const on = k => { const s = st(k); return s ? s.state === "on" : null; };
    const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
    const deg = v => (v == null ? "—" : f1(v) + "°");
    const tx = (id, s) => { q("#" + id).textContent = s; };
    const clim = this._climate && hass.states[this._climate];
    for (const [, k] of TAGS) { const v = n(k); tx("g_" + k, k === "flow" ? (v == null ? "—" : f1(Math.max(0, v)) + " l/min") : deg(v)); }
    // A tank below 0 °C is no tank sensor (an open input reads about -37): the unit has no hot water tank
    const noTank = n("tank") != null && n("tank") < 0;
    const lw = n("lw2") != null ? n("lw2") : n("lw1"), ret = n("inlet"), tank = noTank ? null : n("tank");
    const mid = (a, b) => (a != null && b != null ? (a + b) / 2 : a);
    // Two zones (a direct one and a mixed one with its valve, pump and R7T) once the mixed water temperature reads
    // something: single-zone units answer 0 there
    const mixed = n("mixed"), two = mixed != null && mixed !== 0;
    q("svg").classList.toggle("bizone", two);
    // No hot water tank, no room thermostat: none of their entities (once the heat pump's are there)
    const has = k => !!st(k), unit = ["lw1", "lw2", "inlet", "out"].some(has);
    q("svg").classList.toggle("nodhw", unit && (!["tank", "dhwSp", "v3", "dhwSet"].some(has) || noTank && on("v3") !== true && !has("dhwSet")));
    q("svg").classList.toggle("noroom", unit && !clim && !["room", "rtSp"].some(has));
    [["pSup", lw], ["pJoin", lw], ["pDhw", lw], ["pCoil", mid(lw, tank)], ["pDhwR", ret], ["pSpace", lw], ["pLoop", mid(two ? mixed : lw, ret)], ["pRet", ret],
     ["pTrunk", lw], ["pDirect", lw], ["pDirectR", ret], ["pMixed", mixed], ["pLoopM", mid(mixed, ret)], ["pMixedR", ret], ["pBypass", ret]]
      .forEach(([id, v]) => { q("#" + id).style.stroke = tcol(v, dark); });
    q("#gDirect").classList.toggle("zoff", on("addPump") === false); q("#gMixed").classList.toggle("zoff", on("mainPump") === false);
    q("#tankFill").style.fill = tcol(tank, dark);
    const v3 = on("v3"), flow = n("flow"), pump = on("pump") || (flow || 0) > 0.5, inv = n("inv");
    const svg = q("svg");
    q("#gDhw").classList.toggle("act", !!v3); q("#gSp").classList.toggle("act", !v3);
    q("#vR").classList.toggle("shut", !v3); q("#vB").classList.toggle("shut", !!v3);
    svg.classList.toggle("flowing", !!pump); svg.classList.toggle("comp", inv > 0); svg.classList.toggle("fanon", inv > 0);
    tx("sInv", inv == null ? "" : inv > 0 ? inv + " rps" : tr(hass, "Resting"));
    // measured once displayed: a text not on screen yet has no width
    requestAnimationFrame(() => { fit(q("#lComp"), 70); fit(q("#sInv"), 70); });
    tx("sV3", v3 == null ? "" : v3 ? tr(hass, "to the hot water") : tr(hass, "to the house"));
    tx("sPump", on("pump") == null && flow == null ? "" : pump ? tr(hass, "Pump on") : tr(hass, "Pump off"));
    const bar = n("bar") || null; // exactly 0: no pressure sensor on the unit
    tx("sBar", bar == null ? "" : f1(bar) + " bar");
    const a = (-135 + (bar || 0) / 4 * 270) * Math.PI / 180;
    q("#needle").setAttribute("d", `M500 492L${(500 + 11 * Math.sin(a)).toFixed(1)} ${(492 - 11 * Math.cos(a)).toFixed(1)}`);
    tx("sTank", deg(tank));
    const room = clim && clim.attributes.current_temperature != null ? parseFloat(clim.attributes.current_temperature) : n("room");
    const target = clim && clim.state !== "off" && clim.attributes.temperature != null ? parseFloat(clim.attributes.temperature) : n("rtSp");
    tx("sRoom", deg(room)); tx("sRoomB", deg(room));
    const target_ = v => tr(hass, "Target {n}°", {n: Math.round(v * 10) / 10});
    const roomTarget = target != null ? target_(target) : clim && clim.state === "off" ? (hass.formatEntityState ? hass.formatEntityState(clim) : "off") : "";
    tx("sRtSp", roomTarget); tx("sRtSpB", roomTarget);
    // two zones: the direct one upstairs with its water target, the mixed one downstairs with the room
    tx("sZoneDir", n("lwSpAdd") != null ? target_(n("lwSpAdd")) : "");
    // Hot water target: the entity that sets it when there is one, otherwise the reading. The buttons appear
    // only when the heat pump accepts a target (ESPAltherma's experimental option).
    const set = st("dhwSet"), dhwShown = this._shown("dhwSet", set);
    q("svg").classList.toggle("cansetdhw", !!set && !isNaN(parseFloat(set.state)));
    const dhwSp = !isNaN(dhwShown) ? dhwShown : n("dhwSp");
    tx("sDhwSp", dhwSp != null && !isNaN(dhwSp) ? target_(dhwSp) : "");
    this._effective("dhwSet", set, "#sDhwEff", "#vDhwEff", "#tDhwEff");
    if (set) requestAnimationFrame(() => fit(q("#sDhwSp"), 76)); // keeps the text between the two buttons
    // The leaving water target: with two zones, the direct one's (the mixed zone has its own, shown at the valve).
    // On one zone it can be set the same way as the hot water target (the main zone's curve).
    const lwtSet = two ? null : st("lwtSet"), lwtShown = this._shown("lwtSet", lwtSet);
    q("svg").classList.toggle("cansetlwt", !!lwtSet && !isNaN(parseFloat(lwtSet.state)));
    const lwSpK = two && n("lwSpAdd") != null ? "lwSpAdd" : "lwSp";
    const lwSp = !isNaN(lwtShown) ? lwtShown : n(lwSpK);
    tx("sLwSp", lwSp != null && !isNaN(lwSp) ? target_(lwSp) : "");
    this._effective("lwtSet", lwtSet, "#sLwtEff", "#vLwtEff", "#tLwtEff");
    if (lwtSet) requestAnimationFrame(() => fit(q("#sLwSp"), 64));
    tx("sMixed", deg(mixed)); tx("sLwSpMix", n("lwSp") != null ? target_(n("lwSp")) : "");
  }

  getCardSize() { return 7; }
  getGridOptions() { return {columns: "full", min_columns: 6}; }
  static getStubConfig() { return {}; }
}

// Dashboard strategy: the drawing, the thermostat, the key values and their history
class EspalthermaStrategy {
  static async generate(config, hass) {
    const ent = findEntities(hass, config);
    const climate = (config && config.climate) || defaultClimate(hass);
    const has = k => ent[k] && hass.states[ent[k]];
    // Short names: the entities' own start with the device name, which hides what they are
    const name = {out: tr(hass, "Outside"), tank: tr(hass, "Hot water"), inv: tr(hass, "Compressor"), flow: tr(hass, "Flow"),
      bar: tr(hass, "Water pressure"), mode: tr(hass, "Mode"), err: tr(hass, "Error"), lw2: tr(hass, "Leaving"),
      lw1: tr(hass, "Heat pump out"), inlet: tr(hass, "Return"), amp: tr(hass, "Current"), mixed: tr(hass, "Mixed water"),
      iuErr: tr(hass, "Error")};
    const tiles = ["out", "tank", "inv", "flow", "bar", "mode"].filter(has)
      .map(k => ({type: "tile", entity: ent[k], name: name[k], grid_options: {columns: 6}}));
    // The errors: one card with a row per unit when ESPAltherma tells them apart (#617), else the single tile
    if (has("err") && has("iuErr"))
      tiles.push({type: "entities", title: tr(hass, "Error"), grid_options: {columns: 6},
        entities: [{entity: ent.err, name: tr(hass, "Outdoor unit")}, {entity: ent.iuErr, name: tr(hass, "Indoor unit")}]});
    else
      ["err", "iuErr"].filter(has).forEach(k => tiles.push({type: "tile", entity: ent[k], name: name[k], grid_options: {columns: 6}}));
    // The targets, with their own buttons, when the heat pump accepts them
    if (has("lwtSet"))
      tiles.unshift({type: "tile", entity: ent.lwtSet, name: tr(hass, "Leaving water target"),
        features: [{type: "numeric-input", style: "buttons"}], grid_options: {columns: 12}});
    if (has("dhwSet"))
      tiles.unshift({type: "tile", entity: ent.dhwSet, name: tr(hass, "Hot water target"),
        features: [{type: "numeric-input", style: "buttons"}], grid_options: {columns: 12}});
    const line = k => ({entity: ent[k], name: name[k]});
    const water = ["lw2", "lw1", "mixed", "inlet", "tank", "out"].filter(has).map(line);
    const sections = [
      {type: "grid", column_span: 3, cards: [{type: "custom:espaltherma-card", climate, grid_options: {columns: "full"}}]},
      {type: "grid", cards: [
        ...(climate ? [{type: "thermostat", entity: climate, grid_options: {columns: "full"}}] : []),
        ...tiles,
      ]},
    ];
    const history = [];
    if (water.length) history.push({type: "history-graph", title: tr(hass, "Water temperature"), hours_to_show: 24, entities: water, grid_options: {columns: "full"}});
    if (has("inv")) history.push({type: "history-graph", title: tr(hass, "Compressor"), hours_to_show: 24, entities: ["inv", "amp"].filter(has).map(line), grid_options: {columns: "full"}});
    if (history.length) sections.push({type: "grid", column_span: 2, cards: history});
    return {title: "ESPAltherma", views: [{title: "ESPAltherma", path: "espaltherma", icon: "mdi:heat-pump", type: "sections", max_columns: 4, sections}]};
  }
}

if (!customElements.get("espaltherma-card")) customElements.define("espaltherma-card", EspalthermaCard);
if (!customElements.get("ll-strategy-dashboard-espaltherma")) customElements.define("ll-strategy-dashboard-espaltherma", class extends HTMLElement {
  static async generate(config, hass) { return EspalthermaStrategy.generate(config, hass); }
});
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === "espaltherma-card"))
  window.customCards.push({type: "espaltherma-card", name: "ESPAltherma", description: "Live drawing of the heat pump installation read by ESPAltherma", preview: false});
console.info("%c ESPALTHERMA-CARD %c " + VERSION + " ", "color:#fff;background:#0466c8;font-weight:700", "color:#0466c8");
