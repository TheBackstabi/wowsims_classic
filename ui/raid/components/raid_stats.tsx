import tippy from 'tippy.js';
import { ref } from 'tsx-vanilla';

import { Component } from '../../core/components/component.js';
import { Player } from '../../core/player.js';
import { Class, RaidBuffs, Spec } from '../../core/proto/common.js';
import { Hunter_Options_PetType as HunterPetType, Hunter_Rotation_StingType as HunterStingType } from '../../core/proto/hunter.js';
import { PaladinAura } from '../../core/proto/paladin.js';
import { WarlockOptions_Summon as WarlockSummon } from '../../core/proto/warlock.js';
import { WarriorShout } from '../../core/proto/warrior.js';
import { ActionId } from '../../core/proto_utils/action_id.js';
import {
	ClassSpecs,
	isHealingSpec,
	isMeleeDpsSpec,
	isRangedDpsSpec,
	isTankSpec,
	SpecTalents,
	specToClass,
	textCssClassForClass,
} from '../../core/proto_utils/utils.js';
import { Raid } from '../../core/raid.js';
import { sum } from '../../core/utils.js';
import { RaidSimUI } from './raid_sim_ui';

interface RaidStatsOptions {
	sections: Array<RaidStatsSectionOptions>;
}

interface RaidStatsSectionOptions {
	label: string;
	categories: Array<RaidStatsCategoryOptions>;
}

interface RaidStatsCategoryOptions {
	label: string;
	effects: Array<RaidStatsEffectOptions>;
}

type PlayerProvider = { class?: Class; condition: (player: Player<any>) => boolean };
type RaidProvider = (raid: Raid) => boolean;

interface RaidStatsEffectOptions {
	label: string;
	actionId?: ActionId;
	playerData?: PlayerProvider;
	raidData?: RaidProvider;
}

export class RaidStats extends Component {
	private readonly categories: Array<RaidStatsCategory>;

	constructor(parent: HTMLElement, raidSimUI: RaidSimUI) {
		super(parent, 'raid-stats');

		const categories: Array<RaidStatsCategory> = [];
		RAID_STATS_OPTIONS.sections.forEach(section => {
			const sectionElem = document.createElement('div');
			sectionElem.classList.add('raid-stats-section');
			this.rootElem.appendChild(sectionElem);
			sectionElem.innerHTML = `
				<div class="raid-stats-section-header">
					<label class="raid-stats-section-label form-label">${section.label}</label>
				</div>
				<div class="raid-stats-section-content"></div>
			`;
			const contentElem = sectionElem.getElementsByClassName('raid-stats-section-content')[0] as HTMLDivElement;

			section.categories.forEach(categoryOptions => {
				categories.push(new RaidStatsCategory(contentElem, raidSimUI, categoryOptions));
			});
		});
		this.categories = categories;

		raidSimUI.changeEmitter.on(_ => this.categories.forEach(c => c.update()));
	}
}

class RaidStatsCategory extends Component {
	readonly raidSimUI: RaidSimUI;
	private readonly options: RaidStatsCategoryOptions;
	private readonly effects: Array<RaidStatsEffect>;
	private readonly counterElem: HTMLElement;
	private readonly tooltipElem: HTMLElement;

