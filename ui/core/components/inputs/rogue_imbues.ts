import { Class, WeaponImbue } from '../../proto/common.js';
import { ActionId } from '../../proto_utils/action_id';
import { ConsumableInputConfig } from './consumables';

// Rogue Imbues
export const InstantPoisonWeaponImbue: ConsumableInputConfig<WeaponImbue> = {
	actionId: () => ActionId.fromItemId(8928),
	value: WeaponImbue.InstantPoison,
	showWhen: player => player.getClass() == Class.ClassRogue,
};

export const DeadlyPoisonWeaponImbue: ConsumableInputConfig<WeaponImbue> = {
	actionId: () => ActionId.fromItemId(8985),
	value: WeaponImbue.DeadlyPoison,
	showWhen: player => player.getClass() == Class.ClassRogue,
};

export const WoundPoisonWeaponImbue: ConsumableInputConfig<WeaponImbue> = {
	actionId: () => ActionId.fromItemId(10922),
	value: WeaponImbue.WoundPoison,
	showWhen: player => player.getClass() == Class.ClassRogue,
};
