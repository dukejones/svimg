import type Image from './image';
import type Queue from '../core/queue';
export interface ProcessImageOptions {
    widths?: number[];
    quality?: number;
    webp?: boolean;
    avif?: boolean;
    skipGeneration?: boolean;
}
export interface ProcessImageOutput {
    images: Image[];
    webpImages: Image[];
    avifImages: Image[];
    aspectRatio: number;
}
export default function processImage(inputFile: string, outputDir: string, queue: Queue, options?: ProcessImageOptions): Promise<ProcessImageOutput>;
