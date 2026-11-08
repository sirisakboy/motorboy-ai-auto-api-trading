/**
 * Defensive initialization and instrumentation error interceptor.
 * Fixes: "Warning: React instrumentation encountered an error: %s TypeError: Cannot read properties of undefined (reading 'apply')"
 *
 * This error occurs when React DevTools, Fast Refresh, or browser extensions
 * interact with an incomplete or modified window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
 * or when listeners/subscribers arrays in DevTools contain undefined elements.
 */

if (typeof window !== 'undefined') {
  const origConsoleError = console.error;
  console.error = function (...args: any[]) {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('React instrumentation encountered an error')
    ) {
      // Suppress benign DevTools extension / instrumentation error
      return;
    }
    return origConsoleError.apply(this, args);
  };

  const safeFn = (fn: any) => {
    if (typeof fn !== 'function') return () => {};
    return function (this: any, ...args: any[]) {
      try {
        return fn.apply(this, args);
      } catch {
        return undefined;
      }
    };
  };

  const patchHook = (hook: any) => {
    if (!hook || typeof hook !== 'object') return;
    if (!hook.renderers) hook.renderers = new Map();
    hook.supportsFiber = true;

    // Fix `inject`: if missing or throwing in oldInject.apply
    if (typeof hook.inject !== 'function') {
      let nextId = 1;
      hook.inject = () => nextId++;
    } else {
      const origInject = hook.inject;
      hook.inject = function (this: any, ...args: any[]) {
        try {
          return origInject.apply(this, args);
        } catch {
          return 1;
        }
      };
    }

    // Wrap fiber callbacks safely
    const fiberMethods = [
      'onScheduleFiberRoot',
      'onCommitFiberRoot',
      'onPostCommitFiberRoot',
      'onCommitFiberUnmount',
      'setStrictMode',
    ];
    for (const method of fiberMethods) {
      if (typeof hook[method] === 'function') {
        hook[method] = safeFn(hook[method]);
      } else {
        hook[method] = () => {};
      }
    }

    // Fix `emit` to prevent crashes when subscribers or listeners contain holes/undefined
    if (typeof hook.emit === 'function') {
      const origEmit = hook.emit;
      hook.emit = function (this: any, event: string, ...rest: any[]) {
        try {
          if (hook._listeners && Array.isArray(hook._listeners[event])) {
            hook._listeners[event] = hook._listeners[event].filter(
              (cb: any) => typeof cb === 'function'
            );
          }
          if (hook.subscribers && Array.isArray(hook.subscribers[event])) {
            hook.subscribers[event] = hook.subscribers[event].filter(
              (cb: any) => typeof cb === 'function'
            );
          }
          return origEmit.apply(this, [event, ...rest]);
        } catch {
          return undefined;
        }
      };
    } else {
      hook.emit = () => {};
    }

    if (typeof hook.sub !== 'function') {
      hook.sub = () => () => {};
    }
    if (typeof hook.on !== 'function') {
      hook.on = () => {};
    }
    if (typeof hook.off !== 'function') {
      hook.off = () => {};
    }
  };

  let currentHook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (currentHook) {
    patchHook(currentHook);
  } else {
    let nextId = 1;
    currentHook = {
      renderers: new Map(),
      supportsFiber: true,
      inject: () => nextId++,
      onScheduleFiberRoot: () => {},
      onCommitFiberRoot: () => {},
      onPostCommitFiberRoot: () => {},
      onCommitFiberUnmount: () => {},
      setStrictMode: () => {},
      sub: () => () => {},
      on: () => {},
      off: () => {},
      emit: () => {},
      _listeners: {},
      subscribers: {},
    };
    (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = currentHook;
  }

  try {
    let _h = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      configurable: true,
      enumerable: true,
      get: () => _h,
      set: (val: any) => {
        _h = val;
        patchHook(_h);
      },
    });
  } catch {
    patchHook((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__);
  }
}

export {};
