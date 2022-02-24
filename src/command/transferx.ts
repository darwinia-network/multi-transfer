import yargs from 'yargs';
import {TransferxHandler} from '../handler/transferx'
import is from 'is_js'
import {Coin} from "../types/transfer";

const colors = require('colors');

const transferxCommand: yargs.CommandModule = {
  builder: (argv: yargs.Argv) => {
    return argv
      .positional('endpoint', {
        alias: 'e',
        describe: 'The endpoint of chain',
        default: 'wss://pangolin-rpc.darwinia.network',
        type: 'string',
      })
      .positional('seed', {
        alias: 's',
        describe: 'The private key of sender account',
        default: '',
        type: 'string',
      }).positional('target', {
        alias: 't',
        describe: 'The target account',
        default: '',
        type: 'string',
        demandOption: false,
      }).positional('file', {
        alias: 'f',
        describe: 'The sender address wrote in file',
        default: '',
        type: 'string',
        demandOption: false,
      }).positional('duration', {
        default: 5000,
        describe: 'Interval time between two transfers. (Milliseconds)',
        type: 'number',
        demandOption: false,
      }).positional('coin', {
        default: 'crab',
        describe: 'Coin type',
        type: 'string',
        demandOption: false,
      }).positional('amount', {
        default: 0,
        describe: 'Amount',
        type: 'number',
        demandOption: false,
      });
  },
  command: 'transferx',
  describe: 'Multiple transferx',
  handler: async (args: yargs.Arguments) => {
    const {endpoint, seed, target, file, duration, coin, amount} = args;
    if (!is.any.truthy(target, file)) {
      console.log(colors.red('Missing `--target` or `--file` parameter'));
      return;
    }
    const _coin = (coin as string).toLowerCase();
    const allowsCoins = ['crab', 'ckton'];
    if (allowsCoins.indexOf(_coin) < 0) {
      console.log(colors.red(`The coin only supports ${allowsCoins}`));
      return;
    }
    const handler = await TransferxHandler.new(
      endpoint as string,
      seed as string,
      target as string,
      file as string,
      duration as number,
      _coin as Coin,
      amount as number,
    );
    await handler.handle();
  },
}

export default transferxCommand;
