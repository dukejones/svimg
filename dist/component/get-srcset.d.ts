import type Image from '../image-processing/image';
interface GetSrcsetOptions {
    pathOnly?: boolean;
}
export default function getSrcset(images: Image[], options?: GetSrcsetOptions): string;
export {};
