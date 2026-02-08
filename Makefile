install:
	@npm install

build: rolldown
	@node ./rebuild-index.html.ts

rolldown:
	@./node_modules/.bin/rolldown -c ./rolldown.config.ts

rolldown--watch:
	@./node_modules/.bin/rolldown -c ./rolldown.config.ts --watch

lint--tsc:
	@echo 'running syntax check'
	@./node_modules/.bin/tsc --project ./tsconfig.app-check.json

lint--prettier:
	@echo 'running prettier'
	@./node_modules/.bin/prettier . --check

lint--eslint:
	@./node_modules/.bin/tsc --project ./tsconfig.eslint.json
	@echo 'checking eslint for all issues with config'
	@./node_modules/.bin/eslint --config eslint.config.js.mjs --cache './**/*.mjs'
	@echo 'checking eslint for all issues'
	@./node_modules/.bin/eslint --cache './**/*.ts'

lint: lint--prettier lint--tsc lint--eslint

.PHONY: tests
tests: build
	@node ./tests.ts

.PHONY: coverage
coverage: build
	@./node_modules/.bin/c8 node ./tests.ts

npm-prep: tests
	@echo 'building from ./tsconfig.app-npm.json'
	@./node_modules/.bin/tsc --project ./tsconfig.app-npm.json
	@npm publish --dry-run
