package tank

import (
	"testing"

	_ "github.com/wowsims/classic/sim/common"
	"github.com/wowsims/classic/sim/core"
	"github.com/wowsims/classic/sim/core/proto"
)

func init() {
	RegisterFeralTankDruid()
}

func TestFeralTank(t *testing.T) {
	core.RunTestSuite(t, t.Name(), core.FullCharacterTestSuiteGenerator(core.CharacterSuiteConfig{
		Class: proto.Class_ClassDruid,
		Race:  proto.Race_RaceTauren,

		GearSet:     core.GetGearSet("../../../ui/feral_tank_druid/gear_sets", "p1"),
		Talents:     StandardTalents,
		Consumes:    FullConsumes,
		SpecOptions: core.SpecOptionsCombo{Label: "Default", SpecOptions: PlayerOptionsDefault},
		Rotation:    core.GetAplRotation("../../../ui/feral_tank_druid/apls", "default"),

		IsTank:          true,
		InFrontOfTarget: true,

		ItemFilter: core.ItemFilter{
			WeaponTypes: []proto.WeaponType{
				proto.WeaponType_WeaponTypeDagger,
				proto.WeaponType_WeaponTypeMace,
				proto.WeaponType_WeaponTypeOffHand,
				proto.WeaponType_WeaponTypeStaff,
			},
			ArmorType: proto.ArmorType_ArmorTypeLeather,
			RangedWeaponTypes: []proto.RangedWeaponType{
				proto.RangedWeaponType_RangedWeaponTypeIdol,
			},
		},
	}))
}

var StandardTalents = "-503232132322010353120300313511-20350001"

var PlayerOptionsDefault = &proto.Player_FeralTankDruid{
	FeralTankDruid: &proto.FeralTankDruid{
		Options: &proto.FeralTankDruid_Options{
			InnervateTarget: &proto.UnitReference{}, // no Innervate
			StartingRage:    20,
		},
	},
}

var FullConsumes = &proto.Consumes{
	BattleElixir:    proto.BattleElixir_GurusElixir,
	GuardianElixir:  proto.GuardianElixir_GiftOfArthas,
	Food:            proto.Food_FoodBlackenedDragonfin,
	DefaultPotion:   proto.Potions_IndestructiblePotion,
	DefaultConjured: proto.Conjured_ConjuredHealthstone,
	ThermalSapper:   true,
	FillerExplosive: proto.Explosive_ExplosiveSaroniteBomb,
}
