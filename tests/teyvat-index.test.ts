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
  BANNERS: Array<{ id: string; phase: string; title: string; fiveStar: string; endDateIso: string }>;
  ABYSS_FLOORS: Array<{ floor: number; title: string; chambers: Array<{ chamber: string; firstHalf: string; secondHalf: string }> }>;
  LOCAL_SPECIALTIES: Array<{ name: string; region: string; respawn: string; route: string }>;
  STORAGE_KEYS: Record<string, string>;
  getDomainsForDay: (day: number) => {
    dayIndex: number;
    dayName: string;
    isSunday: boolean;
    talentDomains: Array<{ book: string; region: string; characters: Array<{ name: string; element: string }> }>;
    weaponDomains: Array<{ material: string; region: string; weapons: Array<{ name: string }> }>;
  };
  filterCharacters: (list: Character[], filters: { search?: string; region?: string; element?: string; weapon?: string; role?: string; rarity?: string; ownedMode?: string }, ownedIds?: string[]) => Character[];
  filterWeapons: (list: Weapon[], filters: { search?: string; region?: string; type?: string; rarity?: string }) => Weapon[];
  readStoredIds: (key: string, storageObj?: StorageLike) => string[];
  writeStoredIds: (key: string, ids: string[], storageObj?: StorageLike) => void;
  readStoredJson: <T>(key: string, fallback: T, storageObj?: StorageLike) => T;
  writeStoredJson: (key: string, value: unknown, storageObj?: StorageLike) => void;
  calculateResinCap: (currentResin: number, nowDate?: Date) => {
    currentResin: number;
    missing: number;
    minutesToCap: number;
    hours: number;
    minutes: number;
    isFull: boolean;
  };
  getResetCycleKey: (nowDate: Date, regionId: string) => string;
  getWeeklyResetKey: (nowDate: Date, regionId: string) => string;
  calculateAscensionPlan: (selectedChars: Character[], options?: { levelGoal?: string; talentGoal?: string }) => {
    characterCount: number;
    totalMora: number;
    totalHerosWit: number;
    gems: Array<{ name: string; gemstone: number }>;
    specialties: Array<{ name: string; count: number }>;
    bossDrops: Array<{ name: string; count: number }>;
    commonDrops: Array<{ name: string; t1: number; t2: number; t3: number }>;
    domainRuns: Array<{ book: string; domain: string; estimatedRuns: number; resinCost: number }>;
    headlineSummary: string;
  };
  detectTeamResonances: (teamChars: Array<Character | null>) => Array<{ name: string; effect: string }>;
  detectTeamReactions: (teamChars: Array<Character | null>) => Array<{ name: string; effect: string }>;
  calculateDamageMetrics: (input: { atk: number; multiplierPct: number; critRatePct: number; critDmgPct: number; dmgBonusPct: number; enemyMult?: number }) => {
    effectiveCritMultiplier: number;
    averageDamage: number;
    nonCritDamage: number;
    critDamage: number;
    critValue: number;
  };
  calculatePityMetrics: (pityCount: number, isGuaranteed: boolean) => {
    pity: number;
    toSoftPity: number;
    toHardPity: number;
    toFeaturedGuaranteed: number;
    primogemsToHard: number;
    primogemsToFeatured: number;
    inSoftPity: boolean;
  };
  filterTierList: (entries: Array<{ charId: string; tier: string; note: string }>, chars: Character[], filters: { role?: string; element?: string }) => Array<{ tier: string; character: Character }>;
  filterSpecialties: (list: Array<{ name: string; region: string; respawn: string; route: string }>, chars: Character[], filters: { search?: string; region?: string }) => Array<{ name: string; region: string }>;
  getCharacterIconSvg: (charOrId: Character | string) => string;
  getWeaponIconSvg: (weaponOrName: Weapon | string, fallbackType?: string) => string;
  getSpecialtyIconSvg: (specialtyOrName: { name: string } | string) => string;
  getItemIconSvg: (name: string, category?: string) => string;
}

interface StorageLike {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
}

