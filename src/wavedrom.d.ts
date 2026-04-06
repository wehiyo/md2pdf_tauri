declare module 'wavedrom' {
  export interface WaveDromData {
    signal?: Array<{
      name?: string;
      wave?: string;
      data?: string[];
    }>;
    head?: {
      text?: string;
      tick?: number;
    };
    foot?: {
      text?: string;
      tock?: number;
    };
    edge?: Array<{
      from?: string;
      to?: string;
      arrow?: string;
      label?: string;
    }>;
    [key: string]: unknown;
  }

  export const waveSkin: unknown;

  export function renderWaveElement(
    index: number,
    data: WaveDromData,
    container: HTMLElement,
    skin: unknown
  ): void;

  export function renderAny(
    index: number,
    data: WaveDromData,
    skin: unknown
  ): string;

  export function processAll(): void;
}