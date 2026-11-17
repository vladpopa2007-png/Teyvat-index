import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

interface Character {
  id: string;
  name: string;
  element: string;
  weapon: string;
  rarity: number;
  role: string;
  bestWeapons: string[];
  bestArtifacts: string[];
  talentPriority: string;
  talentBook: string;
  region?: string;
  version?: string;
  icon?: string;
  ascensionMaterials: { boss: string; specialty: string; common: string };
  whoIsThisFor: string;
}

interface Weapon {
  id: string;
  name: string;
  type: string;
  rarity: number;
  baseAtk: number;
  secondaryStat: string;
  region?: string;
  version?: string;
  icon?: string;
  passive: string;
  bestCharacters: string[];
  ascensionMaterial: string;
  domain: string;
  domainDays: string;
  ascensionBreakdown: {
    domainName: string;
    region: string;
    materialType: string;
    daysAvailable: string[];
    eliteDrop: string;
    commonDrop: string;
  };
}

interface TeyvatApi {
  CHARACTERS: Character[];
  WEAPONS: Weapon[];
  TALENT_DOMAINS: Array<{ id: string; book: string; region: string; domain: string; days: number[]; characters: Array<{ name: string; element: string; id?: string }> }>;
  WEAPON_DOMAINS: Array<{ id: string; material: string; region: string; domain: string; days: number[]; weapons: Array<{ name: string; id?: string; type: string }> }>;
  WEEKLY_BOSSES: Array<{ id: string; name: string; region: string; domain: string }>;
  TIER_LIST: Array<{ charId: string; tier: string; note: string }>;
  ABYSS_FLOORS: Array<{ floor: number; title: string; chambers: Array<{ chamber: string; firstHalf: string; secondHalf: string }> }>;
  LOCAL_SPECIALTIES: Array<{ name: string; region: string; respawn: string; route: string; icon?: string }>;
  ITEM_ICONS: Record<string, string>;
  ARTIFACT_ICONS: Record<string, string>;
  SERVER_REGIONS: Record<string, { id: string; label: string; resetUtcHour: number; display: string }>;
  STORAGE_KEYS: Record<string, string>;
  getServerRegionConfig: (regionId: string) => { id: string; label: string; resetUtcHour: number; display: string };
  getDomainsForDay: (day: number) => {
    dayIndex: number;
    dayName: string;
    isSunday: boolean;
    talentDomains: Array<{ book: string; region: string; characters: Array<{ name: string; element: string }> }>;
    weaponDomains: Array<{ material: string; region: string; weapons: Array<{ name: string }> }>;
  };
  computeUnitProgressPct: (currentLv: number, targetLv: number, talents?: number[][]) => number;
  getDailyDomainMatches: (
    dayIndex: number,
    ownedCharIds: string[],
    queuedCharIds: string[],
    savedWeaponIds: string[],
    queuedWeaponIds: string[]
  ) => {
    matchedBooks: Record<string, string[]>;
    matchedWeaponMats: Record<string, string[]>;
    totalMatchedDomains: number;
  };
  filterCharacters: (list: Character[], filters: { search?: string; region?: string; element?: string; weapon?: string; role?: string; rarity?: string; ownedMode?: string }, ownedIds?: string[]) => Character[];
  filterWeapons: (list: Weapon[], filters: { search?: string; region?: string; type?: string; rarity?: string }) => Weapon[];
  readStoredIds: (key: string, storageObj?: StorageLike) => string[];
  writeStoredIds: (key: string, ids: string[], storageObj?: StorageLike) => void;
  readStoredJson: <T>(key: string, fallback: T, storageObj?: StorageLike) => T;
  writeStoredJson: (key: string, value: unknown, storageObj?: StorageLike) => void;
  buildBackupPayload: (storageObj?: StorageLike) => { app: string; schemaVersion: number; exportedAt: string; keys: Record<string, unknown> };
  importBackupPayload: (rawJsonOrObj: unknown, storageObj?: StorageLike) => { ok: boolean; restoredKeys?: number; error?: string };
  calculateResinCap: (currentResin: number, nowDate?: Date) => {
    currentResin: number;
    cap: number;
    missing: number;
    minutesToCap: number;
    hours: number;
    minutes: number;
    isFull: boolean;
  };
  getResetCycleKey: (nowDate: Date, regionId: string) => string;
  getWeeklyResetKey: (nowDate: Date, regionId: string) => string;
  calculateAscensionPlan: (
    selectedChars: Character[],
    options?: {
      levelGoal?: string;
      talentGoal?: string;
      charConfigs?: Record<string, { currentLevel?: number; targetLevel?: number; talents?: number[][] }>;
      weaponConfigs?: Record<string, { currentLevel?: number; targetLevel?: number }>;
    },
    selectedWeapons?: Weapon[]
  ) => {
    characterCount: number;
    weaponCount: number;
    totalMora: number;
    totalHerosWit: number;
    totalOre: number;
    totalWeeklyDrops: number;
    totalCrowns: number;
    gems: Array<{ name: string; gemstone: number }>;
    specialties: Array<{ name: string; count: number }>;
    bossDrops: Array<{ name: string; count: number }>;
    eliteDrops: Array<{ name: string; t1: number; t2: number; t3: number }>;
    commonDrops: Array<{ name: string; t1: number; t2: number; t3: number }>;
    domainRuns: Array<{ type: string; book?: string; material?: string; domain: string; estimatedRuns: number; resinCost: number }>;
    talentDomainRuns: Array<{ book: string; domain: string; estimatedRuns: number; resinCost: number }>;
    weaponDomainRuns: Array<{ material: string; domain: string; estimatedRuns: number; resinCost: number }>;
    headlineSummary: string;
  };
  detectTeamResonances: (teamChars: Array<Character | null>) => Array<{ name: string; effect: string }>;
  detectTeamReactions: (teamChars: Array<Character | null>) => Array<{ name: string; effect: string }>;
  calculateDamageMetrics: (input: {
    scalingType?: string;
    statValue?: number;
    atk?: number;
    multiplierPct: number;
    critRatePct: number;
    critDmgPct: number;
    dmgBonusPct: number;
    em?: number;
    reaction?: string;
    level?: string;
    enemyMult?: number;
  }) => {
    scalingType: string;
    reaction: string;
    reactionMultiplier: number;
    flatQuickenBonus: number;
    effectiveCritMultiplier: number;
    averageDamage: number;
    nonCritDamage: number;
    critDamage: number;
    critValue: number;
    formulaText: string;
  };
  calculatePityMetrics: (
    pityCount: number,
    isGuaranteed: boolean,
    options?: { bannerMode?: string; radianceLosses?: number; fatePoints?: number }
  ) => {
    bannerMode: string;
    pity: number;
    softCap: number;
    hardCap: number;
    isGuaranteed: boolean;
    toSoftPity: number;
    toHardPity: number;
    toFeaturedGuaranteed: number;
    primogemsToHard: number;
    primogemsToFeatured: number;
    inSoftPity: boolean;
    oddsLabel: string;
  };
  filterTierList: (entries: Array<{ charId: string; tier: string; note: string }>, chars: Character[], filters: { role?: string; element?: string }) => Array<{ tier: string; character: Character }>;
  filterSpecialties: (list: Array<{ name: string; region: string; respawn: string; route: string }>, chars: Character[], filters: { search?: string; region?: string }) => Array<{ name: string; region: string }>;
  getCharacterIconSvg: (charOrId: Character | string) => string;
  getWeaponIconSvg: (weaponOrName: Weapon | string, fallbackType?: string) => string;
  getSpecialtyIconSvg: (specialtyOrName: { name: string } | string) => string;
  getItemIconSvg: (name: string, category?: string) => string;
  getItemIconUrl: (name: string, category?: string) => string;
  getSpecialtyIconUrl: (specialtyOrName: { name: string; icon?: string } | string) => string;
  getWeaponIconUrl: (weaponOrIdOrName: Weapon | string) => string;
  getArtifactIconUrl: (artifactStr: string) => string;
}

