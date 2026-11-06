"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../privacy-block.agy.sh");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");

function runHook(payload, { config, bashBin = "bash", pathPrefix } = {}) {
  const tempProject = fs.mkdtempSync(
    path.join(os.tmpdir(), "cf-privacy-block-agy-"),
  );
  try {
    if (config) {
      fs.mkdirSync(path.join(tempProject, ".coding-friend"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(tempProject, ".coding-friend", "config.json"),
        JSON.stringify(config),
      );
    }
    const input =
      typeof payload === "string"
        ? payload
        : JSON.stringify({
            ...payload,
            workspacePaths: payload.workspacePaths || [tempProject],
          });
    const stdout = execFileSync(bashBin, [SCRIPT], {
      cwd: PLUGIN_ROOT,
      input,
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
        ...(pathPrefix ? { PATH: `${pathPrefix}:${process.env.PATH}` } : {}),
      },
    });
    return { status: 0, stdout, json: JSON.parse(stdout.trim()) };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || "" };
  } finally {
    fs.rmSync(tempProject, { recursive: true, force: true });
  }
}

describe("privacy-block.agy.sh", () => {
  it("denies view_file of .env (exit 0)", () => {
    const result = runHook({
      toolCall: {
        name: "view_file",
        args: { AbsolutePath: "/x/.env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("/x/.env");
  });

  it("denies write_to_file TargetFile .env (relative, single segment)", () => {
    const result = runHook({
      toolCall: {
        name: "write_to_file",
        args: { TargetFile: ".env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain(".env");
  });

  it("denies find_by_name Pattern .env", () => {
    const result = runHook({
      toolCall: {
        name: "find_by_name",
        args: { Pattern: ".env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain(".env");
  });

  it("denies grep_search SearchPath ~/.ssh (exit 0)", () => {
    const result = runHook({
      toolCall: {
        name: "grep_search",
        args: { SearchPath: "~/.ssh", Query: "key" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toMatch(/\.ssh/);
  });

  it("allows write_to_file src/a.ts", () => {
    const result = runHook({
      toolCall: {
        name: "write_to_file",
        args: { TargetFile: "src/a.ts" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("allows write_to_file src/a.ts when CodeContent mentions secret and node_modules", () => {
    const result = runHook({
      toolCall: {
        name: "write_to_file",
        args: {
          TargetFile: "src/a.ts",
          CodeContent: "const secret = '/node_modules/pkg';",
        },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  // Regression: unanchored 'credentials' / '\.env\.' denied source files.
  for (const filePath of [
    "/x/src/brain-sso-credentials-form.ts",
    "/x/src/config.env.ts",
    "/x/src/secret-manager.ts",
  ]) {
    it(`allows view_file of source file ${filePath}`, () => {
      const result = runHook({
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: filePath },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "allow" });
    });
  }

  for (const filePath of [
    "/x/config/credentials.json",
    "/home/u/.aws/credentials",
    "/x/config/.env.local",
  ]) {
    it(`denies view_file of ${filePath}`, () => {
      const result = runHook({
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: filePath },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("deny");
      expect(result.json.reason).toContain(filePath);
    });
  }

  it('denies run_command "cat .env.local" (exit 0)', () => {
    const result = runHook({
      toolCall: {
        name: "run_command",
        args: { CommandLine: "cat .env.local" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
  });

  it('denies run_command "cat config/credentials.json src/a.ts" (exit 0)', () => {
    const result = runHook({
      toolCall: {
        name: "run_command",
        args: { CommandLine: "cat config/credentials.json src/a.ts" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
  });

  it('denies run_command "cat<config/credentials.json;:>a.ts" (no whitespace)', () => {
    const result = runHook({
      toolCall: {
        name: "run_command",
        args: { CommandLine: "cat<config/credentials.json;:>a.ts" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
  });

  it("denies find_by_name Pattern *.env", () => {
    const result = runHook({
      toolCall: {
        name: "find_by_name",
        args: { Pattern: "*.env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toMatch(/\.env/);
  });

  it("allows find_by_name Pattern .env.example", () => {
    const result = runHook({
      toolCall: {
        name: "find_by_name",
        args: { Pattern: ".env.example" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it('denies run_command "cat .env" (exit 0)', () => {
    const result = runHook({
      toolCall: {
        name: "run_command",
        args: { CommandLine: "cat .env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("cat .env");
  });

  // Regression: the whole CommandLine was checked as one string, so an
  // anchored row missed a name that was not last, and a safe example name
  // anywhere in the line exempted the whole command.
  for (const [commandLine, decision] of [
    ["cat .env && true", "deny"],
    ["cat .env foo", "deny"],
    ["cat .env.example; cat .env", "deny"],
    ["cat '.e'\"nv\"", "deny"],
    ["echo .env.example", "allow"],
    ["grep env file", "allow"],
  ]) {
    const verb = decision === "deny" ? "denies" : "allows";
    it(`${verb} run_command ${JSON.stringify(commandLine)} per token`, () => {
      const result = runHook({
        toolCall: { name: "run_command", args: { CommandLine: commandLine } },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe(decision);
      if (decision === "deny")
        expect(result.json.reason).toContain(commandLine);
    });
  }

  // Regression: shell globs, brace lists, ANSI-C quoting and expansions
  // rebuilt a sensitive name the per-token check could not see.
  for (const [commandLine, decision] of [
    ["cat .e*", "deny"],
    ["cat .en?", "deny"],
    ["cat .e[n]v", "deny"],
    ["cat .en[v]", "deny"],
    ["cat .{e,x}nv", "deny"],
    ["cat ~/.ss?/config", "deny"],
    ["cat ~/.s*/id_r*", "deny"],
    [String.raw`cat $'.e\x6ev'`, "deny"],
    [String.raw`cat $'\x2eenv'`, "deny"],
    ["a=.e; cat ${a}nv", "deny"],
    ['a=.e; cat $a"nv"', "deny"],
    ['cat $(printf ".e%s" nv)', "deny"],
    ["cat $(echo .en)v", "deny"],
    ["ls src/*.ts", "allow"],
    ["git add a.ts b.ts", "allow"],
    ["echo $HOME", "allow"],
    ["rm -rf build/*", "allow"],
  ]) {
    const verb = decision === "deny" ? "denies" : "allows";
    it(`${verb} shell-syntax run_command ${JSON.stringify(commandLine)}`, () => {
      // /bin/bash: the glob and [[ =~ ]] checks must work on bash 3.2.
      const result = runHook(
        {
          toolCall: { name: "run_command", args: { CommandLine: commandLine } },
        },
        { bashBin: "/bin/bash" },
      );
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe(decision);
    });
  }

  // Regression: unquoted-only globs, line continuations, non-list braces,
  // ANSI-C escapes and $-splices next to a dot name.
  for (const [commandLine, decision] of [
    ["cat .e\\\nnv", "deny"],
    ['cat ".e\\\nnv"', "deny"],
    ["cat ~/.ss\\\nh/config", "deny"],
    ["cat .{d..f}nv", "deny"],
    ['cat .{"e",x}nv', "deny"],
    ["cat .{$a,e}nv", "deny"],
    [String.raw`cat $'\056env'`, "deny"],
    [String.raw`cat $'.env'`, "deny"],
    ["cat $(echo .)env", "deny"],
    ["a=.; cat ${a}env", "deny"],
    ["a=env; cat .$a", "deny"],
    ["cat .$(echo env)", "deny"],
    ["cat .`echo env`", "deny"],
    ["a=e; cat .${a}nv", "deny"],
    ["cat ${a:-.e}nv", "deny"],
    ["cat ${a-.e}nv", "deny"],
    ["cat $(echo .)ssh/*", "deny"],
    ["cat $(echo .)e*", "deny"],
    ["sed 's/.*/x/' a.txt", "allow"],
    ["grep -c '.*' a.txt", "allow"],
    [String.raw`grep -o '\.[a-z]*' a.txt`, "allow"],
    ["echo $(date)", "allow"],
    ["git log $(git merge-base HEAD main)..HEAD", "allow"],
    ["cd $HOME/src && ls", "allow"],
    ['find . -name "$n"', "allow"],
    ["ls src/**/*.ts", "allow"],
    ["cp file.{ts,js} dest/", "allow"],
    // POSIX classes inside [...] ([[:alpha:]]) must not end the class early.
    ["cat id_[[:alpha:]]sa", "deny"],
    ["cat [[:alpha:]]d_rsa", "deny"],
    ["cat *[[:alpha:]]_rsa", "deny"],
    ["cat server.p[[:alpha:]]m", "deny"],
    ["cat *.[[:lower:]]em", "deny"],
    ["cat ~/.s[[:alpha:]]h/x", "deny"],
    ["cat .e[[:alpha:]]v", "deny"],
    ["cat .e[[:alpha:]]*", "deny"],
    ["cat .e[[=n=]]v", "deny"],
    // A ' inside a comment or a here-doc body opens no quote in bash.
    ["echo x #'\ncat .e* #'", "deny"],
    ["cat <<X\nit's\nX\ncat .e* #'", "deny"],
    // \' inside $'...' is an escaped quote, not the end of the string.
    [String.raw`cat $'\'' .e* #'`, "deny"],
    // An escape that yields a control character (an ANSI colour) spells no
    // name; one that yields a glob character can, in a nested shell.
    [String.raw`echo $'\033[31mred\033[0m'`, "allow"],
    [String.raw`sh -c $'cat .e\x2a'`, "deny"],
    // Quoted globs a nested shell or find expands.
    ["sh -c 'cat .e*'", "deny"],
    ['bash -c "cat .en?"', "deny"],
    ["find . -name '.e*' -exec cat {} \\;", "deny"],
    ["find . -name '*ecret*'", "deny"],
    ['find . -name "*.key*"', "deny"],
    ["sh -c 'cat .key; ls'", "deny"],
    ["env X=1 bash -c 'cat .key; ls'", "deny"],
    // Other commands that run a quoted string through a shell.
    ["ssh host 'cat .env | head'", "deny"],
    ["su -c 'cat .env | head'", "deny"],
    ["watch 'cat .env | head'", "deny"],
    ["script -q -c 'cat .key; ls' /dev/null", "deny"],
    ["ssh host 'ls -la'", "allow"],
    ["watch -n1 'git status'", "allow"],
    // A quoted regex, jq path or message is not a glob a shell expands.
    ['grep -rn "api.*key" src/', "allow"],
    ["jq '.[].key' a.json", "allow"],
    ["jq '.items[0].key' a.json", "allow"],
    ['git commit -m "fix: handle *.pem files"', "allow"],
    // A jq/yq filter or a quoted JS expression is not a file name; a quoted
    // file name, or a jq filter read from a file, still is.
    ["jq -r '.key' a.json", "allow"],
    ["jq -r 'to_entries[] | .key' a.json", "allow"],
    ["jq -r '.data.key' a.json", "allow"],
    ["yq '.metadata.key' a.yaml", "allow"],
    ['node -p "Object.keys(process.env)"', "allow"],
    // A $(...) or `...` in double quotes runs: its words are file names.
    ['KEY="$(cat server.key)"', "deny"],
    ['echo "`cat x.pem`"', "deny"],
    ["cat '.key'", "deny"],
    ['cat ".key"', "deny"],
    ["jq -rf '.env' a.json", "deny"],
    // A jq/yq filter after -c is still a filter, not a script.
    ["docker inspect web | jq -c '.[0].Config.Env'", "allow"],
    ["kubectl get pod p -o json | jq -c '.spec.containers[].env'", "allow"],
    [`jq -c '.[] | select(.type=="secret")' x.json`, "allow"],
    [`jq -c 'load(".env")'`, "deny"],
    // A lone "." after "/" is a directory, not a name an expansion finishes.
    ['cp -r "$SRC_DIR/." dist/', "allow"],
    ["cp -r $dir/. out/", "allow"],
    ['cd "$ROOT/."', "allow"],
    ["echo $(pwd)/.", "allow"],
    ["cat .${b}", "deny"],
    ['echo "${a}.${b}"', "deny"],
    // A lone "." after "=" counts only when an expansion can splice it.
    ['PYTHONPATH=. python main.py --out "$OUT"', "allow"],
    ['NODE_PATH=. node x.js "$ARG"', "allow"],
    ["a=.; cat $a'env'", "deny"],
    // A lone "." word another command puts into a variable.
    ["read a <<< .; cat ${a}env", "deny"],
    ["set -- .; cat ${1}env", "deny"],
    ["for a in .; do cat ${a}env; done", "deny"],
    ["printf -v a .; cat ${a}env", "deny"],
    ["while read a; do cat ${a}env; done <<< .", "deny"],
    ['find . -name "${PREFIX}_x"', "allow"],
    ['ls . "${D}_bak"', "allow"],
    // Exact secret stems keep the block behind a source extension.
    ["cat secr?ts.py", "deny"],
    ["cat s*s.py", "deny"],
    // A quoted string splits into names unless it is a known non-file
    // argument (message, pattern, script, filter): xargs reads names from it.
    ['echo ".env x" | xargs cat', "deny"],
    ['echo "a.pem b" | xargs cat', "deny"],
    // A yq/jq filter that loads a file names it in a string literal.
    [`yq 'load(".env")'`, "deny"],
    [`yq '.a = load(".env")' x.yaml`, "deny"],
    [`yq -n 'load_str(".env")'`, "deny"],
    [`yq -n 'load_base64(".env")'`, "deny"],
    [`yq 'load("id_rsa")'`, "deny"],
    [`yq 'load("secrets.json")'`, "deny"],
    [`yq 'load(".e*")'`, "deny"],
    [`yq 'load("/x/.e*")'`, "deny"],
    [`jq 'include ".env"; 1'`, "deny"],
    // env -S splits its string into a command.
    ["env -S 'cat .e*'", "deny"],
    [`env -S 'bash -c "cat .e*"'`, "deny"],
    [`env -S "sh -c 'cat .env'"`, "deny"],
    ['env -S"cat .e*"', "deny"],
    // A shell skips option words between -c and its script.
    ["sh -c -- 'cat .e?v'", "deny"],
    ["bash -c -x 'cat .e?v'", "deny"],
    ["fish -c 'cat .e?v'", "deny"],
    // A shell without -c reads its script from stdin.
    ["echo 'cat .e?v' | sh", "deny"],
    ["sh <<< 'cat .e?v'", "deny"],
    // Any -c / -Command word hands a script to a shell, whatever its name
    // ($SHELL, rbash, ksh93); a shell outside a fixed list reads stdin too.
    ...[
      "rbash", "ksh93", "yash", "bash5", "ash", "mksh", "csh", "tcsh",
      "busybox ash", "$SHELL",
    ].map((sh) => [`${sh} -c 'cat .e*'`, "deny"]),
    ...["powershell", "pwsh", "pwsh.exe"].map((sh) => [`${sh} -c 'gc .e*'`, "deny"]),
    ["$SHELL -c 'cat *ecret*.yaml'", "deny"],
    ["echo 'cat .e*' | rbash", "deny"],
    ["echo 'cat .e*' | busybox sh", "deny"],
    // A stdin shell behind a wrapper, and a -c after -- (or after the
    // first non-option word) is a positional argument, not a script.
    ...[
      "sudo sh", "sudo -u x bash", "env sh", "/usr/bin/env bash", "env -i sh",
      "env FOO=1 sh", "exec sh", "exec /bin/sh", "exec zsh -f",
      "builtin exec sh", "command sh", "command -p sh", "nohup sh", "time sh",
      "nice sh", "timeout 5 sh", "stdbuf -o0 sh", "setsid sh", "ionice sh",
      "caffeinate sh", "arch -arm64 sh", "xargs sh", "xargs -0 sh", "eval sh",
      "{ sh; }", "sudo rbash", "bash -s -- -c", "busybox sh -s -- -c",
      // sudo -s/-i and su without -c run a shell that reads stdin.
      "sudo -s", "sudo -i", "sudo -u x -s", "sudo --login", "su", "su -",
      "su root", "su -l root", "sudo -u x rbash",
    ].map((sh) => [`echo 'cat .e*' | ${sh}`, "deny"]),
    // A consumer outside SAFE_CONSUMERS rechecks the quoted words upstream;
    // the wrapper options are still parsed (a harmless payload is allowed).
    ["echo 'cat .e*' | sudo apt-get install -y jq", "deny"],
    ["echo 'cat .e*' | sudo -u x ls", "deny"],
    ["echo 'hello' | sudo apt-get install -y jq", "allow"],
    ["echo 'hello' | sudo -u x ls", "allow"],
    // env -S splits its value into the command line.
    ...[
      "env -S sh", "env -S 'sh -s'", `env -S"nice sh"`, "env -iS sh",
      "env -S sh -s", "sudo env -S sh", "nice -n 5 env -S sh",
    ].map((sh) => [`echo 'cat .e*' | ${sh}`, "deny"]),
    // Commands that run stdin as a shell (or are unknown) recheck upstream.
    ...[
      "runuser x", "runuser -l x", "doas -s", "doas", "pkexec", "unshare",
      "unshare -r", "chroot /", "nsenter -t 1 -m", "newgrp x", "sg x",
      "login", "login -f x", "script -q /dev/null", "machinectl shell",
      "{sh,}", "xargs --replace sh",
    ].map((sh) => [`echo 'cat .e*' | ${sh}`, "deny"]),
    ["echo 'cat .e?v' | xargs -I{} sh -c {}", "deny"],
    ["printf 'cat server.pe?' | xargs -0 bash -c", "deny"],
    ["echo 'cat .e?v' | sh -c 'exec sh'", "deny"],
    ...["$SHELL", '"$SHELL"', "${SHELL}"].map((sh) => [
      `echo 'cat server.pe?' | ${sh}`,
      "deny",
    ]),
    // Here-strings, here-docs, < and process substitution feed stdin too.
    ["env -S sh <<< 'cat .e*'", "deny"],
    ["runuser x <<EOF\necho 'cat .e*'\nEOF", "deny"],
    ["mytool <(echo 'cat .e*')", "deny"],
    ["echo 'cat .e*' > >(mytool)", "deny"],
    ["echo 'cat .e*' |& mytool", "deny"],
    // Known read-only consumers, and quoted patterns, filters, messages and
    // interpreter expressions upstream, stay allowed.
    ["grep 'api.*key' src/ | mytool", "allow"],
    ["echo 'hello world' | mytool", "allow"],
    ["cat data.json | jq '.key'", "allow"],
    ["git diff | mytool", "allow"],
    ["sed 's/.*/x/' a.txt | foo", "allow"],
    ["jq '.key' x.json | bar", "allow"],
    [
      `echo '{"a":1}' | python3 -c 'import sys,json;print(json.load(sys.stdin))'`,
      "allow",
    ],
    ["printf '%s\\n' a b | sort | uniq -c", "allow"],
    ["docker ps | grep web", "allow"],
    // A consumer that can run what it reads is not a SAFE_CONSUMER.
    ["echo 'cat .e*' | awk '{system($0)}'", "deny"],
    ["echo 'cat .e*' | sed e", "deny"],
    [
      "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.x GIT_CONFIG_VALUE_0='!sh' git x <<< 'cat .e*'",
      "deny",
    ],
    ["echo 'cat .e*' | sort --compress-program=sh", "deny"],
    ["echo 'cat .e*' | LESSOPEN='|-sh %s' less", "deny"],
    ["echo 'cat .e*' | ack --pager=sh x", "deny"],
    ["echo 'cat .e*' | rg --pre=sh x /dev/stdin", "deny"],
    // A wrapper or a NAME=value prefix makes a listed consumer unsafe.
    ["echo 'cat .e*' | xargs rg --pre=sh x /dev/stdin", "deny"],
    [`echo 'cat .e*' | PERL5OPT=-d PERL5DB='BEGIN{system("sh")}' shasum`, "deny"],
    [`echo ".e'n'v" | xargs cat`, "deny"],
    ["echo foo | sudo tee /tmp/x", "allow"],
    ["git ls-files | xargs wc -l", "allow"],
    ["rg foo src | head", "allow"],
    // A group, an alias or a path outside the system bin dirs is not safe.
    [
      "echo '.e*' | { wc -c </dev/null; xargs -I% find . -name % -exec head {} +; }",
      "deny",
    ],
    [
      "echo '.e*' | ( cat </dev/null; xargs -I% find . -name % -exec head {} + )",
      "deny",
    ],
    [
      "shopt -s expand_aliases; alias cat='xargs -I% find . -name % -exec head {} +'; echo '.e*' | cat",
      "deny",
    ],
    ["echo 'cat .e*' | ./cat", "deny"],
    // yq load(.) opens a file named by its stdin.
    ["echo '.e*' | yq 'load(.)'", "deny"],
    // Checksum -c and GNU wc --files0-from open the files named on stdin.
    ["echo 'x  .e*' | sha256sum -c", "deny"],
    ["echo '.e*' | wc --files0-from=-", "deny"],
    ["ls | /usr/bin/head -3", "allow"],
    ["echo foo | (cat)", "allow"],
    ["echo foo | sed s/a/b/", "allow"],
    ["git log --oneline | sort | uniq -c", "allow"],
    ["ps aux | awk '{print $2}'", "allow"],
    // A quoted URL names no file: the recheck skips it, and only it.
    ["curl -s 'https://x/api?key=1' | python3 -m json.tool", "allow"],
    [`curl -s "https://example.com/a*b" | node x.js`, "allow"],
    ["echo 'cat .e*' 'https://x' | mytool", "deny"],
    ["echo 'cat .e*' | head -1 | cut -c1", "allow"],
    // -o takes an argument, so the -c after it is still the script flag.
    ["grep -c 'api.*key' src/ && bash -o pipefail -c 'ls'", "allow"],
    // source / . of stdin runs its input as a script.
    [". /dev/stdin <<< 'cat .e*'", "deny"],
    ["echo 'cat .e*' | source /dev/stdin", "deny"],
    ["source <(echo 'cat .e*')", "deny"],
    ["source venv/bin/activate && python 'main.py'", "allow"],
    // A -c outside a shell: harmless quoted words, or a known pattern or
    // message, stay allowed.
    ["gcc -c 'main.c'", "allow"],
    ["tar -czf out.tgz 'src'", "allow"],
    ["grep -c 'api.*key' src/", "allow"],
    ["git stash && grep -c 'api.*key' src/", "allow"],
    ['git -C /repo commit -m "fix: handle *.pem files"', "allow"],
    ['git -c a.b=c commit -m "fix: handle *.pem files"', "allow"],
    // rg/grep glob values select files like find -name.
    ["rg -g '*.e?v' x", "deny"],
    ["grep -r --include='*.e*v' x .", "deny"],
    ["rg -g '*.ts' foo", "allow"],
  ]) {
    const verb = decision === "deny" ? "denies" : "allows";
    it(`${verb} run_command ${JSON.stringify(commandLine)} (node check)`, () => {
      const result = runHook(
        {
          toolCall: { name: "run_command", args: { CommandLine: commandLine } },
        },
        { bashBin: "/bin/bash" },
      );
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe(decision);
    });
  }

  // Regression: each token holding env/key ran ~80 grep probes, so 20 such
  // tokens took ~7 s and 60 hit AGY's 10 s hook timeout.
  it("allows an 80-file run_command quickly under /bin/bash", () => {
    const files = [
      ...Array.from({ length: 60 }, (_, i) => `src/keyboard/file${i}.txt`),
      ...Array.from({ length: 20 }, (_, i) => `src/environment${i}.txt`),
    ];
    const start = Date.now();
    const result = runHook(
      {
        toolCall: {
          name: "run_command",
          args: { CommandLine: `git add ${files.join(" ")}` },
        },
      },
      { bashBin: "/bin/bash" },
    );
    const elapsed = Date.now() - start;
    console.log(`privacy-block.agy.sh 80-file run_command: ${elapsed} ms`);
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
    expect(elapsed).toBeLessThan(3000);
  });

  // Regression: every word counted toward the brace cap, so a long harmless
  // line was denied as "brace list too large to check".
  it("allows a 300-word run_command without braces", () => {
    const files = Array.from({ length: 300 }, (_, i) => `src/f${i}.ts`);
    const result = runHook(
      {
        toolCall: {
          name: "run_command",
          args: { CommandLine: `git add ${files.join(" ")}` },
        },
      },
      { bashBin: "/bin/bash" },
    );
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  // Regression: path-tool globs used a hardcoded name list without
  // secret/credentials, so they missed globs run_command denies.
  for (const [pattern, decision] of [
    ["*ecret*.yaml", "deny"],
    [".e*.local", "deny"],
    // A backslash escapes the next character (a literal e).
    ["*.p\\em", "deny"],
    [".\\env", "deny"],
    ["*.ts", "allow"],
  ]) {
    const verb = decision === "deny" ? "denies" : "allows";
    it(`${verb} find_by_name Pattern ${pattern}`, () => {
      const result = runHook(
        { toolCall: { name: "find_by_name", args: { Pattern: pattern } } },
        { bashBin: "/bin/bash" },
      );
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe(decision);
    });
  }

  it("denies run_command when the node check fails (fail closed)", () => {
    // A node shim that fails only the run_command check script; the
    // payload helpers' own node calls still work.
    const shim = fs.mkdtempSync(path.join(os.tmpdir(), "cf-privacy-node-"));
    try {
      fs.writeFileSync(
        path.join(shim, "node"),
        `#!/bin/bash\ncase "$2" in *checkCommand*) exit 1 ;; esac\nexec "${process.execPath}" "$@"\n`,
        { mode: 0o755 },
      );
      const result = runHook(
        { toolCall: { name: "run_command", args: { CommandLine: "echo hi" } } },
        { bashBin: "/bin/bash", pathPrefix: shim },
      );
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("deny");
      expect(result.json.reason).toContain("could not check the command");
    } finally {
      fs.rmSync(shim, { recursive: true, force: true });
    }
  });

  it("allows run_command of cf-commit's scan-secrets.sh (#28)", () => {
    const result = runHook({
      toolCall: {
        name: "run_command",
        args: {
          CommandLine:
            'bash "/x/plugins/coding-friend/skills/cf-commit/scripts/scan-secrets.sh"',
        },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("allows view_file of cf-commit's scan-secrets.sh (#28)", () => {
    const result = runHook({
      toolCall: {
        name: "view_file",
        args: {
          AbsolutePath:
            "/x/plugins/coding-friend/skills/cf-commit/scripts/scan-secrets.sh",
        },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("allows malformed JSON (fail-open, exit 0)", () => {
    const result = runHook("not-json");
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("allows when privacyBlock is false in workspacePaths[0] (not hook cwd)", () => {
    const result = runHook(
      {
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: "/x/.env" },
        },
      },
      { config: { privacyBlock: false } },
    );
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });
});