	constructor(parent: HTMLElement, raidSimUI: RaidSimUI, options: RaidStatsCategoryOptions) {
		super(parent, 'raid-stats-category-root');
		this.raidSimUI = raidSimUI;
		this.options = options;

		const counterElemRef = ref<HTMLElement>();
		const categoryElemRef = ref<HTMLAnchorElement>();
		this.rootElem.appendChild(
			<a ref={categoryElemRef} href="javascript:void(0)" className="raid-stats-category" attributes={{ role: 'button' }}>
				<span ref={counterElemRef} className="raid-stats-category-counter"></span>
				<span className="raid-stats-category-label">{options.label}</span>
			</a>,
		);

		this.counterElem = counterElemRef.value!;
		this.tooltipElem = (
			<div>
				<label className="raid-stats-category-label">{options.label}</label>
			</div>
		) as HTMLElement;

		this.effects = options.effects.map(opt => new RaidStatsEffect(this.tooltipElem, raidSimUI, opt));

		if (options.effects.length != 1 || options.effects[0].playerData?.class) {
			const statsLink = categoryElemRef.value!;

			// Using the title option here because outerHTML sanitizes and filters out the img src options
			tippy(statsLink, {
				theme: 'raid-stats-category-tooltip',
				placement: 'right',
				content: this.tooltipElem,
			});
		}
	}

	update() {
		this.effects.forEach(effect => effect.update());

		const total = sum(this.effects.map(effect => effect.count));
		this.counterElem.textContent = String(total);

		const statsLink = this.rootElem.querySelector('.raid-stats-category') as HTMLElement;

		if (total == 0) {
			statsLink?.classList.remove('active');
		} else {
			statsLink?.classList.add('active');
		}
	}
}

class RaidStatsEffect extends Component {
	readonly raidSimUI: RaidSimUI;
	private readonly options: RaidStatsEffectOptions;
	private readonly counterElem: HTMLElement;

	curPlayers: Array<Player<any>>;
	count: number;

	constructor(parent: HTMLElement, raidSimUI: RaidSimUI, options: RaidStatsEffectOptions) {
		super(parent, 'raid-stats-effect');
		this.raidSimUI = raidSimUI;
		this.options = options;

		this.curPlayers = [];
		this.count = 0;

		const counterElemRef = ref<HTMLElement>();
		const labelElemRef = ref<HTMLElement>();
		const iconElemRef = ref<HTMLImageElement>();
		this.rootElem.appendChild(
			<>
				<span ref={counterElemRef} className="raid-stats-effect-counter"></span>
				<img ref={iconElemRef} className="raid-stats-effect-icon"></img>
				<span ref={labelElemRef} className="raid-stats-effect-label">
					{options.label}
				</span>
			</>,
		);

		this.counterElem = counterElemRef.value!;

		if (this.options.playerData?.class) {
			const labelElem = this.rootElem.querySelector('.raid-stats-effect-label') as HTMLElement;
			const playerCssClass = textCssClassForClass(this.options.playerData.class);
			labelElem.classList.add(playerCssClass);
		}

		const iconElem = this.rootElem.querySelector('.raid-stats-effect-icon') as HTMLImageElement;
		if (options.actionId) {
			options.actionId.fill().then(actionId => (iconElem.src = actionId.iconUrl));
		} else {
			iconElem.remove();
		}
	}

	update() {
		if (this.options.playerData) {
			this.curPlayers = this.raidSimUI.getActivePlayers().filter(p => this.options.playerData!.condition(p));
		}

		const raidData = this.options.raidData && this.options.raidData(this.raidSimUI.sim.raid);

		this.count = this.curPlayers.length + (raidData ? 1 : 0);
		this.counterElem.textContent = String(this.count);
		if (this.count == 0) {
			this.rootElem.classList.remove('active');
		} else {
			this.rootElem.classList.add('active');
		}
	}
}

function negateIf(val: boolean, cond: boolean): boolean {
	return cond ? !val : val;
}

