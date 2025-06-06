import tippy from 'tippy.js';

import { BooleanPicker } from '../components/boolean_picker.js';
import { NumberPicker } from '../components/number_picker.js';
import { IndividualSimUI } from '../individual_sim_ui.js';
import { Player } from '../player.js';
import { ProgressMetrics, StatWeightsResult, StatWeightValues } from '../proto/api.js';
import { PseudoStat, Stat, UnitStats } from '../proto/common.js';
import { getClassStatName } from '../proto_utils/names.js';
import { Stats, UnitStat } from '../proto_utils/stats.js';
import { RequestTypes } from '../sim_signal_manager';
import { EventID, TypedEvent } from '../typed_event.js';
import { stDevToConf90 } from '../utils.js';
import { BaseModal } from './base_modal.js';
import { ResultsViewer } from './results_viewer.js';

export function addStatWeightsAction(simUI: IndividualSimUI<any>, epStats: Array<Stat>, epPseudoStats: Array<PseudoStat> | undefined, epReferenceStat: Stat) {
	simUI.addAction('Stat Weights', 'ep-weights-action', () => {
		new EpWeightsMenu(simUI, epStats, epPseudoStats || [], epReferenceStat).open();
	});
}

// Create the config for modal in separate function, as constructor cannot
// contain any logic before `super' call. Use modal-xl to accommodate the extra
// TMI & p(death) EP in the UI.
function getModalConfig(simUI: IndividualSimUI<any>) {
	const baseConfig = { footer: true, scrollContents: true };
	if (simUI.sim.getShowThreatMetrics() && simUI.sim.getShowExperimental()) {
		return { size: 'xl' as const, ...baseConfig };
	}
	return baseConfig;
}

function scaledEpValue(stat: UnitStat, epRatios: number[], result: StatWeightsResult | null): number {
	if (!result) return 0;

	return (
		(result.dps?.epValues ? epRatios[0] * stat.getProtoValue(result.dps.epValues) : 0) +
		(result.hps?.epValues ? epRatios[1] * stat.getProtoValue(result.hps.epValues) : 0) +
		(result.tps?.epValues ? epRatios[2] * stat.getProtoValue(result.tps.epValues) : 0) +
		(result.dtps?.epValues ? epRatios[3] * stat.getProtoValue(result.dtps.epValues) : 0) +
		(result.tmi?.epValues ? epRatios[4] * stat.getProtoValue(result.tmi.epValues) : 0) +
		(result.pDeath?.epValues ? epRatios[5] * stat.getProtoValue(result.pDeath.epValues) : 0)
	);
}

class EpWeightsMenu extends BaseModal {
	private readonly simUI: IndividualSimUI<any>;
	private readonly container: HTMLElement;
	private readonly table: HTMLElement;
	private readonly tableBody: HTMLElement;
	private readonly resultsViewer: ResultsViewer;

	private statsType: string;
	private epStats: Array<Stat>;
	private epPseudoStats: Array<PseudoStat>;
	private epReferenceStat: Stat;
	private showAllStats = false;