interface StorageLike {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
}

function readJsonAsset<T>(relPath: string): T {
  const fullPath = path.resolve(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as T;
}

function loadIndexApi(): TeyvatApi {
  const scriptCode = fs.readFileSync(path.resolve(process.cwd(), 'app.js'), 'utf8');

  const noop = () => {};
  const fakeEl = () => ({
    hidden: false,
    textContent: '',
    innerHTML: '',
    value: 'All',
    max: '',
    style: { setProperty: noop, width: '' },
    className: '',
    classList: { toggle: noop, add: noop, remove: noop },
    setAttribute: noop,
    hasAttribute: () => false,
    getAttribute: () => null,
    addEventListener: noop,
    focus: noop,
    closest: () => null,
  });

  const store: Record<string, string> = {};
  const fakeWindow: Record<string, unknown> = {
    location: { hash: '#home' },
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v); },
    },
    addEventListener: noop,
    scrollTo: noop,
    __TEYVAT_PRELOADED_DATA__: {
      characters: readJsonAsset('data/characters.json'),
      weapons: readJsonAsset('data/weapons.json'),
      domains: readJsonAsset('data/domains.json'),
      tierList: readJsonAsset('data/tier-list.json'),
      abyss: readJsonAsset('data/abyss.json'),
      specialties: readJsonAsset('data/specialties.json'),
    },
  };

  const context = vm.createContext({
    window: fakeWindow,
    history: { replaceState: noop },
    document: {
      documentElement: { classList: { toggle: noop } },
      getElementById: fakeEl,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: noop,
      activeElement: null,
    },
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
  });

  vm.runInContext(scriptCode, context);
  const api = fakeWindow.__TEYVAT_INDEX__ as TeyvatApi | undefined;
  assert.ok(api, 'Expected window.__TEYVAT_INDEX__ to be exposed');
  return api;
}

