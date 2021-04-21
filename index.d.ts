import { ForkOptions } from "child_process";

export = Farm;

declare function Farm(name: string): Promise<Farm.Workers>;
declare function Farm(name: string, exportedMethods: string[]): Promise<Farm.Workers>;
declare function Farm(options: Farm.FarmOptions, name: string): Promise<Farm.Workers>;
declare function Farm(
  options: Farm.FarmOptions,
  name: string,
  exportedMethods: string[],
): Promise<Farm.Workers>;

type WorkerCallback0 = () => void;
type WorkerCallback1 = (arg1: any) => void;
type WorkerCallback2 = (arg1: any, arg2: any) => void;
type WorkerCallback3 = (arg1: any, arg2: any, arg3: any) => void;
type WorkerCallback4 = (arg1: any, arg2: any, arg3: any, arg4: any) => void;


declare namespace Farm {
  export interface CallOptions {
    callback: WorkerCallback,
    maxCallTime: number
  }
  export function end(workers: Workers, callback?: Function): void;
  export function queue(workers: Workers): any;

  export interface Workers {
    [x: string]: Workers,
    (callback: WorkerCallback | CallOptions): void;
    (arg1: any, callback: WorkerCallback | CallOptions): void;
    (arg1: any, arg2: any, callback: WorkerCallback | CallOptions): void;
    (arg1: any, arg2: any, arg3: any, callback: WorkerCallback | CallOptions): void;
    (
      arg1: any,
      arg2: any,
      arg3: any,
      arg4: any,
      callback: WorkerCallback | CallOptions,
    ): void;
  }

  export interface FarmOptions {
    maxCallsPerWorker?: number;
    maxConcurrentWorkers?: number;
    maxConcurrentCallsPerWorker?: number;
    maxConcurrentCalls?: number;
    maxCallTime?: number;
    maxRetries?: number;
    autoStart?: boolean;
    workerOptions?: ForkOptions;
    asyncInit?: boolean;
    maxInitTime?: number;
  }

  export type WorkerCallback =
    | WorkerCallback0
    | WorkerCallback1
    | WorkerCallback2
    | WorkerCallback3
    | WorkerCallback4;
}
