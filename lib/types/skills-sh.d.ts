import type { RemoteSkill } from './types.ts';
export interface FetchResponse {
    readonly ok: boolean;
    readonly status: number;
    readonly headers?: {
        get(name: string): string | null;
    };
    json(): Promise<unknown>;
    text(): Promise<string>;
}
export interface FetchInit {
    readonly headers?: Readonly<Record<string, string>>;
    readonly redirect?: 'manual';
    readonly signal?: AbortSignal;
}
export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;
export type SkillsShErrorCode = 'NETWORK_ERROR' | 'UPSTREAM_INVALID_RESPONSE' | 'SOURCE_UNAVAILABLE';
export declare class SkillsShError extends Error {
    readonly code: SkillsShErrorCode;
    readonly status: number;
    constructor(code: SkillsShErrorCode, message: string, status?: number, options?: ErrorOptions);
}
export interface SkillsShClientOptions {
    readonly fetcher?: FetchLike;
    readonly origin?: string;
    readonly limit?: number;
}
export declare class SkillsShClient {
    readonly fetcher: FetchLike;
    readonly origin: string;
    readonly limit: number;
    constructor(options?: SkillsShClientOptions | FetchLike);
    search(query: string, signal?: AbortSignal): Promise<readonly RemoteSkill[]>;
    getSkill(id: string, signal?: AbortSignal): Promise<RemoteSkill>;
    private fetchJson;
    private fetchText;
    private request;
}
