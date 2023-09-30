export interface SrcGeneratorInfo {
    inputDir: string;
    outputDir: string;
    src: string;
}
export type SrcGenerator = (path: string, info?: SrcGeneratorInfo) => string;
interface PathToUrlOptions {
    inputDir: string;
    src: string;
    outputDir: string;
    publicPath?: string;
    srcGenerator?: SrcGenerator;
}
export default function pathToUrl(path: string, options?: PathToUrlOptions): string;
export {};
