const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**'],
  },
  {
    rules: {
      // The live-game screens reset selection when a move arrives, and dice/drag
      // code keeps the latest callback in a ref. These rules flag that pattern.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
    },
  },
]);
