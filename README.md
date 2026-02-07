# Obsidian GitHub Pull

A mobile-friendly Obsidian plugin that pulls your vault from GitHub repositories **without requiring Git installation**. Perfect for iOS and iPad users who want to keep their notes synchronized with a GitHub backup. Note: **This is one-way sync**. It only pull vaults from github to your device, doesn't support sync changes to github.

## Features

**Gitless Sync** - No Git installation required, works entirely through GitHub API
**Mobile Optimized** - Designed specifically for iOS and iPad
**Smart Sync** - Only downloads changed files, preserves local-only notes
**Auto-Sync** - Optionally sync automatically when Obsidian launches
**Secure** - Uses GitHub Personal Access Tokens for authentication
**Progress Tracking** - Visual feedback during sync operations
**Fast & Efficient** - Batch downloads with parallel processing

## How It Works

This plugin syncs **one-way from GitHub to your vault**:
- GitHub Repository → Your Obsidian Vault
- Local-only files are preserved (not deleted)
- Only changed files are downloaded
- Uses GitHub REST API (no Git required)

## Installation

### From Obsidian Community Plugins

1. Open Obsidian Settings
2. Go to Community Plugins
3. Search for "GitHub Pull"
4. Click Install
5. Enable the plugin

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create folder `.obsidian/plugins/obsidian-github-pull/` in your vault
3. Copy the downloaded files to this folder
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

## Setup Guide

### Step 1: Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a descriptive name (e.g., "Obsidian Sync")
4. Select expiration (recommend: 90 days or No expiration)
5. Select scopes:
   - ✅ `repo` (for private repositories)
   - OR ✅ `public_repo` (for public repositories only)
