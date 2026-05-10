declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(
      type: 'float32' | 'int32' | 'int64' | 'bool' | 'string',
      data: Float32Array | Int32Array | BigInt64Array | boolean[] | string[],
      dims: readonly number[],
    );
  }

  export interface InferenceSession {
    readonly inputNames: string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }

  export const InferenceSession: {
    create(modelPath: string): Promise<InferenceSession>;
  };
}
