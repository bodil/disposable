import { expect, expectTypeOf, test } from "vitest";
import "@bodil/monkey-business";

import { DisposableContext, eventListener } from ".";

test("DisposableContext", () => {
    const c = new DisposableContext();
    const state = ["foo", "bar", "baz"];
    c.use(() => state.remove("foo"));
    c.use(() => state.remove("baz"));

    // check that all disposables run
    expect(state).toEqual(["foo", "bar", "baz"]);
    c.dispose();
    expect(state).toEqual(["bar"]);

    // check that disposables don't run twice
    state.unshift("foo");
    state.push("baz");
    c.dispose();
    expect(state).toEqual(["foo", "bar", "baz"]);

    // check that we can reuse the context
    c.use(() => state.remove("bar"));
    c.dispose();
    expect(state).toEqual(["foo", "baz"]);
});

test("eventListener typing", () => {
    type FooEventMap = { frob: CloseEvent };
    class Foo extends EventTarget {
        __events!: FooEventMap;
    }
    const foo = new Foo();
    eventListener(foo, "frob", (e) => expectTypeOf(e).toMatchTypeOf<CloseEvent>());

    // `window` isn't defined in the test environment, so we don't want to run
    // this, just type check it.
    () => eventListener(window, "dblclick", (e) => expectTypeOf(e).toMatchTypeOf<MouseEvent>());

    class Bar extends EventTarget {}
    const bar = new Bar();
    eventListener(bar, "welp", (e) => expectTypeOf(e).toMatchTypeOf<Event>());
});