	constructor(simUI: IndividualSimUI<any>, epStats: Array<Stat>, epPseudoStats: Array<PseudoStat>, epReferenceStat: Stat) {
		super(simUI.rootElem, 'ep-weights-menu', getModalConfig(simUI));
		this.simUI = simUI;
		this.statsType = 'ep';
		this.epStats = epStats;
		this.epPseudoStats = epPseudoStats;
		this.epReferenceStat = epReferenceStat;

		this.header?.insertAdjacentHTML('afterbegin', '<h5 class="modal-title">Calculate Stat Weights</h5>');
		this.body.innerHTML = `
			<div class="ep-weights-options row">
				<div class="col col-sm-3">
					<select class="ep-type-select form-select">
						<option value="ep">EP</option>
						<option value="weight">Weights</option>
					</select>
				</div>
				<div class="show-all-stats-container col col-sm-3"></div>
			</div>
			<div class="ep-reference-options row experimental">
				<div class="col col-sm-4 damage-metrics">
					<span>DPS/TPS reference:</span>
					<select class="ref-stat-select form-select damage-metrics">
					</select>
				</div>
				<div class="col col-sm-4 healing-metrics">
					<span>Healing reference:</span>
					<select class="ref-stat-select form-select healing-metrics">
					</select>
				</div>
				<div class="col col-sm-4 threat-metrics">
					<span>Mitigation reference:</span>
					<select class="ref-stat-select form-select threat-metrics">
					</select>
				</div>
				<p>The above stat selectors control which reference stat is used for EP normalisation for the different EP columns.</p>
			</div>
			<p>The 'Current EP' column displays the values currently used by the item pickers to sort items.</br>
			Use the <a href='javascript:void(0)' class="fa fa-copy"></a> icon above the EPs to use newly calculated EPs.</p>
			<div class="results-ep-table-container modal-scroll-table">
				<div class="results-pending-overlay"></div>
				<table class="results-ep-table">
					<thead>
						<tr>
							<th>Stat</th>
							<th class="damage-metrics type-weight">
								<span>DPS Weight</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="damage-metrics type-ep">
								<span>DPS EP</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="healing-metrics type-weight">
								<span>HPS Weight</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="healing-metrics type-ep">
								<span>HPS EP</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-weight">
								<span>TPS Weight</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-ep">
								<span>TPS EP</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-weight">
								<span>DTPS Weight</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-ep">
								<span>DTPS EP</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-weight experimental">
								<span>TMI Weight</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-ep experimental">
								<span>TMI EP</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-weight experimental">
								<span>Death Weight</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th class="threat-metrics type-ep experimental">
								<span>Death EP</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fa fa-copy"></i>
								</a>
							</th>
							<th style="text-align: center">
								<span>Current EP</span>
								<a href="javascript:void(0)" role="button" class="col-action">
									<i class="fas fa-arrows-rotate"></i>
								</a>
							</th>
						</tr>
						<tr class="ep-ratios">
							<td>EP Ratio</td>
							<td class="damage-metrics type-ratio type-weight">
							</td>
							<td class="damage-metrics type-ratio type-ep">
							</td>
							<td class="healing-metrics type-ratio type-weight">
							</td>
							<td class="healing-metrics type-ratio type-ep">
							</td>
							<td class="threat-metrics type-ratio type-weight">
							</td>
							<td class="threat-metrics type-ratio type-ep">
							</td>
							<td class="threat-metrics type-ratio type-weight">
							</td>
							<td class="threat-metrics type-ratio type-ep">
							</td>
							<td class="threat-metrics type-ratio type-weight experimental">
							</td>
							<td class="threat-metrics type-ratio type-ep experimental">
							</td>
							<td class="threat-metrics type-ratio type-weight experimental">
							</td>
							<td class="threat-metrics type-ratio type-ep experimental">
							</td>
							<td style="text-align: center; vertical-align: middle;">
								<button class="btn btn-primary compute-ep">
									<i class="fas fa-calculator"></i>
									<span class="not-tiny">Update </span>EP
								</button>
							</td>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</div>
		`;
		this.footer!.innerHTML = `
			<button class="btn btn-primary calc-weights">
				<i class="fas fa-calculator"></i>
				Calculate
			</button>
		`;

		this.container = this.rootElem.querySelector('.results-ep-table-container') as HTMLElement;
		this.table = this.rootElem.querySelector('.results-ep-table') as HTMLElement;
		this.tableBody = this.rootElem.querySelector('.results-ep-table tbody') as HTMLElement;

		const resultsElem = this.rootElem.querySelector('.results-pending-overlay') as HTMLElement;
		this.resultsViewer = new ResultsViewer(resultsElem);

		const updateType = () => {
			if (this.statsType == 'ep') {
				this.table.classList.remove('stats-type-weight');
				this.table.classList.add('stats-type-ep');
			} else {
				this.table.classList.add('stats-type-weight');
				this.table.classList.remove('stats-type-ep');
			}
		};

		const selectElem = this.rootElem.getElementsByClassName('ep-type-select')[0] as HTMLSelectElement;
		selectElem.addEventListener('input', _event => {
			this.statsType = selectElem.value;
			updateType();
		});
		selectElem.value = this.statsType;
		updateType();

		const getNameFromStat = (stat: Stat | undefined) => {
			return stat !== undefined ? getClassStatName(stat, this.simUI.player.getClass()) : '??';
		};

		const getStatFromName = (value: string) => {
			for (const stat of this.epStats) {
				if (getNameFromStat(stat) == value) {
					return stat;
				}
			}

			return undefined;
		};

		const updateEpRefStat = () => {
			this.simUI.player.epRefStatChangeEmitter.emit(TypedEvent.nextEventID());
			this.simUI.prevEpSimResult = this.calculateEp(this.getPrevSimResult());
			this.updateTable();
		};

		const epRefSelects = this.rootElem.querySelectorAll('.ref-stat-select') as NodeListOf<HTMLSelectElement>;
		epRefSelects.forEach((epSelect: HTMLSelectElement, _idx: number) => {
			this.epStats.forEach(stat => {
				epSelect.options[epSelect.options.length] = new Option(getNameFromStat(stat));
			});
			if (epSelect.classList.contains('damage-metrics')) {
				epSelect.addEventListener('input', _event => {
					this.simUI.dpsRefStat = getStatFromName(epSelect.value);
					updateEpRefStat();
				});
				epSelect.value = getNameFromStat(this.getDpsEpRefStat());
			} else if (epSelect.classList.contains('healing-metrics')) {
				epSelect.addEventListener('input', _event => {
					this.simUI.healRefStat = getStatFromName(epSelect.value);
					updateEpRefStat();
				});
				epSelect.value = getNameFromStat(this.getHealEpRefStat());
			} else if (epSelect.classList.contains('threat-metrics')) {
				epSelect.addEventListener('input', _event => {
					this.simUI.tankRefStat = getStatFromName(epSelect.value);
					updateEpRefStat();
				});
				epSelect.value = getNameFromStat(this.getTankEpRefStat());
			}
		});

		const calcButton = this.rootElem.getElementsByClassName('calc-weights')[0] as HTMLButtonElement;
		let isRunning = false;
		calcButton.addEventListener('click', async _event => {
			if (isRunning) return;
			isRunning = true;

			try {
				await this.simUI.sim.signalManager.abortType(RequestTypes.All);
			} catch (error) {
				console.error(error);
				return;
			}

			calcButton.disabled = true;

			const previousContents = calcButton.innerHTML;
			calcButton.style.width = `${calcButton.getBoundingClientRect().width.toFixed(3)}px`;
			calcButton.innerHTML = `<i class="fa fa-spinner fa-spin"></i>&nbsp;Running`;
			this.container.scrollTo({ top: 0 });
			this.container.classList.add('pending');
			this.resultsViewer.setPending();
			const iterations = this.simUI.sim.getIterations();

			let waitAbort = false;
			this.resultsViewer.addAbortButton(async () => {
				if (waitAbort) return;
				try {
					waitAbort = true;
					await simUI.sim.signalManager.abortType(RequestTypes.StatWeights);
				} catch (error) {
					console.error('Error on stat weight abort!');
					console.error(error);
				} finally {
					waitAbort = false;
					if (!isRunning) {
						calcButton.disabled = false;
						calcButton.innerHTML = previousContents;
					}
				}
			});

			const result = await this.simUI.player.computeStatWeights(
				TypedEvent.nextEventID(),
				this.epStats,
				this.epPseudoStats,
				this.epReferenceStat,
				(progress: ProgressMetrics) => {
					this.setSimProgress(progress);
				},
			);
			this.container.classList.remove('pending');
			this.resultsViewer.hideAll();

			isRunning = false;
			if (!waitAbort) {
				calcButton.disabled = false;
				calcButton.innerHTML = previousContents;
			}
			if (!result) return;

			this.simUI.prevEpIterations = iterations;
			this.simUI.prevEpSimResult = this.calculateEp(result);
			this.updateTable();
		});

		this.addOnHideCallback(() => {
			this.simUI.sim.signalManager.abortType(RequestTypes.StatWeights).catch(console.error);
		});

		const colActionButtons = Array.from(this.rootElem.getElementsByClassName('col-action')) as Array<HTMLSelectElement>;
		const makeUpdateWeights = (
			button: HTMLElement,
			labelTooltip: string,
			tooltip: string,
			weightsFunc: () => UnitStats | undefined,
			epRefStat?: () => Stat,
		) => {
			const label = button.previousElementSibling as HTMLElement;
			const title = () => {
				if (!epRefStat) return labelTooltip;

				const refStatName = getNameFromStat(epRefStat());
				return labelTooltip + ` Normalized by ${refStatName}.`;
			};

			tippy(label, {
				content: title,
			});
			tippy(button, {
				content: tooltip,
			});

			button.addEventListener('click', _event => {
				this.simUI.player.setEpWeights(TypedEvent.nextEventID(), Stats.fromProto(weightsFunc()));
				this.updateTable();
			});
		};

		makeUpdateWeights(
			colActionButtons[0],
			'Per-point increase in DPS (Damage Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().dps!.weights,
		);
		makeUpdateWeights(
			colActionButtons[1],
			'EP (Equivalency Points) for DPS (Damage Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().dps!.epValues,
			() => this.getDpsEpRefStat(),
		);
		makeUpdateWeights(
			colActionButtons[2],
			'Per-point increase in HPS (Healing Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().hps!.weights,
		);
		makeUpdateWeights(
			colActionButtons[3],
			'EP (Equivalency Points) for HPS (Healing Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().hps!.epValues,
			() => this.getHealEpRefStat(),
		);
		makeUpdateWeights(
			colActionButtons[4],
			'Per-point increase in TPS (Threat Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().tps!.weights,
		);
		makeUpdateWeights(
			colActionButtons[5],
			'EP (Equivalency Points) for TPS (Threat Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().tps!.epValues,
			() => this.getDpsEpRefStat(),
		);
		makeUpdateWeights(
			colActionButtons[6],
			'Per-point increase in DTPS (Damage Taken Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().dtps!.weights,
		);
		makeUpdateWeights(
			colActionButtons[7],
			'EP (Equivalency Points) for DTPS (Damage Taken Per Second) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().dtps!.epValues,
			() => this.getTankEpRefStat(),
		);
		makeUpdateWeights(
			colActionButtons[8],
			'Per-point decrease in TMI (Theck-Meloree Index) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().tmi!.weights,
		);
		makeUpdateWeights(
			colActionButtons[9],
			'EP (Equivalency Points) for TMI (Theck-Meloree Index) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().tmi!.epValues,
			() => this.getTankEpRefStat(),
		);
		makeUpdateWeights(
			colActionButtons[10],
			'Per-point decrease in p(death) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().pDeath!.weights,
		);
		makeUpdateWeights(
			colActionButtons[11],
			'EP (Equivalency Points) for p(death) for each stat.',
			'Copy to Current EP',
			() => this.getPrevSimResult().pDeath!.epValues,
			() => this.getTankEpRefStat(),
		);
		makeUpdateWeights(colActionButtons[12], 'Current EP Weights. Used to sort the gear selector menus.', 'Restore Default EP', () =>
			this.simUI.individualConfig.defaults.epWeights.toProto(),
		);

		const showAllStatsContainer = this.rootElem.getElementsByClassName('show-all-stats-container')[0] as HTMLElement;
		new BooleanPicker(showAllStatsContainer, this, {
			id: 'ep-show-all-stats',
			label: 'Show All Stats',
			inline: true,
			changedEvent: () => new TypedEvent(),
			getValue: () => this.showAllStats,
			setValue: (eventID: EventID, menu: EpWeightsMenu, newValue: boolean) => {
				this.showAllStats = newValue;
				this.updateTable();
			},
		});

		this.updateTable();

		const makeEpRatioCell = (cell: HTMLElement, idx: number) => {
			new NumberPicker(cell, this.simUI.player, {
				id: `ep-ratio-${idx}`,
				float: true,
				changedEvent: (player: Player<any>) => player.epRatiosChangeEmitter,
				getValue: (_player: Player<any>) => this.simUI.player.getEpRatios()[idx],
				setValue: (eventID: EventID, player: Player<any>, newValue: number) => {
					const epRatios = player.getEpRatios();
					epRatios[idx] = newValue;
					player.setEpRatios(eventID, epRatios);
				},
			});
		};
		const epRatioCells = this.body.querySelectorAll('.type-ratio.type-ep') as NodeListOf<HTMLElement>;
		epRatioCells.forEach(makeEpRatioCell);
		this.simUI.player.epRatiosChangeEmitter.on(_eventID => this.updateTable());

		const weightRatioCells = this.body.querySelectorAll('.type-ratio.type-weight') as NodeListOf<HTMLElement>;
		weightRatioCells.forEach(makeEpRatioCell);

		const updateButton = this.rootElem.getElementsByClassName('compute-ep')[0] as HTMLElement;
		tippy(updateButton, {
			content: 'Compute Weighted EP',
		});

		updateButton.addEventListener('click', _event => {
			const results = this.getPrevSimResult();
			const epRatios = this.simUI.player.getEpRatios();
			if (this.statsType == 'ep') {
				const scaledDpsEp = Stats.fromProto(results.dps!.epValues).scale(epRatios[0]);
				const scaledHpsEp = Stats.fromProto(results.hps!.epValues).scale(epRatios[1]);
				const scaledTpsEp = Stats.fromProto(results.tps!.epValues).scale(epRatios[2]);
				const scaledDtpsEp = Stats.fromProto(results.dtps!.epValues).scale(epRatios[3]);
				const scaledTmiEp = Stats.fromProto(results.tmi!.epValues).scale(epRatios[4]);
				const scaledPDeathEp = Stats.fromProto(results.pDeath!.epValues).scale(epRatios[5]);
				const newEp = scaledDpsEp.add(scaledHpsEp).add(scaledTpsEp).add(scaledDtpsEp).add(scaledTmiEp).add(scaledPDeathEp);
				this.simUI.player.setEpWeights(TypedEvent.nextEventID(), newEp);
			} else {
				const scaledDpsWeights = Stats.fromProto(results.dps!.weights).scale(epRatios[0]);
				const scaledHpsWeights = Stats.fromProto(results.hps!.weights).scale(epRatios[1]);
				const scaledTpsWeights = Stats.fromProto(results.tps!.weights).scale(epRatios[2]);
				const scaledDtpsWeights = Stats.fromProto(results.dtps!.weights).scale(epRatios[3]);
				const scaledTmiWeights = Stats.fromProto(results.tmi!.weights).scale(epRatios[4]);
				const scaledPDeathWeights = Stats.fromProto(results.pDeath!.weights).scale(epRatios[5]);
				const newWeights = scaledDpsWeights
					.add(scaledHpsWeights)
					.add(scaledTpsWeights)
					.add(scaledDtpsWeights)
					.add(scaledTmiWeights)
					.add(scaledPDeathWeights);
				this.simUI.player.setEpWeights(TypedEvent.nextEventID(), newWeights);
			}
			this.updateTable();
		});
	}

