from utils.helpers import greet, format_name
from utils.math import add

def main():
    name = format_name("world")
    msg = greet(name)
    result = add(1, 2)
    print(msg, result)
