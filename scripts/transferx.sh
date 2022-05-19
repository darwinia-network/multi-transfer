#!/bin/sh
#


BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH=${BIN_PATH}/../

##
# export SEED=0x12345
# export ENDPOINT=wss://darwiniacrab-rpc.dwellir.com
# ./scripts/transferx.sh ./assets/transferx/step-0.csv
###

SEED=${SEED:-0x1}
ENDPOINT=${ENDPOINT:-wss://pangolin-rpc.darwinia.network}
FILE=${DATA_FILE:-$1}

${WORK_PATH}/multi-transfer.sh transferx \
  --endpoint ${ENDPOINT} \
  --seed ${SEED} \
  --file ${FILE}


