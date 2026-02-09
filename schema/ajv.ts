// eslint-disable-next-line imports/no-internal-modules
import Ajv from 'ajv/dist/2020.js';

const default_ajv = (new Ajv({
	strict: true,
	verbose: true,
}));

export {
	default_ajv,
};
