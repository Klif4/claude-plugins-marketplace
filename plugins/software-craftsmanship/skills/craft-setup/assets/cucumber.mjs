export default {
  paths: ['features/**/*.feature'],
  import: ['features/steps/**/*.ts'],
  format: ['progress', 'summary'],
  formatOptions: { snippetInterface: 'async-await' },
  // Undefined and pending steps fail the run: the craft loop needs a
  // scenario to be unambiguously red or green, never "not implemented".
  strict: true,
}
