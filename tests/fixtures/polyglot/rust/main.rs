mod utils;
mod models;

use utils::greet::say_hello;
use models::user::User;

fn main() {
    let msg = say_hello("world");
    let user = User::new("world", 30);
    println!("{} {:?}", msg, user);
}