const api = loadIndexApi();

test('HTML structure uses single h1, externalizes CSS/JS/data, and removes static placeholders and Quick Jump bar', () => {
  const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.resolve(process.cwd(), 'app.js'), 'utf8');
  const h1Matches = [...html.matchAll(/<h1\b/gi)];
  assert.equal(h1Matches.length, 1, 'Expected exactly one <h1> landmark in index.html');
  assert.equal(html.includes('Static dates · Manually updatable'), false);
  assert.equal(html.includes('Active &amp; Upcoming Banners'), false);
  assert.equal(html.includes('Showing 0 characters'), false);
  assert.equal(html.includes('Showing 0 weapons'), false);
  assert.equal(html.includes('home-quick-directory'), false);
  assert.equal(html.includes('Quick Jump'), false);
  assert.equal(html.includes('<style>'), false);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('href="./styles.css"'), true);
  assert.equal(html.includes('src="./app.js"'), true);
  assert.equal(html.includes('href="./manifest.json"'), true);
  assert.equal(appJs.includes('var CHARACTERS = [];'), true);
  assert.equal(/var CHARACTERS\s*=\s*\[\s*\{/.test(appJs), false);
  assert.equal(appJs.includes("fetchJsonAsset('./data/characters.json')"), true);
  assert.equal(appJs.includes("'/data/"), false);
  assert.equal(appJs.includes('"/data/'), false);
  assert.equal(/id="roster-char-empty"[^>]*hidden/.test(html), true);
  assert.equal(/id="roster-weapon-empty"[^>]*hidden/.test(html), true);
  assert.equal(/id="character-empty"[^>]*hidden/.test(html), true);
  assert.equal(/id="weapon-empty"[^>]*hidden/.test(html), true);
  assert.equal(/id="sunday-note"[^>]*hidden/.test(html), true);
});

