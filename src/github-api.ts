import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";
import {
	GitHubFile,
	GitHubTreeResponse,
	GitHubContentResponse,
	GitHubBlobResponse
} from "./types";
import { Logger } from "./logger";

export class GitHubAPI {
	private owner: string;
	private repo: string;
	private token: string;
	private branch: string;
	private baseUrl = "https://api.github.com";
	private logger: Logger;

	constructor(repositoryUrl: string, token: string, branch: string, logger: Logger) {
		this.logger = logger;
		this.logger.debug("Initializing GitHubAPI", { repositoryUrl, branch });
		
		const [owner, repo] = this.parseRepositoryUrl(repositoryUrl);
		this.owner = owner;
		this.repo = repo;
		this.token = token;
		this.branch = branch;
		
		this.logger.info("GitHubAPI initialized", { owner, repo, branch });
	}

	private parseRepositoryUrl(url: string): [string, string] {
		this.logger.debug("Parsing repository URL", { url });
		// Handle "owner/repo" or full GitHub URLs
		const match = url.match(/(?:github\.com\/)?([^/]+)\/([^/]+?)(?:\.git)?$/);
		if (!match) {
			this.logger.error("Invalid repository URL format", { url });
			throw new Error("Invalid repository URL format. Use: owner/repo");
		}
		const [, owner, repo] = match;
		this.logger.debug("Repository URL parsed", { owner, repo });
		return [owner, repo];
	}

	private async makeRequest<T>(
		endpoint: string,
		options: Partial<RequestUrlParam> = {}
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		this.logger.debug("Making GitHub API request", { endpoint, url });
		
		try {
			const response: RequestUrlResponse = await requestUrl({
				url,
				method: "GET",
				headers: {
					"Authorization": `Bearer ${this.token}`,
					"Accept": "application/vnd.github.v3+json",
					"User-Agent": "Obsidian-GitHub-Sync"
				},
				...options
			});

			this.logger.debug("GitHub API response received", {
				endpoint,
				status: response.status
			});

			if (response.status !== 200) {
				this.logger.error("GitHub API error", {
					endpoint,
					status: response.status,
					text: response.text
				});
				throw new Error(
					`GitHub API error: ${response.status} - ${response.text}`
				);
			}

			return response.json;
		} catch (error) {
			this.logger.error("GitHub API request failed", { endpoint, error });
			throw error;
		}
	}

	async testConnection(): Promise<boolean> {
		try {
			this.logger.info("Testing connection to GitHub repository");
			await this.makeRequest(`/repos/${this.owner}/${this.repo}`);
			this.logger.info("Connection test successful");
			return true;
		} catch (error) {
			this.logger.error("Connection test failed", error);
			console.error("Connection test failed:", error);
			return false;
		}
	}

	async getRepositoryTree(): Promise<GitHubFile[]> {
		try {
			this.logger.info("Fetching repository tree");
			const data = await this.makeRequest<GitHubTreeResponse>(
				`/repos/${this.owner}/${this.repo}/git/trees/${this.branch}?recursive=1`
			);

			if (data.truncated) {
				this.logger.warn("Repository tree was truncated - some files may be missing");
				console.warn("Repository tree was truncated. Some files may be missing.");
			}

			// Filter to only include blobs (files), not trees (directories)
			const files = data.tree.filter(item => item.type === "blob");
			this.logger.info(`Repository tree fetched successfully`, {
				totalItems: data.tree.length,
				fileCount: files.length
			});
			
			return files;
		} catch (error) {
			this.logger.error("Failed to fetch repository tree", error);
			throw new Error(`Failed to fetch repository tree: ${error.message}`);
		}
	}

