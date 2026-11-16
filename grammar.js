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
  // TODO: #define macros are not defined in the grammar.
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
  supertypes: $ => [
    $.macro,
    $.embedded_c,
    $.print,
  ],

  conflicts: $ => [ ],

  rules: {
    source_file: $ => repeat($._module),

    _module: $ => choice(
      $.proctype,
      $.init,
      $.never,
      $.trace,
      $.utype,
      $.mtype,
      $._decl_lst,
      // TODO: Macros are only supported on the top level for now
      $.macro
    ),

    // root module types
    proctype: $ => seq(
      optional($.active), "proctype", $.identifier,
      "(", optional($._decl_lst), ")",
      optional($.priority), optional($.enabler),
      "{", $._sequence, "}"
    ),
    init: $ => seq("init", optional($.priority), "{", $._sequence, "}"),
    never: $ => seq("never", "{", $._sequence, "}"),
    trace: $ => seq("trace", "{", $._sequence, "}"),
    utype: $ => seq("typedef", $.identifier, "{", $._decl_lst, "}"),
    mtype: $ => seq("mtype", optional("="), "{", commaList($.identifier), "}" ),
    // global vars and chans
    // NOTE: precedence based on the comma operator in C
    _decl_lst: $ => prec.left(separatorList($.declaration)),

    // declarations
    // previously one_decl
    declaration: $ => choice(
      seq(optional($.visible), $.simple_declaration),
      seq(optional($.visible), $.unsigned_declaration)
    ),
    simple_declaration: $ => seq($.typename, commaList($.variable_declaration)),
    // previously unsigned_decl
    unsigned_declaration: $ => seq(
      "unsigned", $.identifier, ":", $.const, optional(seq("=", $._any_expr))
    ),
    typename: $ => choice($._primitive_types, alias($.identifier, $.uname)),
    _primitive_types: _ => choice(
      "bit", "bool", "byte", "short", "int", "mtype", "chan"
    ),
    // instantiation
    active: $ => seq("active", optional(seq("[", $.const, "]"))),
    // simulation priority
    priority: $ => seq("priority", $.const),
    // execution constraints
    enabler: $ => seq("provided", "(", $._expr, ")"),

    // TODO: Only global variables can be `hidden`, but any variable can be `show`.
    // This means we can't create hidden variables inside a module.
    // Maybe this should be handled in the LSP itself, but we can probably do it here.
    visible: _ => choice("hidden", "show"),

    _sequence: $ => separatorList($._step),

    _step: $ => choice(
      seq($._statement, optional(seq("unless", $._statement))),
      $._decl_lst,
      // TODO: xr and xs can only appear within a proctype.
      seq("xr", commaList($.variable_reference)),
      seq("xs", commaList($.variable_reference)),
    ),

    // previously ivar
    variable_declaration: $ => seq(
      $.identifier,
      optional(seq("[", $.const, "]")),
      optional(seq("=", choice($._any_expr, $.ch_init))),
    ),

    ch_init: $ => seq("[", $.const, "]", "of", "{", commaList($.typename), "}"),

    // previously varref
    variable_reference: $ => seq(
      $.identifier,
      optional($.subscript),
      optional($.member_access)
    ),

    // NOTE: Precedence based on C function calls
    send: $ => prec.left(14, choice(
      // normal FIFO send
      seq($.variable_reference, "!", $.send_args),
      // sorted send
      seq($.variable_reference, "!!", $.send_args),
    )),

    // NOTE: Precedence based on C function calls (not needed here, there is no ambiguity)
    receive: $ => prec.left(14, choice(
      // normal receive
      seq($.variable_reference, "?", $.recv_args),
      // random receive
      seq($.variable_reference, "??", $.recv_args),
      // poll with side effect
      seq($.variable_reference, "?", "<", $.recv_args, ">"),
      seq($.variable_reference, "??", "<", $.recv_args, ">"),
    )),

    // NOTE: Precedence based on C function calls (not needed here, there is no ambiguity)
    poll: $ => prec.left(14, choice(
      seq($.variable_reference, "?", "[", $.recv_args, "]"),
      seq($.variable_reference, "??", "[", $.recv_args, "]"),
    )),

    send_args: $ => choice(
      $.arguments,
      seq($._any_expr, "(", $.arguments, ")")
    ),

    arguments: $ => commaList($._any_expr),

    recv_args: $ => choice(
      commaList($.recv_arg),
      seq($.recv_arg, "(", $.recv_args, ")")
    ),

    recv_arg: $ => choice(
      $.variable_reference,
      seq("eval", "(", $.variable_reference, ")"),
      seq(optional("-"), $.const)
    ),

    // NOTE: These can't act as expresions, even though spin calls them operators.
    assign: $ => choice(
      $._eq_assign,
      $._inc_assign,
      $._dec_assign
    ),

    // previously stmnt
    _statement: $ => choice(
      // selection
      $.if,
      // while-like loops
      $.do,
      // for loops
      $.for,
      // atomic sequence
      $.atomic,
      // deterministic atomic
      $.d_step,
      // non-deterministic value selection
      $.select,
      // normal sequence
      $.block,
      $.send,
      $.receive,
      $.assign,
      // TODO: `else` should only be used inside `if`
      "else",
      // TODO: `break` should only be used inside `do` and `for`
      "break",
      $.goto,
      $.labeled_statement,
      $.print,
      $._expr,

      $.embedded_c
    ),

    if: $ => seq("if", $.options, "fi"),
    do: $ => seq("do", $.options, "od"),
    for: $ => seq("for", "(", $.range, ")", "{", $._sequence, "}"),
    atomic: $ => seq("atomic", "{", $._sequence, "}"),
    d_step: $ => seq("d_step", "{", $._sequence, "}"),
    select: $ => seq("select", "(", $.range, ")"),
    goto: $ => seq("goto", field("label", $.identifier)),
    block: $ => seq("{", $._sequence, "}"),

    // NOTE: precedence based on standard assignment
    // NOTE: The spin compiler allows labels followed by nothing
    labeled_statement: $ => prec.right(1, seq($.identifier, ":", optional($._statement))),


    // NOTE: In the grammar, PRINT is actually either printf or printm.
    print: $ => choice(
      // c-like printf
      $.printf,
      // print the name of an mtype constant (mtype x = something; printm(x))
      $.printm
    ),

    printf: $ => seq("printf", "(", $.string, optional(seq(",", $.arguments)), ")"),
    printm: $ => seq("printm", "(", $.identifier, ")"),

    embedded_c: $ => choice(
      $.c_code,
      $.c_expr,
      $.c_decl,
      $.c_track,
      $.c_state,
    ),

    range: $ => choice(
      seq($.identifier, ":", $._any_expr, "..", $._any_expr),
      seq($.identifier, "in", $.identifier)
    ),

    options: $ => repeat1(seq("::", $._sequence)),

    // INFO: operator precedence
    // https://en.cppreference.com/c/language/operator_precedence
    subscript: $ => prec.left(14, seq("[", $._any_expr, "]")),
    member_access: $ => prec.left(14, seq(".", $.variable_reference)),
    _inc_assign: $ => prec.left(14, seq($.variable_reference, "++")),
    _dec_assign: $ => prec.left(14, seq($.variable_reference, "--")),
    _minus_expr: $ => prec.right(13, seq("-", $._any_expr)),
    _not_expr: $ => prec.right(13, wrap("!", $._any_expr)),
    _bitewise_not_expr: $ => prec.right(13, wrap("~", $._any_expr)),

    _mul_expr: $ => prec.left(12, wrap("*", $._any_expr)),
    _div_expr: $ => prec.left(12, wrap("/", $._any_expr)),
    _mod_expr: $ => prec.left(12, wrap("%", $._any_expr)),

    _add_expr: $ => prec.left(11, wrap("+", $._any_expr)),
    _sub_expr: $ => prec.left(11, wrap("-", $._any_expr)),

    _left_shift_expr: $ => prec.left(10, wrap("<<", $._any_expr)),
    _right_shift_expr: $ => prec.left(10, wrap(">>", $._any_expr)),

    _lt_expr: $ => prec.left(9, wrap("<", $._any_expr)),
    _le_expr: $ => prec.left(9, wrap("<=", $._any_expr)),
    _gt_expr: $ => prec.left(9, wrap(">", $._any_expr)),
    _ge_expr: $ => prec.left(9, wrap(">=", $._any_expr)),

    _eq_expr: $ => prec.left(8, wrap("==", $._any_expr)),
    _ne_expr: $ => prec.left(8, wrap("!=", $._any_expr)),

    _bitwise_and_expr: $ => prec.left(7, wrap("&", $._any_expr)),
    _bitwise_or_expr: $ => prec.left(6, wrap("|", $._any_expr)),
    _bitwise_xor_expr: $ => prec.left(5, wrap("^", $._any_expr)),

    // NOTE: These to specifically take an any_expr
    _and_expr: $ => prec.left(4, wrap("&&", $._expr)),
    _or_expr: $ => prec.left(3, wrap("||", $._expr)),

    ternary_conditional: $ => prec.right(2, seq("(", $._any_expr, "->", $._any_expr, ":", $._any_expr, ")")),

    _eq_assign: $ => prec.right(1, seq($.variable_reference, "=", $._any_expr)),

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

    _any_expr: $ => choice(
      seq("(", $._any_expr, ")"),
      $.ternary_conditional,
      $.binary_expression,
      $.unary_expression,
      // number of messages in channel
      seq("len", "(", $.variable_reference, ")"),
      $.poll,
      $.variable_reference,
      $.const,
      "timeout",
      "np_", // non-progress system state
      // TODO: we have some "refers to pid" comments here.
      // Should look into it later.
      seq("enabled", "(", $._any_expr, ")"), // refers to a `pid`
      seq("pc_value", "(", $._any_expr, ")"), // refers to a `pid`
      seq($.identifier, "[", $._any_expr, "]", "@", $.identifier), // refers to a `pid`
      seq(
        "run", $.identifier, "(", optional($.arguments), ")", optional($.priority)
      ),
      seq($.get_priority, "(", $._expr, ")"), // expr refers to a `pid`
      seq($.set_priority, "(", $._expr, ")"), // first expr refers to a `pid`
    ),

    // these two are defined in the reference as non-terminals,
    // but the production just return their name.
    // Leaving it like that makes the nodes named instead of anonymous,
    // so we are leaving it like that.
    get_priority: _ => "get_priority",
    set_priority: _ => "set_priority",

    _chanpoll_expr: $ => choice(
      // TODO: is "cannot be negated" another edge case?
      seq($.chanpoll, "(", $.variable_reference, ")"), // cannot be negated
      seq("(", $._chanpoll_expr,")")
    ),

    _expr: $ => choice(
      $._any_expr,
      $._chanpoll_expr
    ),

    chanpoll: _ => choice("full", "empty", "nfull", "nempty"),

    string: $ => seq('"', repeat($._any_ascii_char), '"'),
    // NOTE: the spin compiler allows '"', as long as it is preceded by a '\'
    _any_ascii_char: _ => choice(/[^"]/, "\\\""),

    // use token to parse as a single token instead of as a sequence of tokens
    identifier: _ => token(seq(/[a-zA-Z]/, /[a-zA-Z0-9]*/)),
    const: _ => choice("true", "false", "skip", /[0-9]+/),

    comment: _ => token(choice(
      // inline comments
      // regex only matches to the end of the line by default
      seq('//', /.*/),
      // block comments
      seq('/* ', repeat(/.*?/), '*/')
    )),

    c_code: $ => seq("c_code", $.c_block),
    c_expr: $ => seq("c_expr", $.c_block),
    c_decl: $ => seq("c_decl", $.c_block),
    c_track: $ => seq("c_track", $.c_block),
    c_state: $ => seq("c_state", $.c_block),
    c_block: $ => seq("{", optional(alias($._c_lines, $.content)), "}"),
    _c_lines: $ => repeat1(choice(/[^{}]+/, $._c_block)),
    _c_block: $ => seq("{", $._c_lines, "}"),

    macro: $ => choice(
      $.macro_define,
      $.macro_include,
      $.macro_if,
      alias("#else", $.macro_else),
      alias("#endif", $.macro_endif),
      $.macro_ifdef,
      $.macro_ifndef,
      $.macro_undef,
    ),

    macro_define: $ => seq(
      "#define", $.identifier,
      field("macro_args", optional(seq("(", commaList($.identifier), ")"))),
      $._define_body
    ),
    // TODO: We currently don't check for new lines.
    _define_body: $ => sepList($._define_line, "\\"),
    // TODO: This is too basic, should consider supporting varnames at least.
    _define_line: _ => repeat1(/[^\n]/),

    macro_include: $ => seq("#include", $.string),

    // TODO: Using any_expr for now, should only accept constant expresions
    macro_if: $ => seq("#if", $._any_expr),
    macro_ifdef: $ => seq("#ifdef", $.identifier),
    macro_ifndef: $ => seq("#ifndef", $.identifier),
    macro_undef: $ => seq("#undef", $.identifier),
  }
});
