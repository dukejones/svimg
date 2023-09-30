import PQueue from 'p-queue';
import replaceAsync from 'string-replace-async';
import { join, basename, extname, dirname } from 'node:path';
import { deprecate } from 'node:util';
import sharp from 'sharp';
import { access, mkdir } from 'node:fs/promises';
import md5file from 'md5-file';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'node-html-parser';
import { SvelteComponentTyped } from 'svelte';

class Queue {
    constructor(options) {
        this.cache = new Map();
        this.queue = new PQueue({ concurrency: (options === null || options === void 0 ? void 0 : options.concurrency) || Infinity });
    }
    enqueue(func, ...args) {
        const cacheKey = `${func.name}|${JSON.stringify(args)}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        const p = this.queue.add(() => func.apply(null, args));
        this.cache.set(cacheKey, p);
        return p;
    }
}

function getSrcset(images, options) {
    return images
        .map((i) => ((options === null || options === void 0 ? void 0 : options.pathOnly) ? i.path : `${i.path} ${i.width}w`))
        .join(', ');
}

function getComponentAttributes(input) {
    return {
        srcset: getSrcset(input.images),
        srcsetwebp: input.webpImages.length
            ? getSrcset(input.webpImages)
            : undefined,
        srcsetavif: input.avifImages.length
            ? getSrcset(input.avifImages)
            : undefined,
        placeholder: input.placeholder,
        aspectratio: input.aspectRatio,
        placeholdersrc: input.placeholderImage
            ? getSrcset([input.placeholderImage], { pathOnly: true })
            : undefined,
        placeholderwebp: input.placeholderWebp
            ? getSrcset([input.placeholderWebp], { pathOnly: true })
            : undefined,
        placeholderavif: input.placeholderAvif
            ? getSrcset([input.placeholderAvif], { pathOnly: true })
            : undefined,
    };
}

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise */


function __rest(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
}

const pathSepPattern = /\\/g;
function stripPrefix(path, prefix) {
    prefix = prefix.replace(pathSepPattern, '/');
    if (!path.startsWith(prefix)) {
        return path;
    }
    return path.substring(prefix.length + (prefix.endsWith('/') ? 0 : 1));
}
const createPublicPathSrcGenerator = deprecate(function (publicPath) {
    return (path) => publicPath + (publicPath.endsWith('/') ? '' : '/') + path;
}, 'publicPath is deprecated, please use srcGenerator instead');
function defaultSrcGenerator(path, { inputDir, src }) {
    if (inputDir) {
        path = stripPrefix(path, inputDir);
    }
    if (src && !path.startsWith('/') && /^\/[^\/]/.test(src)) {
        path = '/' + path;
    }
    return path;
}
function pathToUrl(path, options) {
    path = path.replace(pathSepPattern, '/');
    if (!options) {
        return path;
    }
    let { publicPath, srcGenerator } = options, info = __rest(options, ["publicPath", "srcGenerator"]);
    if (!srcGenerator && publicPath) {
        srcGenerator = createPublicPathSrcGenerator(publicPath);
    }
    if (srcGenerator) {
        if (info.outputDir) {
            path = stripPrefix(path, info.outputDir);
        }
        const url = srcGenerator(path, info);
        if (!url) {
            throw new Error(`srcGenerator function returned an empty src for path ${path}`);
        }
        return url;
    }
    return defaultSrcGenerator(path, info);
}

// sharp only supports a very specific list of image formats,
// no point depending on a complete mime type database
function getMimeType(format) {
    switch (format) {
        case 'jpeg':
        case 'png':
        case 'webp':
        case 'avif':
        case 'tiff':
        case 'gif':
            return `image/${format}`;
        case 'svg':
            return 'image/svg+xml';
    }
    return '';
}

function resizeImageToFile(inputFile, options, outputFile) {
    return resizeImage(inputFile, options, outputFile);
}
async function resizeImage(inputFile, options, outputFile) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    let sharpInstance = sharp(inputFile);
    if (options.quality) {
        sharpInstance = sharpInstance.jpeg({
            quality: options.quality,
            force: false,
        }).png({
            quality: options.quality,
            force: false,
        }).webp({
            quality: options.quality,
            force: false,
        }).avif({
            quality: options.quality,
            force: false,
        });
    }
    sharpInstance = sharpInstance.resize(options.width, options.height);
    return outputFile !== undefined ? sharpInstance.toFile(outputFile) : sharpInstance.toBuffer();
}

async function getImageMetadata(inputFile) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    return sharp(inputFile).metadata();
}

const DEFAULT_WIDTHS = [480, 1024, 1920, 2560];
const DEFAULT_WEBP = true;
const DEFAULT_AVIF = true;
const PLACEHOLDER_WIDTH = 64;

async function createPlaceholder(inputFile, queue) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    const [{ format }, blurData] = await Promise.all([
        queue.enqueue(getImageMetadata, inputFile),
        queue.enqueue(resizeImage, inputFile, { width: PLACEHOLDER_WIDTH }),
    ]);
    const blur64 = blurData.toString('base64');
    const mime = getMimeType(format);
    const href = `data:${mime};base64,${blur64}`;
    return href;
}

async function exists(file) {
    if (!file) {
        return false;
    }
    try {
        await access(file, constants.F_OK);
        return true;
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return false;
        }
        throw Error(err);
    }
}

async function ensureResizeImage(inputFile, outputFile, queue, options) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    if (!outputFile) {
        throw new Error('Output file is required');
    }
    let width;
    let height;
    if (await queue.enqueue(exists, outputFile)) {
        ({ width, height } = await queue.enqueue(getImageMetadata, outputFile));
    }
    else {
        ({ width, height } = await queue.enqueue(resizeImageToFile, inputFile, {
            width: options.width,
            quality: options.quality,
        }, outputFile));
    }
    return {
        path: outputFile,
        width,
        height,
    };
}

async function resizeImageMultiple(inputFile, outputDir, queue, options) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    if (!outputDir) {
        throw new Error('Output file is required');
    }
    const widthPaths = options.widths.map((width) => {
        const outFile = options.filenameGenerator({
            width,
            quality: options.quality,
            inputFile,
        });
        if (!outFile) {
            throw new Error('Output filename not provided');
        }
        return {
            path: join(outputDir, outFile),
            width,
        };
    });
    return (options === null || options === void 0 ? void 0 : options.skipGeneration)
        ? widthPaths.map(({ path, width }) => ({
            path,
            width,
            height: Math.round((width / options.aspectRatio + Number.EPSILON) * 100) /
                100,
        }))
        : await Promise.all(widthPaths.map(({ width, path }) => ensureResizeImage(inputFile, path, queue, {
            width,
            quality: options.quality,
        })));
}

function getHash(content) {
    return createHash('md5').update(content).digest('hex');
}

function getOptionsHash(options, length) {
    const hash = getHash(Object.entries(options).map(([k, v]) => `${k}=${v}`).join(','));
    return length ? hash.substring(0, length) : hash;
}

function getProcessImageOptions(imageWidth, options) {
    var _a, _b, _c;
    let widths = (options === null || options === void 0 ? void 0 : options.widths) || DEFAULT_WIDTHS;
    widths = widths.filter((w) => w <= imageWidth);
    if (!widths.length ||
        (imageWidth > Math.max(...widths) && !((_a = options === null || options === void 0 ? void 0 : options.widths) === null || _a === void 0 ? void 0 : _a.length))) {
        // use original width if smaller or larger than all widths
        widths.push(imageWidth);
    }
    const webp = (_b = options === null || options === void 0 ? void 0 : options.webp) !== null && _b !== void 0 ? _b : DEFAULT_WEBP;
    const avif = (_c = options === null || options === void 0 ? void 0 : options.avif) !== null && _c !== void 0 ? _c : DEFAULT_AVIF;
    return {
        widths,
        quality: options === null || options === void 0 ? void 0 : options.quality,
        webp,
        avif,
    };
}

async function processImage(inputFile, outputDir, queue, options) {
    if (!inputFile) {
        throw new Error('Input file is required');
    }
    if (!outputDir) {
        throw new Error('Output dir is required');
    }
    const [, metadata, fileHash] = await Promise.all([
        (async () => {
            if (!(options === null || options === void 0 ? void 0 : options.skipGeneration)) {
                if (!(await queue.enqueue(exists, outputDir))) {
                    await queue.enqueue(mkdir, outputDir, {
                        recursive: true,
                    });
                }
            }
        })(),
        queue.enqueue(getImageMetadata, inputFile),
        queue.enqueue(md5file, inputFile),
    ]);
    const _a = options || {}, { skipGeneration } = _a, restOpts = __rest(_a, ["skipGeneration"]);
    const { widths, quality, webp, avif } = getProcessImageOptions(metadata.width, restOpts);
    const filename = basename(inputFile);
    const extension = extname(filename);
    const baseFilename = filename.substring(0, filename.length - extension.length);
    const aspectRatio = metadata.width / metadata.height;
    const [images, webpImages, avifImages] = await Promise.all([
        resizeImageMultiple(inputFile, outputDir, queue, {
            widths,
            quality,
            filenameGenerator: ({ width, quality }) => `${baseFilename}.${getOptionsHash({ width, quality }, 7)}.${fileHash}${extension}`,
            aspectRatio,
            skipGeneration,
        }),
        webp
            ? resizeImageMultiple(inputFile, outputDir, queue, {
                widths,
                quality,
                filenameGenerator: ({ width, quality }) => `${baseFilename}.${getOptionsHash({ width, quality }, 7)}.${fileHash}.webp`,
                aspectRatio,
                skipGeneration,
            })
            : [],
        avif
            ? resizeImageMultiple(inputFile, outputDir, queue, {
                widths,
                quality,
                filenameGenerator: ({ width, quality }) => `${baseFilename}.${getOptionsHash({ width, quality }, 7)}.${fileHash}.avif`,
                aspectRatio,
                skipGeneration,
            })
            : [],
    ]);
    return {
        images,
        webpImages,
        avifImages,
        aspectRatio,
    };
}

function transformImagePath(image, { inputDir, outputDir, src, publicPath, srcGenerator, }) {
    return Object.assign(Object.assign({}, image), { path: pathToUrl(image.path, {
            inputDir,
            outputDir,
            src,
            publicPath,
            srcGenerator,
        }) });
}
async function generateComponentAttributes(options) {
    var _a, _b, _c;
    let { src, queue, inputDir, outputDir, webp, avif, widths, quality, skipGeneration, skipPlaceholder, embedPlaceholder, } = options;
    if (!src) {
        throw new Error('Src is required');
    }
    if (!inputDir) {
        throw new Error('Input dir is required');
    }
    if (!outputDir) {
        throw new Error('Output dir is required');
    }
    if (typeof embedPlaceholder === 'undefined') {
        // TODO: change to false with major version
        embedPlaceholder = true;
    }
    queue = queue || new Queue();
    const inputFile = join(inputDir, src);
    const outputDirReal = join(outputDir, dirname(src));
    const [{ images, webpImages, avifImages, aspectRatio }, placeholder, placeholderImages,] = await Promise.all([
        processImage(inputFile, outputDirReal, queue, {
            webp: webp !== null && webp !== void 0 ? webp : true,
            avif: avif !== null && avif !== void 0 ? avif : true,
            widths,
            skipGeneration,
            quality,
        }),
        !skipPlaceholder && embedPlaceholder
            ? createPlaceholder(inputFile, queue)
            : undefined,
        !skipPlaceholder && !embedPlaceholder
            ? processImage(inputFile, outputDirReal, queue, {
                webp: webp !== null && webp !== void 0 ? webp : true,
                avif: avif !== null && avif !== void 0 ? avif : true,
                widths: [PLACEHOLDER_WIDTH],
                skipGeneration,
                quality,
            })
            : undefined,
    ]);
    return getComponentAttributes({
        images: images.map((i) => transformImagePath(i, options)),
        webpImages: webpImages.map((i) => transformImagePath(i, options)),
        avifImages: avifImages.map((i) => transformImagePath(i, options)),
        placeholder,
        aspectRatio,
        placeholderImage: ((_a = placeholderImages === null || placeholderImages === void 0 ? void 0 : placeholderImages.images) === null || _a === void 0 ? void 0 : _a.length)
            ? transformImagePath(placeholderImages.images[0], options)
            : undefined,
        placeholderWebp: ((_b = placeholderImages === null || placeholderImages === void 0 ? void 0 : placeholderImages.webpImages) === null || _b === void 0 ? void 0 : _b.length)
            ? transformImagePath(placeholderImages.webpImages[0], options)
            : undefined,
        placeholderAvif: ((_c = placeholderImages === null || placeholderImages === void 0 ? void 0 : placeholderImages.avifImages) === null || _c === void 0 ? void 0 : _c.length)
            ? transformImagePath(placeholderImages.avifImages[0], options)
            : undefined,
    });
}

function formatAttribute(attribute, value) {
    if (!attribute || !value) {
        return '';
    }
    return value === true ? attribute : `${attribute}="${value}"`;
}

function tryParseInt(val) {
    return val && /^[0-9]+$/.test(val) ? parseInt(val, 10) : undefined;
}

function parseAttributes(element) {
    if (!element) {
        return {};
    }
    const root = parse(element.replace(/[\r\n]+/g, ' '));
    if (!(root === null || root === void 0 ? void 0 : root.firstChild)) {
        return {};
    }
    const node = root.firstChild;
    if (!(node === null || node === void 0 ? void 0 : node.attributes)) {
        return {};
    }
    return Object.entries(node.attributes).reduce((rv, [attr, val]) => {
        rv[attr] = val === '' ? attr : val; // so empty value attributes can be truthy
        return rv;
    }, {});
}

async function processImageElement(element, queue, options) {
    if (!element) {
        return element;
    }
    const attrs = parseAttributes(element);
    const src = attrs['src'];
    if (!src) {
        return element;
    }
    const width = tryParseInt(attrs['width']);
    const quality = tryParseInt(attrs['quality']);
    const immediate = !!attrs['immediate'];
    const newAttrs = await generateComponentAttributes({
        src,
        queue,
        inputDir: options.inputDir,
        outputDir: options.outputDir,
        publicPath: options.publicPath || undefined,
        webp: options.webp,
        avif: options.avif,
        widths: width ? [width] : undefined,
        quality,
        skipPlaceholder: immediate || undefined,
        srcGenerator: options.srcGenerator,
        embedPlaceholder: options.embedPlaceholder,
    });
    const attrString = Object.entries(newAttrs)
        .map(([attr, val]) => formatAttribute(attr, val))
        .join(' ');
    return element.substring(0, 6) + ' ' + attrString + element.substring(6);
}

/**
 * Image processing Svelte preprocessor
 * for the svimg package
 *
 * @param options Image preprocessor options
 * @returns Svelte preprocessor
 */
function imagePreprocessor(options) {
    const queue = new Queue();
    return {
        async markup({ content }) {
            return {
                code: await replaceAsync(content, /<Image[^>]+>/g, (element) => processImageElement(element, queue, options)),
            };
        },
    };
}

/**
 * Image lazy loading Svelte component
 * for the svimg package
 */
class Image extends SvelteComponentTyped {
}

export { Image as default, imagePreprocessor };
