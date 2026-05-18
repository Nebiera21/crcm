from jinja2 import Environment, StrictUndefined, TemplateSyntaxError, UndefinedError


def render_template(content: str, variables: dict) -> tuple[str, list[str]]:
    """
    Returns (rendered_string, errors). errors is empty on success.
    Uses StrictUndefined so references to undeclared variables surface as errors.
    """
    try:
        env = Environment(undefined=StrictUndefined, autoescape=False, keep_trailing_newline=True)
        tmpl = env.from_string(content)
        rendered = tmpl.render(**variables)
        return rendered, []
    except TemplateSyntaxError as exc:
        return "", [f"Syntax error at line {exc.lineno}: {exc.message}"]
    except UndefinedError as exc:
        return "", [f"Undefined variable: {exc}"]
    except Exception as exc:
        return "", [f"Render error: {exc}"]


def extract_variable_names(content: str) -> list[str]:
    """
    Returns variable names referenced in the template using Jinja2's AST.
    Excludes loop variables and built-in names.
    """
    try:
        env = Environment()
        ast = env.parse(content)
        from jinja2 import meta
        return sorted(meta.find_undeclared_variables(ast))
    except Exception:
        return []
