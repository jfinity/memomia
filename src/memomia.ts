const validateKey = key => {
  if (key === "" || /\/|\./.test(key)) {
    throw new Error("Invalid memomia key: " + key);
  }
  return key;
};

const eqArray = ({ input }) => {
  if (this === input) {
    return true;
  } else if (this.length !== input.length) {
    return false;
  } else {
    for (let at = 0; at <= input.length; at += 1) {
      if (this[at] !== input[at]) {
        return false;
      }
    }
    return true;
  }
};

const tagObject = kvps => {
  if (!Array.isArray(kvps) || kvps.length === 0 || !Array.isArray(kvps[0])) {
    throw new Error("Unexpected memomia OBJ arguments");
  }

  const value = {};
  const texts = kvps[0];

  for (let idx = 1; idx < kvps.length; idx += 1) {
    const raw = texts[idx - 1];
    const next = texts[idx];

    if (/\s*,(.|\n)*:\s*/.test(raw)) {
      value[raw.slice(1 + raw.indexOf(","), raw.lastIndexOf(":"))] = kvps[idx];
      continue;
    } else if (/\s*,\s*\.\.\.\s*/.test(raw)) {
      Object.assign(value, kvps[idx]);
      continue;
    } else if (/\s*,\s*/.test(raw)) {
      idx += 1;
      if (/\s*:\s*/.test(next) && idx < kvps.length) {
        value[kvps[idx - 1]] = kvps[idx];
        continue;
      }
    }

    throw new Error("Malformed memomia OBJ template");
  }

  return value;
};

const performExecution = args => {
  const first = Array.isArray(args) && args.length > 0 ? args[0] : undefined;

  switch (typeof first) {
    default:
    case "undefined": {
      throw new Error("Malformed memomia EXE");
    }
    case "symbol":
    case "string": {
      if (args.length < 2 || args[1] === null || args[1] === undefined) {
        throw new Error("Incomplete memomia EXE");
      }
      args[0] = args[1][first];
    }
    case "function": {
      if (typeof args[0] !== "function") {
        throw new Error("Erronious memomia EXE");
      }
      const result = Function.call.apply(Function.call, args);
      args[0] = first;
      return result;
    }
  }
};

const wrapFunction = (lambda, path, stack) => function() {
  const count = stack.push(path) - 1;
  const result = lambda.apply(this, arguments);

  // TODO: consider a proper try/catch/finally
  while (stack.length > count) {
    stack.pop();
  }

  return result;
};

const evict = (caches, marking, stamp) => {
  // TODO: consider integrating "time" into eviction policy
  let index = 0;
  let offset = 0;
  const inner = [];
  const outer = [""].slice(0, 0);

  const recent = value => value.marking === marking;
  const filter = (notes, size, memos) => {
    const value = notes.filter(recent);
    if (value.length === 0) {
      inner[index++] = size;
    } else if (value.length < notes.length) {
      memos.set(size, value);
    }
    return value;
  };

  caches.forEach((memos, path) => {
    index = 0;
    memos.forEach(filter);
    for (let at = 0; at < index; at += 1) {
      memos.delete(inner[at]);
    }
    if (memos.size === 0) {
      outer[offset++] = path;
    }
  });

  for (let at = 0; at < offset; at += 1) {
    caches.delete(outer[at]);
  }
};