function playerClass<T extends Class>(clazz: T, extraCondition?: (player: Player<ClassSpecs<T>>) => boolean): PlayerProvider {
	return {
		class: clazz,
		condition: (player: Player<any>): boolean => {
			return player.isClass(clazz) && (!extraCondition || extraCondition(player));
		},
	};
}
function playerClassAndTalentInternal<T extends Class>(
	clazz: T,
	talentName: keyof SpecTalents<ClassSpecs<T>>,
	negateTalent: boolean,
	extraCondition?: (player: Player<ClassSpecs<T>>) => boolean,
): PlayerProvider {
	return {
		class: clazz,
		condition: (player: Player<any>): boolean => {
			return (
				player.isClass(clazz) &&
				negateIf(Boolean((player.getTalents() as any)[talentName]), negateTalent) &&
				(!extraCondition || extraCondition(player))
			);
		},
	};
}
function playerClassAndTalent<T extends Class>(
	clazz: T,
	talentName: keyof SpecTalents<ClassSpecs<T>>,
	extraCondition?: (player: Player<ClassSpecs<T>>) => boolean,
): PlayerProvider {
	return playerClassAndTalentInternal(clazz, talentName, false, extraCondition);
}
function playerClassAndMissingTalent<T extends Class>(
	clazz: T,
	talentName: keyof SpecTalents<ClassSpecs<T>>,
	extraCondition?: (player: Player<ClassSpecs<T>>) => boolean,
): PlayerProvider {
	return playerClassAndTalentInternal(clazz, talentName, true, extraCondition);
}
function playerSpecAndTalentInternal<T extends Spec>(
	spec: T,
	talentName: keyof SpecTalents<T>,
	negateTalent: boolean,
	extraCondition?: (player: Player<T>) => boolean,
): PlayerProvider {
	return {
		class: specToClass[spec],
		condition: (player: Player<any>): boolean => {
			return (
				player.isSpec(spec) && negateIf(Boolean((player.getTalents() as any)[talentName]), negateTalent) && (!extraCondition || extraCondition(player))
			);
		},
	};
}
function playerSpecAndTalent<T extends Spec>(spec: T, talentName: keyof SpecTalents<T>, extraCondition?: (player: Player<T>) => boolean): PlayerProvider {
	return playerSpecAndTalentInternal(spec, talentName, false, extraCondition);
}
function playerSpecAndMissingTalent<T extends Spec>(
	spec: T,
	talentName: keyof SpecTalents<T>,
	extraCondition?: (player: Player<T>) => boolean,
): PlayerProvider {
	return playerSpecAndTalentInternal(spec, talentName, true, extraCondition);
}

function raidBuff(buffName: keyof RaidBuffs): RaidProvider {
	return (raid: Raid): boolean => {
		return Boolean(raid.getBuffs()[buffName]);
	};
}

