export interface GitHubSyncSettings {
	repositoryUrl: string;
	personalAccessToken: string;
	branch: string;
	autoSyncOnLaunch: boolean;
	lastSyncTime: number;
}

export const DEFAULT_SETTINGS: GitHubSyncSettings = {
	repositoryUrl: "",
	personalAccessToken: "",
	branch: "main",
	autoSyncOnLaunch: true,
	lastSyncTime: 0
};

export interface GitHubFile {
	path: string;
	sha: string;
	size: number;
	type: "blob" | "tree";
	url: string;
}

export interface GitHubTreeResponse {
	sha: string;
	url: string;
	tree: GitHubFile[];
	truncated: boolean;
}

export interface GitHubContentResponse {
	name: string;
	path: string;
	sha: string;
	size: number;
	content: string;
	encoding: "base64";
}

export interface GitHubBlobResponse {
	sha: string;
	size: number;
	content: string;
	encoding: "base64";
}

export interface FileSyncState {
	path: string;
	sha: string;
	lastModified: number;
}

export interface VaultSyncState {
	lastSyncTimestamp: number;
	lastCommitSHA: string;
	files: Record<string, FileSyncState>;
}

export interface SyncResult {
	success: boolean;
	filesAdded: number;
	filesModified: number;
	filesDeleted: number;
	errors: SyncError[];
}

export interface SyncError {
	path: string;
	message: string;
	type: "network" | "auth" | "file" | "unknown";
}

export interface FileChange {
	path: string;
	sha: string;
	changeType: "added" | "modified" | "deleted";
}