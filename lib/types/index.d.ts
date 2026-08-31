import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { SkillManager, type SkillSource } from './skill-manager.ts';
import type { RemoteSkill } from './types.ts';
export declare const API_PREFIX = "/api/noumena-luna";
export { SkillsShClient, SkillsShError, } from './skills-sh.ts';
export { ConfirmationRequiredError, SkillManager, SkillManagerError, } from './skill-manager.ts';
export * from './path-safety.ts';
export interface ApiSuccess<T> {
    readonly data: T;
}
export interface ApiFailure {
    readonly error: {
        readonly code: string;
        readonly message: string;
    };
}
export declare function apply(ctx: Context): void;
export declare function handleApiRequest(request: IncomingMessage, response: ServerResponse, manager: SkillManager, ctx?: Pick<Context, 'logger'>): Promise<void>;
export type { RemoteSkill, SkillSource };
