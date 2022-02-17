import {TargetParser} from './parser'
import {ApiPromise, HttpProvider} from "@polkadot/api";
import {Keyring} from "@polkadot/keyring";
import {KeyringPair} from "@polkadot/keyring/types";
import {Coin, TransferReceiver} from "../../types/transfer";
import Timeout from 'await-timeout';
import Stream from 'streamjs';
import is from 'is_js';

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
    Stream(faileds)
      .forEach(item => {
        const {message, address, amount, coin} = item;
        if (is.truthy(address)) {
          console.log(`[${coin}] -> ${address} [${amount}]: ${colors.red(message)}`);
        } else {
          console.log(colors.red(message));
        }
      })
    console.log('------- OK');
    Stream(oks)
      .forEach(item => {
        const {
          address,
          amount,
          coin,
          hash,
        } = item;
        console.log(colors.green(`[${coin}] -> ${address} [${amount}]: ${hash}`));
      });
  }

  private async api(): Promise<ApiPromise> {
    return await ApiPromise.create({
      provider: new HttpProvider(this.endpoint),
      // types: config.types,
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
        address: undefined,
        amount: undefined,
        hash: undefined,
        coin: Coin.ring,
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
      const {coin, address, amount} = target;

      if (tryTimes !== 0) {
        if (tryTimes >= maxTry) {
          tryTimes = 0;
          index += 1;
          console.log(colors.yellow(`[${seq}/${len}] The address [${address}] is try sent many times (${maxTry}). skip this.`));
          rets.push({
            address: address,
            amount: amount,
            coin: coin,
            err: 1,
            hash: undefined,
            message: `[${seq}/${len}] Transfer failed`,
          });
          continue;
        }
      }
      try {
        let ret;
        console.log(colors.green(`[${seq}/${len}] [${tryTimes + 1}] --> [${coin}] ${address} [${amount}]`));
        switch (coin) {
          case Coin.kton:
            ret = await this.transferKton(api, account, address, amount);
            break;
          case Coin.ring:
            ret = await this.transferRing(api, account, address, amount);
            break;
        }
        console.log(`              [hash]: ${ret.hash}`);
        rets.push(ret);
        index += 1;
        await Timeout.set(this.duration);
      } catch (e) {
        console.error(`[${seq}/${len}] Transfer failed will retry current receiver: [${address}]. the error message: ${e.message}`);
        // api = await this.api();
        tryTimes += 1;
      }
    }
    return rets;
  }

  private async transferKton(
    api: ApiPromise,
    account: KeyringPair,
    address: string,
    amount: number
  ): Promise<TransferredData> {
    const ex = api.tx.kton.transfer(
      address, amount * PRECISION
    );
    await ex.signAndSend(account);
    const hash = ex.hash.toString();
    return {address, amount, hash, coin: Coin.kton, err: 0, message: undefined};
  }

  private async transferRing(
    api: ApiPromise,
    account: KeyringPair,
    address: string,
    amount: number
  ): Promise<TransferredData> {
    const ex = api.tx.balances.transfer(
      address, amount * PRECISION
    );
    await ex.signAndSend(account);
    const hash = ex.hash.toString();
    return {address, amount, hash, coin: Coin.ring, err: 0, message: undefined};
  }


}

interface TransferredData {
  address: String | undefined;
  amount: number | undefined;
  hash: string | undefined;
  coin: Coin | undefined;
  err: number;
  message: string | undefined;
}
