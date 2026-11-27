# Factory Shell Configuration — Quick Reference for Agents

## TL;DR

Use one of these patterns when running shell commands in factory tasks:

```bash
# ✅ Recommended: Helper script (automatically handles environment)
./.claude/factory/scripts/run-with-env.sh npm run build

# ✅ Also good: Bash interactive mode (sources ~/.bashrc)
bash -ic 'npm run build'

# ✅ Alternative: Login mode (sources ~/.bash_profile)
bash -lc 'npm run build'

# ❌ Avoid: Bare commands without shell initialization
npm run build              # May fail if npm is in custom PATH
./gradlew build            # May not find Java if installed via jenv
```

---

## Command Reference

### For Every Build/Test Command

**Before (old way):**
```bash
npm run build
./gradlew test
yarn install
python -m pytest
```

**After (new way):**
```bash
# Method 1: Helper script (easiest)
./.claude/factory/scripts/run-with-env.sh npm run build
./.claude/factory/scripts/run-with-env.sh ./gradlew test
./.claude/factory/scripts/run-with-env.sh yarn install
./.claude/factory/scripts/run-with-env.sh python -m pytest

# Method 2: Bash with interactive mode
bash -ic 'npm run build'
bash -ic './gradlew test'
bash -ic 'yarn install'
bash -ic 'python -m pytest'
```

---

## When to Use Each Method

| Situation | Recommended |
|-----------|-------------|
| **Build commands (npm, gradle, make)** | `bash -ic 'npm run build'` |
| **Package installs (npm install, yarn)** | `bash -ic 'npm install'` |
| **Version checks (java -v, node -v)** | `bash -ic 'node -v'` |
| **Language managers (python, ruby, go)** | `bash -lc 'python --version'` |
| **Multiple commands in sequence** | `bash -ic 'npm install && npm test'` |
| **If unsure about shell** | `run-with-env.sh command` |

---

## Shell Flags Explained

```bash
bash -i       # Interactive: sources ~/.bashrc (normal shell use)
bash -l       # Login: sources ~/.bash_profile (full initialization)
bash -ic      # Interactive + command: bash -i + run command
bash -lc      # Login + command: bash -l + run command
```

**Default for factory:** Interactive mode (`-i`), which sources `~/.bashrc`

**Use login mode** (`-l`) if the command needs full profile setup (language managers, custom environment)

---

## Helper Script Options

```bash
# Default: bash interactive (sources ~/.bashrc)
run-with-env.sh npm run build

# With specific shell
run-with-env.sh -s zsh npm run build
run-with-env.sh -s fish yarn install
run-with-env.sh -s ksh ./gradlew build

# With login mode (sources ~/.bash_profile)
run-with-env.sh -l npm run build

# Multiple commands
run-with-env.sh npm install && run-with-env.sh npm test
# Or use && within quotes:
run-with-env.sh 'npm install && npm test'
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "command not found" | Use `bash -ic` or `run-with-env.sh` |
| Tool in custom PATH not found | Use `bash -ic` (interactive sources PATH) |
| Language manager (nvm, pyenv) not working | Use `bash -lc` (login mode) |
| Still can't find tool | Check `.claude/.factory/environment.md` for available tools |
| Need to use zsh/fish/ksh | Use `run-with-env.sh -s shell_name` |

---

## Example in Kotlin/Spring Boot Context

```kotlin
// In factory-backend-developer agent prompt:

@Task
fun buildBackend() {
    // ✅ Correct: Sources user environment (finds gradle)
    bash -ic './gradlew build'
    
    // ✅ Also correct: Helper script
    ./.claude/factory/scripts/run-with-env.sh ./gradlew build
    
    // ❌ Wrong: May fail if gradle not in system PATH
    ./gradlew build
}

@Task
fun runTests() {
    // ✅ Correct: Runs tests with proper environment
    bash -ic './gradlew test'
    
    // ✅ Also correct
    ./.claude/factory/scripts/run-with-env.sh ./gradlew test
}
```

---

## Example in Frontend/Node.js Context

```bash
# ✅ Correct ways:
bash -ic 'npm install'
bash -ic 'npm run build'
bash -ic 'npm test'

# ✅ Using helper script:
run-with-env.sh npm install
run-with-env.sh npm run build
run-with-env.sh npm test

# ✅ With flags:
bash -ic 'npm run build -- --configuration production'
run-with-env.sh npm run build -- --configuration production
```

---

## For Python/ML Agents

```bash
# ✅ Correct: Sources pyenv/virtualenv from ~/.bashrc
bash -ic 'python -m pytest'
bash -ic 'pip install -r requirements.txt'

# ✅ Or helper script
run-with-env.sh python -m pytest
run-with-env.sh pip install -r requirements.txt

# ✅ For conda/venv:
bash -lc 'conda activate myenv && python test.py'
bash -lc 'source venv/bin/activate && python test.py'
```

---

## Checklist for Agents

- [ ] Read `.factory/<task-id>/state.md` to find `shell:` value
- [ ] Wrap all build/test/package commands with shell initialization
- [ ] Use `bash -ic` by default (interactive mode)
- [ ] Use `bash -lc` for language managers / profile-based initialization
- [ ] Use `run-with-env.sh` if unsure
- [ ] Test commands locally first if possible
- [ ] Document any non-standard tool locations in findings

---

**Last Updated:** November 27, 2026  
**Learn More:** See `.claude/factory/SHELL-CONFIGURATION.md`
