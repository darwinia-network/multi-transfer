import Stream from 'streamjs';
import {promises as fs} from 'fs';
import is from 'is_js';

export class ConvertAddressTargetParser {
  private readonly target: string;
  private readonly file: string;


  constructor(target: string, file: string) {
    this.target = target;
    this.file = file;
  }

  static new(target: string, file: string): ConvertAddressTargetParser {
    return new ConvertAddressTargetParser(target, file);
  }

  public async parse(): Promise<string[]> {
    const targetFromRaw = this.parseTarget();
    const targetFromFile = await this.parseFile();
    return Stream([
      ...targetFromRaw,
      ...targetFromFile,
    ])
      .filter(item => is.truthy(item))
      .toArray();
  }

  private parseTarget(): string[] {
    if (is.not.truthy(this.target)) return [];
    const targets = ConvertAddressTargetParser.splitText(this.target);
    return Stream(targets)
      .map(item => {
        return item;
      })
      .toArray();
  }


  private async parseFile(): Promise<string[]> {
    if (is.not.truthy(this.file)) return [];
    const data = await fs.readFile(this.file, 'utf8');
    const targets = ConvertAddressTargetParser.splitText(data);
    return Stream(targets)
      .map(item => {
        return item;
      })
      .toArray();
  }


  private static splitText(text: string): string[] {
    if (text === '') return [];
    return text.split(/[\n\r ]/);
  }


}
