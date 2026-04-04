use super::strings::title_case;

pub fn say_hello(name: &str) -> String {
    format!("Hello, {}!", title_case(name))
}

pub fn unused_fn() -> String {
    String::new()
}
