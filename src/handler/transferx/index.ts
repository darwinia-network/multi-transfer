import {TargetParser} from './parser'
import {ApiPromise, WsProvider} from "@polkadot/api";
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
import BigNumber from "bignumber.js";

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
    await fs.writeFile('ok.csv', '');
    await fs.writeFile('fail.csv', '');

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
    let failedOutput = '';
    Stream(faileds)
      .forEach(item => {
        const {message, receivers} = item;
        if (receivers.length != 0) {
          receivers.forEach(receiver => {
            console.log(`[${receiver.coin}] -> ${receiver.address} [${receiver.amount}]: ${colors.red(message)}`);
          });
          failedOutput = this.betterOutputCsvRows(receivers);
        } else {
          console.log(colors.red(message));
        }
      })
    console.log('------- OK');
    let okOutput = '';
    Stream(oks)
      .forEach(item => {
        const {
          receivers,
          hash,
        } = item;
        receivers.forEach(receiver => {
          console.log(colors.green(`[${receiver.coin}] -> ${receiver.address} [${receiver.amount}]: ${hash}`));
        });
        okOutput = this.betterOutputCsvRows(receivers);
      });
    // await fs.writeFile('fail.csv', failedOutput);
    console.log(colors.yellow('Accounts failed transferred are written to the fail.csv file'));

    // await fs.writeFile('ok.csv', okOutput);
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

  private betterOutputCsvRows(
    data: TransferReceiver[],
    columnsSplitBy = ',',
    rowsSplitBy = '\n',
  ): string {
    return Stream(data)
      .map(receiver => [receiver.address, receiver.coin, receiver.amount, receiver.format].join(columnsSplitBy))
      // .toArray()
      .join(rowsSplitBy);
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

    let api = await this.api();
    const account = this.account();



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

    const maxTry = 3;
    let tryTimes = 0;
    const total = parts.length;
    let index = 0;
    for (const batches of parts) {
      const seq = index + 1;
      while (true) {

        if (tryTimes !== 0) {
          if (tryTimes >= maxTry) {
            tryTimes = 0;
            continue;
          }
        }

        let ex;
        try {

          const txPool = Stream(batches)
            .map(item => {
              const _address = item.receiverAddress || item.address;
              const value = new BigNumber(item.amount).times(PRECISION);
              console.log(colors.green(`[${seq}/${total}] Send to ${item.address} [${item.coin}] ${value.toString()}`));
              switch (item.coin) {
                case Coin.kton:
                  return api.tx.kton.transfer(_address, value.toString());
                case Coin.ring:
                  return api.tx.balances.transfer(_address, value.toString());
                default:
                  return null;
              }
            })
            .filter(item => !!item)
            .toArray();
          ex = api.tx.utility.batch(txPool);

        } catch (e) {
          console.error(colors.red(`[${seq}/${total}] ${e.message}`));
          rets.push({err: 1, hash: undefined, message: `[${seq}/${total}] Filed to build transactions: ${e.message}`, receivers: batches});
          tryTimes = 0;
          break;
        }

        try {

          const sentTx = await this.safeSendTx(account, ex);
          // console.log(sentTx);
          const okRing = Stream(batches)
            .filter(item => item.coin ===Coin.ring)
            .filter(item => Stream(sentTx.eRing)
              .noneMatch(er => er.address === (item.receiverAddress || item.address) && er.value.toString() === (new BigNumber(item.amount).times(PRECISION).toString())))
            .toArray();
          const okKton = Stream(batches)
            .filter(item => item.coin ===Coin.kton)
            .filter(item => Stream(sentTx.eKton)
              .noneMatch(er => er.address === (item.receiverAddress || item.address) && er.value.toString() === (new BigNumber(item.amount).times(PRECISION).toString())))
            .toArray();

          console.log(`[${seq}/${total}] hash: ${colors.cyan(sentTx.hash)}`);

          if (okRing.length === 0 && okKton.length === 0) {
            await fs.appendFile('ok.csv', this.betterOutputCsvRows(batches));
            await fs.appendFile('ok.csv', '\n\n');
            rets.push({err: 0, hash: sentTx.hash, message: undefined, receivers: batches});
          }

          if (okRing.length > 0) {
            console.log(colors.yellow(`[${seq}/${total}] Failed transfer ring`));
            await fs.appendFile('fail.csv', this.betterOutputCsvRows(okRing));
            await fs.appendFile('fail.csv', '\n\n');
            rets.push({err: 1, hash: sentTx.hash, message: `[${seq}/${total}] Failed transfer ring`, receivers: okRing});
          }
          if(okKton.length > 0) {
            console.log(colors.yellow(`[${seq}/${total}] Failed transfer kton`));
            await fs.appendFile('fail.csv', this.betterOutputCsvRows(okKton));
            await fs.appendFile('fail.csv', '\n\n');
            rets.push({err: 1, hash: sentTx.hash, message: `[${seq}/${total}] Failed transfer kton`, receivers: okKton});
          }

          tryTimes = 0;
          await Timeout.set(this.duration);
          break;
        } catch (e) {
          console.error(`[${seq}/${total}] Transfer failed, will retry it. ${e.message}`);
          tryTimes += 1;
          await api.disconnect();
          api = await this.api();
        }

      }
      index += 1;
      console.log(colors.blue(`[${seq}/${total}] ------`));
    }
    await api.disconnect();
    return rets;
  }

  private async safeSendTx(
    account: KeyringPair,
    ex: any,
  ): Promise<ExReceipt> {
    return await new Promise((resolve, reject) => {
      let unsub;
      ex.signAndSend(account, ({events = [], status}) => {
        if (!status.isFinalized)
          return;

        const checkRings = [];
        const checkKtons = [];
        events.forEach(({phase, event: {data, method, section}}) => {
          // console.log(phase.toString() + ' : ' + section + '.' + method + ' ' + data.toString());
          const rto = JSON.parse(data.toString());
          if (section === 'balances' && method === 'Transfer') {
            checkRings.push({address: rto[1], value: rto[2]});
          }
          if (section === 'kton' && method === 'Transfer') {
            checkKtons.push({address: rto[1], value: rto[2]});
          }
        });
        if (unsub) {
          unsub();
        }
        resolve({
          hash: ex.hash.toString(),
          eRing: checkRings,
          eKton: checkKtons,
        });
      }).then(v => unsub = v)
        .catch(reject);
    });
  }

}

interface ExReceipt {
  hash: string;
  eRing: BalanceReceipt[],
  eKton: BalanceReceipt[],
}

interface BalanceReceipt {
  address: string;
  value: number;
}

interface TransferredData {
  hash: string | undefined;
  err: number;
  message: string | undefined;
  receivers: TransferReceiver[];
}