test('dataset meets size, Skirk Outworld placement, v7.2 additions, and field completeness requirements', () => {
  assert.equal(api.CHARACTERS.length, 121);
  assert.equal(api.WEAPONS.length, 56);

  const skirk = api.CHARACTERS.find((c) => c.id === 'skirk');
  const aloy = api.CHARACTERS.find((c) => c.id === 'aloy');
  const traveler = api.CHARACTERS.find((c) => c.id === 'traveler');
  assert.ok(skirk && aloy && traveler);
  assert.equal(skirk.region, 'Outworld');
  assert.equal(aloy.region, 'Outworld');
  assert.equal(traveler.region, 'Outworld');

  const varesa = api.CHARACTERS.find((c) => c.id === 'varesa');
  const zibai = api.CHARACTERS.find((c) => c.id === 'zibai');
  assert.ok(varesa && varesa.bestWeapons[0] === 'Vivid Notions');
  assert.ok(zibai && zibai.bestWeapons[0] === 'Lightbearing Moonshard');
  assert.ok(api.WEAPONS.some((w) => w.id === 'vivid-notions'));
  assert.ok(api.WEAPONS.some((w) => w.id === 'lightbearing-moonshard'));

  const talentBooks = new Set(api.TALENT_DOMAINS.map((d) => d.book));
  const weaponMaterials = new Set(api.WEAPON_DOMAINS.map((d) => d.material));
  const specialtyNames = new Set(api.LOCAL_SPECIALTIES.map((s) => s.name));
  const charIds = new Set(api.CHARACTERS.map((c) => c.id));
  const weaponIds = new Set(api.WEAPONS.map((w) => w.id));

  for (const ch of api.CHARACTERS) {
    assert.ok(ch.id && ch.name && ch.element && ch.weapon && ch.role && ch.talentBook);
    assert.ok(ch.region && ch.version, `${ch.name} should have region and version`);
    assert.ok(ch.rarity === 4 || ch.rarity === 5);
    assert.equal(ch.bestWeapons.length, 3, `${ch.name} should have top 3 weapons`);
    assert.equal(ch.bestArtifacts.length, 2, `${ch.name} should have top 2 artifact sets`);
    assert.ok(
      ch.talentPriority.includes('Normal Attack') &&
      ch.talentPriority.includes('Skill') &&
      ch.talentPriority.includes('Burst'),
      `${ch.name} talentPriority should order Normal Attack, Skill, and Burst`
    );
    assert.ok(ch.ascensionMaterials.boss && ch.ascensionMaterials.specialty && ch.ascensionMaterials.common);
    assert.ok(talentBooks.has(ch.talentBook), `${ch.name} talentBook "${ch.talentBook}" missing in TALENT_DOMAINS`);
    assert.ok(specialtyNames.has(ch.ascensionMaterials.specialty), `${ch.name} specialty "${ch.ascensionMaterials.specialty}" missing in LOCAL_SPECIALTIES`);
    assert.ok(ch.whoIsThisFor.length > 20);
  }

  for (const wp of api.WEAPONS) {
    assert.ok(wp.id && wp.name && wp.type && wp.secondaryStat && wp.passive);
    assert.ok(wp.region && wp.version, `${wp.name} should have region and version`);
    assert.ok(wp.rarity === 3 || wp.rarity === 4 || wp.rarity === 5);
    assert.ok(wp.baseAtk > 300);
    assert.ok(wp.bestCharacters.length >= 1 && wp.bestCharacters.length <= 4, `${wp.name} bestCharacters length`);
    assert.ok(weaponMaterials.has(wp.ascensionMaterial), `${wp.name} material "${wp.ascensionMaterial}" missing`);
    assert.ok(wp.domain && wp.domainDays);
    assert.ok(
      wp.ascensionBreakdown &&
      wp.ascensionBreakdown.domainName &&
      wp.domain.includes(wp.ascensionBreakdown.domainName) &&
      wp.ascensionBreakdown.materialType &&
      wp.ascensionBreakdown.daysAvailable.length >= 3 &&
      wp.ascensionBreakdown.eliteDrop &&
      wp.ascensionBreakdown.commonDrop,
      `${wp.name} missing full ascensionBreakdown`
    );
  }

  for (const dom of api.TALENT_DOMAINS) {
    for (const c of dom.characters) {
      assert.ok(c.id && charIds.has(c.id), `TALENT_DOMAINS invalid or unlinked char id for ${c.name}`);
    }
  }
  for (const dom of api.WEAPON_DOMAINS) {
    for (const w of dom.weapons) {
      if (w.id) assert.ok(weaponIds.has(w.id), `WEAPON_DOMAINS invalid weapon id ${w.id}`);
    }
  }
  for (const entry of api.TIER_LIST) {
    assert.ok(charIds.has(entry.charId), `TIER_LIST invalid charId ${entry.charId}`);
  }
  const tierCharIds = new Set(api.TIER_LIST.map((e) => e.charId));
  for (const ch of api.CHARACTERS) {
    assert.ok(tierCharIds.has(ch.id), `Expected ${ch.name} (${ch.id}) to have a Tier List entry`);
  }

  assert.ok(api.WEEKLY_BOSSES.length >= 14);
  assert.equal(api.ABYSS_FLOORS.length, 4);
  assert.ok(api.ABYSS_FLOORS.every((f) => f.chambers.length === 3));
  assert.equal(api.TIER_LIST.length, api.CHARACTERS.length);
  assert.equal(api.LOCAL_SPECIALTIES.length, 58);
});

test('weekly Genshin domain schedule is accurate for every day of the week through v7.2', () => {
  const mon = api.getDomainsForDay(1);
  assert.equal(mon.isSunday, false);
  assert.deepEqual(
    [...mon.talentDomains.map((d) => d.book)],
    ['Freedom', 'Prosperity', 'Transience', 'Admonition', 'Equity', 'Contention', 'Moonlight', 'Charity']
  );

  const tue = api.getDomainsForDay(2);
  assert.deepEqual(
    [...tue.talentDomains.map((d) => d.book)],
    ['Resistance', 'Diligence', 'Elegance', 'Ingenuity', 'Justice', 'Kindling', 'Elysium', 'Fortitude']
  );

  const wed = api.getDomainsForDay(3);
  assert.deepEqual(
    [...wed.talentDomains.map((d) => d.book)],
    ['Ballad', 'Gold', 'Light', 'Praxis', 'Order', 'Conflict', 'Vagrancy', 'Glory']
  );

  const sun = api.getDomainsForDay(0);
  assert.equal(sun.isSunday, true);
  assert.equal(sun.talentDomains.length, 24);
  assert.equal(sun.weaponDomains.length, 24);
});

test('character and weapon filtering supports region, version search, element, type, role, rarity, and ownedMode', () => {
  const pyro5 = api.filterCharacters(api.CHARACTERS, { element: 'Pyro', rarity: '5' });
  assert.ok(pyro5.some((c) => c.id === 'hu-tao'));
  assert.ok(pyro5.every((c) => c.element === 'Pyro' && c.rarity === 5));

  const outworldChars = api.filterCharacters(api.CHARACTERS, { region: 'Outworld' });
  assert.ok(outworldChars.some((c) => c.id === 'traveler'));
  assert.ok(outworldChars.some((c) => c.id === 'aloy'));
  assert.ok(outworldChars.some((c) => c.id === 'skirk'));

  const ownedHidden = api.filterCharacters(api.CHARACTERS, { ownedMode: 'hide-owned' }, ['hu-tao']);
  assert.equal(ownedHidden.some((c) => c.id === 'hu-tao'), false);
  const ownedOnly = api.filterCharacters(api.CHARACTERS, { ownedMode: 'only-owned' }, ['hu-tao', 'furina']);
  assert.equal(ownedOnly.length, 2);

  const polearms4 = api.filterWeapons(api.WEAPONS, { type: 'Polearm', rarity: '4' });
  assert.ok(polearms4.some((w) => w.id === 'the-catch'));
  assert.ok(polearms4.every((w) => w.type === 'Polearm' && w.rarity === 4));
});

