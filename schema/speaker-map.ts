// eslint-disable-next-line imports/no-internal-modules
import type Ajv from 'ajv/dist/2020.js';

import schema from './speaker-map.json' with {type: 'json'};

import type {
	speaker,
} from './whisperx.ts';

import {
	default_ajv,
} from './ajv.ts';

type speaker_map<T extends number = number> = {
	[key in speaker<T>]: Exclude<string, ''>;
};

const default_validator = default_ajv.compile<speaker_map>(schema);

function is_speaker_map(
	value: unknown,
	ajv: Ajv|undefined = undefined,
) {
	if (ajv && !ajv.opts.strict) {
		throw new Error('Only strict-mode validators supported!');
	}

	const validator = undefined === ajv
		? default_validator
		: ajv.compile<speaker_map>(schema);

	if (!validator(value)) {
		throw new Error('Does not match!');
	}
}

export type {
	speaker_map,
};

export {
	is_speaker_map,
};