	async getFileContent(path: string, sha?: string): Promise<ArrayBuffer> {
		try {
			this.logger.debug(`Fetching file content: ${path}`);
			
			// Try Contents API first (works for files up to 1MB)
			let needsLargeFileHandling = false;
			let contentsApiError: Error | null = null;
			
			try {
				const data = await this.makeRequest<GitHubContentResponse>(
					`/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}?ref=${this.branch}`
				);

				// Check if content is empty or missing - this happens for files > 1MB
				// GitHub returns the metadata but with empty content field
				if (!data.content || data.content.trim() === "") {
					this.logger.info(`Contents API returned empty content (file likely > 1MB): ${path}`, {
						reportedSize: data.size,
						sha: data.sha
					});
					needsLargeFileHandling = true;
				} else {
					const result = this.decodeBase64Content(data.content, data.size, path);
					
					// Validate decoded content is not empty when size > 0
					if (data.size > 0 && result.byteLength === 0) {
						this.logger.warn(`Decoded content is empty but file size is ${data.size}, trying fallback: ${path}`);
						needsLargeFileHandling = true;
					} else {
						this.logger.debug(`File content fetched via Contents API: ${path}`, { size: result.byteLength });
						return result;
					}
				}
				
			} catch (contentError) {
				contentsApiError = contentError as Error;
				const errorMessage = contentError.message || "";
				const errorString = String(contentError);
				
				// Check if error is due to file size (>1MB) - GitHub may return various error formats
				if (errorMessage.includes("too large") ||
				    errorMessage.includes("content too large") ||
				    errorMessage.includes("403") ||
				    errorMessage.includes("This API returns blobs up to 1 MB") ||
				    errorString.includes("too large") ||
				    errorString.includes("403")) {
					this.logger.info(`File too large for Contents API (error detected): ${path}`, { error: errorMessage });
					needsLargeFileHandling = true;
				} else {
					// Re-throw if it's a different error
					throw contentError;
				}
			}
			
			// Handle large files via raw download or blob API
			if (needsLargeFileHandling) {
				this.logger.info(`Using large file download method for: ${path}`);
				
				// Fall back to raw.githubusercontent.com for large files (up to 100MB)
				try {
					const rawResult = await this.downloadRawFile(path);
					
					// Validate the result
					if (rawResult.byteLength === 0) {
						this.logger.warn(`Raw download returned empty content: ${path}`);
						throw new Error("Raw download returned empty content");
					}
					
					return rawResult;
				} catch (rawError) {
					this.logger.warn(`Raw download failed, trying Blob API: ${path}`, { error: (rawError as Error).message });
					
					// Final fallback: Blob API (limited to 1MB response)
					if (!sha) {
						const errorMsg = `Cannot fetch large file without SHA: ${path}`;
						this.logger.error(errorMsg);
						throw new Error(errorMsg);
					}
					
					const blobData = await this.makeRequest<GitHubBlobResponse>(
						`/repos/${this.owner}/${this.repo}/git/blobs/${sha}`
					);
					
					// Check blob content
					if (!blobData.content || blobData.content.trim() === "") {
						const errorMsg = `Blob API returned empty content for large file: ${path}`;
						this.logger.error(errorMsg);
						throw new Error(errorMsg);
					}
					
					const result = this.decodeBase64Content(blobData.content, blobData.size, path);
					
					if (result.byteLength === 0 && blobData.size > 0) {
						const errorMsg = `Blob API decode resulted in empty content: ${path}`;
						this.logger.error(errorMsg);
						throw new Error(errorMsg);
					}
					
					this.logger.debug(`File content fetched via Blob API: ${path}`, { size: result.byteLength });
					return result;
				}
			}
			
			// This shouldn't be reached, but just in case
			throw contentsApiError || new Error(`Failed to fetch file content: ${path}`);
		} catch (error) {
			this.logger.error(`Failed to fetch file: ${path}`, error);
			throw new Error(`Failed to fetch file ${path}: ${(error as Error).message}`);
		}
	}

	private async downloadRawFile(path: string): Promise<ArrayBuffer> {
		// Properly encode path components for URL (handle Chinese characters and spaces)
		const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
		const rawUrl = `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${encodedPath}`;
		this.logger.debug(`Downloading from raw URL: ${rawUrl}`);
		
		try {
			const response: RequestUrlResponse = await requestUrl({
				url: rawUrl,
				method: "GET",
				headers: {
					"Authorization": `Bearer ${this.token}`,
					"User-Agent": "Obsidian-GitHub-Sync"
				}
			});

			if (response.status !== 200) {
				this.logger.error(`Raw download failed with status ${response.status}`, {
					path,
					url: rawUrl,
					status: response.status
				});
				throw new Error(`Raw download failed with status ${response.status}`);
			}

			// Response.arrayBuffer contains the raw binary data
			const arrayBuffer = response.arrayBuffer;
			
			// Validate we got actual content
			if (!arrayBuffer || arrayBuffer.byteLength === 0) {
				this.logger.error(`Raw download returned empty ArrayBuffer: ${path}`);
				throw new Error(`Raw download returned empty content for ${path}`);
			}
			
			this.logger.info(`Raw download successful: ${path}`, {
				size: arrayBuffer.byteLength,
				sizeKB: Math.round(arrayBuffer.byteLength / 1024),
				sizeMB: (arrayBuffer.byteLength / (1024 * 1024)).toFixed(2)
			});
			
			return arrayBuffer;
		} catch (error) {
			this.logger.error(`Raw download failed: ${path}`, {
				error: (error as Error).message,
				url: rawUrl
			});
			throw error;
		}
	}

	private decodeBase64Content(content: string, size: number, path: string): ArrayBuffer {
		// Decode base64 content - remove all whitespace including newlines
		const base64Clean = content.replace(/\s+/g, '');
		
		// Use atob to decode base64 to binary string
		const binaryString = atob(base64Clean);
		
		// Convert binary string to Uint8Array
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		
		this.logger.debug(`File decoded: ${path}`, {
			originalSize: size,
			decodedSize: bytes.buffer.byteLength,
			base64Length: base64Clean.length
		});
		
		return bytes.buffer;
	}

	async getRateLimitStatus(): Promise<{ limit: number; remaining: number; reset: number }> {
		try {
			this.logger.debug("Fetching rate limit status");
			const data = await this.makeRequest<{
				resources: {
					core: {
						limit: number;
						remaining: number;
						reset: number;
					};
				};
			}>("/rate_limit");
			const status = {
				limit: data.resources.core.limit,
				remaining: data.resources.core.remaining,
				reset: data.resources.core.reset
			};
			this.logger.info("Rate limit status", status);
			return status;
		} catch (error) {
			this.logger.error("Failed to fetch rate limit", error);
			console.error("Failed to fetch rate limit:", error);
			return { limit: 0, remaining: 0, reset: 0 };
		}
	}
}