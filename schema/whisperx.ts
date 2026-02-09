// eslint-disable-next-line imports/no-internal-modules
import type Ajv from 'ajv/dist/2020.js';

import schema from './whisperx.json' with {type: 'json'};

import {
	default_ajv,
} from './ajv.ts';

type positive_number_or_zero<T extends number> = (
	`${T}` extends `-${string}`
		? never
		: T
);

type whole_positive_number_or_zero<T extends number> = (
	`${T}` extends (`-${string}` | `${string}.${string}`)
		? never
		: T
);

type start<T extends number> = positive_number_or_zero<T>;
type end<T extends number> = positive_number_or_zero<T>;
type speaker<T extends number> = `SPEAKER_${whole_positive_number_or_zero<T>}`;

type word<
	Start extends number = number,
	End extends number = number,
	Score extends number = number,
> = {
	word: Exclude<string, ''>,
	start: start<Start>,
	end: end<End>,
	score: positive_number_or_zero<Score>,
};

type word_with_speaker<
	Start extends number = number,
	End extends number = number,
	Score extends number = number,
	SpeakerId extends number = number,
> = word<Start, End, Score> & {
	speaker: speaker<SpeakerId>,
};

type words = [word, ...word[]];

type words_with_speaker_item<
	Start extends number = number,
	End extends number = number,
	Score extends number = number,
	SpeakerId extends number = number,
> = (
	| word<Start, End, Score>
	| word_with_speaker<Start, End, Score, SpeakerId>
);

type words_with_speaker = [
	words_with_speaker_item,
	...words_with_speaker_item[],
];

type segment<
	Start extends number = number,
	End extends number = number,
> = {
	start: start<Start>,
	end: end<End>,
	text: Exclude<string, ''>,
};

type segment_with_words<
	Start extends number = number,
	End extends number = number,
> = segment<Start, End> & {
	words: words,
};

type segment_with_speaker<
	Start extends number = number,
	End extends number = number,
	SpeakerId extends number = number,
> = segment<Start, End> & {
	speaker: speaker<SpeakerId>,
};

type segment_with_speaker_and_words<
	Start extends number = number,
	End extends number = number,
	SpeakerId extends number = number,
> = segment_with_speaker<Start, End, SpeakerId> & {
	words: words_with_speaker,
};

type basic = {
	segments: [segment, ...segment[]],
};

type with_words = {
	segments: [segment_with_words, ...segment_with_words[]],
	word_segments: words,
};

type with_speaker = {
	segments: [segment_with_speaker, ...segment_with_speaker[]],
};

type with_speaker_and_words = {
	segments: [
		segment_with_speaker_and_words,
		...segment_with_speaker_and_words[],
	],
	word_segments: words_with_speaker,
};

function determine_type(
	whisperx: (
		| basic
		| with_words
		| with_speaker
		| with_speaker_and_words
	),
): 'basic' | 'with_words' | 'with_speaker' | 'with_speaker_and_words' {
	const has_words = (
		'words' in whisperx
		|| whisperx.segments.find(
			(maybe): maybe is segment_with_words => 'words' in maybe,
		)
	);

	const has_speaker = (
		whisperx.segments.find(
			(maybe): maybe is segment_with_speaker => 'speaker' in maybe,
		)
		|| (
			'word_segments' in whisperx
			&& whisperx.word_segments.find(
				(maybe): maybe is word_with_speaker => 'speaker' in maybe,
			)
		)
	);

	if (has_words && has_speaker) {
		return 'with_speaker_and_words';
	} else if (has_words) {
		return 'with_words';
	} else if (has_speaker) {
		return 'with_speaker';
	}

	return 'basic';
}

const default_validator = default_ajv.compile<(
	| basic
	| with_words
	| with_speaker
	| with_speaker_and_words
)>(schema);

function is_whisperx(
	value: unknown,
	ajv: Ajv|undefined = undefined,
): asserts value is (
	| basic
	| with_words
	| with_speaker
	| with_speaker_and_words
) {
	if (ajv && !ajv.opts.strict) {
		throw new Error('Only strict-mode validators supported!');
	}

	const validator = undefined === ajv
		? default_validator
		: ajv.compile<(
			| basic
			| with_words
			| with_speaker
			| with_speaker_and_words
		)>(schema);

	if (!validator(value)) {
		throw new Error('Does not match!');
	}
}

export type {
	basic,
	with_words,
	with_speaker,
	with_speaker_and_words,
	segment_with_words,
	word_with_speaker,
	speaker,
};

export {
	determine_type,
	is_whisperx,
};