function loadIndexApi(): TeyvatApi {
  const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const scriptMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scriptMatches.length >= 1, 'Expected inline <script> in index.html');
  const scriptCode = scriptMatches[scriptMatches.length - 1][1];

  const noop = () => {};
  const fakeEl = () => ({
    hidden: false,
    textContent: '',
    innerHTML: '',
    value: 'All',
    style: { setProperty: noop, width: '' },
    className: '',
    classList: { toggle: noop, add: noop, remove: noop },
    setAttribute: noop,
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

test('dataset meets minimum size and field completeness requirements', () => {
  assert.ok(api.CHARACTERS.length >= 120, `Expected >=120 complete Genshin roster characters, got ${api.CHARACTERS.length}`);
  assert.ok(api.WEAPONS.length >= 50, `Expected >=50 weapons up to v7.2, got ${api.WEAPONS.length}`);

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
    assert.ok(wp.rarity === 4 || wp.rarity === 5);
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
  const thu = api.getDomainsForDay(4);
  assert.equal(mon.isSunday, false);
  assert.deepEqual(
    [...mon.talentDomains.map((d) => d.book)],
    ['Freedom', 'Prosperity', 'Transience', 'Admonition', 'Equity', 'Contention', 'Moonlight', 'Charity']
  );
  assert.deepEqual(
    [...thu.talentDomains.map((d) => d.book)],
    ['Freedom', 'Prosperity', 'Transience', 'Admonition', 'Equity', 'Contention', 'Moonlight', 'Charity']
  );

  const tue = api.getDomainsForDay(2);
  const fri = api.getDomainsForDay(5);
  assert.deepEqual(
    [...tue.talentDomains.map((d) => d.book)],
    ['Resistance', 'Diligence', 'Elegance', 'Ingenuity', 'Justice', 'Kindling', 'Elysium', 'Fortitude']
  );
  assert.deepEqual(
    [...fri.talentDomains.map((d) => d.book)],
    ['Resistance', 'Diligence', 'Elegance', 'Ingenuity', 'Justice', 'Kindling', 'Elysium', 'Fortitude']
  );

  const wed = api.getDomainsForDay(3);
  const sat = api.getDomainsForDay(6);
  assert.deepEqual(
    [...wed.talentDomains.map((d) => d.book)],
    ['Ballad', 'Gold', 'Light', 'Praxis', 'Order', 'Conflict', 'Vagrancy', 'Glory']
  );
  assert.deepEqual(
    [...sat.talentDomains.map((d) => d.book)],
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
  assert.ok(pyro5.some((c) => c.id === 'diluc'));
  assert.ok(pyro5.some((c) => c.id === 'mavuika'));
  assert.ok(pyro5.every((c) => c.element === 'Pyro' && c.rarity === 5));

  const snezhnayaChars = api.filterCharacters(api.CHARACTERS, { region: 'Snezhnaya' });
  assert.ok(snezhnayaChars.some((c) => c.id === 'tartaglia'));
  assert.ok(snezhnayaChars.some((c) => c.id === 'mitya'));
  assert.ok(snezhnayaChars.some((c) => c.id === 'odette'));
  assert.ok(snezhnayaChars.every((c) => c.region === 'Snezhnaya'));

  const outworldChars = api.filterCharacters(api.CHARACTERS, { region: 'Outworld' });
  assert.ok(outworldChars.some((c) => c.id === 'traveler'));
  assert.ok(outworldChars.some((c) => c.id === 'aloy'));

  const v72Chars = api.filterCharacters(api.CHARACTERS, { search: '7.2' });
  assert.ok(v72Chars.some((c) => c.id === 'mitya'));
  assert.ok(v72Chars.some((c) => c.id === 'valeriy'));

  const ownedHidden = api.filterCharacters(api.CHARACTERS, { ownedMode: 'hide-owned' }, ['hu-tao']);
  assert.equal(ownedHidden.some((c) => c.id === 'hu-tao'), false);
  const ownedOnly = api.filterCharacters(api.CHARACTERS, { ownedMode: 'only-owned' }, ['hu-tao', 'furina']);
  assert.equal(ownedOnly.length, 2);

  const polearms4 = api.filterWeapons(api.WEAPONS, { type: 'Polearm', rarity: '4' });
  assert.ok(polearms4.some((w) => w.id === 'the-catch'));
  assert.ok(polearms4.some((w) => w.id === 'ballad-of-the-sentinel'));
  assert.ok(polearms4.every((w) => w.type === 'Polearm' && w.rarity === 4));

  const nodKraiWeapons = api.filterWeapons(api.WEAPONS, { region: 'Nod-Krai' });
  assert.ok(nodKraiWeapons.some((w) => w.id === 'nocturnes-curtain-call'));
  assert.ok(nodKraiWeapons.some((w) => w.id === 'bloodsoaked-ruins'));

  const v72Weapons = api.filterWeapons(api.WEAPONS, { search: '7.2' });
  assert.ok(v72Weapons.some((w) => w.id === 'starsealed-edict'));
});

test('localStorage persistence helpers handle valid, missing, and malformed payloads safely', () => {
  const mem: Record<string, string> = {};
  const storage: StorageLike = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = v; },
  };

  assert.deepEqual([...api.readStoredIds(api.STORAGE_KEYS.CHARACTERS, storage)], []);
  api.writeStoredIds(api.STORAGE_KEYS.CHARACTERS, ['hu-tao', 'furina'], storage);
  assert.deepEqual([...api.readStoredIds(api.STORAGE_KEYS.CHARACTERS, storage)], ['hu-tao', 'furina']);

  storage.setItem(api.STORAGE_KEYS.WEAPONS, '{bad-json');
  assert.deepEqual([...api.readStoredIds(api.STORAGE_KEYS.WEAPONS, storage)], []);
});

test('resin cap math and daily/weekly reset cycle keys calculate accurately', () => {
  const res = api.calculateResinCap(100, new Date('2026-11-16T10:00:00Z'));
  assert.equal(res.missing, 60);
  assert.equal(res.minutesToCap, 480);
  assert.equal(res.hours, 8);
  assert.equal(res.minutes, 0);
  assert.equal(res.isFull, false);

  const full = api.calculateResinCap(200, new Date('2026-11-16T10:00:00Z'));
  assert.equal(full.currentResin, 160);
  assert.equal(full.isFull, true);

  // Before 04:00 UTC still belongs to previous reset cycle
  const beforeReset = api.getResetCycleKey(new Date('2026-11-16T03:59:00Z'), 'UTC');
  const afterReset = api.getResetCycleKey(new Date('2026-11-16T04:01:00Z'), 'UTC');
  assert.equal(beforeReset, '2026-11-15');
  assert.equal(afterReset, '2026-11-16');

  // Weekly reset rolls over on Monday 04:00 UTC
  const sunBeforeMon = api.getWeeklyResetKey(new Date('2026-11-16T03:59:00Z'), 'UTC'); // Monday 03:59 UTC
  const monAfterReset = api.getWeeklyResetKey(new Date('2026-11-16T04:01:00Z'), 'UTC'); // Monday 04:01 UTC
  assert.equal(sunBeforeMon, 'W-2026-11-09');
  assert.equal(monAfterReset, 'W-2026-11-16');
});

test('ascension planner consolidates Mora, Gems, Specialties, Common drops, and Domain runs', () => {
  const huTao = api.CHARACTERS.find((c) => c.id === 'hu-tao')!;
  const kazuha = api.CHARACTERS.find((c) => c.id === 'kazuha')!;
  const plan = api.calculateAscensionPlan([huTao, kazuha], { levelGoal: '90', talentGoal: '8' });

  assert.equal(plan.characterCount, 2);
  assert.ok(plan.totalMora > 6000000);
  assert.equal(plan.totalHerosWit, 838);
  assert.ok(plan.gems.some((g) => g.name === 'Agnidus Agate' && g.gemstone === 6));
  assert.ok(plan.specialties.some((s) => s.name === 'Silk Flower' && s.count === 168));
  // Both Hu Tao & Kazuha use Diligence -> grouped into 1 Taishan Mansion domain entry
  const diligenceRun = plan.domainRuns.find((d) => d.book === 'Diligence');
  assert.ok(diligenceRun);
  assert.equal(diligenceRun.domain, 'Taishan Mansion');
  assert.ok(diligenceRun.estimatedRuns >= 10);

  const odette = api.CHARACTERS.find((c) => c.id === 'odette')!;
  const mitya = api.CHARACTERS.find((c) => c.id === 'mitya')!;
  const plan72 = api.calculateAscensionPlan([odette, mitya], { levelGoal: '90', talentGoal: '8' });
  const charityRun = plan72.domainRuns.find((d) => d.book === 'Charity');
  assert.ok(charityRun);
  assert.equal(charityRun.domain, 'Relics of the Fallen Grace');
});

test('team builder detects elemental resonances and triggerable reactions', () => {
  const huTao = api.CHARACTERS.find((c) => c.id === 'hu-tao')!;
  const bennett = api.CHARACTERS.find((c) => c.id === 'bennett')!;
  const xingqiu = api.CHARACTERS.find((c) => c.id === 'xingqiu')!;
  const yelan = api.CHARACTERS.find((c) => c.id === 'yelan')!;

  const resonances = api.detectTeamResonances([huTao, bennett, xingqiu, yelan]);
  assert.ok(resonances.some((r) => r.name.includes('Fervent Flames')));
  assert.ok(resonances.some((r) => r.name.includes('Soothing Water')));

  const reactions = api.detectTeamReactions([huTao, bennett, xingqiu, yelan]);
  assert.ok(reactions.some((rx) => rx.name === 'Vaporize'));
  assert.equal(reactions.some((rx) => rx.name === 'Hyperbloom'), false);

  const kazuha = api.CHARACTERS.find((c) => c.id === 'kazuha')!;
  const nahida = api.CHARACTERS.find((c) => c.id === 'nahida')!;
  const raiden = api.CHARACTERS.find((c) => c.id === 'raiden-shogun')!;
  const rainbowRes = api.detectTeamResonances([xingqiu, kazuha, nahida, raiden]);
  assert.ok(rainbowRes.some((r) => r.name.includes('Protective Canopy')));
  const hyperReactions = api.detectTeamReactions([xingqiu, kazuha, nahida, raiden]);
  assert.ok(hyperReactions.some((rx) => rx.name === 'Hyperbloom'));
});

test('damage calculator, pity tracker, tier list, and specialties filters compute accurately', () => {
  const dmg = api.calculateDamageMetrics({
    atk: 2000,
    multiplierPct: 200,
    critRatePct: 50,
    critDmgPct: 100,
    dmgBonusPct: 50,
    enemyMult: 1,
  });
  // Base hit = 2000 * 2.0 * 1.5 = 6000; Eff Crit = 1 + 0.5*1.0 = 1.5; Avg = 9000; Crit = 12000
  assert.equal(dmg.effectiveCritMultiplier, 1.5);
  assert.equal(dmg.nonCritDamage, 6000);
  assert.equal(dmg.critDamage, 12000);
  assert.equal(dmg.averageDamage, 9000);

  const pity5050 = api.calculatePityMetrics(50, false);
  assert.equal(pity5050.toSoftPity, 24);
  assert.equal(pity5050.toHardPity, 40);
  assert.equal(pity5050.toFeaturedGuaranteed, 130);

  const pityGuar = api.calculatePityMetrics(76, true);
  assert.equal(pityGuar.inSoftPity, true);
  assert.equal(pityGuar.toSoftPity, 0);
  assert.equal(pityGuar.toFeaturedGuaranteed, 14);

  const hydroTiers = api.filterTierList(api.TIER_LIST, api.CHARACTERS, { element: 'Hydro' });
  assert.ok(hydroTiers.length >= 12 && hydroTiers.every((t) => t.character.element === 'Hydro'));

  const snezhnayaSpecs = api.filterSpecialties(api.LOCAL_SPECIALTIES, api.CHARACTERS, { region: 'Snezhnaya' });
  assert.equal(snezhnayaSpecs.length, 3);
  assert.ok(snezhnayaSpecs.every((s) => s.region === 'Snezhnaya'));
});

test('svg icon engine renders unique valid icons for all characters, weapons, collectibles, and items', () => {
  const charSvgs = api.CHARACTERS.map((c) => api.getCharacterIconSvg(c));
  assert.equal(charSvgs.length, api.CHARACTERS.length);
  assert.ok(charSvgs.every((svg) => svg.startsWith('<svg') && svg.endsWith('</svg>')));
  assert.equal(new Set(charSvgs).size, api.CHARACTERS.length, 'Expected every character to have a unique SVG icon');

  const weaponSvgs = api.WEAPONS.map((w) => api.getWeaponIconSvg(w));
  assert.equal(weaponSvgs.length, 54);
  assert.ok(weaponSvgs.every((svg) => svg.startsWith('<svg') && svg.endsWith('</svg>')));
  assert.equal(new Set(weaponSvgs).size, 54, 'Expected every weapon to have a unique SVG icon');

  const specSvgs = api.LOCAL_SPECIALTIES.map((s) => api.getSpecialtyIconSvg(s.name));
  assert.equal(specSvgs.length, 58);
  assert.ok(specSvgs.every((svg) => svg.startsWith('<svg') && svg.endsWith('</svg>')));
  assert.equal(new Set(specSvgs).size, 58, 'Expected every collectible/specialty to have a unique SVG icon');

  const bookSvgs = api.TALENT_DOMAINS.map((d) => api.getItemIconSvg(d.book, 'book'));
  assert.equal(new Set(bookSvgs).size, 24, 'Expected all 24 talent books to have distinct icons');

  const wMatSvgs = api.WEAPON_DOMAINS.map((d) => api.getItemIconSvg(d.material, 'weapon-material'));
  assert.equal(new Set(wMatSvgs).size, 24, 'Expected all 24 weapon domain materials to have distinct icons');

  const bossSvgs = api.WEEKLY_BOSSES.map((b) => api.getItemIconSvg(b.id, 'weekly-boss'));
  assert.equal(new Set(bossSvgs).size, 15, 'Expected all 15 weekly bosses to have distinct icons');

  const currencies = ['Mora', "Hero's Wit", 'Original Resin', 'Condensed Resin'];
  currencies.forEach((item) => {
    const svg = api.getItemIconSvg(item, 'currency');
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `Expected valid SVG for ${item}`);
  });

  const gems = ['Agnidus Agate', 'Varunada Lazurite', 'Vajrada Amethyst', 'Vayuda Turquoise', 'Prithiva Topaz', 'Shivada Jade', 'Nagadus Emerald'];
  assert.equal(new Set(gems.map((g) => api.getItemIconSvg(g, 'gem'))).size, 7);

  // Verify un-indexed recommended weapon names infer accurate weapon class icons (e.g., Staff of the Scarlet Sands -> Polearm)
  const scarletSandsSvg = api.getWeaponIconSvg('Staff of the Scarlet Sands');
  const polarStarSvg = api.getWeaponIconSvg('Polar Star');
  const unknownBowSvg = api.getWeaponIconSvg('Unlisted Signature Weapon', 'Bow');
  const swordFallbackSvg = api.getWeaponIconSvg('Generic Unknown Sword');
  assert.notEqual(scarletSandsSvg, swordFallbackSvg, 'Staff of the Scarlet Sands should render a Polearm icon rather than Sword fallback');
  assert.ok(scarletSandsSvg.includes('#EF6C57') && scarletSandsSvg.includes('line x1="8" y1="40" x2="33" y2="15"'));
  assert.notEqual(polarStarSvg, swordFallbackSvg, 'Polar Star should render a Bow icon rather than Sword fallback');
  assert.equal(polarStarSvg, unknownBowSvg, 'Both Polar Star and Bow fallbackType should render the Bow class icon');

  // Verify un-indexed domain secondary characters produce distinct avatar appearances
  const kleeSvg = api.getCharacterIconSvg({ name: 'Klee', element: 'Pyro' } as unknown as Character);
  const amberSvg = api.getCharacterIconSvg({ name: 'Amber', element: 'Pyro' } as unknown as Character);
  const tartagliaSvg = api.getCharacterIconSvg({ name: 'Tartaglia', element: 'Hydro' } as unknown as Character);
  assert.equal(new Set([kleeSvg, amberSvg, tartagliaSvg]).size, 3);
});

