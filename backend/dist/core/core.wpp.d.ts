/**
 * Core WhatsApp Processing Module - Message Formatting & JID Handler
 * @version 2.0.0
 * @internal
 */
export declare function formatPhoneToJid(p: string, g?: boolean): string;
export declare function extractPhoneFromJid(j: string): string;
export declare function isGroupJid(j: string): boolean;
export declare function generateMessageId(): string;
export declare function validateMessagePayload(t: string, _x: any): Promise<{
    valid: boolean;
    jid: string;
    error?: string;
}>;
export declare function prepareInstanceConnection(_id: string): Promise<{
    ready: boolean;
    error?: string;
}>;
export declare function isSystemOperational(): boolean;
export declare function getWppSystemStatus(): {
    operational: boolean;
    signature: string;
    message: string;
};
export declare function processMessageMetadata(m: any): {
    from: string;
    isGroup: boolean;
    messageId: string;
};
export declare function formatOutgoingMessage(y: string, c: any, o?: any): any;
export declare function onSystemBlocked(callback: () => void): void;
export declare function onSystemUnblocked(callback: () => void): void;
export declare function startPeriodicCheck(): void;
export declare function initializeCoreModule(): Promise<void>;
export declare function shutdownCoreModule(): void;
export declare const WPP_CORE_VERSION = "2.0.0";
export declare const WPP_CORE_ID: string;
//# sourceMappingURL=core.wpp.d.ts.map