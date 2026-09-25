#!/usr/bin/env sh
set -eu
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
npm run studio --prefix "$ROOT_DIR/plugins/volta-newsletter"
