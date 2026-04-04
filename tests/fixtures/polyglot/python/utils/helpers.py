from utils.strings import capitalize

def greet(name: str) -> str:
    return f"Hello, {capitalize(name)}!"

def format_name(raw: str) -> str:
    return raw.strip().title()

def unused_helper() -> None:
    pass
