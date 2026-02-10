import { App, PluginSettingTab, Setting, Notice, TFile } from "obsidian";
import GitHubSyncPlugin from "../main";

export class GitHubSyncSettingTab extends PluginSettingTab {
	plugin: GitHubSyncPlugin;

	constructor(app: App, plugin: GitHubSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("GitHub Sync settings")
			.setHeading();

		// Repository URL
		new Setting(containerEl)
			.setName("Repository")
			.setDesc("GitHub repository in owner/repo format (e.g., username/my-vault)")
			.addText(text => text
				.setPlaceholder("Username/my-vault")
				.setValue(this.plugin.settings.repositoryUrl)
				.onChange(async (value) => {
					this.plugin.settings.repositoryUrl = value.trim();
					await this.plugin.saveSettings();
				}));

		// Branch
		new Setting(containerEl)
			.setName("Branch")
			.setDesc("Branch to sync from (usually 'main' or 'master')")
			.addText(text => text
				.setPlaceholder("Main")
				.setValue(this.plugin.settings.branch)
				.onChange(async (value) => {
					this.plugin.settings.branch = value.trim() || "main";
					await this.plugin.saveSettings();
				}));

		// Personal Access Token
		new Setting(containerEl)
			.setName("Personal access token")
			.setDesc("GitHub PAT with repo permissions (create at github.com/settings/tokens)")
			.addText(text => {
				text
					.setPlaceholder("Ghp_xxxxxxxxxxxx")
					.setValue(this.plugin.settings.personalAccessToken)
					.onChange(async (value) => {
						this.plugin.settings.personalAccessToken = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		// Auto-sync toggle
		new Setting(containerEl)
			.setName("Auto-sync on launch")
			.setDesc("Automatically sync when Obsidian starts")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncOnLaunch)
				.onChange(async (value) => {
					this.plugin.settings.autoSyncOnLaunch = value;
					await this.plugin.saveSettings();
				}));

		// Last sync display
		if (this.plugin.settings.lastSyncTime > 0) {
			const lastSync = new Date(this.plugin.settings.lastSyncTime);
			containerEl.createEl("p", {
				text: `Last sync: ${lastSync.toLocaleString()}`,
				cls: "setting-item-description"
			});
		}

		// Test connection button
		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Verify GitHub credentials and check rate limit")
			.addButton(button => button
				.setButtonText("Test connection")
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("Testing...");
					
					try {
						const success = await this.plugin.syncEngine.testConnection();
						
						if (success) {
							new Notice("✓ Connection successful!");
							
							// Show rate limit info
							const rateLimit = await this.plugin.syncEngine.getRateLimit();
							new Notice(
								`Rate limit: ${rateLimit.remaining}/${rateLimit.limit} remaining`,
								5000
							);
						} else {
							new Notice("✗ Connection failed. Check your settings.");
						}
					} catch (err) {
						const errorMessage = err instanceof Error ? err.message : String(err);
						new Notice(`✗ Error: ${errorMessage}`);
					}
					
					button.setDisabled(false);
					button.setButtonText("Test connection");
				}));

		// Manual sync button
		new Setting(containerEl)
			.setName("Manual sync")
			.setDesc("Sync now from GitHub to your vault")
			.addButton(button => button
				.setButtonText("Sync now")
				.setCta()
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("Syncing...");
					
					try {
							await this.plugin.syncEngine.performSync(true);
							this.display(); // Refresh to show updated last sync time
						} catch (err) {
							const errorMessage = err instanceof Error ? err.message : String(err);
							new Notice(`✗ Sync error: ${errorMessage}`);
						}
					
					button.setDisabled(false);
					button.setButtonText("Sync now");
				}));

		// Debug section
		new Setting(containerEl)
			.setName("Debug")
			.setHeading();
		
		// View logs button
		new Setting(containerEl)
			.setName("View debug logs")
			.setDesc("View detailed logs for troubleshooting")
			.addButton((button) => button
				.setButtonText("View logs")
				.onClick(async () => {
					try {
						const logs = await this.plugin.logger.getLogFile();
						// Create a modal or new file with logs
						const logFile = "GitHub-Sync-Debug-Logs.md";
						const existingFile = this.app.vault.getAbstractFileByPath(logFile);
						
						const content = `# GitHub Sync debug logs\n\nGenerated: ${new Date().toISOString()}\n\n\`\`\`\n${logs}\n\`\`\``;
						
						if (existingFile instanceof TFile) {
							await this.app.vault.modify(existingFile, content);
						} else {
							await this.app.vault.create(logFile, content);
						}
						
						new Notice("Debug logs saved to: " + logFile);
					} catch (err) {
						const errorMessage = err instanceof Error ? err.message : String(err);
						new Notice("Failed to get logs: " + errorMessage);
					}
				}));
		
		// Clear logs button
		new Setting(containerEl)
			.setName("Clear debug logs")
			.setDesc("Clear all debug logs")
			.addButton((button) => button
				.setButtonText("Clear logs")
				.setWarning()
				.onClick(async () => {
					try {
						await this.plugin.logger.clearLogs();
						new Notice("Debug logs cleared");
					} catch (err) {
						const errorMessage = err instanceof Error ? err.message : String(err);
						new Notice("Failed to clear logs: " + errorMessage);
					}
				}));

		// Setup guide section
		new Setting(containerEl)
			.setName("Setup guide")
			.setHeading();
		
		const helpContainer = containerEl.createDiv({ cls: "setting-item-description" });
		
		// Create the help content using DOM methods
		const intro = helpContainer.createEl("p");
		intro.createEl("strong", { text: "To create a GitHub personal access token:" });
		
		const steps = helpContainer.createEl("ol");
		
		const step1 = steps.createEl("li");
		step1.appendText("Go to ");
		step1.createEl("a", { text: "GitHub Settings → Tokens", href: "https://github.com/settings/tokens/new", attr: { target: "_blank" } });
		
		steps.createEl("li", { text: 'Click "Generate new token (classic)"' });
		steps.createEl("li", { text: 'Give it a name (e.g., "Obsidian Sync")' });
		
		const step4 = steps.createEl("li");
		step4.appendText("Select scope: ");
		step4.createEl("code", { text: "repo" });
		step4.appendText(" (for private repos) or ");
		step4.createEl("code", { text: "public_repo" });
		
		steps.createEl("li", { text: "Generate and copy the token" });
		steps.createEl("li", { text: "Paste it above" });
		
		const noteP = helpContainer.createEl("p");
		noteP.createEl("strong", { text: "Note:" });
		noteP.appendText(" This plugin syncs ");
		noteP.createEl("em", { text: "one-way" });
		noteP.appendText(" from GitHub to your vault. Changes made locally will be overwritten on the next sync.");
		
		const troubleP = helpContainer.createEl("p");
		troubleP.createEl("strong", { text: "Troubleshooting:" });
		troubleP.appendText(' If the plugin fails to load, click "View logs" above to see detailed error information.');
	}
}