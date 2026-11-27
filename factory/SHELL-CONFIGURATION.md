# Factory Shell Configuration

## Overview

The Continuum software factory uses **bash** by default for all shell command execution, with automatic sourcing of user environment files (`~/.bashrc` and `~/.bash_profile`). This ensures that:

- User-specific tools and PATH modifications are available
- Build tools installed in home directories work correctly
- IDE and development environment configurations are honored
- Package managers and language managers (nvm, pyenv, rbenv, etc.) work as expected

Alternatively, users can opt to use a different shell (zsh, fish, ksh, etc.) at the start of a factory run.

## For the Orchestrator

When starting a factory run:

1. At the beginning of **Phase 0 — Environment**, determine the shell to use:
   - **Default**: bash with home environment sourcing
   - **Alternative**: Ask the user if they prefer a different shell

2. If asking the user, use the following:
   ```
   Shell for factory operations:
   - Bash (default) — sources ~/.bashrc and ~/.bash_profile automatically
   - Zsh
   - Fish
   - Ksh
   - Other (specify)
   ```

3. Record the chosen shell in `.factory/<task-id>/state.md`:
   ```yaml
   shell: bash  # or zsh, fish, ksh, etc.
   ```

4. Document this in your agent prompts so they know which shell to use.

## For Agents

### Method 1: Using the Helper Script (Recommended)

Use the provided helper script at `.claude/factory/scripts/run-with-env.sh`:

```bash
# Default: bash with interactive shell (sources ~/.bashrc)
./.claude/factory/scripts/run-with-env.sh npm run build

# With alternative shell
./.claude/factory/scripts/run-with-env.sh -s zsh yarn install

# With login shell mode (sources ~/.bash_profile)
./.claude/factory/scripts/run-with-env.sh -l ./gradlew build
```

### Method 2: Direct Bash Execution

If you prefer to run bash directly in your agent:

```bash
# Interactive mode (sources ~/.bashrc for user environment)
bash -ic 'npm run build'

# Login mode (sources ~/.bash_profile)
bash -lc 'yarn install'

# Combined sourcing of both ~/.bashrc and ~/.bash_profile
bash --rcfile <(cat ~/.bashrc ~/.bash_profile 2>/dev/null; echo 'set +u') -c 'npm test'
```

### Method 3: Wrapping Commands for Specific Shells

If the orchestrator recorded a non-bash shell in `state.md`, adapt your commands accordingly:

```bash
# For zsh
zsh -ic 'npm run build'       # Interactive
zsh -lc 'npm run build'       # Login shell

# For fish
fish -lc 'npm run build'      # Fish always loads login-shell initialization

# For ksh
ksh -lc 'npm run build'       # Login shell with initialization
```

## Environment Variables

Both methods ensure that:

- All variables in `~/.bashrc` and/or `~/.bash_profile` are loaded
- `PATH` is properly set with user customizations
- Language/version managers (nvm, pyenv, etc.) initialization scripts run
- Aliases and functions defined in shell initialization files are available

## Best Practices

1. **For build commands** (npm, yarn, gradle, make, etc.):
   - Use interactive mode: `bash -ic` or `zsh -ic`
   - This loads user PATH and environment customizations

2. **For version checks** (java -version, node -v, etc.):
   - Use interactive or login mode to ensure tools are found
   - Avoid plain command execution without shell initialization

3. **For long-running tests or builds**:
   - Use login mode: `bash -lc` or `zsh -lc`
   - This ensures profile-based setup is complete

4. **When combining multiple commands**:
   - Wrap the entire sequence in a single shell invocation:
     ```bash
     bash -ic 'npm install && npm run build && npm test'
     ```

## Troubleshooting

If a command fails with "command not found" or similar:

1. Check that the tool is installed in a user PATH location (not just in a Docker or VM image)
2. Verify the tool is activated in `~/.bashrc` or `~/.bash_profile` (e.g., nvm init, pyenv init)
3. Try with explicit login mode: `bash -lc 'your_command'`
4. Check the environment profile from `.claude/.factory/environment.md` to see what's available

## Example Agent Prompt Section

When launching agents, include this guidance in the prompt:

```
When running shell commands (npm, gradle, etc.), use bash with environment sourcing:
- bash -ic 'npm run build'    # for interactive initialization
- bash -lc 'npm run build'    # for login shell initialization

Or use the helper script: ./.claude/factory/scripts/run-with-env.sh npm run build

The shell being used for this factory run is: [shell-name]
```