	private setSimProgress(progress: ProgressMetrics) {
		this.resultsViewer.setContent(`
			<div class="results-sim">
				<div class=""> ${progress.completedSims} / ${progress.totalSims}<br>simulations complete</div>
				<div class="">
					${progress.completedIterations} / ${progress.totalIterations}<br>iterations complete
				</div>
			</div>
		`);
	}

	private updateTable() {
		this.tableBody.innerHTML = ``;

		EpWeightsMenu.epUnitStats.forEach(stat => {
			// Don't show extra stats when 'Show all stats' is not selected
			if (
				(!this.showAllStats && stat.isStat() && !this.epStats.includes(stat.getStat())) ||
				(stat.isPseudoStat() && !this.epPseudoStats.includes(stat.getPseudoStat()))
			) {
				return;
			}
			const row = this.makeTableRow(stat);
			this.tableBody.appendChild(row);
		});
	}

	private makeTableRow(stat: UnitStat): HTMLElement {
		const row = document.createElement('tr');
		const result = this.simUI.prevEpSimResult;
		const epRatios = this.simUI.player.getEpRatios();
		const rowTotalEp = scaledEpValue(stat, epRatios, result);
		row.innerHTML = `
			<td>${stat.getName(this.simUI.player.getClass())}</td>
			${this.makeTableRowCells(stat, result?.dps, 'damage-metrics', rowTotalEp, epRatios[0])}
			${this.makeTableRowCells(stat, result?.hps, 'healing-metrics', rowTotalEp, epRatios[1])}
			${this.makeTableRowCells(stat, result?.tps, 'threat-metrics', rowTotalEp, epRatios[2])}
			${this.makeTableRowCells(stat, result?.dtps, 'threat-metrics', rowTotalEp, epRatios[3])}
			${this.makeTableRowCells(stat, result?.tmi, 'threat-metrics experimental', rowTotalEp, epRatios[4])}
			${this.makeTableRowCells(stat, result?.pDeath, 'threat-metrics experimental', rowTotalEp, epRatios[5])}
			<td class="current-ep"></td>
		`;

		const currentEpCell = row.querySelector('.current-ep') as HTMLElement;
		new NumberPicker(currentEpCell, this.simUI.player, {
			id: `ep-weight-stat-${stat}`,
			float: true,
			changedEvent: (player: Player<any>) => player.epWeightsChangeEmitter,
			getValue: (_player: Player<any>) => this.simUI.player.getEpWeights().getUnitStat(stat),
			setValue: (eventID: EventID, player: Player<any>, newValue: number) => {
				const epWeights = player.getEpWeights().withUnitStat(stat, newValue);
				player.setEpWeights(eventID, epWeights);
			},
		});

		return row;
	}

