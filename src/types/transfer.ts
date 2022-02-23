
export enum Coin {
  ring = 'ring',
  kton = 'kton',
}

export enum AddressFormat {
  kusama = 'kusama',
  crab = 'crab',
}

export interface TransferReceiver {
  address: string;
  receiverAddress: string | undefined;
  coin: Coin;
  amount: number;
  format: AddressFormat | undefined,
}
