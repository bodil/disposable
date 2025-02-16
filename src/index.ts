import type { Milliseconds } from "@bodil/core/date";
import { assert } from "@bodil/core/assert";
import type { Constructor, Unsubscribable } from "type-fest";
import type { ExtractEventMap } from "@bodil/core/event";

// @ts-ignore polyfill Symbol.dispose if missing
Symbol.dispose ??= Symbol.for("Symbol.dispose");

export function isDisposable(value: unknown): value is Disposable {
    try {
        return typeof (value as Disposable)[Symbol.dispose] === "function";
    } catch (_e) {
        return false;
    }
}

export type Disposifiable = (() => void) | Unsubscribable | Disposable;

function extractDisposeFn(value: Disposifiable): () => void {
    if (typeof value === "function") {
        return value;
    }
    if (typeof value === "object") {
        if (typeof (value as Disposable)[Symbol.dispose] === "function") {
            return (value as Disposable)[Symbol.dispose].bind(value);
        }
        if (typeof (value as Unsubscribable).unsubscribe === "function") {
            return (value as Unsubscribable).unsubscribe.bind(value);
        }
    }
    throw new Error("toDisposable(): don't know how to convert given value to disposable");
}

export function toDisposable(value: Disposifiable): Disposable {
    let disposed = false;
    const disposeFn = extractDisposeFn(value);
    return {
        [Symbol.dispose](): void {
            if (!disposed) {
                disposed = true;
                disposeFn();
            }
        },
    };
}

export function eventListener<
    T extends EventTarget,
    M extends ExtractEventMap<T>,
    K extends keyof M & string
>(
    target: T,
    type: K,
    callback: (e: M[K]) => any,
    options?: AddEventListenerOptions | boolean
): Disposable {
    target.addEventListener(type, callback as EventListener, options);
    return toDisposable(() => target.removeEventListener(type, callback as EventListener));
}

export function timeout(fn: () => void, timeout: Milliseconds): Disposable {
    let id: number | null = globalThis.setTimeout(() => {
        id = null;
        disposable[Symbol.dispose]();
        fn();
    }, timeout);
    const disposable = toDisposable(() => {
        if (id !== null) {
            clearTimeout(id);
        }
    });
    return disposable;
}

export function interval(fn: () => void, interval: Milliseconds): Disposable {
    const id = globalThis.setInterval(fn, interval);
    return toDisposable(() => {
        clearInterval(id);
    });
}

export function animationFrame(fn: (time: number) => void): Disposable {
    // @ts-ignore requestAnimationFrame is only available in browser contexts
    let id: number | null = globalThis.requestAnimationFrame((time) => {
        id = null;
        disposable[Symbol.dispose]();
        fn(time);
    });
    const disposable = toDisposable(() => {
        if (id !== null) {
            // @ts-ignore cancelAnimationFrame is only available in browser contexts
            globalThis.cancelAnimationFrame(id);
        }
    });
    return disposable;
}

export class DisposableAbortController implements AbortController, Disposable {
    #controller = new AbortController();

    get signal(): AbortSignal {
        return this.#controller.signal;
    }

    abort(reason?: any): void {
        this.#controller.abort(reason);
        this.#controller = new AbortController();
    }

    [Symbol.dispose](): void {
        this.abort("disposed");
    }
}

export function abortController(): DisposableAbortController {
    return new DisposableAbortController();
}

export class DisposableContext implements Disposable {
    readonly #disposables = new Set<Disposable>();

    dispose = this[Symbol.dispose];
    [Symbol.dispose](): void {
        if (this.#disposables.size === 0) {
            return;
        }
        for (const disposable of this.#disposables) {
            disposable[Symbol.dispose]();
        }
        assert(
            this.#disposables.size === 0,
            "DisposableContext: disposables remaining in context after dispose, this isn't supposed to happen"
        );
    }

    use(disposifiable: null): null;
    use(disposifiable: undefined): undefined;
    use(disposifiable: Disposifiable): Disposable;
    use(disposifiable: Disposifiable | undefined): Disposable | undefined;
    use(disposifiable: Disposifiable | null | undefined): Disposable | null | undefined;
    use(disposifiable: Disposifiable | null | undefined): Disposable | null | undefined {
        if (disposifiable === undefined || disposifiable === null) {
            return disposifiable;
        }
        let disposables: Set<Disposable> | undefined = this.#disposables;
        const dispose = extractDisposeFn(disposifiable);
        const wrappedDisposable = {
            [Symbol.dispose](): void {
                if (disposables?.delete(wrappedDisposable) === true) {
                    dispose();
                }
                disposables = undefined;
            },
        };
        disposables.add(wrappedDisposable);
        return wrappedDisposable;
    }
}

export const AutoDisposable = <C extends Constructor<object>>(superclass: C) =>
    class extends superclass implements Disposable {
        #_context?: DisposableContext = new DisposableContext();

        [Symbol.dispose](): void {
            if (this.#_context !== undefined) {
                this.#_context.dispose();
                this.#_context = undefined;
            }
        }

        use(disposifiable: null): null;
        use(disposifiable: undefined): undefined;
        use(disposifiable: Disposifiable): Disposable;
        use(disposifiable: Disposifiable | undefined): Disposable | undefined;
        use(disposifiable: Disposifiable | null | undefined): Disposable | null | undefined;
        use(disposifiable: Disposifiable | null | undefined): Disposable | null | undefined {
            assert(this.#_context, "AutoDisposable: use() called after dispose");
            return this.#_context.use(disposifiable);
        }
    };
