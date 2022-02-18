import Stream from 'streamjs';
import is from 'is_js';
import {Coin, TransferReceiver} from "../../types/transfer";

const colors = require('colors');

const Fs = require('fs');
const CsvReadableStream = require('csv-reader');

export class TargetParser {
  private readonly target: string;
  private readonly file: string;
  private readonly coin: Coin;
  private readonly amount: number;


  constructor(target: string, file: string, coin: Coin, amount: number) {
    this.target = target;
    this.file = file;
    this.coin = coin;
    this.amount = amount;
  }

  static new(target: string, file: string, coin: Coin, amount: number): TargetParser {
    return new TargetParser(target, file, coin, amount);
  }

  public async parse(): Promise<TransferReceiver[]> {
    const targetFromRaw = this.parseTarget();
    const targetFromFile = await this.parseFile();
    return Stream([
      ...targetFromRaw,
      ...targetFromFile,
    ])
      .filter(item => {
        const address = item.address;
        if (is.not.truthy(address)) {
          console.log(colors.yellow('Missing address. skip this'));
          return false;
        }
        // if (address.length != 48) {
        //   console.log(colors.yellow('Wrong address: %s'), address);
        //   return false;
        // }
        const coin = item.coin;
        if (is.not.truthy(coin)) {
          console.log(colors.yellow('Missing coin, skip this'));
          return false;
        }
        const amount = item.amount;
        if (is.not.truthy(amount)) {
          console.log(colors.yellow('Missing amount, skip this'));
          return false;
        }
        return true;
      })
      .map(item => {
        return {
          ...item,
          address: item.address.replace('\n', ' '),
        };
      })
      .toArray();
  }

  private parseTarget(): TransferReceiver[] {
    const targets = TargetParser.splitText(this.target);
    return Stream(targets)
      .map(item => {
        return {address: item, coin: this.coin, amount: this.amount};
      })
      .toArray();
  }

  private async parseFile(): Promise<TransferReceiver[]> {
    return new Promise((resolve, reject) => {
      try {
        const inputStream = Fs.createReadStream(this.file, 'utf8');

        const rets: TransferReceiver[] = [];
        inputStream
          .pipe(new CsvReadableStream({parseNumbers: true, parseBooleans: true, trim: true}))
          .on('data', function (row) {
            try {
              // console.log('A row arrived: ', row);
              if (!row) return;
              if (!row.length) return;
              rets.push({
                address: row[0],
                coin: row[1],
                amount: row[2],
                format: row[3],
              });
            } catch (e) {
              console.error(e);
            }
          })
          .on('end', function () {
            resolve(rets);
          });
      } catch (e) {
        resolve([]);
      }
    });
  }

  private static splitText(text: string): string[] {
    if (text === '') return [];
    return text.split(/[\n\r ]/);
  }

}
