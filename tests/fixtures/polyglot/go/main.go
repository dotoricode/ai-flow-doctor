package main

import (
	"./utils"
	"./models"
)

func main() {
	name := utils.Greet("world")
	user := models.NewUser(name, 30)
	println(name, user)
}
