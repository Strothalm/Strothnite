// Spieldaten und Konstanten für Strothnite

export const TILE = 4; // Bauraster horizontal (m)
export const LEVEL_H = 3.6; // Höhe eines Bauteils (m)
export const BUILD_COST = 10;
export const MAX_MATS = 999;
export const MAX_AMMO = 999;
export const GRAVITY = 24;
export const ISLAND_R = 335;
export const MAP_VIEW = 400; // Minimap deckt [-MAP_VIEW, MAP_VIEW] ab
export const WATER_FLOOR = -1.3; // Schwimmhöhe im tiefen Wasser

export const RARITIES = [
  { name: 'Gewöhnlich', color: '#a7adb3' },
  { name: 'Ungewöhnlich', color: '#4fc23a' },
  { name: 'Selten', color: '#2f8cff' },
  { name: 'Episch', color: '#b54cff' },
  { name: 'Legendär', color: '#ff9f1a' },
];
export const RARITY_WEIGHTS = [40, 30, 18, 9, 3];

export const PICKAXE = { name: 'Spitzhacke', dmgObj: 50, dmgChar: 20, cooldown: 0.42, range: 2.7 };

export const WEAPONS = {
  ar: {
    name: 'Sturmgewehr', ammo: 'medium', dmg: [30, 31, 33, 35, 36], rate: 5.5, mag: 30, reload: 2.3,
    spread: 0.03, adsSpread: 0.01, bloom: 0.006, maxBloom: 0.04, head: 1.5, range: 260, auto: true,
    falloff: [50, 200, 0.75], zoom: 1.35, sound: 'ar', rarities: [0, 4], pref: [8, 90],
  },
  smg: {
    name: 'Maschinenpistole', ammo: 'light', dmg: [16, 17, 18, 19, 20], rate: 11, mag: 30, reload: 2.2,
    spread: 0.05, adsSpread: 0.03, bloom: 0.004, maxBloom: 0.03, head: 1.75, range: 150, auto: true,
    falloff: [15, 60, 0.6], zoom: 1.15, sound: 'smg', rarities: [0, 3], pref: [3, 28],
  },
  pistol: {
    name: 'Pistole', ammo: 'light', dmg: [24, 25, 26, 28, 29], rate: 6.5, mag: 16, reload: 1.4,
    spread: 0.035, adsSpread: 0.012, bloom: 0.01, maxBloom: 0.05, head: 2, range: 180, auto: false,
    falloff: [20, 90, 0.65], zoom: 1.2, sound: 'pistol', rarities: [0, 3], pref: [4, 40],
  },
  shotgun: {
    name: 'Pump-Shotgun', ammo: 'shells', dmg: [85, 90, 95, 100, 105], pellets: 10, rate: 0.8, mag: 5,
    reload: 0.85, perShell: true, spread: 0.075, adsSpread: 0.06, bloom: 0, maxBloom: 0, head: 2, range: 45,
    auto: false, falloff: [7, 35, 0.25], zoom: 1.1, sound: 'shotgun', rarities: [1, 4], pref: [0, 12],
  },
  sniper: {
    name: 'Scharfschützengewehr', ammo: 'heavy', dmg: [100, 105, 110, 116, 121], rate: 0.33, mag: 1,
    reload: 2.6, spread: 0.12, adsSpread: 0, bloom: 0, maxBloom: 0, head: 2.5, range: 600, auto: false,
    falloff: [600, 700, 1], zoom: 5, scope: true, sound: 'sniper', rarities: [2, 4], pref: [50, 400],
  },
  rocket: {
    name: 'Raketenwerfer', ammo: 'rockets', dmg: [90, 95, 100, 105, 110], rate: 0.8, mag: 1, reload: 3,
    spread: 0.015, adsSpread: 0, bloom: 0, maxBloom: 0, head: 1, range: 300, auto: false, projectile: true,
    speed: 60, splash: 5, structDmg: 500, falloff: [300, 400, 1], zoom: 1.25, sound: 'rocket',
    rarities: [3, 4], pref: [15, 120],
  },
};
export const WEAPON_WEIGHTS = [['ar', 30], ['shotgun', 24], ['smg', 18], ['pistol', 16], ['sniper', 8], ['rocket', 4]];

export const CONSUMABLES = {
  bandage: { name: 'Verband', kind: 'hp', amount: 15, cap: 75, time: 3.5, stack: 15, drop: 5, rarity: 0 },
  medkit: { name: 'Medikit', kind: 'hp', amount: 100, cap: 100, time: 8, stack: 3, drop: 1, rarity: 1 },
  shieldSmall: { name: 'Mini-Schild', kind: 'shield', amount: 25, cap: 50, time: 2, stack: 6, drop: 3, rarity: 1 },
  shieldBig: { name: 'Schildtrank', kind: 'shield', amount: 50, cap: 100, time: 4.5, stack: 3, drop: 1, rarity: 2 },
};
export const CONSUMABLE_WEIGHTS = [['bandage', 30], ['shieldSmall', 30], ['medkit', 12], ['shieldBig', 16]];

