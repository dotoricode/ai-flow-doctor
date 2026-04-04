package utils

import "./strings"

func Greet(name string) string {
	return "Hello, " + strings.Title(name) + "!"
}

func Unused() string {
	return ""
}