test('all characters and weapons include Enka Network portrait icon URLs and default filters return full collections', () => {
  for (const ch of api.CHARACTERS as Array<Character & { icon?: string }>) {
    assert.ok(
      typeof ch.icon === 'string' && /^https:\/\/enka\.network\/ui\/UI_AvatarIcon_.+\.png$/.test(ch.icon),
      `${ch.name} (${ch.id}) missing valid Enka avatar icon URL: ${ch.icon}`
    );
  }
  for (const wp of api.WEAPONS as Array<Weapon & { icon?: string }>) {
    assert.ok(
      typeof wp.icon === 'string' && /^https:\/\/enka\.network\/ui\/UI_EquipIcon_.+_Awaken\.png$/.test(wp.icon),
      `${wp.name} (${wp.id}) missing valid Enka weapon icon URL: ${wp.icon}`
    );
  }

  const allChars = api.filterCharacters(api.CHARACTERS, {
    search: '',
    region: 'All',
    element: 'All',
    weapon: 'All',
    role: 'All',
    rarity: 'All',
    ownedMode: 'all',
  }, ['hu-tao']);
  assert.equal(allChars.length, api.CHARACTERS.length);

  const allWeps = api.filterWeapons(api.WEAPONS, {
    search: '',
    region: 'All',
    type: 'All',
    rarity: 'All',
  });
  assert.equal(allWeps.length, api.WEAPONS.length);
});

