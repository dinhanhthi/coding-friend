# For Developers

## 🐳 CLI Development

To work on the CLI locally:

```bash
cd cli
npm install
npm run build
npm link            # Creates global symlink for `cf` binary
```

Now `cf` is available globally, pointing to your local source. After making changes:

```bash
npm run build       # Rebuild (no need to re-link)
```

For development without rebuilding:

```bash
npm run dev -- <command>   # e.g. npm run dev -- init
```

To unlink when done:   
```bash
npm unlink -g coding-friend-cli
```

## Install plugin from local source

```bash
git clone https://github.com/dinhanhthi/coding-friend.git
claude --plugin-dir ./coding-friend
```