import type Image from '../image-processing/image';
export interface GetComponentAttributesOutput {
    srcset: string;
    srcsetwebp?: string;
    srcsetavif?: string;
    placeholder?: string;
    aspectratio: number;
    placeholdersrc?: string;
    placeholderwebp?: string;
    placeholderavif?: string;
}
interface GetComponentAttributesInput {
    images: Image[];
    webpImages: Image[];
    avifImages: Image[];
    placeholder?: string;
    aspectRatio: number;
    placeholderImage?: Image;
    placeholderWebp?: Image;
    placeholderAvif?: Image;
}
export default function getComponentAttributes(input: GetComponentAttributesInput): GetComponentAttributesOutput;
export {};
