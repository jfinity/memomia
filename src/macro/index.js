// if you memomize around state that is both mutating and shared (between closures -- not borrowed), you will probably have a bad time...

// import {memomia} from "memomia/macro";
// function __ ($$) {
//   factory = memomia(mmm => function (props) {
//     const { names, arguments: k } = props;
//     arguments2[[{
//     mynam: 0, ...13, "up;": 32, [24]: 234, 0.0: kj, ghj
//     }]];
//     let ghjkj = 0;
//     return [{ name: "placeholder" }].concat(names.map(nm => ({ name: nm, ...props.date, ghjkj, String })));
//   });
// }

//        v v v v v v v v v v v v

// import { memomia } from "memomia";
// function __($$) {
//   factory = memomia(mmm => function (props) {
//     const {
//       names,
//       arguments: k
//     } = props;
//     arguments2[mmm.ARR`2`(mmm.OBJ(1)`
// ,mynam:${0}
// ,...${13}
// ,up;:${32}
// ,${24}:${234}
// ,0:${kj}
// ,ghj:${ghj}
// `)];
//     let ghjkj = 0;
//     return mmm.EXE`8`("concat", mmm.ARR`4`(mmm.OBJ(3)`
// ,name:${"placeholder"}
// `), mmm.EXE`7`("map", names, mmm.FUN`6`(nm => mmm.OBJ(5)`
// ,name:${nm}
// ,...${props.date}
// ,ghjkj:${ghjkj}
// ,String:${String}
// `, props, ghjkj)));
//   });
// }

// if call("map", Array.isArray()), shallow-compare next/prior results
// (alternatively [..._.map(() => {}, [])] would force shallow-compare)

// can I do something similar for object spread?

const { createMacro } = require("babel-plugin-macros");

module.exports.memomia = createMacro(memomia);

function memomia({ references, state, babel, source }) {
  const { types } = babel;

  const keepImports = { keepImports: true };
  const { node: program } = state.file.scope.path;

  for (let idx = 0; idx < program.body.length; idx += 1) {
    if (!types.isImportDeclaration(program.body[idx])) {
      break;
    } else if (program.body[idx].source.value === source) {
      const src = program.body[idx].source;
      src.value = src.value.replace(/[./]macro(\.[tj]sx?)?/, "");
    }
  }

  (references.memomia || []).forEach(refPath => {
    if (!refPath.parentPath.isCallExpression()) {
      throw `(!refPath.parentPath.isCallExpression())`;
    }

    if (refPath.parentPath.get("callee") !== refPath) {
      throw `(!refPath.parentPath.isCallExpression())`;
    }

    if (refPath.parentPath.get("arguments").length !== 1) {
      throw `(refPath.parentPath.get("arguments").length !== 1)`;
    }

    if (!refPath.parentPath.get("arguments")[0].isFunction()) {
      throw `(!refPath.parentPath.get("arguments")[0].isFunction())`;
    }

    const routine = refPath.parentPath.get("arguments")[0];

    if (routine.node.params.length === 0) {
      routine.node.params = [types.identifier("MMM")];
    }

    if (!routine.get("params.0").isIdentifier()) {
      throw `(!routine.get("params.0").isIdentifier())`;
    }

    const nickname = routine.get("params.0").node.name;
    let monotone = 1;

    routine.get("body").traverse(visitor, {
      types,
      nickname,
      allocId: () => monotone++,
      closures: {
        stack: [],
        pushStack() {
          this.stack.push({
            refs: new Set()
          });
          return this;
        },
        popStack(binds) {
          const child = this.stack.pop();
          const { refs } = this.stack[this.stack.length - 1];

          binds.forEach(refs.delete, refs);
          child.refs.forEach(refs.add, refs);

          return this;
        },

        addRef(name) {
          const { refs } = this.stack[this.stack.length - 1];
          refs.add(name);
          return this;
        },
        getRefs() {
          const { refs } = this.stack[this.stack.length - 1];
          return new Set(refs);
        }
      }.pushStack()
    });
  });

  return keepImports;
}