test('localStorage persistence and JSON backup export/import helpers round-trip and reject invalid payloads', () => {
  const mem: Record<string, string> = {};
  const storage: StorageLike = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = v; },
  };

  api.writeStoredIds(api.STORAGE_KEYS.OWNED, ['hu-tao', 'furina'], storage);
  api.writeStoredIds(api.STORAGE_KEYS.WEAPONS, ['mistsplitter-reforged'], storage);
  api.writeStoredJson(api.STORAGE_KEYS.SETTINGS, { ar: 58, serverRegion: 'EU', theme: 'light' }, storage);

  const backup = api.buildBackupPayload(storage);
  assert.equal(backup.app, 'teyvat-index');
  assert.equal(backup.schemaVersion, 1);
  assert.ok(backup.keys[api.STORAGE_KEYS.OWNED]);

  const targetMem: Record<string, string> = {};
  const targetStorage: StorageLike = {
    getItem: (k) => (k in targetMem ? targetMem[k] : null),
    setItem: (k, v) => { targetMem[k] = v; },
  };
  const imported = api.importBackupPayload(JSON.stringify(backup), targetStorage);
  assert.equal(imported.ok, true);
  assert.equal(imported.restoredKeys, 3);
  assert.deepEqual([...api.readStoredIds(api.STORAGE_KEYS.OWNED, targetStorage)], ['hu-tao', 'furina']);

  const badJson = api.importBackupPayload('{broken', targetStorage);
  assert.equal(badJson.ok, false);
  const wrongApp = api.importBackupPayload(JSON.stringify({ app: 'other', keys: {} }), targetStorage);
  assert.equal(wrongApp.ok, false);
});

test('200 Original Resin cap math and NA/EU/Asia/TW reset cycle keys calculate accurately', () => {
  const res = api.calculateResinCap(100, new Date('2026-11-16T10:00:00Z'));
  assert.equal(res.cap, 200);
  assert.equal(res.missing, 100);
  assert.equal(res.minutesToCap, 800);
  assert.equal(res.hours, 13);
  assert.equal(res.minutes, 20);
  assert.equal(res.isFull, false);

  const full = api.calculateResinCap(240, new Date('2026-11-16T10:00:00Z'));
  assert.equal(full.currentResin, 200);
  assert.equal(full.isFull, true);

  assert.equal(Boolean(api.SERVER_REGIONS.UTC), false);
  assert.deepEqual(Object.keys(api.SERVER_REGIONS), ['NA', 'EU', 'Asia', 'TW']);
  assert.equal(api.getServerRegionConfig('UTC').id, 'NA');

  // EU resets at 03:00 UTC
  assert.equal(api.getResetCycleKey(new Date('2026-11-16T02:59:00Z'), 'EU'), '2026-11-15');
  assert.equal(api.getResetCycleKey(new Date('2026-11-16T03:01:00Z'), 'EU'), '2026-11-16');

  // NA resets at 09:00 UTC (Monday weekly reset flips at 09:00 UTC)
  assert.equal(api.getWeeklyResetKey(new Date('2026-11-16T08:59:00Z'), 'NA'), 'W-2026-11-09');
  assert.equal(api.getWeeklyResetKey(new Date('2026-11-16T09:01:00Z'), 'NA'), 'W-2026-11-16');
});

