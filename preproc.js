// INFO: Helpers to support the C preprocessor syntax.
// NOTE: Based on https://github.com/tree-sitter/tree-sitter-c/blob/b780e47fc780ddc8da13afa35a3f4ed5c157823d/grammar.js

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export const PREC = {
  PAREN_DECLARATOR: -10,
  ASSIGNMENT: -2,
  CONDITIONAL: -1,
  DEFAULT: 0,
  LOGICAL_OR: 1,
  LOGICAL_AND: 2,
  INCLUSIVE_OR: 3,
  EXCLUSIVE_OR: 4,
  BITWISE_AND: 5,
  EQUAL: 6,
  RELATIONAL: 7,
  OFFSETOF: 8,
  SHIFT: 9,
  ADD: 10,
  MULTIPLY: 11,
  CAST: 12,
  SIZEOF: 13,
  UNARY: 14,
  CALL: 15,
  FIELD: 16,
  SUBSCRIPT: 17,
};

/**
 * @type {Grammar<string>["rules"]}
 */
export const rules = {
  // NOTE: We won't use this in to simplify the grammar.
  // identifier: _ =>
  //   // @ts-ignore
  //   /(\p{XID_Start}|\$|_|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})(\p{XID_Continue}|\$|\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{8})*/,

  preproc_string_literal: $ => seq(
    choice('L"', 'u"', 'U"', 'u8"', '"'),
    repeat(choice(
      alias(token.immediate(prec(1, /[^\\"\n]+/)), $.string_content),
      $.preproc_escape_sequence,
    )),
    '"',
  ),
  preproc_escape_sequence: _ => token(prec(1, seq(
    '\\',
    choice(
      /[^xuU]/,
      /\d{2,3}/,
      /x[0-9a-fA-F]{1,4}/,
      /u[0-9a-fA-F]{4}/,
      /U[0-9a-fA-F]{8}/,
    ),
  ))),

  preproc_number_literal: _ => {
    const separator = '\'';
    const hex = /[0-9a-fA-F]/;
    const decimal = /[0-9]/;
    const hexDigits = seq(repeat1(hex), repeat(seq(separator, repeat1(hex))));
    const decimalDigits = seq(repeat1(decimal), repeat(seq(separator, repeat1(decimal))));
    return token(seq(
      optional(/[-\+]/),
      optional(choice(/0[xX]/, /0[bB]/)),
      choice(
        seq(
          choice(
            decimalDigits,
            seq(/0[bB]/, decimalDigits),
            seq(/0[xX]/, hexDigits),
          ),
          optional(seq('.', optional(hexDigits))),
        ),
        seq('.', decimalDigits),
      ),
      optional(seq(
        /[eEpP]/,
        optional(seq(
          optional(/[-\+]/),
          hexDigits,
        )),
      )),
      /[uUlLwWfFbBdD]*/,
    ));
  },

  preproc_char_literal: $ => seq(
    choice('L\'', 'u\'', 'U\'', 'u8\'', '\''),
    repeat1(choice(
      $.preproc_escape_sequence,
      alias(token.immediate(/[^\n']/), $.character),
    )),
    '\'',
  ),

  preproc_system_lib_string: _ => token(seq(
    '<',
    repeat(choice(/[^>\n]/, '\\>')),
    '>',
  )),

  preproc_include: $ => seq(
    preprocessor('include'),
    field('path', choice(
      $.preproc_string_literal,
      $.preproc_system_lib_string,
      $.identifier,
      $.preproc_call_expression,
    )),
    token.immediate(/\r?\n/),
  ),

  preproc_def: $ => seq(
    preprocessor('define'),
    field('name', $.identifier),
    field('value', optional($.preproc_arg)),
    token.immediate(/\r?\n/),
  ),

  preproc_function_def: $ => seq(
    preprocessor('define'),
    field('name', $.identifier),
    field('parameters', $.preproc_params),
    field('value', optional($.preproc_arg)),
    token.immediate(/\r?\n/),
  ),

  preproc_params: $ => seq(
    token.immediate('('), commaSep(choice($.identifier, '...')), ')',
  ),

  preproc_call: $ => seq(
    field('directive', $.preproc_directive),
    field('argument', optional($.preproc_arg)),
    token.immediate(/\r?\n/),
  ),

  preproc_undef: $ => seq(
    preprocessor('undef'),
    field('name', $.identifier),
    token.immediate(/\r?\n/),
  ),
  preproc_if: $ => seq(
    preprocessor("if"),
    field("condition", $._preproc_expression),
    token.immediate(/\r?\n/),
  ),
  preproc_elif: $ => seq(
    preprocessor("elif"),
    field("condition", $._preproc_expression),
    token.immediate(/\r?\n/),
  ),
  preproc_else: _ => seq(
    preprocessor("else"),
    token.immediate(/\r?\n/),
  ),
  preproc_endif: _ => seq(
    preprocessor("endif"),
    token.immediate(/\r?\n/),
  ),

  preproc_ifdef: $ => seq(
    choice(preprocessor("ifdef"), preprocessor("ifndef")),
    field("name", $.identifier),
    token.immediate(/\r?\n/),
  ),

  preproc_elifdef: $ => seq(
    choice(preprocessor("elifdef"), preprocessor("elifndef")),
    field("name", $.identifier),
    token.immediate(/\r?\n/),
  ),
  preproc_arg: _ => token(prec(-1, /\S([^/\n]|\/[^*]|\\\r?\n)*/)),
  preproc_directive: _ => /#[ \t]*[a-zA-Z0-9]\w*/,

  _preproc_expression: $ => choice(
    $.identifier,
    $.preproc_call_expression,
    $.preproc_number_literal,
    $.preproc_char_literal,
    $.preproc_defined,
    $.preproc_unary_expression,
    $.preproc_binary_expression,
    $.preproc_parenthesized_expression,
  ),

  preproc_parenthesized_expression: $ => seq(
    '(',
    $._preproc_expression,
    ')',
  ),

  preproc_defined: $ => choice(
    prec(PREC.CALL, seq('defined', '(', $.identifier, ')')),
    seq('defined', $.identifier),
  ),

  preproc_unary_expression: $ => prec.left(PREC.UNARY, seq(
    field('operator', choice('!', '~', '-', '+')),
    field('argument', $._preproc_expression),
  )),

  preproc_call_expression: $ => prec(PREC.CALL, seq(
    field('function', $.identifier),
    field('arguments', $.preproc_argument_list),
  )),

  preproc_argument_list: $ => seq(
    '(',
    commaSep($._preproc_expression),
    ')',
  ),

  preproc_binary_expression: $ => {
    const table = [
      ['+', PREC.ADD],
      ['-', PREC.ADD],
      ['*', PREC.MULTIPLY],
      ['/', PREC.MULTIPLY],
      ['%', PREC.MULTIPLY],
      ['||', PREC.LOGICAL_OR],
      ['&&', PREC.LOGICAL_AND],
      ['|', PREC.INCLUSIVE_OR],
      ['^', PREC.EXCLUSIVE_OR],
      ['&', PREC.BITWISE_AND],
      ['==', PREC.EQUAL],
      ['!=', PREC.EQUAL],
      ['>', PREC.RELATIONAL],
      ['>=', PREC.RELATIONAL],
      ['<=', PREC.RELATIONAL],
      ['<', PREC.RELATIONAL],
      ['<<', PREC.SHIFT],
      ['>>', PREC.SHIFT],
    ];

    return choice(...table.map(([operator, precedence]) => {
      return prec.left(precedence, seq(
        field('left', $._preproc_expression),
        // @ts-ignore
        field('operator', operator),
        field('right', $._preproc_expression),
      ));
    }));
  },
}

/**
 * Creates a preprocessor regex rule
 *
 * @param {RegExp | Rule | string} command
 *
 * @returns {AliasRule}
 */
function preprocessor(command) {
  return alias(new RegExp('#[ \t]*' + command), '#' + command);
}

/**
 * Creates a rule to optionally match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @returns {ChoiceRule}
 */
function commaSep(rule) {
  return optional(commaSep1(rule));
}

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {Rule} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)));
}
