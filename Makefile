
.DELETE_ON_ERROR:
.PHONY: build clean

build: supercats.superposition.so.wasm

supercats.superposition.so.wasm: $(shell find src Cargo.toml Cargo.lock)
	@cargo build --target wasm32-unknown-unknown --release
	@./wasm-post.sh \
		target/wasm32-unknown-unknown/release/superposition_supercats.wasm \
		supercats.superposition.so.wasm

clean:
	@cargo clean
	@rm -f supercats.superposition.so.wasm
