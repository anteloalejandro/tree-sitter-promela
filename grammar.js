/**
 * @file Tree-sitter grammar for the Promela language, used by the Spin verification tool.
 * @author Alejandro Antelo <alfasant@protonmail.com>
 * @license MIT
 * @description Based on the formal grammar found in https://spinroot.com/spin/Man/grammar.html
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const separator = choice(";", "->")

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
 * Creates a list of at least one item (`rule`),
 * sepparated by semicolon `;` or arrow `->`, promela's statement separators.
 * @param {RuleOrLiteral} rule
 * */
function separatorList(rule) {
  // NOTE: The grammar specifies that statements are only **separated** by the separator,
  // not **terminated**. Nevertheless, using it as a terminator IS allowed in the compiler itself.
  //
  // We give the "optional" terminator a name so consumers can differentiante
  // between it and other separators if they want.
  return seq(sepList(rule, separator), optional(field("terminator", separator)))
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
  // NOTE:
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

  conflicts: $ => [ ],

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
    // NOTE: precedence based on the comma operator in C
    decl_lst: $ => prec.left(separatorList($.one_decl)),

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

    sequence: $ => separatorList($.step),

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

    varref: $ => seq(
      $.name,
      optional($.subscript),
      optional($.member_access)
    ),

    // NOTE: Precedence based on C function calls
    send: $ => prec.left(14, choice(
      // normal FIFO send
      seq($.varref, "!", $.send_args),
      // sorted send
      seq($.varref, "!!", $.send_args),
    )),

    // NOTE: Precedence based on C function calls (not needed here, there is no ambiguity)
    receive: $ => prec.left(14, choice(
      // normal receive
      seq($.varref, "?", $.recv_args),
      // random receive
      seq($.varref, "??", $.recv_args),
      // poll with side effect
      seq($.varref, "?", "<", $.recv_args, ">"),
      seq($.varref, "??", "<", $.recv_args, ">"),
    )),

    // NOTE: Precedence based on C function calls (not needed here, there is no ambiguity)
    poll: $ => prec.left(14, choice(
      seq($.varref, "?", "[", $.recv_args, "]"),
      seq($.varref, "??", "[", $.recv_args, "]"),
    )),

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
      $._eq_assign,
      $._inc_assign,
      $._dec_assign
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
      $.named_stmnt,
      $._print,
      $.expr,

      $._embedded_c
    ),

    // NOTE: precedence based on standard assignment
    named_stmnt: $ => prec.right(1, seq($.name, ":", $.stmnt)),


    // NOTE: In the grammar, PRINT is actually either printf or printm.
    _print: $ => (
      // c-like printf
      seq("printf", "(", $.string, optional(seq(",", $.arg_lst)), ")"),
      // print the name of an mtype constant (mtype x = something; printm(x))
      seq("printm", "(", $.name, ")")
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

    options: $ => repeat1(seq("::", $.sequence)),

    // INFO: operator precedence
    // https://en.cppreference.com/c/language/operator_precedence
    subscript: $ => prec.left(14, seq("[", $.any_expr, "]")),
    member_access: $ => prec.left(14, seq(".", $.varref)),
    _inc_assign: $ => prec.left(14, seq($.varref, "++")),
    _dec_assign: $ => prec.left(14, seq($.varref, "--")),
    _minus_expr: $ => prec.right(13, seq("-", $.any_expr)),
    _not_expr: $ => prec.right(13, wrap("!", $.any_expr)),
    _bitewise_not_expr: $ => prec.right(13, wrap("~", $.any_expr)),

    _mul_expr: $ => prec.left(12, wrap("*", $.any_expr)),
    _div_expr: $ => prec.left(12, wrap("/", $.any_expr)),
    _mod_expr: $ => prec.left(12, wrap("%", $.any_expr)),

    _add_expr: $ => prec.left(11, wrap("+", $.any_expr)),
    _sub_expr: $ => prec.left(11, wrap("-", $.any_expr)),

    _left_shift_expr: $ => prec.left(10, wrap("<<", $.any_expr)),
    _right_shift_expr: $ => prec.left(10, wrap(">>", $.any_expr)),

    _lt_expr: $ => prec.left(9, wrap("<", $.any_expr)),
    _le_expr: $ => prec.left(9, wrap("<=", $.any_expr)),
    _gt_expr: $ => prec.left(9, wrap(">", $.any_expr)),
    _ge_expr: $ => prec.left(9, wrap(">=", $.any_expr)),

    _eq_expr: $ => prec.left(8, wrap("==", $.any_expr)),
    _ne_expr: $ => prec.left(8, wrap("!=", $.any_expr)),

    _bitwise_and_expr: $ => prec.left(7, wrap("&", $.any_expr)),
    _bitwise_or_expr: $ => prec.left(6, wrap("|", $.any_expr)),
    _bitwise_xor_expr: $ => prec.left(5, wrap("^", $.any_expr)),

    // NOTE: These to specifically take an any_expr
    _and_expr: $ => prec.left(4, wrap("&&", $.expr)),
    _or_expr: $ => prec.left(3, wrap("||", $.expr)),

    ternary_conditional: $ => prec.right(2, seq("(", $.any_expr, "->", $.any_expr, ":", $.any_expr, ")")),

    _eq_assign: $ => prec.right(1, seq($.varref, "=", $.any_expr)),

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

    _chanpoll_expr: $ => choice(
      // TODO: is "cannot be negated" another edge case?
      seq($.chanpoll, "(", $.varref, ")"), // cannot be negated
      seq("(", $._chanpoll_expr,")")
    ),

    expr: $ => choice(
      $.any_expr,
      $._chanpoll_expr
    ),

    chanpoll: _ => choice("full", "empty", "nfull", "nempty"),

    string: $ => seq('"', repeat($._any_ascii_char), '"'),
    // NOTE: NOT TRUE, it does allow '"', as long as it is preceded by a '\'
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
      seq('/* ', repeat(/.*?/), '*/')
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