	private makeTableRowCells(stat: UnitStat, statWeights: StatWeightValues | undefined, className: string, epTotal: number, epRatio: number): string {
		let weightCell, epCell;
		if (statWeights) {
			const weightAvg = stat.getProtoValue(statWeights.weights!);
			const weightStdev = stat.getProtoValue(statWeights.weightsStdev!);
			weightCell = this.makeTableCellContents(weightAvg, weightStdev);

			const epAvg = stat.getProtoValue(statWeights.epValues!);
			const epStdev = stat.getProtoValue(statWeights.epValuesStdev!);
			epCell = this.makeTableCellContents(epAvg, epStdev);
		} else {
			weightCell = `<span class="results-avg notapplicable">N/A</span>`;
			epCell = weightCell;
		}

		const template = document.createElement('template');
		template.innerHTML = `
			<td class="stdev-cell ${className} type-weight">
				${weightCell}
			</td>
			<td class="stdev-cell ${className} type-ep">
				${epCell}
			</td>
		`;

		if (!statWeights) return template.innerHTML;

		if (epRatio == 0) {
			const cells = template.content.querySelectorAll('.stdev-cell');
			cells.forEach(cell => cell.classList.add('unused-ep'));
			return template.innerHTML;
		}

		const epCurrent = this.simUI.player.getEpWeights().getUnitStat(stat);
		const epDelta = epTotal - epCurrent;

		const epAvgElem = template.content.querySelector('.type-ep .results-avg') as HTMLElement;
		if (epDelta.toFixed(2) == '0.00') epAvgElem; // no-op
		else if (epDelta > 0) epAvgElem.classList.add('positive');
		else if (epDelta < 0) epAvgElem.classList.add('negative');

		return template.innerHTML;
	}

