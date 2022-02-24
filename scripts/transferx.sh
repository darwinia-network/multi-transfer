#!/bin/sh
#


BIN_PATH=$(cd "$(dirname "$0")"; pwd -P)
WORK_PATH=${BIN_PATH}/../

SEED=$1
SEED=${SEED:-0x1}

${WORK_PATH}/multi-transfer.sh transferx \
  --seed ${SEED} \
  --endpoint wss://pangolin-rpc.darwinia.network \
  --file ./data/transferx.csv


