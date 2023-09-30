(function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function attribute_to_object(attributes) {
        const result = {};
        for (const attribute of attributes) {
            result[attribute.name] = attribute.value;
        }
        return result;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    let SvelteElement;
    if (typeof HTMLElement === 'function') {
        SvelteElement = class extends HTMLElement {
            constructor() {
                super();
                this.attachShadow({ mode: 'open' });
            }
            connectedCallback() {
                const { on_mount } = this.$$;
                this.$$.on_disconnect = on_mount.map(run).filter(is_function);
                // @ts-ignore todo: improve typings
                for (const key in this.$$.slotted) {
                    // @ts-ignore todo: improve typings
                    this.appendChild(this.$$.slotted[key]);
                }
            }
            attributeChangedCallback(attr, _oldValue, newValue) {
                this[attr] = newValue;
            }
            disconnectedCallback() {
                run_all(this.$$.on_disconnect);
            }
            $destroy() {
                destroy_component(this, 1);
                this.$destroy = noop;
            }
            $on(type, callback) {
                // TODO should this delegate to addEventListener?
                if (!is_function(callback)) {
                    return noop;
                }
                const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
                callbacks.push(callback);
                return () => {
                    const index = callbacks.indexOf(callback);
                    if (index !== -1)
                        callbacks.splice(index, 1);
                };
            }
            $set($$props) {
                if (this.$$set && !is_empty($$props)) {
                    this.$$.skip_bound = true;
                    this.$$set($$props);
                    this.$$.skip_bound = false;
                }
            }
        };
    }

    /* src/Image.svelte generated by Svelte v3.55.0 */

    function create_if_block_5(ctx) {
    	let source;
    	let source_srcset_value;

    	return {
    		c() {
    			source = element("source");
    			attr(source, "type", "image/avif");

    			attr(source, "srcset", source_srcset_value = /*setSrcset*/ ctx[21]
    			? /*srcsetavif*/ ctx[4]
    			: undefined);

    			attr(source, "sizes", /*sizes*/ ctx[14]);
    		},
    		m(target, anchor) {
    			insert(target, source, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*setSrcset, srcsetavif*/ 2097168 && source_srcset_value !== (source_srcset_value = /*setSrcset*/ ctx[21]
    			? /*srcsetavif*/ ctx[4]
    			: undefined)) {
    				attr(source, "srcset", source_srcset_value);
    			}

    			if (dirty[0] & /*sizes*/ 16384) {
    				attr(source, "sizes", /*sizes*/ ctx[14]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(source);
    		}
    	};
    }

    // (147:4) {#if srcsetwebp}
    function create_if_block_4(ctx) {
    	let source;
    	let source_srcset_value;

    	return {
    		c() {
    			source = element("source");
    			attr(source, "type", "image/webp");

    			attr(source, "srcset", source_srcset_value = /*setSrcset*/ ctx[21]
    			? /*srcsetwebp*/ ctx[3]
    			: undefined);

    			attr(source, "sizes", /*sizes*/ ctx[14]);
    		},
    		m(target, anchor) {
    			insert(target, source, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*setSrcset, srcsetwebp*/ 2097160 && source_srcset_value !== (source_srcset_value = /*setSrcset*/ ctx[21]
    			? /*srcsetwebp*/ ctx[3]
    			: undefined)) {
    				attr(source, "srcset", source_srcset_value);
    			}

    			if (dirty[0] & /*sizes*/ 16384) {
    				attr(source, "sizes", /*sizes*/ ctx[14]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(source);
    		}
    	};
    }

    // (166:2) {#if !immediate && !hidePlaceholder}
    function create_if_block(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*placeholdersrc*/ ctx[6]) return create_if_block_1;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	return {
    		c() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if_block.m(target, anchor);
    			insert(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (179:4) {:else}
    function create_else_block(ctx) {
    	let img;
    	let img_src_value;
    	let img_style_value;

    	return {
    		c() {
    			img = element("img");
    			attr(img, "class", "placeholder");
    			if (!src_url_equal(img.src, img_src_value = /*placeholder*/ ctx[5])) attr(img, "src", img_src_value);
    			attr(img, "alt", /*alt*/ ctx[0]);
    			attr(img, "width", /*imageWidth*/ ctx[15]);
    			attr(img, "height", /*imageHeight*/ ctx[22]);

    			attr(img, "style", img_style_value = /*useAspectRatioFallback*/ ctx[20]
    			? `width:${/*imageWidth*/ ctx[15]}px; height:${/*imageHeight*/ ctx[22]}px;`
    			: '');
    		},
    		m(target, anchor) {
    			insert(target, img, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*placeholder*/ 32 && !src_url_equal(img.src, img_src_value = /*placeholder*/ ctx[5])) {
    				attr(img, "src", img_src_value);
    			}

    			if (dirty[0] & /*alt*/ 1) {
    				attr(img, "alt", /*alt*/ ctx[0]);
    			}

    			if (dirty[0] & /*imageWidth*/ 32768) {
    				attr(img, "width", /*imageWidth*/ ctx[15]);
    			}

    			if (dirty[0] & /*imageHeight*/ 4194304) {
    				attr(img, "height", /*imageHeight*/ ctx[22]);
    			}

    			if (dirty[0] & /*useAspectRatioFallback, imageWidth, imageHeight*/ 5275648 && img_style_value !== (img_style_value = /*useAspectRatioFallback*/ ctx[20]
    			? `width:${/*imageWidth*/ ctx[15]}px; height:${/*imageHeight*/ ctx[22]}px;`
    			: '')) {
    				attr(img, "style", img_style_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(img);
    		}
    	};
    }

    // (167:4) {#if placeholdersrc}
    function create_if_block_1(ctx) {
    	let picture;
    	let t0;
    	let t1;
    	let img;
    	let img_style_value;
    	let if_block0 = /*placeholderavif*/ ctx[8] && create_if_block_3(ctx);
    	let if_block1 = /*placeholderwebp*/ ctx[7] && create_if_block_2(ctx);

    	return {
    		c() {
    			picture = element("picture");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			img = element("img");
    			attr(img, "class", "placeholder");
    			attr(img, "srcset", /*placeholdersrc*/ ctx[6]);
    			attr(img, "alt", /*alt*/ ctx[0]);
    			attr(img, "width", /*imageWidth*/ ctx[15]);
    			attr(img, "height", /*imageHeight*/ ctx[22]);

    			attr(img, "style", img_style_value = /*useAspectRatioFallback*/ ctx[20]
    			? `width:${/*imageWidth*/ ctx[15]}px; height:${/*imageHeight*/ ctx[22]}px;`
    			: '');
    		},
    		m(target, anchor) {
    			insert(target, picture, anchor);
    			if (if_block0) if_block0.m(picture, null);
    			append(picture, t0);
    			if (if_block1) if_block1.m(picture, null);
    			append(picture, t1);
    			append(picture, img);
    		},
    		p(ctx, dirty) {
    			if (/*placeholderavif*/ ctx[8]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(picture, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*placeholderwebp*/ ctx[7]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(picture, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty[0] & /*placeholdersrc*/ 64) {
    				attr(img, "srcset", /*placeholdersrc*/ ctx[6]);
    			}

    			if (dirty[0] & /*alt*/ 1) {
    				attr(img, "alt", /*alt*/ ctx[0]);
    			}

    			if (dirty[0] & /*imageWidth*/ 32768) {
    				attr(img, "width", /*imageWidth*/ ctx[15]);
    			}

    			if (dirty[0] & /*imageHeight*/ 4194304) {
    				attr(img, "height", /*imageHeight*/ ctx[22]);
    			}

    			if (dirty[0] & /*useAspectRatioFallback, imageWidth, imageHeight*/ 5275648 && img_style_value !== (img_style_value = /*useAspectRatioFallback*/ ctx[20]
    			? `width:${/*imageWidth*/ ctx[15]}px; height:${/*imageHeight*/ ctx[22]}px;`
    			: '')) {
    				attr(img, "style", img_style_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(picture);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    		}
    	};
    }

    // (169:8) {#if placeholderavif}
    function create_if_block_3(ctx) {
    	let source;

    	return {
    		c() {
    			source = element("source");
    			attr(source, "type", "image/avif");
    			attr(source, "srcset", /*placeholderavif*/ ctx[8]);
    		},
    		m(target, anchor) {
    			insert(target, source, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*placeholderavif*/ 256) {
    				attr(source, "srcset", /*placeholderavif*/ ctx[8]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(source);
    		}
    	};
    }

    // (172:8) {#if placeholderwebp}
    function create_if_block_2(ctx) {
    	let source;

    	return {
    		c() {
    			source = element("source");
    			attr(source, "type", "image/webp");
    			attr(source, "srcset", /*placeholderwebp*/ ctx[7]);
    		},
    		m(target, anchor) {
    			insert(target, source, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*placeholderwebp*/ 128) {
    				attr(source, "srcset", /*placeholderwebp*/ ctx[7]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(source);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div;
    	let picture;
    	let t0;
    	let t1;
    	let img;
    	let img_srcset_value;
    	let img_alt_value;
    	let img_loading_value;
    	let img_class_value;
    	let t2;
    	let div_style_value;
    	let div_class_value;
    	let mounted;
    	let dispose;
    	let if_block0 = /*srcsetavif*/ ctx[4] && create_if_block_5(ctx);
    	let if_block1 = /*srcsetwebp*/ ctx[3] && create_if_block_4(ctx);
    	let if_block2 = !/*immediate*/ ctx[11] && !/*hidePlaceholder*/ ctx[19] && create_if_block(ctx);

    	return {
    		c() {
    			div = element("div");
    			picture = element("picture");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			img = element("img");
    			t2 = space();
    			if (if_block2) if_block2.c();
    			this.c = noop;
    			attr(img, "srcset", img_srcset_value = /*setSrcset*/ ctx[21] ? /*srcset*/ ctx[2] : undefined);
    			attr(img, "sizes", /*sizes*/ ctx[14]);

    			attr(img, "alt", img_alt_value = /*imgLoaded*/ ctx[17] || /*imgError*/ ctx[18]
    			? /*alt*/ ctx[0]
    			: undefined);

    			attr(img, "width", /*imageWidth*/ ctx[15]);
    			attr(img, "height", /*imageHeight*/ ctx[22]);
    			attr(img, "loading", img_loading_value = !/*immediate*/ ctx[11] ? 'lazy' : undefined);

    			attr(img, "class", img_class_value = "image " + (/*imgLoaded*/ ctx[17] || /*immediate*/ ctx[11]
    			? 'loaded'
    			: ''));

    			attr(div, "style", div_style_value = "" + ((/*fixedWidth*/ ctx[13]
    			? `max-width:${/*width*/ ctx[9]}px;`
    			: '') + " --svimg-blur:" + /*blur*/ ctx[12] + "px; " + (/*aspectratio*/ ctx[10]
    			? `--svimg-aspect-ratio:${/*aspectratio*/ ctx[10]};`
    			: '')));

    			attr(div, "class", div_class_value = "wrapper " + /*className*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, picture);
    			if (if_block0) if_block0.m(picture, null);
    			append(picture, t0);
    			if (if_block1) if_block1.m(picture, null);
    			append(picture, t1);
    			append(picture, img);
    			append(div, t2);
    			if (if_block2) if_block2.m(div, null);
    			/*div_binding*/ ctx[33](div);

    			if (!mounted) {
    				dispose = [
    					listen(img, "load", /*onImgLoad*/ ctx[23]),
    					listen(img, "error", /*error_handler*/ ctx[32])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*srcsetavif*/ ctx[4]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_5(ctx);
    					if_block0.c();
    					if_block0.m(picture, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*srcsetwebp*/ ctx[3]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_4(ctx);
    					if_block1.c();
    					if_block1.m(picture, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty[0] & /*setSrcset, srcset*/ 2097156 && img_srcset_value !== (img_srcset_value = /*setSrcset*/ ctx[21] ? /*srcset*/ ctx[2] : undefined)) {
    				attr(img, "srcset", img_srcset_value);
    			}

    			if (dirty[0] & /*sizes*/ 16384) {
    				attr(img, "sizes", /*sizes*/ ctx[14]);
    			}

    			if (dirty[0] & /*imgLoaded, imgError, alt*/ 393217 && img_alt_value !== (img_alt_value = /*imgLoaded*/ ctx[17] || /*imgError*/ ctx[18]
    			? /*alt*/ ctx[0]
    			: undefined)) {
    				attr(img, "alt", img_alt_value);
    			}

    			if (dirty[0] & /*imageWidth*/ 32768) {
    				attr(img, "width", /*imageWidth*/ ctx[15]);
    			}

    			if (dirty[0] & /*imageHeight*/ 4194304) {
    				attr(img, "height", /*imageHeight*/ ctx[22]);
    			}

    			if (dirty[0] & /*immediate*/ 2048 && img_loading_value !== (img_loading_value = !/*immediate*/ ctx[11] ? 'lazy' : undefined)) {
    				attr(img, "loading", img_loading_value);
    			}

    			if (dirty[0] & /*imgLoaded, immediate*/ 133120 && img_class_value !== (img_class_value = "image " + (/*imgLoaded*/ ctx[17] || /*immediate*/ ctx[11]
    			? 'loaded'
    			: ''))) {
    				attr(img, "class", img_class_value);
    			}

    			if (!/*immediate*/ ctx[11] && !/*hidePlaceholder*/ ctx[19]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block(ctx);
    					if_block2.c();
    					if_block2.m(div, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (dirty[0] & /*fixedWidth, width, blur, aspectratio*/ 13824 && div_style_value !== (div_style_value = "" + ((/*fixedWidth*/ ctx[13]
    			? `max-width:${/*width*/ ctx[9]}px;`
    			: '') + " --svimg-blur:" + /*blur*/ ctx[12] + "px; " + (/*aspectratio*/ ctx[10]
    			? `--svimg-aspect-ratio:${/*aspectratio*/ ctx[10]};`
    			: '')))) {
    				attr(div, "style", div_style_value);
    			}

    			if (dirty[0] & /*className*/ 2 && div_class_value !== (div_class_value = "wrapper " + /*className*/ ctx[1])) {
    				attr(div, "class", div_class_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			/*div_binding*/ ctx[33](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let fixedWidth;
    	let imageWidth;
    	let imageHeight;
    	let sizes;
    	let setSrcset;
    	let useAspectRatioFallback;
    	let { src } = $$props;
    	let { alt } = $$props;
    	let { class: className = '' } = $$props;
    	let { srcset } = $$props;
    	let { srcsetwebp = '' } = $$props;
    	let { srcsetavif = '' } = $$props;
    	let { placeholder = '' } = $$props;
    	let { placeholdersrc = '' } = $$props;
    	let { placeholderwebp = '' } = $$props;
    	let { placeholderavif = '' } = $$props;
    	let { width = '' } = $$props;
    	let { aspectratio } = $$props;
    	let { immediate = false } = $$props;
    	let { blur = 40 } = $$props;
    	let { quality = '' } = $$props;
    	let clientWidth;
    	let intersecting = false;
    	let native = false;
    	let container;
    	let imgLoaded = false;
    	let imgError = false;
    	let hasResizeObserver = true;
    	let hidePlaceholder = false;
    	let supportsCssAspectRatio = true;
    	let mounted = false;

    	function onImgLoad() {
    		$$invalidate(17, imgLoaded = true);

    		if (!immediate) {
    			setTimeout(
    				() => {
    					$$invalidate(19, hidePlaceholder = true);
    				},
    				250
    			); // sync with opacity transition duration
    		}
    	}

    	function initialize() {
    		let ro;

    		if (window.ResizeObserver) {
    			ro = new ResizeObserver(entries => {
    					$$invalidate(26, clientWidth = entries[0].contentRect.width);
    				});

    			ro.observe(container);
    		} else {
    			$$invalidate(29, hasResizeObserver = false);
    		}

    		$$invalidate(30, supportsCssAspectRatio = CSS.supports('aspect-ratio', 'var(--svimg-aspect-ratio)'));
    		$$invalidate(28, native = 'loading' in HTMLImageElement.prototype);

    		if (native || immediate) {
    			return () => {
    				if (ro) {
    					ro.unobserve(container);
    				}
    			};
    		}

    		const io = new IntersectionObserver(entries => {
    				$$invalidate(27, intersecting = entries[0].isIntersecting);

    				if (intersecting) {
    					io.unobserve(container);
    				}
    			},
    		{ rootMargin: `100px` });

    		io.observe(container);

    		return () => {
    			io.unobserve(container);

    			if (ro) {
    				ro.unobserve(container);
    			}
    		};
    	}

    	onMount(async () => {
    		// src attribute must be set after onload to ensure
    		// the onload handler still fires for immediate images
    		$$invalidate(31, mounted = true);

    		if (container) {
    			return initialize();
    		}

    		// older versions of Svelte need to wait for the DOM
    		// to be updated before bind:this references are available
    		await tick();

    		// the component may have been unmounted by this point
    		if (container) {
    			return initialize();
    		}
    	});

    	const error_handler = () => $$invalidate(18, imgError = true);

    	function div_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			container = $$value;
    			$$invalidate(16, container);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('src' in $$props) $$invalidate(24, src = $$props.src);
    		if ('alt' in $$props) $$invalidate(0, alt = $$props.alt);
    		if ('class' in $$props) $$invalidate(1, className = $$props.class);
    		if ('srcset' in $$props) $$invalidate(2, srcset = $$props.srcset);
    		if ('srcsetwebp' in $$props) $$invalidate(3, srcsetwebp = $$props.srcsetwebp);
    		if ('srcsetavif' in $$props) $$invalidate(4, srcsetavif = $$props.srcsetavif);
    		if ('placeholder' in $$props) $$invalidate(5, placeholder = $$props.placeholder);
    		if ('placeholdersrc' in $$props) $$invalidate(6, placeholdersrc = $$props.placeholdersrc);
    		if ('placeholderwebp' in $$props) $$invalidate(7, placeholderwebp = $$props.placeholderwebp);
    		if ('placeholderavif' in $$props) $$invalidate(8, placeholderavif = $$props.placeholderavif);
    		if ('width' in $$props) $$invalidate(9, width = $$props.width);
    		if ('aspectratio' in $$props) $$invalidate(10, aspectratio = $$props.aspectratio);
    		if ('immediate' in $$props) $$invalidate(11, immediate = $$props.immediate);
    		if ('blur' in $$props) $$invalidate(12, blur = $$props.blur);
    		if ('quality' in $$props) $$invalidate(25, quality = $$props.quality);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*width*/ 512) {
    			$$invalidate(13, fixedWidth = !!(width && (/^[0-9]+$/).test(width)));
    		}

    		if ($$self.$$.dirty[0] & /*fixedWidth, clientWidth, width*/ 67117568) {
    			$$invalidate(15, imageWidth = fixedWidth && clientWidth
    			? Math.min(clientWidth, width)
    			: fixedWidth ? width : clientWidth);
    		}

    		if ($$self.$$.dirty[0] & /*imageWidth, aspectratio*/ 33792) {
    			$$invalidate(22, imageHeight = imageWidth / aspectratio);
    		}

    		if ($$self.$$.dirty[0] & /*imageWidth*/ 32768) {
    			$$invalidate(14, sizes = imageWidth ? `${imageWidth}px` : undefined);
    		}

    		if ($$self.$$.dirty[0] & /*intersecting, native, immediate, sizes, hasResizeObserver*/ 939542528 | $$self.$$.dirty[1] & /*mounted*/ 1) {
    			$$invalidate(21, setSrcset = (intersecting || native || immediate) && mounted && (sizes || !hasResizeObserver));
    		}

    		if ($$self.$$.dirty[0] & /*supportsCssAspectRatio, aspectratio, fixedWidth, hasResizeObserver*/ 1610621952) {
    			$$invalidate(20, useAspectRatioFallback = !supportsCssAspectRatio && aspectratio && (fixedWidth || hasResizeObserver));
    		}
    	};

    	return [
    		alt,
    		className,
    		srcset,
    		srcsetwebp,
    		srcsetavif,
    		placeholder,
    		placeholdersrc,
    		placeholderwebp,
    		placeholderavif,
    		width,
    		aspectratio,
    		immediate,
    		blur,
    		fixedWidth,
    		sizes,
    		imageWidth,
    		container,
    		imgLoaded,
    		imgError,
    		hidePlaceholder,
    		useAspectRatioFallback,
    		setSrcset,
    		imageHeight,
    		onImgLoad,
    		src,
    		quality,
    		clientWidth,
    		intersecting,
    		native,
    		hasResizeObserver,
    		supportsCssAspectRatio,
    		mounted,
    		error_handler,
    		div_binding
    	];
    }

    class Image extends SvelteElement {
    	constructor(options) {
    		super();
    		this.shadowRoot.innerHTML = `<style>.wrapper{display:grid;grid:1fr / 1fr;gap:0px;grid-gap:0px;overflow:hidden}.wrapper>*{grid-area:1 / 1 / 2 / 2}.wrapper img{width:100%;height:auto;display:block;aspect-ratio:var(--svimg-aspect-ratio)}.image{opacity:0;transition:opacity 0.25s ease-in}.image.loaded{opacity:1}.placeholder{z-index:-1;filter:blur(var(--svimg-blur))}</style>`;

    		init(
    			this,
    			{
    				target: this.shadowRoot,
    				props: attribute_to_object(this.attributes),
    				customElement: true
    			},
    			instance,
    			create_fragment,
    			safe_not_equal,
    			{
    				src: 24,
    				alt: 0,
    				class: 1,
    				srcset: 2,
    				srcsetwebp: 3,
    				srcsetavif: 4,
    				placeholder: 5,
    				placeholdersrc: 6,
    				placeholderwebp: 7,
    				placeholderavif: 8,
    				width: 9,
    				aspectratio: 10,
    				immediate: 11,
    				blur: 12,
    				quality: 25
    			},
    			null,
    			[-1, -1]
    		);

    		if (options) {
    			if (options.target) {
    				insert(options.target, this, options.anchor);
    			}

    			if (options.props) {
    				this.$set(options.props);
    				flush();
    			}
    		}
    	}

    	static get observedAttributes() {
    		return [
    			"src",
    			"alt",
    			"class",
    			"srcset",
    			"srcsetwebp",
    			"srcsetavif",
    			"placeholder",
    			"placeholdersrc",
    			"placeholderwebp",
    			"placeholderavif",
    			"width",
    			"aspectratio",
    			"immediate",
    			"blur",
    			"quality"
    		];
    	}

    	get src() {
    		return this.$$.ctx[24];
    	}

    	set src(src) {
    		this.$$set({ src });
    		flush();
    	}

    	get alt() {
    		return this.$$.ctx[0];
    	}

    	set alt(alt) {
    		this.$$set({ alt });
    		flush();
    	}

    	get class() {
    		return this.$$.ctx[1];
    	}

    	set class(className) {
    		this.$$set({ class: className });
    		flush();
    	}

    	get srcset() {
    		return this.$$.ctx[2];
    	}

    	set srcset(srcset) {
    		this.$$set({ srcset });
    		flush();
    	}

    	get srcsetwebp() {
    		return this.$$.ctx[3];
    	}

    	set srcsetwebp(srcsetwebp) {
    		this.$$set({ srcsetwebp });
    		flush();
    	}

    	get srcsetavif() {
    		return this.$$.ctx[4];
    	}

    	set srcsetavif(srcsetavif) {
    		this.$$set({ srcsetavif });
    		flush();
    	}

    	get placeholder() {
    		return this.$$.ctx[5];
    	}

    	set placeholder(placeholder) {
    		this.$$set({ placeholder });
    		flush();
    	}

    	get placeholdersrc() {
    		return this.$$.ctx[6];
    	}

    	set placeholdersrc(placeholdersrc) {
    		this.$$set({ placeholdersrc });
    		flush();
    	}

    	get placeholderwebp() {
    		return this.$$.ctx[7];
    	}

    	set placeholderwebp(placeholderwebp) {
    		this.$$set({ placeholderwebp });
    		flush();
    	}

    	get placeholderavif() {
    		return this.$$.ctx[8];
    	}

    	set placeholderavif(placeholderavif) {
    		this.$$set({ placeholderavif });
    		flush();
    	}

    	get width() {
    		return this.$$.ctx[9];
    	}

    	set width(width) {
    		this.$$set({ width });
    		flush();
    	}

    	get aspectratio() {
    		return this.$$.ctx[10];
    	}

    	set aspectratio(aspectratio) {
    		this.$$set({ aspectratio });
    		flush();
    	}

    	get immediate() {
    		return this.$$.ctx[11];
    	}

    	set immediate(immediate) {
    		this.$$set({ immediate });
    		flush();
    	}

    	get blur() {
    		return this.$$.ctx[12];
    	}

    	set blur(blur) {
    		this.$$set({ blur });
    		flush();
    	}

    	get quality() {
    		return this.$$.ctx[25];
    	}

    	set quality(quality) {
    		this.$$set({ quality });
    		flush();
    	}
    }

    if (typeof window !== undefined && window.customElements) {
        customElements.define('s-image', Image);
    }

})();
