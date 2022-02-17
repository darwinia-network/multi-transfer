
export enum Coin {
  ring = 'ring',
  kton = 'kton',
}

export interface TransferReceiver {
  address: string;
  coin: Coin;
  amount: number;
}
