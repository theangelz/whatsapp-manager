/**
 * WhatsApp Message Processing Utilities
 * @version 2.0.0
 */
export declare function formatPhoneToJid(p: string, g?: boolean): string;
export declare function extractPhoneFromJid(j: string): string;
export declare function isGroupJid(j: string): boolean;
export declare function generateMessageId(): string;
export declare function validateMessagePayload(t: string, x: any): Promise<any>;
export declare function prepareInstanceConnection(id: string): Promise<any>;
export declare function isSystemOperational(): boolean;
export declare function getWppSystemStatus(): any;
export declare function processMessageMetadata(m: any): any;
export declare function formatOutgoingMessage(y: string, c: any, o?: any): any;
export declare function onSystemBlocked(cb: () => void): void;
export declare function onSystemUnblocked(cb: () => void): void;
export declare function startPeriodicCheck(): void;
export declare function initializeCoreModule(): Promise<void>;
export declare function shutdownCoreModule(): void;
export declare const WPP_CORE_VERSION: string;
export declare const WPP_CORE_ID: string;
