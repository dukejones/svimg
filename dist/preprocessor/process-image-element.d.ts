import type Queue from '../core/queue';
import type { ImagePreprocessorOptions } from './image-preprocessor';
export default function processImageElement(element: string, queue: Queue, options: ImagePreprocessorOptions): Promise<string>;
