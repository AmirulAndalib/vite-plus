# Vite-Plus Development Guide

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Build Process
- Install Rust nightly toolchain: `rustup install nightly-2025-08-05` (version specified in rust-toolchain.toml)
- Install Node.js 22.18.0+ (check .node-version file)
- Install PNPM globally: `npm install -g pnpm@10.15.1`
- Install project dependencies: `pnpm install` -- takes 30 seconds. Set timeout to 60+ seconds.
- **RUST BUILD PROCESS:**
  - Dev build: `cargo build --bin vt` -- takes 54 seconds. NEVER CANCEL. Set timeout to 120+ seconds.
  - Release build: `cargo build --release --bin vt` -- takes 3 minutes 44 seconds. NEVER CANCEL. Set timeout to 300+ seconds.
  - Check compilation: `cargo check --workspace --all-features --all-targets --locked` -- takes 3 minutes 36 seconds. NEVER CANCEL. Set timeout to 300+ seconds.
- **NODE.JS BUILD PROCESS:**
  - Full CLI bootstrap: `pnpm run bootstrap-cli` -- takes 4 minutes 6 seconds. NEVER CANCEL. Set timeout to 300+ seconds.
  - This builds Rust bindings AND Node.js packages AND installs global CLI

### Testing
- Run Rust tests: `cargo test -p vite_task` -- takes 30 seconds. Set timeout to 60+ seconds.
- Run full workspace tests: `cargo test --workspace` -- takes 1 minute 47 seconds. NEVER CANCEL. Set timeout to 180+ seconds.
- **NOTE**: Many tests may fail due to network/firewall limitations when accessing npm registry in sandboxed environments. This is expected and not a code issue.
- You never need to run `pnpm install` in test fixtures directories - vite-plus can parse workspaces without installing dependencies.

### Key Binaries and Commands
- **Main binary**: `./target/debug/vt` or `./target/release/vt` (built from vite_task crate)
- **Global CLI**: `vite-plus` (Node.js wrapper after bootstrap-cli)
- **Built-in commands**: `vite-plus build`, `vite-plus test`, `vite-plus lint`, `vite-plus fmt`
- **Task execution**: `vite-plus run <task> -r` (recursive), `vite-plus run package#task`
- **Debug mode**: `vite-plus --debug` or `./target/debug/vt --debug`

## Validation

### Manual Testing Scenarios
- **ALWAYS verify CLI installation**: Run `vite-plus --version` and `vite-plus --help`
- **Test core functionality**: Use `./target/release/vt --version` to test the Rust binary directly
- **Validate command parsing**: Test `vite-plus run --help` and other subcommands
- **Network isolation aware**: CLI may fail with SSL certificate errors in sandboxed environments when trying to auto-install dependencies - this is expected

### Build Validation Steps
- Always run `cargo check` before making changes to ensure clean baseline
- Always run `cargo build --bin vt` to validate Rust changes
- Always run `pnpm run bootstrap-cli` when modifying both Rust and Node.js components
- **CRITICAL**: Do not skip validation steps due to long build times - these are necessary

## Architecture Overview

### Core Components
- **Entry Point**: `crates/vite_task/src/lib.rs` - Main CLI parsing and execution logic
- **Workspace**: `crates/vite_task/src/config/workspace.rs` - Loads packages and creates task graphs
- **Task Graph**: `crates/vite_task/src/config/task_graph_builder.rs` - Builds dependency graphs
- **Execution**: `crates/vite_task/src/schedule.rs` - Executes tasks in dependency order
- **CLI Wrapper**: `packages/cli/` - Node.js package with Rust NAPI bindings
- **Global CLI**: `packages/global/` - Installable global CLI package

### Project Structure
- **Rust workspace**: `crates/*` - Core task runner logic in Rust
- **Node.js workspace**: `packages/*` - CLI wrappers and tooling integrations
- **Monorepo setup**: Uses both PNPM workspaces AND Cargo workspaces
- **Path safety**: All paths use `vite_path` types instead of `std::path` for type safety

### Task Dependencies
1. **Explicit dependencies**: Defined in `vite-task.json` files
2. **Implicit dependencies**: Based on package.json dependencies when `--topological` flag is used
3. **Compound commands**: Commands like `"build": "tsc && rollup"` are split into subtasks

## Common Development Tasks

### Repository Structure
```
vite-plus/
├── crates/           # Rust workspace - core task runner
│   ├── vite_task/    # Main binary and library
│   ├── vite_path/    # Type-safe path handling
│   ├── fspy/         # File system monitoring
│   └── ...
├── packages/         # Node.js workspace
│   ├── cli/          # NAPI bindings and CLI
│   └── global/       # Global installable package
├── Cargo.toml        # Rust workspace config
├── package.json      # Node.js workspace config
├── pnpm-workspace.yaml
└── rust-toolchain.toml
```

### Key Files to Check When Making Changes
- Always check `crates/vite_task/src/lib.rs` for CLI argument parsing changes
- Always check `packages/cli/package.json` for Node.js dependencies
- Always check `Cargo.toml` for Rust dependencies
- Always check `.github/workflows/ci.yml` for CI requirements

### Development Workflow
1. Make Rust changes in `crates/` directories
2. Test with `cargo build --bin vt` and `./target/debug/vt`
3. If changing CLI interface, rebuild with `pnpm run bootstrap-cli`
4. Validate changes with `cargo test` and manual testing
5. Format code (Rust auto-formats, Node.js uses built-in tooling)

### Debugging and Troubleshooting
- Use `--debug` flag to see cache operations and detailed execution info
- Use `VITE_LOG=debug` environment variable for verbose logging
- Network issues in sandboxed environments are expected - focus on core functionality
- SSL certificate errors when accessing npm registry are environment-specific, not code bugs

## Time Expectations

- **Initial setup**: 5-10 minutes (toolchain + dependencies)
- **Incremental Rust builds**: 30-60 seconds
- **Full Rust rebuild**: 3-4 minutes
- **Node.js builds**: 30 seconds
- **Full bootstrap**: 4+ minutes
- **Test suite**: 1-2 minutes (may have network-related failures in sandbox)

Always set generous timeouts (300+ seconds for builds, 180+ seconds for tests) and NEVER CANCEL long-running operations.