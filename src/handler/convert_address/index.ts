import {ConvertAddressTargetParser} from './parser';
import {AddressFormat} from "../../types/transfer";
import colors from 'colors';
import * as helpers from "../../patch/helpers";

export class ConvertAddressHandler {

  private readonly originalFormat: AddressFormat;
  private readonly targetFormat: AddressFormat;
  private readonly targets: string[];

  constructor(originalFormat: AddressFormat, targetFormat: AddressFormat, targets: string[]) {
    this.originalFormat = originalFormat;
    this.targetFormat = targetFormat;
    this.targets = targets;
  }


  static async new(
    originalFormat: AddressFormat,
    targetFormat: AddressFormat,
    target: string | null | undefined,
    file: string | null | undefined,
  ): Promise<ConvertAddressHandler> {
    const parser = ConvertAddressTargetParser.new(target, file);
    const targets = await parser.parse();
    return new ConvertAddressHandler(originalFormat, targetFormat, targets);
  }

  public handle() {
    const rets = helpers.convertAddress(this.originalFormat, this.targetFormat, this.targets);
    if (!rets) {
      console.log(colors.red('Convert failed'));
      return;
    }
    let index = 0;
    for (const item of rets) {
      const original = this.originalFormat[index];
      console.log(`${original},${item}`);
    }
  }

}
