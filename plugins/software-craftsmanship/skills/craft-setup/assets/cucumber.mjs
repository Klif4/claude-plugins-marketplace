import { register } from 'tsx/esm/api'

// Step definitions are TypeScript: install tsx's ESM hooks here so a bare
// `cucumber-js` works, with no NODE_OPTIONS to remember (and none to set in an IDE).
register()

export default {
  // No `paths`: cucumber-js already defaults to features/**/*.feature, and
  // setting it here would be merged with (not overridden by) the feature file
  // an IDE passes on the command line.
  import: ['features/steps/**/*.ts'],
  format: ['progress', 'summary'],
  formatOptions: { snippetInterface: 'async-await' },
  // Undefined and pending steps fail the run: the craft loop needs a
  // scenario to be unambiguously red or green, never "not implemented".
  strict: true,
}