	private makeTableCellContents(value: number, stdev: number): string {
		const iterations = this.simUI.prevEpIterations || 1;
		return `
			<span class="results-avg">${value.toFixed(2)}</span>
			<span class="results-stdev">
				(<i class="fas fa-plus-minus fa-xs"></i>${stDevToConf90(stdev, iterations).toFixed(2)})
			</span>
		`;
	}

	private calculateEp(weights: StatWeightsResult) {
		const result = StatWeightsResult.clone(weights);
		const normaliseValue = (refStat: Stat, values: StatWeightValues) => {
			const refUnitStat = UnitStat.fromStat(refStat);
			const refWeight = refUnitStat.getProtoValue(values.weights!);
			const refStdev = refUnitStat.getProtoValue(values.weightsStdev!);
			EpWeightsMenu.epUnitStats.forEach(stat => {
				const value = stat.getProtoValue(values.weights!);
				stat.setProtoValue(values.epValues!, refWeight == 0 ? 0 : value / refWeight);

				const valueStdev = stat.getProtoValue(values.weightsStdev!);
				stat.setProtoValue(values.epValuesStdev!, refStdev == 0 ? 0 : valueStdev / refStdev);
			});
		};

		if (this.simUI.dpsRefStat !== undefined) {
			normaliseValue(this.simUI.dpsRefStat, result.dps!);
			normaliseValue(this.simUI.dpsRefStat, result.tps!);
		}
		if (this.simUI.healRefStat !== undefined) normaliseValue(this.simUI.healRefStat, result.hps!);
		if (this.simUI.tankRefStat !== undefined) {
			normaliseValue(this.simUI.tankRefStat, result.dtps!);
			normaliseValue(this.simUI.tankRefStat, result.tmi!);
			normaliseValue(this.simUI.tankRefStat, result.pDeath!);
		}
		return result;
	}

