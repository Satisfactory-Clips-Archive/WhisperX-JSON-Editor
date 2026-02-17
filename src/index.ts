// eslint-disable-next-line imports/no-internal-modules
import type Ajv from 'ajv/dist/2020.js';

import {
	html,
	render,
} from 'lit-html';

import {
	repeat,
// eslint-disable-next-line imports/no-internal-modules
} from 'lit-html/directives/repeat.js';

import {
	when,
// eslint-disable-next-line imports/no-internal-modules
} from 'lit-html/directives/when.js';

import {
	classMap,
// eslint-disable-next-line imports/no-internal-modules
} from 'lit-html/directives/class-map.js';

import type {
	segment_with_words,
	with_speaker_and_words,
	with_words,
	word_with_speaker,
// eslint-disable-next-line @stylistic/max-len
// eslint-disable-next-line imports/no-internal-modules, imports/no-relative-parent-imports
} from '../schema/whisperx.ts';
import {
	determine_type,
	is_whisperx,
// eslint-disable-next-line @stylistic/max-len
// eslint-disable-next-line imports/no-internal-modules, imports/no-relative-parent-imports
} from '../schema/whisperx.ts';

import type {
	speaker_map,
// eslint-disable-next-line @stylistic/max-len
// eslint-disable-next-line imports/no-internal-modules, imports/no-relative-parent-imports
} from '../schema/speaker-map.ts';
import {
	is_speaker_map,
// eslint-disable-next-line @stylistic/max-len
// eslint-disable-next-line imports/no-internal-modules, imports/no-relative-parent-imports
} from '../schema/speaker-map.ts';

async function check_against<T>(
	file: DataTransferItem,
	checker: ((value: unknown, ajv?: Ajv) => asserts value is T),
): Promise<T> {
	const as_file = file.getAsFile();

	if (null === as_file) {
		throw new Error('Could not get file!');
	}

	const url = URL.createObjectURL(as_file);

	const json: unknown = await (await fetch(url)).json();

	checker(json);

	return json;
}

async function check_whisperx(file: DataTransferItem): Promise<(
	| with_words
	| with_speaker_and_words
)> {
	const json = await check_against(file, is_whisperx);

	const type = determine_type(json);

	if ('basic' === type || 'with_speaker' === type) {
		throw new Error('Only with words supported!');
	}

	return json as with_words | with_speaker_and_words;
}

async function check_speakermap(
	file: DataTransferItem,
): Promise<speaker_map> {
	return check_against(file, is_speaker_map);
}

function time_to_timestamp(value: number) {
	return [
		Math.floor(value / 3600).toString(),
		Math.floor((value / 60) % 60).toString().padStart(2, '0'),
		Math.floor(value % 60).toString().padStart(2, '0'),
	].join(':');
}

