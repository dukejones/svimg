import type Image from './image';
import type Queue from '../core/queue';
interface ResizeImageOptions {
    width: number;
    quality?: number;
}
export default function ensureResizeImage(inputFile: string, outputFile: string, queue: Queue, options: ResizeImageOptions): Promise<Image>;
export {};