test('granular ascension planner supports per-character deltas, individual talents, and weapon ascension', () => {
  const huTao = api.CHARACTERS.find((c) => c.id === 'hu-tao')!;
  const kazuha = api.CHARACTERS.find((c) => c.id === 'kazuha')!;
  const mistsplitter = api.WEAPONS.find((w) => w.id === 'mistsplitter-reforged')!;

  const fullPlan = api.calculateAscensionPlan([huTao, kazuha], { levelGoal: '90', talentGoal: '8' });
  assert.equal(fullPlan.characterCount, 2);
  assert.equal(fullPlan.totalHerosWit, 838);
  assert.ok(fullPlan.gems.some((g) => g.name === 'Agnidus Agate' && g.gemstone === 6));
  assert.ok(fullPlan.specialties.some((s) => s.name === 'Silk Flower' && s.count === 168));

  const deltaPlan = api.calculateAscensionPlan(
    [huTao],
    {
      charConfigs: {
        'hu-tao': {
          currentLevel: 70,
          targetLevel: 90,
          talents: [[1, 10], [8, 9], [1, 1]],
        },
      },
      weaponConfigs: {
        'mistsplitter-reforged': { currentLevel: 1, targetLevel: 90 },
      },
    },
    [mistsplitter]
  );

  // Only 70->80 (81 wit) + 80->90 (171 wit) = 252 Heros Wit
  assert.equal(deltaPlan.totalHerosWit, 252);
  // NA 1->10 (6 weekly + 1 crown) + Skill 8->9 (2 weekly + 0 crown) = 8 weekly, 1 crown
  assert.equal(deltaPlan.totalWeeklyDrops, 8);
  assert.equal(deltaPlan.totalCrowns, 1);
  // Weapon 1->90 adds 907 Mystic Enhancement Ore & Weapon Domain runs
  assert.equal(deltaPlan.weaponCount, 1);
  assert.equal(deltaPlan.totalOre, 907);
  assert.equal(deltaPlan.weaponDomainRuns.length, 1);
  assert.equal(deltaPlan.weaponDomainRuns[0].domain, 'Court of Flowing Sand');

  // 3-star weapon table uses lower 3-star Mora & Ore totals (405 Ore, 503k Mora) rather than 4-star (605 Ore)
  const ttdsMock: Weapon = {
    id: 'ttds-test',
    name: 'Thrilling Tales of Dragon Slayers',
    rarity: 3,
    type: 'Catalyst',
    baseAtk: 401,
    secondaryStat: 'HP 35.2%',
    passive: 'Swapping grants the next character +48% ATK for 10s.',
    bestCharacters: ['Barbara', 'Mona', 'Charlotte'],
    ascensionMaterial: "Boreal Wolf's Milk Tooth",
    domain: 'Cecilia Garden',
    domainDays: 'Tue / Fri',
    ascensionBreakdown: {
      materialType: "Boreal Wolf's Milk Tooth",
      domainName: 'Cecilia Garden',
      region: 'Mondstadt',
      daysAvailable: ['Tue', 'Fri', 'Sun'],
      eliteDrop: 'Chaos Device',
      commonDrop: 'Divining Scroll',
    },
  };
  const threeStarPlan = api.calculateAscensionPlan([], { weaponConfigs: { 'ttds-test': { currentLevel: 1, targetLevel: 90 } } }, [ttdsMock]);
  assert.equal(threeStarPlan.totalOre, 405);
  assert.equal(threeStarPlan.totalMora, 503000);

  // Non-milestone levels (e.g. 45 -> 75) snap cleanly to 40 -> 80 without skipping intermediate steps
  const snappedPlan = api.calculateAscensionPlan(
    [huTao],
    {
      charConfigs: {
        'hu-tao': { currentLevel: 45, targetLevel: 75, talents: [[1, 1], [1, 1], [1, 1]] },
      },
    }
  );
  // Steps 40->50 (29) + 50->60 (43) + 60->70 (60) + 70->80 (81) = 213 Heros Wit
  assert.equal(snappedPlan.totalHerosWit, 213);
});

test('damage calculator supports HP/DEF/EM scalers and Amplifying, Quicken, and Lunar reactions', () => {
  const rawAtk = api.calculateDamageMetrics({
    scalingType: 'ATK',
    statValue: 2000,
    multiplierPct: 200,
    critRatePct: 50,
    critDmgPct: 100,
    dmgBonusPct: 50,
    enemyMult: 1,
  });
  assert.equal(rawAtk.effectiveCritMultiplier, 1.5);
  assert.equal(rawAtk.nonCritDamage, 6000);
  assert.equal(rawAtk.critDamage, 12000);
  assert.equal(rawAtk.averageDamage, 9000);

  const hpVape = api.calculateDamageMetrics({
    scalingType: 'HP',
    statValue: 40000,
    multiplierPct: 15,
    critRatePct: 100,
    critDmgPct: 100,
    dmgBonusPct: 50,
    em: 200,
    reaction: 'amp-1.5',
    enemyMult: 1,
  });
  assert.equal(hpVape.scalingType, 'HP');
  assert.ok(hpVape.reactionMultiplier > 1.9);
  assert.ok(hpVape.critDamage > 34000);

  const spreadHit = api.calculateDamageMetrics({
    scalingType: 'EM',
    statValue: 800,
    multiplierPct: 150,
    critRatePct: 0,
    critDmgPct: 50,
    dmgBonusPct: 0,
    em: 120,
    reaction: 'spread',
    level: '90',
    enemyMult: 1,
  });
  // EM Scaling uses statValue (800) for both skill scaling & reaction math when secondary EM field is hidden
  assert.ok(spreadHit.flatQuickenBonus > 5000);
  assert.equal(spreadHit.nonCritDamage, 1200 + spreadHit.flatQuickenBonus);
});

