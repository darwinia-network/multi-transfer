import {TargetParser} from './parser'
import {ApiPromise, HttpProvider} from "@polkadot/api";
import {Keyring} from "@polkadot/keyring";
import {KeyringPair} from "@polkadot/keyring/types";
import {decodeAddress, encodeAddress} from '@polkadot/util-crypto';
import {u8aToHex} from '@polkadot/util';
import {AddressFormat, Coin, TransferReceiver} from "../../types/transfer";
import Timeout from 'await-timeout';
import Stream from 'streamjs';
import is from 'is_js';
import {promises as fs} from 'fs';

import {typesBundleForPolkadotApps} from '@darwinia/types/mix';

const colors = require('colors');

const PRECISION = 1000000000;

export interface Config {
  endpoint: string,
  seed: string,
  targets: TransferReceiver[],
  duration: number,
  coin: string,
}

export class TransferxHandler {

  private readonly seed: string;
  private readonly targets: TransferReceiver[];
  private readonly endpoint: string;
  private readonly duration: number;

  constructor(config: Config) {
    this.endpoint = config.endpoint;
    this.seed = config.seed;
    this.targets = config.targets;
    this.duration = config.duration;
  }

  static async new(
    endpoint: string,
    seed: string,
    target: string | null | undefined,
    file: string | null | undefined,
    duration: number,
    coin: Coin,
    amount: number,
  ): Promise<TransferxHandler> {
    const parser = TargetParser.new(target, file, coin, amount);
    const targets = await parser.parse();
    return new TransferxHandler({endpoint, seed, targets, duration, coin});
  }

  public async handle() {
    const result = await this.transfer();
    console.log(colors.green(`Done sent to ${result.length} person.`));
    console.log(colors.green('REPORTS'));
    const faileds = Stream(result)
      .filter(item => item.err == 1)
      .toArray();
    const oks = Stream(result)
      .filter(item => item.err == 0)
      .toArray();
    console.log('------- FAILED');
    const failedOutput = [];
    Stream(faileds)
      .forEach(item => {
        const {message, receiver} = item;
        if (is.truthy(receiver)) {
          console.log(`[${receiver.coin}] -> ${receiver.address} [${receiver.amount}]: ${colors.red(message)}`);
          failedOutput.push([receiver.address, receiver.coin, receiver.amount, receiver.format].join(','));
        } else {
          console.log(colors.red(message));
        }
      })
    console.log('------- OK');
    const okOutput = [];
    Stream(oks)
      .forEach(item => {
        const {
          receiver,
          hash,
        } = item;
        console.log(colors.green(`[${receiver.coin}] -> ${receiver.address} [${receiver.amount}]: ${hash}`));
        okOutput.push([receiver.address, receiver.coin, receiver.amount, receiver.format].join(','));
      });
    await fs.writeFile('fail.csv', failedOutput.join('\n'));
    console.log(colors.yellow('Accounts failed transferred are written to the fail.csv file'));

    await fs.writeFile('ok.csv', okOutput.join('\n'));
    console.log(colors.yellow('Accounts successfully transferred are written to the ok.csv file'));
  }

  private async api(): Promise<ApiPromise> {
    return await ApiPromise.create({
      provider: new HttpProvider(this.endpoint),
      typesBundle: typesBundleForPolkadotApps,
    });
  }

  private account(): KeyringPair {
    return new Keyring({
      type: 'sr25519',
    }).addFromUri(this.seed);
  }

  private async transfer(): Promise<TransferredData[]> {
    let index = 0;
    let len = this.targets.length;
    if (len == 0) {
      return [{
        err: 1,
        message: 'Not receiver data.',
        hash: undefined,
        receiver: undefined,
      }];
    }

    const api = await this.api();
    const account = this.account();

    const maxTry = 5;
    let tryTimes = 0;

    const rets: TransferredData[] = [];
    while (true) {
      if (index >= len) {
        console.log(colors.green(`[${index}/${len}] Transfer over`));
        break;
      }
      const seq = index + 1;
      const target = this.targets[index];
      const {coin, address, amount, format} = target;
      let _address = address;
      if (is.truthy(format)) {
        switch (format) {
          case AddressFormat.kusama:
            const publicKey = u8aToHex(decodeAddress(address));
            _address = encodeAddress(publicKey, 42);
            break;
          case AddressFormat.crab:
          default:
            break;
        }
      }

      const viewAddress = address === _address ? address : address + ' -> ' + _address;

      if (tryTimes !== 0) {
        if (tryTimes >= maxTry) {
          tryTimes = 0;
          index += 1;
          console.log(colors.yellow(`[${seq}/${len}] The address [${viewAddress}] is try sent many times (${maxTry}). skip this.`));
          rets.push({
            err: 1,
            hash: undefined,
            message: `[${seq}/${len}] Transfer failed`,
            receiver: target,
          });
          continue;
        }
      }
      try {
        let ret;
        console.log(colors.green(`[${seq}/${len}] [${tryTimes + 1}] --> [${coin}] ${viewAddress} [${amount}]`));
        // console.log(account.toJson());
        switch (coin) {
          case Coin.kton:
            ret = await this.transferKton(api, account, target, _address);
            break;
          case Coin.ring:
            ret = await this.transferRing(api, account, target, _address);
            break;
        }
        console.log(`              [hash]: ${ret.hash}`);
        rets.push(ret);
        index += 1;
        tryTimes = 0;
        await Timeout.set(this.duration);
      } catch (e) {
        console.error(`[${seq}/${len}] Transfer failed will retry current receiver: [${viewAddress}]. the error message: ${e.message}`);
        // api = await this.api();
        tryTimes += 1;
      }
    }
    return rets;
  }

  private async transferKton(
    api: ApiPromise,
    account: KeyringPair,
    target: TransferReceiver,
    address: string,
  ): Promise<TransferredData> {
    const ex = api.tx.kton.transfer(
      address, target.amount * PRECISION
    );
    await ex.signAndSend(account);
    const hash = ex.hash.toString();
    return {hash, receiver: target, err: 0, message: undefined};
  }

  private async transferRing(
    api: ApiPromise,
    account: KeyringPair,
    target: TransferReceiver,
    address: string,
  ): Promise<TransferredData> {
    const ex = api.tx.balances.transfer(
      address, target.amount * PRECISION
    );
    await ex.signAndSend(account);
    const hash = ex.hash.toString();
    return {hash, receiver: target, err: 0, message: undefined};
  }


}

interface TransferredData {
  hash: string | undefined;
  err: number;
  message: string | undefined;
  receiver: TransferReceiver | undefined;
}
