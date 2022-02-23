import {TargetParser} from './parser'
import {ApiPromise, HttpProvider, WsProvider} from "@polkadot/api";
import {Keyring} from "@polkadot/keyring";
import {KeyringPair} from "@polkadot/keyring/types";
import {decodeAddress, encodeAddress} from '@polkadot/util-crypto';
import {u8aToHex} from '@polkadot/util';
import {AddressFormat, Coin, TransferReceiver} from "../../types/transfer";
import Timeout from 'await-timeout';
import Stream from 'streamjs';
import is from 'is_js';
import {promises as fs} from 'fs';
import * as helpers from "../../patch/helpers";

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
        const {message, receivers} = item;
        if (receivers.length != 0) {
          receivers.forEach(receiver => {
            console.log(`[${receiver.coin}] -> ${receiver.address} [${receiver.amount}]: ${colors.red(message)}`);
            failedOutput.push([receiver.address, receiver.coin, receiver.amount, receiver.format].join(','));
          });
        } else {
          console.log(colors.red(message));
        }
      })
    console.log('------- OK');
    const okOutput = [];
    Stream(oks)
      .forEach(item => {
        const {
          receivers,
          hash,
        } = item;
        receivers.forEach(receiver => {
          console.log(colors.green(`[${receiver.coin}] -> ${receiver.address} [${receiver.amount}]: ${hash}`));
          okOutput.push([receiver.address, receiver.coin, receiver.amount, receiver.format].join(','));
        });
      });
    await fs.writeFile('fail.csv', failedOutput.join('\n'));
    console.log(colors.yellow('Accounts failed transferred are written to the fail.csv file'));

    await fs.writeFile('ok.csv', okOutput.join('\n'));
    console.log(colors.yellow('Accounts successfully transferred are written to the ok.csv file'));
  }

  private async api(): Promise<ApiPromise> {
    return await ApiPromise.create({
      // provider: new HttpProvider(this.endpoint),
      provider: new WsProvider(this.endpoint),
      typesBundle: typesBundleForPolkadotApps,
    });
  }

  private account(): KeyringPair {
    return new Keyring({
      type: 'sr25519',
    }).addFromUri(this.seed);
  }

  private async transfer(): Promise<TransferredData[]> {
    let len = this.targets.length;
    if (len == 0) {
      return [{
        err: 1,
        message: 'Not receiver data.',
        hash: undefined,
        receivers: [],
      }];
    }

    const api = await this.api();
    const account = this.account();



    const maxTry = 3;
    let tryTimes = 0;

    const allReceivers = Stream(this.targets)
      .map(item => {
        const {address, format} = item;
        let _address;
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
        return {
          ...item,
          receiverAddress: _address,
        };
      })
      .toArray();
    const parts = helpers.splitArray(allReceivers, 3);


    const rets: TransferredData[] = [];
    for (const batches of parts) {
      while (true) {

        if (tryTimes !== 0) {
          if (tryTimes >= maxTry) {
            tryTimes = 0;
            // index += 1;
            // console.log(colors.yellow(`[${seq}/${len}] The address [${viewAddress}] is try sent many times (${maxTry}). skip this.`));
            // rets.push({
            //   err: 1,
            //   hash: undefined,
            //   message: `[${seq}/${len}] Transfer failed`,
            //   receivers: [...batches],
            // });
            continue;
          }
        }

        let ex;
        try {

          const txPool = Stream(batches)
            .map(item => {
              switch (item.coin) {
                case Coin.kton:
                  return api.tx.kton.transfer(item.receiverAddress || item.address, item.amount * PRECISION);
                case Coin.ring:
                  return api.tx.balances.transfer(item.receiverAddress || item.address, item.amount * PRECISION);
                default:
                  return null;
              }
            })
            .filter(item => !!item)
            .toArray();
          ex = api.tx.utility.batch(txPool);

        } catch (e){
          console.log(e);
          break;
        }

        try {

          await this.safeSendTx(account, ex);


          tryTimes = 0;
          await Timeout.set(this.duration);
          break;
        } catch (e) {
          // console.error(`[${seq}/${len}] Transfer failed will retry current receiver: [${viewAddress}]. the error message: ${e.message}`);
          // api = await this.api();
          tryTimes += 1;
        }

      }
    }
    await api.disconnect();
    return rets;
  }

  private async safeSendTx(
    account: KeyringPair,
    ex: any,
    ): Promise<void> {
    const _ = await new Promise((resolve, reject) => {
      let unsub;
      ex.signAndSend(account, ({events = [], status}) => {
        console.log(status.isFinalized);
        if (!status.isFinalized)
          return;

        events.forEach(({phase, event: {data, method, section}}) => {
          console.log(phase.toString() + ' : ' + section + '.' + method + ' ' + data.toString());
        });
        if (unsub) {
          unsub();
        }
        resolve(status.hash.toString());
      }).then(v => unsub = v);
    })
  }

  // private async transferKton(
  //   api: ApiPromise,
  //   account: KeyringPair,
  //   receivers: TransferReceiver[],
  // ): Promise<TransferredData> {
  //   const txPool = Stream(receivers)
  //     .map(item => api.tx.kton.transfer(item.receiverAddress || item.address, item.amount * PRECISION))
  //     .toArray();
  //   const ex = api.tx.utility.batch(txPool);
  //
  //   const hash = await new Promise((resolve, reject) => {
  //     let unsub;
  //     ex.signAndSend(account, ({events = [], status}) => {
  //       console.log(status.isFinalized);
  //       if (!status.isFinalized)
  //         return;
  //
  //       events.forEach(({phase, event: {data, method, section}}) => {
  //         console.log(phase.toString() + ' : ' + section + '.' + method + ' ' + data.toString());
  //       });
  //       if (unsub) {
  //         unsub();
  //       }
  //       resolve(status.hash.toString());
  //     }).then(v => unsub = v);
  //   })
  //   return {hash: hash.toString(), receivers: [...receivers], err: 0, message: undefined};
  // }
  //
  // private async transferRing(
  //   api: ApiPromise,
  //   account: KeyringPair,
  //   receivers: TransferReceiver[],
  // ): Promise<TransferredData> {
  //   const txPool = Stream(receivers)
  //     .map(item => api.tx.balances.transfer(item.receiverAddress || item.address, item.amount * PRECISION))
  //     .toArray();
  //   const ex = api.tx.utility.batch(txPool);
  //
  //   const hash = await new Promise((resolve, reject) => {
  //     let unsub;
  //     ex.signAndSend(account, ({events = [], status}) => {
  //       console.log(status.isFinalized);
  //       if (!status.isFinalized)
  //         return;
  //
  //       events.forEach(({phase, event: {data, method, section}}) => {
  //         console.log(phase.toString() + ' : ' + section + '.' + method + ' ' + data.toString());
  //       });
  //       if (unsub) {
  //         unsub();
  //       }
  //       resolve(status.hash.toString());
  //     }).then(v => unsub = v);
  //   })
  //   console.log(hash);
  //   return {hash: hash.toString(), receivers: [...receivers], err: 0, message: undefined};
  // }


}

interface TransferredData {
  hash: string | undefined;
  err: number;
  message: string | undefined;
  receivers: TransferReceiver[];
}