	private getDpsEpRefStat(): Stat {
		return this.simUI.dpsRefStat !== undefined ? this.simUI.dpsRefStat : this.epReferenceStat;
	}

	private getHealEpRefStat(): Stat {
		return this.simUI.healRefStat !== undefined ? this.simUI.healRefStat : this.epReferenceStat;
	}

	private getTankEpRefStat(): Stat {
		return this.simUI.tankRefStat !== undefined ? this.simUI.tankRefStat : Stat.StatArmor;
	}

	private getPrevSimResult(): StatWeightsResult {
		return (
			this.simUI.prevEpSimResult ||
			StatWeightsResult.create({
				dps: {
					weights: new Stats().toProto(),
					weightsStdev: new Stats().toProto(),
					epValues: new Stats().toProto(),
					epValuesStdev: new Stats().toProto(),
				},
				hps: {
					weights: new Stats().toProto(),
					weightsStdev: new Stats().toProto(),
					epValues: new Stats().toProto(),
					epValuesStdev: new Stats().toProto(),
				},
				tps: {
					weights: new Stats().toProto(),
					weightsStdev: new Stats().toProto(),
					epValues: new Stats().toProto(),
					epValuesStdev: new Stats().toProto(),
				},
				dtps: {
					weights: new Stats().toProto(),
					weightsStdev: new Stats().toProto(),
					epValues: new Stats().toProto(),
					epValuesStdev: new Stats().toProto(),
				},
				tmi: {
					weights: new Stats().toProto(),
					weightsStdev: new Stats().toProto(),
					epValues: new Stats().toProto(),
					epValuesStdev: new Stats().toProto(),
				},
				pDeath: {
					weights: new Stats().toProto(),
					weightsStdev: new Stats().toProto(),
					epValues: new Stats().toProto(),
					epValuesStdev: new Stats().toProto(),
				},
			})
		);
	}

	private static epUnitStats: Array<UnitStat> = UnitStat.getAll().filter(stat => {
		if (stat.isStat()) {
			return true;
		} else {
			return [
				PseudoStat.PseudoStatMainHandDps,
				PseudoStat.PseudoStatOffHandDps,
				PseudoStat.PseudoStatRangedDps,
				PseudoStat.BonusPhysicalDamage,
				PseudoStat.PseudoStatMeleeSpeedMultiplier,
				PseudoStat.PseudoStatRangedSpeedMultiplier,
				PseudoStat.PseudoStatCastSpeedMultiplier,
			].includes(stat.getPseudoStat());
		}
	});
}
