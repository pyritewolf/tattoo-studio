var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
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
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
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
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
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
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
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
        flushing = false;
        seen_callbacks.clear();
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
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
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
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
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
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
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
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.28.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    const calculations = writable({});

    const parseCoin = number => number.toLocaleString('es-ar', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2});

    /* src/components/Message.svelte generated by Svelte v3.28.0 */

    const { Object: Object_1 } = globals;
    const file$2 = "src/components/Message.svelte";

    function create_fragment$2(ctx) {
    	let div1;
    	let textarea;
    	let t0;
    	let div0;
    	let h2;
    	let t2;
    	let button;
    	let t3;
    	let t4;
    	let p;
    	let t5;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			textarea = element("textarea");
    			t0 = space();
    			div0 = element("div");
    			h2 = element("h2");
    			h2.textContent = "Vista previa";
    			t2 = space();
    			button = element("button");
    			t3 = text(/*copyButtonText*/ ctx[1]);
    			t4 = space();
    			p = element("p");
    			t5 = text(/*parsedValue*/ ctx[2]);
    			attr_dev(textarea, "class", "svelte-1kfnz9h");
    			add_location(textarea, file$2, 50, 2, 1704);
    			add_location(h2, file$2, 52, 4, 1759);
    			attr_dev(button, "type", "button");
    			attr_dev(button, "class", "svelte-1kfnz9h");
    			add_location(button, file$2, 53, 4, 1785);
    			attr_dev(div0, "class", "row svelte-1kfnz9h");
    			add_location(div0, file$2, 51, 2, 1737);
    			add_location(p, file$2, 55, 2, 1860);
    			add_location(div1, file$2, 49, 0, 1696);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, textarea);
    			set_input_value(textarea, /*value*/ ctx[0]);
    			append_dev(div1, t0);
    			append_dev(div1, div0);
    			append_dev(div0, h2);
    			append_dev(div0, t2);
    			append_dev(div0, button);
    			append_dev(button, t3);
    			append_dev(div1, t4);
    			append_dev(div1, p);
    			append_dev(p, t5);

    			if (!mounted) {
    				dispose = [
    					listen_dev(textarea, "input", /*textarea_input_handler*/ ctx[4]),
    					listen_dev(button, "click", /*copy*/ ctx[3], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*value*/ 1) {
    				set_input_value(textarea, /*value*/ ctx[0]);
    			}

    			if (dirty & /*copyButtonText*/ 2) set_data_dev(t3, /*copyButtonText*/ ctx[1]);
    			if (dirty & /*parsedValue*/ 4) set_data_dev(t5, /*parsedValue*/ ctx[2]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $calculations;
    	validate_store(calculations, "calculations");
    	component_subscribe($$self, calculations, $$value => $$invalidate(5, $calculations = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Message", slots, []);
    	let value = `Un tattoo con esas características estaría {{mercadopago}} si abonás con MercadoPago (permite pagar en cuotas, te recomiendo consultar en https://www.mercadopago.com.ar/ayuda/medios-de-pago-cuotas-promociones_264 qué promociones o recargos aplican para tu tarjeta y tu banco); o en efectivo / transferencia se aplicaría un descuento y quedaría en {{efectivo}}`;

    	const mapping = {
    		"{{mercadopago}}": $calculations && parseCoin($calculations.cash * $calculations.digitalPaymentModifier),
    		"{{efectivo}}": $calculations && parseCoin($calculations.cash)
    	};

    	let copyButtonText = "Copiar";

    	const parseMessage = string => {
    		let str = string;

    		Object.keys(mapping).forEach(keyword => {
    			const regex = new RegExp(keyword, "g");
    			str = str.replace(regex, mapping[keyword]);
    		});

    		return str;
    	};

    	const fallbackCopyTextToClipboard = text => {
    		const textArea = document.createElement("textarea");
    		textArea.value = text;

    		// Avoid scrolling to bottom
    		textArea.style.top = "0";

    		textArea.style.left = "0";
    		textArea.style.position = "fixed";
    		document.body.appendChild(textArea);
    		textArea.focus();
    		textArea.select();
    		document.execCommand("copy");
    		document.body.removeChild(textArea);
    	};

    	const copy = async () => {
    		if (!navigator.clipboard) fallbackCopyTextToClipboard(parsedValue); else navigator.clipboard.writeText(parsedValue);
    		$$invalidate(1, copyButtonText = "Copiado! ✨");
    		setTimeout(() => $$invalidate(1, copyButtonText = "Copiar"), 3000);
    	};

    	const writable_props = [];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Message> was created with unknown prop '${key}'`);
    	});

    	function textarea_input_handler() {
    		value = this.value;
    		$$invalidate(0, value);
    	}

    	$$self.$capture_state = () => ({
    		calculations,
    		parseCoin,
    		value,
    		mapping,
    		copyButtonText,
    		parseMessage,
    		fallbackCopyTextToClipboard,
    		copy,
    		$calculations,
    		parsedValue
    	});

    	$$self.$inject_state = $$props => {
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("copyButtonText" in $$props) $$invalidate(1, copyButtonText = $$props.copyButtonText);
    		if ("parsedValue" in $$props) $$invalidate(2, parsedValue = $$props.parsedValue);
    	};

    	let parsedValue;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*value*/ 1) {
    			$$invalidate(2, parsedValue = parseMessage(value));
    		}
    	};

    	return [value, copyButtonText, parsedValue, copy, textarea_input_handler];
    }

    class Message extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Message",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src/components/Calculation.svelte generated by Svelte v3.28.0 */
    const file$1 = "src/components/Calculation.svelte";

    // (21:4) {#if $calculations}
    function create_if_block_3(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			attr_dev(input, "name", "cash");
    			attr_dev(input, "type", "number");
    			attr_dev(input, "class", "svelte-18twaac");
    			add_location(input, file$1, 21, 6, 555);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*$calculations*/ ctx[2].cash);

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*input_input_handler*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$calculations*/ 4 && to_number(input.value) !== /*$calculations*/ ctx[2].cash) {
    				set_input_value(input, /*$calculations*/ ctx[2].cash);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(21:4) {#if $calculations}",
    		ctx
    	});

    	return block;
    }

    // (28:6) {#if $calculations}
    function create_if_block_2(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			attr_dev(input, "name", "cash");
    			attr_dev(input, "type", "number");
    			attr_dev(input, "class", "svelte-18twaac");
    			add_location(input, file$1, 28, 8, 757);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*$calculations*/ ctx[2].digitalPaymentModifier);

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*input_input_handler_1*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*$calculations*/ 4 && to_number(input.value) !== /*$calculations*/ ctx[2].digitalPaymentModifier) {
    				set_input_value(input, /*$calculations*/ ctx[2].digitalPaymentModifier);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(28:6) {#if $calculations}",
    		ctx
    	});

    	return block;
    }

    // (37:6) {#if $calculations}
    function create_if_block_1(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			attr_dev(input, "name", "cash");
    			attr_dev(input, "type", "number");
    			attr_dev(input, "class", "svelte-18twaac");
    			add_location(input, file$1, 37, 8, 1080);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*studioPercentage*/ ctx[0]);

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*input_input_handler_2*/ ctx[7]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*studioPercentage*/ 1 && to_number(input.value) !== /*studioPercentage*/ ctx[0]) {
    				set_input_value(input, /*studioPercentage*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(37:6) {#if $calculations}",
    		ctx
    	});

    	return block;
    }

    // (46:6) {#if $calculations}
    function create_if_block(ctx) {
    	let input;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			attr_dev(input, "name", "cash");
    			attr_dev(input, "type", "number");
    			attr_dev(input, "class", "svelte-18twaac");
    			add_location(input, file$1, 46, 8, 1318);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			set_input_value(input, /*artistPercentage*/ ctx[1]);

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*input_input_handler_3*/ ctx[8]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*artistPercentage*/ 2 && to_number(input.value) !== /*artistPercentage*/ ctx[1]) {
    				set_input_value(input, /*artistPercentage*/ ctx[1]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(46:6) {#if $calculations}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let form;
    	let fieldset0;
    	let label0;
    	let t1;
    	let t2;
    	let fieldset1;
    	let label1;
    	let t4;
    	let div0;
    	let t5;
    	let t6_value = (/*$calculations*/ ctx[2] && parseCoin(/*$calculations*/ ctx[2].digitalPaymentModifier * /*$calculations*/ ctx[2].cash)) + "";
    	let t6;
    	let t7;
    	let fieldset2;
    	let label2;
    	let t9;
    	let div1;
    	let t10;
    	let t11_value = parseCoin(/*studioCut*/ ctx[3]) + "";
    	let t11;
    	let t12;
    	let fieldset3;
    	let label3;
    	let t14;
    	let div2;
    	let t15;
    	let t16_value = parseCoin(/*artistCut*/ ctx[4]) + "";
    	let t16;
    	let if_block0 = /*$calculations*/ ctx[2] && create_if_block_3(ctx);
    	let if_block1 = /*$calculations*/ ctx[2] && create_if_block_2(ctx);
    	let if_block2 = /*$calculations*/ ctx[2] && create_if_block_1(ctx);
    	let if_block3 = /*$calculations*/ ctx[2] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			form = element("form");
    			fieldset0 = element("fieldset");
    			label0 = element("label");
    			label0.textContent = "Efectivo";
    			t1 = space();
    			if (if_block0) if_block0.c();
    			t2 = space();
    			fieldset1 = element("fieldset");
    			label1 = element("label");
    			label1.textContent = "Mercadopago";
    			t4 = space();
    			div0 = element("div");
    			if (if_block1) if_block1.c();
    			t5 = space();
    			t6 = text(t6_value);
    			t7 = space();
    			fieldset2 = element("fieldset");
    			label2 = element("label");
    			label2.textContent = "Estudio";
    			t9 = space();
    			div1 = element("div");
    			if (if_block2) if_block2.c();
    			t10 = space();
    			t11 = text(t11_value);
    			t12 = space();
    			fieldset3 = element("fieldset");
    			label3 = element("label");
    			label3.textContent = "Artista";
    			t14 = space();
    			div2 = element("div");
    			if (if_block3) if_block3.c();
    			t15 = space();
    			t16 = text(t16_value);
    			attr_dev(label0, "for", "cash");
    			attr_dev(label0, "class", "svelte-18twaac");
    			add_location(label0, file$1, 19, 4, 490);
    			attr_dev(fieldset0, "class", "svelte-18twaac");
    			add_location(fieldset0, file$1, 18, 2, 475);
    			attr_dev(label1, "for", "cash");
    			attr_dev(label1, "class", "svelte-18twaac");
    			add_location(label1, file$1, 25, 4, 663);
    			attr_dev(div0, "class", "row svelte-18twaac");
    			add_location(div0, file$1, 26, 4, 705);
    			attr_dev(fieldset1, "class", "svelte-18twaac");
    			add_location(fieldset1, file$1, 24, 2, 648);
    			attr_dev(label2, "for", "cash");
    			attr_dev(label2, "class", "svelte-18twaac");
    			add_location(label2, file$1, 34, 4, 990);
    			attr_dev(div1, "class", "row svelte-18twaac");
    			add_location(div1, file$1, 35, 4, 1028);
    			attr_dev(fieldset2, "class", "svelte-18twaac");
    			add_location(fieldset2, file$1, 33, 2, 975);
    			attr_dev(label3, "for", "cash");
    			attr_dev(label3, "class", "svelte-18twaac");
    			add_location(label3, file$1, 43, 4, 1228);
    			attr_dev(div2, "class", "row svelte-18twaac");
    			add_location(div2, file$1, 44, 4, 1266);
    			attr_dev(fieldset3, "class", "svelte-18twaac");
    			add_location(fieldset3, file$1, 42, 2, 1213);
    			attr_dev(form, "class", "svelte-18twaac");
    			add_location(form, file$1, 17, 0, 466);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, form, anchor);
    			append_dev(form, fieldset0);
    			append_dev(fieldset0, label0);
    			append_dev(fieldset0, t1);
    			if (if_block0) if_block0.m(fieldset0, null);
    			append_dev(form, t2);
    			append_dev(form, fieldset1);
    			append_dev(fieldset1, label1);
    			append_dev(fieldset1, t4);
    			append_dev(fieldset1, div0);
    			if (if_block1) if_block1.m(div0, null);
    			append_dev(div0, t5);
    			append_dev(div0, t6);
    			append_dev(form, t7);
    			append_dev(form, fieldset2);
    			append_dev(fieldset2, label2);
    			append_dev(fieldset2, t9);
    			append_dev(fieldset2, div1);
    			if (if_block2) if_block2.m(div1, null);
    			append_dev(div1, t10);
    			append_dev(div1, t11);
    			append_dev(form, t12);
    			append_dev(form, fieldset3);
    			append_dev(fieldset3, label3);
    			append_dev(fieldset3, t14);
    			append_dev(fieldset3, div2);
    			if (if_block3) if_block3.m(div2, null);
    			append_dev(div2, t15);
    			append_dev(div2, t16);
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*$calculations*/ ctx[2]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					if_block0.m(fieldset0, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*$calculations*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2(ctx);
    					if_block1.c();
    					if_block1.m(div0, t5);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (dirty & /*$calculations*/ 4 && t6_value !== (t6_value = (/*$calculations*/ ctx[2] && parseCoin(/*$calculations*/ ctx[2].digitalPaymentModifier * /*$calculations*/ ctx[2].cash)) + "")) set_data_dev(t6, t6_value);

    			if (/*$calculations*/ ctx[2]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block_1(ctx);
    					if_block2.c();
    					if_block2.m(div1, t10);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (dirty & /*studioCut*/ 8 && t11_value !== (t11_value = parseCoin(/*studioCut*/ ctx[3]) + "")) set_data_dev(t11, t11_value);

    			if (/*$calculations*/ ctx[2]) {
    				if (if_block3) {
    					if_block3.p(ctx, dirty);
    				} else {
    					if_block3 = create_if_block(ctx);
    					if_block3.c();
    					if_block3.m(div2, t15);
    				}
    			} else if (if_block3) {
    				if_block3.d(1);
    				if_block3 = null;
    			}

    			if (dirty & /*artistCut*/ 16 && t16_value !== (t16_value = parseCoin(/*artistCut*/ ctx[4]) + "")) set_data_dev(t16, t16_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(form);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			if (if_block3) if_block3.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let $calculations;
    	validate_store(calculations, "calculations");
    	component_subscribe($$self, calculations, $$value => $$invalidate(2, $calculations = $$value));
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Calculation", slots, []);
    	let studioPercentage = 0.7;
    	let artistPercentage = 0.3;
    	let startingCalc = { cash: 8500, digitalPaymentModifier: 1.1 };
    	calculations.set({ ...$calculations, ...startingCalc });
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Calculation> was created with unknown prop '${key}'`);
    	});

    	function input_input_handler() {
    		$calculations.cash = to_number(this.value);
    		calculations.set($calculations);
    	}

    	function input_input_handler_1() {
    		$calculations.digitalPaymentModifier = to_number(this.value);
    		calculations.set($calculations);
    	}

    	function input_input_handler_2() {
    		studioPercentage = to_number(this.value);
    		$$invalidate(0, studioPercentage);
    	}

    	function input_input_handler_3() {
    		artistPercentage = to_number(this.value);
    		$$invalidate(1, artistPercentage);
    	}

    	$$self.$capture_state = () => ({
    		calculations,
    		parseCoin,
    		studioPercentage,
    		artistPercentage,
    		startingCalc,
    		$calculations,
    		studioCut,
    		artistCut
    	});

    	$$self.$inject_state = $$props => {
    		if ("studioPercentage" in $$props) $$invalidate(0, studioPercentage = $$props.studioPercentage);
    		if ("artistPercentage" in $$props) $$invalidate(1, artistPercentage = $$props.artistPercentage);
    		if ("startingCalc" in $$props) startingCalc = $$props.startingCalc;
    		if ("studioCut" in $$props) $$invalidate(3, studioCut = $$props.studioCut);
    		if ("artistCut" in $$props) $$invalidate(4, artistCut = $$props.artistCut);
    	};

    	let studioCut;
    	let artistCut;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*$calculations, studioPercentage*/ 5) {
    			$$invalidate(3, studioCut = ($calculations && $calculations.cash || 0) * studioPercentage);
    		}

    		if ($$self.$$.dirty & /*$calculations, artistPercentage*/ 6) {
    			$$invalidate(4, artistCut = ($calculations && $calculations.cash || 0) * artistPercentage);
    		}
    	};

    	return [
    		studioPercentage,
    		artistPercentage,
    		$calculations,
    		studioCut,
    		artistCut,
    		input_input_handler,
    		input_input_handler_1,
    		input_input_handler_2,
    		input_input_handler_3
    	];
    }

    class Calculation extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Calculation",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.28.0 */
    const file = "src/App.svelte";

    function create_fragment(ctx) {
    	let main;
    	let calculation;
    	let t;
    	let message;
    	let current;
    	calculation = new Calculation({ $$inline: true });
    	message = new Message({ $$inline: true });

    	const block = {
    		c: function create() {
    			main = element("main");
    			create_component(calculation.$$.fragment);
    			t = space();
    			create_component(message.$$.fragment);
    			attr_dev(main, "class", "svelte-12pyssy");
    			add_location(main, file, 4, 0, 177);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			mount_component(calculation, main, null);
    			append_dev(main, t);
    			mount_component(message, main, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(calculation.$$.fragment, local);
    			transition_in(message.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(calculation.$$.fragment, local);
    			transition_out(message.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(calculation);
    			destroy_component(message);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("App", slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Message, Calculation });
    	return [];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
        target: document.body,
        props: {
            name: 'world'
        }
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
