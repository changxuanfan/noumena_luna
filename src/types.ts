export interface RemoteSkill {
  readonly id: string
  readonly skillId: string
  readonly name: string
  readonly description: string
  readonly source: string
  readonly installs: number
  readonly pageUrl: string
  readonly content: string
  readonly remoteRevision: string
  readonly canInstall?: boolean
  readonly detailError?: string
}

export interface ManagedSkill {
  readonly id: string
  readonly skillId: string
  readonly name: string
  readonly description: string
  readonly source: string
  readonly installs: number
  readonly pageUrl: string
  readonly directory: string
  readonly installedAt: string
  readonly updatedAt: string
  readonly contentHash: string
  readonly remoteRevision: string
  readonly exists: boolean
}

export interface UpdateCheck {
  readonly id: string
  readonly currentRevision: string
  readonly latestRevision: string
  readonly hasUpdate: boolean
  readonly latest: RemoteSkill
}

export interface SearchResponse {
  readonly skills: readonly RemoteSkill[]
}

export interface ManagedSkillsResponse {
  readonly skills: readonly ManagedSkill[]
}