export const AMMO = {
  light: { name: 'Leichte Munition', drop: 30, color: '#9fb6c9' },
  medium: { name: 'Mittlere Munition', drop: 24, color: '#6f9a5a' },
  heavy: { name: 'Schwere Munition', drop: 5, color: '#4a5870' },
  shells: { name: 'Schrot', drop: 8, color: '#d0503c' },
  rockets: { name: 'Raketen', drop: 2, color: '#8f9a3a' },
};

export const MATERIALS = {
  wood: { name: 'Holz', hp: 150, mapHp: 200, buildTime: 2.4, yield: 0.13 },
  stone: { name: 'Stein', hp: 300, mapHp: 330, buildTime: 4.2, yield: 0.1 },
  metal: { name: 'Metall', hp: 500, mapHp: 450, buildTime: 6.5, yield: 0.075 },
};
export const MAT_ORDER = ['wood', 'stone', 'metal'];

// Sturmphasen: Wartezeit, Schrumpfzeit, Zielradius, Schaden pro Sekunde
export const STORM_PHASES = [
  { wait: 80, shrink: 55, radius: 215, dps: 1 },
  { wait: 55, shrink: 45, radius: 120, dps: 2 },
  { wait: 45, shrink: 40, radius: 65, dps: 5 },
  { wait: 35, shrink: 30, radius: 32, dps: 8 },
  { wait: 25, shrink: 25, radius: 14, dps: 10 },
  { wait: 20, shrink: 30, radius: 0, dps: 12 },
];

export const BUS = { height: 150, speed: 30, half: 470 };

export const POIS = [
  { id: 'park', name: 'Gemütlicher Park', type: 'town', x: -185, z: -160, r: 40, mat: 'wood' },
  { id: 'lake', name: 'Beutesee', type: 'lake', x: -70, z: -105, r: 13, lakeR: 60, margin: 6 },
  { id: 'towers', name: 'Strothi Towers', type: 'towers', x: -195, z: 20, r: 42 },
  { id: 'depot', name: 'Staubiges Depot', type: 'depot', x: 45, z: -20, r: 42 },
  { id: 'retail', name: 'Einkaufsmeile', type: 'retail', x: 222, z: 30, r: 38 },
  { id: 'salty', name: 'Salzige Quellen', type: 'town', x: 30, z: 185, r: 38, mat: 'stone' },
  { id: 'woods', name: 'Heulender Wald', type: 'woods', x: 165, z: -165, r: 46 },
  { id: 'farm', name: 'Tödliche Felder', type: 'farm', x: -160, z: 180, r: 44 },
  { id: 'castle', name: 'Burg Strothenstein', type: 'castle', x: 175, z: 175, r: 30 },
];

export const ROADS = [
  ['park', 'towers'], ['towers', 'farm'], ['farm', 'salty'], ['salty', 'castle'], ['castle', 'retail'],
  ['retail', 'woods'], ['retail', 'depot'], ['depot', 'towers'], ['depot', 'salty'], ['park', 'depot'],
  ['woods', 'depot'],
];

export const SKINS = [
  {
    id: 'johann', name: 'Johann', rarity: 4, desc: 'Der Gründer von Strothnite.',
    skin: '#f0c08a', hair: '#4a2b16', hat: 'hair', shirt: '#1f6fd6', sleeve: '#1f6fd6',
    pants: '#2b2d42', shoes: '#1b1b1b', pack: '#ffcc00', glider: '#ffcc00',
  },
  {
    id: 'ritter', name: 'Strothi-Ritter', rarity: 3, desc: 'Glänzt in jeder Rüstung.',
    skin: '#f0c08a', hair: '#000', hat: 'helmet', shirt: '#b8bec7', sleeve: '#9aa1ab',
    pants: '#7d848e', shoes: '#4b5059', pack: '#b3262e', glider: '#b3262e',
  },
  {
    id: 'banane', name: 'Bananen-Bernd', rarity: 4, desc: 'Immer gut gelaunt.',
    skin: '#ffe14d', hair: '#6b4a1f', hat: 'banana', shirt: '#ffe14d', sleeve: '#ffe14d',
    pants: '#f2cf35', shoes: '#6b4a1f', pack: '#6b4a1f', glider: '#ffe14d',
  },
  {
    id: 'ninja', name: 'Schatten', rarity: 2, desc: 'Lautlos und schnell.',
    skin: '#e0ac69', hair: '#15161a', hat: 'mask', shirt: '#25282f', sleeve: '#25282f',
    pants: '#1a1c21', shoes: '#111111', pack: '#c0392b', glider: '#c0392b',
  },
  {
    id: 'kraehe', name: 'Krähe', rarity: 3, desc: 'Kommt mit dem Sturm.',
    skin: '#3a3045', hair: '#1f1a26', hat: 'hood', shirt: '#3b2f4a', sleeve: '#2b2433',
    pants: '#1f1a26', shoes: '#111111', pack: '#7a2bbf', glider: '#7a2bbf',
  },
  {
    id: 'astro', name: 'Astro-Strothi', rarity: 2, desc: 'Gerade vom Mond gelandet.',
    skin: '#f1c27d', hair: '#3b2a1a', hat: 'astro', shirt: '#f2f2f2', sleeve: '#e6e6e6',
    pants: '#dcdcdc', shoes: '#ff7a1a', pack: '#ff7a1a', glider: '#ff7a1a',
  },
  {
    id: 'gerd', name: 'Gärtner Gerd', rarity: 1, desc: 'Kennt jeden Baum beim Namen.',
    skin: '#f0c08a', hair: '#7a4a22', hat: 'cap', cap: '#2e8b3e', shirt: '#2e8b3e', sleeve: '#f0c08a',
    pants: '#5b7fb5', shoes: '#5a3d22', pack: '#8b5a2b', glider: '#2e8b3e',
  },
  {
    id: 'flauschi', name: 'Flauschi', rarity: 3, desc: 'Knuddelig, aber gefährlich.',
    skin: '#ff9ccf', hair: '#ff9ccf', hat: 'ears', shirt: '#ff9ccf', sleeve: '#ff9ccf',
    pants: '#ff86c2', shoes: '#ffffff', pack: '#ffffff', glider: '#ff5fae',
  },
];

