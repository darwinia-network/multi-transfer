#!/bin/sh
#


set -xe

BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)

npm run start ${@:+-- $@}
