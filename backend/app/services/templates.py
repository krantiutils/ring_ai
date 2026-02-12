"""Template engine for Nepali variable substitution in voice and SMS templates.

Supports:
- Simple variable substitution: {variable_name}
- Default values: {variable_name|default_value}
- Conditional blocks: {?variable_name}...content...{/variable_name}
- Full Nepali Unicode throughout
"""

import re

# Matches {variable_name} or {variable_name|default_value}
_VAR_PATTERN = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)(?:\|([^}]*))?\}")

# Matches {?variable_name}...{/variable_name} — non-greedy, supports nesting via
# processing innermost first (we don't do recursive nesting, just flat conditionals)
_CONDITIONAL_PATTERN = re.compile(
    r"\{\?([a-zA-Z_][a-zA-Z0-9_]*)\}(.*?)\{/\1\}",
    re.DOTALL,
)


class TemplateError(Exception):
    """Base exception for template engine errors."""


class UndefinedVariableError(TemplateError):
    """Raised when a required variable has no value and no default."""

    def __init__(self, variable_name: str) -> None:
        self.variable_name = variable_name
        super().__init__(f"Undefined variable: {variable_name}")


def extract_variables(template_content: str) -> list[str]:
    """Extract all unique variable names from a template.

    Returns sorted list of variable names found in substitution slots
    and conditional blocks.
    """
    var_names: set[str] = set()

    for match in _VAR_PATTERN.finditer(template_content):
        var_names.add(match.group(1))

    for match in _CONDITIONAL_PATTERN.finditer(template_content):
        var_names.add(match.group(1))
        # Also extract variables inside conditional blocks
        inner = match.group(2)
        for inner_match in _VAR_PATTERN.finditer(inner):
            var_names.add(inner_match.group(1))

    return sorted(var_names)


def get_variables_with_defaults(template_content: str) -> list[str]:
    """Return variable names that have default values specified."""
    return sorted({match.group(1) for match in _VAR_PATTERN.finditer(template_content) if match.group(2) is not None})


def get_conditional_variables(template_content: str) -> list[str]:
    """Return variable names used in conditional blocks."""
    return sorted({match.group(1) for match in _CONDITIONAL_PATTERN.finditer(template_content)})


def get_required_variables(template_content: str) -> list[str]:
    """Return variables that have no default and are not purely conditional.

    A variable is 'required' if:
    - It appears in a substitution slot without a default value, AND
    - It is not ONLY used as a conditional block guard
    """
    all_vars = set()
    vars_with_defaults = set()
    conditional_guards = set()

    for match in _VAR_PATTERN.finditer(template_content):
        name = match.group(1)
        all_vars.add(name)
        if match.group(2) is not None:
            vars_with_defaults.add(name)

    for match in _CONDITIONAL_PATTERN.finditer(template_content):
        conditional_guards.add(match.group(1))
        # Variables inside conditional blocks that lack defaults are still required
        # IF the conditional is active
        inner = match.group(2)
        for inner_match in _VAR_PATTERN.finditer(inner):
            all_vars.add(inner_match.group(1))
            if inner_match.group(2) is not None:
                vars_with_defaults.add(inner_match.group(1))

    # Required = has no default AND is not solely a conditional guard
    # Conditional guards that also appear as {var} substitutions are still required
    pure_conditional_guards = conditional_guards - all_vars
    required = all_vars - vars_with_defaults - pure_conditional_guards

    return sorted(required)


def validate_template(template_content: str) -> tuple[bool, list[str]]:
    """Validate a template for structural correctness.

    Returns (is_valid, list_of_errors).
    """
    errors: list[str] = []

    # Check for unclosed conditional blocks
    open_blocks = re.findall(r"\{\?([a-zA-Z_][a-zA-Z0-9_]*)\}", template_content)
    close_blocks = re.findall(r"\{/([a-zA-Z_][a-zA-Z0-9_]*)\}", template_content)

    open_counts: dict[str, int] = {}
    for name in open_blocks:
        open_counts[name] = open_counts.get(name, 0) + 1

    close_counts: dict[str, int] = {}
    for name in close_blocks:
        close_counts[name] = close_counts.get(name, 0) + 1

    all_block_names = set(open_counts.keys()) | set(close_counts.keys())
    for name in all_block_names:
        o = open_counts.get(name, 0)
        c = close_counts.get(name, 0)
        if o > c:
            errors.append(f"Unclosed conditional block: {{?{name}}}")
        elif c > o:
            errors.append(f"Unmatched closing tag: {{/{name}}}")

    # Check for malformed variable references (e.g., {123invalid})
    malformed = re.findall(r"\{([^}?/][^}]*)\}", template_content)
    for ref in malformed:
        # Strip default value part for validation
        var_part = ref.split("|")[0]
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", var_part):
            errors.append(f"Invalid variable name: {{{ref}}}")

    # Check for empty content
    if not template_content.strip():
        errors.append("Template content is empty")

    return (len(errors) == 0, errors)


def render(template_content: str, variables: dict[str, str]) -> str:
    """Render a template by substituting variables.

    Processing order:
    1. Conditional blocks are resolved first
    2. Then variable substitution on the remaining text

    Args:
        template_content: The template string with {variable} placeholders.
        variables: Dict mapping variable names to their string values.

    Returns:
        The rendered string with all substitutions applied.

    Raises:
        UndefinedVariableError: If a required variable is missing and has no default.
    """
    result = template_content

    # Step 1: Resolve conditional blocks
    # Process repeatedly to handle any ordering issues (not true nesting)
    max_iterations = 10
    for _ in range(max_iterations):
        match = _CONDITIONAL_PATTERN.search(result)
        if not match:
            break
        var_name = match.group(1)
        block_content = match.group(2)
        value = variables.get(var_name)

        if value:
            # Variable is truthy — include the block content
            result = result[: match.start()] + block_content + result[match.end() :]
        else:
            # Variable is falsy/missing — remove the entire block
            result = result[: match.start()] + result[match.end() :]

    # Step 2: Substitute variables
    def replace_var(match: re.Match) -> str:
        var_name = match.group(1)
        default_value = match.group(2)

        if var_name in variables:
            return variables[var_name]
        if default_value is not None:
            return default_value

        raise UndefinedVariableError(var_name)

    result = _VAR_PATTERN.sub(replace_var, result)

    return result
