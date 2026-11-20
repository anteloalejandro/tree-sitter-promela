# tree-sitter-promela

TreeSitter grammar for [PROMELA], the language used by the [spin] sortware verification tool.

***WIP: This repo will contain both the tree-sitter grammar for promela, as well as rust bindings, with bindings for another languages (maybe) coming in the future.***

## Building

To build this grammar from source you'll need:
- [`tree-sitter-cli`]
- `nodejs` or any other JavaScript runtime
- A C/C++ compiler

## Known Issues

- The identifiers in the preprocessor don't follow the crazy C identifier syntax as proposed by `tree-sitter-c`, they instead follow the much simpler PROMELA identifier syntax (which should be enough for basically all use cases).
- Macros can be declared in the top level or as steps in the sequence of steps inside module. That is to say, they act basically as statements, but they can't be used before or after `unless`, and they can't be used after a label.
- Macro declarations don't create and organized tree like in `tree-sitter-c`, the nodes are flattened instead (see the [macros tests](test/corpus/macros.txt)).
- This grammar does not check if the syntax is correct (or not) after the C compiler processes the macros in the source code. 
- `xr` and `xs` can show up in any top level module, although they are only allowed inside `proctype` and `init` blocks. Left it like this because they will be confused with custom types otherwise.

## Contributing

Most all files are generated and updated automatically by the `tree-sitter` CLI, so all you should probably care about is:
- `grammar.js`, which contains the Tree-Sitter grammar.
- `tests/corpus/`, which contains all the test files.

[PROMELA]: https://spinroot.com/spin/Man/Quick.html
[spin]: https://spinroot.com
[`tree-sitter-cli`]: https://github.com/tree-sitter/tree-sitter/tree/master/crates/cli