const RAID_STATS_OPTIONS: RaidStatsOptions = {
	sections: [
		{
			label: 'Roles',
			categories: [
				{
					label: 'Tanks',
					effects: [
						{
							label: 'Tanks',
							playerData: { condition: player => isTankSpec(player.spec) },
						},
					],
				},
				{
					label: 'Healers',
					effects: [
						{
							label: 'Healers',
							playerData: { condition: player => isHealingSpec(player.spec) },
						},
					],
				},
				{
					label: 'Melee',
					effects: [
						{
							label: 'Melee',
							playerData: { condition: player => isMeleeDpsSpec(player.spec) },
						},
					],
				},
				{
					label: 'Ranged',
					effects: [
						{
							label: 'Ranged',
							playerData: { condition: player => isRangedDpsSpec(player.spec) },
						},
					],
				},
			],
		},
		{
			label: 'Buffs',
			categories: [
				{
					label: 'Bloodlust',
					effects: [
						{
							label: 'Bloodlust',
							actionId: ActionId.fromSpellId(2825),
							playerData: playerClass(Class.ClassShaman),
						},
					],
				},
				{
					label: 'Stats',
					effects: [
						{
							label: 'Improved Gift of the Wild',
							actionId: ActionId.fromSpellId(17051),
							playerData: playerClassAndTalent(Class.ClassDruid, 'improvedMarkOfTheWild'),
						},
						{
							label: 'Gift of the Wild',
							actionId: ActionId.fromSpellId(48470),
							playerData: playerClassAndMissingTalent(Class.ClassDruid, 'improvedMarkOfTheWild'),
						},
					],
				},
				{
					label: 'Stats %',
					effects: [
						{
							label: 'Blessing of Kings',
							actionId: ActionId.fromSpellId(25898),
							playerData: playerClass(Class.ClassPaladin),
						},
					],
				},
				{
					label: 'Armor',
					effects: [
						{
							label: 'Improved Devotion Aura',
							actionId: ActionId.fromSpellId(20140),
							playerData: playerClassAndTalent(
								Class.ClassPaladin,
								'improvedDevotionAura',
								player => player.getSpecOptions().aura == PaladinAura.DevotionAura,
							),
						},
						{
							label: 'Devotion Aura',
							actionId: ActionId.fromSpellId(48942),
							playerData: playerClassAndMissingTalent(
								Class.ClassPaladin,
								'improvedDevotionAura',
								player => player.getSpecOptions().aura == PaladinAura.DevotionAura,
							),
						},
						{
							label: 'Scroll of Protection',
							actionId: ActionId.fromItemId(43468),
							raidData: raidBuff('scrollOfProtection'),
						},
					],
				},
				{
					label: 'Stamina',
					effects: [
						{
							label: 'Improved Power Word Fortitude',
							actionId: ActionId.fromSpellId(14767),
							playerData: playerClassAndTalent(Class.ClassPriest, 'improvedPowerWordFortitude'),
						},
						{
							label: 'Power Word Fortitude',
							actionId: ActionId.fromSpellId(48161),
							playerData: playerClassAndMissingTalent(Class.ClassPriest, 'improvedPowerWordFortitude'),
						},
						{
							label: 'Scroll of Stamina',
							actionId: ActionId.fromItemId(37094),
							raidData: raidBuff('scrollOfStamina'),
						},
					],
				},
				{
					label: 'Str + Agi',
					effects: [
						{
							label: 'Scroll of Strength',
							actionId: ActionId.fromItemId(43466),
							raidData: raidBuff('scrollOfStrength'),
						},
						{
							label: 'Scroll of Agility',
							actionId: ActionId.fromItemId(43464),
							raidData: raidBuff('scrollOfAgility'),
						},
					],
				},
				{
					label: 'Intellect',
					effects: [
						{
							label: 'Arcane Brilliance',
							actionId: ActionId.fromSpellId(43002),
							playerData: playerClass(Class.ClassMage),
						},
						{
							label: 'Scroll of Intellect',
							actionId: ActionId.fromItemId(37092),
							raidData: raidBuff('scrollOfIntellect'),
						},
					],
				},
				{
					label: 'Spirit',
					effects: [
						{
							label: 'Divine Spirit',
							actionId: ActionId.fromSpellId(48073),
							playerData: playerClass(Class.ClassPriest),
						},
						{
							label: 'Scroll of Spirit',
							actionId: ActionId.fromItemId(10306),
							raidData: raidBuff('scrollOfSpirit'),
						},
					],
				},
				{
					label: 'Atk Pwr',
					effects: [
						{
							label: 'Improved Blessing of Might',
							actionId: ActionId.fromSpellId(20045),
							playerData: playerClass(Class.ClassPaladin),
						},
						{
							label: 'Blessing of Might',
							actionId: ActionId.fromSpellId(48934),
							playerData: playerClass(Class.ClassPaladin),
						},
						{
							label: 'Improved Battle Shout',
							actionId: ActionId.fromSpellId(12861),
							playerData: playerClassAndTalent(
								Class.ClassWarrior,
								'improvedBattleShout',
								player => player.getSpecOptions().shout == WarriorShout.WarriorShoutBattle,
							),
						},
						{
							label: 'Battle Shout',
							actionId: ActionId.fromSpellId(47436),
							playerData: playerClassAndMissingTalent(
								Class.ClassWarrior,
								'improvedBattleShout',
								player => player.getSpecOptions().shout == WarriorShout.WarriorShoutBattle,
							),
						},
					],
				},
				{
					label: 'Atk Pwr %',
					effects: [
						{
							label: 'Trueshot Aura',
							actionId: ActionId.fromSpellId(19506),
							playerData: playerClassAndTalent(Class.ClassHunter, 'trueshotAura'),
						},
					],
				},
				{
					label: 'Mit %',
					effects: [
						{
							label: 'Blessing Of Sanctuary',
							actionId: ActionId.fromSpellId(25899),
							playerData: playerClass(Class.ClassPaladin),
						},
					],
				},
				{
					label: 'MP5',
					effects: [
						{
							label: 'Improved Blessing of Wisdom',
							actionId: ActionId.fromSpellId(20245),
							playerData: playerClassAndTalent(Class.ClassPaladin, 'improvedBlessingOfWisdom'),
						},
						{
							label: 'Blessing of Wisdom',
							actionId: ActionId.fromSpellId(48938),
							playerData: playerClassAndMissingTalent(Class.ClassPaladin, 'improvedBlessingOfWisdom'),
						},
					],
				},
				{
					label: 'Melee Crit',
					effects: [
						{
							label: 'Leader of the Pack',
							actionId: ActionId.fromSpellId(17007),
							playerData: playerClassAndTalent(Class.ClassDruid, 'leaderOfThePack'),
						},
					],
				},
				{
					label: 'Melee Haste',
					effects: [],
				},
				{
					label: 'Spell Crit',
					effects: [
						{
							label: 'Moonkin Form',
							actionId: ActionId.fromSpellId(24907),
							playerData: playerSpecAndTalent(Spec.SpecBalanceDruid, 'moonkinForm'),
						},
					],
				},
				{
					label: 'Health',
					effects: [
						{
							label: 'Improved Imp',
							actionId: ActionId.fromSpellId(18696),
							playerData: playerClassAndTalent(Class.ClassWarlock, 'improvedImp', player => player.getSpecOptions().summon == WarlockSummon.Imp),
						},
						{
							label: 'Blood Pact',
							actionId: ActionId.fromSpellId(47982),
							playerData: playerClassAndMissingTalent(
								Class.ClassWarlock,
								'improvedImp',
								player => player.getSpecOptions().summon == WarlockSummon.Imp,
							),
						},
					],
				},
			],
		},
		{
			label: 'External Buffs',
			categories: [
				{
					label: 'Innervate',
					effects: [
						{
							label: 'Innervate',
							actionId: ActionId.fromSpellId(29166),
							playerData: playerClass(Class.ClassDruid),
						},
					],
				},
				{
					label: 'Power Infusion',
					effects: [
						{
							label: 'Power Infusion',
							actionId: ActionId.fromSpellId(10060),
							playerData: playerClassAndTalent(Class.ClassPriest, 'powerInfusion'),
						},
					],
				},
			],
		},
		{
			label: 'DPS Debuffs',
			categories: [
				{
					label: 'Major ArP',
					effects: [
						{
							label: 'Sunder Armor',
							actionId: ActionId.fromSpellId(7386),
							playerData: playerClass(Class.ClassWarrior),
						},
						{
							label: 'Expose Armor',
							actionId: ActionId.fromSpellId(8647),
							playerData: playerClass(Class.ClassRogue),
						},
					],
				},
				{
					label: 'Minor ArP',
					effects: [
						{
							label: 'Faerie Fire',
							actionId: ActionId.fromSpellId(770),
							playerData: playerClass(Class.ClassDruid, player => player.spec != Spec.SpecRestorationDruid),
						},
						// {
						// 	label: 'Curse of Weakness',
						// 	actionId: ActionId.fromSpellId(50511),
						// 	playerData: playerClass(Class.ClassWarlock, player => player.getSimpleRotation().curse == WarlockCurse.Weakness),
						// },
						{
							label: 'Spore Cloud',
							actionId: ActionId.fromSpellId(53598),
							playerData: playerClass(Class.ClassHunter, player => player.getSpecOptions().petType == HunterPetType.Bat),
						},
					],
				},
				{
					label: 'Bleed',
					effects: [
						{
							label: 'Mangle',
							actionId: ActionId.fromSpellId(16862),
							playerData: playerClass(Class.ClassDruid, player => [Spec.SpecFeralDruid, Spec.SpecFeralTankDruid].includes(player.spec)),
						},
					],
				},
			],
		},
		{
			label: 'Mitigation Debuffs',
			categories: [
				{
					label: 'Atk Pwr',
					effects: [
						{
							label: 'Vindication',
							actionId: ActionId.fromSpellId(26016),
							playerData: playerClassAndTalent(Class.ClassPaladin, 'vindication', player =>
								[Spec.SpecRetributionPaladin, Spec.SpecProtectionPaladin].includes(player.spec),
							),
						},
						{
							label: 'Improved Demoralizing Shout',
							actionId: ActionId.fromSpellId(12879),
							playerData: playerClassAndTalent(Class.ClassWarrior, 'improvedDemoralizingShout'),
						},
						{
							label: 'Demoralizing Shout',
							actionId: ActionId.fromSpellId(11556),
							playerData: playerClassAndMissingTalent(Class.ClassWarrior, 'improvedDemoralizingShout'),
						},
						{
							label: 'Improved Demoralizing Roar',
							actionId: ActionId.fromSpellId(16862),
							playerData: playerSpecAndTalent(
								Spec.SpecFeralTankDruid,
								'feralAggression',
								player => player.getSimpleRotation().maintainDemoralizingRoar,
							),
						},
						{
							label: 'Demoralizing Roar',
							actionId: ActionId.fromSpellId(9898),
							playerData: playerSpecAndMissingTalent(
								Spec.SpecFeralTankDruid,
								'feralAggression',
								player => player.getSimpleRotation().maintainDemoralizingRoar,
							),
						},
						// {
						// 	label: 'Improved Curse of Weakness',
						// 	actionId: ActionId.fromSpellId(18180),
						// 	playerData: playerClassAndTalent(Class.ClassWarlock, 'improvedCurseOfWeakness', player => player.getSimpleRotation().curse == WarlockCurse.Weakness),
						// },
						// {
						// 	label: 'Curse of Weakness',
						// 	actionId: ActionId.fromSpellId(50511),
						// 	playerData: playerClassAndTalent(Class.ClassWarlock, 'improvedCurseOfWeakness', player => player.getSimpleRotation().curse == WarlockCurse.Weakness),
						// },
						{
							label: 'Demoralizing Screech',
							actionId: ActionId.fromSpellId(55487),
							playerData: playerClass(Class.ClassHunter, player => player.getSpecOptions().petType == HunterPetType.CarrionBird),
						},
					],
				},
				{
					label: 'Atk Speed',
					effects: [
						{
							label: 'Improved Thunder Clap',
							actionId: ActionId.fromSpellId(12666),
							playerData: playerClassAndTalent(Class.ClassWarrior, 'improvedThunderClap'),
						},
						{
							label: 'Thunder Clap',
							actionId: ActionId.fromSpellId(47502),
							playerData: playerClassAndMissingTalent(Class.ClassWarrior, 'improvedThunderClap'),
						},
					],
				},
				{
					label: 'Miss',
					effects: [
						{
							label: 'Insect Swarm',
							actionId: ActionId.fromSpellId(24977),
							playerData: playerSpecAndTalent(Spec.SpecBalanceDruid, 'insectSwarm'),
						},
						{
							label: 'Scorpid Sting',
							actionId: ActionId.fromSpellId(3043),
							playerData: playerClass(Class.ClassHunter, player => player.getSimpleRotation().sting == HunterStingType.ScorpidSting),
						},
					],
				},
			],
		},
	],
};
