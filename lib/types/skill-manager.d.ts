import type { ManagedSkill, RemoteSkill, UpdateCheck } from './types.ts';
export interface SkillSource {
    search(query: string): Promise<readonly RemoteSkill[]>;
    getSkill(id: string): Promise<RemoteSkill>;
}
export interface SkillManagerOptions {
    root: string;
    source: SkillSource;
    discover?: () => void | Promise<void>;
}
export type SkillManagerErrorCode = 'CONFIRMATION_REQUIRED' | 'INVALID_SKILL_ID' | 'INVALID_REMOTE_SKILL' | 'SOURCE_UNAVAILABLE' | 'UNMANAGED_CONFLICT' | 'STATE_CORRUPT' | 'NOT_MANAGED' | 'LOCAL_SKILL_MISSING' | 'ROLLBACK_FAILED' | 'OPERATION_FAILED';
export declare class SkillManagerError extends Error {
    readonly code: SkillManagerErrorCode;
    readonly status: number;
    constructor(code: SkillManagerErrorCode, message: string, status?: number, options?: ErrorOptions);
}
export declare class ConfirmationRequiredError extends SkillManagerError {
    constructor(action?: 'install' | 'replace' | 'update' | 'uninstall');
}
export declare class SkillManager {
    readonly root: string;
    readonly source: SkillSource;
    private readonly discover;
    constructor(options: SkillManagerOptions);
    search(query: string): Promise<readonly RemoteSkill[]>;
    listInstalled(): Promise<readonly ManagedSkill[]>;
    install(id: string, confirmed: boolean): Promise<ManagedSkill>;
    checkUpdate(id: string): Promise<UpdateCheck>;
    update(id: string, confirmed: boolean): Promise<UpdateCheck>;
    uninstall(id: string, confirmed: boolean): Promise<void>;
    private publish;
    private assertManagedTarget;
    private loadRemote;
    private readManifest;
    private writeManifest;
    private manifestPaths;
    private assertDirectoryInsideRoot;
    private pathExists;
    private managedPathExists;
}
