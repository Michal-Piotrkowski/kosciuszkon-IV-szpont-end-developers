declare module 'tar-stream' {
  import { Writable } from 'node:stream';

  interface TarEntryHeader {
    type: string;
    name: string;
  }

  interface TarExtract extends Writable {
    on(
      event: 'entry',
      listener: (
        header: TarEntryHeader,
        stream: NodeJS.ReadableStream,
        next: () => void,
      ) => void,
    ): this;
    on(event: 'finish', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  const tarStream: {
    extract: () => TarExtract;
  };

  export default tarStream;
}