export const BOT_NAMES = [
  'xXSchnitzelXx', 'Brezel_Boss', 'DönerKönig', 'KartoffelKlaus', 'LeberkäsLeon', 'Turbo_Tobi',
  'SauerkrautSven', 'Bratwurst42', 'GummibärGang', 'NoScopeNiklas', 'BauMeisterBen', 'Zocker_Zoe',
  'Lama_Lars', 'Pixel_Paula', 'KrasserKevin', 'Mausi_Mia', 'HaudraufHannes', 'StrudelSteffi',
  'WurstbrotWilli', 'RampenRudi', 'WandWerner', 'Pfannkuchen_Pia', 'Kaktus_Karl', 'Sturmjäger',
  'Gurkenglas', 'Schokocroissant', 'MettIgel', 'HeadshotHeidi', 'Kühlschrank3000', 'LagLukas',
  'KeksKrümel', 'Fischbrötchen', 'Opa_Otto', 'Zahnfee99', 'BlitzBirgit', 'Wackeldackel',
  'KnödelKai', 'Pommes_Paul', 'SpätzleSophie', 'Frikadelle', 'Matjes_Max', 'KampfKeks',
  'Laserlena', 'TurboTante', 'Bauzaun_Bernd', 'SchrotSchorsch', 'Lindwurm', 'Glücksklee',
  'Rasenmäher', 'Kartoffelpuffer', 'Eisbär_Emil', 'Nudelholz', 'Raketen_Ralf', 'Wolke7',
  'Zuckerwatte', 'Drachenzahn', 'PilzPeter', 'Socke_Susi', 'Kaffeetasse', 'Hamster_Horst',
  'Bergziege', 'Seemannsgarn', 'Knusperhexe', 'Fliegenpilz', 'Sternschnuppe', 'Tintenfisch',
  'Gartenzwerg', 'Kompass_Kim', 'Wirbelwind', 'Brummbär', 'Stinkesocke', 'Muskelkater',
  'Popcorn_Pit', 'Laternenpfahl', 'Kuckucksuhr', 'Apfelstrudel', 'Lebkuchen', 'Marzipan',
  'Schneeflocke', 'Gewitterhexe', 'Zauberwürfel', 'Pinguin_Paul', 'Wühlmaus', 'Karussell',
  'Rührei', 'Kirschkern', 'Seifenblase', 'Hummelflug', 'Quarkbällchen', 'Zwiebelring',
  'Erdnuss', 'Kokosnuss', 'Leuchtturm', 'Maulwurf', 'Igelchen', 'Schaukelpferd', 'Purzelbaum',
  'Wasserbombe', 'Teekanne',
];

export const DIFFICULTY = {
  leicht: { aimErr: 0.085, reaction: 0.75, view: 60, buildChance: 0.15, turn: 3 },
  mittel: { aimErr: 0.07, reaction: 0.55, view: 75, buildChance: 0.3, turn: 4.5 },
  schwer: { aimErr: 0.032, reaction: 0.3, view: 110, buildChance: 0.5, turn: 6.5 },
};

export const TIPS = [
  'Halte Ausschau nach goldenen Truhen – du hörst sie, bevor du sie siehst.',
  'Triff den blauen Schwachpunkt beim Abbauen für doppelte Materialien.',
  'Mit Q, F und C baust du Wände, Böden und Rampen.',
  'Holz baut am schnellsten, Metall hält am meisten aus.',
  'Der Sturm verursacht mit jeder Phase mehr Schaden.',
  'Schilde schützen deine Lebenspunkte – trink sie, bevor du kämpfst.',
  'Kopftreffer verursachen deutlich mehr Schaden.',
  'Halte die linke Maustaste im Baumodus gedrückt, um im Turbo zu bauen.',
];
