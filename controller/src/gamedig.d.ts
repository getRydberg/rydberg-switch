declare module "gamedig" {
  export interface QueryOptions {
    type: string;
    host: string;
    port?: number;
    maxRetries?: number;
    socketTimeout?: number;
    attemptTimeout?: number;
    givenPortOnly?: boolean;
    username?: string;
    password?: string;
    rejectUnauthorized?: boolean;
  }

  export interface QueryResult {
    numplayers: number;
    maxplayers: number;
    players: Array<{ name: string }>;
  }

  export class GameDig {
    static query(options: QueryOptions): Promise<QueryResult>;
  }
}

