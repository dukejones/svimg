/// <reference types="node" />
import sharp from "sharp";
interface ResizeImageOptions {
    width: number;
    height?: number;
    quality?: number;
}
export declare function resizeImageToFile(inputFile: string, options: ResizeImageOptions, outputFile: string): Promise<sharp.OutputInfo>;
declare function resizeImage(inputFile: string, options: ResizeImageOptions, outputFile: string): Promise<sharp.OutputInfo>;
declare function resizeImage(inputFile: string, options: ResizeImageOptions): Promise<Buffer>;
export default resizeImage;