test('pity calculator supports Character Event Wish (Capturing Radiance) and Weapon Event Wish (Fate Points)', () => {
  const charBase = api.calculatePityMetrics(50, false, { bannerMode: 'character', radianceLosses: 0 });
  assert.equal(charBase.softCap, 74);
  assert.equal(charBase.hardCap, 90);
  assert.equal(charBase.toSoftPity, 24);
  assert.equal(charBase.toFeaturedGuaranteed, 130);

  const charRadianceGuar = api.calculatePityMetrics(76, false, { bannerMode: 'character', radianceLosses: 3 });
  assert.equal(charRadianceGuar.inSoftPity, true);
  assert.equal(charRadianceGuar.isGuaranteed, true);
  assert.equal(charRadianceGuar.toFeaturedGuaranteed, 14);

  const wepBase = api.calculatePityMetrics(50, false, { bannerMode: 'weapon', fatePoints: 0 });
  assert.equal(wepBase.softCap, 63);
  assert.equal(wepBase.hardCap, 80);
  assert.equal(wepBase.toSoftPity, 13);
  assert.equal(wepBase.toHardPity, 30);
  assert.equal(wepBase.toFeaturedGuaranteed, 110);

  const wepFate = api.calculatePityMetrics(65, false, { bannerMode: 'weapon', fatePoints: 1 });
  assert.equal(wepFate.inSoftPity, true);
  assert.equal(wepFate.toFeaturedGuaranteed, 15);
});

