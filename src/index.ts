#!/usr/bin/env node
import yargs from 'yargs';
import transferxCommand from './command/transferx'
import convertAddressCommand from './command/convert_address'

import '@polkadot/api-augment'

// main
(async () => {
  // enable logger
  if (process.env.LOGGER === undefined) {
    process.env.LOGGER = 'INFO';
  }

  // parser
  const _ = yargs
    .usage('multi-transfer <hello@darwinia.network>')
    .help('help').alias('help', 'h')
    .version('version', '0.1').alias('version', 'V')
    .command(transferxCommand)
    .command(convertAddressCommand)
    .argv;

  // show help if no input
  if (process.argv.length < 3) {
    yargs.showHelp();
  }
})();
