/**
 * @file Tree-sitter grammar for the Promela language, used by the Spin verification tool.
 * @author Alejandro Antelo <alfasant@protonmail.com>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "promela",

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => "hello"
  }
});
