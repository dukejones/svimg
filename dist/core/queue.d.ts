export interface QueueOptions {
    concurrency?: number;
}
export default class Queue {
    constructor(options?: QueueOptions);
    private cache;
    private queue;
    enqueue<TFunc extends ((...args: any[]) => Promise<any>)>(func: TFunc, ...args: Parameters<TFunc>): ReturnType<TFunc>;
}
