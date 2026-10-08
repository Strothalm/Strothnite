# Strothnite

Ein Battle-Royale-Spiel im Browser, angelehnt an Fortnite – aber mit eigener Insel, eigenen Orten und eigenem Namen.
Du springst aus dem **Strothi-Bus**, gleitest auf die Insel, sammelst Waffen aus goldenen Truhen, baust Wände und Rampen
und kämpfst gegen bis zu 99 Bots, bis nur noch einer übrig ist: **#1 STROTH ROYALE**.

Alles ist in JavaScript mit [three.js](https://threejs.org/) gebaut. Grafiken, Texturen und Sounds werden im Code erzeugt,
es gibt keine Bild- oder Audiodateien.

## Spielen

Das Spiel besteht aus statischen Dateien. Weil es ES-Module nutzt, muss es über einen kleinen Webserver geöffnet werden
(ein Doppelklick auf `index.html` reicht nicht):

```bash
# im Projektordner
python3 -m http.server 8000
# oder
npx serve .
```

Dann im Browser `http://localhost:8000` öffnen. Beim ersten Start werden three.js und die Schriften aus dem Internet geladen.

Tipp: Mit GitHub Pages (Einstellungen → Pages → Branch `main`, Ordner `/`) ist das Spiel direkt online spielbar.

Strothnite braucht Maus und Tastatur. Auf dem Handy lässt sich nur die Lobby ansehen.

## Steuerung

| Taste | Aktion |
| --- | --- |
| W A S D | Laufen |
| Leertaste | Springen · aus dem Bus springen · Gleiter öffnen |
| Shift | Sprinten |
| Linke Maustaste | Schießen · Bauen (halten = Turbo-Bau) · Abbauen · Heilen |
| Rechte Maustaste | Zielen · im Baumodus Material wechseln |
| 1 – 6 / Mausrad | Spitzhacke und Inventarplätze |
| Q / F / C | Wand / Boden / Rampe bauen |
| R | Nachladen · im Baumodus Rampe drehen |
| T | Baumaterial wechseln (Holz, Stein, Metall) |
| E | Truhe öffnen · Gegenstand aufheben |
| G | Gegenstand fallen lassen |
| B | Tanzen |
| M | Karte |
| Esc | Pause |

## Was drin ist

- **Insel** mit Bergen, Strand, einem See und neun Orten: Gemütlicher Park, Beutesee, Strothi Towers, Staubiges Depot,
  Einkaufsmeile, Salzige Quellen, Heulender Wald, Tödliche Felder und Burg Strothenstein. Jede Runde wird die Insel neu
  ausgewürfelt.
- **Strothi-Bus** mit Ballon, Fallschirmsprung und Gleiter.
- **Bauen** im Raster: Wände, Böden und Rampen aus Holz, Stein oder Metall. Bauteile wachsen in ihren Lebenspunkten,
  und Bauwerke ohne Verbindung zum Boden stürzen ein. Rampen-Rush funktioniert.
- **Abbauen** mit der Spitzhacke: Bäume, Felsen, Autos, Kisten und alle Häuser. Wer den blauen Schwachpunkt trifft,
  bekommt doppelt so viel Material.
- **Waffen** in fünf Seltenheitsstufen (Gewöhnlich bis Legendär): Sturmgewehr, Maschinenpistole, Pistole, Pump-Shotgun,
  Scharfschützengewehr mit Zielfernrohr und Raketenwerfer. Mit Streuung, Kopftreffern, Schadensabfall und Nachladen.
- **Heilung**: Verband, Medikit, Mini-Schild und Schildtrank.
- **Truhen** (golden, mit Summen in der Nähe), Munitionskisten und Bodenbeute.
- **Sturm** mit sechs Phasen, der sich zusammenzieht und immer mehr Schaden macht.
- **Bots** mit drei Schwierigkeitsstufen: Sie landen, plündern, kämpfen, heilen sich, bauen Deckung, fliehen
  unbewaffnet und laufen vor dem Sturm davon.
- **Oberfläche** mit Schild- und Lebensbalken, Inventar, Materialanzeige, Minimap, großer Karte, Killfeed,
  Schadenszahlen, Trefferanzeige und Richtungsanzeige für Treffer.
- **Lobby** mit Spind (acht Outfits), Einstellungen (Empfindlichkeit, Sichtfeld, Lautstärke, Auflösung, Schatten)
  und Zuschauermodus nach dem Ausscheiden.

## Aufbau des Codes

| Datei | Inhalt |
| --- | --- |
| `index.html` | Seite, Oberfläche und Styles |
| `js/main.js` | Spielablauf: Lobby, Match-Aufbau, Spielschleife, Sieg und Niederlage |
| `js/config.js` | Alle Spieldaten: Waffen, Gegenstände, Sturmphasen, Orte, Outfits, Bot-Namen |
| `js/world.js` | Inselgenerierung: Gelände, Wasser, Himmel, Häuser, Bäume, Felsen, Autos, Minimap |
| `js/builds.js` | Bausystem mit Raster, Vorschau und Statik |
| `js/physics.js` | Kollisionen und Strahltests |
| `js/entity.js` | Spielfigur: Leben, Schild, Inventar, Bewegung |
| `js/character.js` | Aussehen und Animation der Figuren |
| `js/player.js` | Steuerung und Kamera des Spielers |
| `js/bot.js` | Bot-KI |
| `js/combat.js` | Schießen, Spitzhacke, Raketen, Schaden |
| `js/loot.js` | Truhen und Beute |
| `js/storm.js` | Sturm |
| `js/bus.js` | Strothi-Bus |
| `js/hud.js` | Anzeigen im Spiel |
| `js/effects.js` | Partikel, Leuchtspuren, Explosionen |
| `js/audio.js` | Erzeugte Soundeffekte |
| `js/lobby.js`, `js/input.js`, `js/models.js`, `js/textures.js`, `js/pool.js`, `js/util.js` | Hilfsmodule |

Strothnite ist ein Fanprojekt und steht in keiner Verbindung zu Epic Games.
