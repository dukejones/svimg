import type { GetComponentAttributesOutput } from './get-component-attributes';
import Queue from '../core/queue';
import type { SrcGenerator } from '../core/path-to-url';
interface GenerateComponentAttributesOptions {
    src: string;
    queue?: Queue;
    inputDir: string;
    outputDir: string;
    publicPath?: string;
    webp?: boolean;
    avif?: boolean;
    widths?: number[];
    quality?: number;
    skipGeneration?: boolean;
    skipPlaceholder?: boolean;
    srcGenerator?: SrcGenerator;
    embedPlaceholder?: boolean;
}
export default function generateComponentAttributes(options: GenerateComponentAttributesOptions): Promise<GetComponentAttributesOutput>;
export {};