test('team builder, tier list, specialties filters, and SVG icons operate accurately', () => {
  const huTao = api.CHARACTERS.find((c) => c.id === 'hu-tao')!;
  const bennett = api.CHARACTERS.find((c) => c.id === 'bennett')!;
  const xingqiu = api.CHARACTERS.find((c) => c.id === 'xingqiu')!;
  const yelan = api.CHARACTERS.find((c) => c.id === 'yelan')!;

  const resonances = api.detectTeamResonances([huTao, bennett, xingqiu, yelan]);
  assert.ok(resonances.some((r) => r.name.includes('Fervent Flames')));
  assert.ok(resonances.some((r) => r.name.includes('Soothing Water')));

  const reactions = api.detectTeamReactions([huTao, bennett, xingqiu, yelan]);
  assert.ok(reactions.some((rx) => rx.name === 'Vaporize'));

  const charSvgs = api.CHARACTERS.map((c) => api.getCharacterIconSvg(c));
  assert.equal(new Set(charSvgs).size, api.CHARACTERS.length);

  const weaponSvgs = api.WEAPONS.map((w) => api.getWeaponIconSvg(w));
  assert.equal(weaponSvgs.length, 56);
  assert.equal(new Set(weaponSvgs).size, 56);

  const specSvgs = api.LOCAL_SPECIALTIES.map((s) => api.getSpecialtyIconSvg(s.name));
  assert.equal(new Set(specSvgs).size, 58);

  const scarletSandsSvg = api.getWeaponIconSvg('Staff of the Scarlet Sands');
  const swordFallbackSvg = api.getWeaponIconSvg('Generic Unknown Sword');
  assert.notEqual(scarletSandsSvg, swordFallbackSvg);

  const unreleasedNoPortrait = new Set(['pulcinella', 'pantalone']);
  for (const ch of api.CHARACTERS) {
    if (unreleasedNoPortrait.has(ch.id)) {
      assert.equal(ch.icon, '');
    } else {
      assert.ok(typeof ch.icon === 'string' && /^https:\/\/enka\.network\/ui\/UI_AvatarIcon_.+\.png$/.test(ch.icon), `Missing avatar icon for ${ch.id}`);
    }
  }
  for (const wp of api.WEAPONS) {
    assert.ok(typeof wp.icon === 'string' && /^https:\/\/enka\.network\/ui\/UI_EquipIcon_.+_Awaken\.png$/.test(wp.icon), `Missing weapon icon for ${wp.id}`);
    assert.equal(api.getWeaponIconUrl(wp), wp.icon);
  }
  for (const sp of api.LOCAL_SPECIALTIES) {
    assert.ok(typeof sp.icon === 'string' && /^https:\/\/gi\.yatta\.moe\/assets\/UI\/UI_ItemIcon_\d+\.png$/.test(sp.icon), `Missing specialty icon for ${sp.name}`);
    assert.equal(api.getSpecialtyIconUrl(sp.name), sp.icon);
  }

  for (const d of api.TALENT_DOMAINS) {
    assert.ok(/^https:\/\/gi\.yatta\.moe\/assets\/UI\/UI_ItemIcon_\d+\.png$/.test(api.getItemIconUrl(d.book, 'book')), `Missing talent book icon for ${d.book}`);
  }
  for (const d of api.WEAPON_DOMAINS) {
    assert.ok(/^https:\/\/gi\.yatta\.moe\/assets\/UI\/UI_ItemIcon_\d+\.png$/.test(api.getItemIconUrl(d.material, 'weapon-material')), `Missing weapon domain material icon for ${d.material}`);
    for (const w of d.weapons) {
      assert.ok(/^https:\/\/enka\.network\/ui\/UI_EquipIcon_.+_Awaken\.png$/.test(api.getWeaponIconUrl(w.id || w.name)), `Missing domain weapon icon for ${w.name}`);
    }
  }
  for (const b of api.WEEKLY_BOSSES) {
    assert.ok(/^https:\/\/gi\.yatta\.moe\/assets\/UI\/monster\/UI_MonsterIcon_.+\.png$/.test(api.getItemIconUrl(b.id, 'weekly-boss')), `Missing weekly boss icon for ${b.id}`);
  }
  for (const curr of ['Mora', "Hero's Wit", 'Enhancement Ore', 'Original Resin', 'Condensed Resin', 'Crown of Insight', 'Weekly Trounce Boss Drops']) {
    assert.ok(/^https:\/\/gi\.yatta\.moe\/assets\/UI\/UI_ItemIcon_\d+\.png$/.test(api.getItemIconUrl(curr, 'currency')), `Missing currency icon for ${curr}`);
  }
  for (const ch of api.CHARACTERS) {
    assert.ok(api.getItemIconUrl(ch.ascensionMaterials.boss, 'boss-drop').startsWith('https://gi.yatta.moe/assets/UI/'), `Missing boss drop icon for ${ch.id}`);
    assert.ok(api.getItemIconUrl(ch.ascensionMaterials.common, 'common-drop').startsWith('https://gi.yatta.moe/assets/UI/'), `Missing common drop icon for ${ch.id}`);
    assert.ok(api.getSpecialtyIconUrl(ch.ascensionMaterials.specialty).startsWith('https://gi.yatta.moe/assets/UI/'), `Missing specialty icon for ${ch.id}`);
    for (const bw of ch.bestWeapons) {
      assert.ok(/^https:\/\/enka\.network\/ui\/UI_EquipIcon_.+_Awaken\.png$/.test(api.getWeaponIconUrl(bw)), `Missing bestWeapon icon for ${ch.id}: ${bw}`);
    }
    for (const ba of ch.bestArtifacts) {
      assert.ok(/^https:\/\/gi\.yatta\.moe\/assets\/UI\/reliquary\/UI_RelicIcon_.+\.png$/.test(api.getArtifactIconUrl(ba)), `Missing bestArtifact icon for ${ch.id}: ${ba}`);
    }
  }
  for (const wp of api.WEAPONS) {
    assert.ok(api.getItemIconUrl(wp.ascensionBreakdown.materialType, 'weapon-material').startsWith('https://gi.yatta.moe/assets/UI/'), `Missing weapon material icon for ${wp.id}`);
    assert.ok(api.getItemIconUrl(wp.ascensionBreakdown.eliteDrop, 'elite-drop').startsWith('https://gi.yatta.moe/assets/UI/'), `Missing weapon elite drop icon for ${wp.id}`);
    assert.ok(api.getItemIconUrl(wp.ascensionBreakdown.commonDrop, 'common-drop').startsWith('https://gi.yatta.moe/assets/UI/'), `Missing weapon common drop icon for ${wp.id}`);
  }
});

test('Akademiya progression percentage and daily domain roster matching helpers calculate accurately', () => {
  assert.equal(api.computeUnitProgressPct(90, 90, [[10, 10], [10, 10], [10, 10]]), 100);
  const partialPct = api.computeUnitProgressPct(45, 90, [[4, 8], [4, 8], [4, 8]]);
  assert.equal(partialPct, 50);

  // Hu Tao uses Diligence (Tue/Fri/Sun), Mistsplitter uses Coral Branch (Mon/Thu/Sun)
  const monMatches = api.getDailyDomainMatches(1, ['hu-tao'], [], ['mistsplitter-reforged'], []);
  assert.equal(Object.keys(monMatches.matchedBooks).length, 0);
  assert.ok(monMatches.matchedWeaponMats['Coral Branch of a Distant Sea']?.includes('Mistsplitter Reforged'));
  assert.equal(monMatches.totalMatchedDomains, 1);

  const tueMatches = api.getDailyDomainMatches(2, ['hu-tao'], ['hu-tao'], ['mistsplitter-reforged'], []);
  assert.ok(tueMatches.matchedBooks['Diligence']?.includes('Hu Tao'));
  assert.equal(tueMatches.totalMatchedDomains, 1);
});