const engine = options => {
  const { autoMemoReturnedArray = false } = options;

  let marking = 1;
  const remark = () => {
    marking = (0 | marking) + 1 || 1;
  };

  const stack = [""];
  const getPath = key => {
    const value = stack[stack.length - 1];
    return value + validateKey(key) + "/";
  };

  const arr = {
    path: "",
    caches: new Map(),
    fn: (...elems) => {
      const memos =
        arr.caches.get(arr.path) ||
        arr.caches.set(arr.path, new Map()).get(arr.path);
      const notes =
        memos.get(elems.length) ||
        memos.set(elems.length, []).get(elems.length);
      const idx = notes.findIndex(eqArray, elems);

      if (idx < 0) {
        const output = elems;
        const result = { input: elems, output, marking, stamp: Date.now() };
        notes.push(result);
        return output;
      } else {
        const result = notes[idx];
        result.marking = marking;
        result.stamp = Date.now();
        return result.output;
      }
    }
  };
  const ARR = key => {
    const path = getPath(key.toString());
    arr.path = path;
    return arr.fn;
  };

  const obj = {
    path: "",
    caches: new Map(),
    fn: (...kvps) => {
      const memos =
        obj.caches.get(obj.path) ||
        obj.caches.set(obj.path, new Map()).get(obj.path);
      const notes =
        memos.get(kvps.length) || memos.set(kvps.length, []).get(kvps.length);
      const idx = notes.findIndex(eqArray, kvps);

      if (idx < 0) {
        const output = tagObject(kvps);
        const result = { input: kvps, output, marking, stamp: Date.now() };
        notes.push(result);
        return output;
      } else {
        const result = notes[idx];
        result.marking = marking;
        result.stamp = Date.now();
        return result.output;
      }
    }
  };
  const OBJ = key => {
    const path = getPath(key.toString());
    obj.path = path;
    return obj.fn;
  };

  const exe = {
    path: "",
    caches: new Map(),
    fn: (...args) => {
      const memos =
        exe.caches.get(exe.path) ||
        exe.caches.set(exe.path, new Map()).get(exe.path);
      const notes =
        memos.get(args.length) || memos.set(args.length, []).get(args.length);
      const idx = notes.findIndex(eqArray, args);

      if (idx < 0) {
        const temp = performExecution(args);
        const output =
          autoMemoReturnedArray && Array.isArray(temp)
            ? ARR(exe.path)(...temp) // better ergonmics for [].map(() => {})
            : temp;
        const result = { input: args, output, marking, stamp: Date.now() };
        notes.push(result);
        return output;
      } else {
        const result = notes[idx];
        result.marking = marking;
        result.stamp = Date.now();
        return result.output;
      }
    }
  };
  const EXE = key => {
    const path = getPath(key.toString());
    exe.path = path;
    return exe.fn;
  };

  const fun = {
    path: "",
    caches: new Map(),
    fn: (...deps) => {
      // TODO: address "circular" dependencies between functions
      // (may require handling "mutation")
      const lambda = deps.length > 0 ? deps[0] : undefined;
      const memos =
        fun.caches.get(fun.path) ||
        fun.caches.set(fun.path, new Map()).get(fun.path);
      const notes =
        memos.get(deps.length) || memos.set(deps.length, []).get(deps.length);
      deps[0] = null;
      const idx = notes.findIndex(eqArray, deps);

      if (idx < 0) {
        const output = wrapFunction(lambda, fun.path, stack);
        const result = { input: deps, output, marking, stamp: Date.now() };
        notes.push(result);
        return output;
      } else {
        const result = notes[idx];
        result.marking = marking;
        result.stamp = Date.now();
        return result.output;
      }
    }
  };
  const FUN = key => {
    const path = getPath(key.toString());
    fun.path = path;
    return fun.fn;
  };

  // TODO: consider implementing support for NEW

  const sweep = () => {
    const stamp = Date.now();

    evict(arr.caches, marking, stamp);
    evict(obj.caches, marking, stamp);
    evict(exe.caches, marking, stamp);
    evict(fun.caches, marking, stamp);
  };

  return { remark, sweep, marks: { ARR, OBJ, EXE, FUN } };
};

export const memomia = init => options => {
  const { remark, sweep, marks } = engine(options || {});
  const fn = init(marks);

  // TODO: consider handling `this`
  return (...args) => {
    remark();

    const value = fn(...args);

    sweep(); // TODO: consider "incremental" GC with generators

    return value;
  };
};