function init_ui(target: HTMLElement, whisperx: (
	| with_words
	| with_speaker_and_words
)) {
	const speakers = [...new Set(
		'with_speaker_and_words' === determine_type(whisperx)
			? (
				whisperx as with_speaker_and_words
			).word_segments
				.filter((e): e is word_with_speaker => 'speaker' in e)
				.map(({speaker}) => speaker)
				.concat(
					(
						whisperx as with_speaker_and_words
					).segments
						.filter((maybe) => 'speaker' in maybe)
						.map(({speaker}) => speaker),
				)
				.concat(
					(
						whisperx as with_speaker_and_words
					).segments
						.flatMap(({words}) => words)
						.filter((maybe) => 'speaker' in maybe)
						.map(({speaker}) => speaker),
				)
			: [],
	)];

	const visibility = whisperx.segments.map(() => false);

	const speaker_map: {[key in `SPEAKER_${number}`]: string} = {};

	let changed = false;
	let show_hide_speakers = false;
	let verbose_render = false;

	let last_query = '';
	let results: number[] = [];
	let current_result_index = 0;
	let shift_key = false;
	let last_bulk_action_toggled = -1;

	const bulk_action_checked = new Set<number>();

	addEventListener('keydown', (e) => {
		shift_key = e.shiftKey;
	});
	addEventListener('keyup', (e) => {
		shift_key = e.shiftKey;
	});

	const inputs: {
		[key: string]: ((
			e: Event & {target: HTMLElement},
		) => void),
	} = {};

	inputs['input[name="speaker-map[]"]'] = (e) => {
		speaker_map[(
			e.target.dataset as {
				was: `SPEAKER_${number}`,
			}
		).was] = (e.target as HTMLInputElement).value;
		changed = true;
		queue();
	};

	inputs['span[data-i][data-j][data-k-start][contenteditable]'] = (e) => {
		const dataset = e.target.dataset as {
			i: `${number}`,
			j: `${number}`,
			kStart: `${number}`,
		};

		const i = parseInt(dataset.i);
		const j = parseInt(dataset.j);
		const k = parseInt(dataset.kStart) + j;

		whisperx.segments[i].words[j].word = e.target.textContent;
		whisperx.segments[i].text = whisperx.segments[i].words.map(
			({word}) => word,
		).join(' ');
		whisperx.word_segments[k].word = e.target.textContent;
	};

	inputs['input[list="speaker-values"]'] = (e) => {
		const target = e.target as HTMLInputElement;

		const dataset = target.dataset as {
			i: `${number}`,
			j: `${number}`,
			kStart: `${number}`,
		};

		const i = parseInt(dataset.i);
		const j = parseInt(dataset.j);
		const k = parseInt(dataset.kStart) + j;

		(
			whisperx.segments[i].words[j] as word_with_speaker
		).speaker = target.value as word_with_speaker['speaker'];
		(
			whisperx.word_segments[k] as word_with_speaker
		).speaker = target.value as word_with_speaker['speaker'];

		changed = true;
		queue();
	};

	inputs['#speakers'] = (e) => {
		show_hide_speakers = (e.target as HTMLInputElement).checked;
		changed = true;
		queue();
	};
	inputs['#verbose'] = (e) => {
		verbose_render = (e.target as HTMLInputElement).checked;
		changed = true;
		queue();
	};
	inputs['#search'] = () => {
		defer_search();
	};
	inputs['input[name="bulk-action[]"]'] = (e) => {
		const target = e.target as HTMLInputElement;

		const value = parseInt(target.value);

		if (shift_key && last_bulk_action_toggled >= 0) {
			const start = Math.min(last_bulk_action_toggled, value);
			const end = Math.max(last_bulk_action_toggled, value);
			if (target.checked) {
				for (let i = start; i <= end; ++i) {
					bulk_action_checked.add(i);
				}
			} else {
				for (let i = start; i <= end; ++i) {
					bulk_action_checked.delete(i);
				}
			}
		} else {
			if (target.checked) {
				bulk_action_checked.add(value);
			} else {
				bulk_action_checked.delete(value);
			}
		}

		last_bulk_action_toggled = value;

		changed = true;
		queue();
	};

	let debounce_focus_on_time: number | undefined;

	inputs['#focus-on-time'] = (e) => {
		if (debounce_focus_on_time) {
			cancelAnimationFrame(debounce_focus_on_time);
		}
		debounce_focus_on_time = requestAnimationFrame(() => {
			const input = e.target as HTMLInputElement;
			const focus_on = target.querySelector(
				`.transcription > li[data-i="${input.value}"]`,
			);

			if (focus_on) {
				focus_on.scrollIntoView();
			} else {
				console.log('could not find');
			}
		});
	};

	target.addEventListener('input', (e) => {
		const target = e.target as HTMLElement;

		for (const selector of Object.keys(inputs)) {
			if (target.matches(selector)) {
				inputs[selector](e as Event & {target: HTMLElement});
			}
		}
	});

	const clicks: {
		[key: string]: ((
			e: PointerEvent & {target: HTMLElement},
		) => void),
	} = {};

	clicks['button[data-action="download"]'] = () => {
		const data = JSON.stringify(whisperx, null, '\t') + '\n';
		const blob = new Blob([data], {type: 'application/json'});
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = 'whisperx.json';
		a.click();
		URL.revokeObjectURL(url);
	};

	clicks['button[data-action="download-speaker-map"]'] = () => {
		const data = JSON.stringify(speaker_map, null, '\t') + '\n';
		const blob = new Blob([data], {type: 'application/json'});
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = 'speaker-map.json';
		a.click();
		URL.revokeObjectURL(url);
	};

	clicks['button[data-action="bulk-set-speaker"]'] = () => {
		const value = (
			target.querySelector('#bulk-set-speaker') as HTMLInputElement
		).value as `SPEAKER_${number}`;

		for (const i of bulk_action_checked) {
			const node: HTMLLIElement | null = target.querySelector(
				`[data-i="${i}"][data-has-k]`,
			);

			if (!node) {
				throw new Error('Could not find node!');
			}

			const ks = (
				node.dataset.hasK as string
			).split(' ').map((e) => parseInt(e));

			(
				whisperx as with_speaker_and_words
			).segments[i].speaker = value;
			for (const word of whisperx.segments[i].words) {
				(word as word_with_speaker).speaker = value;
			}

			for (const k of ks) {
				(
					whisperx.word_segments[k] as word_with_speaker
				).speaker = value;
			}
		}

		changed = true;

		queue();
	};

	clicks['button[data-action="bulk-replace-speaker"]'] = () => {
		const replace_speaker = (
			target.querySelector(
				'#bulk-replace-speaker--replace',
			) as HTMLInputElement
		).value as `SPEAKER_${number}`;
		const with_speaker = (
			target.querySelector(
				'#bulk-replace-speaker--with',
			) as HTMLInputElement
		).value as `SPEAKER_${number}`;

		for (const i of bulk_action_checked) {
			const node: HTMLLIElement | null = target.querySelector(
				`[data-i="${i}"][data-has-k]`,
			);

			if (!node) {
				throw new Error('Could not find node!');
			}

			const ks = (
				node.dataset.hasK as string
			).split(' ').map((e) => parseInt(e));

			for (const entry of [
				(
					whisperx as with_speaker_and_words
				).segments[i],
				...(whisperx.segments[i].words as word_with_speaker[]),
				...ks.map(
					(k) => whisperx.word_segments[k] as word_with_speaker,
				),
			]) {
				if (entry.speaker === replace_speaker) {
					entry.speaker = with_speaker;
					changed = true;
				}
			}

			if (changed) {
				queue();
			}
		}

		changed = true;

		queue();
	};

	clicks['button[data-action="search"]'] = () => {
		do_search();
	};

	clicks['button[data-action="uncheck-bulk-action-checkboxes"]'] = () => {
		bulk_action_checked.clear();
		for (
			const still_checked of target.querySelectorAll(
				'input[name="bulk-action[]"]:checked',
			)
		) {
			(still_checked as HTMLInputElement).checked = false;
		}
		changed = true;
		queue();
	};

	function focus_on_current_result() {
		const result = target.querySelector(
			`.transcription > li[data-has-k~="${
				results[current_result_index]
			}"]`,
		);

		if (result) {
			result.scrollIntoView();
		}
	}

	clicks['button[data-action="previous-result"]'] = () => {
		current_result_index = (
			current_result_index
			- 1
			+ results.length
		) % results.length;

		focus_on_current_result();
	};

	clicks['button[data-action="next-result"]'] = () => {
		current_result_index = (
			current_result_index
			+ 1
		) % results.length;

		focus_on_current_result();
	};

	target.addEventListener('click', (e) => {
		const target = e.target as HTMLElement;

		for (const selector of Object.keys(clicks)) {
			if (target.matches(selector)) {
				clicks[selector](e as PointerEvent & {target: HTMLElement});
			}
		}
	});

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const into = entry.target as HTMLLIElement & {
					dataset: {
						i: `${number}`,
						kStart: `${number}`,
					},
				};

				const i = parseInt(into.dataset.i);

				if (visibility[i] !== entry.isIntersecting) {
					changed = true;
				}

				visibility[i] = entry.isIntersecting;
			}

			queue();
		},
		{
			root: target,
		} as IntersectionObserverInit,
	);

	function do_update() {
		update(
			target,
			whisperx,
			speakers,
			speaker_map,
			{
				show_hide_speakers,
				verbose_render,
			},
			{
				last_query,
				results,
				current_result_index,
			},
			visibility,
			bulk_action_checked,
			observer,
		);
	}

	do_update();

	make_droppable(
		target.querySelector('#speaker-map'),
		(e) => {
			if (!e.dataTransfer) {
				return;
			}

			e.preventDefault();

			const items = [...e.dataTransfer.items || []].filter(
				(item) => (
					item.kind === 'file'
					&& item.type === 'application/json'
				),
			);

			if (1 === items.length) {
				void check_speakermap(items[0])
					.then((res) => {
						for (
							const [k, v] of Object.entries(res) as [
								keyof typeof res,
								string,
							][]
						) {
							speaker_map[k] = v;

							if (!speakers.includes(k)) {
								speakers.push(k);
							}
						}

						changed = true;
						queue();
					})
					.catch((err) => {
						console.error(err);
						alert(err);
					});
			}
		},
		dragover,
	);

	let queued: number | undefined;

	let deferred_search: number | undefined;

	function refresh() {
		if (queued) {
			cancelAnimationFrame(queued);
		}

		if (changed) {
			do_update();
			changed = false;
			requestAnimationFrame(refresh);
		}
	}

	function queue() {
		if (queued) {
			cancelAnimationFrame(queued);
		}

		queued = requestAnimationFrame(() => refresh());
	}

	function defer_search() {
		if (deferred_search) {
			cancelAnimationFrame(deferred_search);
		}
		deferred_search = requestAnimationFrame(() => do_search());
	}

	function do_search() {
		const current_query = (
			target.querySelector('#search') as HTMLInputElement
		).value.trim();

		if ('' === current_query) {
			current_result_index = -1;
			results = [];

			if (current_query !== last_query) {
				last_query = current_query;
				changed = true;
				queue();
			}
		} else if (current_query !== last_query) {
			last_query = current_query;
			current_result_index = -1;
			const lcase = last_query.toLowerCase();
			const fresh_results: number[] = [];

			whisperx.word_segments.forEach(({word}, k) => {
				if (word.toLowerCase().includes(lcase)) {
					fresh_results.push(k);
				}
			});

			results = fresh_results;

			changed = true;
			queue();
		}
	}
}

