import type Image from './image';
import type Queue from '../core/queue';
interface ResizeImageMultipleOptions {
    widths: number[];
    quality?: number;
    filenameGenerator: (options: {
        width: number;
        quality?: number;
        inputFile: string;
    }) => string;
    skipGeneration?: boolean;
    aspectRatio: number;
}
export default function resizeImageMultiple(inputFile: string, outputDir: string, queue: Queue, options: ResizeImageMultipleOptions): Promise<Image[]>;
export {};
