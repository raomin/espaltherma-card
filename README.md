# ESPAltherma card

The live drawing of your heat pump installation from the [ESPAltherma](https://github.com/raomin/ESPAltherma) web page, in Home Assistant, plus a ready-made dashboard.

![The ESPAltherma card](https://raw.githubusercontent.com/raomin/espaltherma-card/main/images/card-light.png)

- **The drawing:**
  - the outdoor unit, the backup heater, the hot water tank and the house;
  - water pipes coloured by temperature, from blue (15°) to red (55°);
  - the fan spinning while the compressor runs, the 3-way valve's position and the water flow;
  - **Two zones:** on a bi-zone unit, once the mixed water temperature is among the values ESPAltherma reads, the house gets a direct zone (radiators) and a mixed zone (the floor loop) with its valve, each with its pump and its target.
- **Taps:** tap a reading to open its history.
- **Room temperature:** the living room shows your thermostat's temperature and target when you have one (a `climate` entity).
- **Languages:** English, French, German, Italian and Spanish, following your Home Assistant language. It uses your theme's colours, light or dark.
- **Setup:** none. It finds the entities ESPAltherma publishes by itself.

It is made for ESPAltherma 2, which publishes its values to Home Assistant through MQTT discovery. With ESPAltherma 1.x the entity ids may differ: set them with the `entities` option.

## Install

**With HACS:**
1. In HACS, open the menu (⋮) → *Custom repositories*.
2. Add `https://github.com/raomin/espaltherma-card` with the type *Dashboard*.
3. Find **ESPAltherma card** and download it. HACS adds it to your dashboard resources.

**By hand:**
1. Copy `dist/espaltherma-card.js` to `config/www/`.
2. Add `/local/espaltherma-card.js` as a *JavaScript module* in Settings → Dashboards → ⋮ → Resources.

Then reload Home Assistant in your browser, bypassing its cache (Ctrl+Shift+R, or clear the app's cache on a phone). Until then the dashboard says *Timeout waiting for strategy element*.

## A whole dashboard

![The ESPAltherma dashboard](https://raw.githubusercontent.com/raomin/espaltherma-card/main/images/dashboard-dark.jpg)

Create a new dashboard (Settings → Dashboards → *Add dashboard* → *New dashboard from scratch*). Open it, then ⋮ → *Edit dashboard* → ⋮ → *Raw configuration editor*, and replace everything with:

```yaml
strategy:
  type: custom:espaltherma
```

The dashboard holds:
- the drawing;
- your thermostat;
- the outdoor, hot water, compressor, flow, pressure, mode and error values;
- 24-hour history graphs of the water temperatures and the compressor.

It follows the entities you have, so it adapts when you select other values in ESPAltherma. To pick the thermostat yourself, add `climate: climate.my_thermostat` under `type`.

To customise it, open the dashboard's ⋮ menu, choose *Take control*, and edit the cards it generated.

## Just the card

```yaml
type: custom:espaltherma-card
```

Options:

| Option | Default | |
| --- | --- | --- |
| `climate` | `climate.altherma`, or the first climate entity named after Altherma, Daikin or a heat pump (a room one first; the Daikin app's "leaving water offset" ones are skipped) | the thermostat shown in the house |
| `entities` | found by their ESPAltherma ids | override one value, e.g. `entities: {out: sensor.my_outdoor_temp}` |
| `prefix` | `espaltherma` | the board's base topic when it is not the default, as it appears in its entity ids: `prefix: espaltherma_odu` for a board on the base topic `espaltherma-odu`. With two boards, take the other one's values through `entities` |
| `title` | none | card title |
| `stats` | `bottom` | the day's figures (COP, energies, compressor cycles), when ESPAltherma computes them (Settings → Energy and cycles): `bottom` or `top` of the drawing, `false` hides them. The arrow on the strip moves it too, and the browser remembers that choice |

Keys of `entities`:

| Key | Value |
| --- | --- |
| `out` | outdoor temperature |
| `lw1` | leaving water before the backup heater |
| `lw2` | leaving water after the backup heater |
| `inlet` | return water |
| `tank` | hot water tank |
| `r3t` | refrigerant |
| `room` | room temperature |
| `rtSp` | room setpoint |
| `dhwSp` | hot water setpoint |
| `lwSp` | leaving water setpoint |
| `lwSpAdd` | leaving water setpoint of the additional (direct) zone |
| `mixed` | mixed water temperature (R7T), after the mixing valve |
| `mainPump` | pump of the main (mixed) zone |
| `addPump` | pump of the additional (direct) zone |
| `inv` | compressor frequency |
| `amp` | compressor current |
| `v3` | 3-way valve |
| `pump` | water pump |
| `flow` | flow |
| `bar` | water pressure |
| `mode` | operation mode |
| `err` | error type |
| `cop`, `heatKw`, `elecKw` | ESPAltherma's COP, heat output and electrical input of the moment |
| `copHeat`, `heatHeat`, `elecHeat` | the day's heating COP, heat and electricity |
| `copDhw`, `heatDhw`, `elecDhw` | the same for hot water |
| `starts`, `startsHour`, `runMin`, `lastRun`, `lastPause`, `defrosts` | the compressor cycles of the day |

## Thermostat

A thermostat needs ESPAltherma's thermostat relay (`switch.altherma`, see the [ESPAltherma README](https://github.com/raomin/ESPAltherma)) and a room temperature sensor. Create it in Settings → Devices & services → Helpers → *Create helper* → *Generic thermostat*:
- **Heater:** `switch.altherma`;
- **Sensor:** your room temperature sensor.

## Development

`src/espaltherma-card.js` is the source. `python build.py` writes `dist/espaltherma-card.js`, with the texts translated from ESPAltherma's web page translations (`web/i18n` of the ESPAltherma repository, downloaded, or from a local checkout: `python build.py ../ESPAltherma`).

To release: raise `VERSION` in the source, build, commit, then publish a GitHub release tagged `v<version>`. HACS offers the update to everyone who installed the card.