function render_speaker_map_item([
	key,
	speaker,
	i,
]: [
	`SPEAKER_${number}`,
	string,
	number,
]) {
	return html`<li>
		<label for="speaker-map-${i}">${
			key
		}</label>
		<input
			name="speaker-map[]"
			id="speaker-map-${i}"
			data-was="${key}"
			.value="${speaker}"
		>
	</li>`;
}

function update(
	target: HTMLElement,
	whisperx: (
		| with_words
		| with_speaker_and_words
	),
	speakers: `SPEAKER_${number}`[],
	speaker_map: {[key in `SPEAKER_${number}`]: string},
	{
		show_hide_speakers,
		verbose_render,
	}: {[key: string]: boolean},
	search: {
		last_query: string,
		results: number[],
		current_result_index: number,
	},
	visibility: boolean[],
	bulk_action_checked: Set<number>,
	observer: IntersectionObserver,
) {
	observer.disconnect();

	let k = 0;

	const first_instance_of_speaker_rendered = new Set<`SPEAKER_${number}`>();

	const render_verbose = html`
		<li>
			<input type="checkbox" id="verbose">
			<label for="verbose">Verbose Render</label>
			<button
				popovertarget="help--verbose"
				title="What is Verbose Render?"
				type="button"
			>ℹ️</button>
			<div
				id="help--verbose"
				popover
			>
				<p>${
					'Transcriptions will be rendered outside of the viewport.'
				}</p>
				<p>${
					// eslint-disable-next-line @stylistic/max-len
					'This is required to make find-as-you-type useful, but has a serious performance impact for lengthy transcriptions.'
				}</p>
			</div>
		</li>
	`;

	const template = html`
		<form class="${classMap({
			'has-any-bulk-actions-checked': bulk_action_checked.size > 0,
		})}">
			<datalist id="speaker-values">${repeat(
				speakers
					.map((
						speaker,
						index,
					): [`SPEAKER_${number}`, number] => [speaker, index])
					.sort(([a], [b]) => a.localeCompare(b)),
				([, index]) => `speaker-values-datalist-${index}`,
				([speaker]) => html`<option value="${speaker}" />`,
			)}</datalist>
			<fieldset>
				<legend>Options</legend>
				<ul>
					<li>
						<ul>
							<li>
								<input type="checkbox" id="speakers">
								<label for="speakers">${
									'Show / Hide Speakers'
								}</label>
							</li>
							${render_verbose}
						</ul>
					</li>
					<li>
						<label for="focus-on-time">Focus on time</label>
						<input
							type="range"
							id="focus-on-time"
							min="0"
							max="${whisperx.segments.length - 1}"
							value="0"
						>
					</li>
					<li>
						<details id="speaker-map">
							<summary>Speaker Map</summary>
							<ol>${repeat(
								speakers
									.map((
										value,
										index,
									): [
										`SPEAKER_${number}`,
										number,
									] => [
										value,
										index,
									])
									.sort(([a], [b]) => a.localeCompare(b))
									.map(([key, index]): [
										`SPEAKER_${number}`,
										string,
										number,
									] => [
										key,
										speaker_map[key] || key,
										index,
									]),
								([, , index]) => `speaker-map-index-${index}`,
								render_speaker_map_item,
							)}</ol>
							<button
								type="button"
								data-action="download-speaker-map"
								title="Download Speaker Map"
							>💾</button>
						</details>
					</li>
					<li>
						<input type="search" id="search">
						<button
							type="button"
							title="Search"
							data-action="search"
						>🔎</button>
						<output for="search">${when(
							'' !== search.last_query,
							() => html`
								${search.results.length} results found
								<button
									type="button"
									data-action="previous-result"
									title="Scroll to previous result"
								>⬆️</button>
								<button
									type="button"
									data-action="next-result"
									title="Scroll to next result"
								>⬇️</button>
								<label>
									<input
										type="checkbox"
										name="hide-not-matched"
									>
									Hide not matched
								</label>
							`,
						)}</output>
					</li>
					<li class="bulk-action">
						<label for="bulk-set-speaker">Bulk Set Speaker</label>
						<select id="bulk-set-speaker">
						${repeat(
							speakers,
							(speaker) => `bulk-set-speaker-${
								speakers.indexOf(speaker)
							}`,
							(speaker) => html`<option value="${
								speaker
							}">${
								speaker_map[speaker] || speaker
							}</option>`,
						)}
						</select>
						<button
							type="button"
							data-action="bulk-set-speaker"
							aria-label="Bulk Set Speaker"
						>🗣️</button>
					</li>
					<li class="bulk-action">
						<label
							for="bulk-replace-speaker--replace"
						>Bulk Replace Speaker</label>
						<select id="bulk-replace-speaker--replace">
						${repeat(
							speakers,
							(speaker) => `bulk-replace-speaker--replace-${
								speakers.indexOf(speaker)
							}`,
							(speaker) => html`<option value="${
								speaker
							}">${
								speaker_map[speaker] || speaker
							}</option>`,
						)}
						</select>
						<label
							for="bulk-replace-speaker--with"
						>With</label>
						<select id="bulk-replace-speaker--with">
						${repeat(
							speakers,
							(speaker) => `bulk-replace-speaker--with-${
								speakers.indexOf(speaker)
							}`,
							(speaker) => html`<option value="${
								speaker
							}">${
								speaker_map[speaker] || speaker
							}</option>`,
						)}
						</select>
						<button
							type="button"
							data-action="bulk-replace-speaker"
							aria-label="Bulk Replace Speaker"
						>🗣️</button>
					</li>
					<li>
						<button
							type="button"
							data-action="download"
							title="Download whisperx.json"
						>💾</button>
						<button
							type="button"
							data-action="uncheck-bulk-action-checkboxes"
							title="Uncheck all bulk action checkboxes"
						>✅🚫</button>
					</li>
				</ul>
			</fieldset>
			<fieldset>
				<legend>Text</legend>
				<ol class="transcription">
				${repeat(
					whisperx.segments,
					(
						segment,
					) => (
						whisperx.segments as segment_with_words[]
					).indexOf(segment as segment_with_words),
					render_segment_item,
				)}
				</ol>
			</fieldset>
		</form>
	`;

	function render_segment_item(
		segment: (
			| with_words
			| with_speaker_and_words
		)['segments'][number],
		i: number,
	) {
		const unsorted: {[key: `SPEAKER_${number}`]: number} = {};

		for (const word of segment.words) {
			if (!('speaker' in word)) {
				continue;
			}

			if (!(word.speaker in unsorted)) {
				unsorted[word.speaker] = 0;
			}

			++unsorted[word.speaker];
		}

		const override_visibility = (
			'speaker' in segment
			&& !first_instance_of_speaker_rendered.has(segment.speaker)
		);

		if ('speaker' in segment) {
			first_instance_of_speaker_rendered.add(segment.speaker);
		}

		const sorted = Object.entries(unsorted)
			.sort(([, a], [, b]) => b - a);

		const overall_speaker = (sorted[0] || [])[0] as (
			| `SPEAKER_${number}`
			| undefined
		);

		const k_start = k;

		const has_k = segment.words.map((_, j_index) => k + j_index);

		const result = html`
			<li
				data-i="${i}"
				data-k-start="${k}"
				data-has-k="${
					has_k.join(' ')
				}"
			>
				${when(
					(
						visibility[i]
						|| bulk_action_checked.has(i)
						|| override_visibility
					),
					() => html`
						<input
							type="checkbox"
							name="bulk-action[]"
							value="${i}"
							aria-label="Bulk Action"
							?checked=${bulk_action_checked.has(i)}
						>
					`,
				)}
				${when(
					(
						visibility[i]
						|| verbose_render
						|| has_k.find((
							maybe,
						) => search.results.includes(maybe))
						|| override_visibility
					),
					() => html`
						<time
							datetime="PT${segment.start}S"
						>${
							time_to_timestamp(segment.start)
						}</time>
						<span>${
							(
								overall_speaker
									? speaker_map[overall_speaker]
									: undefined
							) || overall_speaker
						}: </span>
						<ol>
						${repeat(
							segment.words as unknown as (
								word_with_speaker[]
							),
							(
								word,
							) => `${
								i
							}::${
								segment.words.indexOf(word)
							}`,
							(word, j) => render_word_item(
								word,
								i,
								j,
								k_start,
							),
						)}
						</ol>
					`,
					() => html`<span class="placeholder">&hellip;</span>`,
				)}
			</li>
		`;

		k += segment.words.length;

		return result;
	}

	function render_word_item(
		word: (
			| with_words
			| with_speaker_and_words
		)['segments'][number]['words'][number],
		i: number,
		j: number,
		k: number,
	) {
		return html`
			<li
				class="${classMap({
					'matches-search': search.results.includes(k + j),
				})}"
			>
				<span
					contenteditable
					data-i="${i}"
					data-j="${j}"
					data-k-start="${k}"
				>${word.word}</span>
				${when(
					show_hide_speakers && visibility[i],
					() => html`
						<input
							id="speaker_${i}_${j}"
							list="speaker-values"
							data-i="${i}"
							data-j="${j}"
							data-k-start="${k}"
							.value="${
								'speaker' in word
									? word.speaker
									: ''
							}"
						>
					`,
				)}
			</li>
		`;
	}

	render(template, target);

	for (const element of target.querySelectorAll('li[data-k-start]')) {
		observer.observe(element);
	}
}