const visitor = {
  // TODO: restrict usage of `this`
  VariableDeclaration(path) {
    if (path.node.kind === "var") {
      throw new Error(`VariableDeclarations must be let or const`);
    }
  },
  ReferencedIdentifier(path) {
    const { closures } = this;

    if (path.node.name === "arguments") {
      throw new Error(`Dynamic arguments forbiden -- prefer ...rest param`);
    }

    if (path.scope.hasOwnBinding(path.node.name)) {
      return;
    }

    if (!path.scope.hasBinding(path.node.name, !!"noGlobals")) {
      return;
    }

    closures.addRef(path.node.name);
  },
  ArrayExpression: {
    exit(path) {
      const { types, nickname, allocId } = this;

      path.skip();
      path.replaceWith(
        types.callExpression(
          types.taggedTemplateExpression(
            types.memberExpression(
              types.identifier(nickname),
              types.identifier("ARR")
            ),
            types.templateLiteral(
              [types.templateElement({ raw: `${allocId()}` }, true)],
              []
            )
          ),
          path.node.elements
        )
      );
    }
  },
  ObjectExpression: {
    exit(path) {
      const { types, nickname, allocId } = this;

      path.skip();
      path.replaceWith(
        types.taggedTemplateExpression(
          types.callExpression(
            types.memberExpression(
              types.identifier(nickname),
              types.identifier("OBJ")
            ),
            [types.numericLiteral(allocId())]
          ),
          types.templateLiteral(
            path
              .get("properties")
              .reduce((result, field) => {
                if (field.isSpreadElement()) {
                  result.push(types.templateElement({ raw: "\n,..." }));
                } else if (field.node.computed) {
                  result.push(types.templateElement({ raw: "\n," }));
                  result.push(types.templateElement({ raw: ":" }));
                } else {
                  result.push(
                    types.templateElement({
                      raw: `\n,${field.node.key.name || field.node.key.value}:`
                    })
                  );
                }
                return result;
              }, [])
              .concat([types.templateElement({ raw: "\n" }, true)]),
            path.get("properties").reduce((result, field) => {
              if (field.isSpreadElement()) {
                result.push(field.node.argument);
              } else if (field.node.computed) {
                result.push(field.node.key);
                result.push(field.node.value);
              } else {
                result.push(
                  field.node.shorthand ? field.node.key : field.node.value
                );
              }
              return result;
            }, [])
          )
        )
      );
    }
  },
  CallExpression: {
    exit(path) {
      const { types, nickname, allocId } = this;

      path.skip();
      path.replaceWith(
        types.callExpression(
          types.taggedTemplateExpression(
            types.memberExpression(
              types.identifier(nickname),
              types.identifier("EXE")
            ),
            types.templateLiteral(
              [types.templateElement({ raw: `${allocId()}` }, true)],
              []
            )
          ),
          [
            !path.get("callee").isMemberExpression()
              ? path.node.callee
              : path.get("callee.property").isIdentifier()
              ? types.stringLiteral(path.node.callee.property.name)
              : path.node.callee.property,
            !path.get("callee").isMemberExpression()
              ? types.unaryExpression(
                  "void",
                  types.unaryExpression("-", types.numericLiteral(0))
                )
              : path.node.callee.object,
            ...path.node.arguments
          ]
        )
      );
    }
  },
  Function: {
    enter() {
      const { closures } = this;
      closures.pushStack();
    },
    exit(path) {
      const { types, nickname, allocId, closures } = this;

      path.skip();
      path.replaceWith(
        types.callExpression(
          types.taggedTemplateExpression(
            types.memberExpression(
              types.identifier(nickname),
              types.identifier("FUN")
            ),
            types.templateLiteral(
              [types.templateElement({ raw: `${allocId()}` }, true)],
              []
            )
          ),
          [path.node].concat(
            [...closures.getRefs()].map(name => types.identifier(name))
          )
        )
      );

      closures.popStack(Object.keys(path.scope.bindings));
    }
  }
};
