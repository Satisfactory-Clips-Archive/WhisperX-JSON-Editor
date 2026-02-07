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

async function check(file: DataTransferItem): Promise<(
	| with_words
	| with_speaker_and_words
)> {
	const as_file = file.getAsFile();

	if (null === as_file) {
		throw new Error('Could not get file!');
	}

	const url = URL.createObjectURL(as_file);

	const json: unknown = await (await fetch(url)).json();

	is_whisperx(json);

	const type = determine_type(json);

	if ('basic' === type || 'with_speaker' === type) {
		throw new Error('Only with words supported!');
	}

	return json as with_words | with_speaker_and_words;
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
			: [],
	)];

	const speaker_map: {[key in `SPEAKER_${number}`]: string} = {};

	let changed = false;
	let show_hide_speakers = false;

	const inputs: {
		[key: string]: ((
			e: Event & {target: HTMLElement},
		) => void),
	} = {};

	inputs['input[name="speaker-map[]"]'] = (e) => {
		if (e.target.matches('input[name="speaker-map[]"]')) {
			speaker_map[(
				e.target.dataset as {
					was: `SPEAKER_${number}`,
				}
			).was] = (e.target as HTMLInputElement).value;
			changed = true;
			queue();
		} else if (e.target.matches('span[data-i][data-j]')) {
			e.target.classList.add('changed');
		}
	};

	inputs['#speakers'] = (e) => {
		show_hide_speakers = (e.target as HTMLInputElement).checked;
		changed = true;
		queue();
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
		const changed_items: NodeListOf<
			HTMLSpanElement & {
				dataset: {
					i: `${number}`,
					j: `${number}`,
					k: `${number}`,
				},
			}
		> = target.querySelectorAll('span[data-i][data-j][data-k].changed');
		for (const changed of changed_items) {
			const i = parseInt(changed.dataset.i);
			const j = parseInt(changed.dataset.j);
			const k = parseInt(changed.dataset.k);
			whisperx.segments[i].words[j].word = changed.textContent;
			whisperx.word_segments[k].word = changed.textContent;
		}

		const data = JSON.stringify(whisperx, null, '\t');
		const blob = new Blob([data], {type: 'application/json'});
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = 'whisperx.json';
		a.click();
		URL.revokeObjectURL(url);
	};

	clicks['button[data-action="bulk-set-speaker"]'] = () => {
		const value = (
			target.querySelector('#bulk-set-speaker') as HTMLInputElement
		).value as `SPEAKER_${number}`;

		const speakers: NodeListOf<
			HTMLInputElement
		> = target.querySelectorAll('input[name="bulk-action"]:checked');

		for (const checkbox of speakers) {
			const i = parseInt(checkbox.value);
			const k_siblings: NodeListOf<HTMLSpanElement> = (
				checkbox.parentNode as HTMLLIElement
			).querySelectorAll('[data-k]');
			const ks = [
				...k_siblings,
			].map((e) => parseInt(e.dataset.k || '0'));

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

	target.addEventListener('click', (e) => {
		const target = e.target as HTMLElement;

		for (const selector of Object.keys(clicks)) {
			if (target.matches(selector)) {
				clicks[selector](e as PointerEvent & {target: HTMLElement});
			}
		}
	});

	function do_update() {
		update(
			target,
			whisperx,
			speakers,
			speaker_map,
			show_hide_speakers,
		);
	}

	do_update();

	let queued: number | undefined;

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
}

function render_speaker_map_item(speaker: `SPEAKER_${number}`, i: number) {
	return html`<li>
									<label for="speaker-map-${i}">${
										speaker
									}</label>
									<input
										name="speaker-map[]"
										id="speaker-map-${i}"
										data-was="${speaker}"
										value="${speaker}"
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
	show_hide_speakers: boolean,
) {
	let k = 0;

	const template = html`<main>
		<form>
			<datalist id="speaker-values">${repeat(
				speakers,
				(speaker) => speakers.indexOf(speaker),
				(speaker) => html`<option value="${speaker}" />`,
			)}</datalist>
			<fieldset>
				<legend>Options</legend>
				<ol>
					<li>
						<input type="checkbox" id="speakers">
						<label for="speakers">Show / Hide Speakers</label>
					</li>
					<li>
						<details>
							<summary>Speaker Map</summary>
							<ol>${repeat(
								speakers,
								(speaker) => speakers.indexOf(speaker),
								render_speaker_map_item,
							)}</ol>
						</details>
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
					<li><button
						type="button"
						data-action="download"
					>💾</button></li>
				</ol>
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
	</main>`;

	function render_segment_item(
		segment: (
			| with_words
			| with_speaker_and_words
		)['segments'][number],
		i: number,
	) {
						const sorted = Object.entries(segment.words
							.reduce((
								was,
								is,
							): {[key: `SPEAKER_${number}`]: number} => {
								if (!('speaker' in is)) {
									return was;
								}

								was[(is as word_with_speaker).speaker] += 1;

								return was;
							}, {}))
							.sort(([, a], [, b]) => b - a);

						const overall_speaker = (sorted[0] || [])[0] as (
							| `SPEAKER_${number}`
							| undefined
						);

						return html`
							<li>
								<input
									type="checkbox"
									name="bulk-action"
									value="${i}"
									aria-label="Bulk Action"
								>
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
									),
								)}
								</ol>
							</li>
							`;
	}

	function render_word_item(
		word: (
			| with_words
			| with_speaker_and_words
		)['segments'][number]['words'][number],
		i: number,
		j: number,
	) {
		return html`
									<li>
										<span
											contenteditable
											data-i="${i}"
											data-j="${j}"
											data-k="${k++}"
										>${word.word}</span>
										${when(
											show_hide_speakers,
											() => html`
												<input
													id="speaker_${i}_${j}"
													list="speaker-values"
													.value="${
														'speaker' in word
															? (
																speaker_map[
																	word.speaker
																] || word.speaker
															)
															: ''
													}"
												>
											`,
										)}
									</li>
									`;
	}

	render(template, target);
}

function init(target: HTMLElement) {
	target.textContent = '';
	target.addEventListener('drop', (e) => {
		if (!e.dataTransfer) {
			return;
		}

		e.preventDefault();

		const items = [...e.dataTransfer.items || []].filter(
			(item) => item.kind === 'file' && item.type === 'application/json',
		);


		if (1 === items.length) {
			void check(items[0])
				.then((res) => init_ui(target, res))
				.catch((err) => {
					console.error(err);
					alert(err);
				});
		}
	});
	target.addEventListener('dragover', (e) => {
		if (!e.dataTransfer) {
			return;
		}

		const items = [...e.dataTransfer.items || []].filter(
			(item) => item.kind === 'file' && item.type === 'application/json',
		);

		if (1 === items.length) {
			e.dataTransfer.dropEffect = 'copy';
		}
	});
	addEventListener('drop', (e) => e.preventDefault());
	addEventListener('dragover', (e) => e.preventDefault());
}

export {
	init,
};
