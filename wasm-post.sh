#!/bin/sh -eu

f="$(mktemp)"

wasm-opt \
	--dce \
	--rse \
	--signature-pruning \
	--strip-debug \
	--enable-bulk-memory \
	--strip \
	-Oz \
	"$1" \
	-o "$f.wasm1"

wasm2wat -o $f.wat $f.wasm1

wat2wasm -o $2 $f.wat
