#[derive(Debug)]
pub struct User {
    pub name: String,
    pub age: u32,
}

impl User {
    pub fn new(name: &str, age: u32) -> Self {
        User {
            name: name.to_string(),
            age,
        }
    }
}
