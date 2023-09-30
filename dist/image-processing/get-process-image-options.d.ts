interface ProcessImageOptions {
    widths: number[];
    quality?: number;
    webp: boolean;
    avif: boolean;
}
export default function getProcessImageOptions(imageWidth: number, options?: Partial<ProcessImageOptions>): ProcessImageOptions;
export {};