function init(target: HTMLElement) {
	target.textContent = '';
	function drop(e: DragEvent) {
		if (!e.dataTransfer) {
			return;
		}

		e.preventDefault();

		const items = [...e.dataTransfer.items || []].filter(
			(item) => item.kind === 'file' && item.type === 'application/json',
		);

		if (1 === items.length) {
			void check_whisperx(items[0])
				.then((res) => {
					target.removeEventListener('drop', drop);
					target.removeEventListener('dragover', dragover);
					removeEventListener('drop', preventDefault);
					removeEventListener('dragover', preventDefault);
					init_ui(target, res);
				})
				.catch((err) => {
					console.error(err);
					alert(err);
				});
		}
	}

	make_droppable(target, drop, dragover);
}

function make_droppable(
	target: HTMLElement|null,
	drop: (e: DragEvent) => void,
	dragover: (e: DragEvent) => void,
) {
	if (!target) {
		throw new Error('Target must not be null!');
	}

	target.addEventListener('drop', drop);
	target.addEventListener('dragover', dragover);
	addEventListener('drop', preventDefault);
	addEventListener('dragover', preventDefault);
}

function dragover(e: DragEvent) {
	if (!e.dataTransfer) {
		return;
	}

	const items = [...e.dataTransfer.items || []].filter(
		(item) => item.kind === 'file' && item.type === 'application/json',
	);

	if (1 === items.length) {
		e.dataTransfer.dropEffect = 'copy';
	}
}

function preventDefault(e: Event) {
	e.preventDefault();
}

export {
	init,
};
