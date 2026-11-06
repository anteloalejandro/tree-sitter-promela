/**
 * @file Tree-sitter grammar for the Promela language, used by the Spin verification tool.
 * @author Alejandro Antelo <alfasant@protonmail.com>
 * @license MIT
 * @description Based on the formal grammar found in https://spinroot.com/spin/Man/grammar.html
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

/**
 * Creates a list of at least one item (`rule`), sepparated by `sep`.
 * @param {RuleOrLiteral} rule
 * @param {RuleOrLiteral} sep
 * */
function sepList(rule, sep) {
  return seq(rule, repeat(seq(sep, rule)))
}

/**
 * Creates a list of at least one item (`rule`), sepparated by commas.
 * @param {RuleOrLiteral} rule
 * */
function commaList(rule) {
  return sepList(rule, ",")
}

/**
 * Creates a list of at least one item (`rule`), sepparated by semicolons.
 * @param {RuleOrLiteral} rule
 * */
function semicolonList(rule) {
  return sepList(rule, ";")
}

/**
 * Wraps `rule` with the specified `wrapper`
 * @param {RuleOrLiteral} rule
 * @param {RuleOrLiteral} wrapper
 */
function wrap(rule, wrapper) {
  return seq(wrapper, rule, wrapper)
}

export default grammar({
  // TODO: According to the manual:
  // > The statement separator used in this list is the semi-colon ';'.
  // > In most cases the semi-colon can be replaced with a two-character
  // > arrow symbol: '->', without change of meaning.
  // This apparently means that anywhere you can put ";" you can put "->" as well.
  // Maybe it'ts not everywhere, but only within a `sequence`
  // 
  // TODO:
  // Many of the things defined as 'a' 'b' 'c' should actually be defined as
  // 'abc' or the compiler will fail. This is not stated or specified anywhere.

  name: "promela",

  // things to ignore when lexing. must be tokens.
  extras: $ => [
    /\s/,
    $.comment
  ],

  // abstract rules into supertypes we can match against,
  // but don't pollute the syntax tree
  supertypes: $ => [$.module],

  // conflicts: $ => [
  //   [$.sequence],
  // ],

  rules: {
    spec: $ => repeat($.module),

    module: $ => choice(
      $.proctype,
      $.init,
      $.never,
      $.trace,
      $.utype,
      $.mtype,
      $.decl_lst,
    ),

    // root module types
    proctype: $ => seq(
      optional($.active), "proctype", $.name,
      "(", optional($.decl_lst), ")",
      optional($.priority), optional($.enabler),
      "{", $.sequence, "}"
    ),
    init: $ => seq("init", optional($.priority), "{", $.sequence, "}"),
    never: $ => seq("never", "{", $.sequence, "}"),
    trace: $ => seq("trace", "{", $.sequence, "}"),
    utype: $ => seq("typedef", $.name, "{", $.decl_lst, "}"),
    mtype: $ => seq("mtype", optional("="), "{", commaList($.name), "}" ),
    // global vars and chans
    // TODO: should there be an optional ; here?
    decl_lst: $ => prec.left(semicolonList($.one_decl)),

    // declarations
    one_decl: $ => choice(
      seq(optional($.visible), $.typename, commaList($.ivar)),
      seq(optional($.visible), $.unsigned_decl)
    ),
    unsigned_decl: $ => seq(
      "unsigned", $.name, ":", $.const, optional(seq("=", $.any_expr))
    ),
    typename: $ => choice($._primitive_types, $.uname),
    _primitive_types: _ => choice(
      "bit", "bool", "byte", "short", "int", "mtype", "chan"
    ),
    // instantiation
    active: $ => seq("active", "[", optional($.const), "]"),
    // simulation priority
    priority: $ => seq("priority", $.const),
    // execution constraints
    enabler: $ => seq("provided", "(", $.expr, ")"),

    visible: _ => choice("hidden", "show"),

    sequence: $ => semicolonList($.step),

    step: $ => choice(
      seq($.stmnt, optional(seq("unless", $.stmnt))),
      $.decl_lst,
      seq("xr", commaList($.varref)),
      seq("xs", commaList($.varref)),
    ),

    ivar: $ => seq(
      $.name,
      optional(seq("[", $.const, "]")),
      optional(seq("=", choice($.any_expr, $.ch_init))),
    ),

    ch_init: $ => seq("[", $.const, "]", "of", "{", commaList($.typename), "}"),

    // NOTE: Test prec
    varref: $ => prec(1,seq(
      $.name,
      optional(seq("[", $.any_expr, "]")),
      optional(seq(".", $.varref))
    )),

    // NOTE: Test prec
    send: $ => prec(1, choice(
      // normal FIFO send
      seq($.varref, "!", $.send_args),
      // sorted send
      seq($.varref, "!", "!", $.send_args),
    )),

    receive: $ => choice(
      // normal receive
      seq($.varref, "?", $.recv_args),
      // random receive
      seq($.varref, "?", "?", $.recv_args),
      // poll with side effect
      seq($.varref, "?", "<", $.recv_args, ">"),
      seq($.varref, "?", "?", "<", $.recv_args, ">"),
    ),

    poll: $ => choice(
      seq($.varref, "?", "[", $.recv_args, "]"),
      seq($.varref, "?", "?", "[", $.recv_args, "]"),
    ),

    send_args: $ => choice(
      $.arg_lst,
      seq($.any_expr, "(", $.arg_lst, ")")
    ),

    arg_lst: $ => commaList($.any_expr),

    recv_args: $ => choice(
      commaList($.recv_arg),
      seq($.recv_arg, "(", $.recv_args, ")")
    ),

    recv_arg: $ => choice(
      $.varref,
      seq("eval", "(", $.varref, ")"),
      seq(optional("-"), "const")
    ),

    // NOTE: These can't act as expresions, even though spin calls them operators.
    assign: $ => choice(
      // standard assignment
      prec.right(2, seq($.varref, "=", $.any_expr)),
      // increment
      prec.left(2, seq($.varref, "+", "+")),
      // decrement
      prec.left(2, seq($.varref, "-", "-"))
    ),

    stmnt: $ => choice(
      // selection
      seq("if", $.options, "fi"),
      // while-like loops
      seq("do", $.options, "od"),
      // for loops
      seq("for", "(", $.range, ")", "{", $.sequence, "}"),
      // atomic sequence
      seq("atomic", "{", $.sequence, "}"),
      // deterministic atomic
      seq("d_step", "{", $.sequence, "}"),
      // non-deterministic value selection
      seq("select", "(", $.range, ")"),
      // normal sequence
      seq("{", $.sequence, "}"),

      $.send,
      $.receive,
      $.assign,
      "else",
      "break",
      seq("goto", $.name),
      seq($.name, ":", $.stmnt),
      seq("print", "(", $.string, optional(seq(",", $.arg_lst)), ")"),
      seq("assert", $.expr),
      $.expr,

      $._embedded_c
    ),

    // TODO: Inject the C tree-sitter parser into embedded_c blocks
    _embedded_c: $ => choice(
      $.c_code,
      $.c_expr,
      $.c_decl,
      $.c_track,
      $.c_state,
    ),

    range: $ => choice(
      seq($.name, ":", $.any_expr, "..", $.any_expr),
      seq($.name, "in", $.name)
    ),

    options: $ => repeat1(seq(":", ":", $.sequence)),

    // INFO: operator precedence
    // https://en.cppreference.com/c/language/operator_precedence
    _minus_expr: $ => prec.right(12, seq("-", $.expr)),
    _not_expr: $ => prec.right(12, wrap("!", $.expr)),
    _bitewise_not_expr: $ => prec.right(12, wrap("~", $.expr)),

    _mul_expr: $ => prec.left(11, wrap("*", $.expr)),
    _div_expr: $ => prec.left(11, wrap("/", $.expr)),
    _mod_expr: $ => prec.left(11, wrap("%", $.expr)),

    _add_expr: $ => prec.left(10, wrap("+", $.expr)),
    _sub_expr: $ => prec.left(10, wrap("-", $.expr)),

    _left_shift_expr: $ => prec.left(9, wrap("<<", $.expr)),
    _right_shift_expr: $ => prec.left(9, wrap(">>", $.expr)),

    _lt_expr: $ => prec.left(8, wrap("<", $.expr)),
    _le_expr: $ => prec.left(8, wrap("<=", $.expr)),
    _gt_expr: $ => prec.left(8, wrap(">", $.expr)),
    _ge_expr: $ => prec.left(8, wrap(">=", $.expr)),

    _eq_expr: $ => prec.left(7, wrap("==", $.expr)),
    _ne_expr: $ => prec.left(7, wrap("!=", $.expr)),

    _bitwise_and_expr: $ => prec.left(6, wrap("&", $.expr)),
    _bitwise_or_expr: $ => prec.left(5, wrap("|", $.expr)),
    _bitwise_xor_expr: $ => prec.left(4, wrap("^", $.expr)),

    _and_expr: $ => prec.left(3, wrap("&&", $.expr)),
    _or_expr: $ => prec.left(2, wrap("||", $.expr)),

    ternary_conditional: $ => prec.right(1, seq("(", $.expr, "->", $.expr, ":", $.expr, ")")),

    binary_expression: $ => choice(
      $._mul_expr,
      $._div_expr,
      $._mod_expr,
      $._add_expr,
      $._sub_expr,
      $._left_shift_expr,
      $._right_shift_expr,
      $._lt_expr,
      $._le_expr,
      $._gt_expr,
      $._ge_expr,
      $._eq_expr,
      $._ne_expr,
      $._bitwise_and_expr,
      $._bitwise_or_expr,
      $._bitwise_xor_expr,
      $._and_expr,
      $._or_expr,
    ),

    unary_expression: $ => choice(
      $._minus_expr,
      $._not_expr,
      $._bitewise_not_expr,
    ),

    any_expr: $ => choice(
      seq("(", $.any_expr, ")"),
      // TODO: Test precedence
      $.ternary_conditional,
      $.binary_expression,
      $.unary_expression,
      // number of messages in channel
      seq("len", "(", $.varref, ")"),
      $.poll,
      $.varref,
      $.const,
      "timeout",
      "np_", // non-progress system state
      // TODO: we have some "refers to pid" comments here.
      // Should look into it later.
      seq("enabled", "(", $.any_expr, ")"), // refers to a `pid`
      seq("pc_value", "(", $.any_expr, ")"), // refers to a `pid`
      seq($.name, "[", $.any_expr, "]", "@", $.name), // refers to a `pid`
      seq(
        "run", $.name, "(", optional($.arg_lst), ")", optional($.priority)
      ),
      seq($.get_priority, "(", $.expr, ")"), // expr refers to a `pid`
      seq($.set_priority, "(", $.expr, ")"), // first expr refers to a `pid`
    ),

    // these two are defined in the reference as non-terminals,
    // but the production just return their name.
    // Leaving it like that makes the nodes named instead of anonymous,
    // so we are leaving it like that.
    get_priority: _ => "get_priority",
    set_priority: _ => "set_priority",

    expr: $ => prec.left(choice(
      $.any_expr,
      seq("(", $.expr, ")"),
      // TODO: is "cannot be negated" another edge case?
      seq($.chanpoll, "(", $.varref, ")") // cannot be negated
    )),

    chanpoll: _ => choice("full", "empty", "nfull", "nempty"),

    string: $ => seq('"', repeat($._any_ascii_char), '"'),
    _any_ascii_char: _ => /[^"]/,


    uname: $ => $.name,
    // use token to parse as a single token instead of as a sequence of tokens
    name: _ => token(seq(/[a-zA-Z]/, /[a-zA-Z0-9]*/)),
    const: _ => choice("true", "false", "skip", /[0-9]+/),

    comment: _ => token(choice(
      // inline comments
      // regex only matches to the end of the line by default
      seq('//', /.*/),
      // block comments
      seq('/* ', repeat(/.*/), '*/')
    )),

    // TODO: Using _c_block generically for now,
    // but different kinds of embedded C may allow or disallow certain things
    c_code: $ => seq("c_code", $._c_block),
    c_expr: $ => seq("c_expr", $._c_block),
    c_decl: $ => seq("c_decl", $._c_block),
    c_track: $ => seq("c_track", $._c_block),
    c_state: $ => seq("c_state", $._c_block),
    _c_block: $ => seq("{", $._c, "}"),
    _c: _ => /.*/
  }
});
