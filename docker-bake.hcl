variable "APP_VERSION" {
  default = "0.0.0"
}

variable "IMAGE_NAME" {
  default = "speedarr"
}

group "default" {
  targets = ["speedarr"]
}

target "speedarr" {
  context    = "./app"
  dockerfile = "Dockerfile"
  args = {
    APP_VERSION = "${APP_VERSION}"
  }
  platforms   = ["linux/amd64", "linux/arm64"]
  tags        = ["${IMAGE_NAME}:${APP_VERSION}", "${IMAGE_NAME}:latest"]
  output      = ["type=docker"]
}

target "speedarr-push" {
  inherits   = ["speedarr"]
  output     = ["type=registry"]
}
