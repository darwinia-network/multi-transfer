import {AddressFormat} from "../types/transfer";
import colors from "colors";
import {u8aToHex} from "@polkadot/util";
import Stream from 'streamjs';
import {decodeAddress, encodeAddress} from "@polkadot/util-crypto";


export function convertAddress(originalFormat: AddressFormat,
                               targetFormat: AddressFormat,
                               targets: string[],): string[] | undefined {

  switch (originalFormat) {
    case AddressFormat.kusama:
      return convertFromKusama(targetFormat, targets);
    default:
      return null;
  }
}


function convertFromKusama(targetFormat: AddressFormat,
                           targets: string[],) {
  let prefix;
  switch (this.targetFormat) {
    case AddressFormat.kusama:
      return targets;
    case AddressFormat.crab:
      prefix = 42;
      break;
    default:
      console.log(colors.red(`Not support convert from kusama to ${this.targetFormat}`));
      return null;
  }
  return Stream(this.targets)
    .map(item => {
      const publicKey = u8aToHex(decodeAddress(item));
      return {
        original: item,
        converted: encodeAddress(publicKey, prefix),
      };
    })
    .map(item => item.converted)
    .toArray();

}


export function splitArray(array, size = 10) {
  const rets = [];
  const length = array.length;
  let start = 0, end = size;
  for (; start < length;) {
    rets.push(array.slice(start, end));
    start = end;
    end += size;
  }
  return rets;
}


