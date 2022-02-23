import yargs from 'yargs';
import {ConvertAddressHandler} from "../handler/convert_address";
import colors from 'colors';
import is from 'is_js';
import {AddressFormat} from '../types/transfer';

const transferxCommand: yargs.CommandModule = {
  builder: (argv: yargs.Argv) => {
    return argv
      .positional('from', {
        describe: 'From address style',
        type: 'string',
      })
      .positional('to', {
        describe: 'To address style',
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
      });
  },
  command: 'convert-address',
  describe: 'Convert address format',
  handler: async (args: yargs.Arguments) => {
    const {from, to, target, file} = args;
    if (!is.any.truthy(target, file)) {
      console.log(colors.red('Missing `--target` or `--file` parameter'));
      return;
    }

    const handler = await ConvertAddressHandler.new(
      from as AddressFormat,
      to as AddressFormat,
      target as string,
      file as string,
    );
    handler.handle();
  },
}

export default transferxCommand;