6. Click "Generate token"
7. **Copy the token immediately** (you won't see it again!)

### Step 2: Configure the Plugin

1. Open Obsidian Settings → GitHub Pull
2. Enter your repository in `owner/repo` format
   - Example: `yourusername/my-vault`
3. Paste your Personal Access Token
4. Set the branch name (usually `main` or `master`)
5. Enable/disable "Auto-sync on launch" as preferred
6. Click "Test Connection" to verify settings
7. Click "Sync Now" to perform your first sync

### Step 3: Verify Sync

After the first sync:
- Check that your files appeared in the vault
- Verify the "Last sync" timestamp in settings
- Make a change on GitHub and sync again to test updates

## Usage

### Manual Sync

Three ways to trigger a sync:

1. **Ribbon Icon**: Click the refresh icon in the left sidebar
2. **Command Palette**: Press `Cmd/Ctrl + P`, type "Sync from GitHub"
3. **Settings**: Go to plugin settings and click "Sync Now"

### Auto Sync

Enable "Auto-sync on launch" in settings to automatically sync when Obsidian starts.

### Sync Progress

During sync, you'll see notifications showing:
- "Starting sync from GitHub..."
- Progress updates for large syncs
- "✓ Sync complete! Added: X, Modified: Y"
- Error messages if something fails

## How Syncing Works

```
┌─────────────────────────────────────┐
│  Your GitHub Repository             │
│  github.com/you/my-vault            │
└──────────────┬──────────────────────┘
               │
               │ GitHub REST API
               │ (No Git required)
               │
               ▼
┌──────────────────────────────────────┐
│  GitHub Pull Plugin                  │
│  • Fetches file list                 │
│  • Compares with local state         │
│  • Downloads only changed files      │
│  • Preserves local-only files        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│  Your Obsidian Vault                 │
│  (iOS/iPad/Desktop)                  │
└──────────────────────────────────────┘
```

### What Gets Synced?

**✓ Downloaded from GitHub:**
- All files in the repository
- File updates (when content changes)
- New files added to GitHub
- Preserves directory structure

**✓ Preserved Locally:**
- Files you create only on mobile
- Local modifications (until next sync overwrites)
- Plugin data and settings
- `.obsidian/` configuration (except this plugin's data)

**✗ NOT Synced:**
- Local → GitHub (one-way only)
- File deletions from GitHub (local files kept)

## FAQ

### Is this bidirectional sync?

No, this is **one-way sync** from GitHub to your device. Changes made on your mobile device are **not** pushed back to GitHub. This is by design to avoid complex conflict resolution without Git.

### What happens to files I create on mobile?

Files created locally that don't exist in GitHub are **preserved**. They won't be deleted. However, if you create a file with the same name as one in GitHub, the GitHub version will overwrite it on the next sync.

### How often should I sync?

It depends on your workflow:
- **Auto-sync on launch**: Good for most users
- **Manual sync**: When you know changes were made on GitHub
- **Before important work**: To ensure you have the latest version

### What about conflicts?

Since this is one-way sync, the GitHub version always wins. If you've made local changes and sync, they'll be overwritten by the GitHub version.

### Does this use my GitHub API quota?

Yes. GitHub allows:
- **5,000 requests/hour** (authenticated)
- **60 requests/hour** (unauthenticated)

The plugin shows your remaining quota in the connection test. Each sync uses approximately:
- 1 request to fetch file list
- 1 request per changed file

For a typical vault, this is well within limits.

### Can I sync multiple repositories?

Currently, no. You can only sync one repository per vault. If you need multiple repositories, consider creating separate vaults.

### Will this work with large repositories?

Yes, but:
- Large syncs (>500 files) take longer
- First sync downloads everything
- Subsequent syncs are much faster (only changed files)
- GitHub has a 100MB file size limit via API

### Is my Personal Access Token secure?

Your token is stored in Obsidian's plugin data, which is:
- Stored locally on your device
- Not transmitted anywhere except GitHub
- Protected by your device's security

However, **treat your PAT like a password**:
- ✅ Use minimum required permissions
- ✅ Set expiration dates
- ✅ Revoke if compromised
- ❌ Don't share your token
- ❌ Don't commit tokens to Git

### What if I'm offline?

The plugin will show a network error. Your local files remain intact. Simply sync again when you're back online.

### Can I exclude certain files?

Not currently. The plugin syncs the entire repository. You can:
- Use a dedicated branch for Obsidian
- Create a separate repository for your vault
- Request this feature on GitHub

## Troubleshooting

### Error: "Authentication failed"

**Solutions:**
- Verify your Personal Access Token is correct
- Check the token hasn't expired
- Ensure the token has `repo` or `public_repo` scope
- Generate a new token if needed

### Error: "Repository not found"

**Solutions:**
- Check repository format is `owner/repo` (not a full URL)
- Verify the repository exists and you have access
- For private repos, ensure PAT has `repo` scope

### Error: "Rate limit exceeded"

**Solutions:**
- Wait for rate limit to reset (shown in error message)
- Reduce sync frequency
- Check "Rate limit" in Test Connection to see remaining quota

### Error: "Network error"

**Solutions:**
- Check your internet connection
- Try again in a few moments
- Verify GitHub is accessible (check status.github.com)

### Files not updating

**Solutions:**
- Check the branch name is correct
- Verify files exist in the specified branch on GitHub
- Click "Test Connection" to diagnose
- Check "Last sync" timestamp to confirm sync completed

### Sync is slow

**Solutions:**
- First sync downloads everything (normal)
- Subsequent syncs should be much faster
- Large repositories (>1000 files) take longer
- Check your internet speed

### Plugin not showing up

**Solutions:**
- Verify plugin is enabled in Settings → Community Plugins
- Check files are in `.obsidian/plugins/github-pull/`
- Restart Obsidian
- Check for errors in Developer Console (Ctrl+Shift+I)

## Supported Platforms

- ✅ **iOS** (iPhone) - Fully supported
- ✅ **iPadOS** (iPad) - Fully supported
- ✅ **Android** - Fully supported
- ✅ **Windows** - Fully supported
- ✅ **macOS** - Fully supported
- ✅ **Linux** - Fully supported

## Limitations

- **One-way sync only** (GitHub → Vault)
- **No conflict resolution** (GitHub version always wins)
- **Single repository** per vault
- **No file exclusion** (syncs entire repo)
- **No partial folder sync** (all or nothing)
- **100MB file size limit** (GitHub API limitation)

## Roadmap

Potential future features (not guaranteed):

- [ ] Bidirectional sync with conflict resolution
- [ ] Multiple repository support
- [ ] Selective folder sync
- [ ] File exclusion patterns (.gitignore style)
- [ ] Sync scheduling (periodic auto-sync)
- [ ] Sync status indicators on files
- [ ] Webhook support for instant sync
- [ ] Diff preview before sync

## Privacy & Security

This plugin:
- ✅ Only communicates with GitHub API
- ✅ Stores credentials locally on your device
- ✅ Does not send data to any other servers
- ✅ Is open source (audit the code yourself)
- ✅ Uses HTTPS for all API requests

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/obsidian-github-pull/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/obsidian-github-pull/discussions)
- **Documentation**: This README

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (especially on mobile)
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built for the Obsidian community
- Inspired by the need for Git-free mobile sync
- Uses the excellent Obsidian API
- Powered by GitHub REST API

## Changelog

### Version 1.0.0 (Initial Release)

- ✨ One-way sync from GitHub to vault
- 📱 Full mobile support (iOS/iPad)
- 🔒 Personal Access Token authentication
- 🔄 Smart sync (only changed files)
- 🚀 Auto-sync on launch option
- 📊 Progress notifications
- ⚡ Batch downloading with parallel processing
- 🛠️ Settings interface with connection testing
- 📝 Comprehensive error handling

---

**Made with ❤️ for the Obsidian community**